<script setup lang="ts">
// Small line icons for header buttons; they inherit the text color. Decorative: the button carries the label.
defineProps<{ name: "timer" | "present" | "summary" | "lock" | "unlock" | "sound" | "mute" }>();
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
		<template v-else>
			<path d="M4 9.5v5h3.5l4.5 3.5v-12L7.5 9.5zM16 9.5l5 5M21 9.5l-5 5" />
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
