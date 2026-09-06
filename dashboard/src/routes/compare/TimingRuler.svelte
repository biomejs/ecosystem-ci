<script lang="ts">
import { formatRulerTime, type rangeRuler } from "./range-ruler";
import { trackPercent } from "./timing-view";

let {
	lo,
	hi,
	ruler,
	bottom,
}: {
	lo: number;
	hi: number;
	ruler: ReturnType<typeof rangeRuler>;
	bottom: number;
} = $props();
const x = (value: number) => `${trackPercent(value, lo, hi)}%`;
const anchor = (value: number) =>
	trackPercent(value, lo, hi) < 10
		? "start"
		: trackPercent(value, lo, hi) > 90
			? "end"
			: "middle";
</script>
<g aria-hidden="true">
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
			y2={bottom}
			stroke="var(--color-base)"
		/>
	{/each}
</g>
