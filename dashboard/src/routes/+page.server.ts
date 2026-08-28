import { error } from "@sveltejs/kit";
import {
	listRecentRuns,
	listRepositoryHistory,
	listRepositoryResults,
	listTopRuleCounts,
} from "$lib/server/runs";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ platform, url }) => {
	if (!platform?.env.DB) error(500, "D1 binding is unavailable");

	const runs = await listRecentRuns(platform.env.DB);
	if (runs.length === 0) {
		return {
			runs,
			selectedRun: null,
			results: [],
			ruleCounts: [],
			history: [],
		};
	}

	const requestedRunId = Number(url.searchParams.get("run"));
	const selectedRun =
		runs.find((run) => run.githubRunId === requestedRunId) ?? runs[0];
	const [results, ruleCounts, history] = await Promise.all([
		listRepositoryResults(platform.env.DB, selectedRun.githubRunId),
		listTopRuleCounts(platform.env.DB, selectedRun.githubRunId),
		listRepositoryHistory(platform.env.DB, selectedRun.biomeBranch),
	]);

	return { runs, selectedRun, results, ruleCounts, history };
};
