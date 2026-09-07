// Major/minor step presets, repeated at each power of ten in milliseconds.
const STEP_PRESETS = [
	{ major: 1, minor: 0.2 },
	{ major: 2, minor: 0.5 },
	{ major: 5, minor: 1 },
	{ major: 10, minor: 2 },
];
const MIN_LABEL_SPACING_PX = 64;

function multiples(lo: number, hi: number, step: number): number[] {
	const first = Math.ceil(lo / step);
	const last = Math.floor(hi / step);
	return Array.from(
		{ length: Math.max(0, last - first + 1) },
		(_, i) => (first + i) * step,
	);
}

/** Select readable ticks inside the existing domain; never expand or snap its bounds. */
export function rangeRuler(lo: number, hi: number, width: number) {
	const required = Math.max(
		1,
		((hi - lo) * MIN_LABEL_SPACING_PX) / Math.max(1, width),
	);
	const magnitude = 10 ** Math.floor(Math.log10(required));
	const preset =
		STEP_PRESETS.find((p) => p.major * magnitude >= required) ??
		STEP_PRESETS[3];
	const major = preset.major * magnitude;
	const minor = preset.minor * magnitude;
	return {
		major,
		minor,
		majorTicks: multiples(lo, hi, major),
		minorTicks: multiples(lo, hi, minor).filter(
			(value) => Math.abs(value / major - Math.round(value / major)) > 1e-8,
		),
	};
}

/** Preserve fractional milliseconds in labels and landmark tooltips. */
export function formatRulerTime(value: number): string {
	return Math.abs(value) >= 1000
		? `${Number((value / 1000).toFixed(2))} s`
		: `${Number(value.toFixed(2))} ms`;
}
