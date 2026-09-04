import { error } from "@sveltejs/kit";
import { parseTimingSamples, timingStatsMs } from "$lib/timing";
import type { PageServerLoad } from "./$types";
import type {
	ComparisonRun,
	RepositoryComparison,
	RunObservation,
} from "./types";

interface RunRow {
	github_run_id: number;
	biome_branch: string;
	biome_commit_sha: string;
	started_at: string;
	results: number;
}

interface ObservationRow {
	run_id: number;
	repository_slug: string;
	timing_samples: string | null;
	errors: number;
	warnings: number;
	infos: number;
	parse_diagnostics: number;
	panics: number;
}

function requestedRun(
	runs: ComparisonRun[],
	value: string | null,
): ComparisonRun | undefined {
	if (!value || !/^\d+$/.test(value)) return undefined;
	return runs.find((run) => run.githubRunId === Number(value));
}

function observation(row: ObservationRow): RunObservation {
	const { check, scanner } = timingStatsMs(
		parseTimingSamples(row.timing_samples),
	);
	return {
		check,
		scanner,
		errors: row.errors,
		warnings: row.warnings,
		infos: row.infos,
		parseDiagnostics: row.parse_diagnostics,
		panics: row.panics,
	};
}

export const load: PageServerLoad = async ({ platform, url }) => {
	if (!platform?.env.DB) error(500, "D1 binding is unavailable");

	const { results: runRows } = await platform.env.DB.prepare(
		`SELECT
			r.github_run_id,
			r.biome_branch,
			r.biome_commit_sha,
			r.started_at,
			COUNT(rr.id) AS results
		FROM runs r
		LEFT JOIN repository_results rr ON rr.run_id = r.github_run_id
		GROUP BY r.github_run_id
		ORDER BY r.started_at DESC
		LIMIT 50`,
	).all<RunRow>();

	const runs: ComparisonRun[] = runRows.map((row) => ({
		githubRunId: row.github_run_id,
		biomeBranch: row.biome_branch,
		biomeCommitSha: row.biome_commit_sha,
		startedAt: row.started_at,
		results: row.results,
	}));
	const requestedHead = requestedRun(runs, url.searchParams.get("head"));
	const head = requestedHead ?? runs[0];
	const requestedBase = requestedRun(runs, url.searchParams.get("base"));
	const base =
		requestedBase?.githubRunId === head?.githubRunId
			? runs.find((run) => run.githubRunId !== head.githubRunId)
			: (requestedBase ??
				runs.find((run) => run.githubRunId !== head?.githubRunId));

	if (!base || !head) {
		return { runs, base, head, comparisons: [] };
	}

	const { results: rows } = await platform.env.DB.prepare(
		`SELECT
			rr.run_id,
			rr.repository_slug,
			(
				SELECT json_group_array(json_object(
					'ordinal', cs.ordinal,
					'checkDurationNs', cs.check_duration_ns,
					'scannerDurationNs', cs.scanner_duration_ns
				))
				FROM (
					SELECT ordinal, check_duration_ns, scanner_duration_ns
					FROM check_samples
					WHERE repository_result_id = rr.id
					ORDER BY ordinal
				) AS cs
			) AS timing_samples,
			COALESCE(SUM(CASE WHEN dc.kind = 'rule' AND dc.severity = 'error' THEN dc.count ELSE 0 END), 0) AS errors,
			COALESCE(SUM(CASE WHEN dc.kind = 'rule' AND dc.severity = 'warning' THEN dc.count ELSE 0 END), 0) AS warnings,
			COALESCE(SUM(CASE WHEN dc.kind = 'rule' AND dc.severity = 'info' THEN dc.count ELSE 0 END), 0) AS infos,
			COALESCE(SUM(CASE WHEN dc.kind = 'parse' THEN dc.count ELSE 0 END), 0) AS parse_diagnostics,
			COALESCE(SUM(CASE WHEN dc.kind = 'panic' THEN dc.count ELSE 0 END), 0) AS panics
		FROM repository_results rr
		LEFT JOIN diagnostic_counts dc ON dc.repository_result_id = rr.id
		WHERE rr.run_id IN (?, ?)
		GROUP BY rr.id
		ORDER BY rr.repository_slug`,
	)
		.bind(base.githubRunId, head.githubRunId)
		.all<ObservationRow>();

	const byRepository = new Map<
		string,
		Partial<Pick<RepositoryComparison, "base" | "head">>
	>();
	for (const row of rows) {
		const pair = byRepository.get(row.repository_slug) ?? {};
		if (row.run_id === base.githubRunId) pair.base = observation(row);
		if (row.run_id === head.githubRunId) pair.head = observation(row);
		byRepository.set(row.repository_slug, pair);
	}

	const comparisons: RepositoryComparison[] = [];
	for (const [repositorySlug, pair] of byRepository) {
		if (pair.base && pair.head) {
			comparisons.push({ repositorySlug, base: pair.base, head: pair.head });
		}
	}

	return { runs, base, head, comparisons };
};
