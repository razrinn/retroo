<script setup lang="ts">
import { computed, watch } from "vue";
import { sounds } from "../sound";
import { type ShowProps, colorOf, rng, shuffle, span, useClock } from "../shows";

// Car race and horse race: lights, then everyone runs their own seeded pace, overtaking along the way.
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
const emoji = Math.max(16, Math.min(46, laneH * 0.75));
const racers = computed(() =>
	props.names.map((name, i) => {
		const p = progress(i, u.value);
		const spin = i === spinner ? 720 * span(u.value, 0.35, 0.5) : 0;
		const bounce = !cars && u.value > 0 && p < 1 ? -Math.abs(Math.sin(u.value * 60 + i)) * laneH * 0.12 : 0;
		return { name, i, x: START + (END - START) * Math.min(1.04, p), y: top + laneH * (i + 0.5), spin, bounce, done: p >= 1 };
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
		<rect width="640" height="360" :fill="cars ? '#5f5e5a' : '#9fd09a'" />
		<rect v-if="!cars" x="0" :y="top - 4" width="640" :height="360 - top - 22" fill="#d9a066" />
		<g v-for="i in n - 1" :key="`l${i}`">
			<path :d="`M0 ${top + laneH * i}H640`" :stroke="cars ? '#fffdf8' : '#c08a5a'" stroke-width="1.5" :stroke-dasharray="cars ? '14 10' : ''" opacity="0.6" />
		</g>
		<path v-if="!cars" :d="`M0 ${top - 4}H640M0 ${360 - 26}H640`" stroke="#fffdf8" stroke-width="3" />
		<!-- Start and checkered finish. -->
		<path :d="`M${START} ${top}V${360 - 30}`" stroke="#fffdf8" stroke-width="2" opacity="0.7" />
		<g v-for="r in Math.ceil((360 - top - 30) / 8)" :key="`c${r}`">
			<rect :x="END + 8" :y="top + (r - 1) * 8" width="8" height="8" :fill="r % 2 ? '#2a2723' : '#fffdf8'" />
			<rect :x="END + 16" :y="top + (r - 1) * 8" width="8" height="8" :fill="r % 2 ? '#fffdf8' : '#2a2723'" />
		</g>
		<g v-for="r in racers" :key="r.name" :transform="`translate(${r.x} ${r.y + r.bounce})`">
			<text v-if="u > 0 && !r.done && (!cars || r.i === spinner)" :x="-emoji * 0.35" :y="emoji * 0.35" :font-size="emoji * 0.4" text-anchor="middle" opacity="0.55">💨</text>
			<text
				:font-size="emoji"
				text-anchor="middle"
				dominant-baseline="central"
				:transform="`rotate(${r.spin}) scale(-1 1)`"
			>{{ cars ? "🏎️" : "🏇" }}</text>
			<text :x="-emoji * 0.75" :y="0" text-anchor="end" dominant-baseline="central" :font-size="Math.max(10, Math.min(17, laneH * 0.4))" font-weight="800" :fill="colorOf(r.i)" stroke="#fffdf8" stroke-width="3" paint-order="stroke">{{ r.name }}</text>
		</g>
		<!-- Start lights, then the commentary ticker. -->
		<g v-if="now < LIGHTS + 0.5" transform="translate(320 18)">
			<rect x="-46" y="-14" width="92" height="28" rx="14" fill="#2a2723" />
			<circle v-for="k in 3" :key="k" :cx="-30 + (k - 1) * 30" cy="0" r="9" :fill="light >= 3 ? '#5dcaa5' : light >= k - 1 ? '#e24b4a' : '#5f5e5a'" />
		</g>
		<g v-else>
			<rect x="0" y="0" width="640" :height="top - 6" fill="#26215c" opacity="0.85" />
			<text :key="line" x="320" :y="(top - 6) / 2" text-anchor="middle" dominant-baseline="central" font-size="15" font-weight="800" fill="#fffdf8" class="ticker">{{ line }}</text>
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
