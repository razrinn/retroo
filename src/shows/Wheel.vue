<script setup lang="ts">
import { computed, watch } from "vue";
import { sounds } from "../sound";
import { type ShowProps, colorOf, rng, useClock } from "../shows";

// Spin wheel: six turns, slowing right down, stopping somewhere inside the winner's slice under the pointer.
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

const R = 150;
const point = (deg: number, r = R) => [320 + r * Math.sin((deg * Math.PI) / 180), 185 - r * Math.cos((deg * Math.PI) / 180)];
const slices = props.names.map((name, i) => {
	const [x1, y1] = point(i * slice);
	const [x2, y2] = point((i + 1) * slice);
	return { name, d: `M320 185L${x1} ${y1}A${R} ${R} 0 ${slice > 180 ? 1 : 0} 1 ${x2} ${y2}Z`, mid: (i + 0.5) * slice, color: colorOf(i) };
});
const fontSize = Math.max(10, Math.min(18, 160 / n));
</script>

<template>
	<svg viewBox="0 0 640 360" class="show">
		<g :style="{ transform: `rotate(${angle}deg)`, transformOrigin: '320px 185px' }">
			<path v-for="s in slices" :key="s.name" :d="s.d" :fill="s.color" stroke="#fffdf8" stroke-width="2" />
			<text
				v-for="s in slices"
				:key="`t${s.name}`"
				x="320"
				:y="185 - R + 16"
				:transform="`rotate(${s.mid} 320 185) rotate(90 320 ${185 - R + 16})`"
				:font-size="fontSize"
				text-anchor="start"
				dominant-baseline="middle"
				fill="#fffdf8"
				font-weight="800"
			>
				{{ s.name.length > 12 ? `${s.name.slice(0, 11)}…` : s.name }}
			</text>
		</g>
		<circle cx="320" cy="185" :r="R" fill="none" stroke="#26215c" stroke-width="4" />
		<circle cx="320" cy="185" r="16" fill="#fffdf8" stroke="#26215c" stroke-width="4" />
		<path d="M306 22h28l-14 26z" fill="#26215c" />
	</svg>
</template>
