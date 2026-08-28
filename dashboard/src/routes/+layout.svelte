<script lang="ts">
import "../app.css";

let { children } = $props();
</script>

<svelte:head>
	<title>Biome Ecosystem CI</title>
	<meta
		name="description"
		content="Browse Biome ecosystem CI runs and repository results."
	>
</svelte:head>

{@render children()}
