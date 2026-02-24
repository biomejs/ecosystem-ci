#!/usr/bin/env node

/**
 * Tests for aggregate-outcomes script
 *
 * Run with: node --experimental-strip-types --test test/aggregate-outcomes.test.ts
 */

import { describe, test } from "node:test";
import assert from "node:assert";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
	formatDuration,
	getTotalDiagnostics,
	computeTrend,
	computeBaseTag,
	computeFullOutcome,
	aggregateResults,
	readMinimalOutcomes,
	readReport,
	type BiomeReport,
	type MinimalOutcome,
	type OutcomeData,
} from "../scripts/aggregate-outcomes.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "fixtures");

describe("formatDuration", () => {
	test("formats seconds correctly", () => {
		const duration = 1500; // 1500ms = 1.5s
		assert.strictEqual(formatDuration(duration), "1.5s");
	});

	test("formats milliseconds correctly", () => {
		const duration = 234; // 234ms
		assert.strictEqual(formatDuration(duration), "234ms");
	});

	test("rounds milliseconds", () => {
		const duration = 234.567890; // rounds to 235ms
		assert.strictEqual(formatDuration(duration), "235ms");
	});

	test("handles zero duration", () => {
		const duration = 0;
		assert.strictEqual(formatDuration(duration), "0ms");
	});

	test("handles undefined duration", () => {
		assert.strictEqual(formatDuration(undefined), "?");
	});

	test("formats large durations", () => {
		const duration = 123456; // 123456ms = 123.5s
		assert.strictEqual(formatDuration(duration), "123.5s");
	});
});

describe("getTotalDiagnostics", () => {
	test("sums all diagnostic types", () => {
		const report: BiomeReport = {
			summary: {
				errors: 5,
				warnings: 3,
				infos: 1,
			},
		};
		assert.strictEqual(getTotalDiagnostics(report), 9);
	});

	test("handles missing diagnostic types", () => {
		const report: BiomeReport = {
			summary: {
				errors: 5,
			},
		};
		assert.strictEqual(getTotalDiagnostics(report), 5);
	});

	test("handles null report", () => {
		assert.strictEqual(getTotalDiagnostics(null), 0);
	});

	test("handles report without summary", () => {
		const report: BiomeReport = {};
		assert.strictEqual(getTotalDiagnostics(report), 0);
	});

	test("handles all zeros", () => {
		const report: BiomeReport = {
			summary: {
				errors: 0,
				warnings: 0,
				infos: 0,
			},
		};
		assert.strictEqual(getTotalDiagnostics(report), 0);
	});
});

describe("computeTrend", () => {
	test("shows warning for current error", () => {
		const current: BiomeReport = { error: true };
		const previous: BiomeReport = {
			summary: { errors: 5, warnings: 0, infos: 0 },
		};
		assert.strictEqual(computeTrend(previous, current), "⚠️");
	});

	test("shows new for no previous report", () => {
		const current: BiomeReport = {
			summary: { errors: 5, warnings: 0, infos: 0 },
		};
		assert.strictEqual(computeTrend(null, current), "🆕");
	});

	test("shows new for no current report", () => {
		const previous: BiomeReport = {
			summary: { errors: 5, warnings: 0, infos: 0 },
		};
		assert.strictEqual(computeTrend(previous, null), "🆕");
	});

	test("shows new when previous had error", () => {
		const current: BiomeReport = {
			summary: { errors: 5, warnings: 0, infos: 0 },
		};
		const previous: BiomeReport = { error: true };
		assert.strictEqual(computeTrend(previous, current), "🆕");
	});

	test("shows empty string for no change", () => {
		const current: BiomeReport = {
			summary: { errors: 5, warnings: 3, infos: 1 },
		};
		const previous: BiomeReport = {
			summary: { errors: 5, warnings: 3, infos: 1 },
		};
		assert.strictEqual(computeTrend(previous, current), "");
	});

	test("shows up arrow for more diagnostics", () => {
		const current: BiomeReport = {
			summary: { errors: 10, warnings: 5, infos: 2 },
		};
		const previous: BiomeReport = {
			summary: { errors: 5, warnings: 3, infos: 1 },
		};
		assert.strictEqual(computeTrend(previous, current), "📈");
	});

	test("shows down arrow for fewer diagnostics", () => {
		const current: BiomeReport = {
			summary: { errors: 5, warnings: 3, infos: 1 },
		};
		const previous: BiomeReport = {
			summary: { errors: 10, warnings: 5, infos: 2 },
		};
		assert.strictEqual(computeTrend(previous, current), "📉");
	});
});

