PRAGMA foreign_keys = ON;

CREATE TABLE runs (
	github_run_id INTEGER PRIMARY KEY,
	run_attempt INTEGER NOT NULL CHECK (run_attempt > 0),
	biome_branch TEXT NOT NULL,
	biome_commit_sha TEXT NOT NULL,
	status TEXT NOT NULL,
	started_at TEXT NOT NULL,
	completed_at TEXT,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE repository_results (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	run_id INTEGER NOT NULL REFERENCES runs(github_run_id) ON DELETE CASCADE,
	repository_slug TEXT NOT NULL,
	repository_commit_sha TEXT NOT NULL,
	migration_outcome TEXT CHECK (
		migration_outcome IN (
			'not_run',
			'failed',
			'succeeded_no_changes',
			'succeeded_with_changes'
		)
	),
	execution_status TEXT NOT NULL CHECK (
		execution_status IN ('pending', 'completed', 'timed_out', 'cancelled', 'error')
	),
	check_outcome TEXT CHECK (check_outcome IN ('passed', 'failed')),
	report_status TEXT NOT NULL CHECK (report_status IN ('available', 'invalid')),
	job_duration_ms INTEGER CHECK (job_duration_ms >= 0),
	check_duration_ns INTEGER CHECK (check_duration_ns >= 0),
	scanner_duration_ns INTEGER CHECK (scanner_duration_ns >= 0),
	raw_report_r2_key TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	UNIQUE (run_id, repository_slug),
	UNIQUE (raw_report_r2_key)
);

CREATE TABLE diagnostic_counts (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	repository_result_id INTEGER NOT NULL REFERENCES repository_results(id) ON DELETE CASCADE,
	kind TEXT NOT NULL CHECK (kind IN ('rule', 'parse', 'panic')),
	severity TEXT NOT NULL,
	category TEXT NOT NULL,
	count INTEGER NOT NULL CHECK (count > 0),
	UNIQUE (repository_result_id, kind, severity, category)
);

CREATE INDEX runs_branch_started_at_idx ON runs(biome_branch, started_at DESC);
CREATE INDEX repository_results_repository_run_idx ON repository_results(repository_slug, run_id);
CREATE INDEX diagnostic_counts_result_idx ON diagnostic_counts(repository_result_id);
