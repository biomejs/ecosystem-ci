#!/usr/bin/env node

/**
 * Aggregate Biome Ecosystem CI Outcomes
 *
 * This script aggregates outcome data from multiple test runs, computes trends
 * by comparing biome JSON reports, and generates a formatted Discord message.
 *
 * @example
 * # Full usage with reports
 * node --experimental-strip-types scripts/aggregate-outcomes.ts \
 *   --outcomes-dir ./outcomes \
 *   --reports-dir ./reports \
 *   --previous-reports-dir ./previous-reports \
 *   --biome-ref main \
 *   --run-url "https://github.com/biomejs/ecosystem-ci/actions/runs/123456"
 *
 * @example
 * # Using short flags
 * node --experimental-strip-types scripts/aggregate-outcomes.ts \
 *   -o ./outcomes \
 *   -r ./reports \
 *   -p ./previous-reports \
 *   -b main \
 *   -u "https://..."
 *
 * @example
 * # Minimal usage (no trends)
 * node --experimental-strip-types scripts/aggregate-outcomes.ts -o ./outcomes -r ./reports
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

/**
 * Minimal outcome data from matrix jobs
 */
export interface MinimalOutcome {
	/** Project identifier (e.g., "ant-design") */
	id: string;
	/** Test outcome: "success" | "failure" | "skipped" | other */
	outcome: string;
}

/**
 * Summary statistics from Biome JSON report
 */
export interface BiomeSummary {
	/** Number of files changed */
	changed?: number;
	/** Number of files unchanged */
	unchanged?: number;
	/** Number of matches */
	matches?: number;
	/** Execution duration in milliseconds */
	duration?: number;
	/** Number of errors */
	errors?: number;
	/** Number of warnings */
	warnings?: number;
	/** Number of info diagnostics */
	infos?: number;
	/** Number of files skipped */
	skipped?: number;
	/** Number of suggested fixes skipped */
	suggestedFixesSkipped?: number;
	/** Number of diagnostics not printed */
	diagnosticsNotPrinted?: number;
	/** Scanner duration in milliseconds */
	scannerDuration?: number;
}

/**
 * Biome JSON report structure
 */
export interface BiomeReport {
	/** Summary statistics */
	summary?: BiomeSummary;
	/** Error flag (set when report generation failed) */
	error?: boolean;
}

/**
 * Full outcome data with computed trends
 */
export interface OutcomeData {
	/** Project identifier (e.g., "ant-design") */
	id: string;
	/**
	 * Status emoji with indicators:
	 * - "✅" = success
	 * - "❌" = failure
	 * - "❓" = skipped/timeout/other
	 * - "🆕" = new project (appended to base emoji)
	 * - "📈" = more diagnostics than before (appended)
	 * - "📉" = fewer diagnostics than before (appended)
	 * - "⚠️" = error running biome (appended)
	 */
	tag: string;
	/** Execution time (e.g., "1.2s", "30ms", "?") */
	time: string;
	/** Test outcome: "success" | "failure" | "skipped" | other */
	outcome: string;
}

/**
 * Configuration from CLI arguments
 */
export interface Config {
	outcomesDir: string;
	reportsDir: string;
	previousReportsDir?: string;
	biomeRef?: string;
	runUrl?: string;
}

/*
 * Example JSON data structure that the script expects to receive:
 *
 * Directory structure (flat files):
 *   outcomes/
 *     outcome-ant-design.json
 *     outcome-astro.json
 *   reports/
 *     biome-report-ant-design.json
 *     biome-report-astro.json
 *   previous-reports/
 *     biome-report-ant-design.json
 *
 * Content of outcome-*.json files:
 * {
 *   "id": "ant-design",
 *   "outcome": "success"
 * }
 *
 * Content of biome-report-*.json files (from biome check --reporter=json --reporter-file=...):
 * {
 *   "summary": {
 *     "changed": 0,
 *     "unchanged": 2,
 *     "matches": 0,
 *     "duration": 1234.567890,
 *     "errors": 5,
 *     "warnings": 3,
 *     "infos": 0,
 *     "skipped": 0,
 *     "suggestedFixesSkipped": 0,
 *     "diagnosticsNotPrinted": 0,
 *     "scannerDuration": 123.456
 *   },
 *   "diagnostics": [...],
 *   "command": "check"
 * }
 */

/**
 * Display usage information
 */
