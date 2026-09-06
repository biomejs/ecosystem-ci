import assert from "node:assert/strict";
import { test } from "vitest";
import {
	selectTimingView,
	timingDomain,
	trackPercent,
} from "../dashboard/src/routes/compare/timing-view.ts";

test("selectTimingView defaults to ranges", () => {
	assert.equal(selectTimingView(null), "ranges");
	assert.equal(selectTimingView(""), "ranges");
	assert.equal(selectTimingView("table"), "ranges");
});

test("selectTimingView accepts shift", () => {
	assert.equal(selectTimingView("shift"), "shift");
	assert.equal(selectTimingView("ranges"), "ranges");
});

test("trackPercent maps a value onto its domain", () => {
	assert.equal(trackPercent(10, 10, 20), 0);
	assert.equal(trackPercent(15, 10, 20), 50);
	assert.equal(trackPercent(20, 10, 20), 100);
	assert.equal(trackPercent(25, 10, 20), 150);
});

test("trackPercent centres a flat domain", () => {
	assert.equal(trackPercent(7, 7, 7), 50);
});

test("timing domains have a minimum 10ms span without negative durations", () => {
	assert.deepEqual(timingDomain(3, 5), { lo: 0, hi: 10 });
	assert.deepEqual(timingDomain(100, 102), { lo: 96, hi: 106 });
	assert.deepEqual(timingDomain(0, 0), { lo: 0, hi: 10 });
	assert.deepEqual(timingDomain(20, 20), { lo: 15, hi: 25 });
	assert.deepEqual(timingDomain(10, 20), { lo: 10, hi: 20 });
	assert.deepEqual(timingDomain(10, 100), { lo: 10, hi: 100 });
	assert.equal(trackPercent(5, 0, 10) - trackPercent(3, 0, 10), 20);
});
