import type { RepositoryComparison, RunObservation } from "./types";

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

export function reviewKind(
	row: RepositoryComparison,
): "better" | "quiet" | "worse" {
	const check = percentDelta(row.base.checkMs, row.head.checkMs) ?? 0;
	const diagnostics = diagnosticDelta(row);
	const panics = row.head.panics - row.base.panics;
	if (panics > 0 || diagnostics > 0 || check > 10) return "worse";
	if (panics < 0 || diagnostics < 0 || check < -10) return "better";
	return "quiet";
}

export function impact(row: RepositoryComparison): number {
	const check = Math.abs(percentDelta(row.base.checkMs, row.head.checkMs) ?? 0);
	return (
		Math.abs(diagnosticDelta(row)) * 20 +
		Math.abs(row.head.panics - row.base.panics) * 100 +
		check
	);
}
