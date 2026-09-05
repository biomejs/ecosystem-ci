import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { getPlatformProxy } from "wrangler";
import { writeRun } from "../../test/helpers/local-reports";
import { loadLocalRuns } from "./local-reports";
import { seedLocalRuns } from "./seed-local";

test("seeds production run folders into local D1/R2 with timings, sparse reports and latest attempts", async () => {
	const root = await mkdtemp(join(tmpdir(), "ecosystem-seed-test-"));
	const platform = await getPlatformProxy<CloudflareEnv>({
		configPath: fileURLToPath(new URL("../wrangler.jsonc", import.meta.url)),
		persist: false,
	});
	try {
		for (const migration of ["0001_initial.sql", "0002_check_samples.sql"]) {
			const sql = await readFile(
				new URL(`../migrations/${migration}`, import.meta.url),
				"utf8",
			);
			// D1 exec accepts one statement per line.
			await platform.env.DB.exec(
				sql
					.replace(/--[^\n]*/g, "")
					.replace(/\n/g, " ")
					.split(";")
					.map((statement) => statement.trim())
					.filter(Boolean)
					.join(";\n"),
			);
		}
		await expect(seedLocalRuns([], platform.env)).rejects.toThrow(
			"No downloaded runs",
		);
		await writeRun(root, 123, 1);
		await writeRun(root, 123, 2);
		expect(await seedLocalRuns(await loadLocalRuns(root), platform.env)).toBe(
			1,
		);
		expect(
			await platform.env.DB.prepare(
				"SELECT github_run_id, run_attempt FROM runs",
			).all(),
		).toMatchObject({ results: [{ github_run_id: 123, run_attempt: 2 }] });
		expect(
			await platform.env.DB.prepare(
				"SELECT repository_slug, migration_outcome FROM repository_results",
			).all(),
		).toMatchObject({
			results: [
				{
					repository_slug: "withastro/astro",
					migration_outcome: "succeeded_no_changes",
				},
			],
		});
		expect(
			await platform.env.DB.prepare(
				"SELECT check_duration_ns FROM check_samples ORDER BY ordinal",
			).all(),
		).toMatchObject({
			results: [{ check_duration_ns: 320 }, { check_duration_ns: 300 }],
		});
		const key = "runs/123/attempts/2/reports/withastro/astro.json";
		expect(await platform.env.REPORTS.get(key)).not.toBeNull();
		expect(
			await platform.env.REPORTS.get("runs/123/attempts/2/manifest.json"),
		).not.toBeNull();
		expect(
			await platform.env.REPORTS.get(
				"incoming/runs/123/attempts/2/manifest.json",
			),
		).toBeNull();
		// A repeat seed must remove reports that are now absent, including stale R2 copies.
		await rm(join(root, key.slice("runs/".length)));
		expect(await seedLocalRuns(await loadLocalRuns(root), platform.env)).toBe(
			0,
		);
		expect(await platform.env.REPORTS.get(key)).toBeNull();
		expect(
			await platform.env.DB.prepare("SELECT * FROM repository_results").all(),
		).toMatchObject({ results: [] });
		expect(
			await platform.env.DB.prepare("SELECT * FROM check_samples").all(),
		).toMatchObject({ results: [] });
		// Downloading an older attempt must not replace the newer D1 projection.
		const oldRuns = (await loadLocalRuns(root)).filter(
			({ manifest }) => manifest.runAttempt === 1,
		);
		await seedLocalRuns(oldRuns, platform.env);
		expect(
			await platform.env.DB.prepare("SELECT run_attempt FROM runs").first(
				"run_attempt",
			),
		).toBe(2);
	} finally {
		await platform.dispose();
		await rm(root, { recursive: true, force: true });
	}
}, 30_000);
