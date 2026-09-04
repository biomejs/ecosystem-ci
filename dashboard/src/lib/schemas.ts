import * as z from "zod";

const INCOMING_MANIFEST_PATTERN =
	/^incoming\/runs\/(\d+)\/attempts\/(\d+)\/manifest\.json$/;
const REPORT_OBJECT_PATTERN =
	/^runs\/(\d+)\/attempts\/(\d+)\/reports\/(.+)\.json$/;

export const CommitShaSchema = z
	.string()
	.regex(/^[0-9a-f]{40}$/i, "Must be a commit SHA");
export const TimestampSchema = z.iso.datetime({ offset: true });
export const PositiveIntegerSchema = z
	.number()
	.int()
	.positive()
	.max(Number.MAX_SAFE_INTEGER);
const NonNegativeIntegerSchema = z
	.number()
	.int()
	.nonnegative()
	.max(Number.MAX_SAFE_INTEGER);

export const RepositorySlugSchema = z
	.string()
	.regex(
		/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+$/,
		"Must be a full GitHub repository slug",
	);

export const ManifestTargetSchema = z
	.object({
		repositoryCommitSha: CommitShaSchema,
		jobStartedAt: TimestampSchema,
		jobCompletedAt: TimestampSchema,
		migrationOutcome: z.enum([
			"not_run",
			"failed",
			"succeeded_no_changes",
			"succeeded_with_changes",
		]),
		executionStatus: z.enum([
			"pending",
			"completed",
			"timed_out",
			"cancelled",
			"error",
		]),
	})
	.refine(
		(target) =>
			Date.parse(target.jobCompletedAt) >= Date.parse(target.jobStartedAt),
		{
			error: "Target completed before it started",
			path: ["jobCompletedAt"],
		},
	);

export const RunManifestSchema = z
	.object({
		schemaVersion: z.literal(1),
		githubRunId: PositiveIntegerSchema,
		runAttempt: PositiveIntegerSchema,
		biomeBranch: z.string().min(1),
		biomeCommitSha: CommitShaSchema,
		status: z.literal("completed"),
		startedAt: TimestampSchema,
		completedAt: TimestampSchema,
		targets: z.record(RepositorySlugSchema, ManifestTargetSchema),
	})
	.refine(
		(manifest) =>
			Date.parse(manifest.completedAt) >= Date.parse(manifest.startedAt),
		{
			error: "Run completed before it started",
			path: ["completedAt"],
		},
	);

const RawDiagnosticSchema = z.object({
	category: z.string().optional().default("uncategorized"),
	severity: z.string().optional().default("unknown"),
});

export const RawReportSchema = z.object({
	error: z.literal(false).optional(),
	summary: z.object({
		duration: NonNegativeIntegerSchema,
		scannerDuration: NonNegativeIntegerSchema,
		errors: NonNegativeIntegerSchema,
		warnings: NonNegativeIntegerSchema,
	}),
	diagnostics: z.array(RawDiagnosticSchema),
});

export const R2EventNotificationSchema = z.object({
	account: z.string().min(1),
	action: z.enum([
		"PutObject",
		"CopyObject",
		"CompleteMultipartUpload",
		"DeleteObject",
		"LifecycleDeletion",
	]),
	bucket: z.string().min(1),
	object: z.object({
		key: z.string().min(1),
		eTag: z.string().optional(),
		size: NonNegativeIntegerSchema.optional(),
	}),
	eventTime: TimestampSchema,
	copySource: z
		.object({
			bucket: z.string().min(1),
			object: z.string().min(1),
		})
		.optional(),
});

const StringPositiveIntegerSchema = z
	.string()
	.transform(Number)
	.pipe(PositiveIntegerSchema);
const RunAttemptPathPartsSchema = z.object({
	githubRunId: StringPositiveIntegerSchema,
	runAttempt: StringPositiveIntegerSchema,
});

export const IncomingManifestKeySchema = z
	.string()
	.regex(INCOMING_MANIFEST_PATTERN)
	.transform((key) => {
		const match = INCOMING_MANIFEST_PATTERN.exec(key) as RegExpExecArray;
		return { githubRunId: match[1], runAttempt: match[2] };
	})
	.pipe(RunAttemptPathPartsSchema)
	.transform(({ githubRunId, runAttempt }) => {
		const attemptPrefix = `runs/${githubRunId}/attempts/${runAttempt}/`;
		return {
			githubRunId,
			runAttempt,
			canonicalKey: `${attemptPrefix}manifest.json`,
			reportsPrefix: `${attemptPrefix}reports/`,
		};
	});

export const ReportObjectKeySchema = z
	.string()
	.regex(REPORT_OBJECT_PATTERN)
	.transform((key) => {
		const match = REPORT_OBJECT_PATTERN.exec(key) as RegExpExecArray;
		return {
			githubRunId: match[1],
			runAttempt: match[2],
			repositorySlug: match[3],
		};
	})
	.pipe(
		RunAttemptPathPartsSchema.extend({
			repositorySlug: RepositorySlugSchema,
		}),
	)
	.transform(({ githubRunId, runAttempt, repositorySlug }) => ({
		githubRunId,
		runAttempt,
		repositorySlug,
		reportsPrefix: `runs/${githubRunId}/attempts/${runAttempt}/reports/`,
	}));

export type ManifestTarget = z.infer<typeof ManifestTargetSchema>;
export type R2EventNotification = z.infer<typeof R2EventNotificationSchema>;
export type RawReport = z.infer<typeof RawReportSchema>;
export type RunManifest = z.infer<typeof RunManifestSchema>;
