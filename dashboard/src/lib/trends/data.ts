// Shapes the page's server data into one series per repository × metric.
import type { HistoryPoint, RunSummary } from "$lib/server/runs";
import { type TimingStats, timingStatsMs } from "$lib/timing";
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
		hue: "var(--color-blue)",
		format: formatMs,
		zeroBased: false,
	},
	{
		key: "scannerMs",
		label: "Scanner time",
		hue: "var(--color-violet)",
		format: formatMs,
		zeroBased: false,
	},
	{
		key: "parse",
		label: "Parse diagnostics",
		hue: "var(--color-aqua)",
		format: formatCount,
		zeroBased: true,
	},
	{
		key: "panics",
		label: "Panics",
		hue: "var(--color-orange)",
		format: formatCount,
		zeroBased: true,
	},
];

/** secondary metric: rule diagnostics by severity, monochrome on purpose. Order = stack order (bottom first). */
export const SEVERITIES: Metric[] = [
	{
		key: "errors",
		label: "Errors",
		hue: "var(--color-sev-error)",
		format: formatCount,
		zeroBased: true,
	},
	{
		key: "warnings",
		label: "Warnings",
		hue: "var(--color-sev-warning)",
		format: formatCount,
		zeroBased: true,
	},
	{
		key: "infos",
		label: "Info",
		hue: "var(--color-sev-info)",
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
	/** median of the run's check samples; the plotted point */
	checkMs: number | null;
	/** median of the run's scanner samples; the plotted point */
	scannerMs: number | null;
	/** every statistic over the run's check samples, null without samples */
	check: TimingStats | null;
	scanner: TimingStats | null;
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
	check: null,
	scanner: null,
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
			const { check, scanner } = timingStatsMs(p.timingSamples);
			return {
				checkMs: check === null ? null : check.median,
				scannerMs: scanner === null ? null : scanner.median,
				check,
				scanner,
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

/** the per-run sample statistics behind a time series; null for count metrics */
export const seriesStats = (
	repo: Repo,
	key: ValueKey,
): (TimingStats | null)[] | null =>
	key === "checkMs"
		? repo.cells.map((c) => c.check)
		: key === "scannerMs"
			? repo.cells.map((c) => c.scanner)
			: null;

/** [min, max] of each run's samples, null where there are none */
export const seriesRanges = (
	repo: Repo,
	key: ValueKey,
): ([number, number] | null)[] =>
	(seriesStats(repo, key) ?? repo.cells.map(() => null)).map((s) =>
		s === null ? null : [s.min, s.max],
	);

/** "1.15 s–1.31 s · 5 samples", or just the count when the range is flat at display precision */
export function formatSampleSummary(s: TimingStats): string {
	const noun = s.count === 1 ? "sample" : "samples";
	const low = formatMs(s.min);
	const high = formatMs(s.max);
	if (s.count === 1 || low === high) return `${s.count} ${noun}`;
	return `${low}–${high} · ${s.count} ${noun}`;
}

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
