import type { TimingStats } from "$lib/timing";
import type { RepositoryComparison, RunObservation } from "./types";

const MIN_TIMING_PERCENT = 20;
const MIN_CHECK_CHANGE_MS = 100;
const MIN_SCANNER_CHANGE_MS = 50;
const MIN_TIMING_COLOR_CHANGE_MS = 30;

export function percentDelta(
	base: number | null,
	head: number | null,
): number | null {
	if (base === null || head === null || base === 0) return null;
	return ((head - base) / base) * 100;
}

export function relativeDelta(base: number, head: number): number {
	if (base === head) return 0;
	if (base === 0) return 100;
	return ((head - base) / base) * 100;
}

export function deltaColor(value: number | null, fullSignalAt = 20): string {
	if (value === null || value === 0) return "var(--color-muted)";
	const intensity = Math.min(
		100,
		Math.round(15 + (Math.abs(value) / fullSignalAt) * 85),
	);
	const direction = value > 0 ? "var(--color-worse)" : "var(--color-better)";
	return `color-mix(in oklab, ${direction} ${intensity}%, var(--color-muted))`;
}

export function diagnosticTotal(value: RunObservation): number {
	return (
		value.errors +
		value.warnings +
		value.infos +
		value.parseDiagnostics +
		value.panics
	);
}

export function diagnosticDelta(row: RepositoryComparison): number {
	return diagnosticTotal(row.head) - diagnosticTotal(row.base);
}

/** the central timing value displayed and used for relative changes */
export const medianMs = (stats: TimingStats | null): number | null =>
	stats === null ? null : stats.median;

export function timingDeltaColor(
	base: TimingStats | null,
	head: TimingStats | null,
): string {
	if (
		base === null ||
		head === null ||
		Math.abs(head.median - base.median) < MIN_TIMING_COLOR_CHANGE_MS
	) {
		return deltaColor(null);
	}
	return deltaColor(percentDelta(base.median, head.median));
}

function timingSignal(
	baseStats: TimingStats | null,
	headStats: TimingStats | null,
	minimumChangeMs: number,
): number {
	if (baseStats === null || headStats === null) return 0;
	const base = baseStats.median;
	const head = headStats.median;
	const percentage = percentDelta(base, head);
	if (
		percentage === null ||
		Math.abs(percentage) < MIN_TIMING_PERCENT ||
		Math.abs(head - base) < minimumChangeMs
	) {
		return 0;
	}
	if (head > base && headStats.q1 > baseStats.q3) return 1;
	if (head < base && headStats.q3 < baseStats.q1) return -1;
	return 0;
}

export function reviewKind(
	row: RepositoryComparison,
): "better" | "quiet" | "worse" {
	const signals = [
		timingSignal(row.base.check, row.head.check, MIN_CHECK_CHANGE_MS),
		timingSignal(row.base.scanner, row.head.scanner, MIN_SCANNER_CHANGE_MS),
		Math.sign(row.head.parseDiagnostics - row.base.parseDiagnostics),
		Math.sign(row.head.panics - row.base.panics),
	];
	if (signals.some((signal) => signal > 0)) return "worse";
	if (signals.some((signal) => signal < 0)) return "better";
	return "quiet";
}

export function impact(row: RepositoryComparison): number {
	const check = Math.abs(
		percentDelta(medianMs(row.base.check), medianMs(row.head.check)) ?? 0,
	);
	const scanner = Math.abs(
		percentDelta(medianMs(row.base.scanner), medianMs(row.head.scanner)) ?? 0,
	);
	const diagnostics = Math.abs(
		relativeDelta(diagnosticTotal(row.base), diagnosticTotal(row.head)),
	);
	return (
		Math.abs(row.head.panics - row.base.panics) * 100 +
		check +
		scanner +
		diagnostics
	);
}
