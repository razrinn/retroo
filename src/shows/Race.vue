<script setup lang="ts">
import { computed, watch } from "vue";
import { sounds } from "../sound";
import Mascot from "../Mascot.vue";
import { INK, PAPER, type ShowProps, inkOf, paintOf, rng, short, shuffle, span, useClock } from "../shows";
import Paper from "./Paper.vue";

// Car race and horse race: Stickies in little karts or on hobby horses. Lights, then everyone runs their own
// seeded pace, overtaking along the way.
// The winner's pace is set to cross first; a commentary ticker calls the leaders.
const props = defineProps<ShowProps & { kind: string }>();
const emit = defineEmits<{ done: [] }>();
const cars = props.kind === "cars";
const LIGHTS = 1.6;
const RACE = 7;
const now = useClock(LIGHTS + RACE + 1.4, () => emit("done"));
const u = computed(() => Math.max(0, now.value - LIGHTS) / RACE); // race progress 0..1

const rand = rng(props.seed);
const n = props.names.length;
const w = props.names.indexOf(props.winner);
// Finish times as a share of the race: the winner at 0.86, everyone else after. Paces differ: some start
// fast and fade, the winner tends to come from behind.
const finish = props.names.map((_, i) => (i === w ? 0.86 : 0.89 + rand() * 0.25));
const power = props.names.map((_, i) => (i === w ? 1.45 : 0.75 + rand() * 0.6));
const wobble = props.names.map(() => ({ a: 0.02 + rand() * 0.05, f: 1 + rand() * 2.5, p: rand() * 6.28 }));
const spinner = cars ? shuffle([...props.names.keys()].filter((i) => i !== w), rand)[0] : -1;
const progress = (i: number, t: number) => {
	const base = Math.min(1.05, (t / finish[i]) ** power[i]);
	const wb = wobble[i].a * Math.sin(6.28 * wobble[i].f * t + wobble[i].p) * t * Math.max(0, 1 - t / finish[i]);
	const crash = i === spinner ? 0.07 * span(t, 0.35, 0.5) : 0;
	return Math.max(0, base + wb - crash);
};

const START = 110; // room for names trailing behind
const END = 580;
const top = 34;
const laneH = (360 - top - 30) / n;
const S = Math.max(18, Math.min(52, laneH * 0.78)); // Stickie size
// The hobby horse's head, facing right, in Stickie sizes: neck, ear, long face, muzzle, jaw.
const pts = (list: number[][]) => list.map(([x, y], k) => `${k ? "L" : "M"}${(x + 0.28) * S} ${y * S}`).join("") + "Z";
const HEAD = pts([[0.3, 0.02], [0.36, -0.36], [0.44, -0.6], [0.52, -0.42], [0.88, -0.2], [0.94, -0.06], [0.86, 0.02], [0.6, -0.02], [0.46, 0.12]]);
const MANE = `M${0.64 * S} ${-0.36 * S}l${-0.1 * S} ${0.08 * S}l${0.06 * S} ${0.06 * S}l${-0.1 * S} ${0.08 * S}l${0.06 * S} ${0.06 * S}l${-0.08 * S} ${0.08 * S}`;
const racers = computed(() =>
	props.names.map((name, i) => {
		const p = progress(i, u.value);
		const spin = i === spinner ? 720 * span(u.value, 0.35, 0.5) : 0;
		const bounce = !cars && u.value > 0 && p < 1 ? -Math.abs(Math.sin(u.value * 60 + i)) * laneH * 0.12 : 0;
		return { name, i, x: START + (END - START) * Math.min(1.04, p), y: top + laneH * (i + 0.5) + S * 0.28, spin, bounce, done: p >= 1 };
	}),
);
const leader = computed(() => racers.value.reduce((a, b) => (b.x > a.x ? b : a)).name);
watch(leader, () => u.value > 0 && sounds.tick());
const won = computed(() => u.value >= finish[w]);
watch(won, (v) => v && sounds.pop());

// What the commentator says at each moment, from the race as it is.
const ranked = (t: number) => props.names.map((name, i) => ({ name, p: progress(i, t) })).sort((a, b) => b.p - a.p);
const second = ranked(finish[w])[1];
const LINES: [number, () => string][] = cars
	? [
			[0, () => "GO GO GO!"],
			[0.2, () => `${ranked(0.2)[0].name} gets the best start!`],
			[0.36, () => `${props.names[spinner] ?? ""} spins out! 💫`],
			[0.6, () => `${ranked(0.6)[0].name} leads into the last lap!`],
			[0.75, () => `${props.winner} is flying!`],
			[finish[w], () => `🏁 ${props.winner} takes the flag!`],
		]
	: [
			[0, () => "And they're off!"],
			[0.2, () => `${ranked(0.2)[0].name} breaks out early!`],
			[0.42, () => `${ranked(0.42)[0].name} takes the inside line!`],
			[0.6, () => `${ranked(0.6).at(-1)!.name} is fading!`],
			[0.76, () => `${props.winner} surges down the outside!`],
			[finish[w], () => (second && second.p > 0.96 ? `PHOTO FINISH! It's ${props.winner}!` : `${props.winner} wins by a length!`)],
		];
