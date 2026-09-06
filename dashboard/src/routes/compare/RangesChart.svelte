<!-- A shared time ruler for both runs, with automatically selected major and minor ticks. -->
<script lang="ts">
import type { TimingStats } from "$lib/timing";
import { landmarkTooltip } from "./landmark-tooltip";
import { formatRulerTime, rangeRuler } from "./range-ruler";
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
const anchor = (value: number) =>
	trackPercent(value, lo, hi) < 10
		? "start"
		: trackPercent(value, lo, hi) > 90
			? "end"
			: "middle";
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
				aria-label={`${label}: sample ranges from ${formatRulerTime(lo)} to ${formatRulerTime(hi)}; major ticks ${formatRulerTime(ruler.major)}, minor ticks ${formatRulerTime(ruler.minor)}`}
			>
				<line x1="0" x2="100%" y1="23" y2="23" stroke="var(--color-base)" />
				{#each ruler.minorTicks as tick (tick)}
					<line
						x1={x(tick)}
						x2={x(tick)}
						y1="20"
						y2="28"
						stroke="var(--color-muted)"
					/>
				{/each}
				{#each ruler.majorTicks as tick (tick)}
					<text
						x={x(tick)}
						y="12"
						text-anchor={anchor(tick)}
						font-size="var(--text-sm)"
						fill="var(--color-ink-2)"
					>
						{formatRulerTime(tick)}
					</text>
					<line
						x1={x(tick)}
						x2={x(tick)}
						y1="18"
						y2="79"
						stroke="var(--color-base)"
					/>
				{/each}
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
							stroke-width="4"
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
						use:landmarkTooltip={`${run.name} mean ${formatRulerTime(run.stats.mean)}`}
					>
						<line
							x1={x(run.stats.mean)}
							x2={x(run.stats.mean)}
							y1={run.y-6}
							y2={run.y+6}
							stroke="transparent"
							stroke-width="10"
						/>
						<line
							x1={x(run.stats.mean)}
							x2={x(run.stats.mean)}
							y1={run.y-6}
							y2={run.y+6}
							stroke={run.color}
							opacity="0.7"
						/>
					</g>
					<g
						use:landmarkTooltip={`${run.name} median ${formatRulerTime(run.stats.median)}`}
					>
						<circle
							cx={x(run.stats.median)}
							cy={run.y}
							r="8"
							fill="transparent"
						/>
						<circle
							cx={x(run.stats.median)}
							cy={run.y}
							r="4"
							fill={run.color}
							stroke="var(--color-surface)"
							stroke-width="2"
						/>
					</g>
				{/each}
			</svg>
		</div>
	</div>
</div>
