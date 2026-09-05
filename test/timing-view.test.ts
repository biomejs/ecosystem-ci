import assert from "node:assert/strict";
import { test } from "vitest";
import {
	selectTimingView,
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
