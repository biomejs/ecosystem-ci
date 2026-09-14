<!-- Headline of one timing comparison (median → median, delta) with the selected chart beneath. -->
<script lang="ts">
import type { TimingStats } from "$lib/timing";
import { formatMs, formatPct } from "$lib/trends/format";
import { medianMs, percentDelta, timingDeltaColor } from "./comparison";
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

<dl class="min-w-0 tabular-nums">
	<dt class="mb-1 block text-sm font-semibold text-muted">{label}</dt>
	<dd>
		<strong class="block font-semibold"
			>{base === null ? "Not reported" : formatMs(base.median)}
			→
			{head === null ? "Not reported" : formatMs(head.median)}</strong
		>
		<span
			class="mt-0.5 block text-sm"
			style:color={timingDeltaColor(base, head)}
		>
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
	</dd>
</dl>
