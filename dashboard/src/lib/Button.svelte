<script lang="ts">
import type { Snippet } from "svelte";
import type { HTMLButtonAttributes } from "svelte/elements";

let {
	children,
	class: className,
	primary = false,
	type = "button",
	...attributes
}: HTMLButtonAttributes & { children: Snippet; primary?: boolean } = $props();
</script>

<button
	{...attributes}
	{type}
	class={[
		"min-h-9 max-w-full rounded-sm border px-3 py-1 text-base enabled:cursor-pointer disabled:cursor-not-allowed disabled:border-hair disabled:text-muted",
		primary ? "border-accent bg-accent font-semibold text-page" : "border-base bg-page text-ink",
		className,
	]}
>
	{@render children()}
</button>
