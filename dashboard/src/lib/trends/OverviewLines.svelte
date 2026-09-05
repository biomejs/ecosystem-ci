<script lang="ts">
import type { Repo, Run, ValueKey } from "./data";
import { seriesRanges, seriesValues } from "./data";
import { formatDay, formatPct, niceTicks } from "./format";
import { hover, validRunIndex } from "./hover.svelte";

let {
	runs,
	repos,
	metric,
	title,
	hue,
	format,
	minimumAbsoluteSpan = 0,
}: {
	runs: Run[];
	repos: Repo[];
	metric: ValueKey;
	title: string;
	hue: string;
	format: (value: number) => string;
	minimumAbsoluteSpan?: number;
} = $props();

let width = $state(600);
let logarithmic = $state(false);
let relative = $state(false);
let hoveredSlug = $state<string | null>(null);
const descriptionId = $props.id();
const height = 240;

type Range = [number, number] | null;

const rawSeries = $derived(
	repos.map((repo) => ({
		slug: repo.slug,
		values: seriesValues(repo, metric),
		ranges: seriesRanges(repo, metric),
	})),
);

/** the first defined, non-zero median; ranges are expressed relative to the same value */
function firstBaseline(values: (number | null)[]): number | undefined {
	return values.find((value): value is number => value !== null && value !== 0);
}

function relativeToFirst(
	values: (number | null)[],
	baseline: number | undefined,
): (number | null)[] {
	if (baseline === undefined) return values.map(() => null);
	return values.map((value) =>
		value === null ? null : ((value - baseline) / baseline) * 100,
	);
}

function relativeRanges(
	ranges: Range[],
	baseline: number | undefined,
): Range[] {
	if (baseline === undefined) return ranges.map(() => null);
	return ranges.map((range) =>
		range === null
			? null
			: [
					((range[0] - baseline) / baseline) * 100,
					((range[1] - baseline) / baseline) * 100,
				],
	);
}

const series = $derived(
	rawSeries.map((item) => {
		const baseline = relative ? firstBaseline(item.values) : undefined;
		return {
			slug: item.slug,
			values: relative ? relativeToFirst(item.values, baseline) : item.values,
			ranges: relative ? relativeRanges(item.ranges, baseline) : item.ranges,
		};
	}),
);
const hoveredSeries = $derived(
	series.find((item) => item.slug === hoveredSlug),
);
const allValues = $derived(
	series.flatMap((item) =>
		[
			...item.values,
			...item.ranges.flatMap((range) => (range === null ? [] : range)),
		].filter(
			(value): value is number => value !== null && (!logarithmic || value > 0),
		),
	),
);
const domain = $derived.by((): [number, number] => {
	if (allValues.length === 0) {
		if (relative) return [0, 1];
		return logarithmic
			? [1, Math.max(10, 1 + minimumAbsoluteSpan)]
			: [0, Math.max(1, minimumAbsoluteSpan)];
	}
	const low = Math.min(...allValues);
	const high = Math.max(...allValues);
	if (logarithmic) {
		const lowPower = Math.floor(Math.log10(low));
		const highPower = Math.ceil(Math.log10(high));
		const logarithmicDomain: [number, number] =
			lowPower === highPower
				? [10 ** (lowPower - 1), 10 ** (highPower + 1)]
				: [10 ** lowPower, 10 ** highPower];
		if (logarithmicDomain[1] - logarithmicDomain[0] < minimumAbsoluteSpan) {
			logarithmicDomain[1] = logarithmicDomain[0] + minimumAbsoluteSpan;
		}
		return logarithmicDomain;
	}
	if (!relative)
		return [0, Math.max(minimumAbsoluteSpan, Math.max(1, high) * 1.08)];
	if (low === high) {
		const padding = Math.abs(low) * 0.1 || 1;
		return [low - padding, high + padding];
	}
	const span = high - low;
	return [Math.min(0, low - span * 0.08), Math.max(0, high + span * 0.08)];
});

