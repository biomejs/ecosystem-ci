#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

interface Position {
	line?: number;
	column?: number;
}

interface Advice {
	text?: string;
	start?: Position;
	end?: Position;
}

export interface Diagnostic {
	severity?: string;
	message?: string;
	category?: string;
	location?: {
		path?: string;
		start?: Position;
		end?: Position;
	};
	advices?: Advice[];
}

interface Report {
	error?: boolean;
	diagnostics?: Diagnostic[];
}

interface ManifestResult {
	repositorySlug: string;
	report: string;
}

interface ManifestRun {
	githubRunId: number;
	startedAt: string;
	results: ManifestResult[];
}

interface Manifest {
	runs: ManifestRun[];
}

export interface DiagnosticFilters {
	severities?: string[];
	categories?: string[];
	path?: string;
	search?: string;
}

const dataDirectory = new URL("../data/", import.meta.url);
const manifestUrl = new URL("manifest.json", dataDirectory);

function reportId(reportPath: string): string {
	return path
		.basename(reportPath)
		.replace(/^biome-report-/, "")
		.replace(/\.json$/, "");
}

function matchesRepository(result: ManifestResult, query: string): boolean {
	const normalizedQuery = query.toLowerCase();
	return (
		result.repositorySlug.toLowerCase() === normalizedQuery ||
		reportId(result.report).toLowerCase() === normalizedQuery
	);
}

export function selectReport(
	manifest: Manifest,
	repository: string,
	runId?: string,
): { run: ManifestRun; result: ManifestResult } | null {
	const runs = [...manifest.runs].sort(
		(left, right) =>
			new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime(),
	);

	for (const run of runs) {
		if (runId !== undefined && String(run.githubRunId) !== runId) continue;
		const result = run.results.find((item) =>
			matchesRepository(item, repository),
		);
		if (result) return { run, result };
	}

	return null;
}

function includesCaseInsensitive(
	value: string | undefined,
	query: string,
): boolean {
	return value?.toLowerCase().includes(query.toLowerCase()) ?? false;
}

export function filterDiagnostics(
	diagnostics: Diagnostic[],
	filters: DiagnosticFilters,
): Diagnostic[] {
	const severities = filters.severities?.map((value) => value.toLowerCase());
	const categories = filters.categories?.map((value) => value.toLowerCase());

	return diagnostics.filter((diagnostic) => {
		if (
			severities &&
			!severities.includes(diagnostic.severity?.toLowerCase() ?? "unknown")
		) {
			return false;
		}

		if (categories) {
			const category = diagnostic.category?.toLowerCase() ?? "uncategorized";
			if (
				!categories.some(
					(prefix) => category === prefix || category.startsWith(`${prefix}/`),
				)
			) {
				return false;
			}
		}

		if (
			filters.path &&
			!includesCaseInsensitive(diagnostic.location?.path, filters.path)
		) {
			return false;
		}

		const search = filters.search;
		if (search) {
			const searchable = [
				diagnostic.message,
				diagnostic.category,
				diagnostic.location?.path,
				...(diagnostic.advices?.map((advice) => advice.text) ?? []),
			];
			if (!searchable.some((value) => includesCaseInsensitive(value, search))) {
				return false;
			}
		}

		return true;
	});
}

function formatPosition(position: Position | undefined): string {
	if (position?.line === undefined) return "";
	return position.column === undefined
		? String(position.line)
		: `${position.line}:${position.column}`;
}

function formatLocation(diagnostic: Diagnostic): string {
	const location = diagnostic.location;
	if (!location?.path) return "unknown location";

	const start = formatPosition(location.start);
	const end = formatPosition(location.end);
	if (!start) return location.path;
	if (!end || end === start) return `${location.path}:${start}`;
	return `${location.path}:${start}-${end}`;
}

