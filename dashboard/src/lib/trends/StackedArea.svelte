<script lang="ts">
// Rule diagnostics by severity for one repository, stacked; gaps where a run has no result.
import type { Run } from "./data";
import { formatDay, niceTicks } from "./format";
import { hover } from "./hover.svelte";

interface Layer {
	key: string;
	label: string;
	hue: string;
	values: (number | null)[];
}

let {
	runs,
	layers,
	height = 60,
	axis = "none",
	ariaLabel,
}: {
	runs: Run[];
	/** bottom layer first */
	layers: Layer[];
	height?: number;
	axis?: "dates" | "none";
	ariaLabel: string;
} = $props();

let width = $state(300);
const m = $derived({
	left: 6,
	right: 8,
	top: 6,
	bottom: axis === "none" ? 4 : 18,
});
const pw = $derived(Math.max(10, width - m.left - m.right));
const ph = $derived(height - m.top - m.bottom);

const totals = $derived(
	runs.map((_, i) =>
		layers.some((l) => l.values[i] === null || l.values[i] === undefined)
			? null
			: layers.reduce((s, l) => s + (l.values[i] as number), 0),
	),
);
const top = $derived(
	Math.max(1, ...totals.filter((v): v is number => v !== null)) * 1.1,
);
const ticks = $derived(niceTicks(0, top, 3).filter((v) => Number.isInteger(v)));
const x = (i: number): number =>
	m.left + (runs.length <= 1 ? pw / 2 : (i / (runs.length - 1)) * pw);
const y = (v: number): number => m.top + ph - (v / top) * ph;

function bottomOf(k: number, i: number): number {
	let s = 0;
	for (let j = 0; j < k; j++) s += layers[j].values[i] as number;
	return s;
}
function areaPath(k: number): string {
	let d = "";
	let i = 0;
	while (i < runs.length) {
		if (totals[i] === null) {
			i++;
			continue;
		}
		let j = i;
		while (j + 1 < runs.length && totals[j + 1] !== null) j++;
		const tops: string[] = [];
		const bottoms: string[] = [];
		for (let q = i; q <= j; q++) {
			const b = bottomOf(k, q);
			tops.push(
				`${x(q).toFixed(1)} ${y(b + (layers[k].values[q] as number)).toFixed(1)}`,
			);
			bottoms.unshift(`${x(q).toFixed(1)} ${y(b).toFixed(1)}`);
		}
		d += `M${tops.join(" L")} L${bottoms.join(" L")} Z `;
		i = j + 1;
	}
	return d;
}

const xTicks = $derived.by(() => {
	const n = runs.length;
	const maxTicks = Math.max(2, Math.min(8, Math.floor(pw / 70)));
	if (n <= maxTicks) return runs.map((_, i) => i);
	const step = Math.ceil((n - 1) / maxTicks);
	const out: number[] = [];
	for (let i = n - 1; i >= 0; i -= step) out.unshift(i);
	return out;
});

const hi = $derived(hover.index);
function onpointermove(e: PointerEvent) {
	const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
	const i = Math.round(
		((e.clientX - rect.left - m.left) / pw) * (runs.length - 1),
	);
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
		{#each ticks as t (t)}
			<line
				x1={m.left}
				x2={m.left + pw}
				y1={y(t)}
				y2={y(t)}
				stroke="var(--hair)"
			/>
		{/each}
		{#each layers as l, k (l.key)}
			<path
				d={areaPath(k)}
				fill={l.hue}
				stroke="var(--surface)"
				stroke-width="1"
				stroke-linejoin="round"
			/>
		{/each}
		{#if axis === "dates"}
			{#each xTicks as i (i)}
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
		{#if hi !== null && hi < runs.length}
			<line
				x1={x(hi)}
				x2={x(hi)}
				y1={m.top}
				y2={m.top + ph}
				stroke="var(--ink-2)"
			/>
		{/if}
	</svg>
</div>
