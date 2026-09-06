<!-- Headline of one timing comparison (median → median, delta) with the selected chart beneath. -->
<script lang="ts">
import type { TimingStats } from "$lib/timing";
import { formatMs, formatPct } from "$lib/trends/format";
import { deltaColor, medianMs, percentDelta } from "./comparison";
import RangesChart from "./RangesChart.svelte";
import ShiftChart from "./ShiftChart.svelte";
import type { TimingView } from "./timing-view";

let {
	label,
	base,
	head,
	hue,
	view,
}: {
	label: string;
	base: TimingStats | null;
	head: TimingStats | null;
	hue: string;
	view: TimingView;
} = $props();

const delta = $derived(percentDelta(medianMs(base), medianMs(head)));
</script>

<div class="min-w-0 tabular-nums">
	<span class="eyebrow mb-1 block md:hidden">{label}</span>
	<strong class="block whitespace-nowrap font-semibold text-sm"
		>{base === null ? "—" : formatMs(base.median)}
		→
		{head === null ? "—" : formatMs(head.median)}</strong
	>
	<span class="mt-0.5 block text-sm" style:color={deltaColor(delta)}>
		{delta === null ? "no delta" : formatPct(delta)}
		<span class="text-muted">median</span>
	</span>
	{#if base !== null && head !== null}
		<div class="mt-1.5">
			{#if view === "ranges"}
				<RangesChart {label} {base} {head} {hue} />
			{:else}
				<ShiftChart {label} {base} {head} />
			{/if}
		</div>
	{/if}
</div>
