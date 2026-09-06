<!-- One min→max bar per run on a shared scale, with the median as a dot and the mean as a tick. -->
<script lang="ts">
import type { TimingStats } from "$lib/timing";
import { formatMs } from "$lib/trends/format";
import { landmarkTooltip } from "./landmark-tooltip";
import { timingDomain, trackPercent } from "./timing-view";

let {
	label,
	base,
	head,
	hue,
}: {
	label: string;
	base: TimingStats;
	head: TimingStats;
	/** colour of the head run's marks */
	hue: string;
} = $props();

const { lo, hi } = $derived(
	timingDomain(Math.min(base.min, head.min), Math.max(base.max, head.max)),
);
const x = (value: number): string => `${trackPercent(value, lo, hi)}%`;
const width = (stats: TimingStats): string =>
	`${Math.max(1.5, trackPercent(stats.max, lo, hi) - trackPercent(stats.min, lo, hi))}%`;
const runs = $derived([
	{
		name: "base",
		stats: base,
		dot: "var(--color-ink-2)",
		band: "var(--color-muted)",
	},
	{ name: "head", stats: head, dot: hue, band: hue },
]);
</script>

<div
	class="text-sm text-muted *:flex *:items-center *:gap-1.5 *:whitespace-nowrap"
>
	{#each runs as run (run.name)}
		<div>
			<span class="w-10 shrink-0">{run.name}</span>
			<span>{formatMs(lo)}</span>
			<svg
				class="h-3.5 min-w-0 flex-1 overflow-visible"
				role="img"
				aria-label={`${run.name} ${label}: ${formatMs(run.stats.min)} to ${formatMs(run.stats.max)}, median ${formatMs(run.stats.median)}`}
			>
				<g
					use:landmarkTooltip={`${run.name} samples ${formatMs(run.stats.min)}–${formatMs(run.stats.max)}`}
				>
					<rect
						x={x(run.stats.min)}
						y="4"
						width={width(run.stats)}
						height="6"
						rx="3"
						fill={run.band}
						opacity="0.45"
					></rect>
				</g>
				<g use:landmarkTooltip={`${run.name} mean ${formatMs(run.stats.mean)}`}>
					<line
						x1={x(run.stats.mean)}
						x2={x(run.stats.mean)}
						y1="1"
						y2="13"
						stroke="transparent"
						stroke-width="12"
					/>
					<line
						x1={x(run.stats.mean)}
						x2={x(run.stats.mean)}
						y1="1"
						y2="13"
						stroke={run.dot}
						stroke-width="1"
						opacity="0.7"
					></line>
				</g>
				<g
					use:landmarkTooltip={`${run.name} median ${formatMs(run.stats.median)}`}
				>
					<circle cx={x(run.stats.median)} cy="7" r="8" fill="transparent" />
					<circle
						cx={x(run.stats.median)}
						cy="7"
						r="4"
						fill={run.dot}
						stroke="var(--color-surface)"
						stroke-width="2"
					></circle>
				</g>
			</svg>
			<span>{formatMs(hi)}</span>
		</div>
	{/each}
</div>
