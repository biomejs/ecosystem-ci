interface LinearDomainOptions {
	baseline?: number | null;
	zeroBased?: boolean;
	/** Minimum domain width as a multiple of the baseline or median sample. */
	softRelativeSpan?: number | null;
	/** Minimum domain width in the metric's native unit. */
	minimumSpan?: number | null;
	padding?: number;
}

function median(values: number[]): number | null {
	if (values.length === 0) return null;
	const sorted = values.toSorted((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? (sorted[middle - 1] + sorted[middle]) / 2
		: sorted[middle];
}

export function linearDomain(
	values: (number | null)[],
	{
		baseline = null,
		zeroBased = false,
		softRelativeSpan = null,
		minimumSpan = null,
		padding = 0.14,
	}: LinearDomainOptions = {},
): [number, number] {
	const samples = values.filter((value): value is number => value !== null);
	const defined = baseline === null ? samples : [...samples, baseline];
	if (defined.length === 0) return [0, 1];

	let low = Math.min(...defined);
	let high = Math.max(...defined);
	if (zeroBased) low = 0;
	if (high === low) {
		high = low === 0 ? 1 : low * 1.1;
		low = low === 0 ? 0 : low * 0.9;
	}

	const dataPadding = (high - low) * padding;
	let domainLow = zeroBased ? 0 : low - dataPadding;
	let domainHigh = high + dataPadding;
	const reference =
		baseline !== null && baseline > 0
			? baseline
			: median(samples.filter((value) => value > 0));

	if (softRelativeSpan !== null && softRelativeSpan > 0) {
		if (reference !== null) {
			const halfSpan = (reference * softRelativeSpan) / 2;
			domainLow = Math.max(0, Math.min(domainLow, reference - halfSpan));
			domainHigh = Math.max(domainHigh, reference + halfSpan);
		}
	}

	if (
		minimumSpan !== null &&
		minimumSpan > 0 &&
		domainHigh - domainLow < minimumSpan
	) {
		const center = reference ?? (domainLow + domainHigh) / 2;
		let suggestedLow = center - minimumSpan / 2;
		let suggestedHigh = center + minimumSpan / 2;
		if (defined.every((value) => value >= 0) && suggestedLow < 0) {
			suggestedHigh -= suggestedLow;
			suggestedLow = 0;
		}
		domainLow = Math.min(domainLow, suggestedLow);
		domainHigh = Math.max(domainHigh, suggestedHigh);
	}

	return [domainLow, domainHigh];
}
