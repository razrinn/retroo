<script setup lang="ts">
import { computed, watch } from "vue";
import { sounds } from "../sound";
import { type ShowProps, colorOf, rng, useClock } from "../shows";

// Plinko: a ball drops through rows of pegs, bouncing left and right, teeters on the last peg between
// two slots, then falls into the winner's.
const props = defineProps<ShowProps>();
const emit = defineEmits<{ done: [] }>();
const rand = rng(props.seed);
const n = props.names.length;
const w = props.names.indexOf(props.winner);

const LEFT = 30;
const WIDTH = 580;
const slotW = WIDTH / n;
const ROWS = 9;
const TOP = 40;
const GAP = 26;
const pegs = Array.from({ length: ROWS }, (_, r) => {
	const count = 13 + (r % 2);
	const step = WIDTH / 13;
	return Array.from({ length: count }, (_, k) => ({ x: LEFT + (r % 2 ? 0 : step / 2) + k * step, y: TOP + 30 + r * GAP }));
});

// The path: one point per row, drifting from the top centre to the winner's slot with a seeded jitter;
// the last stop sits right on the edge next to a neighbour slot, for the wobble.
const target = LEFT + (w + 0.5) * slotW;
const edgeSide = w === 0 ? 1 : w === n - 1 ? -1 : rand() < 0.5 ? -1 : 1;
const edge = target + (edgeSide * slotW) / 2;
const path = Array.from({ length: ROWS }, (_, r) => {
	const k = (r + 1) / ROWS;
	const x = 320 + (edge - 320) * k + (rand() - 0.5) * 70 * (1 - k);
	return { x: Math.min(LEFT + WIDTH - 8, Math.max(LEFT + 8, x)), y: TOP + 30 + r * GAP - 9 };
});
const HOP = 0.42;
const WOBBLE = 1.1;
const START = 0.5;
const landAt = START + ROWS * HOP + WOBBLE + 0.5;
const now = useClock(landAt + 1.4, () => emit("done"));
const FLOOR = TOP + 30 + ROWS * GAP + 30;

const ball = computed(() => {
	const t = now.value - START;
	if (t < 0) return { x: 320, y: TOP - 10 };
	const seg = Math.floor(t / HOP);
	if (seg < ROWS) {
		const a = seg === 0 ? { x: 320, y: TOP - 10 } : path[seg - 1];
		const b = path[seg];
		const f = (t - seg * HOP) / HOP;
		// A small hop up off each peg, then down to the next.
		return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f - Math.sin(f * Math.PI) * 14 };
	}
	const after = t - ROWS * HOP;
	const last = path[ROWS - 1];
	if (after < WOBBLE) return { x: last.x + Math.sin(after * 18) * 5 * (1 - after / WOBBLE) - edgeSide * after * 4, y: last.y };
	const f = Math.min(1, (after - WOBBLE) / 0.5);
	return { x: last.x + (target - last.x) * f, y: last.y + (FLOOR - 26 - last.y) * f * f };
});
watch(
	() => Math.floor((now.value - START) / HOP),
	(k) => k >= 0 && k <= ROWS && sounds.tick(),
);
const landed = computed(() => now.value >= landAt);
watch(landed, (v) => v && sounds.pop());
</script>

<template>
	<svg viewBox="0 0 640 360" class="show">
		<rect width="640" height="360" fill="#e8e5ff" />
		<g v-for="(row, r) in pegs" :key="`r${r}`">
			<circle v-for="(p, k) in row" :key="k" :cx="p.x" :cy="p.y" r="4" fill="#534ab7" />
		</g>
		<!-- Slots with the names, standing up. -->
		<g v-for="(name, i) in names" :key="name">
			<rect
				:x="LEFT + i * slotW + 1"
				:y="FLOOR - 40"
				:width="slotW - 2"
				:height="40 + 360 - FLOOR"
				:fill="landed && i === names.indexOf(winner) ? '#fac775' : colorOf(i)"
				:opacity="landed && i !== names.indexOf(winner) ? 0.35 : 0.9"
			/>
			<text
				:x="LEFT + (i + 0.5) * slotW"
				:y="FLOOR + 10"
				:font-size="Math.max(10, Math.min(15, slotW * 0.45))"
				font-weight="800"
				fill="#fffdf8"
				dominant-baseline="central"
				:transform="slotW < 70 ? `rotate(-90 ${LEFT + (i + 0.5) * slotW} ${FLOOR + 10})` : ''"
				:text-anchor="slotW < 70 ? 'start' : 'middle'"
			>
				{{ name.length > 10 ? `${name.slice(0, 9)}…` : name }}
			</text>
		</g>
		<path :d="`M${LEFT} ${FLOOR - 40}V360M${LEFT + WIDTH} ${FLOOR - 40}V360`" stroke="#534ab7" stroke-width="3" />
		<circle :cx="ball.x" :cy="ball.y" r="9" fill="#e24b4a" stroke="#993c1d" stroke-width="2.5" />
		<circle :cx="ball.x - 3" :cy="ball.y - 3" r="2.5" fill="#fffdf8" opacity="0.7" />
	</svg>
</template>
