<script setup lang="ts">
import { computed, watch } from "vue";
import Mascot from "../Mascot.vue";
import { sounds } from "../sound";
import { INK, PAPER, type ShowProps, inkOf, paintOf, rng, short, span, useClock } from "../shows";
import Paper from "./Paper.vue";

// Duck pond: rubber ducks with names paddle around while Stickie fishes from the bank. The hook hovers,
// drops on the winner's duck, a splash, and up it comes.
const props = defineProps<ShowProps>();
const emit = defineEmits<{ done: [] }>();
const rand = rng(props.seed);
const n = props.names.length;
const w = props.names.indexOf(props.winner);
const now = useClock(6.6, () => emit("done"));
const CATCH = 3.6;

const CX = 300;
const CY = 215;
const RX = 250;
const RY = 112;
const size = n <= 8 ? 1 : n <= 12 ? 0.85 : 0.72;
// Each duck circles the pond on its own ring, speed and direction.
const ducks = props.names.map((name, i) => ({
	name,
	i,
	ring: 0.3 + ((i * 0.618) % 1) * 0.6,
	start: rand() * Math.PI * 2,
	speed: (0.25 + rand() * 0.35) * (rand() < 0.5 ? -1 : 1),
	bob: rand() * 6,
}));
const at = (d: (typeof ducks)[number], t: number) => {
	const a = d.start + d.speed * t;
	return { x: CX + Math.cos(a) * RX * d.ring, y: CY + Math.sin(a) * RY * d.ring, left: Math.sin(a) * d.speed > 0 };
};
const decoy = ducks[(w + 1 + Math.floor(rand() * (n - 1))) % n];
const caught = at(ducks[w], CATCH);
// The fishing line hangs from the rod tip by Stickie on the bank.
const ROD = { x: 600, y: 40 };
const hook = computed(() => {
	const t = now.value;
	const d = at(decoy, t);
	const hover = { x: 420 + (d.x - 420) * span(t, 0.6, 2.2) + (caught.x - d.x) * span(t, 2.2, 3.1), y: 70 };
	if (t < 3.1) return hover;
	if (t < CATCH) return { x: caught.x, y: 70 + (caught.y - 74) * span(t, 3.1, CATCH) };
	// Tug, then reel the duck up to the rod.
	const tug = t < 4.2 ? Math.sin((t - CATCH) * 40) * 4 : 0;
	return { x: caught.x + (ROD.x - 40 - caught.x) * span(t, 4.2, 5.4), y: caught.y - 4 + tug + (110 - caught.y) * span(t, 4.2, 5.4) };
});
const view = computed(() =>
	ducks.map((d) => {
		const won = d.i === w && now.value >= CATCH;
		const p = won ? { x: hook.value.x, y: hook.value.y + 4, left: false } : at(d, now.value);
		return { ...d, ...p, y: p.y + (won ? 0 : Math.sin(now.value * 3 + d.bob) * 2), won };
	}),
);
const splash = computed(() => now.value - CATCH);
watch(
	() => now.value >= CATCH,
	(v) => v && sounds.pop(),
);
</script>

<template>
	<svg viewBox="0 0 640 360" class="show">
		<Paper />
		<!-- Pond with a soft ripple ring. -->
		<ellipse :cx="CX" :cy="CY" :rx="RX + 26" :ry="RY + 22" fill="#B5D4F4" :stroke="INK" stroke-width="3" />
		<ellipse :cx="CX" :cy="CY" :rx="RX - 10" :ry="RY - 12" fill="none" :stroke="PAPER" stroke-width="2" stroke-dasharray="14 18" opacity="0.7" />
		<!-- Stickie on the bank with a rod. -->
		<g transform="translate(552 12)"><Mascot :size="54" :face="now >= CATCH && now < 4.4 ? 'startled' : 'happy'" /></g>
		<path :d="`M560 50Q590 30 ${ROD.x} ${ROD.y}`" fill="none" stroke="#854F0B" stroke-width="4" stroke-linecap="round" />
		<path :d="`M${ROD.x} ${ROD.y}L${hook.x} ${hook.y}`" :stroke="INK" stroke-width="1.5" />
		<path :d="`M${hook.x} ${hook.y}v6a4 4 0 0 1-8 0`" fill="none" :stroke="INK" stroke-width="2.2" stroke-linecap="round" />
		<!-- Splash rings and drops where the duck was caught. -->
		<g v-if="splash > 0 && splash < 1.2" :opacity="1 - splash / 1.2">
			<ellipse v-for="k in 3" :key="k" :cx="caught.x" :cy="caught.y + 8" :rx="12 + splash * 40 * k" :ry="5 + splash * 14 * k" fill="none" :stroke="PAPER" stroke-width="2.5" />
			<circle v-for="k in 6" :key="`d${k}`" :cx="caught.x + Math.cos(k) * splash * 50" :cy="caught.y - splash * 60 + splash * splash * 70 - k * 2" r="3" fill="#85B7EB" :stroke="INK" stroke-width="1" />
		</g>
		<!-- Ducks, sorted back to front by their y. -->
		<g v-for="d in [...view].sort((a, b) => a.y - b.y)" :key="d.name" :transform="`translate(${d.x} ${d.y}) scale(${size})`">
			<g :transform="d.left ? 'scale(-1 1)' : ''">
				<path d="M-22 0q0 14 22 14q24 0 26-12q-14 2-18-6z" fill="#FAC775" :stroke="INK" stroke-width="2.5" stroke-linejoin="round" />
				<circle cx="10" cy="-12" r="10" fill="#FAC775" :stroke="INK" stroke-width="2.5" />
				<path d="M19 -13l9 2l-9 4z" fill="#F0997B" :stroke="INK" stroke-width="1.8" stroke-linejoin="round" />
				<circle cx="13" cy="-15" r="1.8" :fill="INK" />
				<path d="M-8 2q6 6 14 2" fill="none" :stroke="paintOf(d.i)[2]" stroke-width="2.5" stroke-linecap="round" />
			</g>
			<text y="30" text-anchor="middle" font-size="13" font-weight="800" :fill="inkOf(d.i)" :stroke="PAPER" stroke-width="3.5" paint-order="stroke">{{ short(d.name, 9) }}</text>
		</g>
	</svg>
</template>
