#!/usr/bin/env node

/**
 * Aggregate Biome Ecosystem CI Outcomes
 *
 * This script aggregates outcome data from multiple test runs and generates
 * a formatted Discord message summarizing the results.
 *
 * @example
 * # Basic usage
 * node scripts/aggregate-outcomes.js \
 *   --outcomes-dir ./outcomes \
 *   --biome-ref main \
 *   --run-url "https://github.com/biomejs/ecosystem-ci/actions/runs/123456"
 *
 * @example
 * # Using short flags
 * node scripts/aggregate-outcomes.js -o ./outcomes -r main -u "https://..."
 *
 * @example
 * # Testing locally with sample data
 * mkdir -p test-outcomes/outcome-example
 * echo '{"id":"example","tag":"✅","time":"1.2s","outcome":"success"}' \
 *   > test-outcomes/outcome-example/outcome.json
 * node scripts/aggregate-outcomes.js -o test-outcomes -r main -u "https://example.com"
 */

import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

/**
 * Expected structure of outcome JSON files.
 *
 * Each test run should create a JSON file with this structure:
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
 *
 * @example
 * {
 *   "id": "ant-design",
 *   "tag": "✅ 📉",
 *   "time": "1.2s",
 *   "outcome": "success"
 * }
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
 *
 * Content of outcome.json files:
 *
 * {
 *   "id": "ant-design",
 *   "tag": "✅ 📉",
 *   "time": "1.2s",
 *   "outcome": "success"
 * }
 *
 * {
 *   "id": "astro",
 *   "tag": "❌ 🆕",
 *   "time": "3.4s",
 *   "outcome": "failure"
 * }
 *
 * {
 *   "id": "coder",
 *   "tag": "❓",
 *   "time": "?",
 *   "outcome": "skipped"
 * }
 */

/**
 * Display usage information
 */
function showHelp() {
	console.info(`
Usage: aggregate-outcomes.js [options]

Aggregates Biome ecosystem CI outcome data and generates a Discord message.

Options:
  -o, --outcomes-dir <path>   Path to directory containing outcome-* subdirectories (required)
  -r, --biome-ref <ref>       Biome reference (branch/tag) used in the test run (optional)
  -u, --run-url <url>         GitHub Actions run URL for linking (optional)
  -h, --help                  Show this help message

Examples:
  # Aggregate outcomes from CI (with all options)
  node scripts/aggregate-outcomes.js \\
    --outcomes-dir ./outcomes \\
    --biome-ref main \\
    --run-url "https://github.com/biomejs/ecosystem-ci/actions/runs/123456"

  # Using short flags
  node scripts/aggregate-outcomes.js -o ./outcomes -r main -u "https://..."

  # Minimal usage (without biome-ref and run-url)
  node scripts/aggregate-outcomes.js -o ./outcomes

Expected Directory Structure:
  outcomes/
    outcome-ant-design/
      outcome.json
    outcome-astro/
      outcome.json
    ...

Output:
  Prints a formatted Discord message to stdout.
`);
}

/**
 * Parse command line arguments using Node.js util.parseArgs
 * @returns {{outcomesDir: string, biomeRef?: string, runUrl?: string}}
 */
function parseCliArgs() {
	const { values } = parseArgs({
		options: {
			"outcomes-dir": {
				type: "string",
				short: "o",
			},
			"biome-ref": {
				type: "string",
				short: "r",
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

	return {
		outcomesDir: values["outcomes-dir"],
		biomeRef: values["biome-ref"],
		runUrl: values["run-url"],
	};
}

/**
 * Read all outcome JSON files from the outcomes directory
 * @param {string} outcomesDir - Path to directory containing outcome-* subdirectories
 * @returns {OutcomeData[]}
 */
function readOutcomes(outcomesDir) {
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
		messageParts.push(`**Biome Ecosystem CI Results** (biome ref: \`${biomeRef}\`)`);
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
	const outcomes = readOutcomes(config.outcomesDir);

	if (outcomes.length === 0) {
		console.error("Error: No outcome files found");
		process.exit(1);
	}

	const message = aggregateResults(outcomes, config.biomeRef, config.runUrl);
	console.info(message);
}

main();
