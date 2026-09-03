import type { RepositoryComparison, RunObservation } from "./types";

const MIN_TIMING_PERCENT = 20;
const MIN_CHECK_CHANGE_MS = 25;
const MIN_SCANNER_CHANGE_MS = 10;
const MIN_DIAGNOSTIC_PERCENT = 5;
const MIN_DIAGNOSTIC_COUNT = 10;

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
	if (value === null || value === 0) return "var(--muted)";
	const intensity = Math.min(
		100,
		Math.round(15 + (Math.abs(value) / fullSignalAt) * 85),
	);
	const direction = value > 0 ? "var(--worse)" : "var(--better)";
	return `color-mix(in oklab, ${direction} ${intensity}%, var(--muted))`;
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

function timingSignal(
	base: number | null,
	head: number | null,
	minimumChangeMs: number,
): number {
	if (base === null || head === null) return 0;
	const percentage = percentDelta(base, head);
	if (
		percentage === null ||
		Math.abs(percentage) < MIN_TIMING_PERCENT ||
		Math.abs(head - base) < minimumChangeMs
	) {
		return 0;
	}
	return Math.sign(head - base);
}

function diagnosticSignal(row: RepositoryComparison): number {
	const base = diagnosticTotal(row.base);
	const head = diagnosticTotal(row.head);
	const count = head - base;
	const percentage = relativeDelta(base, head);
	if (
		Math.abs(count) < MIN_DIAGNOSTIC_COUNT ||
		Math.abs(percentage) < MIN_DIAGNOSTIC_PERCENT
	) {
		return 0;
	}
	return Math.sign(count);
}

export function reviewKind(
	row: RepositoryComparison,
): "better" | "quiet" | "worse" {
	const signals = [
		timingSignal(row.base.checkMs, row.head.checkMs, MIN_CHECK_CHANGE_MS),
		timingSignal(row.base.scannerMs, row.head.scannerMs, MIN_SCANNER_CHANGE_MS),
		diagnosticSignal(row),
		Math.sign(row.head.panics - row.base.panics),
	];
	if (signals.some((signal) => signal > 0)) return "worse";
	if (signals.some((signal) => signal < 0)) return "better";
	return "quiet";
}

export function impact(row: RepositoryComparison): number {
	const check = Math.abs(percentDelta(row.base.checkMs, row.head.checkMs) ?? 0);
	const scanner = Math.abs(
		percentDelta(row.base.scannerMs, row.head.scannerMs) ?? 0,
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
