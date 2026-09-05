import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
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

async function downloadPrefix(
	prefix: string,
	destination: string,
): Promise<void> {
	await new Promise<void>((resolvePromise, reject) => {
		const child = spawn(
			"aws",
			[
				"s3",
				"sync",
				`s3://${bucket}/${prefix}`,
				destination,
				"--endpoint-url",
				`https://${process.env.CLOUDFLARE_ACCOUNT_ID ?? accountId}.r2.cloudflarestorage.com`,
				"--region",
				"auto",
				"--no-progress",
			],
			{ stdio: "inherit" },
		);
		child.once("error", (error: NodeJS.ErrnoException) =>
			reject(
				error.code === "ENOENT"
					? new Error(
							"Install the AWS CLI and configure R2 credentials before downloading reports.",
						)
					: error,
			),
		);
		child.once("close", (code) =>
			code === 0
				? resolvePromise()
				: reject(
						new Error(`R2 download failed (aws exited with code ${code})`),
					),
		);
	});
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
		console.log(`Usage: just reports-download [run-id ...]

Download published run folders from remote R2 into dashboard/data/runs.
With no IDs, download all published runs. Local files are replaced only after download succeeds.
Requires the AWS CLI with R2 credentials (AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY,
or an AWS profile). CLOUDFLARE_ACCOUNT_ID overrides the repository's account.

Then run just db-setup-local to migrate and seed local D1/R2.`);
		return;
	}
	const count = await downloadRuns(runIds);
	console.log(
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