const line = computed(() => (now.value < LIGHTS ? "" : LINES.filter(([at]) => u.value >= at).at(-1)?.[1]() ?? ""));
const light = computed(() => Math.min(3, Math.floor(now.value / (LIGHTS / 3))));
</script>

<template>
	<svg viewBox="0 0 640 360" class="show">
		<Paper />
		<!-- Lanes: paper strips with faint dashed ink lines between. -->
		<rect x="0" :y="top" width="640" :height="laneH * n" :fill="PAPER" opacity="0.7" />
		<path v-for="i in n - 1" :key="`l${i}`" :d="`M0 ${top + laneH * i}H640`" :stroke="INK" stroke-width="1.5" stroke-dasharray="10 9" opacity="0.18" />
		<path :d="`M${START} ${top}V${top + laneH * n}`" :stroke="INK" stroke-width="2" opacity="0.3" />
		<g v-for="r in Math.ceil((laneH * n) / 9)" :key="`c${r}`">
			<rect :x="END + 12" :y="top + (r - 1) * 9" width="9" height="9" :fill="r % 2 ? INK : PAPER" />
			<rect :x="END + 21" :y="top + (r - 1) * 9" width="9" height="9" :fill="r % 2 ? PAPER : INK" />
		</g>
		<g v-for="r in racers" :key="r.name" :transform="`translate(${r.x} ${r.y + r.bounce})`">
			<g :transform="`rotate(${r.spin})`">
				<!-- Kart: a rounded body in the fold color, two ink wheels. -->
				<template v-if="cars">
					<rect :x="-S * 0.62" :y="S * 0.05" :width="S * 1.24" :height="S * 0.32" :rx="S * 0.14" :fill="paintOf(r.i)[1]" :stroke="INK" stroke-width="2.5" />
					<circle v-for="side in [-1, 1]" :key="side" :cx="side * S * 0.4" :cy="S * 0.4" :r="S * 0.13" :fill="INK" />
				</template>
				<!-- Hobby horse: a stick and a horse head out front. -->
				<template v-else>
					<path :d="`M${-S * 0.55} ${S * 0.45}L${S * 0.7} ${S * 0.02}`" :stroke="paintOf(r.i)[2]" stroke-width="3" stroke-linecap="round" />
					<path :d="HEAD" :fill="paintOf(r.i)[1]" :stroke="INK" stroke-width="2.2" stroke-linejoin="round" />
					<path :d="MANE" fill="none" :stroke="paintOf(r.i)[2]" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
					<circle :cx="S * 0.9" :cy="-S * 0.26" :r="S * 0.045" :fill="INK" />
				</template>
				<g :transform="`translate(${-S / 2} ${-S * 0.82})`"><Mascot :size="S" :paint="paintOf(r.i)" :face="r.i === spinner && r.spin > 0 && r.spin < 720 ? 'startled' : 'happy'" /></g>
			</g>
			<text :x="-S * 0.75" :y="-S * 0.2" text-anchor="end" dominant-baseline="central" :font-size="Math.max(11, Math.min(16, laneH * 0.32))" font-weight="800" :fill="inkOf(r.i)" :stroke="PAPER" stroke-width="4" paint-order="stroke">{{ short(r.name) }}</text>
		</g>
		<!-- Start lights, then the commentary in a paper pill. -->
		<g v-if="now < LIGHTS + 0.5" transform="translate(320 17)">
			<rect x="-52" y="-14" width="104" height="28" rx="14" :fill="PAPER" :stroke="INK" stroke-width="2.5" />
			<circle v-for="k in 3" :key="k" :cx="-30 + (k - 1) * 30" cy="0" r="8" :fill="light >= 3 ? '#5DCAA5' : light >= k - 1 ? '#F0997B' : '#e2ddd0'" :stroke="INK" stroke-width="2" />
		</g>
		<g v-else-if="line" :key="line" class="ticker">
			<rect x="150" y="3" width="340" height="28" rx="14" :fill="PAPER" :stroke="INK" stroke-width="2.5" />
			<text x="320" y="17" text-anchor="middle" dominant-baseline="central" font-size="14" font-weight="800" :fill="INK">{{ line }}</text>
		</g>
	</svg>
</template>

<style scoped>
.ticker {
	animation: slide 0.35s ease-out;
}
@keyframes slide {
	from {
		opacity: 0;
		translate: 0 -8px;
	}
}
</style>
