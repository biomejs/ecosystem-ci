// Shapes the page's server data into one series per repository × metric.
import type { HistoryPoint, RunSummary } from "$lib/server/runs";
import { formatCount, formatMs, formatPct, signed } from "./format";

export type MetricKey = "checkMs" | "scannerMs" | "parse" | "panics";
export type SeverityKey = "errors" | "warnings" | "infos";
export type ValueKey = MetricKey | SeverityKey;

export interface Metric {
	key: ValueKey;
	label: string;
	hue: string;
	format: (v: number) => string;
	zeroBased: boolean;
}

/** the focus metrics — the only coloured things on the page, one hue each */
export const METRICS: Metric[] = [
	{
		key: "checkMs",
		label: "Check time",
		hue: "var(--blue)",
		format: formatMs,
		zeroBased: false,
	},
	{
		key: "scannerMs",
		label: "Scanner time",
		hue: "var(--violet)",
		format: formatMs,
		zeroBased: false,
	},
	{
		key: "parse",
		label: "Parse diagnostics",
		hue: "var(--aqua)",
		format: formatCount,
		zeroBased: true,
	},
	{
		key: "panics",
		label: "Panics",
		hue: "var(--orange)",
		format: formatCount,
		zeroBased: true,
	},
];

/** secondary metric: rule diagnostics by severity, monochrome on purpose. Order = stack order (bottom first). */
export const SEVERITIES: Metric[] = [
	{
		key: "errors",
		label: "Errors",
		hue: "var(--sev-error)",
		format: formatCount,
		zeroBased: true,
	},
	{
		key: "warnings",
		label: "Warnings",
		hue: "var(--sev-warning)",
		format: formatCount,
		zeroBased: true,
	},
	{
		key: "infos",
		label: "Info",
		hue: "var(--sev-info)",
		format: formatCount,
		zeroBased: true,
	},
];
export const SEVERITY_LABEL = "Diagnostics by severity";
export const SEVERITY_NOTE =
	"rule diagnostics only — parse and panics are counted above";

export const isTime = (key: ValueKey): boolean =>
	key === "checkMs" || key === "scannerMs";

export interface Run {
	id: number;
	sha: string;
	startedAt: string;
	/** position on the x axis */
	index: number;
	url: string;
	commitUrl: string;
}

export interface Cell {
	checkMs: number | null;
	scannerMs: number | null;
	parse: number | null;
	panics: number | null;
	errors: number | null;
	warnings: number | null;
	infos: number | null;
	/** the repository has no result for this run */
	missing: boolean;
}

export interface Repo {
	slug: string;
	/** one cell per run, aligned with Dataset.runs */
	cells: Cell[];
}

export interface Dataset {
	branch: string;
	runs: Run[];
	repos: Repo[];
}

const EMPTY: Cell = {
	checkMs: null,
	scannerMs: null,
	parse: null,
	panics: null,
	errors: null,
	warnings: null,
	infos: null,
	missing: true,
};

/** runs of the newest run's branch, oldest first, with every repository seen in the history */
export function buildDataset(
	runs: RunSummary[],
	history: HistoryPoint[],
): Dataset {
	const branch = runs[0]?.biomeBranch ?? "main";
	const branchRuns = runs
		.filter((r) => r.biomeBranch === branch)
		.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
	const byRunAndSlug = new Map(
		history.map((h) => [`${h.githubRunId}:${h.repositorySlug}`, h]),
	);
	const slugs = [...new Set(history.map((h) => h.repositorySlug))].sort();

	const outRuns: Run[] = branchRuns.map((r, index) => ({
		id: r.githubRunId,
		sha: r.biomeCommitSha,
		startedAt: r.startedAt,
		index,
		url: `https://github.com/biomejs/ecosystem-ci/actions/runs/${r.githubRunId}`,
		commitUrl: `https://github.com/biomejs/biome/commit/${r.biomeCommitSha}`,
	}));
	const repos: Repo[] = slugs.map((slug) => ({
		slug,
		cells: branchRuns.map((r) => {
			const p = byRunAndSlug.get(`${r.githubRunId}:${slug}`);
			if (!p) return EMPTY;
			return {
				checkMs: p.checkDurationNs === null ? null : p.checkDurationNs / 1e6,
				scannerMs:
					p.scannerDurationNs === null ? null : p.scannerDurationNs / 1e6,
				parse: p.parseDiagnostics,
				panics: p.panics,
				errors: p.ruleErrors,
				warnings: p.ruleWarnings,
				infos: p.ruleInfos,
				missing: false,
			};
		}),
	}));
	return { branch, runs: outRuns, repos };
}

// ---------- series helpers ----------

export const seriesValues = (repo: Repo, key: ValueKey): (number | null)[] =>
	repo.cells.map((c) => c[key]);

export function lastDefined(
	vals: (number | null)[],
	from = vals.length - 1,
): { index: number; value: number } | null {
	for (let i = from; i >= 0; i--) {
		const v = vals[i];
		if (v !== null) return { index: i, value: v };
	}
	return null;
}

/** "+12.3%" for times, "+5" / "−2" for counts, "—" for no change */
export function formatDeltaShort(
	now: number,
	then: number,
	key: ValueKey,
): string {
	const d = now - then;
	if (d === 0) return "—";
	if (isTime(key)) return formatPct((d / Math.max(then, 1)) * 100);
	return signed(formatCount(Math.abs(d)), d);
}

/** total of the severity layers per run; null where any layer is missing */
export function severityTotals(repo: Repo): (number | null)[] {
	return repo.cells.map((c) =>
		c.errors === null || c.warnings === null || c.infos === null
			? null
			: c.errors + c.warnings + c.infos,
	);
}
