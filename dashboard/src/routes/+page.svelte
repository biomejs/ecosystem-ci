<script lang="ts">
// Repositories × metrics trellis, one small chart per cell, one shared hover.
// A cell whose series has a detected change shows the change point and baseline on
// its chart and a coloured ▲/▼ delta vs baseline; small deltas stay plain.
// Repositories with a new regression sort to the top.
import StackedArea from "$lib/trends/StackedArea.svelte";
import OverviewLines from "$lib/trends/OverviewLines.svelte";
import TrendLine from "$lib/trends/TrendLine.svelte";
import {
	METRICS,
	SEVERITIES,
	SEVERITY_LABEL,
	SEVERITY_NOTE,
	buildDataset,
	formatDeltaShort,
	isTime,
	lastDefined,
	seriesValues,
	severityTotals,
	type Metric,
	type Repo,
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
import { hover } from "$lib/trends/hover.svelte";
import type { PageData } from "./$types";

let { data }: { data: PageData } = $props();

const dataset = $derived(buildDataset(data.runs, data.history));
const runs = $derived(dataset.runs);
const latest = $derived(runs[runs.length - 1]);
const hovered = $derived(hover.index === null ? null : runs[hover.index]);

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
				Number(b.newRegressions.length > 0) - Number(a.newRegressions.length > 0) ||
				Number(b.regressions.length > 0) - Number(a.regressions.length > 0) ||
				a.repo.slug.localeCompare(b.repo.slug),
		),
);
const newCount = $derived(rows.filter((r) => r.newRegressions.length > 0).length);
const oldCount = $derived(
	rows.filter((r) => r.newRegressions.length === 0 && r.regressions.length > 0).length,
);
const firstQuiet = $derived(rows.findIndex((r) => r.regressions.length === 0));
</script>

<svelte:head><title>Ecosystem CI</title></svelte:head>