function logarithmicTicks(low: number, high: number): number[] {
	const ticks: number[] = [];
	for (
		let power = Math.ceil(Math.log10(low));
		power <= Math.floor(Math.log10(high));
		power++
	) {
		ticks.push(10 ** power);
	}
	return ticks;
}

const ticks = $derived(
	logarithmic
		? logarithmicTicks(domain[0], domain[1])
		: niceTicks(domain[0], domain[1], 4),
);
const displayFormat = $derived(relative ? formatPct : format);
const margin = $derived({
	left: Math.max(
		72,
		...ticks.map((tick) => displayFormat(tick).length * 8 + 16),
	),
	right: 16,
	top: 14,
	bottom: 30,
});
const plotWidth = $derived(Math.max(10, width - margin.left - margin.right));
const plotHeight = $derived(height - margin.top - margin.bottom);

const x = (index: number): number =>
	margin.left +
	(runs.length <= 1 ? plotWidth / 2 : (index / (runs.length - 1)) * plotWidth);
const y = (value: number): number => {
	const position = logarithmic
		? (Math.log10(value) - Math.log10(domain[0])) /
			(Math.log10(domain[1]) - Math.log10(domain[0]))
		: (value - domain[0]) / (domain[1] - domain[0]);
	return margin.top + plotHeight - position * plotHeight;
};

function linePath(values: (number | null)[]): string {
	let path = "";
	let drawing = false;
	values.forEach((value, index) => {
		if (value === null || (logarithmic && value <= 0)) {
			drawing = false;
			return;
		}
		path += `${drawing ? "L" : "M"}${x(index).toFixed(1)} ${y(value).toFixed(1)} `;
		drawing = true;
	});
	return path;
}

/** the min–max band of one series, split wherever a run has no samples */
function bandPath(values: (number | null)[], ranges: Range[]): string {
	let path = "";
	let top: string[] = [];
	let bottom: string[] = [];
	const flush = () => {
		if (top.length > 1) {
			path += `M${top.join(" L")} L${bottom.reverse().join(" L")} Z `;
		}
		top = [];
		bottom = [];
	};
	ranges.forEach((range, index) => {
		const value = values[index];
		if (
			range === null ||
			value === null ||
			value === undefined ||
			(logarithmic && range[0] <= 0)
		) {
			flush();
			return;
		}
		top.push(`${x(index).toFixed(1)} ${y(range[1]).toFixed(1)}`);
		bottom.push(`${x(index).toFixed(1)} ${y(range[0]).toFixed(1)}`);
	});
	flush();
	return path;
}

const xTicks = $derived.by(() => {
	const maxTicks = Math.max(1, Math.min(7, Math.floor(plotWidth / 90)));
	if (runs.length <= maxTicks) return runs.map((_, index) => index);
	if (maxTicks === 1) return [runs.length - 1];
	const step = Math.ceil((runs.length - 1) / (maxTicks - 1));
	const indices: number[] = [];
	for (let index = runs.length - 1; index >= 0; index -= step)
		indices.unshift(index);
	return indices;
});

const focusIndex = $derived(
	validRunIndex(hover.index, runs.length) ?? runs.length - 1,
);
const focusRun = $derived(runs[focusIndex]);
const focusValues = $derived(
	series.flatMap((item) => {
		const value = item.values[focusIndex];
		if (value === null || value === undefined || (logarithmic && value <= 0))
			return [];
		const range = item.ranges[focusIndex] ?? null;
		return [
			{
				slug: item.slug,
				value,
				range: range !== null && (!logarithmic || range[0] > 0) ? range : null,
			},
		];
	}),
);
const focusRange = $derived.by(() => {
	if (focusValues.length === 0) return "no reports";
	const values = focusValues.map((item) => item.value);
	const noun = focusValues.length === 1 ? "report" : "reports";
	return `${focusValues.length} ${noun} · ${displayFormat(Math.min(...values))} to ${displayFormat(Math.max(...values))}`;
});

