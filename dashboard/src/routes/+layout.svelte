<script lang="ts">
import "../app.css";
import "@fontsource/geist/latin-400.css";
import "@fontsource/geist/latin-500.css";
import "@fontsource/geist/latin-600.css";
import "@fontsource/geist/latin-700.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import { onMount } from "svelte";
import { page } from "$app/state";
import Select from "$lib/Select.svelte";
import { parseTheme, type ThemePreference } from "$lib/theme";

let { children } = $props();
let preference = $state<ThemePreference>("system");
let initialized = $state(false);

onMount(() => {
	try {
		preference = parseTheme(localStorage.getItem("ecosystem-ci-theme"));
	} catch {
		// Use the system theme when storage is unavailable.
	}
	initialized = true;
});

$effect(() => {
	if (!initialized) return;
	document.documentElement.dataset.theme = preference;
	try {
		if (preference === "system") localStorage.removeItem("ecosystem-ci-theme");
		else localStorage.setItem("ecosystem-ci-theme", preference);
	} catch {
		// Theme selection still works without persistence.
	}
});
</script>

<svelte:head>
	<title>Biome Ecosystem CI</title>
	<meta name="description" content="Trends across Biome ecosystem CI runs.">
	<meta
		name="theme-color"
		content={preference === "dark" ? "#17181c" : "#ffffff"}
		media="(prefers-color-scheme: light)"
	>
	<meta
		name="theme-color"
		content={preference === "light" ? "#ffffff" : "#17181c"}
		media="(prefers-color-scheme: dark)"
	>
</svelte:head>

<a
	class="fixed top-3 left-4 z-50 -translate-y-full border-2 border-accent bg-page px-4 py-3 opacity-0 focus:translate-y-0 focus:opacity-100"
	href="#main-content"
	>Skip to content</a
>
<header class="border-b border-hair">
	<div
		class="mx-auto flex max-w-dashboard flex-wrap items-center gap-3 px-page-gutter py-4 sm:gap-x-8 sm:gap-y-4"
	>
		<a
			class="inline-flex w-full items-center gap-3 text-ink no-underline sm:w-auto"
			href="/"
			aria-label="Biome Ecosystem CI home"
		>
			<img src="/favicon.svg" alt="" width="40" height="40">
			<span class="flex flex-wrap items-baseline gap-x-3 gap-y-1"
				><strong class="text-brand tracking-tighter">Biome</strong
				><span class="text-ink-2 text-sm">Ecosystem CI</span></span
			>
		</a>
		<nav class="flex min-w-0 flex-wrap sm:gap-2" aria-label="Main navigation">
			{#each [{ href: "/", label: "Trends" }, { href: "/compare", label: "Compare" }] as item (item.href)}
				<a
					class="inline-flex min-h-11 items-center border-b-3 border-transparent p-2 text-ink-2 no-underline aria-current:border-accent aria-current:font-semibold aria-current:text-accent sm:px-3"
					href={item.href}
					aria-current={page.url.pathname === item.href ? "page" : undefined}
					>{item.label}</a
				>
			{/each}
		</nav>
		<label
			for="theme"
			class="ml-auto flex min-w-0 max-w-full flex-wrap items-center gap-1.5 text-sm sm:gap-2.5"
		>
			<span>Theme</span>
			<Select id="theme" bind:value={preference}>
				<option value="system">System</option>
				<option value="light">Light</option>
				<option value="dark">Dark</option>
			</Select>
		</label>
	</div>
</header>
{@render children()}
