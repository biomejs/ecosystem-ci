import { error } from "@sveltejs/kit";
import { listRecentRuns, listRepositoryHistory } from "$lib/server/runs";
import type { PageServerLoad } from "./$types";

const RUN_LIMIT = 30;

export const load: PageServerLoad = async ({ platform }) => {
	if (!platform?.env.DB) error(500, "D1 binding is unavailable");

	const runs = await listRecentRuns(platform.env.DB, RUN_LIMIT);
	if (runs.length === 0) return { runs, history: [] };

	const history = await listRepositoryHistory(
		platform.env.DB,
		runs[0].biomeBranch,
		RUN_LIMIT,
	);
	return { runs, history };
};
