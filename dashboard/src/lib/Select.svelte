<script lang="ts">
import type { Snippet } from "svelte";
import type { HTMLSelectAttributes } from "svelte/elements";

let {
	children,
	class: className,
	value = $bindable(),
	...attributes
}: HTMLSelectAttributes & { children: Snippet } = $props();
</script>

<span class={["relative inline-grid min-w-0 max-w-full", className]}>
	<select
		{...attributes}
		bind:value
		class="min-h-9 w-full min-w-0 appearance-none rounded-sm border border-base bg-page py-1 pr-10 pl-3 text-base text-ink forced-colors:appearance-auto"
	>
		{@render children()}
	</select>
	<svg
		class="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink forced-colors:hidden"
		viewBox="0 0 16 16"
		aria-hidden="true"
	>
		<path
			d="m4 6 4 4 4-4"
			fill="none"
			stroke="currentColor"
			stroke-width="1.5"
			stroke-linecap="round"
			stroke-linejoin="round"
		/>
	</svg>
</span>
