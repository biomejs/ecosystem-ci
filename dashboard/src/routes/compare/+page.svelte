<script lang="ts">
import { page } from "$app/state";
import Button from "$lib/Button.svelte";
import Select from "$lib/Select.svelte";
import { formatDateTime, shortSha } from "$lib/trends/format";
import type { PageData } from "./$types";
import ComparisonTable from "./ComparisonTable.svelte";
import { selectTimingView } from "./timing-view";

let { data }: { data: PageData } = $props();
const timingView = $derived(
	selectTimingView(page.url.searchParams.get("view")),
);
const runLabel = (run: (typeof data.runs)[number]): string =>
	`${run.biomeBranch} · ${formatDateTime(run.startedAt)} · ${shortSha(run.biomeCommitSha)}`;
</script>

<svelte:head><title>Compare runs · Ecosystem CI</title></svelte:head>

{#snippet runSummary(run: NonNullable<PageData["base"]>, id: string)}
	<div {id} class="mt-2 flex min-w-0 flex-wrap gap-2.5 text-muted text-sm">
		<span class="w-full wrap-anywhere font-mono text-ink-2"
			>{run.biomeBranch}</span
		>
		<a href={`https://github.com/biomejs/biome/commit/${run.biomeCommitSha}`}
			>{shortSha(run.biomeCommitSha)}</a
		>
		<span>{run.results} reports</span>
	</div>
{/snippet}

<main
	id="main-content"
	tabindex="-1"
	class="mx-auto w-full max-w-dashboard px-page-gutter pt-6 pb-12 focus:outline-none sm:pt-8"
>
	<header class="mb-6">
		<a class="text-muted text-sm" href="/">← Ecosystem CI trends</a>
		<h1 class="mt-3 mb-2 text-page-heading font-semibold tracking-page-heading">
			Compare runs
		</h1>
		<p class="text-ink-2">
			Compare customer repository results between two Biome runs.
		</p>
	</header>
	{#if data.base && data.head}
		<form
			class="grid grid-cols-1 items-start gap-6 rounded-sm border border-hair bg-surface p-4 lg:grid-cols-picker"
			method="GET"
		>
			<div class="min-w-0">
				<label
					class="mb-1.5 block text-sm font-semibold text-muted"
					for="baseline-run"
					>Baseline run</label
				>
				<Select
					id="baseline-run"
					class="w-full"
					name="base"
					value={data.base.githubRunId}
					aria-describedby="baseline-metadata"
				>
					{#each data.runs as run (run.githubRunId)}
						<option value={run.githubRunId}>
							{runLabel(run)}
						</option>
					{/each}
				</Select>
				{@render runSummary(data.base, "baseline-metadata")}
			</div>
			<span class="mt-9 hidden text-muted text-xl lg:block" aria-hidden="true"
				>→</span
			>
			<div class="min-w-0">
				<label
					class="mb-1.5 block text-sm font-semibold text-muted"
					for="compared-run"
					>Compared run</label
				>
				<Select
					id="compared-run"
					class="w-full"
					name="head"
					value={data.head.githubRunId}
					aria-describedby="compared-metadata"
				>
					{#each data.runs as run (run.githubRunId)}
						<option value={run.githubRunId}>
							{runLabel(run)}
						</option>
					{/each}
				</Select>
				{@render runSummary(data.head, "compared-metadata")}
			</div>
			<input type="hidden" name="view" value={timingView}>
			<Button primary class="w-full lg:mt-7 lg:w-auto" type="submit">
				Compare
			</Button>
		</form>
	{/if}
	{#if !data.base || !data.head}
		<p class="mt-6 rounded-sm border border-hair bg-surface p-5">
			At least two stored runs are needed for a comparison.
		</p>
	{:else if data.comparisons.length === 0}
		<p class="mt-6 rounded-sm border border-hair bg-surface p-5">
			No shared repository results.
		</p>
	{:else}
		<ComparisonTable comparisons={data.comparisons} {timingView} />
	{/if}
</main>
