export const INGEST_QUEUE_NAME = "ecosystem-ci-ingest";
export const REPORTS_BUCKET_NAME = "biome-ecosystem-ci-reports";

const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const INCOMING_MANIFEST_PATTERN =
	/^incoming\/runs\/(\d+)\/attempts\/(\d+)\/manifest\.json$/;

const MIGRATION_OUTCOMES = new Set([
	"not_run",
	"failed",
	"succeeded_no_changes",
	"succeeded_with_changes",
]);
const EXECUTION_STATUSES = new Set([
	"pending",
	"completed",
	"timed_out",
	"cancelled",
	"error",
]);

export interface ManifestTarget {
	repositoryCommitSha: string;
	jobStartedAt: string;
	jobCompletedAt: string;
	migrationOutcome:
		| "not_run"
		| "failed"
		| "succeeded_no_changes"
		| "succeeded_with_changes";
	executionStatus:
		| "pending"
		| "completed"
		| "timed_out"
		| "cancelled"
		| "error";
}

export interface RunManifest {
	schemaVersion: 1;
	githubRunId: number;
	runAttempt: number;
	biomeBranch: string;
	biomeCommitSha: string;
	status: "completed";
	startedAt: string;
	completedAt: string;
	targets: Record<string, ManifestTarget>;
}

export interface R2EventNotification {
	action: string;
	bucket: string;
	object: {
		key: string;
		eTag?: string;
		size?: number;
	};
	eventTime: string;
}

interface RawReport {
	summary: {
		duration: number;
		scannerDuration: number;
		errors: number;
		warnings: number;
	};
	diagnostics: Array<{
		category?: unknown;
		severity?: unknown;
	}>;
}

interface ReportRow {
	repositorySlug: string;
	repositoryCommitSha: string;
	migrationOutcome: ManifestTarget["migrationOutcome"];
	executionStatus: ManifestTarget["executionStatus"];
	checkOutcome: "passed" | "failed";
	jobDurationMs: number;
	checkDurationNs: number;
	scannerDurationNs: number;
	rawReportR2Key: string;
}

interface DiagnosticCountRow {
	repositorySlug: string;
	kind: "rule" | "parse" | "panic";
	severity: string;
	category: string;
	count: number;
}