export function formatDiagnostic(
	diagnostic: Diagnostic,
	index: number,
): string {
	const severity = (diagnostic.severity ?? "unknown").toUpperCase();
	const category = diagnostic.category ?? "uncategorized";
	const lines = [
		`${index + 1}. ${severity} ${category}`,
		`   ${formatLocation(diagnostic)}`,
		`   ${diagnostic.message ?? "No message"}`,
	];

	for (const advice of diagnostic.advices ?? []) {
		if (advice.text) lines.push(`   Advice: ${advice.text.trim()}`);
	}

	return lines.join("\n");
}

function showHelp(): void {
	console.info(`Usage: bun run reports:diagnostics <repository> [options]

Read diagnostics from dashboard/data/reports. The newest run is used by default.

Arguments:
  <repository>              Report id such as astro, or a slug such as withastro/astro

Options:
  -r, --run <id>            Read a specific GitHub Actions run
  -s, --severity <level>    Filter by severity. May be repeated
  -c, --category <prefix>   Filter by category or category prefix. May be repeated
  -p, --path <text>         Filter by file path
      --search <text>       Search messages, categories, paths, and advice
  -n, --limit <count>       Maximum diagnostics to print. Defaults to 100
      --all                 Print every matching diagnostic
      --json                Print the matching diagnostics as JSON
  -h, --help                Show this help

Examples:
  bun run reports:diagnostics astro
  bun run reports:diagnostics astro --severity error --category lint
  bun run reports:diagnostics withastro/astro --run 33613560701 --path packages
  bun run reports:diagnostics astro --search useImportType --all
`);
}

function parseLimit(value: string | undefined, all: boolean): number {
	if (all) return Number.POSITIVE_INFINITY;
	if (value === undefined) return 100;

	const limit = Number(value);
	if (!Number.isSafeInteger(limit) || limit < 1) {
		throw new Error("--limit must be a positive integer");
	}
	return limit;
}

export async function main(args = process.argv.slice(2)): Promise<void> {
	const { values, positionals } = parseArgs({
		args,
		allowPositionals: true,
		options: {
			run: { type: "string", short: "r" },
			severity: { type: "string", short: "s", multiple: true },
			category: { type: "string", short: "c", multiple: true },
			path: { type: "string", short: "p" },
			search: { type: "string" },
			limit: { type: "string", short: "n" },
			all: { type: "boolean", default: false },
			json: { type: "boolean", default: false },
			help: { type: "boolean", short: "h", default: false },
		},
	});

	if (values.help) {
		showHelp();
		return;
	}

	const repository = positionals[0];
	if (!repository || positionals.length > 1) {
		showHelp();
		throw new Error(
			positionals.length > 1
				? "Expected one repository"
				: "A repository is required",
		);
	}

	const limit = parseLimit(values.limit, values.all);
	const manifest = JSON.parse(await readFile(manifestUrl, "utf8")) as Manifest;
	const selected = selectReport(manifest, repository, values.run);
	if (!selected) {
		const run = values.run ? ` in run ${values.run}` : "";
		throw new Error(`No report found for ${repository}${run}`);
	}

	const reportUrl = new URL(selected.result.report, dataDirectory);
	const report = JSON.parse(await readFile(reportUrl, "utf8")) as Report;
	if (report.error) {
		throw new Error(`The report for ${repository} is an error placeholder`);
	}

	const diagnostics = filterDiagnostics(report.diagnostics ?? [], {
		severities: values.severity,
		categories: values.category,
		path: values.path,
		search: values.search,
	});
	const shown = diagnostics.slice(0, limit);

	if (values.json) {
		console.info(JSON.stringify(shown, null, 2));
		return;
	}

	console.info(
		`${selected.result.repositorySlug} | run ${selected.run.githubRunId} | ${diagnostics.length} matching diagnostics`,
	);
	if (shown.length === 0) return;
	console.info("");
	console.info(shown.map(formatDiagnostic).join("\n\n"));

	if (shown.length < diagnostics.length) {
		console.info(
			`\nShowing ${shown.length} of ${diagnostics.length}. Use --all or raise --limit to see more.`,
		);
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch((error: unknown) => {
		console.error(error instanceof Error ? error.message : error);
		process.exitCode = 1;
	});
}
