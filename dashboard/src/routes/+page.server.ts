import { error } from "@sveltejs/kit";
import { selectBiomeBranch } from "$lib/branches";
import {
	listBiomeBranches,
	listRecentRuns,
	listRepositoryHistory,
} from "$lib/server/runs";
import type { PageServerLoad } from "./$types";

const RUN_LIMIT = 30;

export const load: PageServerLoad = async ({ platform, url }) => {
	if (!platform?.env.DB) error(500, "D1 binding is unavailable");

	const branches = await listBiomeBranches(platform.env.DB);
	const branch = selectBiomeBranch(branches, url.searchParams.get("branch"));
	if (!branch) return { runs: [], history: [], branches, branch };

	const [runs, history] = await Promise.all([
		listRecentRuns(platform.env.DB, branch, RUN_LIMIT),
		listRepositoryHistory(platform.env.DB, branch, RUN_LIMIT),
	]);
	return { runs, history, branches, branch };
};
