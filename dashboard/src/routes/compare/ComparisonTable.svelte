<script lang="ts">
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
	<div class="min-w-0 tabular-nums">
		<span class="eyebrow mb-1 block md:hidden">{label}</span>
		<strong class="block whitespace-nowrap font-semibold text-sm"
			>{formatCount(base)}
			→ {formatCount(head)}</strong
		>
		<span class="mt-0.5 block text-xs" style:color={color}>
			{signedCount(delta)}
		</span>
	</div>
{/snippet}

<section aria-label="Repository comparison">
	<header class="my-4 flex flex-wrap items-center justify-between gap-3">
		<TimingViewSwitch current={timingView} />
		<div class="flex gap-6">
			<div class="flex items-baseline gap-1.5 whitespace-nowrap">
				<strong class="text-worse text-xl tabular-nums">{reviewCount}</strong>
				<span class="text-muted text-xs">review</span>
			</div>
			<div class="flex items-baseline gap-1.5 whitespace-nowrap">
				<strong class="text-better text-xl tabular-nums"
					>{improvedCount}</strong
				>
				<span class="text-muted text-xs">improved</span>
			</div>
			<div class="flex items-baseline gap-1.5 whitespace-nowrap">
				<strong class="text-xl tabular-nums">{quietCount}</strong>
				<span class="text-muted text-xs">quiet</span>
			</div>
		</div>
	</header>

	<div class="overflow-hidden border border-hair bg-surface">
		<div
			class="eyebrow hidden grid-cols-scan items-center gap-4 px-4 py-3 md:grid"
			aria-hidden="true"
		>
			<span>Repository</span>
			<span>Check time</span>
			<span>Scanner time</span>
			<span>Diagnostics</span>
			<span>Panics</span>
		</div>
		{#each rows as row (row.repositorySlug)}
			{const kind = $derived(reviewKind(row))}
			{const diagnostics = $derived(diagnosticDelta(row))}
			{const diagnosticsRate = $derived(
				relativeDelta(diagnosticTotal(row.base), diagnosticTotal(row.head)),
			)}
			{const panics = $derived(row.head.panics - row.base.panics)}
			<article
				class="grid min-w-0 grid-cols-1 items-center gap-4 border-hair border-t p-4 sm:grid-cols-2 sm:gap-x-6 md:grid-cols-scan md:gap-x-4"
			>
				<div class="flex min-w-0 items-start gap-3 sm:max-md:col-span-full">
					<span
						class={`mt-1.5 size-2 shrink-0 rounded-full ${dotTone[kind]}`}
					></span>
					<div>
						<a
							class="block wrap-anywhere font-semibold text-sm"
							href={`https://github.com/${row.repositorySlug}`}
							>{row.repositorySlug}</a
						>
						<span class={`mt-0.5 block text-xs ${textTone[kind]}`}>
							{kind === "worse" ? "needs review" : kind}
						</span>
					</div>
				</div>
				<TimingCell
					label="Check time"
					base={row.base.check}
					head={row.head.check}
					hue="var(--color-blue)"
					view={timingView}
				/>
				<TimingCell
					label="Scanner time"
					base={row.base.scanner}
					head={row.head.scanner}
					hue="var(--color-violet)"
					view={timingView}
				/>
				{@render countCell(
					"Diagnostics",
					diagnosticTotal(row.base),
					diagnosticTotal(row.head),
					diagnostics,
					deltaColor(diagnosticsRate),
				)}
				{@render countCell(
					"Panics",
					row.base.panics,
					row.head.panics,
					panics,
					deltaColor(panics, 1),
				)}
			</article>
		{/each}
	</div>
</section>
