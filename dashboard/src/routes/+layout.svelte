<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<title>Biome Ecosystem CI</title>
	<meta
		name="description"
		content="Explore Biome ecosystem CI runs, regressions, and project health."
	/>
</svelte:head>

{@render children()}
