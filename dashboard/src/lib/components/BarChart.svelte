<script lang="ts">
interface Entry {
	label: string;
	value: number;
}

let {
	entries,
	formatValue,
	ariaLabel,
}: {
	entries: Entry[];
	formatValue: (value: number) => string;
	ariaLabel: string;
} = $props();

const maximum = $derived(Math.max(1, ...entries.map((entry) => entry.value)));
</script>

<div class="grid gap-3" role="img" aria-label={ariaLabel}>
	{#each entries as entry}
		<div
			class="grid grid-cols-[minmax(9rem,14rem)_1fr_4.5rem] items-center gap-3"
		>
			<div
				class="truncate font-mono text-xs text-slate-700"
				title={entry.label}
			>
				{entry.label}
			</div>
			<div class="h-5 overflow-hidden bg-slate-100">
				<div
					class="h-full min-w-px bg-blue-600"
					style:width={`${(entry.value / maximum) * 100}%`}
				></div>
			</div>
			<div class="text-right font-mono text-xs text-slate-700">
				{formatValue(entry.value)}
			</div>
		</div>
	{/each}
</div>