interface IngestResult {
	status: "ingested" | "already_promoted" | "ignored";
	reportCount: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(record: Record<string, unknown>, key: string): string {
	const value = record[key];
	if (typeof value !== "string" || value.length === 0) {
		throw new Error(`Manifest field ${key} must be a non-empty string`);
	}
	return value;
}

function requirePositiveInteger(
	record: Record<string, unknown>,
	key: string,
): number {
	const value = record[key];
	if (!Number.isSafeInteger(value) || (value as number) <= 0) {
		throw new Error(`Manifest field ${key} must be a positive integer`);
	}
	return value as number;
}

function requireTimestamp(
	record: Record<string, unknown>,
	key: string,
): string {
	const value = requireString(record, key);
	if (!Number.isFinite(Date.parse(value))) {
		throw new Error(`Manifest field ${key} must be an ISO timestamp`);
	}
	return value;
}

export function isRepositorySlug(value: string): boolean {
	return /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+$/.test(value);
}

function parseManifestTarget(value: unknown, slug: string): ManifestTarget {
	if (!isRecord(value)) {
		throw new Error(`Manifest target ${slug} must be an object`);
	}
	const repositoryCommitSha = requireString(value, "repositoryCommitSha");
	if (!SHA_PATTERN.test(repositoryCommitSha)) {
		throw new Error(`Manifest target ${slug} has an invalid commit SHA`);
	}
	const jobStartedAt = requireTimestamp(value, "jobStartedAt");
	const jobCompletedAt = requireTimestamp(value, "jobCompletedAt");
	if (Date.parse(jobCompletedAt) < Date.parse(jobStartedAt)) {
		throw new Error(`Manifest target ${slug} completed before it started`);
	}
	const migrationOutcome = requireString(value, "migrationOutcome");
	if (!MIGRATION_OUTCOMES.has(migrationOutcome)) {
		throw new Error(`Manifest target ${slug} has an invalid migration outcome`);
	}
	const executionStatus = requireString(value, "executionStatus");
	if (!EXECUTION_STATUSES.has(executionStatus)) {
		throw new Error(`Manifest target ${slug} has an invalid execution status`);
	}
	return {
		repositoryCommitSha,
		jobStartedAt,
		jobCompletedAt,
		migrationOutcome: migrationOutcome as ManifestTarget["migrationOutcome"],
		executionStatus: executionStatus as ManifestTarget["executionStatus"],
	};
}

export function parseRunManifest(value: unknown): RunManifest {
	if (!isRecord(value)) throw new Error("Run manifest must be an object");
	if (value.schemaVersion !== 1) {
		throw new Error("Run manifest schemaVersion must be 1");
	}
	const githubRunId = requirePositiveInteger(value, "githubRunId");
	const runAttempt = requirePositiveInteger(value, "runAttempt");
	const biomeBranch = requireString(value, "biomeBranch");
	const biomeCommitSha = requireString(value, "biomeCommitSha");
	if (!SHA_PATTERN.test(biomeCommitSha)) {
		throw new Error("Manifest field biomeCommitSha must be a commit SHA");
	}
	if (value.status !== "completed") {
		throw new Error("Manifest field status must be completed");
	}
	const startedAt = requireTimestamp(value, "startedAt");
	const completedAt = requireTimestamp(value, "completedAt");
	if (Date.parse(completedAt) < Date.parse(startedAt)) {
		throw new Error("Run completed before it started");
	}
	if (!isRecord(value.targets)) {
		throw new Error("Manifest field targets must be an object");
	}
	const targets: Record<string, ManifestTarget> = {};
	for (const [slug, target] of Object.entries(value.targets)) {
		if (!isRepositorySlug(slug)) {
			throw new Error(`Manifest target key ${slug} is not a repository slug`);
		}
		targets[slug] = parseManifestTarget(target, slug);
	}
	return {
		schemaVersion: 1,
		githubRunId,
		runAttempt,
		biomeBranch,
		biomeCommitSha,
		status: "completed",
		startedAt,
		completedAt,
		targets,
	};
}

function nonNegativeInteger(value: unknown): value is number {
	return Number.isSafeInteger(value) && (value as number) >= 0;
}

export function parseRawReport(value: unknown): RawReport | null {
	if (!isRecord(value) || value.error === true || !isRecord(value.summary)) {
		return null;
	}
	const { duration, scannerDuration, errors, warnings } = value.summary;
	if (
		!nonNegativeInteger(duration) ||
		!nonNegativeInteger(scannerDuration) ||
		!nonNegativeInteger(errors) ||
		!nonNegativeInteger(warnings) ||
		!Array.isArray(value.diagnostics)
	) {
		return null;
	}
	return {
		summary: { duration, scannerDuration, errors, warnings },
		diagnostics: value.diagnostics.filter(isRecord),
	};
}

export function parseIncomingManifestKey(key: string): {
	githubRunId: number;
	runAttempt: number;
	canonicalKey: string;
	reportsPrefix: string;
} | null {
	const match = key.match(INCOMING_MANIFEST_PATTERN);
	if (!match) return null;
	const githubRunId = Number(match[1]);
	const runAttempt = Number(match[2]);
	if (!Number.isSafeInteger(githubRunId) || !Number.isSafeInteger(runAttempt)) {
		return null;
	}
	const attemptPrefix = `runs/${githubRunId}/attempts/${runAttempt}/`;
	return {
		githubRunId,
		runAttempt,
		canonicalKey: `${attemptPrefix}manifest.json`,
		reportsPrefix: `${attemptPrefix}reports/`,
	};
}

export function repositorySlugFromReportKey(
	reportsPrefix: string,
	key: string,
): string | null {
	if (!key.startsWith(reportsPrefix) || !key.endsWith(".json")) return null;
	const slug = key.slice(reportsPrefix.length, -".json".length);
	return isRepositorySlug(slug) ? slug : null;
}

function diagnosticKind(category: string): "rule" | "parse" | "panic" {
	if (category === "parse") return "parse";
	if (category === "internalError/panic") return "panic";
	return "rule";
}

export function summarizeReport(
	repositorySlug: string,
	target: ManifestTarget,
	report: RawReport,
	rawReportR2Key: string,
): { report: ReportRow; diagnostics: DiagnosticCountRow[] } {
	const counts = new Map<string, DiagnosticCountRow>();
	for (const diagnostic of report.diagnostics) {
		const category =
			typeof diagnostic.category === "string"
				? diagnostic.category
				: "uncategorized";
		const severity =
			typeof diagnostic.severity === "string" ? diagnostic.severity : "unknown";
		const kind = diagnosticKind(category);
		const key = JSON.stringify([kind, severity, category]);
		const existing = counts.get(key);
		if (existing) {
			existing.count += 1;
		} else {
			counts.set(key, {
				repositorySlug,
				kind,
				severity,
				category,
				count: 1,
			});
		}
	}
	return {
		report: {
			repositorySlug,
			repositoryCommitSha: target.repositoryCommitSha,
			migrationOutcome: target.migrationOutcome,
			executionStatus: target.executionStatus,
			checkOutcome:
				report.summary.errors > 0 || report.summary.warnings > 0
					? "failed"
					: "passed",
			jobDurationMs:
				Date.parse(target.jobCompletedAt) - Date.parse(target.jobStartedAt),
			checkDurationNs: report.summary.duration,
			scannerDurationNs: report.summary.scannerDuration,
			rawReportR2Key,
		},
		diagnostics: [...counts.values()],
	};
}

async function listReportObjects(
	bucket: R2Bucket,
	prefix: string,
): Promise<R2Object[]> {
	const objects: R2Object[] = [];
	let cursor: string | undefined;
	do {
		const page = await bucket.list({ prefix, cursor });
		objects.push(...page.objects);
		cursor = page.truncated ? page.cursor : undefined;
	} while (cursor !== undefined);
	return objects;
}

async function loadReportRows(
	bucket: R2Bucket,
	manifest: RunManifest,
	reportsPrefix: string,
): Promise<{ reports: ReportRow[]; diagnostics: DiagnosticCountRow[] }> {
	const objects = await listReportObjects(bucket, reportsPrefix);
	const summaries = await Promise.all(
		objects.map(async (object) => {
			const repositorySlug = repositorySlugFromReportKey(
				reportsPrefix,
				object.key,
			);
			if (!repositorySlug) return null;
			const target = manifest.targets[repositorySlug];
			if (!target) {
				console.warn(`Ignoring report without target metadata: ${object.key}`);
				return null;
			}
			const reportObject = await bucket.get(object.key);
			if (!reportObject) return null;
			let value: unknown;
			try {
				value = JSON.parse(await reportObject.text());
			} catch {
				console.warn(`Ignoring malformed report: ${object.key}`);
				return null;
			}
			const report = parseRawReport(value);
			if (!report) {
				console.warn(`Ignoring invalid report: ${object.key}`);
				return null;
			}
			return summarizeReport(repositorySlug, target, report, object.key);
		}),
	);
	const valid = summaries.filter((value) => value !== null);
	return {
		reports: valid.map((value) => value.report),
		diagnostics: valid.flatMap((value) => value.diagnostics),
	};
}

async function replaceD1Projection(
	db: D1Database,
	manifest: RunManifest,
	reports: ReportRow[],
	diagnostics: DiagnosticCountRow[],
): Promise<void> {
	const run = db
		.prepare(`INSERT INTO runs (
		github_run_id, run_attempt, biome_branch, biome_commit_sha,
		status, started_at, completed_at
	) VALUES (?, ?, ?, ?, ?, ?, ?)
	ON CONFLICT(github_run_id) DO UPDATE SET
		run_attempt = excluded.run_attempt,
		biome_branch = excluded.biome_branch,
		biome_commit_sha = excluded.biome_commit_sha,
		status = excluded.status,
		started_at = excluded.started_at,
		completed_at = excluded.completed_at,
		updated_at = CURRENT_TIMESTAMP
	WHERE excluded.run_attempt > runs.run_attempt`)
		.bind(
			manifest.githubRunId,
			manifest.runAttempt,
			manifest.biomeBranch,
			manifest.biomeCommitSha,
			manifest.status,
			manifest.startedAt,
			manifest.completedAt,
		);
	const clearResults = db
		.prepare(`DELETE FROM repository_results
	WHERE run_id = ?
		AND (SELECT run_attempt FROM runs WHERE github_run_id = ?) = ?`)
		.bind(manifest.githubRunId, manifest.githubRunId, manifest.runAttempt);
	const insertResults = db
		.prepare(`INSERT INTO repository_results (
		run_id, repository_slug, repository_commit_sha, migration_outcome,
		execution_status, check_outcome, report_status, job_duration_ms,
		check_duration_ns, scanner_duration_ns, raw_report_r2_key
	)
	SELECT ?,
		json_extract(item.value, '$.repositorySlug'),
		json_extract(item.value, '$.repositoryCommitSha'),
		json_extract(item.value, '$.migrationOutcome'),
		json_extract(item.value, '$.executionStatus'),
		json_extract(item.value, '$.checkOutcome'),
		'available',
		json_extract(item.value, '$.jobDurationMs'),
		json_extract(item.value, '$.checkDurationNs'),
		json_extract(item.value, '$.scannerDurationNs'),
		json_extract(item.value, '$.rawReportR2Key')
	FROM json_each(?) AS item
	WHERE (SELECT run_attempt FROM runs WHERE github_run_id = ?) = ?`)
		.bind(
			manifest.githubRunId,
			JSON.stringify(reports),
			manifest.githubRunId,
			manifest.runAttempt,
		);
	const insertDiagnostics = db
		.prepare(`INSERT INTO diagnostic_counts (
		repository_result_id, kind, severity, category, count
	)
	SELECT repository_results.id,
		json_extract(item.value, '$.kind'),
		json_extract(item.value, '$.severity'),
		json_extract(item.value, '$.category'),
		json_extract(item.value, '$.count')
	FROM json_each(?) AS item
	JOIN repository_results
		ON repository_results.run_id = ?
		AND repository_results.repository_slug = json_extract(item.value, '$.repositorySlug')
	WHERE (SELECT run_attempt FROM runs WHERE github_run_id = ?) = ?`)
		.bind(
			JSON.stringify(diagnostics),
			manifest.githubRunId,
			manifest.githubRunId,
			manifest.runAttempt,
		);
	const results = await db.batch([
		run,
		clearResults,
		insertResults,
		insertDiagnostics,
	]);
	if (results.some((result) => !result.success)) {
		throw new Error("D1 rejected the run projection");
	}
}

export async function ingestManifestObject(
	incomingKey: string,
	env: CloudflareEnv,
): Promise<IngestResult> {
	const location = parseIncomingManifestKey(incomingKey);
	if (!location) return { status: "ignored", reportCount: 0 };
	const incomingObject = await env.REPORTS.get(incomingKey);
	if (!incomingObject) {
		if (await env.REPORTS.head(location.canonicalKey)) {
			return { status: "already_promoted", reportCount: 0 };
		}
		throw new Error(`Manifest is missing: ${incomingKey}`);
	}
	const bytes = await incomingObject.arrayBuffer();
	let value: unknown;
	try {
		value = JSON.parse(new TextDecoder().decode(bytes));
	} catch {
		throw new Error(`Manifest is not valid JSON: ${incomingKey}`);
	}
	const manifest = parseRunManifest(value);
	if (
		manifest.githubRunId !== location.githubRunId ||
		manifest.runAttempt !== location.runAttempt
	) {
		throw new Error(
			`Manifest identity does not match its R2 key: ${incomingKey}`,
		);
	}
	const { reports, diagnostics } = await loadReportRows(
		env.REPORTS,
		manifest,
		location.reportsPrefix,
	);
	await replaceD1Projection(env.DB, manifest, reports, diagnostics);
	await env.REPORTS.put(location.canonicalKey, bytes, {
		httpMetadata: incomingObject.httpMetadata,
		customMetadata: incomingObject.customMetadata,
	});
	await env.REPORTS.delete(incomingKey);
	return { status: "ingested", reportCount: reports.length };
}

export async function handleR2Event(
	event: R2EventNotification,
	env: CloudflareEnv,
): Promise<IngestResult> {
	if (
		event.bucket !== REPORTS_BUCKET_NAME ||
		(event.action !== "PutObject" && event.action !== "CopyObject")
	) {
		return { status: "ignored", reportCount: 0 };
	}
	return ingestManifestObject(event.object.key, env);
}
