<script setup lang="ts">
import { computed } from "vue";

// Stickie, the retroo mascot: the app's sticky note with a face. Same drawing as public/favicon.svg.
// `mood` 1-5 swaps in the Team mood faces, from miserable (1) to thrilled (5), each with its own note color.
const props = withDefaults(defineProps<{ size?: number; face?: "happy" | "confused"; mood?: number }>(), { size: 40, face: "happy" });

const INK = "#26215C";
const COLORS: Record<number, [string, string, string]> = {
	// fill, fold, outline
	1: ["#F5C4B3", "#F0997B", "#993C1D"],
	2: ["#FAC775", "#EF9F27", "#854F0B"],
	3: ["#D3D1C7", "#B4B2A9", "#5F5E5A"],
	4: ["#9FE1CB", "#5DCAA5", "#0F6E56"],
	5: ["#CECBF6", "#AFA9EC", "#534AB7"],
};
const colors = computed(() => COLORS[props.mood ?? 5]);
const MOUTHS: Record<string, string> = {
	1: "M44 80Q61 64 78 80",
	2: "M47 76Q61 68 75 76",
	3: "M47 73H75",
	4: "M46 71Q61 84 76 71",
	5: "M42 66Q61 92 80 66Z",
	happy: "M46 71Q61 84 76 71",
	confused: "M46 78Q54 70 61 76T76 74",
};
const mouth = computed(() => MOUTHS[props.mood ?? props.face]);
</script>

<template>
	<svg class="stickie" :width="size" :height="size" viewBox="0 0 120 120" aria-hidden="true">
		<g transform="rotate(-6 60 60)">
			<path d="M14 10H104a6 6 0 0 1 6 6V84L84 110H20a6 6 0 0 1-6-6Z" :fill="colors[0]" :stroke="colors[2]" stroke-width="5" stroke-linejoin="round" />
			<path d="M110 84H90a6 6 0 0 0-6 6V110Z" :fill="colors[1]" :stroke="colors[2]" stroke-width="5" stroke-linejoin="round" />
			<!-- Miserable gets squeezed-shut eyes and thrilled gets happy arcs; everything else blinks. -->
			<g v-if="mood === 1" :stroke="INK" stroke-width="5" stroke-linecap="round" fill="none">
				<path d="M36 44L50 52L36 58" />
				<path d="M86 44L72 52L86 58" />
			</g>
			<g v-else-if="mood === 5" :stroke="INK" stroke-width="5" stroke-linecap="round" fill="none">
				<path d="M36 53Q44 42 52 53" />
				<path d="M70 53Q78 42 86 53" />
			</g>
			<g v-else class="eyes">
				<circle cx="44" cy="50" r="7" :fill="INK" />
				<circle cx="78" cy="50" r="7" :fill="INK" />
			</g>
			<path :d="mouth" :fill="mood === 5 ? INK : 'none'" :stroke="INK" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
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
