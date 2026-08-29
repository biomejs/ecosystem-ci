export interface ComparisonRun {
	githubRunId: number;
	biomeBranch: string;
	biomeCommitSha: string;
	startedAt: string;
	results: number;
}

export interface RunObservation {
	checkMs: number | null;
	scannerMs: number | null;
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
