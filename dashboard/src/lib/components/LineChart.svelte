<script lang="ts">
interface Point {
	label: string;
	values: Record<string, number>;
}

interface Series {
	key: string;
	label: string;
	color: string;
}

let {
	points,
	series,
	formatValue,
	ariaLabel,
}: {
	points: Point[];
	series: Series[];
	formatValue: (value: number) => string;
	ariaLabel: string;
} = $props();

const width = 720;
const height = 250;
const left = 58;
const right = 18;
const top = 18;
const bottom = 38;
const plotWidth = width - left - right;
const plotHeight = height - top - bottom;

const maximum = $derived(
	Math.max(
		1,
		...points.flatMap((point) =>
			series.map((item) => point.values[item.key] ?? 0),
		),
	),
);
const ticks = $derived([0, 0.25, 0.5, 0.75, 1].map((ratio) => maximum * ratio));

function x(index: number): number {
	if (points.length <= 1) return left + plotWidth / 2;
	return left + (index / (points.length - 1)) * plotWidth;
}

function y(value: number): number {
	return top + plotHeight - (value / maximum) * plotHeight;
}

function _coordinates(key: string): string {
	return points
		.map((point, index) => `${x(index)},${y(point.values[key] ?? 0)}`)
		.join(" ");
}
</script>

<div>
	<div class="mb-3 flex flex-wrap gap-x-5 gap-y-2">
		{#each series as item}
			<div class="flex items-center gap-2 text-xs text-slate-600">
				<span class="h-0.5 w-5" style:background-color={item.color}></span>
				{item.label}
			</div>
		{/each}
	</div>

	<svg
		class="h-auto w-full overflow-visible"
		viewBox={`0 0 ${width} ${height}`}
		role="img"
		aria-label={ariaLabel}
	>
		{#each ticks as tick}
			<line
				x1={left}
				x2={width - right}
				y1={y(tick)}
				y2={y(tick)}
				stroke="#cbd5e1"
				stroke-width="1"
			></line>
			<text
				x={left - 10}
				y={y(tick) + 4}
				text-anchor="end"
				class="fill-slate-500 text-[11px]"
			>
				{formatValue(tick)}
			</text>
		{/each}

		{#each series as item}
			<polyline
				points={_coordinates(item.key)}
				fill="none"
				stroke={item.color}
				stroke-width="2.5"
				stroke-linejoin="round"
				stroke-linecap="round"
			></polyline>
			{#each points as point, index}
				<circle
					cx={x(index)}
					cy={y(point.values[item.key] ?? 0)}
					r="4"
					fill="white"
					stroke={item.color}
					stroke-width="2.5"
				>
					<title>
						{point.label}, {item.label}:
						{formatValue(point.values[item.key] ?? 0)}
					</title>
				</circle>
			{/each}
		{/each}

		{#each points as point, index}
			<text
				x={x(index)}
				y={height - 10}
				text-anchor="middle"
				class="fill-slate-600 text-[11px]"
			>
				{point.label}
			</text>
		{/each}
	</svg>
</div>
