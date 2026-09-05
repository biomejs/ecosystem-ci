<script lang="ts">
import { page } from "$app/state";
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

<svelte:head>
	<title>Compare runs · Ecosystem CI</title>
</svelte:head>

{#snippet runSummary(run: NonNullable<PageData["base"]>)}
	<small class="mt-2 flex min-w-0 gap-2.5 text-muted text-xs">
		<span class="min-w-0 flex-auto truncate font-mono text-ink-2"
			>{run.biomeBranch}</span
		>
		<a
			class="shrink-0"
			href={`https://github.com/biomejs/biome/commit/${run.biomeCommitSha}`}
			>{shortSha(run.biomeCommitSha)}</a
		>
		<span class="shrink-0">{run.results} reports</span>
	</small>
{/snippet}

<main
	class="mx-auto w-full max-w-compare overflow-x-clip px-4 pt-5 pb-8 sm:px-6 sm:pt-7"
>
	<header>
		<a class="text-muted text-xs" href="/">← Ecosystem CI trends</a>
	</header>

	{#if data.base && data.head}
		<form
			class="mt-3 grid grid-cols-1 items-center gap-4 border border-hair bg-surface p-4 md:grid-cols-picker"
			method="GET"
		>
			<label class="min-w-0">
				<span class="eyebrow mb-1.5 block">Baseline run</span>
				<select
					class="block h-10 w-full min-w-0 truncate border border-base px-3"
					name="base"
				>
					{#each data.runs as run (run.githubRunId)}
						<option
							value={run.githubRunId}
							selected={run.githubRunId === data.base.githubRunId}
						>
							{runLabel(run)}
						</option>
					{/each}
				</select>
				{@render runSummary(data.base)}
			</label>
			<span class="hidden text-muted text-xl md:block" aria-hidden="true"
				>→</span
			>
			<label class="min-w-0">
				<span class="eyebrow mb-1.5 block">Compared run</span>
				<select
					class="block h-10 w-full min-w-0 truncate border border-base px-3"
					name="head"
				>
					{#each data.runs as run (run.githubRunId)}
						<option
							value={run.githubRunId}
							selected={run.githubRunId === data.head.githubRunId}
						>
							{runLabel(run)}
						</option>
					{/each}
				</select>
				{@render runSummary(data.head)}
			</label>
			<input type="hidden" name="view" value={timingView}>
			<button
				class="h-10 w-full border border-base bg-page px-4 font-semibold hover:bg-hair md:w-auto"
				type="submit"
			>
				Compare
			</button>
		</form>
	{/if}

	{#if !data.base || !data.head}
		<p class="mt-6 border border-hair bg-surface p-5">
			At least two stored runs are needed for a comparison.
		</p>
	{:else if data.comparisons.length === 0}
		<p class="mt-6 border border-hair bg-surface p-5">
			No shared repository results.
		</p>
	{:else}
		<ComparisonTable comparisons={data.comparisons} {timingView} />
	{/if}
</main>
