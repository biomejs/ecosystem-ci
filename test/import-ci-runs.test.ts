import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
	isValidReport,
	type ManifestRun,
	mergeRuns,
	parseArguments,
	parseWorkflowTargets,
	selectUnimportedRunIds,
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
	assert.equal(targets.length, 42);
	assert.deepEqual(targets[0], { id: "django", repository: "django/django" });
	assert.deepEqual(targets.at(-1), {
		id: "byline-cms",
		repository: "Byline-CMS/bylinecms.dev",
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

test("mergeRuns replaces matching IDs and sorts newest first", () => {
	assert.deepEqual(
		mergeRuns(
			[run(1, "2026-08-20T00:00:00Z"), run(2, "2026-08-21T00:00:00Z")],
			[run(1, "2026-08-22T00:00:00Z")],
		).map((item) => item.githubRunId),
		[1, 2],
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
