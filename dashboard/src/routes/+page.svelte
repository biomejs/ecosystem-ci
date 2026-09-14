<script lang="ts">
import Button from "$lib/Button.svelte";
import Select from "$lib/Select.svelte";
import StickyHorizontalScroll from "$lib/StickyHorizontalScroll.svelte";
import type { TimingStats } from "$lib/timing";
import {
	buildDataset,
	formatDeltaShort,
	formatTimingRange,
	isTime,
	lastDefined,
	METRIC_BY_KEY,
	METRICS,
	type Metric,
	type Repo,
	SEVERITIES,
	SEVERITY_LABEL,
	SEVERITY_NOTE,
	seriesRanges,
	seriesStats,
	seriesValues,
	severityTotals,
} from "$lib/trends/data";
import {
	activeFindings,
	deltaColor,
	deltaGlyph,
	type Finding,
} from "$lib/trends/findings";
import {
	formatCount,
	formatDateTime,
	formatDay,
	shortSha,
} from "$lib/trends/format";
import HistoryTable from "$lib/trends/HistoryTable.svelte";
import { hover, validRunIndex } from "$lib/trends/hover.svelte";
import OverviewLines from "$lib/trends/OverviewLines.svelte";
import StackedArea from "$lib/trends/StackedArea.svelte";
import TrendLine from "$lib/trends/TrendLine.svelte";
import type { PageData } from "./$types";

let { data }: { data: PageData } = $props();
const dataset = $derived(buildDataset(data.runs, data.history));
const runs = $derived(dataset.runs);
const latest = $derived(runs[runs.length - 1]);
const focusIndex = $derived(validRunIndex(hover.index, runs.length));
const hovered = $derived(focusIndex === null ? null : runs[focusIndex]);
const pinnedIndex = $derived(validRunIndex(hover.pinned, runs.length));
let previousRuns: typeof data.runs | undefined;

$effect(() => {
	if (data.runs !== previousRuns) {
		previousRuns = data.runs;
		hover.index = null;
		hover.pinned = null;
	}
});

function inspectRun(index: number | null) {
	hover.pinned = validRunIndex(index, runs.length);
	hover.index = hover.pinned;
}

let threshold = $state(3);
let recentRuns = $state(3);
const active = $derived(activeFindings(dataset, threshold));
const findingFor = (repo: Repo, key: string): Finding | undefined =>
	active.get(`${repo.slug}:${key}`);
const isNew = (f: Finding) => f.at >= runs.length - recentRuns;
interface RepoRow {
	repo: Repo;
	newRegressions: Finding[];
	regressions: Finding[];
}
const rows = $derived.by((): RepoRow[] =>
	dataset.repos
		.map((repo) => {
			const fs = [...METRICS, ...SEVERITIES]
				.map((m) => findingFor(repo, m.key))
				.filter((f): f is Finding => !!f);
			const regressions = fs.filter((f) => f.worse);
			return { repo, regressions, newRegressions: regressions.filter(isNew) };
		})
		.sort(
			(a, b) =>
				Number(b.newRegressions.length > 0) -
					Number(a.newRegressions.length > 0) ||
				Number(b.regressions.length > 0) - Number(a.regressions.length > 0) ||
				a.repo.slug.localeCompare(b.repo.slug),
		),
);
const newCount = $derived(
	rows.filter((r) => r.newRegressions.length > 0).length,
);
const oldCount = $derived(
	rows.filter((r) => r.newRegressions.length === 0 && r.regressions.length > 0)
		.length,
);
const firstQuiet = $derived(rows.findIndex((r) => r.regressions.length === 0));
</script>

<svelte:head><title>Ecosystem CI</title></svelte:head>

