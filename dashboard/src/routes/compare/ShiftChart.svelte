<!-- A bar from the base median to the head median, drawn over the base run's min→max spread.
     The axis spans that spread and stretches only when the head median falls outside it. -->
<script lang="ts">
import type { TimingStats } from "$lib/timing";
import { formatMs, formatPct } from "$lib/trends/format";
import { deltaColor, percentDelta } from "./comparison";
import { trackPercent } from "./timing-view";

let {
	label,
	base,
	head,
}: {
	label: string;
	base: TimingStats;
	head: TimingStats;
} = $props();

const lo = $derived(Math.min(base.min, head.median));
const hi = $derived(Math.max(base.max, head.median));
const x = (value: number): number => trackPercent(value, lo, hi);
const delta = $derived(percentDelta(base.median, head.median));
const shiftMs = $derived(head.median - base.median);
const shift = $derived(
	`${shiftMs >= 0 ? "+" : "−"}${formatMs(Math.abs(shiftMs))}`,
);
const withinSpread = $derived(
	head.median >= base.min && head.median <= base.max,
);
const headTitle = $derived(
	`head median ${formatMs(head.median)}, ${shift} (${formatPct(delta ?? 0)}), ${withinSpread ? "inside" : "outside"} the base spread`,
);
/** keep the tick label inside the chart when the base median sits near an end */
const tickAnchor = $derived(
	x(base.median) < 20 ? "start" : x(base.median) > 80 ? "end" : "middle",
);
</script>

<div class="flex items-center gap-1.5 whitespace-nowrap text-sm text-muted">
	<span>{formatMs(lo)}</span>
	<svg
		class="h-8 min-w-0 flex-1 overflow-visible"
		role="img"
		aria-label={`${label}: base samples spread ${formatMs(base.min)} to ${formatMs(base.max)}; ${headTitle}`}
	>
		<rect
			x={`${x(base.min)}%`}
			y="2"
			width={`${Math.max(1.5, x(base.max) - x(base.min))}%`}
			height="18"
			rx="3"
			fill="var(--color-muted)"
			opacity="0.35"
		>
			<title>
				base samples spread {formatMs(base.min)}–{formatMs(base.max)}
			</title>
		</rect>
		<rect
			x={`${Math.min(x(base.median), x(head.median))}%`}
			y="6"
			width={`${Math.max(1, Math.abs(x(head.median) - x(base.median)))}%`}
			height="10"
			rx="2"
			fill={deltaColor(delta)}
		>
			<title>{headTitle}</title>
		</rect>
		<line
			x1={`${x(base.median)}%`}
			x2={`${x(base.median)}%`}
			y1="0"
			y2="22"
			stroke="var(--color-ink)"
			stroke-width="1.5"
		>
			<title>base median {formatMs(base.median)}</title>
		</line>
		<text
			x={`${x(base.median)}%`}
			y="31"
			font-size="var(--text-chart-detail)"
			text-anchor={tickAnchor}
			fill="var(--color-muted)"
		>
			base median
		</text>
	</svg>
	<span>{formatMs(hi)}</span>
</div>
