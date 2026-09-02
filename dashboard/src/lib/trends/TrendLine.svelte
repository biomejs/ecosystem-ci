<script lang="ts">
// One metric for one repository. A detected change is drawn as the baseline (grey
// hairline) and the change point (vertical marker in the metric's hue).
import type { Run } from "./data";
import { linearDomain } from "./domain";
import { formatDay, niceTicks } from "./format";
import { hover } from "./hover.svelte";

let {
	runs,
	values,
	hue,
	zeroBased = false,
	height = 60,
	axis = "none",
	baseline = null,
	softRelativeSpan = null,
	minimumSpan = null,
	markers = [],
	ariaLabel,
}: {
	runs: Run[];
	values: (number | null)[];
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
const m = $derived({
	left: 6,
	right: 8,
	top: 8,
	bottom: axis === "none" ? 4 : 18,
});
const pw = $derived(Math.max(10, width - m.left - m.right));
const ph = $derived(height - m.top - m.bottom);

const domain = $derived(
	linearDomain(values, { baseline, zeroBased, softRelativeSpan, minimumSpan }),
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

const xTicks = $derived.by(() => {
	const n = runs.length;
	const maxTicks = Math.max(2, Math.min(8, Math.floor(pw / 70)));
	if (n <= maxTicks) return runs.map((_, i) => i);
	const step = Math.ceil((n - 1) / maxTicks);
	const out: number[] = [];
	for (let i = n - 1; i >= 0; i -= step) out.unshift(i);
	return out;
});

const last = $derived(values.length > 0 ? values[values.length - 1] : null);
const hi = $derived(hover.index);
const hoverValue = $derived(hi === null ? null : (values[hi] ?? null));

function onpointermove(e: PointerEvent) {
	const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
	const px = e.clientX - rect.left;
	const i = Math.round(((px - m.left) / pw) * (runs.length - 1));
	hover.index = Math.max(0, Math.min(runs.length - 1, i));
}
function onkeydown(e: KeyboardEvent) {
	if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
	e.preventDefault();
	const cur = hover.index ?? runs.length - 1;
	hover.index = Math.max(
		0,
		Math.min(runs.length - 1, cur + (e.key === "ArrowLeft" ? -1 : 1)),
	);
}
</script>

<div class="min-w-0 overflow-hidden" bind:clientWidth={width}>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
	<svg
		{width}
		{height}
		class="block select-none"
		role="img"
		aria-label={ariaLabel}
		tabindex="0"
		{onpointermove}
		onpointerleave={() => (hover.index = null)}
		{onkeydown}
	>
		{#each ticks as t}
			<line
				x1={m.left}
				x2={m.left + pw}
				y1={y(t)}
				y2={y(t)}
				stroke="var(--hair)"
			/>
		{/each}
		{#if baseline !== null}
			<line
				x1={m.left}
				x2={m.left + pw}
				y1={y(baseline)}
				y2={y(baseline)}
				stroke="var(--muted)"
			/>
		{/if}
		{#each markers as mi}
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
			{#each xTicks as i}
				<text
					x={x(i)}
					y={height - 5}
					text-anchor={i === 0 ? "start" : i === runs.length - 1 ? "end" : "middle"}
					font-size="10.5"
					fill="var(--muted)"
				>
					{formatDay(runs[i].startedAt)}
				</text>
			{/each}
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
				fill="var(--surface)"
			/>
			<circle cx={x(values.length - 1)} cy={y(last)} r="3.5" fill={hue} />
		{/if}

		{#if hi !== null && hi < runs.length}
			<line
				x1={x(hi)}
				x2={x(hi)}
				y1={m.top}
				y2={m.top + ph}
				stroke="var(--base)"
			/>
			{#if hoverValue !== null}
				<circle cx={x(hi)} cy={y(hoverValue)} r="5" fill="var(--surface)" />
				<circle cx={x(hi)} cy={y(hoverValue)} r="3" fill={hue} />
			{/if}
		{/if}
	</svg>
</div>
