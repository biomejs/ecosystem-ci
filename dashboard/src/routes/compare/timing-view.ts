// The compare page draws each timing comparison in one of two ways. Both start from the
// same statistics; they differ in the question they answer.
export type TimingView = "ranges" | "shift";

export const TIMING_VIEWS: {
	key: TimingView;
	label: string;
	description: string;
}[] = [
	{
		key: "ranges",
		label: "Ranges",
		description:
			"Each run's fastest to slowest sample on its own row, median marked",
	},
	{
		key: "shift",
		label: "Shift",
		description:
			"How far the head median moved, drawn over the base run's spread",
	},
];

export function selectTimingView(requested: string | null): TimingView {
	return requested === "shift" ? "shift" : "ranges";
}

/** position of a value along a track, as a percentage; a flat domain sits in the middle */
export function trackPercent(value: number, lo: number, hi: number): number {
	return hi === lo ? 50 : ((value - lo) / (hi - lo)) * 100;
}