{#snippet deltaCell(m: Metric, vals: (number | null)[], f: Finding | undefined)}
	{@const last = lastDefined(vals)}
	{@const prev = last ? lastDefined(vals, last.index - 1) : null}
	{@const hv = hover.index === null ? undefined : vals[hover.index]}
	<div class="num grid pr-1 text-right">
		<div
			class="col-start-1 row-start-1"
			class:invisible={hover.index !== null}
			aria-hidden={hover.index !== null}
		>
			{#if last && f}
				<div class="font-semibold">{m.format(last.value)}</div>
				<div class="text-compact font-semibold" style:color={deltaColor(f)}>
					{deltaGlyph(f)} {formatDeltaShort(f.after, f.before, m.key)}
				</div>
				<div class="muted text-micro">
					{f.kind === "spike" ? "latest run only" : `since ${formatDay(runs[f.at].startedAt)}`}
				</div>
			{:else if last}
				<div class="font-semibold">{m.format(last.value)}</div>
				<div class="muted text-compact">{prev ? formatDeltaShort(last.value, prev.value, m.key) : ""}</div>
			{:else}
				<div class="muted">—</div>
			{/if}
		</div>
		<div
			class="col-start-1 row-start-1"
			class:invisible={hover.index === null}
			aria-hidden={hover.index === null}
		>
			{#if hover.index !== null}
				<div class="font-semibold">{hv === null || hv === undefined ? "—" : m.format(hv)}</div>
				<div class="muted text-compact">{hv === null ? "no report" : formatDay(runs[hover.index].startedAt)}</div>
			{/if}
		</div>
	</div>
{/snippet}

<main class="mx-auto max-w-dashboard px-6 py-5">
	{#if runs.length === 0}
		<h1 class="text-lg font-semibold">Ecosystem CI trends</h1>
		<p class="panel mt-3 p-4">No runs have been stored.</p>
	{:else}
		<header class="mb-3 flex flex-wrap items-end justify-between gap-3">
			<div>
				<h1 class="text-lg font-semibold">Ecosystem CI trends</h1>
				<p class="ink-2">
					Biome <span class="mono">{dataset.branch}</span> · {dataset.repos.length} repositories · last {runs.length} runs · latest
					<a class="mono" href={latest.commitUrl}>{shortSha(latest.sha)}</a>
					{formatDateTime(latest.startedAt)} UTC
				</p>
			</div>
			<div class="flex flex-wrap items-center gap-3 text-xs">
				<label class="flex items-center gap-2">
					<span class="eyebrow">Flag changes over</span>
					<select class="panel px-2 py-1" bind:value={threshold}>
						<option value={2}>2σ</option>
						<option value={3}>3σ</option>
						<option value={5}>5σ</option>
					</select>
				</label>
				<label class="flex items-center gap-2">
					<span class="eyebrow">New =</span>
					<select class="panel px-2 py-1" bind:value={recentRuns}>
						<option value={1}>latest run</option>
						<option value={3}>last 3 runs</option>
						<option value={5}>last 5 runs</option>
					</select>
				</label>
			</div>
		</header>

		<div class="mb-3 grid gap-3 lg:grid-cols-2">
			<OverviewLines
				{runs}
				repos={dataset.repos}
				metric="checkMs"
				title="Check time across repositories"
				hue="var(--blue)"
				format={METRICS[0].format}
			/>
			<OverviewLines
				{runs}
				repos={dataset.repos}
				metric="scannerMs"
				title="Scanner time across repositories"
				hue="var(--violet)"
				format={METRICS[1].format}
			/>
		</div>

		<div class="panel mb-3 flex min-h-9 flex-wrap items-center gap-x-4 px-3 py-1.5 text-xs" aria-live="polite">
			{#if hovered}
				<span class="eyebrow">Run</span>
				<a class="mono" href={hovered.commitUrl}>{shortSha(hovered.sha)}</a>
				<span class="ink-2">{formatDateTime(hovered.startedAt)} UTC</span>
				<a href={hovered.url}>workflow run</a>
			{:else}
				<span>
					<span class="font-semibold">{newCount} {newCount === 1 ? "repository" : "repositories"} with a new regression</span>
					<span class="ink-2">(last {recentRuns} {recentRuns === 1 ? "run" : "runs"}) · {oldCount} with an older one still in effect · {rows.length - newCount - oldCount} quiet — sorted in that order.</span>
				</span>
				<span class="muted ml-auto">Hover any chart to read one run across every cell. ← → scrubs.</span>
			{/if}
		</div>

		<div class="panel overflow-x-auto">
			<div class="grid min-w-dashboard-table" style="grid-template-columns: 12rem repeat(4, minmax(0, 1fr)) minmax(0, 1.2fr)">
				<div class="border-b px-3 py-2" style="border-color: var(--hair)"></div>
				{#each METRICS as m}
					<div class="border-b border-l px-3 py-2" style="border-color: var(--hair)">
						<div class="flex items-center gap-2">
							<span class="key" style:background={m.hue}></span>
							<span class="font-semibold">{m.label}</span>
							<span class="muted ml-auto whitespace-nowrap text-compact">{hovered ? "at run" : "latest · Δ"}</span>
						</div>
					</div>
				{/each}
				<div class="border-b border-l px-3 py-2" style="border-color: var(--hair)">
					<div class="flex items-center gap-2 whitespace-nowrap" title={SEVERITY_NOTE}>
						<span class="font-semibold">By severity</span>
						<span class="ml-auto flex gap-1.5 text-compact ink-2">
							{#each [...SEVERITIES].reverse() as s}
								<span class="inline-flex items-center gap-1"><span class="inline-block size-2.5" style:background={s.hue}></span>{s.label}</span>
							{/each}
						</span>
					</div>
				</div>

				{#each rows as row, ri (row.repo.slug)}
					{@const repo = row.repo}
					{@const lastRow = ri === rows.length - 1}
					{@const divider = ri === firstQuiet && ri > 0}
					<div class="flex flex-col justify-center px-3 py-2" style="border-bottom: 1px solid var(--hair)" style:border-top={divider ? "2px solid var(--base)" : "none"}>
						<a class="wrap-anywhere font-medium" href={`https://github.com/${repo.slug}`}>{repo.slug}</a>
						{#if repo.cells[repo.cells.length - 1]?.missing}
							<span class="muted text-compact">no report in latest run</span>
						{/if}
					</div>
					{#each METRICS as m}
						{@const vals = seriesValues(repo, m.key)}
						{@const f = findingFor(repo, m.key)}
						<div class="metric-cell grid items-center gap-2 border-l px-2 py-1" style="border-color: var(--hair); border-bottom: 1px solid var(--hair)" style:border-top={divider ? "2px solid var(--base)" : "none"}>
							<TrendLine
								{runs}
								values={vals}
								hue={m.hue}
								format={m.format}
								zeroBased={m.zeroBased}
								baseline={f ? f.before : null}
								softRelativeSpan={isTime(m.key) ? 1 : null}
								markers={f ? [f.at] : []}
								height={lastRow ? 74 : 60}
								axis={lastRow ? "dates" : "none"}
								ariaLabel={`${m.label} for ${repo.slug} over ${runs.length} runs`}
							/>
							{@render deltaCell(m, vals, f)}
						</div>
					{/each}
					{@const totals = severityTotals(repo)}
					{@const lastTotal = lastDefined(totals)}
					{@const sevFinding = SEVERITIES.map((s) => findingFor(repo, s.key))
						.filter((x): x is Finding => !!x)
						.sort((a, b) => Number(b.worse) - Number(a.worse) || b.at - a.at)[0]}
					{@const latestAt = lastTotal?.index ?? null}
					{@const latestCell = latestAt === null ? null : repo.cells[latestAt]}
					{@const hoverCell = hover.index === null ? null : repo.cells[hover.index]}
					<div class="severity-cell grid items-center gap-2 border-l px-2 py-1" style="border-color: var(--hair); border-bottom: 1px solid var(--hair)" style:border-top={divider ? "2px solid var(--base)" : "none"}>
						<StackedArea
							{runs}
							layers={SEVERITIES.map((s) => ({ key: s.key, label: s.label, hue: s.hue, values: seriesValues(repo, s.key) }))}
							height={lastRow ? 74 : 60}
							axis={lastRow ? "dates" : "none"}
							ariaLabel={`${SEVERITY_LABEL} for ${repo.slug} over ${runs.length} runs`}
						/>
						<div class="num grid pr-1 text-right">
							<div
								class="col-start-1 row-start-1"
								class:invisible={hover.index !== null}
								aria-hidden={hover.index !== null}
							>
								{#if latestCell && !latestCell.missing && latestAt !== null}
									<div class="font-semibold">{formatCount(totals[latestAt] as number)}</div>
									<div class="muted text-compact">{latestCell.errors} · {latestCell.warnings} · {latestCell.infos}</div>
								{:else}
									<div class="muted">—</div>
								{/if}
								{#if sevFinding}
									<div class="text-compact font-semibold" style:color={deltaColor(sevFinding)}>
										{deltaGlyph(sevFinding)} {formatDeltaShort(sevFinding.after, sevFinding.before, sevFinding.metric.key)} {sevFinding.metric.label.toLowerCase()}
									</div>
									<div class="muted text-micro">since {formatDay(runs[sevFinding.at].startedAt)}</div>
								{/if}
							</div>
							<div
								class="col-start-1 row-start-1"
								class:invisible={hover.index === null}
								aria-hidden={hover.index === null}
							>
								{#if hover.index !== null && hoverCell && !hoverCell.missing}
									<div class="font-semibold">{formatCount(totals[hover.index] as number)}</div>
									<div class="muted text-compact">{hoverCell.errors} · {hoverCell.warnings} · {hoverCell.infos}</div>
								{:else}
									<div class="muted">—</div>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			</div>
		</div>
		<p class="muted mt-2 text-xs">
			Each cell is scaled to its own range. Coloured ▲/▼ = a detected change (≥{threshold}σ from the baseline, held ≥2 runs, or the latest run alone); the grey line is that baseline and the vertical marker the change point. Plain deltas are vs the previous run and not significant. Severity column: total, then errors · warnings · info — {SEVERITY_NOTE}.
		</p>
	{/if}
</main>
