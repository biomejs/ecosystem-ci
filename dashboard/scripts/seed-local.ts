import manifest from "../data/manifest.json";

interface Report {
	summary: {
		duration: number;
		errors: number;
		warnings: number;
		scannerDuration: number;
	};
	diagnostics: Array<{
		category?: string;
		severity?: string;
	}>;
}

function sql(value: string): string {
	return `'${value.replaceAll("'", "''")}'`;
}

function durationMs(startedAt: string, completedAt: string): number {
	return new Date(completedAt).getTime() - new Date(startedAt).getTime();
}

function diagnosticKind(category: string): "parse" | "panic" | "rule" {
	if (category === "parse") return "parse";
	if (category === "internalError/panic") return "panic";
	return "rule";
}

const statements = ["PRAGMA foreign_keys = ON;", "DELETE FROM runs;"];

for (const run of manifest.runs) {
	statements.push(`INSERT INTO runs (
		github_run_id,
		run_attempt,
		biome_branch,
		biome_commit_sha,
		status,
		started_at,
		completed_at
	) VALUES (
		${run.githubRunId},
		${run.runAttempt},
		${sql(run.biomeBranch)},
		${sql(run.biomeCommitSha)},
		${sql(run.status)},
		${sql(run.startedAt)},
		${sql(run.completedAt)}
	);`);

	for (const result of run.results) {
		const reportPath = new URL(`../data/${result.report}`, import.meta.url);
		const report = (await Bun.file(reportPath).json()) as Report;
		const checkOutcome =
			report.summary.errors > 0 || report.summary.warnings > 0
				? "failed"
				: "passed";

		statements.push(`INSERT INTO repository_results (
			run_id,
			repository_slug,
			repository_commit_sha,
			migration_outcome,
			execution_status,
			check_outcome,
			report_status,
			job_duration_ms,
			check_duration_ns,
			scanner_duration_ns,
			raw_report_r2_key
		) VALUES (
			${run.githubRunId},
			${sql(result.repositorySlug)},
			${sql(result.repositoryCommitSha)},
			NULL,
			'completed',
			${sql(checkOutcome)},
			'available',
			${durationMs(result.jobStartedAt, result.jobCompletedAt)},
			${report.summary.duration},
			${report.summary.scannerDuration},
			${sql(result.report)}
		);`);

		const counts = new Map<string, number>();
		for (const diagnostic of report.diagnostics) {
			const category = diagnostic.category ?? "uncategorized";
			const severity = diagnostic.severity ?? "unknown";
			const kind = diagnosticKind(category);
			const key = JSON.stringify([kind, severity, category]);
			counts.set(key, (counts.get(key) ?? 0) + 1);
		}

		for (const [key, count] of counts) {
			const [kind, severity, category] = JSON.parse(key) as [
				string,
				string,
				string,
			];
			statements.push(`INSERT INTO diagnostic_counts (
				repository_result_id,
				kind,
				severity,
				category,
				count
			) VALUES (
				(SELECT id FROM repository_results WHERE run_id = ${run.githubRunId} AND repository_slug = ${sql(result.repositorySlug)}),
				${sql(kind)},
				${sql(severity)},
				${sql(category)},
				${count}
			);`);
		}
	}
}

const dashboardDirectory = new URL("..", import.meta.url).pathname;
const seedPath = "/tmp/biome-ecosystem-ci-dashboard-seed.sql";
await Bun.write(seedPath, statements.join("\n"));

const seed = Bun.spawn(
	["bunx", "wrangler", "d1", "execute", "DB", "--local", "--file", seedPath],
	{
		cwd: dashboardDirectory,
		stdout: "inherit",
		stderr: "inherit",
	},
);

if ((await seed.exited) !== 0) process.exit(1);

for (const run of manifest.runs) {
	for (const result of run.results) {
		const reportPath = new URL(`../data/${result.report}`, import.meta.url)
			.pathname;
		const upload = Bun.spawn(
			[
				"bunx",
				"wrangler",
				"r2",
				"object",
				"put",
				`biome-ecosystem-ci-reports/${result.report}`,
				"--file",
				reportPath,
				"--content-type",
				"application/json",
				"--local",
			],
			{
				cwd: dashboardDirectory,
				stdout: "ignore",
				stderr: "inherit",
			},
		);

		if ((await upload.exited) !== 0) process.exit(1);
	}
}

console.log(
	`Seeded ${manifest.runs.length} runs and ${manifest.runs.flatMap((run) => run.results).length} reports.`,
);
