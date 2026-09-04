import { describe, expect, test } from "vitest";
import {
	buildRunManifest,
	incomingManifestKey,
	parseArguments,
	parseTargetArtifacts,
	reportObjectKey,
	type TargetArtifact,
} from "../dashboard/scripts/publish-run";

const target: TargetArtifact = {
	id: "astro",
	repositorySlug: "withastro/astro",
	repositoryCommitSha: "b".repeat(40),
	jobStartedAt: "2026-09-03T10:01:00.000Z",
	jobCompletedAt: "2026-09-03T10:02:00.000Z",
	migrationOutcome: "succeeded_no_changes",
	executionStatus: "completed",
};

describe("run publication", () => {
	test("uses repository slugs as manifest keys without report inventory", () => {
		const manifest = buildRunManifest(
			{
				githubRunId: 123,
				runAttempt: 2,
				biomeBranch: "main",
				biomeCommitSha: "a".repeat(40),
				startedAt: "2026-09-03T10:00:00.000Z",
				completedAt: "2026-09-03T10:05:00.000Z",
			},
			[target],
		);
		expect(manifest.targets).toEqual({
			"withastro/astro": {
				repositoryCommitSha: target.repositoryCommitSha,
				jobStartedAt: target.jobStartedAt,
				jobCompletedAt: target.jobCompletedAt,
				migrationOutcome: "succeeded_no_changes",
				executionStatus: "completed",
			},
		});
		expect(JSON.stringify(manifest)).not.toContain("reportKey");
	});

	test("builds immutable attempt-specific R2 keys", () => {
		expect(reportObjectKey(123, 2, "withastro/astro")).toBe(
			"runs/123/attempts/2/reports/withastro/astro.json",
		);
		expect(incomingManifestKey(123, 2)).toBe(
			"incoming/runs/123/attempts/2/manifest.json",
		);
		expect(() => reportObjectKey(0, 2, "withastro/astro")).toThrow();
		expect(() => reportObjectKey(123, 2, "astro")).toThrow();
	});

	test("validates publisher arguments and target metadata", () => {
		const options = parseArguments([
			"--reports-dir",
			"reports",
			"--metadata-dir",
			"metadata",
			"--run-id",
			"123",
			"--run-attempt",
			"2",
			"--biome-branch",
			"main",
			"--biome-commit-sha",
			"a".repeat(40),
			"--started-at",
			"2026-09-03T10:00:00.000Z",
			"--completed-at",
			"2026-09-03T10:05:00.000Z",
		]);
		expect(options).toMatchObject({ githubRunId: 123, runAttempt: 2 });
		expect(() =>
			parseTargetArtifacts([target, { ...target, id: "astro-copy" }]),
		).toThrow("Repository slugs must be unique");
		expect(() => parseTargetArtifacts([{ ...target, id: "bad id" }])).toThrow();
	});
});
