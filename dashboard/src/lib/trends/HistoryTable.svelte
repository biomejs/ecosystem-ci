<script lang="ts">
import Select from "$lib/Select.svelte";
import StickyHorizontalScroll from "$lib/StickyHorizontalScroll.svelte";
import { isTime, METRICS, type Repo, type Run, SEVERITIES } from "./data";
import { formatDateTime, shortSha } from "./format";

let { runs, repos }: { runs: Run[]; repos: Repo[] } = $props();
let slug = $state("");
const repo = $derived(
	repos.find((candidate) => candidate.slug === slug) ?? repos[0],
);
</script>

<details class="mt-6 rounded-sm border border-hair bg-surface p-4">
	<summary class="min-h-11 cursor-pointer py-2 font-semibold">
		Historical data
	</summary>
	<p class="text-muted mb-3">
		Timing statistics are computed from each run's samples on this Biome branch.
		Missing repository data is not zero; unavailable timings are shown
		separately.
	</p>
	{#if repo}
		<label
			for="history-repository"
			class="mb-3 grid min-w-0 max-w-full grid-cols-1 gap-1.5"
		>
			<span class="text-sm font-semibold text-ink-2">Customer repository</span>
			<Select
				id="history-repository"
				value={repo.slug}
				onchange={(event) => { slug = event.currentTarget.value; }}
			>
				{#each repos as candidate (candidate.slug)}
					<option value={candidate.slug}>{candidate.slug}</option>
				{/each}
			</Select>
		</label>
		<StickyHorizontalScroll label="Historical observations">
			<table class="w-full border-collapse text-sm">
				<caption class="py-4 text-left text-ink-2">
					{repo.slug}: check and scanner times, parse diagnostics, panics, and
					rule diagnostics by severity. Oldest run first.
				</caption>
				<thead>
					<tr>
						<th
							scope="col"
							class="border-b border-hair p-3 text-left font-semibold"
						>
							Run / date (UTC)
						</th>
						{#each [...METRICS, ...SEVERITIES] as metric (metric.key)}
							<th
								scope="col"
								class="border-b border-hair p-3 text-left font-semibold"
							>
								{metric.label}
								{SEVERITIES.includes(metric) ? " (rule diagnostics)" : ""}
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each runs as run, index (run.id)}
						{const cell = $derived(repo.cells[index])}
						<tr>
							<th
								scope="row"
								class="border-b border-hair p-3 text-left font-semibold"
							>
								<a class="font-mono" href={run.url}
									>#{run.id}/ {shortSha(run.sha)}</a
								><span class="text-muted block"
									>{formatDateTime(run.startedAt)}</span
								>
							</th>
							{#if !cell || cell.missing}
								<td colspan="7" class="border-b border-hair p-3 text-left">
									Missing repository data: no report received.
								</td>
							{:else}
								{#each [...METRICS, ...SEVERITIES] as metric (metric.key)}
									{const value = $derived(cell[metric.key])}
									{const stats = $derived(
										metric.key === "checkMs"
											? cell.check
											: metric.key === "scannerMs"
												? cell.scanner
												: null,
									)}
									<td class="border-b border-hair p-3 text-left tabular-nums">
										{value === null ? "Not reported" : isTime(metric.key) ? `${value.toLocaleString("en-US", { maximumFractionDigits: 6 })} ms median` : metric.format(value)}
										{#if stats}
											<span class="text-muted block"
												>Min
												{stats.min.toLocaleString("en-US", { maximumFractionDigits: 6 })}
												ms · max
												{stats.max.toLocaleString("en-US", { maximumFractionDigits: 6 })}
												ms</span
											>
											<span class="text-muted block"
												>Mean
												{stats.mean.toLocaleString("en-US", { maximumFractionDigits: 6 })}
												ms · {stats.count} samples</span
											>
											<span class="text-muted block"
												>Q1
												{stats.q1.toLocaleString("en-US", { maximumFractionDigits: 6 })}
												ms · Q3
												{stats.q3.toLocaleString("en-US", { maximumFractionDigits: 6 })}
												ms</span
											>
										{/if}
									</td>
								{/each}
							{/if}
						</tr>
					{/each}
				</tbody>
			</table>
		</StickyHorizontalScroll>
	{:else}
		<p>No repository reports have been received for these runs.</p>
	{/if}
</details>
