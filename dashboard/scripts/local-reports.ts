import { mkdir, readdir, readFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	type RunManifest,
	RunManifestSchema,
} from "@biomejs/ecosystem-ci-ingest/schemas";

export const dataDirectory = fileURLToPath(
	new URL("../data/", import.meta.url),
);
export const runsDirectory = join(dataDirectory, "runs");

export interface LocalRun {
	manifest: RunManifest;
	directory: string;
	reports: Array<{ key: string; path: string; repositorySlug: string }>;
}

async function directories(path: string): Promise<string[]> {
	try {
		return (await readdir(path, { withFileTypes: true }))
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
}

export function runPrefix(
	run: Pick<RunManifest, "githubRunId" | "runAttempt">,
): string {
	return `runs/${run.githubRunId}/attempts/${run.runAttempt}`;
}

/** Discover complete attempts in the same layout used by the production bucket. */
export async function loadLocalRuns(root = runsDirectory): Promise<LocalRun[]> {
	const runs: LocalRun[] = [];
	for (const id of await directories(root)) {
		if (!/^[1-9]\d*$/.test(id)) continue;
		const attempts = join(root, id, "attempts");
		for (const attempt of await directories(attempts)) {
			if (!/^[1-9]\d*$/.test(attempt)) continue;
			const directory = join(attempts, attempt);
			let text: string;
			try {
				text = await readFile(join(directory, "manifest.json"), "utf8");
			} catch (error) {
				if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
				throw error;
			}
			const manifest = RunManifestSchema.parse(JSON.parse(text));
			if (
				String(manifest.githubRunId) !== id ||
				String(manifest.runAttempt) !== attempt
			) {
				throw new Error(`Manifest identity does not match ${directory}`);
			}
			const reports: LocalRun["reports"] = [];
			for (const owner of await directories(join(directory, "reports"))) {
				for (const entry of await readdir(join(directory, "reports", owner), {
					withFileTypes: true,
				})) {
					if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
					const repositorySlug = `${owner}/${entry.name.slice(0, -5)}`;
					if (!Object.hasOwn(manifest.targets, repositorySlug)) continue;
					reports.push({
						key: `${runPrefix(manifest)}/reports/${repositorySlug}.json`,
						path: join(directory, "reports", owner, entry.name),
						repositorySlug,
					});
				}
			}
			runs.push({ manifest, directory, reports });
		}
	}
	return runs.sort(
		(a, b) =>
			b.manifest.githubRunId - a.manifest.githubRunId ||
			b.manifest.runAttempt - a.manifest.runAttempt,
	);
}

export function latestLocalRuns(runs: LocalRun[]): LocalRun[] {
	const latest = new Map<number, LocalRun>();
	for (const run of runs) {
		const previous = latest.get(run.manifest.githubRunId);
		if (!previous || previous.manifest.runAttempt < run.manifest.runAttempt) {
			latest.set(run.manifest.githubRunId, run);
		}
	}
	return [...latest.values()];
}

/** Replace an attempt only after its download has finished. */
export async function installRunDirectory(
	source: string,
	manifest: RunManifest,
	root = runsDirectory,
): Promise<void> {
	const destination = join(
		root,
		String(manifest.githubRunId),
		"attempts",
		String(manifest.runAttempt),
	);
	await mkdir(dirname(destination), { recursive: true });
	const backup = `${destination}.backup-${process.pid}-${Date.now()}`;
	let backedUp = false;
	try {
		await rename(destination, backup);
		backedUp = true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
	}
	try {
		await rename(source, destination);
	} catch (error) {
		if (backedUp) await rename(backup, destination);
		throw error;
	}
	if (backedUp) await rm(backup, { recursive: true, force: true });
}
