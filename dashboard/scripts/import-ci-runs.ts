import { spawn } from "node:child_process";
import {
	copyFile,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
	RepositorySlugSchema,
	type RunManifest,
	RunManifestSchema,
} from "@biomejs/ecosystem-ci-ingest/schemas";
import {
	installRunDirectory,
	latestLocalRuns,
	loadLocalRuns,
	runsDirectory,
} from "./local-reports.js";
import { parseTargetArtifacts, type TargetArtifact } from "./publish-run.js";

const DEFAULT_REPOSITORY = "biomejs/ecosystem-ci";
const DEFAULT_WORKFLOW = "ecosystem-ci.yml";
const REPORT_PREFIX = "biome-report-";
const CANDIDATE_REPORT_PREFIX = "candidate-report-";
const REPORT_RETENTION_DAYS = 10;
const SHA_PATTERN = /^[0-9a-f]{40}$/;

let githubToken: string | undefined;

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const dashboardDirectory = resolve(scriptDirectory, "..");
const repositoryDirectory = resolve(dashboardDirectory, "..");

function sleep(milliseconds: number): Promise<void> {
	return new Promise((resolvePromise) => {
		setTimeout(resolvePromise, milliseconds);
	});
}

export interface ImportOptions {
	repository: string;
	workflow: string;
	runIds: number[];
	seed: boolean;
	help: boolean;
}

export interface WorkflowTarget {
	id: string;
	repository: string;
	ref?: string;
}

interface ManifestResult {
	migrationOutcome?: RunManifest["targets"][string]["migrationOutcome"];
	executionStatus?: RunManifest["targets"][string]["executionStatus"];
	repositorySlug: string;
	repositoryCommitSha: string;
	jobStartedAt: string;
	jobCompletedAt: string;
	report: string;
	/** one entry per repetition of the check; absent for imported artifacts */
	timingSamples?: Array<{
		ordinal: number;
		checkDurationNs: number;
		scannerDurationNs: number;
	}>;
}

export interface ManifestRun {
	githubRunId: number;
	runAttempt: number;
	biomeBranch: string;
	biomeCommitSha: string;
	startedAt: string;
	completedAt: string;
	status: "completed";
	results: ManifestResult[];
}

interface GitHubRun {
	id: number;
	run_attempt: number;
	status: string;
	conclusion: string | null;
	run_started_at: string;
	updated_at: string;
}

interface GitHubJob {
	name: string;
	started_at: string;
	completed_at: string | null;
}

interface GitHubArtifact {
	name: string;
	expired: boolean;
	archive_download_url: string;
}

interface ReportArtifact {
	artifact: GitHubArtifact;
	id: string;
	filename: string;
}

interface GitHubWorkflow {
	path: string;
}

interface GitHubContent {
	encoding: string;
	content: string;
}

interface Report {
	summary?: {
		duration?: number;
		scannerDuration?: number;
		errors?: number;
		warnings?: number;
	};
	diagnostics?: unknown[];
	error?: boolean;
}

interface PreparedRun {
	run: ManifestRun;
	stagingDirectory: string;
}

class GitHubRequestError extends Error {
	readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.status = status;
	}
}

function scalar(value: string): string {
	const trimmed = value.trim();
	if (
		(trimmed.startsWith('"') && trimmed.endsWith('"')) ||
		(trimmed.startsWith("'") && trimmed.endsWith("'"))
	) {
		return trimmed.slice(1, -1);
	}
	return trimmed;
}