function pointTitle(point: (typeof focusValues)[number]): string {
	const range =
		point.range === null
			? ""
			: ` · ${displayFormat(point.range[0])} to ${displayFormat(point.range[1])}`;
	return `${point.slug}: ${displayFormat(point.value)} median${range}`;
}

function toggleLogarithmic(event: Event) {
	logarithmic = (event.currentTarget as HTMLInputElement).checked;
	if (logarithmic) relative = false;
}

function toggleRelative(event: Event) {
	relative = (event.currentTarget as HTMLInputElement).checked;
	if (relative) logarithmic = false;
}

function onpointermove(event: PointerEvent) {
	if (runs.length === 0) {
		hover.index = null;
		hoveredSlug = null;
		return;
	}
	const rect = (event.currentTarget as SVGSVGElement).getBoundingClientRect();
	const pointerX = event.clientX - rect.left;
	const pointerY = event.clientY - rect.top;
	const index = Math.round(
		((pointerX - margin.left) / plotWidth) * (runs.length - 1),
	);
	let nearestSlug: string | null = null;
	let nearestDistance = 6;
	for (const item of series) {
		let previous: { x: number; y: number } | null = null;
		item.values.forEach((value, index) => {
			if (value === null || (logarithmic && value <= 0)) {
				previous = null;
				return;
			}
			const point = { x: x(index), y: y(value) };
			const start = previous ?? point;
			const dx = point.x - start.x;
			const dy = point.y - start.y;
			const lengthSquared = dx * dx + dy * dy;
			const position =
				lengthSquared === 0
					? 0
					: Math.max(
							0,
							Math.min(
								1,
								((pointerX - start.x) * dx + (pointerY - start.y) * dy) /
									lengthSquared,
							),
						);
			const distance = Math.hypot(
				pointerX - (start.x + position * dx),
				pointerY - (start.y + position * dy),
			);
			if (distance < nearestDistance) {
				nearestDistance = distance;
				nearestSlug = item.slug;
			}
			previous = point;
		});
	}
	hoveredSlug = nearestSlug;
	hover.index = Math.max(0, Math.min(runs.length - 1, index));
}
</script>

