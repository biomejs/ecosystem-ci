<script lang="ts">
import StickyHorizontalScroll from "./StickyHorizontalScroll.svelte";
</script>

<div style="height: 200px"></div>
<div data-testid="container" style="width: 600px">
	<StickyHorizontalScroll label="Wide table">
		<div data-testid="content" style="width: 1200px; height: 1800px">
			Wide table content
		</div>
	</StickyHorizontalScroll>
</div>
<div style="height: 1000px"></div>
