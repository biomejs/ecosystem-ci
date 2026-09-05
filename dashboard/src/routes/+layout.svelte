<script lang="ts">
import "../app.css";
import "@fontsource/geist/latin-400.css";
import "@fontsource/geist/latin-500.css";
import "@fontsource/geist/latin-600.css";
import "@fontsource/geist/latin-700.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import { onMount } from "svelte";
import { page } from "$app/state";
import { parseTheme, resolveTheme, type ThemePreference } from "$lib/theme";

let { children } = $props();
let preference = $state<ThemePreference>("system");

function applyTheme() {
	const theme = resolveTheme(
		preference,
		matchMedia("(prefers-color-scheme: dark)").matches,
	);
	document.documentElement.dataset.theme = theme;
	document.documentElement.dataset.themePreference = preference;
	for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
		meta.setAttribute("content", theme === "dark" ? "#17181c" : "#ffffff");
	}
}

function changeTheme(event: Event) {
	preference = parseTheme((event.currentTarget as HTMLSelectElement).value);
	applyTheme();
	try {
		if (preference === "system") localStorage.removeItem("ecosystem-ci-theme");
		else localStorage.setItem("ecosystem-ci-theme", preference);
	} catch {
		// Theme selection still works for this page without persistence.
	}
}

onMount(() => {
	preference = parseTheme(document.documentElement.dataset.themePreference);
	applyTheme();
	const media = matchMedia("(prefers-color-scheme: dark)");
	media.addEventListener("change", applyTheme);
	return () => media.removeEventListener("change", applyTheme);
});
</script>

<svelte:head>
	<title>Biome Ecosystem CI</title>
	<meta name="description" content="Trends across Biome ecosystem CI runs.">
</svelte:head>

<a class="skip-link" href="#main-content">Skip to content</a>
<header class="site-header">
	<div class="site-header-inner">
		<a class="brand" href="/" aria-label="Biome Ecosystem CI home">
			<img src="/favicon.svg" alt="" width="40" height="40">
			<span
				><strong>Biome</strong
				><span class="brand-product">Ecosystem CI</span></span
			>
		</a>
		<nav aria-label="Main navigation">
			<a href="/" aria-current={page.url.pathname === "/" ? "page" : undefined}
				>Trends</a
			>
			<a
				href="/compare"
				aria-current={page.url.pathname === "/compare" ? "page" : undefined}
				>Compare</a
			>
		</nav>
		<label class="theme-picker">
			<span>Theme</span>
			<select value={preference} onchange={changeTheme}>
				<option value="system">System</option>
				<option value="light">Light</option>
				<option value="dark">Dark</option>
			</select>
		</label>
	</div>
</header>
{@render children()}
