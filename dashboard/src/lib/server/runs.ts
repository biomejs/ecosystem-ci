export type RunStatus = 'queued' | 'running' | 'passed' | 'failed';

export interface RunSummary {
	id: number;
	githubRunId: number;
	trigger: string;
	biomeVersion: string;
	commitSha: string;
	startedAt: string;
	completedAt: string | null;
	status: RunStatus;
	passed: number;
	failed: number;
	errors: number;
}

interface RunRow {
	id: number;
	github_run_id: number;
	trigger: string;
	biome_version: string;
	commit_sha: string;
	started_at: string;
	completed_at: string | null;
	status: RunStatus;
	passed: number;
	failed: number;
	errors: number;
}

export async function listRecentRuns(db: D1Database, limit = 20): Promise<RunSummary[]> {
	const { results } = await db
		.prepare(
			`SELECT
				r.id,
				r.github_run_id,
				r.trigger,
				r.biome_version,
				r.commit_sha,
				r.started_at,
				r.completed_at,
				r.status,
				SUM(CASE WHEN pr.status IN ('passed', 'recovered') THEN 1 ELSE 0 END) AS passed,
				SUM(CASE WHEN pr.status = 'failed' THEN 1 ELSE 0 END) AS failed,
				SUM(CASE WHEN pr.status = 'error' THEN 1 ELSE 0 END) AS errors
			FROM runs r
			LEFT JOIN project_results pr ON pr.run_id = r.id
			GROUP BY r.id
			ORDER BY r.started_at DESC
			LIMIT ?`
		)
		.bind(Math.min(Math.max(limit, 1), 100))
		.all<RunRow>();

	return results.map((row) => ({
		id: row.id,
		githubRunId: row.github_run_id,
		trigger: row.trigger,
		biomeVersion: row.biome_version,
		commitSha: row.commit_sha,
		startedAt: row.started_at,
		completedAt: row.completed_at,
		status: row.status,
		passed: row.passed,
		failed: row.failed,
		errors: row.errors
	}));
}
