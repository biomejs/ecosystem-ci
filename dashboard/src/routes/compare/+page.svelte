<script lang="ts">
import { formatDateTime, shortSha } from "$lib/trends/format";
import type { PageData } from "./$types";
import ComparisonTable from "./ComparisonTable.svelte";

let { data }: { data: PageData } = $props();

const runLabel = (run: (typeof data.runs)[number]): string =>
	`${run.biomeBranch} · ${formatDateTime(run.startedAt)} · ${shortSha(run.biomeCommitSha)}`;
</script>

<svelte:head>
	<title>Compare runs · Ecosystem CI</title>
</svelte:head>

<main class="comparison-shell">
	<header class="page-heading">
		<a href="/">← Ecosystem CI trends</a>
	</header>

	{#if data.base && data.head}
		<form class="run-picker" method="GET">
			<label>
				<span>Baseline run</span>
				<select name="base">
					{#each data.runs as run (run.githubRunId)}
						<option
							value={run.githubRunId}
							selected={run.githubRunId === data.base.githubRunId}
						>
							{runLabel(run)}
						</option>
					{/each}
				</select>
				<small>
					<span class="branch-name">{data.base.biomeBranch}</span>
					<a
						href={`https://github.com/biomejs/biome/commit/${data.base.biomeCommitSha}`}
						>{shortSha(data.base.biomeCommitSha)}</a
					>
					<span>{data.base.results} reports</span>
				</small>
			</label>
			<span class="direction" aria-hidden="true">→</span>
			<label>
				<span>Compared run</span>
				<select name="head">
					{#each data.runs as run (run.githubRunId)}
						<option
							value={run.githubRunId}
							selected={run.githubRunId === data.head.githubRunId}
						>
							{runLabel(run)}
						</option>
					{/each}
				</select>
				<small>
					<span class="branch-name">{data.head.biomeBranch}</span>
					<a
						href={`https://github.com/biomejs/biome/commit/${data.head.biomeCommitSha}`}
						>{shortSha(data.head.biomeCommitSha)}</a
					>
					<span>{data.head.results} reports</span>
				</small>
			</label>
			<button type="submit">Compare</button>
		</form>
	{/if}

	{#if !data.base || !data.head}
		<p class="empty-state">
			At least two stored runs are needed for a comparison.
		</p>
	{:else if data.comparisons.length === 0}
		<p class="empty-state">No shared repository results.</p>
	{:else}
		<ComparisonTable comparisons={data.comparisons} />
	{/if}
</main>

<style>
.comparison-shell {
	width: min(100%, 76rem);
	margin: 0 auto;
	padding: 1.75rem 1.5rem 2rem;
	overflow-x: clip;
}

.page-heading > a {
	color: var(--muted);
	font-size: 0.8rem;
}

.run-picker {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) auto;
	gap: 1rem;
	align-items: center;
	margin-top: 0.75rem;
	padding: 1rem;
	border: 1px solid var(--hair);
	background: var(--surface);
}

.run-picker label {
	min-width: 0;
}

.run-picker label > span:first-child {
	display: block;
	margin-bottom: 0.4rem;
	color: var(--muted);
	font-size: 0.72rem;
	font-weight: 650;
	letter-spacing: 0.04em;
	text-transform: uppercase;
}

.run-picker select {
	display: block;
	width: 100%;
	min-width: 0;
	height: 2.6rem;
	padding: 0 0.75rem;
	overflow: hidden;
	border: 1px solid var(--base);
	text-overflow: ellipsis;
}

.run-picker small {
	display: flex;
	min-width: 0;
	gap: 0.65rem;
	margin-top: 0.45rem;
	color: var(--muted);
	font-size: 0.74rem;
}

.run-picker small > * {
	flex: 0 0 auto;
}

.run-picker .branch-name {
	min-width: 0;
	flex: 1 1 auto;
	overflow: hidden;
	color: var(--ink-2);
	font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.direction {
	color: var(--muted);
	font-size: 1.2rem;
}

.run-picker button {
	height: 2.6rem;
	padding: 0 1rem;
	border: 1px solid var(--base);
	background: var(--page);
	font-weight: 650;
}

.run-picker button:hover {
	background: var(--hair);
}

.empty-state {
	margin-top: 1.5rem;
	padding: 1.25rem;
	border: 1px solid var(--hair);
	background: var(--surface);
}

@media (max-width: 800px) {
	.run-picker {
		grid-template-columns: 1fr;
		gap: 1rem;
	}

	.direction {
		display: none;
	}

	.run-picker button {
		width: 100%;
	}
}

@media (max-width: 520px) {
	.comparison-shell {
		padding: 1.25rem 1rem 2rem;
	}
}
</style>
