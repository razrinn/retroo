<script setup lang="ts">
// The backdrop every show sits on: the board's warm paper with its dot grid.
</script>

<template>
	<defs>
		<pattern id="show-dots" width="18" height="18" patternUnits="userSpaceOnUse">
			<circle cx="9" cy="9" r="1.2" fill="#e2ddd0" />
		</pattern>
	</defs>
	<rect width="640" height="360" fill="#f6f3ec" />
	<rect width="640" height="360" fill="url(#show-dots)" />
</template>
