import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, promisify } from "node:util";
import * as z from "zod";
import {
	dataDirectory,
	installRunDirectory,
	loadLocalRuns,
	runsDirectory,
} from "./local-reports.js";

const accountId = "f92591bbb8e5dcf6602b801e68bbd56c";
const bucket = "biome-ecosystem-ci-reports";

export function parseDownloadArguments(args: string[]): {
	runIds: number[];
	help: boolean;
} {
	const { values, positionals } = parseArgs({
		args,
		allowPositionals: true,
		options: { help: { type: "boolean", short: "h" } },
	});
	const runIds = positionals.map((value) => {
		const id = Number(value);
		if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(id))
			throw new Error(`Invalid run ID: ${value}`);
		return id;
	});
	return { runIds: [...new Set(runIds)], help: values.help ?? false };
}

const credentialsSchema = z.union([
	z.object({ type: z.enum(["oauth", "api_token"]), token: z.string().min(1) }),
	z.object({
		type: z.literal("api_key"),
		key: z.string().min(1),
		email: z.string().min(1),
	}),
]);
const objectPageSchema = z.object({
	success: z.literal(true),
	result: z.array(z.object({ key: z.string() })),
	result_info: z
		.object({
			cursor: z.string().optional(),
			is_truncated: z.boolean().optional(),
		})
		.optional(),
});

async function wranglerHeaders(): Promise<Record<string, string>> {
	// Capture credentials in memory; never print them or pass them as command arguments.
	let stdout: string;
	try {
		({ stdout } = await promisify(execFile)(
			"pnpm",
			["exec", "wrangler", "auth", "token", "--json"],
			{
				cwd: fileURLToPath(new URL("..", import.meta.url)),
				encoding: "utf8",
			},
		));
	} catch {
		throw new Error(
			"Could not read Wrangler credentials. Run pnpm --dir dashboard exec wrangler login, or set CLOUDFLARE_API_TOKEN.",
		);
	}
	const credentials = credentialsSchema.parse(JSON.parse(stdout));
	return credentials.type === "api_key"
		? { "X-Auth-Key": credentials.key, "X-Auth-Email": credentials.email }
		: { Authorization: `Bearer ${credentials.token}` };
}

export function createR2Downloader(
	headers: Record<string, string>,
	request: typeof fetch = fetch,
) {
	const objectsUrl = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID ?? accountId}/r2/buckets/${bucket}/objects`;
	async function get(url: string | URL): Promise<Response> {
		const response = await request(url, { headers });
		if (!response.ok) {
			throw new Error(
				`R2 download failed (HTTP ${response.status}). Check your Wrangler login and access to ${bucket}.`,
			);
		}
		return response;
	}
	return async (prefix: string, destination: string): Promise<void> => {
		let cursor: string | undefined;
		do {
			const url = new URL(objectsUrl);
			url.searchParams.set("prefix", prefix);
			url.searchParams.set("per_page", "1000");
			if (cursor) url.searchParams.set("cursor", cursor);
			const page = objectPageSchema.parse(await (await get(url)).json());
			for (const { key } of page.result) {
				const relative = key.slice(prefix.length);
				if (
					!key.startsWith(prefix) ||
					relative
						.split("/")
						.some(
							(part) =>
								!part || part === "." || part === ".." || part.includes("\\"),
						)
				) {
					throw new Error(`Unexpected R2 object key: ${key}`);
				}
				const response = await get(
					`${objectsUrl}/${key.split("/").map(encodeURIComponent).join("/")}`,
				);
				const path = join(destination, relative);
				await mkdir(dirname(path), { recursive: true });
				await writeFile(path, new Uint8Array(await response.arrayBuffer()));
			}
			const nextCursor = page.result_info?.cursor;
			if (page.result_info?.is_truncated === true && !nextCursor) {
				throw new Error("R2 returned a truncated listing without a cursor.");
			}
			if (nextCursor && nextCursor === cursor)
				throw new Error("R2 returned a repeated listing cursor.");
			cursor =
				page.result_info?.is_truncated === false ? undefined : nextCursor;
		} while (cursor);
	};
}

async function downloadPrefix(
	prefix: string,
	destination: string,
): Promise<void> {
	await createR2Downloader(await wranglerHeaders())(prefix, destination);
}

export async function downloadRuns(
	runIds: number[],
	download = downloadPrefix,
	root = runsDirectory,
): Promise<number> {
	// Staging on the same filesystem lets completed attempts be installed by rename.
	await mkdir(root, { recursive: true });
	const staging = await mkdtemp(join(root, ".download-"));
	try {
		const stagedRuns = join(staging, "runs");
		await mkdir(stagedRuns, { recursive: true });
		if (runIds.length === 0) {
			await download("runs/", stagedRuns);
		} else {
			for (const id of runIds) {
				await download(`runs/${id}/`, join(stagedRuns, String(id)));
			}
		}
		const runs = await loadLocalRuns(stagedRuns);
		for (const id of runIds) {
			if (!runs.some(({ manifest }) => manifest.githubRunId === id)) {
				throw new Error(`No published attempts found in R2 for run ${id}`);
			}
		}
		if (runs.length === 0)
			throw new Error("No published run attempts found in R2.");
		for (const run of runs)
			await installRunDirectory(run.directory, run.manifest, root);
		return runs.length;
	} finally {
		await rm(staging, { recursive: true, force: true });
	}
}

async function main(): Promise<void> {
	const { runIds, help } = parseDownloadArguments(process.argv.slice(2));
	if (help) {
		console.info(`Usage: just reports-download [run-id ...]

Download published run folders from remote R2 into dashboard/data/runs.
With no IDs, download all published runs. Local files are replaced only after download succeeds.
Uses your Wrangler login or CLOUDFLARE_API_TOKEN. To sign in, run:
pnpm --dir dashboard exec wrangler login
CLOUDFLARE_ACCOUNT_ID overrides the repository's account.

Then run just db-setup-local to migrate and seed local D1/R2.`);
		return;
	}
	const count = await downloadRuns(runIds);
	console.info(
		`Downloaded ${count} run attempts into ${dataDirectory}. Run just db-setup-local to seed local D1/R2.`,
	);
}

if (
	process.argv[1] &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	main().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
