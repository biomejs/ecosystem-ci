export interface RunSummary {
	githubRunId: number;
	runAttempt: number;
	biomeBranch: string;
	biomeCommitSha: string;
	startedAt: string;
	completedAt: string | null;
	status: string;
	results: number;
	passed: number;
	failed: number;
}

export interface RepositoryResult {
	repositorySlug: string;
	repositoryCommitSha: string;
	executionStatus: string;
	checkOutcome: string | null;
	reportStatus: string;
	jobDurationMs: number | null;
	checkDurationNs: number | null;
	scannerDurationNs: number | null;
	errors: number;
	warnings: number;
	infos: number;
	parseDiagnostics: number;
	panics: number;
}

export interface RuleCount {
	repositorySlug: string;
	severity: string;
	category: string;
	count: number;
}

export interface HistoryPoint {
	githubRunId: number;
	repositorySlug: string;
	checkDurationNs: number | null;
	errors: number;
	warnings: number;
	infos: number;
	panics: number;
}

interface RunRow {
	github_run_id: number;
	run_attempt: number;
	biome_branch: string;
	biome_commit_sha: string;
	started_at: string;
	completed_at: string | null;
	status: string;
	results: number;
	passed: number;
	failed: number;
}

interface RepositoryResultRow {
	repository_slug: string;
	repository_commit_sha: string;
	execution_status: string;
	check_outcome: string | null;
	report_status: string;
	job_duration_ms: number | null;
	check_duration_ns: number | null;
	scanner_duration_ns: number | null;
	errors: number;
	warnings: number;
	infos: number;
	parse_diagnostics: number;
	panics: number;
}

interface RuleCountRow {
	repository_slug: string;
	severity: string;
	category: string;
	count: number;
}

interface HistoryPointRow {
	github_run_id: number;
	repository_slug: string;
	check_duration_ns: number | null;
	errors: number;
	warnings: number;
	infos: number;
	panics: number;
}

export async function listRecentRuns(
	db: D1Database,
	limit = 20,
): Promise<RunSummary[]> {
	const { results } = await db
		.prepare(
			`SELECT
				r.github_run_id,
				r.run_attempt,
				r.biome_branch,
				r.biome_commit_sha,
				r.started_at,
				r.completed_at,
				r.status,
				COUNT(rr.id) AS results,
				SUM(CASE WHEN rr.check_outcome = 'passed' THEN 1 ELSE 0 END) AS passed,
				SUM(CASE WHEN rr.check_outcome = 'failed' THEN 1 ELSE 0 END) AS failed
			FROM runs r
			LEFT JOIN repository_results rr ON rr.run_id = r.github_run_id
			GROUP BY r.github_run_id
			ORDER BY r.started_at DESC
			LIMIT ?`,
		)
		.bind(Math.min(Math.max(limit, 1), 100))
		.all<RunRow>();

	return results.map((row) => ({
		githubRunId: row.github_run_id,
		runAttempt: row.run_attempt,
		biomeBranch: row.biome_branch,
		biomeCommitSha: row.biome_commit_sha,
		startedAt: row.started_at,
		completedAt: row.completed_at,
		status: row.status,
		results: row.results,
		passed: row.passed,
		failed: row.failed,
	}));
}