export function showHelp(): void {
	console.info(`
Usage: aggregate-outcomes.ts [options]

Aggregates Biome ecosystem CI outcome data, computes trends from JSON reports,
and generates a Discord message.

Options:
  -o, --outcomes-dir <path>          Path to directory with outcome-* subdirectories (required)
  -r, --reports-dir <path>           Path to directory with biome-report-* subdirectories (required)
  -p, --previous-reports-dir <path>  Path to directory with previous reports (optional, for trends)
  -b, --biome-ref <ref>              Biome reference (branch/tag) used in the test run (optional)
  -u, --run-url <url>                GitHub Actions run URL for linking (optional)
  -h, --help                         Show this help message

Examples:
  # Full usage with trend computation
  node --experimental-strip-types scripts/aggregate-outcomes.ts \\
    --outcomes-dir ./outcomes \\
    --reports-dir ./reports \\
    --previous-reports-dir ./previous-reports \\
    --biome-ref main \\
    --run-url "https://github.com/biomejs/ecosystem-ci/actions/runs/123456"

  # Using short flags
  node --experimental-strip-types scripts/aggregate-outcomes.ts -o ./outcomes -r ./reports -p ./prev -b main -u "https://..."

  # Without trends (no previous reports)
  node --experimental-strip-types scripts/aggregate-outcomes.ts -o ./outcomes -r ./reports

Expected Directory Structure:
  outcomes/
    outcome-ant-design.json
    outcome-astro.json
  reports/
    biome-report-ant-design.json
    biome-report-astro.json
  previous-reports/ (optional)
    biome-report-ant-design.json

Output:
  Prints a formatted Discord message to stdout.
`);
}

/**
 * Parse command line arguments using Node.js util.parseArgs
 */
export function parseCliArgs(): Config {
	const { values } = parseArgs({
		options: {
			"outcomes-dir": {
				type: "string",
				short: "o",
			},
			"reports-dir": {
				type: "string",
				short: "r",
			},
			"previous-reports-dir": {
				type: "string",
				short: "p",
			},
			"biome-ref": {
				type: "string",
				short: "b",
			},
			"run-url": {
				type: "string",
				short: "u",
			},
			help: {
				type: "boolean",
				short: "h",
			},
		},
	});

	if (values.help) {
		showHelp();
		process.exit(0);
	}

	if (!values["outcomes-dir"]) {
		console.error("Error: --outcomes-dir is required");
		showHelp();
		process.exit(1);
	}

	if (!values["reports-dir"]) {
		console.error("Error: --reports-dir is required");
		showHelp();
		process.exit(1);
	}

	return {
		outcomesDir: values["outcomes-dir"],
		reportsDir: values["reports-dir"],
		previousReportsDir: values["previous-reports-dir"],
		biomeRef: values["biome-ref"],
		runUrl: values["run-url"],
	};
}

/**
 * Read all minimal outcome JSON files from the outcomes directory
 */
export function readMinimalOutcomes(outcomesDir: string): MinimalOutcome[] {
	const outcomes: MinimalOutcome[] = [];

	try {
		const entries = fs.readdirSync(outcomesDir);

		for (const entry of entries) {
			if (!entry.startsWith("outcome-") || !entry.endsWith(".json")) continue;

			const outcomeFile = path.join(outcomesDir, entry);

			if (fs.existsSync(outcomeFile)) {
				const content = fs.readFileSync(outcomeFile, "utf-8");
				const data = JSON.parse(content) as MinimalOutcome;
				outcomes.push(data);
			}
		}
	} catch (error) {
		console.error(
			`Error reading outcomes from ${outcomesDir}:`,
			(error as Error).message,
		);
		process.exit(1);
	}

	return outcomes;
}

/**
 * Read a biome JSON report file
 */
export function readReport(
	reportsDir: string,
	projectId: string,
): BiomeReport | null {
	const reportPath = path.join(reportsDir, `biome-report-${projectId}.json`);

	if (fs.existsSync(reportPath)) {
		try {
			const content = fs.readFileSync(reportPath, "utf-8");
			const report = JSON.parse(content) as BiomeReport;

			// Check if this is an error placeholder
			if (report.error === true) {
				return { error: true };
			}

			return report;
		} catch (error) {
			console.error(
				`Warning: Failed to parse JSON report for ${projectId}: ${(error as Error).message}`,
			);
			console.error(`Report path: ${reportPath}`);
			return null;
		}
	}

	return null;
}

/**
 * Format duration from biome report (duration is in milliseconds)
 */
