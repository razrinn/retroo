<script setup lang="ts">
// Stickie, the retro mascot: the app's sticky note with a face. Same drawing as public/favicon.svg.
withDefaults(defineProps<{ size?: number; face?: "happy" | "confused" }>(), { size: 40, face: "happy" });
</script>

<template>
	<svg class="stickie" :width="size" :height="size" viewBox="0 0 120 120" aria-hidden="true">
		<g transform="rotate(-6 60 60)">
			<path d="M14 10H104a6 6 0 0 1 6 6V84L84 110H20a6 6 0 0 1-6-6Z" fill="#CECBF6" stroke="#534AB7" stroke-width="5" stroke-linejoin="round" />
			<path d="M110 84H90a6 6 0 0 0-6 6V110Z" fill="#AFA9EC" stroke="#534AB7" stroke-width="5" stroke-linejoin="round" />
			<g class="eyes">
				<circle cx="44" cy="50" r="7" fill="#26215C" />
				<circle cx="78" cy="50" r="7" fill="#26215C" />
			</g>
			<path v-if="face === 'happy'" d="M46 71Q61 84 76 71" fill="none" stroke="#26215C" stroke-width="5" stroke-linecap="round" />
			<path v-else d="M46 78Q54 70 61 76T76 74" fill="none" stroke="#26215C" stroke-width="5" stroke-linecap="round" />
		</g>
	</svg>
</template>

<style scoped>
.stickie {
	flex-shrink: 0;
	overflow: visible;
}
/* An occasional blink. */
.eyes {
	transform-origin: 60px 50px;
	animation: blink 5s infinite;
}
@keyframes blink {
	0%,
	94%,
	100% {
		transform: scaleY(1);
	}
	97% {
		transform: scaleY(0.1);
	}
}
</style>
