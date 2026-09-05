import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";
import {
	isValidReport,
	type ManifestRun,
	parseArguments,
	parseReportArtifactName,
	parseWorkflowTargets,
	selectUnimportedRunIds,
	toRunManifest,
} from "../dashboard/scripts/import-ci-runs.ts";

function run(id: number, startedAt: string): ManifestRun {
	return {
		githubRunId: id,
		runAttempt: 1,
		biomeBranch: "main",
		biomeCommitSha: "a".repeat(40),
		startedAt,
		completedAt: startedAt,
		status: "completed",
		results: [],
	};
}

test("parseArguments discovers and seeds by default", () => {
	assert.deepEqual(parseArguments([]), {
		repository: "biomejs/ecosystem-ci",
		workflow: "ecosystem-ci.yml",
		runIds: [],
		seed: true,
		help: false,
	});
});

test("parseArguments accepts run IDs and workflow options", () => {
	assert.deepEqual(
		parseArguments([
			"--workflow",
			"nightly.yml",
			"--no-seed",
			"123",
			"123",
			"456",
		]),
		{
			repository: "biomejs/ecosystem-ci",
			workflow: "nightly.yml",
			runIds: [123, 456],
			seed: false,
			help: false,
		},
	);
});

test("parseWorkflowTargets reads repository IDs and optional refs", () => {
	const workflow = `jobs:
  test-ecosystem:
    strategy:
      matrix:
        include:
          - id: astro
            repository: withastro/astro
          - id: example
            repository: owner/example
            ref: next
    name: Test \${{ matrix.id }}
  notify-discord:
`;
	assert.deepEqual(parseWorkflowTargets(workflow), [
		{ id: "astro", repository: "withastro/astro" },
		{ id: "example", repository: "owner/example", ref: "next" },
	]);
});

test("parseWorkflowTargets reads the current ecosystem workflow", async () => {
	const workflow = await readFile(".github/workflows/ecosystem-ci.yml", "utf8");
	const targets = parseWorkflowTargets(workflow);
	assert.equal(targets.length, 43);
	assert.deepEqual(targets[0], {
		id: "django",
		repository: "django/django",
		ref: "73cc09f14f13fedddc14d6ba5b287cb33c24e4a4",
	});
	assert.deepEqual(targets.at(-1), {
		id: "poketernity",
		repository: "Despair-Games/poketernity",
		ref: "7fb6d12a13d528a1b70536a1a3150dd6b7049daa",
	});
});

test("isValidReport rejects CI error placeholders", () => {
	assert.equal(isValidReport({ error: true }), false);
	assert.equal(
		isValidReport({
			summary: {
				duration: 10,
				scannerDuration: 2,
				errors: 0,
				warnings: 1,
			},
			diagnostics: [],
		}),
		true,
	);
});

test("parseReportArtifactName accepts main and candidate reports", () => {
	assert.deepEqual(parseReportArtifactName("biome-report-astro"), {
		id: "astro",
		filename: "biome-report-astro.json",
	});
	assert.deepEqual(parseReportArtifactName("candidate-report-astro"), {
		id: "astro",
		filename: "biome-report-astro.json",
	});
	assert.equal(parseReportArtifactName("outcome-astro"), null);
});

test("GitHub imports produce the production run format", () => {
	const imported = run(123, "2026-08-20T00:00:00Z");
	imported.runAttempt = 2;
	imported.results = [
		{
			repositorySlug: "withastro/astro",
			repositoryCommitSha: "b".repeat(40),
			jobStartedAt: imported.startedAt,
			jobCompletedAt: imported.completedAt,
			report: "runs/123/attempts/2/reports/withastro/astro.json",
			timingSamples: [
				{ ordinal: 1, checkDurationNs: 10, scannerDurationNs: 2 },
			],
		},
	];
	const manifest = toRunManifest(imported);
	assert.equal(manifest.runAttempt, 2);
	assert.equal(
		manifest.targets["withastro/astro"].repositoryCommitSha,
		"b".repeat(40),
	);
	assert.deepEqual(
		manifest.targets["withastro/astro"].timingSamples,
		imported.results[0].timingSamples,
	);
	assert.equal("results" in manifest, false);
	assert.equal(manifest.targets["withastro/astro"].migrationOutcome, null);
	imported.results[0].migrationOutcome = "succeeded_with_changes";
	assert.equal(
		toRunManifest(imported).targets["withastro/astro"].migrationOutcome,
		"succeeded_with_changes",
	);
});

test("selectUnimportedRunIds skips stored and unfinished runs", () => {
	assert.deepEqual(
		selectUnimportedRunIds(
			[
				{
					id: 3,
					run_attempt: 1,
					status: "completed",
					conclusion: "success",
					run_started_at: "2026-08-23T00:00:00Z",
					updated_at: "2026-08-23T00:10:00Z",
				},
				{
					id: 1,
					run_attempt: 1,
					status: "completed",
					conclusion: "success",
					run_started_at: "2026-08-21T00:00:00Z",
					updated_at: "2026-08-21T00:10:00Z",
				},
				{
					id: 2,
					run_attempt: 1,
					status: "in_progress",
					conclusion: null,
					run_started_at: "2026-08-22T00:00:00Z",
					updated_at: "2026-08-22T00:10:00Z",
				},
				{
					id: 4,
					run_attempt: 2,
					status: "completed",
					conclusion: "success",
					run_started_at: "2026-08-24T00:00:00Z",
					updated_at: "2026-08-24T00:10:00Z",
				},
			],
			new Map([
				[1, 1],
				[4, 1],
			]),
			"2026-08-22T00:00:00Z",
		),
		[3, 4],
	);
});
