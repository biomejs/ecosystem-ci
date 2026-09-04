export interface ComparisonRun {
	githubRunId: number;
	biomeBranch: string;
	biomeCommitSha: string;
	startedAt: string;
	results: number;
}

import type { TimingStats } from "$lib/timing";

export interface RunObservation {
	/** statistics over the run's timing samples, in milliseconds; null without samples */
	check: TimingStats | null;
	scanner: TimingStats | null;
	errors: number;
	warnings: number;
	infos: number;
	parseDiagnostics: number;
	panics: number;
}

export interface RepositoryComparison {
	repositorySlug: string;
	base: RunObservation;
	head: RunObservation;
}