describe("computeBaseTag", () => {
	test("returns checkmark for success", () => {
		assert.strictEqual(computeBaseTag("success"), "✅");
	});

	test("returns X for failure", () => {
		assert.strictEqual(computeBaseTag("failure"), "❌");
	});

	test("returns question mark for unknown", () => {
		assert.strictEqual(computeBaseTag("skipped"), "❓");
		assert.strictEqual(computeBaseTag("timeout"), "❓");
		assert.strictEqual(computeBaseTag("cancelled"), "❓");
	});
});

describe("readMinimalOutcomes", () => {
	test("reads all outcome files", () => {
		const outcomesDir = path.join(fixturesDir, "outcomes");
		const outcomes = readMinimalOutcomes(outcomesDir);

		assert.strictEqual(outcomes.length, 4);
		assert.ok(outcomes.some((o) => o.id === "success"));
		assert.ok(outcomes.some((o) => o.id === "failure"));
		assert.ok(outcomes.some((o) => o.id === "error"));
		assert.ok(outcomes.some((o) => o.id === "recovered"));
	});

	test("parses outcome data correctly", () => {
		const outcomesDir = path.join(fixturesDir, "outcomes");
		const outcomes = readMinimalOutcomes(outcomesDir);
		const success = outcomes.find((o) => o.id === "success");

		assert.ok(success);
		assert.strictEqual(success.id, "success");
		assert.strictEqual(success.outcome, "success");
	});
});

describe("readReport", () => {
	test("reads valid report", () => {
		const reportsDir = path.join(fixturesDir, "reports");
		const report = readReport(reportsDir, "success");

		assert.ok(report);
		assert.ok(report.summary);
		assert.strictEqual(report.summary.errors, 5);
	});

	test("reads error placeholder", () => {
		const reportsDir = path.join(fixturesDir, "reports");
		const report = readReport(reportsDir, "error");

		assert.ok(report);
		assert.strictEqual(report.error, true);
	});

	test("returns null for missing report", () => {
		const reportsDir = path.join(fixturesDir, "reports");
		const report = readReport(reportsDir, "nonexistent");

		assert.strictEqual(report, null);
	});
});

describe("computeFullOutcome", () => {
	const reportsDir = path.join(fixturesDir, "reports");
	const previousReportsDir = path.join(fixturesDir, "previous-reports");

	test("computes success with trend", () => {
		const minimalOutcome: MinimalOutcome = {
			id: "success",
			outcome: "success",
		};
		const result = computeFullOutcome(
			minimalOutcome,
			reportsDir,
			previousReportsDir,
		);

		assert.strictEqual(result.id, "success");
		assert.strictEqual(result.tag, "✅ 📉"); // Fewer diagnostics
		assert.strictEqual(result.time, "1.5s");
		assert.strictEqual(result.outcome, "success");
	});

	test("computes failure without previous report", () => {
		const minimalOutcome: MinimalOutcome = {
			id: "failure",
			outcome: "failure",
		};
		const result = computeFullOutcome(minimalOutcome, reportsDir);

		assert.strictEqual(result.id, "failure");
		assert.strictEqual(result.tag, "❌ 🆕"); // New project
		assert.strictEqual(result.time, "2.8s"); // 2750ms = 2.8s
		assert.strictEqual(result.outcome, "failure");
	});

	test("computes error placeholder", () => {
		const minimalOutcome: MinimalOutcome = {
			id: "error",
			outcome: "success",
		};
		const result = computeFullOutcome(minimalOutcome, reportsDir);

		assert.strictEqual(result.id, "error");
		assert.strictEqual(result.tag, "✅ ⚠️"); // Error indicator
		assert.strictEqual(result.time, "Error while running Biome");
		assert.strictEqual(result.outcome, "success");
	});

	test("computes recovered from error", () => {
		const minimalOutcome: MinimalOutcome = {
			id: "recovered",
			outcome: "success",
		};
		const result = computeFullOutcome(
			minimalOutcome,
			reportsDir,
			previousReportsDir,
		);

		assert.strictEqual(result.id, "recovered");
		assert.strictEqual(result.tag, "✅ 🆕"); // Treated as new
		assert.strictEqual(result.time, "950ms");
		assert.strictEqual(result.outcome, "success");
	});
});

