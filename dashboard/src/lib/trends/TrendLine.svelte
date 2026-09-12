<script lang="ts">
import type { Run } from "./data";
import { linearDomain } from "./domain";
import { formatDay, niceTicks } from "./format";
import { hover, validRunIndex } from "./hover.svelte";

let {
	runs,
	values,
	hue,
	zeroBased = false,
	height = 88,
	axis = "none",
	baseline = null,
	softRelativeSpan = null,
	minimumSpan = null,
	markers = [],
	ranges = [],
	ariaLabel,
}: {
	runs: Run[];
	values: (number | null)[];
	/** [min, max] of each run's samples, aligned with values; drawn as a band */
	ranges?: ([number, number] | null)[];
	hue: string;
	zeroBased?: boolean;
	height?: number;
	/** "dates" adds run dates under the chart (use on the last row of a column) */
	axis?: "dates" | "none";
	/** pre-change level, drawn as a grey hairline */
	baseline?: number | null;
	/** minimum y-domain width as a multiple of the baseline or median sample */
	softRelativeSpan?: number | null;
	/** minimum y-domain width in the metric's native unit */
	minimumSpan?: number | null;
	/** run indices to mark with a vertical line */
	markers?: number[];
	ariaLabel: string;
} = $props();

let width = $state(300);
const descriptionId = $props.id();
const m = $derived({
	left: 8,
	right: 8,
	top: 10,
	bottom: axis === "none" ? 8 : 28,
});
const pw = $derived(Math.max(10, width - m.left - m.right));
const ph = $derived(height - m.top - m.bottom);

const domain = $derived(
	linearDomain([...values, ...ranges.flatMap((r) => (r === null ? [] : r))], {
		baseline,
		zeroBased,
		softRelativeSpan,
		minimumSpan,
	}),
);
const ticks = $derived(
	niceTicks(domain[0], domain[1], 3).filter(
		(v) => !zeroBased || Number.isInteger(v),
	),
);

const x = (i: number): number =>
	m.left + (runs.length <= 1 ? pw / 2 : (i / (runs.length - 1)) * pw);
const y = (v: number): number =>
	m.top + ph - ((v - domain[0]) / (domain[1] - domain[0])) * ph;

/** polyline with a gap wherever a run has no value */
const path = $derived.by(() => {
	let d = "";
	let pen = false;
	values.forEach((v, i) => {
		if (v === null) {
			pen = false;
			return;
		}
		d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)} `;
		pen = true;
	});
	return d;
});

/** closed shapes between min and max, one per contiguous stretch of runs with samples */
const bandPath = $derived.by(() => {
	let d = "";
	let top: string[] = [];
	let bottom: string[] = [];
	const flush = () => {
		if (top.length > 1) {
			d += `M${top.join(" L")} L${bottom.reverse().join(" L")} Z `;
		}
		top = [];
		bottom = [];
	};
	ranges.forEach((r, i) => {
		if (r === null || values[i] === null) {
			flush();
			return;
		}
		top.push(`${x(i).toFixed(1)} ${y(r[1]).toFixed(1)}`);
		bottom.push(`${x(i).toFixed(1)} ${y(r[0]).toFixed(1)}`);
	});
	flush();
	return d;
});

const xTicks = $derived.by(() => {
	const n = runs.length;
	const maxTicks = Math.max(1, Math.min(8, Math.floor(pw / 90)));
	if (n <= maxTicks) return runs.map((_, i) => i);
	if (maxTicks === 1) return [n - 1];
	const step = Math.ceil((n - 1) / (maxTicks - 1));
	const out: number[] = [];
	for (let i = n - 1; i >= 0; i -= step) out.unshift(i);
	return out;
});

const last = $derived(values.length > 0 ? values[values.length - 1] : null);
const hi = $derived(validRunIndex(hover.index, runs.length));
const hoverValue = $derived(hi === null ? null : (values[hi] ?? null));

function onpointermove(e: PointerEvent) {
	if (runs.length === 0) {
		hover.index = null;
		return;
	}
	const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
	const px = e.clientX - rect.left;
	const i = Math.round(((px - m.left) / pw) * (runs.length - 1));
	hover.index = Math.max(0, Math.min(runs.length - 1, i));
}
</script>

<div class="min-w-0 overflow-hidden" bind:clientWidth={width}>
	<svg
		{width}
		{height}
		class="block select-none"
		role="img"
		aria-label={ariaLabel}
		aria-describedby={descriptionId}
		{onpointermove}
		onpointerleave={() => (hover.index = validRunIndex(hover.pinned, runs.length))}
	>
		<title>{ariaLabel}</title>
		<desc id={descriptionId}>
			Runs progress from left to right. Timing lines show medians, with bands
			covering the minimum to maximum samples. Gaps indicate unavailable
			observations, not zero. Use the run inspector or historical data table for
			exact values and keyboard access.
		</desc>
		{#each ticks as t (t)}
			<line
				x1={m.left}
				x2={m.left + pw}
				y1={y(t)}
				y2={y(t)}
				stroke="var(--color-hair)"
			/>
		{/each}
		{#if baseline !== null}
			<line
				x1={m.left}
				x2={m.left + pw}
				y1={y(baseline)}
				y2={y(baseline)}
				stroke="var(--color-muted)"
			/>
		{/if}
		{#each markers as mi (mi)}
			<line
				x1={x(mi)}
				x2={x(mi)}
				y1={m.top}
				y2={m.top + ph}
				stroke={hue}
				stroke-width="1.5"
				opacity="0.6"
			/>
		{/each}
		{#if axis === "dates"}
			{#each xTicks as i (i)}
				<text
					x={x(i)}
					y={height - 5}
					text-anchor={runs.length === 1 ? "middle" : i === 0 ? "start" : i === runs.length - 1 ? "end" : "middle"}
					font-size="var(--text-chart)"
					fill="var(--color-muted)"
				>
					{formatDay(runs[i].startedAt)}
				</text>
			{/each}
		{/if}

		{#if bandPath}
			<path d={bandPath} fill={hue} opacity="0.18" />
		{/if}
		<path
			d={path}
			fill="none"
			stroke={hue}
			stroke-width="2"
			stroke-linejoin="round"
			stroke-linecap="round"
		/>
		{#if last !== null}
			<circle
				cx={x(values.length - 1)}
				cy={y(last)}
				r="5.5"
				fill="var(--color-surface)"
			/>
			<circle cx={x(values.length - 1)} cy={y(last)} r="3.5" fill={hue} />
		{/if}

		{#if hi !== null}
			<line
				x1={x(hi)}
				x2={x(hi)}
				y1={m.top}
				y2={m.top + ph}
				stroke="var(--color-base)"
			/>
			{#if hoverValue !== null}
				<circle
					cx={x(hi)}
					cy={y(hoverValue)}
					r="5"
					fill="var(--color-surface)"
				/>
				<circle cx={x(hi)} cy={y(hoverValue)} r="3" fill={hue} />
			{/if}
		{/if}
	</svg>
</div>
