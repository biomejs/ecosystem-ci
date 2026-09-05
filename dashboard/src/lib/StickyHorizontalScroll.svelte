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

<div class="scroll-shell" class:has-overflow={overflowing}>
	{#if overflowing}
		<div
			class="scroll-proxy"
			bind:this={proxy}
			aria-hidden="true"
			onscroll={(event) => syncScroll(event.currentTarget, viewport)}
		>
			<div class="scroll-proxy-content" style:width={`${contentWidth}px`}></div>
		</div>
	{/if}
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<section
		class={`scroll-viewport ${className}`}
		bind:this={viewport}
		aria-label={label}
		onscroll={(event) => syncScroll(event.currentTarget, proxy)}
	>
		{@render children()}
	</section>
</div>

<style>
.scroll-shell {
	position: relative;
	min-width: 0;
}

.scroll-shell.has-overflow {
	padding-bottom: 1.25rem;
}

.scroll-proxy {
	position: sticky;
	top: calc(100dvh - 1.25rem);
	z-index: 30;
	height: 1.25rem;
	margin-bottom: -1.25rem;
	overflow-x: auto;
	overflow-y: hidden;
	background: var(--color-surface);
	border: 1px solid var(--color-hair);
	scrollbar-color: var(--color-muted) var(--color-surface);
}

.scroll-proxy-content {
	height: 1px;
}

.scroll-viewport {
	min-width: 0;
	overflow-x: auto;
	scrollbar-width: none;
}

.scroll-viewport::-webkit-scrollbar {
	display: none;
}
</style>
