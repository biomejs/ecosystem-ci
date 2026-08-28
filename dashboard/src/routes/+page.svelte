<script lang="ts">
import BarChart from "$lib/components/BarChart.svelte";
import LineChart from "$lib/components/LineChart.svelte";
import type { PageData } from "./$types";

let { data }: { data: PageData } = $props();

const historyRuns = $derived(
	data.selectedRun
		? data.runs
				.filter((run) => run.biomeBranch === data.selectedRun?.biomeBranch)
				.toReversed()
		: [],
);
const repositories = $derived(
	[...new Set(data.history.map((point) => point.repositorySlug))].sort(),
);
let selectedRepository = $state("");
const totals = $derived(
	data.results.reduce(
		(sum, result) => ({
			errors: sum.errors + result.errors,
			warnings: sum.warnings + result.warnings,
			infos: sum.infos + result.infos,
			panics: sum.panics + result.panics,
		}),
		{ errors: 0, warnings: 0, infos: 0, panics: 0 },
	),
);
const durationBars = $derived(
	data.results.flatMap((result) =>
		result.checkDurationNs === null
			? []
			: [
					{
						label: result.repositorySlug,
						value: result.checkDurationNs / 1_000_000,
					},
				],
	),
);
const durationHistory = $derived(
	historyRuns.flatMap((run) => {
		const point = data.history.find(
			(item) =>
				item.repositorySlug === selectedRepository &&
				item.githubRunId === run.githubRunId,
		);
		if (!point || point.checkDurationNs === null) return [];
		return [
			{
				label: formatDay(run.startedAt),
				values: { duration: point.checkDurationNs / 1_000_000 },
			},
		];
	}),
);
const diagnosticHistory = $derived(
	historyRuns.flatMap((run) => {
		const point = data.history.find(
			(item) =>
				item.repositorySlug === selectedRepository &&
				item.githubRunId === run.githubRunId,
		);
		if (!point) return [];
		return [
			{
				label: formatDay(run.startedAt),
				values: {
					errors: point.errors,
					warnings: point.warnings,
					infos: point.infos,
					panics: point.panics,
				},
			},
		];
	}),
);

const durationSeries = [
	{ key: "duration", label: "Check time", color: "#2563eb" },
];
const diagnosticSeries = [
	{ key: "errors", label: "Errors", color: "#dc2626" },
	{ key: "warnings", label: "Warnings", color: "#d97706" },
	{ key: "infos", label: "Info", color: "#2563eb" },
	{ key: "panics", label: "Panics", color: "#7c3aed" },
];

$effect(() => {
	if (repositories.length > 0 && !repositories.includes(selectedRepository)) {
		selectedRepository = repositories.includes("dyc3/opentogethertube")
			? "dyc3/opentogethertube"
			: repositories[0];
	}
});

function formatDate(value: string): string {
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hour12: false,
		timeZone: "UTC",
		timeZoneName: "short",
	}).format(new Date(value));
}

function formatDay(value: string): string {
	return new Intl.DateTimeFormat("en-US", {
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	}).format(new Date(value));
}

function formatDuration(milliseconds: number | null): string {
	if (milliseconds === null) return "—";
	if (milliseconds < 1_000) return `${Math.round(milliseconds)} ms`;
	return `${(milliseconds / 1_000).toFixed(2)} s`;
}

function _formatCount(value: number): string {
	return Math.round(value).toLocaleString("en-US");
}
</script>

<svelte:head> <title>Ecosystem CI</title> </svelte:head>

