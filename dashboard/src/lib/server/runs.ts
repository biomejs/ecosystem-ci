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

export interface HistoryPoint {
	githubRunId: number;
	repositorySlug: string;
	checkDurationNs: number | null;
	scannerDurationNs: number | null;
	errors: number;
	warnings: number;
	infos: number;
	parseDiagnostics: number;
	ruleDiagnostics: number;
	ruleErrors: number;
	ruleWarnings: number;
	ruleInfos: number;
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

interface HistoryPointRow {
	github_run_id: number;
	repository_slug: string;
	check_duration_ns: number | null;
	scanner_duration_ns: number | null;
	errors: number;
	warnings: number;
	infos: number;
	parse_diagnostics: number;
	rule_diagnostics: number;
	rule_errors: number;
	rule_warnings: number;
	rule_infos: number;
	panics: number;
}

interface BranchRow {
	biome_branch: string;
}

export async function listBiomeBranches(db: D1Database): Promise<string[]> {
	const { results } = await db
		.prepare(
			`SELECT biome_branch
			FROM runs
			GROUP BY biome_branch
			ORDER BY biome_branch = 'main' DESC, MAX(started_at) DESC`,
		)
		.all<BranchRow>();
	return results.map((row) => row.biome_branch);
}

export async function listRecentRuns(
	db: D1Database,
	biomeBranch: string,
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
			WHERE r.biome_branch = ?
			GROUP BY r.github_run_id
			ORDER BY r.started_at DESC
			LIMIT ?`,
		)
		.bind(biomeBranch, Math.min(Math.max(limit, 1), 100))
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

export async function listRepositoryHistory(
	db: D1Database,
	biomeBranch: string,
	limit = 30,
): Promise<HistoryPoint[]> {
	const { results } = await db
		.prepare(
			`SELECT
				r.github_run_id,
				rr.repository_slug,
				rr.check_duration_ns,
				rr.scanner_duration_ns,
				COALESCE(
					SUM(CASE WHEN dc.severity = 'error' AND dc.kind != 'panic' THEN dc.count ELSE 0 END),
					0
				) AS errors,
				COALESCE(SUM(CASE WHEN dc.severity = 'warning' THEN dc.count ELSE 0 END), 0) AS warnings,
				COALESCE(SUM(CASE WHEN dc.severity = 'info' THEN dc.count ELSE 0 END), 0) AS infos,
				COALESCE(SUM(CASE WHEN dc.kind = 'parse' THEN dc.count ELSE 0 END), 0) AS parse_diagnostics,
				COALESCE(SUM(CASE WHEN dc.kind = 'rule' THEN dc.count ELSE 0 END), 0) AS rule_diagnostics,
				COALESCE(SUM(CASE WHEN dc.kind = 'rule' AND dc.severity = 'error' THEN dc.count ELSE 0 END), 0) AS rule_errors,
				COALESCE(SUM(CASE WHEN dc.kind = 'rule' AND dc.severity = 'warning' THEN dc.count ELSE 0 END), 0) AS rule_warnings,
				COALESCE(SUM(CASE WHEN dc.kind = 'rule' AND dc.severity = 'info' THEN dc.count ELSE 0 END), 0) AS rule_infos,
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
		scannerDurationNs: row.scanner_duration_ns,
		errors: row.errors,
		warnings: row.warnings,
		infos: row.infos,
		parseDiagnostics: row.parse_diagnostics,
		ruleDiagnostics: row.rule_diagnostics,
		ruleErrors: row.rule_errors,
		ruleWarnings: row.rule_warnings,
		ruleInfos: row.rule_infos,
		panics: row.panics,
	}));
}
