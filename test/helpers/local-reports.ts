import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export async function writeRun(
	root: string,
	id = 123,
	attempt = 1,
): Promise<string> {
	const directory = join(root, String(id), "attempts", String(attempt));
	const report = join(directory, "reports", "withastro", "astro.json");
	await mkdir(dirname(report), { recursive: true });
	await writeFile(
		report,
		JSON.stringify({
			summary: { duration: 300, scannerDuration: 200, errors: 1, warnings: 0 },
			diagnostics: [
				{
					category: "lint/style/useConst",
					severity: "error",
					message: "Use const",
				},
			],
		}),
	);
	await writeFile(
		join(directory, "manifest.json"),
		JSON.stringify({
			schemaVersion: 2,
			githubRunId: id,
			runAttempt: attempt,
			biomeBranch: "main",
			biomeCommitSha: "a".repeat(40),
			status: "completed",
			startedAt: "2026-09-03T10:00:00.000Z",
			completedAt: "2026-09-03T10:05:00.000Z",
			targets: {
				"withastro/astro": {
					repositoryCommitSha: "b".repeat(40),
					jobStartedAt: "2026-09-03T10:01:00.000Z",
					jobCompletedAt: "2026-09-03T10:02:00.000Z",
					migrationOutcome: "succeeded_no_changes",
					executionStatus: "completed",
					timingSamples: [
						{ ordinal: 1, checkDurationNs: 320, scannerDurationNs: 210 },
						{ ordinal: 2, checkDurationNs: 300, scannerDurationNs: 200 },
					],
				},
				"owner/missing": {
					repositoryCommitSha: "c".repeat(40),
					jobStartedAt: "2026-09-03T10:01:00.000Z",
					jobCompletedAt: "2026-09-03T10:02:00.000Z",
					migrationOutcome: "failed",
					executionStatus: "error",
				},
			},
		}),
	);
	return directory;
}