describe("aggregateResults", () => {
	test("generates basic message", () => {
		const outcomes: OutcomeData[] = [
			{
				id: "test1",
				tag: "✅",
				time: "1.2s",
				outcome: "success",
			},
			{
				id: "test2",
				tag: "❌",
				time: "2.3s",
				outcome: "failure",
			},
		];

		const message = aggregateResults(outcomes);

		assert.ok(message.includes("**Biome Ecosystem CI Results**"));
		assert.ok(message.includes("**test1**"));
		assert.ok(message.includes("**test2**"));
		assert.ok(message.includes("**Summary:** 1 passed, 1 failed, 0 other"));
	});

	test("includes biome ref", () => {
		const outcomes: OutcomeData[] = [
			{
				id: "test",
				tag: "✅",
				time: "1.2s",
				outcome: "success",
			},
		];

		const message = aggregateResults(outcomes, "main");

		assert.ok(message.includes("(biome ref: `main`)"));
	});

	test("includes run URL", () => {
		const outcomes: OutcomeData[] = [
			{
				id: "test",
				tag: "✅",
				time: "1.2s",
				outcome: "success",
			},
		];

		const message = aggregateResults(
			outcomes,
			undefined,
			"https://github.com/test/runs/123",
		);

		assert.ok(message.includes("[View full run]"));
		assert.ok(message.includes("https://github.com/test/runs/123"));
	});

	test("sorts outcomes alphabetically", () => {
		const outcomes: OutcomeData[] = [
			{
				id: "zebra",
				tag: "✅",
				time: "1s",
				outcome: "success",
			},
			{
				id: "apple",
				tag: "✅",
				time: "1s",
				outcome: "success",
			},
		];

		const message = aggregateResults(outcomes);
		const appleIndex = message.indexOf("**apple**");
		const zebraIndex = message.indexOf("**zebra**");

		assert.ok(appleIndex < zebraIndex, "Should be sorted alphabetically");
	});

	test("counts outcomes correctly", () => {
		const outcomes: OutcomeData[] = [
			{ id: "s1", tag: "✅", time: "1s", outcome: "success" },
			{ id: "s2", tag: "✅", time: "1s", outcome: "success" },
			{ id: "f1", tag: "❌", time: "1s", outcome: "failure" },
			{ id: "o1", tag: "❓", time: "1s", outcome: "skipped" },
		];

		const message = aggregateResults(outcomes);

		assert.ok(message.includes("**Summary:** 2 passed, 1 failed, 1 other (total: 4)"));
	});
});

describe("Integration tests", () => {
	test("full workflow with fixtures", () => {
		const outcomesDir = path.join(fixturesDir, "outcomes");
		const reportsDir = path.join(fixturesDir, "reports");
		const previousReportsDir = path.join(fixturesDir, "previous-reports");

		const minimalOutcomes = readMinimalOutcomes(outcomesDir);
		const fullOutcomes = minimalOutcomes.map((outcome) =>
			computeFullOutcome(outcome, reportsDir, previousReportsDir),
		);
		const message = aggregateResults(fullOutcomes, "main", "https://example.com");

		// Verify message contains expected elements
		assert.ok(message.includes("**Biome Ecosystem CI Results**"));
		assert.ok(message.includes("(biome ref: `main`)"));
		assert.ok(message.includes("[View full run]"));

		// Verify all projects are included
		assert.ok(message.includes("**error**"));
		assert.ok(message.includes("**failure**"));
		assert.ok(message.includes("**recovered**"));
		assert.ok(message.includes("**success**"));

		// Verify trends
		assert.ok(message.includes("📉")); // success has fewer diagnostics
		assert.ok(message.includes("⚠️")); // error has warning
		assert.ok(message.includes("🆕")); // failure and recovered are new

		// Verify times
		assert.ok(message.includes("Error while running Biome")); // error case
		assert.ok(message.includes("1.5s")); // success time
		assert.ok(message.includes("2.8s")); // failure time
		assert.ok(message.includes("950ms")); // recovered time
	});
});

console.info("All tests passed! ✅");
