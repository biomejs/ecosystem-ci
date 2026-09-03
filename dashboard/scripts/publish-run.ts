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
import {
	isRepositorySlug,
	parseRawReport,
	parseRunManifest,
	type RunManifest,
} from "../src/lib/ingest.js";

const TARGET_ID_PATTERN = /^[A-Za-z0-9._-]+$/;
const DEFAULT_UPLOAD_URL = "https://ecosystem-ci-ingest.biomejsdev.workers.dev";

export interface TargetArtifact {
	id: string;
	repositorySlug: string;
	repositoryCommitSha: string;
	jobStartedAt: string;
	jobCompletedAt: string;
	migrationOutcome: string;
	executionStatus: string;
}

interface PublishOptions {
	reportsDirectory: string;
	metadataDirectory: string;
	githubRunId: number;
	runAttempt: number;
	biomeBranch: string;
	biomeCommitSha: string;
	startedAt: string;
	completedAt: string;
}

function requiredString(value: string | undefined, option: string): string {
	if (!value) throw new Error(`Missing required option --${option}`);
	return value;
}

function positiveInteger(value: string | undefined, option: string): number {
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed <= 0) {
		throw new Error(`Option --${option} must be a positive integer`);
	}
	return parsed;
}

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
	return {
		reportsDirectory: resolve(
			requiredString(values["reports-dir"], "reports-dir"),
		),
		metadataDirectory: resolve(
			requiredString(values["metadata-dir"], "metadata-dir"),
		),
		githubRunId: positiveInteger(values["run-id"], "run-id"),
		runAttempt: positiveInteger(values["run-attempt"], "run-attempt"),
		biomeBranch: requiredString(values["biome-branch"], "biome-branch"),
		biomeCommitSha: requiredString(
			values["biome-commit-sha"],
			"biome-commit-sha",
		),
		startedAt: requiredString(values["started-at"], "started-at"),
		completedAt: requiredString(values["completed-at"], "completed-at"),
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTargetArtifact(value: unknown, filename: string): TargetArtifact {
	if (!isRecord(value)) throw new Error(`${filename} must contain an object`);
	const fields = [
		"id",
		"repositorySlug",
		"repositoryCommitSha",
		"jobStartedAt",
		"jobCompletedAt",
		"migrationOutcome",
		"executionStatus",
	] as const;
	for (const field of fields) {
		if (typeof value[field] !== "string" || value[field].length === 0) {
			throw new Error(`${filename} field ${field} must be a non-empty string`);
		}
	}
	const artifact = value as unknown as TargetArtifact;
	if (!TARGET_ID_PATTERN.test(artifact.id)) {
		throw new Error(`${filename} has an invalid target id`);
	}
	if (!isRepositorySlug(artifact.repositorySlug)) {
		throw new Error(`${filename} has an invalid repository slug`);
	}
	return artifact;
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
			return parseTargetArtifact(
				JSON.parse(await readFile(path, "utf8")),
				entry.name,
			);
		}),
	);
	const ids = new Set<string>();
	const slugs = new Set<string>();
	for (const artifact of artifacts) {
		if (ids.has(artifact.id)) {
			throw new Error(`Duplicate target id: ${artifact.id}`);
		}
		if (slugs.has(artifact.repositorySlug)) {
			throw new Error(`Duplicate repository slug: ${artifact.repositorySlug}`);
		}
		ids.add(artifact.id);
		slugs.add(artifact.repositorySlug);
	}
	return artifacts;
}

export function buildRunManifest(
	options: Omit<PublishOptions, "reportsDirectory" | "metadataDirectory">,
	targetArtifacts: TargetArtifact[],
): RunManifest {
	const targets = Object.fromEntries(
		targetArtifacts.map((target) => [
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
	return parseRunManifest({
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
	if (!isRepositorySlug(repositorySlug)) {
		throw new Error(`Invalid repository slug: ${repositorySlug}`);
	}
	return `runs/${githubRunId}/attempts/${runAttempt}/reports/${repositorySlug}.json`;
}

export function incomingManifestKey(
	githubRunId: number,
	runAttempt: number,
): string {
	return `incoming/runs/${githubRunId}/attempts/${runAttempt}/manifest.json`;
}

async function uploadJson(path: string, key: string): Promise<void> {
	const token = process.env.ECOSYSTEM_CI_UPLOAD_TOKEN;
	if (!token) throw new Error("ECOSYSTEM_CI_UPLOAD_TOKEN is not set");
	const baseUrl = process.env.ECOSYSTEM_CI_UPLOAD_URL ?? DEFAULT_UPLOAD_URL;
	const response = await fetch(`${baseUrl.replace(/\/$/, "")}/upload/${key}`, {
		method: "PUT",
		headers: {
			Authorization: `Bearer ${token}`,
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
		if (!parseRawReport(value)) continue;
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