export function parseWorkflowTargets(workflow: string): WorkflowTarget[] {
	const targets: WorkflowTarget[] = [];
	let inEcosystemJob = false;
	let inMatrix = false;
	let current: Partial<WorkflowTarget> | null = null;

	const finishCurrent = () => {
		if (!current) return;
		if (!current.id || !current.repository) {
			throw new Error("Every ecosystem matrix row needs an id and repository");
		}
		targets.push(current as WorkflowTarget);
		current = null;
	};

	for (const line of workflow.split("\n")) {
		if (line === "  test-ecosystem:") {
			inEcosystemJob = true;
			continue;
		}
		if (inEcosystemJob && /^ {2}[a-zA-Z0-9_-]+:$/.test(line)) break;
		if (!inEcosystemJob) continue;

		if (/^\s+include:\s*$/.test(line)) {
			inMatrix = true;
			continue;
		}
		if (!inMatrix) continue;
		if (/^\s{4}name:\s+Test/.test(line)) break;

		const id = line.match(/^\s*-\s+id:\s*(.+)$/);
		if (id) {
			finishCurrent();
			current = { id: scalar(id[1]) };
			continue;
		}
		if (!current) continue;

		const repository = line.match(/^\s+repository:\s*(.+)$/);
		if (repository) {
			current.repository = scalar(repository[1]);
			continue;
		}
		const ref = line.match(/^\s+ref:\s*(.+)$/);
		if (ref) current.ref = scalar(ref[1]);
	}

	finishCurrent();
	if (targets.length === 0) {
		throw new Error("No targets found in the test-ecosystem matrix");
	}
	return targets;
}

function valueAfter(argv: string[], index: number, option: string): string {
	const value = argv[index + 1];
	if (!value || value.startsWith("--")) {
		throw new Error(`${option} needs a value`);
	}
	return value;
}

export function parseArguments(argv: string[]): ImportOptions {
	const options: ImportOptions = {
		repository: DEFAULT_REPOSITORY,
		workflow: DEFAULT_WORKFLOW,
		runIds: [],
		seed: true,
		help: false,
	};

	for (let index = 0; index < argv.length; index++) {
		const argument = argv[index];
		if (argument === "--help" || argument === "-h") {
			options.help = true;
			continue;
		}
		if (argument === "--workflow") {
			options.workflow = valueAfter(argv, index, argument);
			index++;
			continue;
		}
		if (argument === "--repository") {
			options.repository = valueAfter(argv, index, argument);
			index++;
			continue;
		}
		if (argument === "--seed") {
			options.seed = true;
			continue;
		}
		if (argument === "--no-seed") {
			options.seed = false;
			continue;
		}
		if (!/^\d+$/.test(argument)) {
			throw new Error(`Unknown argument: ${argument}`);
		}
		const runId = Number(argument);
		if (!Number.isSafeInteger(runId) || runId <= 0) {
			throw new Error(`Invalid workflow run ID: ${argument}`);
		}
		options.runIds.push(runId);
	}

	options.runIds = [...new Set(options.runIds)];
	return options;
}

export function isValidReport(report: Report): boolean {
	return (
		report.error !== true &&
		typeof report.summary?.duration === "number" &&
		typeof report.summary.scannerDuration === "number" &&
		typeof report.summary.errors === "number" &&
		typeof report.summary.warnings === "number" &&
		Array.isArray(report.diagnostics)
	);
}

export function parseReportArtifactName(
	artifactName: string,
): { id: string; filename: string } | null {
	for (const prefix of [REPORT_PREFIX, CANDIDATE_REPORT_PREFIX]) {
		if (!artifactName.startsWith(prefix)) continue;
		const id = artifactName.slice(prefix.length);
		if (!id) return null;
		return { id, filename: `${REPORT_PREFIX}${id}.json` };
	}
	return null;
}

export function selectUnimportedRunIds(
	runs: GitHubRun[],
	existingAttempts: Map<number, number>,
	oldestStartedAt = "0000-01-01T00:00:00Z",
): number[] {
	return runs
		.filter(
			(run) =>
				run.status === "completed" &&
				run.conclusion !== "skipped" &&
				run.run_started_at >= oldestStartedAt &&
				run.run_attempt > (existingAttempts.get(run.id) ?? 0),
		)
		.sort((left, right) =>
			left.run_started_at.localeCompare(right.run_started_at),
		)
		.map((run) => run.id);
}

function githubHeaders(): HeadersInit {
	const headers: Record<string, string> = {
		Accept: "application/vnd.github+json",
		"User-Agent": "biome-ecosystem-ci-report-importer",
		"X-GitHub-Api-Version": "2022-11-28",
	};
	if (githubToken) headers.Authorization = `Bearer ${githubToken}`;
	return headers;
}

