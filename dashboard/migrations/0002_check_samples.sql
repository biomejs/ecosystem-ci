PRAGMA foreign_keys = ON;

-- A repository result's timing is a set of samples, one per repetition of the
-- check within the job. Statistics are computed at read time; no single sample
-- statistic is stored on the result.
CREATE TABLE check_samples (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	repository_result_id INTEGER NOT NULL REFERENCES repository_results(id) ON DELETE CASCADE,
	ordinal INTEGER NOT NULL CHECK (ordinal > 0),
	check_duration_ns INTEGER NOT NULL CHECK (check_duration_ns >= 0),
	scanner_duration_ns INTEGER NOT NULL CHECK (scanner_duration_ns >= 0),
	UNIQUE (repository_result_id, ordinal)
);

CREATE INDEX check_samples_result_idx ON check_samples(repository_result_id);

-- Results stored before sampling existed carry their single observation as sample 1.
INSERT INTO check_samples (repository_result_id, ordinal, check_duration_ns, scanner_duration_ns)
SELECT id, 1, check_duration_ns, scanner_duration_ns
FROM repository_results
WHERE check_duration_ns IS NOT NULL AND scanner_duration_ns IS NOT NULL;

ALTER TABLE repository_results DROP COLUMN check_duration_ns;
ALTER TABLE repository_results DROP COLUMN scanner_duration_ns;