export function formatDuration(duration: number | undefined): string {
	if (duration === undefined || duration === null) return "?";

	if (duration < 1000) {
		return `${Math.round(duration)}ms`;
	}

	return `${(duration / 1000).toFixed(1)}s`;
}

/**
 * Get total diagnostic count from report
 */
export function getTotalDiagnostics(report: BiomeReport | null): number {
	if (!report || !report.summary) return 0;
	return (
		(report.summary.errors || 0) +
		(report.summary.warnings || 0) +
		(report.summary.infos || 0)
	);
}

/**
 * Compare two reports and determine trend indicator
 */
export function computeTrend(
	previousReport: BiomeReport | null,
	currentReport: BiomeReport | null,
): string {
	// Error in current run
	if (currentReport?.error) {
		return "⚠️";
	}

	// New project (no previous report or no current report)
	// Also treat as new if previous report had an error
	if (!previousReport || !currentReport || previousReport.error) {
		return "🆕";
	}

	const previousTotal = getTotalDiagnostics(previousReport);
	const currentTotal = getTotalDiagnostics(currentReport);

	if (previousTotal === currentTotal) {
		// No change
		return "";
	}

	if (currentTotal > previousTotal) {
		return "📈"; // More diagnostics
	}

	return "📉"; // Fewer diagnostics
}

/**
 * Compute base tag from test outcome
 */
export function computeBaseTag(outcome: string): string {
	if (outcome === "success") {
		return "✅";
	}
	if (outcome === "failure") {
		return "❌";
	}
	return "❓";
}

/**
 * Compute full outcome data with trends
 */
export function computeFullOutcome(
	minimalOutcome: MinimalOutcome,
	reportsDir: string,
	previousReportsDir?: string,
): OutcomeData {
	const { id, outcome } = minimalOutcome;

	// Read reports
	const currentReport = readReport(reportsDir, id);
	const previousReport = previousReportsDir
		? readReport(previousReportsDir, id)
		: null;

	// Compute components
	const baseTag = computeBaseTag(outcome);
	const trend = computeTrend(previousReport, currentReport);
	const time = currentReport?.error
		? "Error while running Biome"
		: currentReport
			? formatDuration(currentReport.summary?.duration)
			: "?";

	// Build full tag
	const tag = trend ? `${baseTag} ${trend}` : baseTag;

	return {
		id,
		tag,
		time,
		outcome,
	};
}

/**
 * Aggregate outcomes and generate Discord message
 */
export function aggregateResults(
	outcomes: OutcomeData[],
	biomeRef?: string,
	runUrl?: string,
): string {
	// Sort outcomes by id for consistent ordering
	outcomes.sort((a, b) => a.id.localeCompare(b.id));

	// Count outcomes
	let success = 0;
	let failure = 0;
	let other = 0;

	const lines = outcomes.map((outcome) => {
		// Count by outcome type
		if (outcome.outcome === "success") {
			success++;
		} else if (outcome.outcome === "failure") {
			failure++;
		} else {
			other++;
		}

		return `${outcome.tag} **${outcome.id}** ${outcome.time}`;
	});

	const total = outcomes.length;

	// Build the message parts
	const messageParts: string[] = [];

	// Add header with optional biome ref
	if (biomeRef) {
		messageParts.push(
			`**Biome Ecosystem CI Results** (biome ref: \`${biomeRef}\`)`,
		);
	} else {
		messageParts.push("**Biome Ecosystem CI Results**");
	}

	messageParts.push("");
	messageParts.push(...lines);
	messageParts.push("");
	messageParts.push(
		`**Summary:** ${success} passed, ${failure} failed, ${other} other (total: ${total})`,
	);

	// Add run URL if provided
	if (runUrl) {
		messageParts.push(`[View full run](<${runUrl}>)`);
	}

	return messageParts.join("\n");
}

/**
 * Main function
 */
export function main(): void {
	const config = parseCliArgs();

	// Read minimal outcomes
	const minimalOutcomes = readMinimalOutcomes(config.outcomesDir);

	if (minimalOutcomes.length === 0) {
		console.error("Error: No outcome files found");
		process.exit(1);
	}

	// Compute full outcomes with trends
	const fullOutcomes = minimalOutcomes.map((minimalOutcome) =>
		computeFullOutcome(
			minimalOutcome,
			config.reportsDir,
			config.previousReportsDir,
		),
	);

	// Generate and print Discord message
	const message = aggregateResults(
		fullOutcomes,
		config.biomeRef,
		config.runUrl,
	);
	console.info(message);
}
