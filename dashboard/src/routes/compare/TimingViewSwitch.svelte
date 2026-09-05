<!-- Button group that picks the timing chart; the choice lives in the ?view= query parameter. -->
<script lang="ts">
import { page } from "$app/state";
import { TIMING_VIEWS, type TimingView } from "./timing-view";

let { current }: { current: TimingView } = $props();

function hrefFor(view: TimingView): string {
	const params = new URLSearchParams(page.url.searchParams);
	params.set("view", view);
	return `?${params}`;
}
</script>

<nav class="flex flex-wrap text-sm" aria-label="Timing chart">
	{#each TIMING_VIEWS as view (view.key)}
		<a
			class={`-ml-px inline-flex min-h-11 items-center border border-hair px-3 py-2 no-underline first:ml-0 ${
				view.key === current
					? "bg-hair text-ink"
					: "text-muted hover:text-ink"
			}`}
			href={hrefFor(view.key)}
			title={view.description}
			aria-current={view.key === current ? "page" : undefined}
			data-sveltekit-replacestate
			data-sveltekit-noscroll
			data-sveltekit-keepfocus
			>{view.label}</a
		>
	{/each}
</nav>
