import { describe, expect, test } from "vitest";
import {
	median,
	parseTimingSamples,
	summarizeSamples,
	timingStatsMs,
} from "../dashboard/src/lib/timing";

describe("timing samples", () => {
	test("median handles odd and even counts", () => {
		expect(median([3, 1, 2])).toBe(2);
		expect(median([4, 1, 3, 2])).toBe(2.5);
		expect(median([7])).toBe(7);
	});

	test("summarizes a sample set without privileging any statistic", () => {
		expect(summarizeSamples([])).toBeNull();
		expect(summarizeSamples([5])).toEqual({
			median: 5,
			min: 5,
			max: 5,
			mean: 5,
			count: 1,
		});
		expect(summarizeSamples([30, 10, 20, 100])).toEqual({
			median: 25,
			min: 10,
			max: 100,
			mean: 40,
			count: 4,
		});
	});

	test("converts nanosecond samples to millisecond statistics", () => {
		const { check, scanner } = timingStatsMs([
			{ ordinal: 2, checkDurationNs: 2_000_000, scannerDurationNs: 500_000 },
			{ ordinal: 1, checkDurationNs: 1_000_000, scannerDurationNs: 250_000 },
		]);
		expect(check).toEqual({ median: 1.5, min: 1, max: 2, mean: 1.5, count: 2 });
		expect(scanner).toEqual({
			median: 0.375,
			min: 0.25,
			max: 0.5,
			mean: 0.375,
			count: 2,
		});
		expect(timingStatsMs([])).toEqual({ check: null, scanner: null });
	});

	test("parses the D1 sample column and orders by ordinal", () => {
		expect(parseTimingSamples(null)).toEqual([]);
		expect(parseTimingSamples("[]")).toEqual([]);
		expect(
			parseTimingSamples(
				JSON.stringify([
					{ ordinal: 2, checkDurationNs: 20, scannerDurationNs: 2 },
					{ ordinal: 1, checkDurationNs: 10, scannerDurationNs: 1 },
					{ ordinal: "bad" },
				]),
			),
		).toEqual([
			{ ordinal: 1, checkDurationNs: 10, scannerDurationNs: 1 },
			{ ordinal: 2, checkDurationNs: 20, scannerDurationNs: 2 },
		]);
	});
});