export async function listRepositoryResults(
	db: D1Database,
	githubRunId: number,
): Promise<RepositoryResult[]> {
	const { results } = await db
		.prepare(
			`SELECT
				rr.repository_slug,
				rr.repository_commit_sha,
				rr.execution_status,
				rr.check_outcome,
				rr.report_status,
				rr.job_duration_ms,
				rr.check_duration_ns,
				rr.scanner_duration_ns,
				COALESCE(
					SUM(CASE WHEN dc.severity = 'error' AND dc.kind != 'panic' THEN dc.count ELSE 0 END),
					0
				) AS errors,
				COALESCE(SUM(CASE WHEN dc.severity = 'warning' THEN dc.count ELSE 0 END), 0) AS warnings,
				COALESCE(SUM(CASE WHEN dc.severity = 'info' THEN dc.count ELSE 0 END), 0) AS infos,
				COALESCE(SUM(CASE WHEN dc.kind = 'parse' THEN dc.count ELSE 0 END), 0) AS parse_diagnostics,
				COALESCE(SUM(CASE WHEN dc.kind = 'panic' THEN dc.count ELSE 0 END), 0) AS panics
			FROM repository_results rr
			LEFT JOIN diagnostic_counts dc ON dc.repository_result_id = rr.id
			WHERE rr.run_id = ?
			GROUP BY rr.id
			ORDER BY rr.repository_slug`,
		)
		.bind(githubRunId)
		.all<RepositoryResultRow>();

	return results.map((row) => ({
		repositorySlug: row.repository_slug,
		repositoryCommitSha: row.repository_commit_sha,
		executionStatus: row.execution_status,
		checkOutcome: row.check_outcome,
		reportStatus: row.report_status,
		jobDurationMs: row.job_duration_ms,
		checkDurationNs: row.check_duration_ns,
		scannerDurationNs: row.scanner_duration_ns,
		errors: row.errors,
		warnings: row.warnings,
		infos: row.infos,
		parseDiagnostics: row.parse_diagnostics,
		panics: row.panics,
	}));
}

export async function listTopRuleCounts(
	db: D1Database,
	githubRunId: number,
	limit = 20,
): Promise<RuleCount[]> {
	const { results } = await db
		.prepare(
			`SELECT
				rr.repository_slug,
				dc.severity,
				dc.category,
				dc.count
			FROM diagnostic_counts dc
			JOIN repository_results rr ON rr.id = dc.repository_result_id
			WHERE rr.run_id = ?
				AND dc.kind = 'rule'
				AND (dc.category LIKE 'lint/%' OR dc.category LIKE 'assist/%')
			ORDER BY dc.count DESC, rr.repository_slug, dc.category
			LIMIT ?`,
		)
		.bind(githubRunId, Math.min(Math.max(limit, 1), 100))
		.all<RuleCountRow>();

	return results.map((row) => ({
		repositorySlug: row.repository_slug,
		severity: row.severity,
		category: row.category,
		count: row.count,
	}));
}

export async function listRepositoryHistory(
	db: D1Database,
	biomeBranch: string,
	limit = 8,
): Promise<HistoryPoint[]> {
	const { results } = await db
		.prepare(
			`SELECT
				r.github_run_id,
				rr.repository_slug,
				rr.check_duration_ns,
				COALESCE(
					SUM(CASE WHEN dc.severity = 'error' AND dc.kind != 'panic' THEN dc.count ELSE 0 END),
					0
				) AS errors,
				COALESCE(SUM(CASE WHEN dc.severity = 'warning' THEN dc.count ELSE 0 END), 0) AS warnings,
				COALESCE(SUM(CASE WHEN dc.severity = 'info' THEN dc.count ELSE 0 END), 0) AS infos,
				COALESCE(SUM(CASE WHEN dc.kind = 'panic' THEN dc.count ELSE 0 END), 0) AS panics
			FROM runs r
			JOIN repository_results rr ON rr.run_id = r.github_run_id
			LEFT JOIN diagnostic_counts dc ON dc.repository_result_id = rr.id
			WHERE r.biome_branch = ?
				AND r.github_run_id IN (
					SELECT github_run_id
					FROM runs
					WHERE biome_branch = ?
					ORDER BY started_at DESC
					LIMIT ?
				)
			GROUP BY rr.id
			ORDER BY r.started_at DESC, rr.repository_slug`,
		)
		.bind(biomeBranch, biomeBranch, Math.min(Math.max(limit, 1), 30))
		.all<HistoryPointRow>();

	return results.map((row) => ({
		githubRunId: row.github_run_id,
		repositorySlug: row.repository_slug,
		checkDurationNs: row.check_duration_ns,
		errors: row.errors,
		warnings: row.warnings,
		infos: row.infos,
		panics: row.panics,
	}));
}