async function githubJson<T>(path: string): Promise<T> {
	const url = `https://api.github.com${path}`;
	for (let attempt = 1; attempt <= 3; attempt++) {
		const response = await fetch(url, { headers: githubHeaders() });
		if (response.ok) return (await response.json()) as T;

		const body = await response.text();
		if (response.status < 500 && response.status !== 429) {
			throw new GitHubRequestError(
				response.status,
				`GitHub API ${response.status} for ${path}: ${body.slice(0, 300)}`,
			);
		}
		if (attempt === 3) {
			throw new GitHubRequestError(
				response.status,
				`GitHub API ${response.status} for ${path} after three attempts`,
			);
		}
		const retryAfter = Number(response.headers.get("retry-after") ?? attempt);
		await sleep(Math.max(1, retryAfter) * 1000);
	}
	throw new Error("Unreachable");
}

export async function githubCollection<T>(
	path: string,
	field: string,
): Promise<T[]> {
	const items: T[] = [];
	for (let page = 1; ; page++) {
		const response = await githubJson<Record<string, T[]>>(
			`${path}?per_page=100&page=${page}`,
		);
		items.push(...response[field]);
		if (response[field].length < 100) return items;
	}
}

function localWorkflowPath(workflow: string): string | null {
	if (/^\d+$/.test(workflow)) return null;
	const path = workflow.startsWith(".github/workflows/")
		? workflow
		: `.github/workflows/${workflow}`;
	if (!/^\.github\/workflows\/[^/]+$/.test(path) || path.includes("..")) {
		throw new Error(`Invalid workflow path: ${workflow}`);
	}
	return path;
}

async function loadWorkflowDefinition(options: ImportOptions): Promise<string> {
	let path = localWorkflowPath(options.workflow);
	if (!path) {
		const workflow = await githubJson<GitHubWorkflow>(
			`/repos/${options.repository}/actions/workflows/${options.workflow}`,
		);
		path = workflow.path;
	}

	if (options.repository === DEFAULT_REPOSITORY) {
		try {
			return await readFile(join(repositoryDirectory, path), "utf8");
		} catch (error) {
			const code = (error as NodeJS.ErrnoException).code;
			if (code !== "ENOENT") throw error;
		}
	}

	const content = await githubJson<GitHubContent>(
		`/repos/${options.repository}/contents/${path}`,
	);
	if (content.encoding !== "base64") {
		throw new Error(`GitHub returned unsupported encoding ${content.encoding}`);
	}
	return Buffer.from(content.content.replaceAll("\n", ""), "base64").toString(
		"utf8",
	);
}

