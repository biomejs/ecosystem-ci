import assert from "node:assert/strict";
import { test } from "vitest";
import { selectBiomeBranch } from "../dashboard/src/lib/branches.ts";

test("selectBiomeBranch defaults to main", () => {
	assert.equal(
		selectBiomeBranch(["dyc3/fix-no-floating-promises-things", "main"], null),
		"main",
	);
});

test("selectBiomeBranch accepts an available branch", () => {
	assert.equal(
		selectBiomeBranch(
			["main", "dyc3/fix-no-floating-promises-things"],
			"dyc3/fix-no-floating-promises-things",
		),
		"dyc3/fix-no-floating-promises-things",
	);
});

test("selectBiomeBranch rejects an unavailable branch", () => {
	assert.equal(selectBiomeBranch(["feature"], "deleted"), "feature");
	assert.equal(selectBiomeBranch([], "deleted"), null);
});
