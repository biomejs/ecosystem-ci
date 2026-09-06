import assert from "node:assert/strict";
import { test } from "vitest";
import {
	formatRulerTime,
	rangeRuler,
} from "../dashboard/src/routes/compare/range-ruler.ts";
import {
	timingDomain,
	trackPercent,
} from "../dashboard/src/routes/compare/timing-view.ts";

test("ticks align to time multiples within unrounded chart bounds", () => {
	const ruler = rangeRuler(30_868, 58_486, 290);
	assert.equal(ruler.major, 10_000);
	assert.equal(ruler.minor, 2_000);
	assert.deepEqual(ruler.majorTicks, [40_000, 50_000]);
	assert.deepEqual(
		ruler.minorTicks,
		[
			32_000, 34_000, 36_000, 38_000, 42_000, 44_000, 46_000, 48_000, 52_000,
			54_000, 56_000, 58_000,
		],
	);
	assert.ok(
		Math.abs(trackPercent(ruler.majorTicks[0], 30_868, 58_486) - 33.065) < 0.01,
	);
});

test("preset density adapts to width while the 10ms domain stays fixed", () => {
	const domain = timingDomain(3, 5);
	const wide = rangeRuler(domain.lo, domain.hi, 640);
	const narrow = rangeRuler(domain.lo, domain.hi, 200);
	assert.deepEqual(domain, { lo: 0, hi: 10 });
	assert.equal(wide.major, 1);
	assert.equal(narrow.major, 5);
	assert.deepEqual(narrow.majorTicks, [0, 5, 10]);
	assert.deepEqual(narrow.minorTicks, [1, 2, 3, 4, 6, 7, 8, 9]);
});

test("every subdivision stays inside its axis and is not also a major tick", () => {
	for (const [lo, hi, width] of [
		[1.1, 11.1, 350],
		[101, 111, 300],
		[0, 1e9, 600],
		[0, 10, 0],
	]) {
		const ruler = rangeRuler(lo, hi, width);
		for (const tick of [...ruler.majorTicks, ...ruler.minorTicks])
			assert.ok(tick >= lo && tick <= hi);
		assert.ok(
			ruler.minorTicks.every((tick) => !ruler.majorTicks.includes(tick)),
		);
	}
});

test("ruler formatting retains fractional milliseconds", () => {
	assert.equal(formatRulerTime(0.2), "0.2 ms");
	assert.equal(formatRulerTime(2.5), "2.5 ms");
	assert.equal(formatRulerTime(500), "500 ms");
	assert.equal(formatRulerTime(10_000), "10 s");
});
