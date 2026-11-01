<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

// Stickie, the retroo mascot: the app's sticky note with a face. Same drawing as public/favicon.svg.
// `mood` 1-5 swaps in the Team mood faces, from miserable (1) to thrilled (5), each with its own note color.
// `follow` makes the eyes track the pointer and focused fields; bump `hop` to make Stickie jump once.
const props = withDefaults(
	defineProps<{
		size?: number;
		face?: "happy" | "confused" | "worried" | "startled";
		mood?: number | null;
		// fill, fold, outline: paints Stickie in any color (the picker shows give each teammate their own).
		paint?: readonly [string, string, string];
		follow?: boolean;
		hop?: number;
	}>(),
	{ size: 40, face: "happy", mood: null, follow: false, hop: 0 },
);

const INK = "#26215C";
const COLORS: Record<number, [string, string, string]> = {
	// fill, fold, outline
	1: ["#F5C4B3", "#F0997B", "#993C1D"],
	2: ["#FAC775", "#EF9F27", "#854F0B"],
	3: ["#D3D1C7", "#B4B2A9", "#5F5E5A"],
	4: ["#9FE1CB", "#5DCAA5", "#0F6E56"],
	5: ["#CECBF6", "#AFA9EC", "#534AB7"],
};
const colors = computed(() => props.paint ?? COLORS[props.mood ?? 5]);
const MOUTHS: Record<string, string> = {
	1: "M44 80Q61 64 78 80",
	2: "M47 76Q61 68 75 76",
	3: "M47 73H75",
	4: "M46 71Q61 84 76 71",
	5: "M42 66Q61 92 80 66Z",
	happy: "M46 71Q61 84 76 71",
	confused: "M46 78Q54 70 61 76T76 74",
	worried: "M48 77Q54 72 61 77T74 77",
};
const expression = computed(() => props.mood ?? props.face);
const mouth = computed(() => MOUTHS[expression.value]);

// Eyes drift up to 4 units toward the pointer or the focused input.
const root = ref<SVGSVGElement>();
const look = ref({ x: 0, y: 0 });
function lookAt(x: number, y: number) {
	const r = root.value?.getBoundingClientRect();
	if (!r) return;
	const dx = x - (r.left + r.width / 2);
	const dy = y - (r.top + r.height / 2);
	const d = Math.hypot(dx, dy) || 1;
	const k = Math.min(1, d / 200);
	look.value = { x: (dx / d) * 4 * k, y: (dy / d) * 4 * k };
}
const onPointer = (e: PointerEvent) => lookAt(e.clientX, e.clientY);
const onFocus = (e: FocusEvent) => {
	const r = (e.target as HTMLElement).getBoundingClientRect?.();
	if (r) lookAt(r.left + Math.min(r.width, 120), r.top + r.height / 2);
};
onMounted(() => {
	if (!props.follow) return;
	addEventListener("pointermove", onPointer);
	addEventListener("focusin", onFocus);
});
onUnmounted(() => {
	removeEventListener("pointermove", onPointer);
	removeEventListener("focusin", onFocus);
});

const hopping = ref(false);
watch(
	() => props.hop,
	() => {
		hopping.value = false;
		requestAnimationFrame(() => (hopping.value = true));
	},
);
</script>

<template>
	<svg ref="root" class="stickie" :class="{ hopping }" :width="size" :height="size" viewBox="0 0 120 120" aria-hidden="true" @animationend="hopping = false">
		<g transform="rotate(-6 60 60)">
			<path d="M14 10H104a6 6 0 0 1 6 6V84L84 110H20a6 6 0 0 1-6-6Z" :fill="colors[0]" :stroke="colors[2]" stroke-width="5" stroke-linejoin="round" class="paper" />
			<path d="M110 84H90a6 6 0 0 0-6 6V110Z" :fill="colors[1]" :stroke="colors[2]" stroke-width="5" stroke-linejoin="round" class="paper" />
			<g :style="{ transform: `translate(${look.x}px, ${look.y}px)` }" class="gaze">
				<!-- Miserable gets squeezed-shut eyes and thrilled gets happy arcs; everything else blinks. -->
				<g v-if="expression === 1" :stroke="INK" stroke-width="5" stroke-linecap="round" fill="none">
					<path d="M36 44L50 52L36 58" />
					<path d="M86 44L72 52L86 58" />
				</g>
				<g v-else-if="expression === 5" :stroke="INK" stroke-width="5" stroke-linecap="round" fill="none">
					<path d="M36 53Q44 42 52 53" />
					<path d="M70 53Q78 42 86 53" />
				</g>
				<g v-else class="eyes">
					<circle cx="44" cy="50" :r="expression === 'startled' ? 9 : 7" :fill="INK" />
					<circle cx="78" cy="50" :r="expression === 'startled' ? 9 : 7" :fill="INK" />
				</g>
			</g>
			<g v-if="expression === 'worried'" :stroke="INK" stroke-width="4" stroke-linecap="round">
				<path d="M36 36L50 40" />
				<path d="M86 36L72 40" />
			</g>
			<circle v-if="expression === 'startled'" cx="61" cy="77" r="7" fill="none" :stroke="INK" stroke-width="5" />
			<path v-else :d="mouth" :fill="expression === 5 ? INK : 'none'" :stroke="INK" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />
		</g>
	</svg>
</template>

<style scoped>
.stickie {
	flex-shrink: 0;
	overflow: visible;
}
.paper {
	transition: fill 0.6s, stroke 0.6s;
}
.gaze {
	transition: transform 0.25s ease-out;
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
.hopping {
	animation: hop 0.6s cubic-bezier(0.3, 1.6, 0.5, 1);
}
@keyframes hop {
	35% {
		translate: 0 -30%;
		rotate: -8deg;
	}
	70% {
		translate: 0 0;
		rotate: 4deg;
	}
}
</style>
