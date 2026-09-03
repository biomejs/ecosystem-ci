import assert from "node:assert/strict";
import { test } from "vitest";
import { linearDomain } from "../dashboard/src/lib/trends/domain.ts";

test("soft relative span restrains small timing changes", () => {
	assert.deepEqual(
		linearDomain([10, 12], {
			softRelativeSpan: 1,
		}),
		[5.5, 16.5],
	);
});

test("soft relative span expands to retain a large timing spike", () => {
	assert.deepEqual(
		linearDomain([100, 3_000], {
			baseline: 100,
			softRelativeSpan: 1,
		}),
		[0, 3_406],
	);
});

test("timing domains are never narrower than 10 milliseconds", () => {
	assert.deepEqual(
		linearDomain([1, 2], {
			softRelativeSpan: 1,
			minimumSpan: 10,
		}),
		[0, 10],
	);
});

test("zero-based count domains retain their existing scale", () => {
	assert.deepEqual(linearDomain([10, 12], { zeroBased: true }), [0, 13.68]);
});
