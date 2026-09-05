import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ingestManifestObject } from "@biomejs/ecosystem-ci-ingest/ingest";
import { getPlatformProxy } from "wrangler";
import {
	type LocalRun,
	latestLocalRuns,
	loadLocalRuns,
	runPrefix,
} from "./local-reports.js";

export async function seedLocalRuns(
	runs: LocalRun[],
	env: CloudflareEnv,
): Promise<number> {
	if (runs.length === 0) {
		throw new Error(
			"No downloaded runs found. Run just reports-download or just reports-import --no-seed first.",
		);
	}
	let reports = 0;
	for (const run of latestLocalRuns(runs)) {
		// Clear this attempt's old reports so a repeat seed preserves sparse results.
		let cursor: string | undefined;
		do {
			const page = await env.REPORTS.list({
				prefix: `${runPrefix(run.manifest)}/reports/`,
				cursor,
			});
			if (page.objects.length)
				await env.REPORTS.delete(page.objects.map((object) => object.key));
			cursor = page.truncated ? page.cursor : undefined;
		} while (cursor !== undefined);
		for (const report of run.reports) {
			await env.REPORTS.put(report.key, await readFile(report.path), {
				httpMetadata: { contentType: "application/json" },
			});
		}
		const incomingKey = `incoming/${runPrefix(run.manifest)}/manifest.json`;
		await env.REPORTS.put(incomingKey, JSON.stringify(run.manifest));
		const result = await ingestManifestObject(incomingKey, env);
		reports += result.reportCount;
	}
	return reports;
}

async function main(): Promise<void> {
	const runs = latestLocalRuns(await loadLocalRuns());
	if (runs.length === 0)
		throw new Error(
			"No downloaded runs found. Run just reports-download or just reports-import --no-seed first.",
		);
	const dashboardDirectory = fileURLToPath(new URL("..", import.meta.url));
	const platform = await getPlatformProxy<CloudflareEnv>({
		configPath: join(dashboardDirectory, "wrangler.jsonc"),
		persist: { path: join(dashboardDirectory, ".wrangler/state/v3") },
	});
	try {
		const reports = await seedLocalRuns(runs, platform.env);
		console.log(`Seeded ${runs.length} runs and ${reports} reports.`);
	} finally {
		await platform.dispose();
	}
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
