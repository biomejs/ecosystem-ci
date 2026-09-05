<script lang="ts">
import { METRIC_BY_KEY } from "$lib/trends/data";
import { formatCount } from "$lib/trends/format";
import {
	deltaColor,
	diagnosticDelta,
	diagnosticTotal,
	impact,
	relativeDelta,
	reviewKind,
} from "./comparison";
import TimingCell from "./TimingCell.svelte";
import TimingViewSwitch from "./TimingViewSwitch.svelte";
import type { TimingView } from "./timing-view";
import type { RepositoryComparison } from "./types";

let {
	comparisons,
	timingView,
}: { comparisons: RepositoryComparison[]; timingView: TimingView } = $props();
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
const textTone: Record<ReturnType<typeof reviewKind>, string> = {
	worse: "text-worse",
	better: "text-better",
	quiet: "text-muted",
};
const dotTone: Record<ReturnType<typeof reviewKind>, string> = {
	worse: "bg-worse",
	better: "bg-better",
	quiet: "bg-muted",
};
</script>

{#snippet countCell(label: string, base: number, head: number, delta: number, color: string)}
	<div
		class="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 tabular-nums"
	>
		<dt class="text-ink-2">{label}</dt>
		<dd class="flex flex-wrap items-baseline gap-2">
			<strong class="font-semibold text-ink"
				>{formatCount(base)}
				→ {formatCount(head)}</strong
			>
			<span style:color={color}>{signedCount(delta)}</span>
		</dd>
	</div>
{/snippet}

<section aria-label="Repository comparison">
	<header class="my-6 flex flex-wrap items-center justify-between gap-4">
		<div>
			<h2 class="font-semibold">Repository comparison</h2>
			<p class="mt-2 text-ink-2 text-sm">
				Values show baseline → compared run. Only repositories with reports in
				both runs are included.
			</p>
		</div>
		<TimingViewSwitch current={timingView} />
		<div class="flex flex-wrap gap-6">
			<div class="flex items-baseline gap-1.5 whitespace-nowrap">
				<strong class="text-worse text-xl tabular-nums">{reviewCount}</strong
				><span class="text-muted text-sm">review</span>
			</div>
			<div class="flex items-baseline gap-1.5 whitespace-nowrap">
				<strong class="text-better text-xl tabular-nums">{improvedCount}</strong
				><span class="text-muted text-sm">improved</span>
			</div>
			<div class="flex items-baseline gap-1.5 whitespace-nowrap">
				<strong class="text-xl tabular-nums">{quietCount}</strong
				><span class="text-muted text-sm">quiet</span>
			</div>
		</div>
	</header>
	<div class="panel">
		{#each rows as row (row.repositorySlug)}
			{const kind = $derived(reviewKind(row))}
			{const diagnostics = $derived(diagnosticDelta(row))}
			{const diagnosticsRate = $derived(
				relativeDelta(diagnosticTotal(row.base), diagnosticTotal(row.head)),
			)}
			{const panics = $derived(row.head.panics - row.base.panics)}
			<article
				class="grid min-w-0 grid-cols-1 items-start gap-6 border-hair border-t p-4 first:border-t-0 md:grid-cols-2 xl:grid-cols-scan"
			>
				<div class="flex min-w-0 items-start gap-3 md:max-xl:col-span-full">
					<span
						class={`mt-1.5 size-2 shrink-0 rounded-full ${dotTone[kind]}`}
						aria-hidden="true"
					></span>
					<div class="min-w-0">
						<h3>
							<a
								class="block wrap-anywhere font-semibold"
								href={`https://github.com/${row.repositorySlug}`}
								>{row.repositorySlug}</a
							>
						</h3>
						<span class={`mt-1 block text-sm ${textTone[kind]}`}
							>{kind === "worse" ? "needs review" : kind}</span
						>
					</div>
				</div>
				<TimingCell
					label={METRIC_BY_KEY.checkMs.label}
					base={row.base.check}
					head={row.head.check}
					hue={METRIC_BY_KEY.checkMs.hue}
					view={timingView}
				/>
				<TimingCell
					label={METRIC_BY_KEY.scannerMs.label}
					base={row.base.scanner}
					head={row.head.scanner}
					hue={METRIC_BY_KEY.scannerMs.hue}
					view={timingView}
				/>
				<dl class="grid min-w-0 gap-2 text-sm">
					{@render countCell("Diagnostics", diagnosticTotal(row.base), diagnosticTotal(row.head), diagnostics, deltaColor(diagnosticsRate))}
					{@render countCell("Parse", row.base.parseDiagnostics, row.head.parseDiagnostics, row.head.parseDiagnostics - row.base.parseDiagnostics, deltaColor(relativeDelta(row.base.parseDiagnostics, row.head.parseDiagnostics)))}
					{@render countCell("Panics", row.base.panics, row.head.panics, panics, deltaColor(panics, 1))}
				</dl>
			</article>
		{/each}
	</div>
</section>
