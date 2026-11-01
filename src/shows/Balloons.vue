<script setup lang="ts">
import { computed, watch } from "vue";
import { sounds } from "../sound";
import { type ShowProps, colorOf, rng, shuffle, useClock } from "../shows";

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
const r = Math.min(54, 230 / cols, 120 / rows);
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
		<rect width="640" height="360" fill="#e6f5fc" />
		<g v-for="b in view" :key="b.name">
			<g v-if="!b.popped" :transform="`translate(${b.x} ${b.y}) scale(${b.s}) translate(${-b.x} ${-b.y})`">
				<path :d="`M${b.x} ${b.y + r * 1.15}q-6 18 2 34`" fill="none" stroke="#888780" stroke-width="1.2" />
				<ellipse :cx="b.x" :cy="b.y" :rx="r * 0.9" :ry="r * 1.1" :fill="colorOf(b.i)" :stroke="b.crowned ? '#ef9f27' : 'none'" stroke-width="4" />
				<path :d="`M${b.x - 4} ${b.y + r * 1.1 + 4}l4-5l4 5z`" :fill="colorOf(b.i)" />
				<ellipse :cx="b.x - r * 0.35" :cy="b.y - r * 0.45" :rx="r * 0.15" :ry="r * 0.25" fill="#fffdf8" opacity="0.5" />
				<text :x="b.x" :y="b.y" text-anchor="middle" dominant-baseline="central" :font-size="Math.min(15, r * 0.5)" font-weight="800" fill="#fffdf8">
					{{ b.name.length > 9 ? `${b.name.slice(0, 8)}…` : b.name }}
				</text>
				<text v-if="b.crowned" :x="b.x" :y="b.y - r * 1.3" text-anchor="middle" font-size="28" class="crown">👑</text>
			</g>
			<!-- Pop: a word and a few shreds, gone in half a second. -->
			<g v-else-if="b.burst < 0.5" :opacity="1 - b.burst * 2">
				<text :x="b.x" :y="b.y" text-anchor="middle" dominant-baseline="central" :font-size="18 + b.burst * 40" font-weight="900" fill="#2a2723">POP!</text>
				<path
					v-for="k in 8"
					:key="k"
					:d="`M${b.x + Math.cos(k * 0.785) * (10 + b.burst * 90)} ${b.y + Math.sin(k * 0.785) * (10 + b.burst * 90)}l6 3`"
					:stroke="colorOf(b.i)"
					stroke-width="4"
					stroke-linecap="round"
				/>
			</g>
			<!-- The dart on its way in. -->
			<g v-if="b.dart !== null" :transform="`translate(${-30 + (b.x + 30) * b.dart} ${b.dartFrom + (b.y - b.dartFrom) * b.dart}) rotate(${(Math.atan2(b.y - b.dartFrom, b.x + 30) * 180) / Math.PI})`">
				<path d="M-26 0H0" stroke="#5f5e5a" stroke-width="2.5" />
				<path d="M0 -4L8 0L0 4z" fill="#2a2723" />
				<path d="M-26 0l-6-6M-26 0l-6 6" stroke="#e24b4a" stroke-width="2.5" stroke-linecap="round" />
			</g>
		</g>
	</svg>
</template>

<style scoped>
.crown {
	animation: drop 0.5s cubic-bezier(0.3, 1.6, 0.5, 1);
}
@keyframes drop {
	from {
		translate: 0 -30px;
		opacity: 0;
	}
}
</style>
