/** Shared chart focus; pointer leave restores the run pinned by the inspector. */
export const hover = $state({
	index: null as number | null,
	pinned: null as number | null,
});

export function validRunIndex(
	index: number | null,
	runCount: number,
): number | null {
	return index !== null &&
		Number.isInteger(index) &&
		index >= 0 &&
		index < runCount
		? index
		: null;
}