<main class="mx-auto min-h-screen max-w-[1500px] px-4 py-8 sm:px-6 lg:px-8">
	<header class="mb-8 border-b border-slate-300 pb-5">
		<div class="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
			<div>
				<h1 class="text-2xl font-semibold tracking-tight text-slate-950">
					Ecosystem CI
				</h1>
			</div>

			{#if data.runs.length > 0}
				<form method="GET" class="flex items-end gap-2">
					<label class="grid gap-1 text-xs font-medium text-slate-600">
						Run
						<select
							name="run"
							class="min-w-64 rounded border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900"
						>
							{#each data.runs as run}
								<option
									value={run.githubRunId}
									selected={run.githubRunId === data.selectedRun?.githubRunId}
								>
									#{run.githubRunId}
									· {formatDate(run.startedAt)}
								</option>
							{/each}
						</select>
					</label>
					<button
						type="submit"
						class="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
					>
						Load
					</button>
				</form>
			{/if}
		</div>
	</header>

	{#if data.selectedRun}
		<section class="mb-8" aria-labelledby="run-heading">
			<div class="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
				<h2 id="run-heading" class="text-lg font-semibold text-slate-950">
					Run
					<a
						class="font-mono underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900"
						href={`https://github.com/biomejs/ecosystem-ci/actions/runs/${data.selectedRun.githubRunId}`}
					>
						#{data.selectedRun.githubRunId}
					</a>
				</h2>
				<span class="text-sm text-slate-600"
					>{formatDate(data.selectedRun.startedAt)}</span
				>
			</div>

			<div
				class="grid border border-slate-300 bg-white sm:grid-cols-2 lg:grid-cols-6"
			>
				<div class="border-b border-slate-200 p-4 lg:border-r lg:border-b-0">
					<div class="label">Biome branch</div>
					<div class="mt-1 font-mono text-sm">
						{data.selectedRun.biomeBranch}
					</div>
				</div>
				<div class="border-b border-slate-200 p-4 lg:border-r lg:border-b-0">
					<div class="label">Biome commit</div>
					<a
						class="mt-1 block font-mono text-sm underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900"
						href={`https://github.com/biomejs/biome/commit/${data.selectedRun.biomeCommitSha}`}
					>
						{data.selectedRun.biomeCommitSha.slice(0, 8)}
					</a>
				</div>
				<div class="border-b border-slate-200 p-4 lg:border-r lg:border-b-0">
					<div class="label">Repositories</div>
					<div class="mt-1 font-mono text-sm">{data.selectedRun.results}</div>
				</div>
				<div class="border-b border-slate-200 p-4 sm:border-r lg:border-b-0">
					<div class="label">Errors</div>
					<div class="mt-1 font-mono text-sm">{totals.errors}</div>
				</div>
				<div class="border-b border-slate-200 p-4 sm:border-b-0 lg:border-r">
					<div class="label">Warnings</div>
					<div class="mt-1 font-mono text-sm">{totals.warnings}</div>
				</div>
				<div class="p-4">
					<div class="label">Panics</div>
					<div class="mt-1 font-mono text-sm">{totals.panics}</div>
				</div>
			</div>
		</section>

		<section class="mb-10" aria-labelledby="charts-heading">
			<div
				class="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"
			>
				<div>
					<h2 id="charts-heading" class="section-heading mb-0">Charts</h2>
					<p class="mt-1 text-sm text-slate-600">
						Trends use runs from the {data.selectedRun.biomeBranch} branch.
					</p>
				</div>
				<label class="grid gap-1 text-xs font-medium text-slate-600">
					Repository trend
					<select
						bind:value={selectedRepository}
						class="min-w-64 rounded border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900"
					>
						{#each repositories as repositorySlug}
							<option value={repositorySlug}>{repositorySlug}</option>
						{/each}
					</select>
				</label>
			</div>

			<div class="grid gap-4 xl:grid-cols-2">
				<div class="chart-panel xl:col-span-2">
					<h3 class="chart-title">Check time by repository</h3>
					<p class="chart-subtitle">Run #{data.selectedRun.githubRunId}</p>
					<BarChart
						entries={durationBars}
						formatValue={formatDuration}
						ariaLabel={`Check duration by repository for run ${data.selectedRun.githubRunId}`}
					/>
				</div>

				<div class="chart-panel">
					<h3 class="chart-title">Check time over time</h3>
					<p class="chart-subtitle font-mono">{selectedRepository}</p>
					<LineChart
						points={durationHistory}
						series={durationSeries}
						formatValue={formatDuration}
						ariaLabel={`Check duration trend for ${selectedRepository}`}
					/>
				</div>

				<div class="chart-panel">
					<h3 class="chart-title">Diagnostics over time</h3>
					<p class="chart-subtitle font-mono">{selectedRepository}</p>
					<LineChart
						points={diagnosticHistory}
						series={diagnosticSeries}
						formatValue={_formatCount}
						ariaLabel={`Diagnostic trend for ${selectedRepository}`}
					/>
				</div>
			</div>
		</section>

		<section class="mb-10" aria-labelledby="results-heading">
			<h2 id="results-heading" class="section-heading">Repository results</h2>
			<div class="table-frame">
				<table>
					<thead>
						<tr>
							<th>Repository</th>
							<th>Check</th>
							<th class="numeric">Errors</th>
							<th class="numeric">Warnings</th>
							<th class="numeric">Info</th>
							<th class="numeric">Parse</th>
							<th class="numeric">Panics</th>
							<th class="numeric">Check time</th>
							<th class="numeric">Scanner</th>
							<th class="numeric">Job</th>
						</tr>
					</thead>
					<tbody>
						{#each data.results as result}
							<tr>
								<td>
									<a
										class="font-medium underline decoration-slate-300 underline-offset-4 hover:decoration-slate-900"
										href={`https://github.com/${result.repositorySlug}`}
									>
										{result.repositorySlug}
									</a>
									<a
										class="ml-2 font-mono text-xs text-slate-500 hover:text-slate-900"
										href={`https://github.com/${result.repositorySlug}/commit/${result.repositoryCommitSha}`}
									>
										{result.repositoryCommitSha.slice(0, 7)}
									</a>
								</td>
								<td>
									<span
										class={result.checkOutcome === 'passed'
											? 'status status-pass'
											: 'status status-fail'}
									>
										{result.checkOutcome}
									</span>
								</td>
								<td class="numeric">{result.errors}</td>
								<td class="numeric">{result.warnings}</td>
								<td class="numeric">{result.infos}</td>
								<td class="numeric">{result.parseDiagnostics}</td>
								<td class="numeric">{result.panics}</td>
								<td class="numeric">
									{formatDuration((result.checkDurationNs ?? 0) / 1_000_000)}
								</td>
								<td class="numeric">
									{formatDuration((result.scannerDurationNs ?? 0) / 1_000_000)}
								</td>
								<td class="numeric">{formatDuration(result.jobDurationMs)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		{#if data.ruleCounts.length > 0}
			<section aria-labelledby="rules-heading">
				<h2 id="rules-heading" class="section-heading">
					Most frequent rule diagnostics
				</h2>
				<div class="table-frame max-w-4xl">
					<table>
						<thead>
							<tr>
								<th>Repository</th>
								<th>Rule</th>
								<th>Severity</th>
								<th class="numeric">Count</th>
							</tr>
						</thead>
						<tbody>
							{#each data.ruleCounts as rule}
								<tr>
									<td>{rule.repositorySlug}</td>
									<td class="font-mono text-xs">{rule.category}</td>
									<td>{rule.severity}</td>
									<td class="numeric">{rule.count}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		{/if}
	{:else}
		<p class="border border-slate-300 bg-white p-5 text-sm text-slate-700">
			No runs have been stored.
		</p>
	{/if}
</main>
