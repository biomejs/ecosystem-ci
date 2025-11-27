#!/usr/bin/env node

/**
 * Aggregate Biome Ecosystem CI Outcomes
 *
 * This script aggregates outcome data from multiple test runs, computes trends
 * by comparing biome JSON reports, and generates a formatted Discord message.
 *
 * @example
 * # Full usage with reports
 * node scripts/aggregate-outcomes.js \
 *   --outcomes-dir ./outcomes \
 *   --reports-dir ./reports \
 *   --previous-reports-dir ./previous-reports \
 *   --biome-ref main \
 *   --run-url "https://github.com/biomejs/ecosystem-ci/actions/runs/123456"
 *
 * @example
 * # Using short flags
 * node scripts/aggregate-outcomes.js \
 *   -o ./outcomes \
 *   -r ./reports \
 *   -p ./previous-reports \
 *   -b main \
 *   -u "https://..."
 *
 * @example
 * # Minimal usage (no trends)
 * node scripts/aggregate-outcomes.js -o ./outcomes -r ./reports
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

/**
 * Minimal outcome data from matrix jobs
 *
 * @typedef {Object} MinimalOutcome
 * @property {string} id - Project identifier (e.g., "ant-design")
 * @property {string} outcome - Test outcome: "success" | "failure" | "skipped" | other
 */

/**
 * Biome JSON report structure
 *
 * @typedef {Object} BiomeReport
 * @property {Object} summary - Summary statistics
 * @property {Object} summary.duration - Execution duration
 * @property {number} summary.duration.secs - Seconds
 * @property {number} summary.duration.nanos - Nanoseconds
 * @property {number} summary.errors - Number of errors
 * @property {number} summary.warnings - Number of warnings
 * @property {number} summary.infos - Number of info diagnostics
 */

/**
 * Full outcome data with computed trends
 *
 * @typedef {Object} OutcomeData
 * @property {string} id - Project identifier (e.g., "ant-design")
 * @property {string} tag - Status emoji with indicators:
 *   - "✅" = success
 *   - "❌" = failure
 *   - "❓" = skipped/timeout/other
 *   - "🆕" = new project (appended to base emoji)
 *   - "📈" = more diagnostics than before (appended)
 *   - "📉" = fewer diagnostics than before (appended)
 * @property {string} time - Execution time (e.g., "1.2s", "30ms", "?")
 * @property {string} outcome - Test outcome: "success" | "failure" | "skipped" | other
 */

/*
 * Example JSON data structure that the script expects to receive:
 *
 * Directory structure:
 *   outcomes/
 *     outcome-ant-design/
 *       outcome.json
 *     outcome-astro/
 *       outcome.json
 *   reports/
 *     biome-report-ant-design/
 *       biome-report.json
 *     biome-report-astro/
 *       biome-report.json
 *   previous-reports/
 *     biome-report-ant-design/
 *       biome-report.json
 *
 * Content of outcome.json files (minimal):
 * {
 *   "id": "ant-design",
 *   "outcome": "success"
 * }
 *
 * Content of biome-report.json files (from biome check --reporter=json):
 * {
 *   "summary": {
 *     "duration": {"secs": 1, "nanos": 234567890},
 *     "errors": 5,
 *     "warnings": 3,
 *     "infos": 0
 *   },
 *   "diagnostics": [...]
 * }
 */

/**
 * Display usage information
 */
function showHelp() {
	console.info(`
Usage: aggregate-outcomes.js [options]

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
  node scripts/aggregate-outcomes.js \\
    --outcomes-dir ./outcomes \\
    --reports-dir ./reports \\
    --previous-reports-dir ./previous-reports \\
    --biome-ref main \\
    --run-url "https://github.com/biomejs/ecosystem-ci/actions/runs/123456"

  # Using short flags
  node scripts/aggregate-outcomes.js -o ./outcomes -r ./reports -p ./prev -b main -u "https://..."

  # Without trends (no previous reports)
  node scripts/aggregate-outcomes.js -o ./outcomes -r ./reports

Expected Directory Structure:
  outcomes/
    outcome-ant-design/
      outcome.json
    outcome-astro/
      outcome.json
  reports/
    biome-report-ant-design/
      biome-report.json
    biome-report-astro/
      biome-report.json
  previous-reports/ (optional)
    biome-report-ant-design/
      biome-report.json

Output:
  Prints a formatted Discord message to stdout.
`);
}

