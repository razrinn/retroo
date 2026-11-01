<script setup lang="ts">
import { computed, watch } from "vue";
import { sounds } from "../sound";
import Mascot from "../Mascot.vue";
import { INK, PAPER, type ShowProps, colorOf, inkOf, paintOf, rng, short, shuffle, useClock } from "../shows";
import Paper from "./Paper.vue";

// Balloon pop: everyone's name on a balloon. Darts fly in and pop them one by one, slower and slower;
// the last one floating is the MC.
const props = defineProps<ShowProps>();
const emit = defineEmits<{ done: [] }>();
const rand = rng(props.seed);
const n = props.names.length;
const w = props.names.indexOf(props.winner);

// Spread the balloons over a loose grid with a little jitter.
const cols = Math.ceil(Math.sqrt(n * 1.8));
const rows = Math.ceil(n / cols);
const r = Math.min(54, 230 / cols, 104 / rows);
const balloons = props.names.map((name, i) => ({
	name,
	i,
	// Centre the last, shorter row.
	x: ((i % cols) + 0.5 + (Math.floor(i / cols) === rows - 1 ? (cols - (n - (rows - 1) * cols)) / 2 : 0) + (rand() - 0.5) * 0.4) * (600 / cols) + 20,
	y: (Math.floor(i / cols) + 0.5) * (250 / rows) + 70 + (rand() - 0.5) * 20,
	phase: rand() * 6.28,
	dartFrom: 60 + rand() * 240,
}));
// Pops in a seeded order, gaps growing towards the end for suspense.
const order = shuffle([...props.names.keys()].filter((i) => i !== w), rand);
const popAt = new Map<number, number>();
let at = 1;
order.forEach((i, k) => {
	popAt.set(i, at);
	at += 0.45 + 1.1 * ((k + 1) / order.length) ** 2;
});
const last = at;
const now = useClock(last + 1.6, () => emit("done"));
const FLY = 0.35;

const view = computed(() =>
	balloons.map((b) => {
		const t = popAt.get(b.i);
		const winner = b.i === w;
		// The last balloon left drifts to the middle and grows.
		const f = winner ? Math.min(1, Math.max(0, now.value - last + 0.8) / 0.8) : 0;
		const x = b.x + (320 - b.x) * f;
		const y = b.y + (175 - b.y) * f + Math.sin(now.value * 1.6 + b.phase) * 6;
		const dart = t !== undefined && now.value > t - FLY && now.value < t ? (now.value - (t - FLY)) / FLY : null;
		return { ...b, x, y, s: 1 + f * 0.8, popped: t !== undefined && now.value >= t, burst: t !== undefined ? now.value - t : -1, dart, winner, crowned: winner && now.value > last - 0.6 };
	}),
);
const popped = computed(() => view.value.filter((b) => b.popped).length);
watch(popped, () => sounds.pop());
</script>

<template>
	<svg viewBox="0 0 640 360" class="show">
		<Paper />
		<g v-for="b in view" :key="b.name">
			<g v-if="!b.popped" :transform="`translate(${b.x} ${b.y}) scale(${b.s}) translate(${-b.x} ${-b.y})`">
				<path :d="`M${b.x} ${b.y + r * 1.15}q-6 18 2 34`" fill="none" :stroke="INK" stroke-width="1.5" opacity="0.5" />
				<path :d="`M${b.x - 5} ${b.y + r * 1.1 + 5}l5-6l5 6z`" :fill="paintOf(b.i)[1]" :stroke="INK" stroke-width="2" stroke-linejoin="round" />
				<ellipse :cx="b.x" :cy="b.y" :rx="r * 0.9" :ry="r * 1.1" :fill="colorOf(b.i)" :stroke="INK" :stroke-width="b.crowned ? 4 : 2.5" />
				<ellipse :cx="b.x - r * 0.35" :cy="b.y - r * 0.45" :rx="r * 0.13" :ry="r * 0.22" :fill="PAPER" opacity="0.8" />
				<text :x="b.x" :y="b.y" text-anchor="middle" dominant-baseline="central" :font-size="Math.min(15, r * 0.42)" font-weight="800" :fill="inkOf(b.i)">
					{{ short(b.name, 9) }}
				</text>
				<!-- The last one left: Stickie pops up on top, cheering. -->
				<g v-if="b.crowned" class="cheer" :transform="`translate(${b.x - 18} ${b.y - r * 1.1 - 34})`"><Mascot :size="36" :mood="5" /></g>
			</g>
			<!-- Pop: a paper starburst and a few ink shreds, gone in half a second. -->
			<g v-else-if="b.burst < 0.5" :opacity="1 - b.burst * 2">
				<path
					:d="Array.from({ length: 16 }, (_, k) => `${k ? 'L' : 'M'}${b.x + Math.cos(k * 0.3927) * (k % 2 ? 16 : 30) * (1 + b.burst * 2)} ${b.y + Math.sin(k * 0.3927) * (k % 2 ? 16 : 30) * (1 + b.burst * 2)}`).join('') + 'Z'"
					:fill="PAPER"
					:stroke="INK"
					stroke-width="2.5"
					stroke-linejoin="round"
				/>
				<text :x="b.x" :y="b.y" text-anchor="middle" dominant-baseline="central" :font-size="14 + b.burst * 16" font-weight="900" :fill="INK">POP!</text>
				<path
					v-for="k in 8"
					:key="k"
					:d="`M${b.x + Math.cos(k * 0.785) * (34 + b.burst * 90)} ${b.y + Math.sin(k * 0.785) * (34 + b.burst * 90)}l6 3`"
					:stroke="paintOf(b.i)[2]"
					stroke-width="3.5"
					stroke-linecap="round"
				/>
			</g>
			<!-- The dart on its way in. -->
			<g v-if="b.dart !== null" :transform="`translate(${-30 + (b.x + 30) * b.dart} ${b.dartFrom + (b.y - b.dartFrom) * b.dart}) rotate(${(Math.atan2(b.y - b.dartFrom, b.x + 30) * 180) / Math.PI})`">
				<path d="M-28 0H0" :stroke="INK" stroke-width="3" stroke-linecap="round" />
				<path d="M0 -5L10 0L0 5z" :fill="INK" />
				<path d="M-24 0l-8-7h8zM-24 0l-8 7h8z" fill="#F0997B" :stroke="INK" stroke-width="1.5" stroke-linejoin="round" />
			</g>
		</g>
	</svg>
</template>

<style scoped>
.cheer {
	animation: drop 0.5s cubic-bezier(0.3, 1.6, 0.5, 1);
}
@keyframes drop {
	from {
		translate: 0 -30px;
		opacity: 0;
	}
}
</style>
