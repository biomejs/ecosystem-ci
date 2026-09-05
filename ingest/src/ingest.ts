import * as z from "zod";
import {
	IncomingManifestKeySchema,
	type ManifestTarget,
	type R2EventNotification,
	R2EventNotificationSchema,
	type RawReport,
	RawReportSchema,
	ReportObjectKeySchema,
	RepositorySlugSchema,
	type RunManifest,
	RunManifestSchema,
	type TimingSample,
} from "./schemas.js";

export const INGEST_QUEUE_NAME = "ecosystem-ci-ingest";
export const REPORTS_BUCKET_NAME = "biome-ecosystem-ci-reports";

export type {
	ManifestTarget,
	R2EventNotification,
	RawReport,
	RunManifest,
	TimingSample,
};

interface ReportRow {
	repositorySlug: string;
	repositoryCommitSha: string;
	migrationOutcome: ManifestTarget["migrationOutcome"];
	executionStatus: ManifestTarget["executionStatus"];
	checkOutcome: "passed" | "failed";
	jobDurationMs: number;
	rawReportR2Key: string;
}

interface TimingSampleRow extends TimingSample {
	repositorySlug: string;
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

export function parseRunManifest(value: unknown): RunManifest {
	return RunManifestSchema.parse(value);
}

export function parseRawReport(value: unknown): RawReport | null {
	const result = RawReportSchema.safeParse(value);
	return result.success ? result.data : null;
}

export function parseR2EventNotification(value: unknown): R2EventNotification {
	return R2EventNotificationSchema.parse(value);
}

export function parseIncomingManifestKey(key: string): {
	githubRunId: number;
	runAttempt: number;
	canonicalKey: string;
	reportsPrefix: string;
} | null {
	const result = IncomingManifestKeySchema.safeParse(key);
	return result.success ? result.data : null;
}

export function parseReportObjectKey(key: string): {
	githubRunId: number;
	runAttempt: number;
	repositorySlug: string;
	reportsPrefix: string;
} | null {
	const result = ReportObjectKeySchema.safeParse(key);
	return result.success ? result.data : null;
}

export function repositorySlugFromReportKey(
	reportsPrefix: string,
	key: string,
): string | null {
	const schema = z
		.string()
		.startsWith(reportsPrefix)
		.endsWith(".json")
		.transform((value) => value.slice(reportsPrefix.length, -".json".length))
		.pipe(RepositorySlugSchema);
	const result = schema.safeParse(key);
	return result.success ? result.data : null;
}

function diagnosticKind(category: string): "rule" | "parse" | "panic" {
	if (category === "parse") return "parse";
	if (category === "internalError/panic") return "panic";
	return "rule";
}

/**
 * The manifest's samples are authoritative. A target without samples (schema
 * version 1) contributes the report's own summary as its single sample.
 */
export function timingSamplesFor(
	repositorySlug: string,
	target: ManifestTarget,
	report: RawReport,
): TimingSample[] {
	const samples = target.timingSamples ?? [];
	if (samples.length === 0) {
		return [
			{
				ordinal: 1,
				checkDurationNs: report.summary.duration,
				scannerDurationNs: report.summary.scannerDuration,
			},
		];
	}
	const matchesReport = samples.some(
		(sample) =>
			sample.checkDurationNs === report.summary.duration &&
			sample.scannerDurationNs === report.summary.scannerDuration,
	);
	if (!matchesReport) {
		console.warn(
			`Timing samples for ${repositorySlug} do not include the raw report's own summary`,
		);
	}
	return samples.toSorted((a, b) => a.ordinal - b.ordinal);
}

export function summarizeReport(
	repositorySlug: string,
	target: ManifestTarget,
	report: RawReport,
	rawReportR2Key: string,
): {
	report: ReportRow;
	samples: TimingSampleRow[];
	diagnostics: DiagnosticCountRow[];
} {
	const counts = new Map<string, DiagnosticCountRow>();
	for (const diagnostic of report.diagnostics) {
		const { category, severity } = diagnostic;
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
			rawReportR2Key,
		},
		samples: timingSamplesFor(repositorySlug, target, report).map((sample) => ({
			repositorySlug,
			...sample,
		})),
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
): Promise<{
	reports: ReportRow[];
	samples: TimingSampleRow[];
	diagnostics: DiagnosticCountRow[];
}> {
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
		samples: valid.flatMap((value) => value.samples),
		diagnostics: valid.flatMap((value) => value.diagnostics),
	};
}

async function replaceD1Projection(
	db: D1Database,
	manifest: RunManifest,
	reports: ReportRow[],
	samples: TimingSampleRow[],
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
		raw_report_r2_key
	)
	SELECT ?,
		json_extract(item.value, '$.repositorySlug'),
		json_extract(item.value, '$.repositoryCommitSha'),
		json_extract(item.value, '$.migrationOutcome'),
		json_extract(item.value, '$.executionStatus'),
		json_extract(item.value, '$.checkOutcome'),
		'available',
		json_extract(item.value, '$.jobDurationMs'),
		json_extract(item.value, '$.rawReportR2Key')
	FROM json_each(?) AS item
	WHERE (SELECT run_attempt FROM runs WHERE github_run_id = ?) = ?`)
		.bind(
			manifest.githubRunId,
			JSON.stringify(reports),
			manifest.githubRunId,
			manifest.runAttempt,
		);
	const insertSamples = db
		.prepare(`INSERT INTO check_samples (
		repository_result_id, ordinal, check_duration_ns, scanner_duration_ns
	)
	SELECT repository_results.id,
		json_extract(item.value, '$.ordinal'),
		json_extract(item.value, '$.checkDurationNs'),
		json_extract(item.value, '$.scannerDurationNs')
	FROM json_each(?) AS item
	JOIN repository_results
		ON repository_results.run_id = ?
		AND repository_results.repository_slug = json_extract(item.value, '$.repositorySlug')
	WHERE (SELECT run_attempt FROM runs WHERE github_run_id = ?) = ?`)
		.bind(
			JSON.stringify(samples),
			manifest.githubRunId,
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
		insertSamples,
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
	const { reports, samples, diagnostics } = await loadReportRows(
		env.REPORTS,
		manifest,
		location.reportsPrefix,
	);
	await replaceD1Projection(env.DB, manifest, reports, samples, diagnostics);
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
		(event.action !== "PutObject" &&
			event.action !== "CopyObject" &&
			event.action !== "CompleteMultipartUpload")
	) {
		return { status: "ignored", reportCount: 0 };
	}
	return ingestManifestObject(event.object.key, env);
}
