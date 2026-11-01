<script setup lang="ts">
import { computed, watch } from "vue";
import Mascot from "../Mascot.vue";
import { sounds } from "../sound";
import { INK, PAPER, type ShowProps, colorOf, inkOf, rng, short, useClock } from "../shows";
import Paper from "./Paper.vue";

// Spin wheel: six turns, slowing right down, stopping somewhere inside the winner's slice under the pointer.
// Stickie rides the hub and looks surprised while it spins.
const props = defineProps<ShowProps>();
const emit = defineEmits<{ done: [] }>();
const SPIN = 6;
const now = useClock(SPIN + 0.6, () => emit("done"));

const rand = rng(props.seed);
const n = props.names.length;
const slice = 360 / n;
const w = props.names.indexOf(props.winner);
const target = 360 * 6 - ((w + 0.5) * slice + (rand() - 0.5) * slice * 0.7);
const angle = computed(() => target * (1 - (1 - Math.min(1, now.value / SPIN)) ** 4));
watch(
	() => Math.floor(angle.value / slice),
	() => sounds.tick(),
);

const CX = 320;
const CY = 186;
const R = 148;
const point = (deg: number, r = R) => [CX + r * Math.sin((deg * Math.PI) / 180), CY - r * Math.cos((deg * Math.PI) / 180)];
const slices = props.names.map((name, i) => {
	const [x1, y1] = point(i * slice);
	const [x2, y2] = point((i + 1) * slice);
	return { name, i, d: `M${CX} ${CY}L${x1} ${y1}A${R} ${R} 0 ${slice > 180 ? 1 : 0} 1 ${x2} ${y2}Z`, mid: (i + 0.5) * slice };
});
const fontSize = Math.max(11, Math.min(18, 150 / n));
</script>

<template>
	<svg viewBox="0 0 640 360" class="show">
		<Paper />
		<ellipse :cx="CX + 6" :cy="CY + 10" :rx="R + 4" :ry="R + 4" fill="#26215c" opacity="0.08" />
		<g :style="{ transform: `rotate(${angle}deg)`, transformOrigin: `${CX}px ${CY}px` }">
			<path v-for="s in slices" :key="s.name" :d="s.d" :fill="colorOf(s.i)" :stroke="INK" stroke-width="3" stroke-linejoin="round" />
			<text
				v-for="s in slices"
				:key="`t${s.name}`"
				:x="CX"
				:y="CY - R + 18"
				:transform="`rotate(${s.mid} ${CX} ${CY}) rotate(90 ${CX} ${CY - R + 18})`"
				:font-size="fontSize"
				dominant-baseline="middle"
				:fill="inkOf(s.i)"
				font-weight="800"
			>
				{{ short(s.name, 12) }}
			</text>
		</g>
		<circle :cx="CX" :cy="CY" :r="R" fill="none" :stroke="INK" stroke-width="5" />
		<circle :cx="CX" :cy="CY" r="34" :fill="PAPER" :stroke="INK" stroke-width="3.5" />
		<g :transform="`translate(${CX - 26} ${CY - 26})`"><Mascot :size="52" :face="now < SPIN ? 'startled' : 'happy'" /></g>
		<!-- Pointer: an ink drop at the top. -->
		<path :d="`M${CX} ${CY - R + 14}C${CX - 6} ${CY - R - 2} ${CX - 16} ${CY - R - 14} ${CX - 14} ${CY - R - 24}a14 14 0 0 1 28 0C${CX + 16} ${CY - R - 14} ${CX + 6} ${CY - R - 2} ${CX} ${CY - R + 14}z`" :fill="INK" />
		<circle :cx="CX" :cy="CY - R - 24" r="5" :fill="PAPER" />
	</svg>
</template>
