<script lang="ts">
import type { Snippet } from "svelte";

let {
	children,
	class: className = "",
	label = "Scrollable content",
}: {
	children: Snippet;
	class?: string;
	label?: string;
} = $props();

let viewport = $state<HTMLElement>();
let proxy = $state<HTMLDivElement>();
let contentWidth = $state(0);
let overflowing = $state(false);

function measure(): void {
	if (!viewport) return;
	contentWidth = viewport.scrollWidth;
	overflowing = contentWidth > viewport.clientWidth;
}

function syncScroll(source: HTMLElement, target?: HTMLElement): void {
	if (target && target.scrollLeft !== source.scrollLeft) {
		target.scrollLeft = source.scrollLeft;
	}
}

$effect(() => {
	if (!viewport) return;
	measure();
	const observer = new ResizeObserver(measure);
	observer.observe(viewport);
	if (viewport.firstElementChild) observer.observe(viewport.firstElementChild);
	return () => observer.disconnect();
});
</script>

<div class="relative min-w-0" class:pb-5={overflowing}>
	{#if overflowing}
		<div
			class="sticky top-scroll-proxy z-30 -mb-5 h-5 overflow-x-auto overflow-y-hidden border border-hair bg-surface scrollbar-thumb-muted scrollbar-track-surface"
			bind:this={proxy}
			aria-hidden="true"
			onscroll={(event) => syncScroll(event.currentTarget, viewport)}
		>
			<div class="h-px" style:width={`${contentWidth}px`}></div>
		</div>
	{/if}
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<section
		class={`min-w-0 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden ${className}`}
		bind:this={viewport}
		aria-label={label}
		onscroll={(event) => syncScroll(event.currentTarget, proxy)}
	>
		{@render children()}
	</section>
</div>