<section class="border border-hair bg-surface min-w-0 p-3">
	<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
		<h2 class="font-semibold">{title}</h2>
		<div class="flex flex-wrap items-center gap-3 text-sm">
			<label class="inline-flex items-center gap-1.5">
				<input
					type="checkbox"
					checked={logarithmic}
					onchange={toggleLogarithmic}
				>
				Log scale
			</label>
			<label class="inline-flex items-center gap-1.5">
				<input type="checkbox" checked={relative} onchange={toggleRelative}>
				Relative to first
			</label>
		</div>
	</div>
	<p class="text-muted mb-1 text-sm">
		{focusRun ? formatDay(focusRun.startedAt) : "No runs"}
		· {focusRange} · medians; bands and ticks span each run's samples
	</p>
	<div class="relative min-w-0 overflow-hidden" bind:clientWidth={width}>
		<svg
			{width}
			{height}
			class="block select-none"
			role="img"
			aria-label={`${title} for ${repos.length} repositories over ${runs.length} runs, ${relative ? "relative to first sample" : logarithmic ? "logarithmic scale" : "linear scale"}`}
			aria-describedby={descriptionId}
			{onpointermove}
			onpointerleave={() => {
				hover.index = validRunIndex(hover.pinned, runs.length);
				hoveredSlug = null;
			}}
		>
			<title>{title}</title>
			<desc id={descriptionId}>
				Each line represents one customer repository. Gaps indicate unavailable
				observations, not zero. The repository nearest the pointer has a thicker
				line. Use the run inspector or historical data table for exact values
				and keyboard access.
				{#if logarithmic}
					Non-positive values are omitted on the log scale.
				{/if}
			</desc>
			{#each ticks as tick (tick)}
				<line
					x1={margin.left}
					x2={margin.left + plotWidth}
					y1={y(tick)}
					y2={y(tick)}
					stroke="var(--color-hair)"
				/>
				<text
					x={margin.left - 7}
					y={y(tick) + 4.5}
					text-anchor="end"
					font-size="var(--text-chart)"
					fill="var(--color-muted)"
				>
					{displayFormat(tick)}
				</text>
			{/each}

			{#each series as item (item.slug)}
				{const band = $derived(bandPath(item.values, item.ranges))}
				{#if band}
					<path d={band} fill={hue} opacity={hoveredSeries ? "0.025" : "0.07"}>
						<title>{item.slug} · min–max of samples</title>
					</path>
				{/if}
			{/each}
			{#each series as item (item.slug)}
				<path
					d={linePath(item.values)}
					fill="none"
					stroke={hue}
					stroke-width="1.8"
					stroke-linejoin="round"
					stroke-linecap="round"
					opacity={hoveredSeries ? "0.3" : "0.8"}
				>
					<title>{item.slug}</title>
				</path>
			{/each}

			{#each xTicks as index (index)}
				<text
					x={x(index)}
					y={height - 5}
					text-anchor={runs.length === 1 ? "middle" : index === 0 ? "start" : index === runs.length - 1 ? "end" : "middle"}
					font-size="var(--text-chart)"
					fill="var(--color-muted)"
				>
					{formatDay(runs[index].startedAt)}
				</text>
			{/each}

			{#if focusIndex >= 0 && focusIndex < runs.length}
				<line
					x1={x(focusIndex)}
					x2={x(focusIndex)}
					y1={margin.top}
					y2={margin.top + plotHeight}
					stroke="var(--color-base)"
				/>
				{#each focusValues as point (point.slug)}
					{#if point.range !== null && point.range[0] !== point.range[1]}
						<line
							x1={x(focusIndex)}
							x2={x(focusIndex)}
							y1={y(point.range[1])}
							y2={y(point.range[0])}
							stroke={hue}
							stroke-width="1.5"
							opacity="0.45"
						/>
					{/if}
					<circle cx={x(focusIndex)} cy={y(point.value)} r="2.2" fill={hue}>
						<title>{pointTitle(point)}</title>
					</circle>
				{/each}
			{/if}
			{#if hoveredSeries}
				<g pointer-events="none" aria-hidden="true">
					<path
						d={bandPath(hoveredSeries.values, hoveredSeries.ranges)}
						fill={hue}
						opacity="0.25"
					/>
					{#each focusValues.filter((point) => point.slug === hoveredSeries.slug) as point (point.slug)}
						{#if point.range !== null && point.range[0] !== point.range[1]}
							<line
								x1={x(focusIndex)}
								x2={x(focusIndex)}
								y1={y(point.range[1])}
								y2={y(point.range[0])}
								stroke={hue}
								stroke-width="3"
							/>
						{/if}
					{/each}
					<path
						d={linePath(hoveredSeries.values)}
						fill="none"
						stroke={hue}
						stroke-width="3"
						stroke-linejoin="round"
						stroke-linecap="round"
					/>
					{#each hoveredSeries.values as value, index (index)}
						{#if value !== null && (!logarithmic || value > 0)}
							<circle cx={x(index)} cy={y(value)} r="3" fill={hue} />
						{/if}
					{/each}
				</g>
			{/if}
		</svg>
		{#if hoveredSeries}
			<div
				role="tooltip"
				class="pointer-events-none absolute right-3 top-2 max-w-full break-all border border-hair bg-surface px-2 py-1 text-sm"
			>
				{hoveredSeries.slug}
			</div>
		{/if}
	</div>
	<p class="text-muted text-sm">
		Use the run inspector or historical data table for values and keyboard
		access.
	</p>
</section>
