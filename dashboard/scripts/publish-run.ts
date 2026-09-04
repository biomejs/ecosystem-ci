import {
	access,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { z } from "zod";
import {
	CommitShaSchema,
	ManifestTargetSchema,
	PositiveIntegerSchema,
	RawReportSchema,
	RepositorySlugSchema,
	type RunManifest,
	RunManifestSchema,
	TimestampSchema,
} from "../src/lib/schemas.js";

const DEFAULT_UPLOAD_URL = "https://ecosystem-ci-ingest.biomejsdev.workers.dev";

const TargetArtifactSchema = ManifestTargetSchema.safeExtend({
	id: z.string().regex(/^[A-Za-z0-9._-]+$/),
	repositorySlug: RepositorySlugSchema,
});
const TargetArtifactsSchema = z
	.array(TargetArtifactSchema)
	.refine(
		(artifacts) =>
			new Set(artifacts.map((artifact) => artifact.id)).size ===
			artifacts.length,
		{ error: "Target ids must be unique" },
	)
	.refine(
		(artifacts) =>
			new Set(artifacts.map((artifact) => artifact.repositorySlug)).size ===
			artifacts.length,
		{ error: "Repository slugs must be unique" },
	);
const PublishArgumentsSchema = z
	.object({
		"reports-dir": z.string().min(1),
		"metadata-dir": z.string().min(1),
		"run-id": z.coerce.number().pipe(PositiveIntegerSchema),
		"run-attempt": z.coerce.number().pipe(PositiveIntegerSchema),
		"biome-branch": z.string().min(1),
		"biome-commit-sha": CommitShaSchema,
		"started-at": TimestampSchema,
		"completed-at": TimestampSchema,
	})
	.refine(
		(options) =>
			Date.parse(options["completed-at"]) >= Date.parse(options["started-at"]),
		{
			error: "Run completed before it started",
			path: ["completed-at"],
		},
	)
	.transform((options) => ({
		reportsDirectory: resolve(options["reports-dir"]),
		metadataDirectory: resolve(options["metadata-dir"]),
		githubRunId: options["run-id"],
		runAttempt: options["run-attempt"],
		biomeBranch: options["biome-branch"],
		biomeCommitSha: options["biome-commit-sha"],
		startedAt: options["started-at"],
		completedAt: options["completed-at"],
	}));
const RunAttemptKeySchema = z.object({
	githubRunId: PositiveIntegerSchema,
	runAttempt: PositiveIntegerSchema,
});
const ReportObjectKeySchema = RunAttemptKeySchema.extend({
	repositorySlug: RepositorySlugSchema,
});
const UploadConfigurationSchema = z.object({
	ECOSYSTEM_CI_UPLOAD_TOKEN: z.string().min(1),
	ECOSYSTEM_CI_UPLOAD_URL: z.string().url().default(DEFAULT_UPLOAD_URL),
});

export type TargetArtifact = z.infer<typeof TargetArtifactSchema>;
type PublishOptions = z.infer<typeof PublishArgumentsSchema>;

export function parseArguments(arguments_: string[]): PublishOptions {
	const { values } = parseArgs({
		args: arguments_,
		options: {
			"reports-dir": { type: "string" },
			"metadata-dir": { type: "string" },
			"run-id": { type: "string" },
			"run-attempt": { type: "string" },
			"biome-branch": { type: "string" },
			"biome-commit-sha": { type: "string" },
			"started-at": { type: "string" },
			"completed-at": { type: "string" },
		},
		strict: true,
	});
	return PublishArgumentsSchema.parse(values);
}

async function loadTargetArtifacts(
	directory: string,
): Promise<TargetArtifact[]> {
	const entries = (await readdir(directory, { withFileTypes: true }))
		.filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
		.sort((left, right) => left.name.localeCompare(right.name));
	const artifacts = await Promise.all(
		entries.map(async (entry) => {
			const path = join(directory, entry.name);
			return JSON.parse(await readFile(path, "utf8"));
		}),
	);
	return parseTargetArtifacts(artifacts);
}

export function parseTargetArtifacts(value: unknown): TargetArtifact[] {
	return TargetArtifactsSchema.parse(value);
}

export function buildRunManifest(
	options: Omit<PublishOptions, "reportsDirectory" | "metadataDirectory">,
	targetArtifacts: TargetArtifact[],
): RunManifest {
	const parsedTargets = parseTargetArtifacts(targetArtifacts);
	const targets = Object.fromEntries(
		parsedTargets.map((target) => [
			target.repositorySlug,
			{
				repositoryCommitSha: target.repositoryCommitSha,
				jobStartedAt: target.jobStartedAt,
				jobCompletedAt: target.jobCompletedAt,
				migrationOutcome: target.migrationOutcome,
				executionStatus: target.executionStatus,
			},
		]),
	);
	return RunManifestSchema.parse({
		schemaVersion: 1,
		githubRunId: options.githubRunId,
		runAttempt: options.runAttempt,
		biomeBranch: options.biomeBranch,
		biomeCommitSha: options.biomeCommitSha,
		status: "completed",
		startedAt: options.startedAt,
		completedAt: options.completedAt,
		targets,
	});
}

export function reportObjectKey(
	githubRunId: number,
	runAttempt: number,
	repositorySlug: string,
): string {
	const parsed = ReportObjectKeySchema.parse({
		githubRunId,
		runAttempt,
		repositorySlug,
	});
	return `runs/${parsed.githubRunId}/attempts/${parsed.runAttempt}/reports/${parsed.repositorySlug}.json`;
}

export function incomingManifestKey(
	githubRunId: number,
	runAttempt: number,
): string {
	const parsed = RunAttemptKeySchema.parse({ githubRunId, runAttempt });
	return `incoming/runs/${parsed.githubRunId}/attempts/${parsed.runAttempt}/manifest.json`;
}

async function uploadJson(path: string, key: string): Promise<void> {
	const configuration = UploadConfigurationSchema.parse(process.env);
	const baseUrl = configuration.ECOSYSTEM_CI_UPLOAD_URL.replace(/\/$/, "");
	const response = await fetch(`${baseUrl}/upload/${key}`, {
		method: "PUT",
		headers: {
			Authorization: `Bearer ${configuration.ECOSYSTEM_CI_UPLOAD_TOKEN}`,
			"Content-Type": "application/json",
		},
		body: await readFile(path),
	});
	if (!response.ok) {
		throw new Error(
			`Upload failed for ${key}: ${response.status} ${await response.text()}`,
		);
	}
}

async function mapLimit<T>(
	values: T[],
	limit: number,
	callback: (value: T) => Promise<void>,
): Promise<void> {
	let index = 0;
	async function worker(): Promise<void> {
		while (index < values.length) {
			const value = values[index];
			index += 1;
			await callback(value);
		}
	}
	await Promise.all(
		Array.from({ length: Math.min(limit, values.length) }, () => worker()),
	);
}

export async function publishRun(options: PublishOptions): Promise<number> {
	const targetArtifacts = await loadTargetArtifacts(options.metadataDirectory);
	const reports: Array<{ target: TargetArtifact; path: string }> = [];
	for (const target of targetArtifacts) {
		const path = join(
			options.reportsDirectory,
			`biome-report-${target.id}.json`,
		);
		try {
			await access(path);
		} catch {
			continue;
		}
		let value: unknown;
		try {
			value = JSON.parse(await readFile(path, "utf8"));
		} catch {
			continue;
		}
		if (!RawReportSchema.safeParse(value).success) continue;
		reports.push({ target, path });
	}
	if (reports.length === 0) {
		console.info("No valid reports were produced; nothing will be published.");
		return 0;
	}
	await mapLimit(reports, 6, async ({ target, path }) => {
		const key = reportObjectKey(
			options.githubRunId,
			options.runAttempt,
			target.repositorySlug,
		);
		console.info(`Uploading ${basename(path)} to ${key}`);
		await uploadJson(path, key);
	});

	const manifest = buildRunManifest(options, targetArtifacts);
	const temporaryDirectory = await mkdtemp(
		join(tmpdir(), "biome-ecosystem-ci-publish-"),
	);
	try {
		const manifestPath = join(temporaryDirectory, "manifest.json");
		await writeFile(manifestPath, `${JSON.stringify(manifest, null, "\t")}\n`);
		const key = incomingManifestKey(options.githubRunId, options.runAttempt);
		console.info(`Publishing run manifest to ${key}`);
		await uploadJson(manifestPath, key);
	} finally {
		await rm(temporaryDirectory, { recursive: true, force: true });
	}
	console.info(
		`Published run ${options.githubRunId} attempt ${options.runAttempt} with ${reports.length} reports.`,
	);
	return reports.length;
}

const isMainModule =
	process.argv[1] !== undefined &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
	publishRun(parseArguments(process.argv.slice(2))).catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
