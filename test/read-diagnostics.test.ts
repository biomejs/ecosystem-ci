import assert from "node:assert";
import { describe, test } from "vitest";
import {
	type Diagnostic,
	filterDiagnostics,
	formatDiagnostic,
	selectReport,
} from "../dashboard/scripts/read-diagnostics.ts";

const diagnostics: Diagnostic[] = [
	{
		severity: "error",
		category: "lint/suspicious/noArrayIndexKey",
		message: "Avoid using the array index as a key.",
		location: {
			path: "packages/ui/list.tsx",
			start: { line: 12, column: 8 },
			end: { line: 12, column: 13 },
		},
		advices: [{ text: "Use a stable value instead. " }],
	},
	{
		severity: "warning",
		category: "lint/style/useImportType",
		message: "Use an import type.",
		location: { path: "apps/web/index.ts" },
	},
];

describe("selectReport", () => {
	const manifest = {
		runs: [
			{
				githubRunId: 1,
				startedAt: "2026-08-01T00:00:00Z",
				results: [
					{
						repositorySlug: "withastro/astro",
						report: "reports/1/biome-report-astro.json",
					},
				],
			},
			{
				githubRunId: 2,
				startedAt: "2026-09-01T00:00:00Z",
				results: [
					{
						repositorySlug: "withastro/astro",
						report: "reports/2/biome-report-astro.json",
					},
				],
			},
		],
	};

	test("uses the newest report by default", () => {
		assert.strictEqual(selectReport(manifest, "astro")?.run.githubRunId, 2);
	});

	test("accepts a repository slug and run id", () => {
		assert.strictEqual(
			selectReport(manifest, "withastro/astro", "1")?.run.githubRunId,
			1,
		);
	});
});

describe("filterDiagnostics", () => {
	test("filters category prefixes and severity", () => {
		assert.deepStrictEqual(
			filterDiagnostics(diagnostics, {
				severities: ["error"],
				categories: ["lint/suspicious"],
			}),
			[diagnostics[0]],
		);
	});

	test("searches paths and advice", () => {
		assert.deepStrictEqual(filterDiagnostics(diagnostics, { path: "apps" }), [
			diagnostics[1],
		]);
		assert.deepStrictEqual(
			filterDiagnostics(diagnostics, { search: "stable" }),
			[diagnostics[0]],
		);
	});
});

test("formatDiagnostic prints the useful fields", () => {
	assert.strictEqual(
		formatDiagnostic(diagnostics[0], 0),
		[
			"1. ERROR lint/suspicious/noArrayIndexKey",
			"   packages/ui/list.tsx:12:8-12:13",
			"   Avoid using the array index as a key.",
			"   Advice: Use a stable value instead.",
		].join("\n"),
	);
});
