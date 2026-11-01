<script setup lang="ts">
// Small line icons for header buttons; they inherit the text color. Decorative: the button carries the label.
defineProps<{
	name: "timer" | "present" | "summary" | "lock" | "unlock" | "sound" | "mute" | "copy" | "download" | "share" | "markdown" | "undo" | "pen" | "marker" | "spray" | "rainbow" | "stamp" | "text" | "close" | "sort" | "stack" | "chevron" | "crown";
}>();
</script>

<template>
	<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
		<template v-if="name === 'timer'">
			<circle cx="12" cy="13.5" r="7.5" />
			<path d="M12 9.5v4l2.5 2M9.5 2.5h5" />
		</template>
		<template v-else-if="name === 'present'">
			<rect x="3" y="4" width="18" height="12.5" rx="2" />
			<path d="M10.5 7.8v5l4-2.5zM8.5 20.5h7M12 16.5v4" />
		</template>
		<template v-else-if="name === 'summary'">
			<path d="M6.5 3h8l4 4v14h-12zM14 3v4.5h4.5M9.5 12h6M9.5 15.5h4" />
		</template>
		<template v-else-if="name === 'lock'">
			<rect x="5" y="11" width="14" height="10" rx="2" />
			<path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" />
		</template>
		<template v-else-if="name === 'unlock'">
			<rect x="5" y="11" width="14" height="10" rx="2" />
			<path d="M8.5 11V8a3.5 3.5 0 0 1 6.8-1.2" />
		</template>
		<template v-else-if="name === 'sound'">
			<path d="M4 9.5v5h3.5l4.5 3.5v-12L7.5 9.5zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
		</template>
		<template v-else-if="name === 'mute'">
			<path d="M4 9.5v5h3.5l4.5 3.5v-12L7.5 9.5zM16 9.5l5 5M21 9.5l-5 5" />
		</template>
		<template v-else-if="name === 'copy'">
			<rect x="8.5" y="8.5" width="12" height="12" rx="2" />
			<path d="M15.5 8.5V5.5a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" />
		</template>
		<template v-else-if="name === 'download'">
			<path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4.5 17.5v2a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5v-2" />
		</template>
		<template v-else-if="name === 'share'">
			<path d="M12 14.5V3.5M7.5 8l4.5-4.5L16.5 8M7 11.5H6a1.5 1.5 0 0 0-1.5 1.5v6.5A1.5 1.5 0 0 0 6 21h12a1.5 1.5 0 0 0 1.5-1.5V13a1.5 1.5 0 0 0-1.5-1.5h-1" />
		</template>
		<template v-else-if="name === 'markdown'">
			<rect x="2.5" y="6" width="19" height="12" rx="2" />
			<path d="M6 15V9l2.5 3L11 9v6M15.5 9v6M13.5 13l2 2 2-2" />
		</template>
		<template v-else-if="name === 'undo'">
			<path d="M9 7.5L4.5 12 9 16.5M4.5 12h10a5 5 0 0 1 0 10h-2" />
		</template>
		<template v-else-if="name === 'sort'">
			<path d="M7 4.5v15M3.5 16l3.5 3.5 3.5-3.5M13 6h7.5M13 11h5.5M13 16h3.5" />
		</template>
		<template v-else-if="name === 'stack'">
			<rect x="7.5" y="3.5" width="13" height="13" rx="2" />
			<path d="M4.5 7.5v11a2 2 0 0 0 2 2h11" />
		</template>
		<template v-else-if="name === 'crown'">
			<path d="M4 18.5h16M4.5 16L3 7.5l5 4L12 5l4 6.5 5-4-1.5 8.5z" />
		</template>
		<template v-else-if="name === 'chevron'">
			<path d="M6.5 9.5l5.5 5.5 5.5-5.5" />
		</template>
		<template v-else-if="name === 'pen'">
			<path d="M14.5 4.5l5 5L10 19l-5.5.5L5 14z" />
		</template>
		<template v-else-if="name === 'marker'">
			<path d="M9.5 14.5L16 4l4 2.5-6.5 10.5zM9.5 14.5l-1 3.5 3.5-.5M4 21h8" />
		</template>
		<template v-else-if="name === 'spray'">
			<rect x="7" y="10" width="8" height="11" rx="1.5" />
			<path d="M9.5 10V7h3v3M17.5 6h.01M20 4h.01M20 8h.01M17.5 9.5h.01M21.5 6.5h.01" />
		</template>
		<template v-else-if="name === 'rainbow'">
			<path d="M3 18a9 9 0 0 1 18 0M6.5 18a5.5 5.5 0 0 1 11 0M10 18a2 2 0 0 1 4 0" />
		</template>
		<template v-else-if="name === 'stamp'">
			<path d="M9.5 3.5h5v5.5l2.5 3H7L9.5 9zM4.5 12h15v4h-15zM7 20h10" />
		</template>
		<template v-else-if="name === 'text'">
			<path d="M5 7V4.5h14V7M12 4.5v15M9 19.5h6" />
		</template>
		<template v-else>
			<path d="M6 6l12 12M18 6L6 18" />
		</template>
	</svg>
</template>

<style scoped>
.icon {
	width: 18px;
	height: 18px;
	flex-shrink: 0;
	fill: none;
	stroke: currentColor;
	stroke-width: 1.9;
	stroke-linecap: round;
	stroke-linejoin: round;
	vertical-align: -3px;
}
</style>