{#snippet deltaCell(m: Metric, vals: (number | null)[], stats: (TimingStats | null)[] | null, f: Finding | undefined)}
	{const last = $derived(lastDefined(vals))}
	{const prev = $derived(last ? lastDefined(vals, last.index - 1) : null)}
	{const hv = $derived(focusIndex === null ? undefined : vals[focusIndex])}
	{const lastStats = $derived(last && stats ? stats[last.index] : null)}
	{const hoverStats = $derived(
		focusIndex === null || !stats ? null : stats[focusIndex],
	)}
	<div class="grid pr-1 text-right tabular-nums">
		<div
			class="col-start-1 row-start-1"
			class:invisible={focusIndex !== null}
			aria-hidden={focusIndex !== null}
		>
			{#if last && f}
				<div class="font-semibold">{m.format(last.value)}</div>
				<div class="text-sm font-semibold" style:color={deltaColor(f)}>
					{deltaGlyph(f)} {formatDeltaShort(f.after, f.before, m.key)}
				</div>
				<div class="text-muted text-xs">
					{f.kind === "spike" ? "latest run only" : `since ${formatDay(runs[f.at].startedAt)}`}
				</div>
			{:else if last}
				<div class="font-semibold">{m.format(last.value)}</div>
				<div class="text-muted text-sm">
					{prev ? formatDeltaShort(last.value, prev.value, m.key) : ""}
				</div>
			{:else}
				<div class="text-muted">—</div>
			{/if}
			{#if lastStats}
				<div class="text-muted text-xs">{formatTimingRange(lastStats)}</div>
			{/if}
		</div>
		<div
			class="col-start-1 row-start-1"
			class:invisible={focusIndex === null}
			aria-hidden={focusIndex === null}
		>
			{#if focusIndex !== null}
				<div class="font-semibold">
					{hv === null || hv === undefined ? "—" : m.format(hv)}
				</div>
				<div class="text-muted text-sm">
					{hv === null ? "unavailable" : formatDay(runs[focusIndex].startedAt)}
				</div>
				{#if hoverStats}
					<div class="text-muted text-xs">{formatTimingRange(hoverStats)}</div>
				{/if}
			{/if}
		</div>
	</div>
{/snippet}

<main
	id="main-content"
	tabindex="-1"
	class="mx-auto w-full max-w-dashboard px-page-gutter pt-6 pb-12 focus:outline-none sm:pt-8"
>
	{#if runs.length === 0}
		<h1 class="text-page-heading font-semibold tracking-page-heading">
			Ecosystem CI trends
		</h1>
		<p class="mt-3 rounded-sm border border-hair bg-surface p-4">
			No runs have been stored.
		</p>
	{:else}
		<header class="mb-6 flex flex-wrap items-end justify-between gap-6">
			<div class="min-w-0">
				<p class="mb-3 text-sm font-semibold text-muted">Branch history</p>
				<h1 class="text-page-heading font-semibold tracking-page-heading">
					Ecosystem CI trends
				</h1>
				<p class="mt-3 max-w-prose wrap-anywhere text-ink-2">
					Biome <span class="font-mono">{dataset.branch}</span> ·
					{dataset.repos.length}
					repositories · last {runs.length} runs · latest
					<a class="font-mono" href={latest.commitUrl}
						>{shortSha(latest.sha)}</a
					> {formatDateTime(latest.startedAt)} UTC
				</p>
			</div>
			<form method="GET" class="flex min-w-0 flex-wrap items-end gap-2">
				<label
					for="biome-branch"
					class="grid min-w-0 max-w-full grid-cols-1 gap-1.5"
				>
					<span class="text-sm font-semibold text-ink-2">Biome branch</span>
					<Select
						id="biome-branch"
						class="max-w-64"
						name="branch"
						value={data.branch}
					>
						{#each data.branches as branch (branch)}
							<option value={branch}>
								{branch}
							</option>
						{/each}
					</Select>
				</label>
				<Button primary type="submit">View branch</Button>
			</form>
		</header>

		<div class="mb-6 grid gap-6 lg:grid-cols-2">
			<OverviewLines
				{runs}
				repos={dataset.repos}
				metric="checkMs"
				title={`${METRIC_BY_KEY.checkMs.label} across repositories`}
				hue={METRIC_BY_KEY.checkMs.hue}
				format={METRIC_BY_KEY.checkMs.format}
				minimumAbsoluteSpan={10}
			/>
			<OverviewLines
				{runs}
				repos={dataset.repos}
				metric="scannerMs"
				title={`${METRIC_BY_KEY.scannerMs.label} across repositories`}
				hue={METRIC_BY_KEY.scannerMs.hue}
				format={METRIC_BY_KEY.scannerMs.format}
				minimumAbsoluteSpan={10}
			/>
		</div>

		<section
			aria-label="Repository inspection"
			class="mb-6 rounded-sm border border-hair bg-surface p-4"
		>
			<div class="mb-4 flex flex-wrap items-end gap-x-6 gap-y-4">
				<label
					for="inspect-run"
					class="grid w-full min-w-0 max-w-full grid-cols-1 gap-1.5 sm:w-auto"
					><span class="text-sm font-semibold text-ink-2">Inspect run</span>
					<Select
						id="inspect-run"
						value={pinnedIndex ?? ""}
						onchange={(event) => inspectRun(event.currentTarget.value === "" ? null : Number(event.currentTarget.value))}
						aria-describedby="inspector-help"
					>
						<option value="">Latest observations</option>
						{#each runs as run, index (run.id)}
							<option value={index}>
								{formatDateTime(run.startedAt)}
								UTC / {shortSha(run.sha)} / #{run.id}
							</option>
						{/each}
					</Select>
				</label>
				<div class="flex flex-wrap gap-2">
					<Button
						type="button"
						disabled={pinnedIndex === 0 || runs.length < 2}
						onclick={() => inspectRun((pinnedIndex ?? runs.length - 1) - 1)}
					>
						Previous run
					</Button>
					<Button
						type="button"
						disabled={pinnedIndex === null || pinnedIndex === runs.length - 1}
						onclick={() => inspectRun((pinnedIndex ?? runs.length - 1) + 1)}
					>
						Next run
					</Button>
				</div>
				<label
					for="change-threshold"
					class="grid w-full min-w-0 max-w-full grid-cols-1 gap-1.5 sm:w-auto"
					><span class="text-sm font-semibold text-ink-2"
						>Change threshold</span
					>
					<Select
						id="change-threshold"
						bind:value={threshold}
						aria-describedby="threshold-help"
					>
						<option value={2}>2 standard deviations</option>
						<option value={3}>3 standard deviations</option>
						<option value={5}>5 standard deviations</option>
					</Select>
				</label>
				<label
					for="recent-runs"
					class="grid w-full min-w-0 max-w-full grid-cols-1 gap-1.5 sm:w-auto"
					><span class="text-sm font-semibold text-ink-2"
						>Recent regression window</span
					>
					<Select id="recent-runs" bind:value={recentRuns}>
						<option value={1}>Latest run</option>
						<option value={3}>Last 3 runs</option>
						<option value={5}>Last 5 runs</option>
					</Select>
				</label>
			</div>
			<p id="inspector-help" class="text-muted text-sm">
				Choose a run to inspect every repository, or hover a chart to preview
				it. Historical data below provides a numerical alternative to each
				chart.
			</p>
			<p class="mt-3 text-sm" role="status">
				{pinnedIndex === null ? "Showing the latest available observations for each metric." : `Inspecting run #${runs[pinnedIndex].id}, ${formatDateTime(runs[pinnedIndex].startedAt)} UTC.`}
			</p>
		</section>

		<!-- Both states occupy the same grid cell to keep the table still during hover. -->
		<div class="mb-4 grid items-center text-sm">
			<div
				class="col-start-1 row-start-1 flex flex-wrap items-center gap-x-4"
				class:invisible={!hovered}
				aria-hidden={!hovered}
			>
				<span class="text-sm font-semibold text-muted">Run</span
				><span class="font-mono">{shortSha((hovered ?? latest).sha)}</span>
				<span class="text-ink-2"
					>{formatDateTime((hovered ?? latest).startedAt)}
					UTC</span
				>
			</div>
			<div
				class="col-start-1 row-start-1"
				class:invisible={!!hovered}
				aria-hidden={!!hovered}
			>
				<span class="font-semibold"
					>{newCount} {newCount === 1 ? "repository" : "repositories"} with a
					new regression</span
				>
				<span class="text-ink-2"
					>(last {recentRuns} {recentRuns === 1 ? "run" : "runs"}) ·
					{oldCount}
					with an older one still in effect ·
					{rows.length - newCount - oldCount}
					quiet — sorted in that order.</span
				>
			</div>
		</div>

		<StickyHorizontalScroll
			class="rounded-sm border border-hair bg-surface"
			label="Repository metrics"
		>
			<table class="w-full min-w-dashboard-table table-fixed border-collapse">
				<caption class="sr-only">
					Repository trends for Biome branch {dataset.branch}. Values show
					{hovered ? `run #${hovered.id}` : "the latest available observations"}.
					Timings are medians with sample ranges. Historical data below provides
					all statistics.
				</caption>
				<thead>
					<tr>
						<th
							scope="col"
							class="w-52 border-b border-hair p-4 text-left align-top text-sm font-semibold"
						>
							Customer repository
						</th>
						{#each METRICS as m (m.key)}
							<th
								scope="col"
								class="border-b border-l border-hair p-4 text-left align-top text-sm font-semibold"
							>
								<div class="flex items-center gap-2">
									<span
										class="inline-block h-0.75 w-4 shrink-0 rounded-xs align-middle"
										style:background={m.hue}
									></span><span>{m.label}</span
									><span class="text-muted ml-auto whitespace-nowrap"
										>{hovered ? "at run" : "latest · Δ"}</span
									>
								</div>
							</th>
						{/each}
						<th
							scope="col"
							class="border-b border-l border-hair p-4 text-left align-top text-sm font-semibold"
						>
							<div class="flex flex-col gap-2" title={SEVERITY_NOTE}>
								<span>By severity</span
								><span class="flex flex-wrap gap-1.5 text-ink-2">
									{#each [...SEVERITIES].reverse() as s (s.key)}
										<span class="inline-flex items-center gap-1"
											><span
												class="inline-block size-2.5"
												style:background={s.hue}
											></span>{s.label}</span
										>
									{/each}
								</span>
							</div>
						</th>
					</tr>
				</thead>
				<tbody>
					{#each rows as row, ri (row.repo.slug)}
						{const repo = $derived(row.repo)}
						{const lastRow = $derived(ri === rows.length - 1)}
						{const divider = $derived(ri === firstQuiet && ri > 0)}
						<tr
							class="group"
							class:border-t-2={divider}
							class:border-t-base={divider}
						>
							<th
								scope="row"
								class="border-b border-hair p-4 text-left align-middle wrap-anywhere font-medium group-last:border-b-0"
							>
								<a
									class="wrap-anywhere font-medium"
									href={`https://github.com/${repo.slug}`}
									>{repo.slug}</a
								>
								{#if repo.cells[focusIndex ?? repo.cells.length - 1]?.missing}
									<span class="text-muted block text-sm"
										>No report in {hovered ? "selected" : "latest"} run</span
									>
								{/if}
							</th>
							{#each METRICS as m (m.key)}
								{const vals = $derived(seriesValues(repo, m.key))}
								{const stats = $derived(seriesStats(repo, m.key))}
								{const f = $derived(findingFor(repo, m.key))}
								<td
									class="border-b border-l border-hair p-4 text-left align-middle group-last:border-b-0"
								>
									<div class="grid grid-cols-1 gap-3">
										<TrendLine
											{runs}
											values={vals}
											hue={m.hue}
											zeroBased={m.zeroBased}
											baseline={f ? f.before : null}
											softRelativeSpan={isTime(m.key) ? 1 : null}
											minimumSpan={isTime(m.key) ? 10 : null}
											markers={f ? [f.at] : []}
											ranges={isTime(m.key) ? seriesRanges(repo, m.key) : []}
											height={lastRow ? 104 : 88}
											axis={lastRow ? "dates" : "none"}
											ariaLabel={`${m.label} for ${repo.slug} over ${runs.length} runs`}
										/>
										{@render deltaCell(m, vals, stats, f)}
									</div>
								</td>
							{/each}
							{const totals = $derived(severityTotals(repo))}
							{const lastTotal = $derived(lastDefined(totals))}
							{const sevFinding = $derived(
								SEVERITIES.map((s) => findingFor(repo, s.key))
									.filter((x): x is Finding => !!x)
									.sort(
										(a, b) => Number(b.worse) - Number(a.worse) || b.at - a.at,
									)[0],
							)}
							{const latestAt = $derived(lastTotal?.index ?? null)}
							{const latestCell = $derived(
								latestAt === null ? null : repo.cells[latestAt],
							)}
							{const hoverCell = $derived(
								focusIndex === null ? null : repo.cells[focusIndex],
							)}
							<td
								class="border-b border-l border-hair p-4 text-left align-middle group-last:border-b-0"
							>
								<div class="grid grid-cols-1 gap-3">
									<StackedArea
										{runs}
										layers={SEVERITIES.map((s) => ({ key: s.key, label: s.label, hue: s.hue, values: seriesValues(repo, s.key) }))}
										height={lastRow ? 104 : 88}
										axis={lastRow ? "dates" : "none"}
										ariaLabel={`${SEVERITY_LABEL} for ${repo.slug} over ${runs.length} runs`}
									/>
									<div class="grid pr-1 text-right tabular-nums">
										<div
											class="col-start-1 row-start-1"
											class:invisible={focusIndex !== null}
											aria-hidden={focusIndex !== null}
										>
											{#if latestCell && !latestCell.missing && latestAt !== null}
												<div class="font-semibold">
													{formatCount(totals[latestAt] as number)}
												</div>
												<div class="text-muted text-sm">
													{latestCell.errors}
													errors · {latestCell.warnings} warnings ·
													{latestCell.infos}
													info
												</div>
											{:else}
												<div class="text-muted">—</div>
											{/if}
											{#if sevFinding}
												<div
													class="text-sm font-semibold"
													style:color={deltaColor(sevFinding)}
												>
													{deltaGlyph(sevFinding)}
													{formatDeltaShort(sevFinding.after, sevFinding.before, sevFinding.metric.key)}
													{sevFinding.metric.label.toLowerCase()}
												</div>
												<div class="text-muted text-xs">
													since {formatDay(runs[sevFinding.at].startedAt)}
												</div>
											{/if}
										</div>
										<div
											class="col-start-1 row-start-1"
											class:invisible={focusIndex === null}
											aria-hidden={focusIndex === null}
										>
											{#if focusIndex !== null && hoverCell && !hoverCell.missing}
												<div class="font-semibold">
													{formatCount(totals[focusIndex] as number)}
												</div>
												<div class="text-muted text-sm">
													{hoverCell.errors}
													errors · {hoverCell.warnings} warnings ·
													{hoverCell.infos}
													info
												</div>
											{:else}
												<div class="text-muted">—</div>
											{/if}
										</div>
									</div>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</StickyHorizontalScroll>
		<p id="threshold-help" class="text-muted mt-3 text-sm">
			Each cell is scaled to its own range. Time cells plot the median of each
			run's samples with a band from min to max. Coloured ▲/▼ = a detected
			change (≥{threshold}σ from the baseline, held ≥2 runs, or the latest run
			alone); the grey line is that baseline and the vertical marker the change
			point. Plain deltas are vs the previous run and not significant. Severity
			column: total, then errors · warnings · info — {SEVERITY_NOTE}.
		</p>
		<HistoryTable {runs} repos={dataset.repos} />
	{/if}
</main>
