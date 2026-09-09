import {
	cp,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
	createR2Downloader,
	downloadRuns,
	parseDownloadArguments,
} from "../dashboard/scripts/download-r2";
import {
	latestLocalRuns,
	loadLocalRuns,
} from "../dashboard/scripts/local-reports";
import { main as readDiagnostics } from "../dashboard/scripts/read-diagnostics";
import { writeRun } from "./helpers/local-reports";

const temporaryDirectories: string[] = [];
async function temporaryDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "ecosystem-reports-test-"));
	temporaryDirectories.push(directory);
	return directory;
}

afterEach(async () => {
	vi.restoreAllMocks();
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

describe("local run discovery", () => {
	test("reads diagnostics from downloaded folders without an aggregate manifest", async () => {
		const root = await temporaryDirectory();
		await writeRun(join(root, "runs"));
		const info = vi.spyOn(console, "info").mockImplementation(() => {});
		await readDiagnostics(["astro", "--json"], root);
		expect(JSON.parse(info.mock.calls[0][0])).toEqual([
			{
				category: "lint/style/useConst",
				severity: "error",
				message: "Use const",
			},
		]);
	});

	test("needs no aggregate manifest and keeps missing reports absent", async () => {
		const root = await temporaryDirectory();
		expect(await loadLocalRuns(join(root, "absent"))).toEqual([]);
		await writeRun(root);
		await writeRun(root, 123, 2);
		await mkdir(join(root, "456/attempts/1/reports"), { recursive: true });
		const runs = await loadLocalRuns(root);
		expect(runs).toHaveLength(2);
		const latest = latestLocalRuns(runs);
		expect(latest).toHaveLength(1);
		expect(latest[0].manifest.runAttempt).toBe(2);
		expect(latest[0].reports.map((report) => report.key)).toEqual([
			"runs/123/attempts/2/reports/withastro/astro.json",
		]);
	});

	test("rejects malformed metadata and mismatched run identities", async () => {
		const root = await temporaryDirectory();
		const directory = await writeRun(root);
		await renameIdentity(directory);
		await expect(loadLocalRuns(root)).rejects.toThrow(
			"Manifest identity does not match",
		);
		await writeFile(join(directory, "manifest.json"), "{}");
		await expect(loadLocalRuns(root)).rejects.toThrow();
	});
});

async function renameIdentity(directory: string): Promise<void> {
	const path = join(directory, "manifest.json");
	const manifest = JSON.parse(await readFile(path, "utf8"));
	manifest.githubRunId = 999;
	await writeFile(path, JSON.stringify(manifest));
}

describe("R2 download", () => {
	test("downloads paginated Cloudflare objects using Wrangler credentials", async () => {
		const local = await temporaryDirectory();
		const headers = { Authorization: "Bearer test-token" };
		const calls: URL[] = [];
		const request: typeof fetch = async (input, init) => {
			const url = new URL(String(input));
			calls.push(url);
			expect(url.origin).toBe("https://api.cloudflare.com");
			expect(init?.headers).toEqual(headers);
			if (url.pathname.endsWith("/objects")) {
				expect(url.searchParams.get("prefix")).toBe("runs/123/");
				return Response.json(
					url.searchParams.has("cursor")
						? {
								success: true,
								result: [
									{ key: "runs/123/attempts/1/reports/owner/repo.json" },
								],
								result_info: { is_truncated: false },
							}
						: {
								success: true,
								result: [{ key: "runs/123/attempts/1/manifest.json" }],
								result_info: { cursor: "next-page", is_truncated: true },
							},
				);
			}
			return new Response(
				url.pathname.endsWith("manifest.json") ? "manifest" : "report",
			);
		};
		await createR2Downloader(headers, request)("runs/123/", local);
		expect(calls[2].searchParams.get("cursor")).toBe("next-page");
		expect(
			await readFile(join(local, "attempts/1/manifest.json"), "utf8"),
		).toBe("manifest");
		expect(
			await readFile(join(local, "attempts/1/reports/owner/repo.json"), "utf8"),
		).toBe("report");
	});

	test("a failed object download preserves the installed run", async () => {
		const local = await temporaryDirectory();
		const directory = await writeRun(local);
		const original = await readFile(join(directory, "manifest.json"), "utf8");
		const request: typeof fetch = async (input) =>
			new URL(String(input)).pathname.endsWith("/objects")
				? Response.json({
						success: true,
						result: [{ key: "runs/123/attempts/1/manifest.json" }],
					})
				: new Response("unavailable", { status: 503 });
		await expect(
			downloadRuns([123], createR2Downloader({}, request), local),
		).rejects.toThrow("HTTP 503");
		expect(await readFile(join(directory, "manifest.json"), "utf8")).toBe(
			original,
		);
		expect(await readdir(local)).toEqual(["123"]);
	});

	test.each([
		"runs/456/manifest.json",
		"runs/123/../escape.json",
		"runs/123/attempts/1/../../escape.json",
	])("rejects unexpected object key %s", async (key) => {
		const request: typeof fetch = async () =>
			Response.json({ success: true, result: [{ key }] });
		await expect(
			createR2Downloader({}, request)("runs/123/", await temporaryDirectory()),
		).rejects.toThrow("Unexpected R2 object key");
	});

	test("rejects incomplete pagination instead of installing a partial download", async () => {
		const request: typeof fetch = async () =>
			Response.json({
				success: true,
				result: [],
				result_info: { is_truncated: true },
			});
		await expect(
			createR2Downloader({}, request)("runs/", await temporaryDirectory()),
		).rejects.toThrow("without a cursor");
	});

	test("rejects failed Cloudflare listings", async () => {
		const request: typeof fetch = async () =>
			new Response("denied", { status: 403 });
		await expect(
			createR2Downloader({}, request)("runs/", await temporaryDirectory()),
		).rejects.toThrow("HTTP 403");
	});

	test("downloads selected run prefixes and installs canonical folders", async () => {
		const remote = await temporaryDirectory();
		const local = await temporaryDirectory();
		await writeRun(remote);
		const prefixes: string[] = [];
		const count = await downloadRuns(
			[123],
			async (prefix, destination) => {
				prefixes.push(prefix);
				await cp(join(remote, "123"), destination, { recursive: true });
			},
			local,
		);
		expect(count).toBe(1);
		expect(prefixes).toEqual(["runs/123/"]);
		expect(await loadLocalRuns(local)).toHaveLength(1);
		expect(await readdir(local)).toEqual(["123"]);
	});

	test("failed transfers leave previously downloaded runs intact", async () => {
		const local = await temporaryDirectory();
		const directory = await writeRun(local);
		const original = await readFile(join(directory, "manifest.json"), "utf8");
		await expect(
			downloadRuns(
				[123],
				async (_prefix, destination) => {
					await mkdir(destination, { recursive: true });
					await writeFile(join(destination, "partial.json"), "{}");
					throw new Error("transfer interrupted");
				},
				local,
			),
		).rejects.toThrow("transfer interrupted");
		expect(await readFile(join(directory, "manifest.json"), "utf8")).toBe(
			original,
		);
		expect(await readdir(local)).toEqual(["123"]);
	});

	test("replaces an attempt without retaining reports absent from the download", async () => {
		const remote = await temporaryDirectory();
		const local = await temporaryDirectory();
		await writeRun(remote);
		const directory = await writeRun(local);
		await writeFile(join(directory, "reports/withastro/stale.json"), "{}");
		await downloadRuns(
			[],
			async (_prefix, destination) =>
				cp(remote, destination, { recursive: true }),
			local,
		);
		expect(await readdir(join(directory, "reports/withastro"))).toEqual([
			"astro.json",
		]);
	});

	test("fails for requested runs with no published attempt", async () => {
		const local = await temporaryDirectory();
		await expect(downloadRuns([123], async () => {}, local)).rejects.toThrow(
			"No published attempts",
		);
	});

	test("rejects invalid IDs and deduplicates selections", () => {
		expect(parseDownloadArguments(["123", "123", "456"]).runIds).toEqual([
			123, 456,
		]);
		for (const value of [
			"../123",
			"0",
			"1.5",
			"9007199254740992",
			"--unknown",
		]) {
			expect(() => parseDownloadArguments([value])).toThrow();
		}
	});
});
