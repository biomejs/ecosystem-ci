// A repository result's timing is a set of samples. Every statistic is computed here,
// at read time, so no single number is privileged in storage.

export interface TimingSample {
	ordinal: number;
	checkDurationNs: number;
	scannerDurationNs: number;
}

export interface TimingStats {
	median: number;
	q1: number;
	q3: number;
	min: number;
	max: number;
	mean: number;
	count: number;
}

/** Linear interpolation between adjacent sorted samples, at (n - 1) * probability. */
function quantile(sorted: number[], probability: number): number {
	const position = (sorted.length - 1) * probability;
	const lower = Math.floor(position);
	const upper = Math.ceil(position);
	return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

export function median(values: number[]): number {
	return quantile(
		values.toSorted((a, b) => a - b),
		0.5,
	);
}

/** null when there are no samples */
export function summarizeSamples(values: number[]): TimingStats | null {
	if (values.length === 0) return null;
	const sorted = values.toSorted((a, b) => a - b);
	let min = Number.POSITIVE_INFINITY;
	let max = Number.NEGATIVE_INFINITY;
	let sum = 0;
	for (const value of values) {
		if (value < min) min = value;
		if (value > max) max = value;
		sum += value;
	}
	return {
		median: quantile(sorted, 0.5),
		q1: quantile(sorted, 0.25),
		q3: quantile(sorted, 0.75),
		min,
		max,
		mean: sum / values.length,
		count: values.length,
	};
}

const NS_PER_MS = 1e6;

/** check and scanner statistics in milliseconds, from samples in nanoseconds */
export function timingStatsMs(samples: TimingSample[]): {
	check: TimingStats | null;
	scanner: TimingStats | null;
} {
	return {
		check: summarizeSamples(samples.map((s) => s.checkDurationNs / NS_PER_MS)),
		scanner: summarizeSamples(
			samples.map((s) => s.scannerDurationNs / NS_PER_MS),
		),
	};
}

/** parses the json_group_array column D1 returns for a result's samples, oldest ordinal first */
export function parseTimingSamples(json: string | null): TimingSample[] {
	if (!json) return [];
	const parsed: unknown = JSON.parse(json);
	if (!Array.isArray(parsed)) return [];
	return parsed
		.filter(
			(item): item is TimingSample =>
				typeof item === "object" &&
				item !== null &&
				typeof (item as TimingSample).ordinal === "number" &&
				typeof (item as TimingSample).checkDurationNs === "number" &&
				typeof (item as TimingSample).scannerDurationNs === "number",
		)
		.sort((a, b) => a.ordinal - b.ordinal);
}