async function runCommand(
	command: string[],
	options: { cwd?: string; inherit?: boolean } = {},
): Promise<string> {
	const [executable, ...arguments_] = command;
	if (!executable) throw new Error("Cannot run an empty command");

	return await new Promise((resolvePromise, reject) => {
		const child = spawn(executable, arguments_, {
			cwd: options.cwd,
			stdio: options.inherit ? "inherit" : ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout?.setEncoding("utf8");
		child.stderr?.setEncoding("utf8");
		child.stdout?.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr?.on("data", (chunk: string) => {
			stderr += chunk;
		});
		child.once("error", reject);
		child.once("close", (exitCode) => {
			if (exitCode !== 0) {
				reject(
					new Error(
						`${command.join(" ")} failed with exit code ${exitCode}${stderr ? `: ${stderr.trim()}` : ""}`,
					),
				);
				return;
			}
			resolvePromise(stdout.trim());
		});
	});
}

interface GitHubTokenEnvironment {
	GITHUB_TOKEN?: string;
	GH_TOKEN?: string;
}

export async function resolveGitHubToken(
	environment: GitHubTokenEnvironment = process.env,
	readGitHubCliToken: () => Promise<string> = () =>
		runCommand(["gh", "auth", "token", "--hostname", "github.com"]),
): Promise<string | undefined> {
	const environmentToken =
		environment.GITHUB_TOKEN?.trim() || environment.GH_TOKEN?.trim();
	if (environmentToken) return environmentToken;

	try {
		return (await readGitHubCliToken()).trim() || undefined;
	} catch {
		return undefined;
	}
}

async function findFile(
	directory: string,
	filename: string,
): Promise<string | null> {
	for (const entry of await readdir(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) {
			const nested = await findFile(path, filename);
			if (nested) return nested;
		} else if (entry.name === filename) {
			return path;
		}
	}
	return null;
}

async function downloadArtifact(
	repository: string,
	runId: number,
	artifact: GitHubArtifact,
	destination: string,
): Promise<void> {
	const candidates = githubToken
		? [
				{ url: artifact.archive_download_url, headers: githubHeaders() },
				{
					url: `https://nightly.link/${repository}/actions/runs/${runId}/${artifact.name}.zip`,
					headers: undefined,
				},
			]
		: [
				{
					url: `https://nightly.link/${repository}/actions/runs/${runId}/${artifact.name}.zip`,
					headers: undefined,
				},
			];

	let lastError = "";
	for (const candidate of candidates) {
		for (let attempt = 1; attempt <= 3; attempt++) {
			try {
				const response = await fetch(candidate.url, {
					headers: candidate.headers,
					redirect: "follow",
				});
				if (response.ok) {
					await writeFile(
						destination,
						Buffer.from(await response.arrayBuffer()),
					);
					return;
				}
				lastError = `${response.status} ${response.statusText}`;
				if (response.status < 500 && response.status !== 429) break;
			} catch (error) {
				lastError = error instanceof Error ? error.message : String(error);
			}
			if (attempt < 3) await sleep(attempt * 1000);
		}
	}
	throw new Error(`Could not download ${artifact.name}: ${lastError}`);
}

async function mapLimit<T, R>(
	values: T[],
	limit: number,
	callback: (value: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(values.length);
	let next = 0;
	async function worker() {
		while (next < values.length) {
			const index = next++;
			results[index] = await callback(values[index], index);
		}
	}
	await Promise.all(
		Array.from({ length: Math.min(limit, values.length) }, () => worker()),
	);
	return results;
}

class CommitResolver {
	private readonly cache = new Map<string, Promise<string>>();
	private readonly gitRepositories = new Map<string, string>();
	private readonly temporaryDirectory: string;
	private warnedAboutApi = false;
	private nextGitDirectory = 0;

	constructor(temporaryDirectory: string) {
		this.temporaryDirectory = temporaryDirectory;
	}

	resolve(
		repository: string,
		ref: string | undefined,
		at: string,
	): Promise<string> {
		const key = `${repository}\0${ref ?? ""}\0${at}`;
		const cached = this.cache.get(key);
		if (cached) return cached;
		const promise = this.resolveUncached(repository, ref, at);
		this.cache.set(key, promise);
		return promise;
	}

	private async resolveUncached(
		repository: string,
		ref: string | undefined,
		at: string,
	): Promise<string> {
		const query = new URLSearchParams({ until: at, per_page: "1" });
		if (ref) query.set("sha", ref);
		try {
			const commits = await githubJson<Array<{ sha: string }>>(
				`/repos/${repository}/commits?${query}`,
			);
			const sha = commits[0]?.sha;
			if (sha && SHA_PATTERN.test(sha)) return sha;
		} catch (error) {
			if (!(error instanceof GitHubRequestError)) throw error;
			if (!this.warnedAboutApi) {
				console.warn(
					"GitHub commit lookup failed. Falling back to metadata-only git fetches. Authenticate with gh or set GITHUB_TOKEN to raise the API limit.",
				);
				this.warnedAboutApi = true;
			}
		}
		return this.resolveWithGit(repository, ref, at);
	}

	private async resolveWithGit(
		repository: string,
		ref: string | undefined,
		at: string,
	): Promise<string> {
		const repositoryKey = `${repository}\0${ref ?? ""}`;
		let gitDirectory = this.gitRepositories.get(repositoryKey);
		if (!gitDirectory) {
			gitDirectory = join(
				this.temporaryDirectory,
				`git-${this.nextGitDirectory++}`,
			);
			await runCommand(["git", "init", "--quiet", gitDirectory]);
			await runCommand([
				"git",
				"-C",
				gitDirectory,
				"remote",
				"add",
				"origin",
				`https://github.com/${repository}.git`,
			]);
			const since = new Date(new Date(at).getTime() - 30 * 24 * 60 * 60 * 1000);
			await runCommand([
				"git",
				"-C",
				gitDirectory,
				"fetch",
				"--quiet",
				"--filter=blob:none",
				`--shallow-since=${since.toISOString()}`,
				"origin",
				ref ?? "HEAD",
			]);
			this.gitRepositories.set(repositoryKey, gitDirectory);
		}

		for (let attempt = 0; attempt < 20; attempt++) {
			const sha = await runCommand([
				"git",
				"-C",
				gitDirectory,
				"rev-list",
				"-1",
				`--before=${at}`,
				"FETCH_HEAD",
			]);
			if (SHA_PATTERN.test(sha)) return sha;

			const shallow = await runCommand([
				"git",
				"-C",
				gitDirectory,
				"rev-parse",
				"--is-shallow-repository",
			]);
			if (shallow !== "true") break;
			await runCommand([
				"git",
				"-C",
				gitDirectory,
				"fetch",
				"--quiet",
				"--filter=blob:none",
				"--deepen=100",
				"origin",
				ref ?? "HEAD",
			]);
		}
		throw new Error(
			`Could not resolve ${repository}${ref ? `@${ref}` : ""} at ${at}`,
		);
	}
}

async function prepareRun(
	options: ImportOptions,
	runId: number,
	targets: WorkflowTarget[],
	temporaryDirectory: string,
	resolver: CommitResolver,
	stagingDirectories: Set<string>,
): Promise<PreparedRun | null> {
	console.log(`Inspecting run ${runId}...`);
	const [run, runJobs, runArtifacts] = await Promise.all([
		githubJson<GitHubRun>(`/repos/${options.repository}/actions/runs/${runId}`),
		githubCollection<GitHubJob>(
			`/repos/${options.repository}/actions/runs/${runId}/jobs`,
			"jobs",
		),
		githubCollection<GitHubArtifact>(
			`/repos/${options.repository}/actions/runs/${runId}/artifacts`,
			"artifacts",
		),
	]);

	if (run.status !== "completed") {
		throw new Error(
			`Run ${runId} is ${run.status}; only completed runs can be imported`,
		);
	}

	const artifactsById = new Map<string, ReportArtifact>();
	for (const artifact of runArtifacts) {
		if (artifact.expired) continue;
		const parsed = parseReportArtifactName(artifact.name);
		if (!parsed) continue;

		const existing = artifactsById.get(parsed.id);
		if (existing?.artifact.name.startsWith(REPORT_PREFIX)) continue;
		artifactsById.set(parsed.id, { artifact, ...parsed });
	}
	const artifacts = [...artifactsById.values()];
	if (artifacts.length === 0) {
		console.log(`Skipping run ${runId}: no retained report artifacts.`);
		return null;
	}

	const targetById = new Map(targets.map((target) => [target.id, target]));
	const metadataById = new Map<string, TargetArtifact>();
	const stagingDirectory = join(
		runsDirectory,
		`.import-${runId}-${process.pid}-${Date.now()}`,
	);
	await mkdir(stagingDirectory, { recursive: true });
	stagingDirectories.add(stagingDirectory);

	const downloaded = await mapLimit(
		artifacts,
		6,
		async (reportArtifact, index) => {
			const { artifact, id, filename } = reportArtifact;
			const target = targetById.get(id);
			if (!target) {
				console.warn(`Skipping unknown artifact ${artifact.name}.`);
				return null;
			}

			const zipPath = join(temporaryDirectory, `${runId}-${index}.zip`);
			const extractDirectory = join(temporaryDirectory, `${runId}-${index}`);
			await mkdir(extractDirectory, { recursive: true });
			await downloadArtifact(options.repository, runId, artifact, zipPath);
			await runCommand(["unzip", "-oq", zipPath, "-d", extractDirectory]);

			const source = await findFile(extractDirectory, filename);
			if (!source)
				throw new Error(`${filename} was not present in ${artifact.name}`);
			const report = JSON.parse(await readFile(source, "utf8")) as Report;
			if (!isValidReport(report)) {
				console.log(
					`Ignoring ${artifact.name}: CI did not produce a valid report.`,
				);
				return null;
			}
			const destination = join(
				stagingDirectory,
				"reports",
				`${RepositorySlugSchema.parse(target.repository)}.json`,
			);
			await mkdir(dirname(destination), { recursive: true });
			await copyFile(source, destination);
			const metadataArtifact = runArtifacts.find(
				(item) => item.name === `target-metadata-${id}` && !item.expired,
			);
			if (metadataArtifact) {
				const metadataZip = join(
					temporaryDirectory,
					`metadata-${runId}-${index}.zip`,
				);
				const metadataDirectory = join(
					temporaryDirectory,
					`metadata-${runId}-${index}`,
				);
				await mkdir(metadataDirectory, { recursive: true });
				await downloadArtifact(
					options.repository,
					runId,
					metadataArtifact,
					metadataZip,
				);
				await runCommand([
					"unzip",
					"-oq",
					metadataZip,
					"-d",
					metadataDirectory,
				]);
				const metadataPath = await findFile(
					metadataDirectory,
					`target-metadata-${id}.json`,
				);
				if (!metadataPath) throw new Error(`Missing target metadata for ${id}`);
				const [metadata] = parseTargetArtifacts([
					JSON.parse(await readFile(metadataPath, "utf8")),
				]);
				if (metadata.id !== id || metadata.repositorySlug !== target.repository)
					throw new Error(`Target metadata identity mismatch for ${id}`);
				metadataById.set(id, metadata);
			}
			return target;
		},
	);

	const validTargetIds = new Set(
		downloaded
			.filter((target): target is WorkflowTarget => target !== null)
			.map((target) => target.id),
	);
	const validTargets = targets.filter((target) =>
		validTargetIds.has(target.id),
	);
	if (validTargets.length === 0) {
		await rm(stagingDirectory, { recursive: true, force: true });
		stagingDirectories.delete(stagingDirectory);
		console.log(`Skipping run ${runId}: every report artifact was invalid.`);
		return null;
	}

	const jobs = new Map(runJobs.map((job) => [job.name, job]));
	const buildJob = runJobs.find((job) => job.name.startsWith("Build Biome ("));
	if (!buildJob) throw new Error(`Run ${runId} has no Build Biome job`);
	const branch = buildJob.name.match(/^Build Biome \((.+)\)$/)?.[1];
	if (!branch)
		throw new Error(`Could not read the Biome branch from ${buildJob.name}`);

	const biomeCommitSha = await resolver.resolve(
		"biomejs/biome",
		branch,
		buildJob.started_at,
	);
	const results = await mapLimit(validTargets, 6, async (target) => {
		const metadata = metadataById.get(target.id);
		if (metadata)
			return {
				...metadata,
				report: `runs/${runId}/attempts/${run.run_attempt}/reports/${target.repository}.json`,
			};
		const job = jobs.get(`Test ${target.id}`);
		if (!job?.completed_at) {
			throw new Error(`Run ${runId} has no completed Test ${target.id} job`);
		}
		const repositoryCommitSha = await resolver.resolve(
			target.repository,
			target.ref,
			job.started_at,
		);
		return {
			repositorySlug: target.repository,
			repositoryCommitSha,
			jobStartedAt: job.started_at,
			jobCompletedAt: job.completed_at,
			report: `runs/${runId}/attempts/${run.run_attempt}/reports/${target.repository}.json`,
		};
	});

	return {
		run: {
			githubRunId: run.id,
			runAttempt: run.run_attempt,
			biomeBranch: branch,
			biomeCommitSha,
			startedAt: run.run_started_at,
			completedAt: run.updated_at,
			status: "completed",
			results,
		},
		stagingDirectory,
	};
}

async function discoverRunIds(
	options: ImportOptions,
	existingAttempts: Map<number, number>,
): Promise<number[]> {
	console.log(`Finding completed runs for ${options.workflow}...`);
	const workflow = encodeURIComponent(options.workflow);
	const cutoff = new Date(
		Date.now() - REPORT_RETENTION_DAYS * 24 * 60 * 60 * 1000,
	);
	const query = new URLSearchParams({
		status: "completed",
		per_page: "100",
		created: `>=${cutoff.toISOString().slice(0, 10)}`,
	});
	const response = await githubJson<{ workflow_runs: GitHubRun[] }>(
		`/repos/${options.repository}/actions/workflows/${workflow}/runs?${query}`,
	);
	return selectUnimportedRunIds(
		response.workflow_runs,
		existingAttempts,
		cutoff.toISOString(),
	);
}

export function toRunManifest(run: ManifestRun): RunManifest {
	return RunManifestSchema.parse({
		schemaVersion: 2,
		githubRunId: run.githubRunId,
		runAttempt: run.runAttempt,
		biomeBranch: run.biomeBranch,
		biomeCommitSha: run.biomeCommitSha,
		startedAt: run.startedAt,
		completedAt: run.completedAt,
		status: run.status,
		targets: Object.fromEntries(
			run.results.map((result) => [
				result.repositorySlug,
				{
					repositoryCommitSha: result.repositoryCommitSha,
					jobStartedAt: result.jobStartedAt,
					jobCompletedAt: result.jobCompletedAt,
					migrationOutcome: result.migrationOutcome ?? null,
					executionStatus: result.executionStatus ?? "completed",
					timingSamples: result.timingSamples,
				},
			]),
		),
	});
}

async function installPreparedReports(
	prepared: PreparedRun[],
	stagingDirectories: Set<string>,
): Promise<void> {
	for (const item of prepared) {
		const manifest = toRunManifest(item.run);
		await writeFile(
			join(item.stagingDirectory, "manifest.json"),
			`${JSON.stringify(manifest, null, "\t")}\n`,
		);
		await installRunDirectory(item.stagingDirectory, manifest);
		stagingDirectories.delete(item.stagingDirectory);
	}
}

function printHelp(): void {
	console.log(`Usage:
  just reports-import
  just reports-import 33193506807 32934641625

With no run IDs, the importer finds completed runs from the last ${REPORT_RETENTION_DAYS} days that have not been downloaded.

Options:
  --workflow <file-or-id>  Workflow used for discovery. Default: ${DEFAULT_WORKFLOW}
  --repository <owner/repo>  Actions repository. Default: ${DEFAULT_REPOSITORY}
  --no-seed                Download run folders without seeding local D1/R2
  --seed                   Migrate and seed local D1/R2 after import. This is the default
  -h, --help               Show this help

Authentication: GITHUB_TOKEN, GH_TOKEN, or the active gh login.`);
}

async function main(): Promise<void> {
	const options = parseArguments(process.argv.slice(2));
	if (options.help) {
		printHelp();
		return;
	}
	githubToken = await resolveGitHubToken();

	const [localRuns, workflow] = await Promise.all([
		loadLocalRuns(),
		loadWorkflowDefinition(options),
	]);
	const targets = parseWorkflowTargets(workflow);
	const existingAttempts = new Map(
		latestLocalRuns(localRuns).map(({ manifest }) => [
			manifest.githubRunId,
			manifest.runAttempt,
		]),
	);
	const explicitRunIds = options.runIds.length > 0;
	const runIds = explicitRunIds
		? options.runIds
		: await discoverRunIds(options, existingAttempts);

	if (runIds.length === 0) {
		console.log("No new retained runs to import.");
		if (options.seed && localRuns.length > 0) {
			await runCommand(["pnpm", "run", "db:setup:local"], {
				cwd: dashboardDirectory,
				inherit: true,
			});
		}
		return;
	}

	const temporaryDirectory = await mkdtemp(
		join(tmpdir(), "biome-ecosystem-ci-import-"),
	);
	const resolver = new CommitResolver(temporaryDirectory);
	const prepared: PreparedRun[] = [];
	const stagingDirectories = new Set<string>();
	try {
		for (const runId of runIds) {
			const item = await prepareRun(
				options,
				runId,
				targets,
				temporaryDirectory,
				resolver,
				stagingDirectories,
			);
			if (item) prepared.push(item);
		}

		if (prepared.length === 0) {
			if (explicitRunIds) {
				throw new Error("The requested runs had no retained valid reports");
			}
			console.log("No new retained runs to import.");
			return;
		}

		await installPreparedReports(prepared, stagingDirectories);

		const resultCount = prepared.reduce(
			(total, item) => total + item.run.results.length,
			0,
		);
		console.log(
			`Imported ${prepared.length} ${prepared.length === 1 ? "run" : "runs"} with ${resultCount} reports.`,
		);

		if (options.seed) {
			console.log("Reseeding local D1 and R2...");
			await runCommand(["pnpm", "run", "db:setup:local"], {
				cwd: dashboardDirectory,
				inherit: true,
			});
		}
	} finally {
		await rm(temporaryDirectory, { recursive: true, force: true });
		for (const stagingDirectory of stagingDirectories) {
			await rm(stagingDirectory, { recursive: true, force: true });
		}
	}
}

const isMainModule =
	process.argv[1] !== undefined &&
	resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
