<!-- A shared time ruler for both runs, with automatically selected major and minor ticks. -->
<script lang="ts">
import type { TimingStats } from "$lib/timing";
import { landmarkTooltip } from "./landmark-tooltip";
import { formatRulerTime, rangeRuler } from "./range-ruler";
import TimingRuler from "./TimingRuler.svelte";
import { timingDomain, trackPercent } from "./timing-view";

let {
	label,
	base,
	head,
	hue,
}: { label: string; base: TimingStats; head: TimingStats; hue: string } =
	$props();
const { lo, hi } = $derived(
	timingDomain(Math.min(base.min, head.min), Math.max(base.max, head.max)),
);
let plotWidth = $state(300);
const ruler = $derived(rangeRuler(lo, hi, plotWidth));
const x = (value: number) => `${trackPercent(value, lo, hi)}%`;
const runs = $derived([
	{ name: "base", stats: base, color: "var(--color-ink-2)", y: 39 },
	{ name: "head", stats: head, color: hue, y: 67 },
]);
</script>
<div class="mt-3">
	<div class="flex gap-2">
		<div class="w-10 shrink-0 text-sm text-muted" style:padding-top="25px">
			<div class="flex items-center" style:height="28px">base</div>
			<div class="flex items-center" style:height="28px">head</div>
		</div>
		<div class="min-w-0 flex-1" bind:clientWidth={plotWidth}>
			<svg
				class="h-24 w-full overflow-visible"
				role="img"
				aria-label={`${label}: box plots with min/max whiskers from ${formatRulerTime(lo)} to ${formatRulerTime(hi)}; major ticks ${formatRulerTime(ruler.major)}, minor ticks ${formatRulerTime(ruler.minor)}`}
			>
				<TimingRuler {lo} {hi} {ruler} bottom={79} />
				{#each runs as run (run.name)}
					<g
						use:landmarkTooltip={`${run.name} range ${formatRulerTime(run.stats.min)}–${formatRulerTime(run.stats.max)}`}
					>
						<line
							x1={x(run.stats.min)}
							x2={x(run.stats.max)}
							y1={run.y}
							y2={run.y}
							stroke="transparent"
							stroke-width="14"
						/>
						<line
							x1={x(run.stats.min)}
							x2={x(run.stats.max)}
							y1={run.y}
							y2={run.y}
							stroke={run.color}
							stroke-width="1.5"
						/>
						<line
							x1={x(run.stats.min)}
							x2={x(run.stats.min)}
							y1={run.y-5}
							y2={run.y+5}
							stroke={run.color}
							stroke-width="2"
						/>
						<line
							x1={x(run.stats.max)}
							x2={x(run.stats.max)}
							y1={run.y-5}
							y2={run.y+5}
							stroke={run.color}
							stroke-width="2"
						/>
					</g>
					<g
						use:landmarkTooltip={`${run.name} middle 50%: Q1 ${formatRulerTime(run.stats.q1)}, Q3 ${formatRulerTime(run.stats.q3)}; mean ${formatRulerTime(run.stats.mean)}; ${run.stats.count} samples`}
					>
						<rect
							x={x(run.stats.q1)}
							y={run.y-7}
							width={`${trackPercent(run.stats.q3,lo,hi)-trackPercent(run.stats.q1,lo,hi)}%`}
							height="14"
							fill="var(--color-surface)"
						/>
						<rect
							x={x(run.stats.q1)}
							y={run.y-7}
							width={`${trackPercent(run.stats.q3,lo,hi)-trackPercent(run.stats.q1,lo,hi)}%`}
							height="14"
							fill={run.color}
							fill-opacity="0.3"
							stroke={run.color}
							stroke-width="1.5"
						/>
					</g>
					<g
						use:landmarkTooltip={`${run.name} median ${formatRulerTime(run.stats.median)}`}
					>
						<line
							x1={x(run.stats.median)}
							x2={x(run.stats.median)}
							y1={run.y-8}
							y2={run.y+8}
							stroke="transparent"
							stroke-width="10"
						/>
						<line
							x1={x(run.stats.median)}
							x2={x(run.stats.median)}
							y1={run.y-7}
							y2={run.y+7}
							stroke={run.color}
							stroke-width="2"
						/>
					</g>
				{/each}
			</svg>
		</div>
	</div>
</div>
