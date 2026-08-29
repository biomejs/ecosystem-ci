<script lang="ts">
import { formatCount, formatMs, formatPct } from "$lib/trends/format";
import {
	deltaColor,
	diagnosticDelta,
	diagnosticTotal,
	impact,
	percentDelta,
	relativeDelta,
	reviewKind,
} from "./comparison";
import type { RepositoryComparison } from "./types";

let { comparisons }: { comparisons: RepositoryComparison[] } = $props();

const rows = $derived(
	[...comparisons].sort((left, right) => {
		const order = { worse: 0, better: 1, quiet: 2 };
		const kindDelta = order[reviewKind(left)] - order[reviewKind(right)];
		return (
			kindDelta ||
			impact(right) - impact(left) ||
			left.repositorySlug.localeCompare(right.repositorySlug)
		);
	}),
);
const reviewCount = $derived(
	comparisons.filter((row) => reviewKind(row) === "worse").length,
);
const improvedCount = $derived(
	comparisons.filter((row) => reviewKind(row) === "better").length,
);
const quietCount = $derived(comparisons.length - reviewCount - improvedCount);

const signedCount = (value: number): string =>
	value > 0 ? `+${formatCount(value)}` : formatCount(value);
const color = (kind: ReturnType<typeof reviewKind>): string =>
	kind === "worse"
		? "var(--worse)"
		: kind === "better"
			? "var(--better)"
			: "var(--muted)";
</script>

<section aria-label="Repository comparison">
	<header class="variant-heading">
		<div class="summary-strip">
			<div>
				<strong style:color="var(--worse)">{reviewCount}</strong
				><span>review</span>
			</div>
			<div>
				<strong style:color="var(--better)">{improvedCount}</strong
				><span>improved</span>
			</div>
			<div><strong>{quietCount}</strong><span>quiet</span></div>
		</div>
	</header>

	<div class="scan-list">
		<div class="scan-labels" aria-hidden="true">
			<span>Repository</span>
			<span>Check time</span>
			<span>Scanner time</span>
			<span>Diagnostics</span>
			<span>Panics</span>
		</div>
		{#each rows as row (row.repositorySlug)}
			{@const kind = reviewKind(row)}
			{@const check = percentDelta(row.base.checkMs, row.head.checkMs)}
			{@const scanner = percentDelta(row.base.scannerMs, row.head.scannerMs)}
			{@const diagnostics = diagnosticDelta(row)}
			{@const diagnosticsRate = relativeDelta(
				diagnosticTotal(row.base),
				diagnosticTotal(row.head),
			)}
			{@const panics = row.head.panics - row.base.panics}
			<article class="scan-row">
				<div class="repo-cell">
					<span class="status-dot" style:background={color(kind)}></span>
					<div>
						<a href={`https://github.com/${row.repositorySlug}`}
							>{row.repositorySlug}</a
						>
						<span class="status-label" style:color={color(kind)}>
							{kind === "worse" ? "needs review" : kind}
						</span>
					</div>
				</div>
				<div class="metric-cell">
					<span class="mobile-label">Check time</span>
					<strong
						>{row.base.checkMs === null ? "—" : formatMs(row.base.checkMs)}
						→
						{row.head.checkMs === null ? "—" : formatMs(row.head.checkMs)}</strong
					>
					<span style:color={deltaColor(check)}>
						{check === null ? "no delta" : formatPct(check)}
					</span>
				</div>
				<div class="metric-cell">
					<span class="mobile-label">Scanner time</span>
					<strong
						>{row.base.scannerMs === null ? "—" : formatMs(row.base.scannerMs)}
						→
						{row.head.scannerMs === null ? "—" : formatMs(row.head.scannerMs)}</strong
					>
					<span style:color={deltaColor(scanner)}>
						{scanner === null ? "no delta" : formatPct(scanner)}
					</span>
				</div>
				<div class="metric-cell">
					<span class="mobile-label">Diagnostics</span>
					<strong
						>{formatCount(diagnosticTotal(row.base))}
						→ {formatCount(diagnosticTotal(row.head))}</strong
					>
					<span style:color={deltaColor(diagnosticsRate)}>
						{signedCount(diagnostics)}
					</span>
				</div>
				<div class="metric-cell">
					<span class="mobile-label">Panics</span>
					<strong>{row.base.panics} → {row.head.panics}</strong>
					<span style:color={deltaColor(panics, 1)}>
						{signedCount(panics)}
					</span>
				</div>
			</article>
		{/each}
	</div>
</section>

<style>
.variant-heading {
	display: flex;
	justify-content: flex-end;
	margin: 1rem 0;
}

.summary-strip {
	display: flex;
	gap: 1.5rem;
}

.summary-strip div {
	display: flex;
	align-items: baseline;
	gap: 0.4rem;
	white-space: nowrap;
}

.summary-strip strong {
	font-size: 1.25rem;
	font-variant-numeric: tabular-nums;
}

.summary-strip span {
	color: var(--muted);
	font-size: 0.8rem;
}

.scan-list {
	overflow: hidden;
	border: 1px solid var(--hair);
	background: var(--surface);
}

.scan-labels,
.scan-row {
	display: grid;
	grid-template-columns: minmax(12rem, 1.35fr) repeat(3, minmax(9rem, 1fr)) minmax(
			5rem,
			0.55fr
		);
	gap: 1rem;
	align-items: center;
}

.scan-labels {
	padding: 0.8rem 1rem;
	color: var(--muted);
	font-size: 0.72rem;
	font-weight: 650;
	letter-spacing: 0.04em;
	text-transform: uppercase;
}

.scan-row {
	min-width: 0;
	padding: 1rem;
	border-top: 1px solid var(--hair);
}

.repo-cell {
	display: flex;
	min-width: 0;
	align-items: flex-start;
	gap: 0.7rem;
}

.repo-cell a {
	display: block;
	overflow-wrap: anywhere;
	font-size: 0.95rem;
	font-weight: 600;
}

.status-dot {
	width: 0.55rem;
	height: 0.55rem;
	flex: 0 0 auto;
	margin-top: 0.35rem;
	border-radius: 9999px;
}

.status-label {
	display: block;
	margin-top: 0.2rem;
	font-size: 0.76rem;
}

.metric-cell {
	min-width: 0;
	font-variant-numeric: tabular-nums;
}

.metric-cell strong,
.metric-cell > span:last-child {
	display: block;
}

.metric-cell strong {
	font-size: 0.86rem;
	font-weight: 600;
	white-space: nowrap;
}

.metric-cell > span:last-child {
	margin-top: 0.2rem;
	font-size: 0.76rem;
}

.mobile-label {
	display: none;
}

@media (max-width: 850px) {
	.scan-labels {
		display: none;
	}

	.scan-row {
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem 1.5rem;
	}

	.repo-cell {
		grid-column: 1 / -1;
	}

	.mobile-label {
		display: block;
		margin-bottom: 0.25rem;
		color: var(--muted);
		font-size: 0.7rem;
		font-weight: 650;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
}

@media (max-width: 560px) {
	.scan-row {
		grid-template-columns: 1fr;
	}

	.repo-cell {
		grid-column: auto;
	}
}
</style>
