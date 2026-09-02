<script lang="ts">
import "../app.css";

let { children } = $props();
</script>

<svelte:head>
	<title>Biome Ecosystem CI</title>
	<meta name="description" content="Trends across Biome ecosystem CI runs.">
</svelte:head>

{@render children()}