/**
 * Parse command line arguments using Node.js util.parseArgs
 * @returns {{outcomesDir: string, reportsDir: string, previousReportsDir?: string, biomeRef?: string, runUrl?: string}}
 */
function parseCliArgs() {
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
 * @param {string} outcomesDir - Path to directory containing outcome-* subdirectories
 * @returns {MinimalOutcome[]}
 */
function readMinimalOutcomes(outcomesDir) {
	const outcomes = [];

	try {
		const entries = fs.readdirSync(outcomesDir);

		for (const entry of entries) {
			if (!entry.startsWith("outcome-")) continue;

			const outcomeFile = path.join(outcomesDir, entry, "outcome.json");

			if (fs.existsSync(outcomeFile)) {
				const content = fs.readFileSync(outcomeFile, "utf-8");
				const data = JSON.parse(content);
				outcomes.push(data);
			}
		}
	} catch (error) {
		console.error(`Error reading outcomes from ${outcomesDir}:`, error.message);
		process.exit(1);
	}

	return outcomes;
}

/**
 * Read a biome JSON report file
 * @param {string} reportsDir - Directory containing biome-report-* subdirectories
 * @param {string} projectId - Project identifier
 * @returns {BiomeReport | null} - Parsed report or null if not found
 */
function readReport(reportsDir, projectId) {
	const reportPath = path.join(
		reportsDir,
		`biome-report-${projectId}`,
		"biome-report.json",
	);

	if (fs.existsSync(reportPath)) {
		try {
			const content = fs.readFileSync(reportPath, "utf-8");
			const report = JSON.parse(content);

			// Check if this is an error placeholder
			if (report.error === true) {
				return { error: true };
			}

			return report;
		} catch (error) {
			console.error(
				`Warning: Failed to parse JSON report for ${projectId}: ${error.message}`,
			);
			console.error(`Report path: ${reportPath}`);
			console.error(
				`Content preview: ${content.substring(0, 200)}...`,
			);
			return null;
		}
	}

	return null;
}

/**
 * Format duration from biome report
 * @param {Object} duration - Duration object with secs and nanos
 * @returns {string} - Formatted duration (e.g., "1.2s", "234ms")
 */
function formatDuration(duration) {
	if (!duration) return "?";

	const totalMs = duration.secs * 1000 + duration.nanos / 1000000;

	if (totalMs < 1000) {
		return `${Math.round(totalMs)}ms`;
	}

	return `${(totalMs / 1000).toFixed(1)}s`;
}

/**
 * Get total diagnostic count from report
 * @param {BiomeReport} report - Biome report
 * @returns {number} - Total number of diagnostics
 */
function getTotalDiagnostics(report) {
	if (!report || !report.summary) return 0;
	return (
		(report.summary.errors || 0) +
		(report.summary.warnings || 0) +
		(report.summary.infos || 0)
	);
}

/**
 * Compare two reports and determine trend indicator
 * @param {BiomeReport | null} previousReport - Previous report
 * @param {BiomeReport | null} currentReport - Current report
 * @returns {string} - Trend indicator: "🆕" | "📈" | "📉" | "⚠️" | ""
 */
function computeTrend(previousReport, currentReport) {
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
 * @param {string} outcome - Test outcome: "success" | "failure" | other
 * @returns {string} - Base tag emoji
 */
function computeBaseTag(outcome) {
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
 * @param {MinimalOutcome} minimalOutcome - Minimal outcome from matrix job
 * @param {string} reportsDir - Directory with current reports
 * @param {string | undefined} previousReportsDir - Directory with previous reports (optional)
 * @returns {OutcomeData} - Full outcome with computed tag, time, and trends
 */
function computeFullOutcome(
	minimalOutcome,
	reportsDir,
	previousReportsDir,
) {
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
 * @param {OutcomeData[]} outcomes - Array of outcome data
 * @param {string | undefined} biomeRef - Biome reference (branch/tag), optional
 * @param {string | undefined} runUrl - GitHub Actions run URL, optional
 * @returns {string} - Formatted Discord message
 */
function aggregateResults(outcomes, biomeRef, runUrl) {
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
	const messageParts = [];

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
function main() {
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

main();
