PRAGMA foreign_keys = ON;

CREATE TABLE projects (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	slug TEXT NOT NULL UNIQUE,
	repository_url TEXT NOT NULL,
	default_branch TEXT NOT NULL DEFAULT 'main',
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE runs (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	github_run_id INTEGER NOT NULL UNIQUE,
	trigger TEXT NOT NULL,
	biome_version TEXT NOT NULL,
	commit_sha TEXT NOT NULL,
	started_at TEXT NOT NULL,
	completed_at TEXT,
	status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'passed', 'failed')),
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE project_results (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	run_id INTEGER NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
	project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
	status TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'error', 'recovered')),
	duration_ms INTEGER,
	error_summary TEXT,
	created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
	UNIQUE (run_id, project_id)
);

CREATE INDEX project_results_run_id_idx ON project_results(run_id);
CREATE INDEX project_results_project_id_idx ON project_results(project_id);
CREATE INDEX runs_started_at_idx ON runs(started_at DESC);
