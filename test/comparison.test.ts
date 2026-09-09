import { describe, expect, test } from "vitest";
import { summarizeSamples } from "../dashboard/src/lib/timing";
import {
	reviewKind,
	timingDeltaColor,
} from "../dashboard/src/routes/compare/comparison";
import type {
	RepositoryComparison,
	RunObservation,
} from "../dashboard/src/routes/compare/types";

const stats = (median: number) =>
	summarizeSamples([median - 2, median - 1, median, median + 1, median + 2]);

function row(
	base: Partial<RunObservation> = {},
	head: Partial<RunObservation> = {},
): RepositoryComparison {
	const observation: RunObservation = {
		check: stats(500),
		scanner: stats(250),
		errors: 0,
		warnings: 0,
		infos: 0,
		parseDiagnostics: 0,
		panics: 0,
	};
	return {
		repositorySlug: "test/repository",
		base: { ...observation, ...base },
		head: { ...observation, ...head },
	};
}

describe("comparison review", () => {
	test.each(["check", "scanner"] as const)(
		"requires both the absolute and percentage thresholds for %s",
		(metric) => {
			const floor = metric === "check" ? 100 : 50;
			expect(
				reviewKind(
					row({ [metric]: stats(floor) }, { [metric]: stats(2 * floor - 1) }),
				),
			).toBe("quiet");
			expect(
				reviewKind(
					row({ [metric]: stats(10 * floor) }, { [metric]: stats(11 * floor) }),
				),
			).toBe("quiet");
			expect(
				reviewKind(
					row({ [metric]: stats(5 * floor) }, { [metric]: stats(6 * floor) }),
				),
			).toBe("worse");
			expect(
				reviewKind(
					row({ [metric]: stats(5 * floor) }, { [metric]: stats(4 * floor) }),
				),
			).toBe("better");
		},
	);

	test.each(["check", "scanner"] as const)(
		"requires strictly separated middle halves for %s",
		(metric) => {
			const base = summarizeSamples([100, 200, 300, 400, 500]);
			for (const q1 of [350, 400]) {
				const head = summarizeSamples([300, q1, 600, 700, 800]);
				expect(reviewKind(row({ [metric]: base }, { [metric]: head }))).toBe(
					"quiet",
				);
				expect(reviewKind(row({ [metric]: head }, { [metric]: base }))).toBe(
					"quiet",
				);
			}
			const head = summarizeSamples([300, 401, 600, 700, 800]);
			expect(reviewKind(row({ [metric]: base }, { [metric]: head }))).toBe(
				"worse",
			);
			expect(reviewKind(row({ [metric]: head }, { [metric]: base }))).toBe(
				"better",
			);
		},
	);

	test("does not flag the screenshot's check changes", () => {
		for (const [base, head] of [
			[83, 111],
			[212, 257],
		]) {
			expect(
				reviewKind(row({ check: stats(base) }, { check: stats(head) })),
			).toBe("quiet");
		}
	});

	test.each(["panics", "parseDiagnostics"] as const)(
		"flags even one additional %s independently of other counts",
		(metric) => {
			expect(reviewKind(row({ errors: 1000 }, { [metric]: 1 }))).toBe("worse");
			expect(reviewKind(row({ [metric]: 1 }, { errors: 1000 }))).toBe("better");
		},
	);

	test("ordinary diagnostics do not affect review in either direction", () => {
		const changes = { errors: 1000, warnings: 1000, infos: 1000 };
		expect(reviewKind(row({}, changes))).toBe("quiet");
		expect(reviewKind(row(changes, {}))).toBe("quiet");
	});

	test("review takes precedence over timing and correctness improvements", () => {
		expect(
			reviewKind(
				row({ panics: 1 }, { parseDiagnostics: 1, check: stats(300) }),
			),
		).toBe("worse");
		expect(reviewKind(row({ parseDiagnostics: 1 }, { panics: 1 }))).toBe(
			"worse",
		);
		expect(reviewKind(row({ panics: 1 }, { check: stats(600) }))).toBe("worse");
	});
});

describe("timing delta color", () => {
	test.each([-29.99, 0, 29.99])("keeps a %s ms change neutral", (delta) => {
		expect(timingDeltaColor(stats(100), stats(100 + delta))).toBe(
			"var(--color-muted)",
		);
	});
	test.each([-30, 30])("colors a %s ms change directionally", (delta) => {
		expect(timingDeltaColor(stats(100), stats(100 + delta))).toContain(
			delta > 0 ? "var(--color-worse)" : "var(--color-better)",
		);
	});
	test("missing timings stay neutral", () => {
		expect(timingDeltaColor(null, stats(100))).toBe("var(--color-muted)");
		expect(timingDeltaColor(stats(100), null)).toBe("var(--color-muted)");
	});
});
