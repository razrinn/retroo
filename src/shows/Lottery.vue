<script setup lang="ts">
import { computed, watch } from "vue";
import Mascot from "../Mascot.vue";
import { sounds } from "../sound";
import { INK, PAPER, type ShowProps, colorOf, inkOf, rng, short, span, useClock } from "../shows";
import Paper from "./Paper.vue";

// Lottery machine: name balls tumble in a glass drum while Stickie cranks the handle. One ball drops out,
// rolls down the tube into the tray, and opens up to show the name.
const props = defineProps<ShowProps>();
const emit = defineEmits<{ done: [] }>();
const rand = rng(props.seed);
const n = props.names.length;
const w = props.names.indexOf(props.winner);
const OUT = 3.8;
const now = useClock(7, () => emit("done"));

const CX = 250;
const CY = 158;
const R = 118;
const ball = Math.max(14, Math.min(22, 200 / n));
const balls = props.names.map((name, i) => ({ name, i, a: rand() * 6.28, s: (0.8 + rand() * 1.6) * (rand() < 0.5 ? -1 : 1), f: 1 + rand() * 2, p: rand() * 6.28 }));
// Tumbling slows down after the winner drops out.
const spin = (t: number) => t - Math.max(0, t - OUT) * 0.6;
const tumble = (b: (typeof balls)[number], t: number) => {
	const r = (R - ball - 6) * (0.35 + 0.6 * Math.abs(Math.sin(b.f * spin(t) + b.p)));
	const a = b.a + b.s * spin(t);
	return { x: CX + Math.cos(a) * r, y: CY + Math.sin(a) * r };
};
// The winner: from the drum to its bottom, down the tube to the tray on the right.
const TUBE = [
	{ x: CX, y: CY + R - 4 },
	{ x: CX, y: 300 },
	{ x: 470, y: 300 },
];
const winner = computed(() => {
	const t = now.value;
	if (t < OUT) return tumble(balls[w], t);
	const from = tumble(balls[w], OUT);
	if (t < OUT + 0.4) {
		const f = span(t, OUT, OUT + 0.4);
		return { x: from.x + (TUBE[0].x - from.x) * f, y: from.y + (TUBE[0].y - from.y) * f };
	}
	if (t < OUT + 0.8) return { x: CX, y: TUBE[0].y + (TUBE[1].y - TUBE[0].y) * span(t, OUT + 0.4, OUT + 0.8) };
	return { x: CX + (TUBE[2].x - CX) * span(t, OUT + 0.8, OUT + 1.8), y: 300 };
});
const opened = computed(() => now.value >= OUT + 1.9);
watch(
	() => Math.floor(spin(now.value) * 3),
	() => now.value < OUT && sounds.tick(),
);
watch(opened, (v) => v && sounds.pop());
</script>

<template>
	<svg viewBox="0 0 640 360" class="show">
		<Paper />
		<!-- Stand and tube. -->
		<path :d="`M${CX - 70} 300h140l20 40h-180z`" fill="#F5C4B3" :stroke="INK" stroke-width="3" stroke-linejoin="round" />
		<path :d="`M${CX - 12} ${CY + R - 6}V312h${470 - CX + 40}`" fill="none" :stroke="INK" stroke-width="30" stroke-linejoin="round" opacity="0.9" />
		<path :d="`M${CX - 12} ${CY + R - 6}V312h${470 - CX + 40}`" fill="none" :stroke="PAPER" stroke-width="24" stroke-linejoin="round" />
		<!-- Tray. -->
		<path d="M430 290h110v34a10 10 0 0 1-10 10h-90a10 10 0 0 1-10-10z" fill="#9FE1CB" :stroke="INK" stroke-width="3" />
		<!-- Drum: glass circle with turning spokes. -->
		<circle :cx="CX" :cy="CY" :r="R" :fill="PAPER" :stroke="INK" stroke-width="4" />
		<g :transform="`rotate(${spin(now) * 120} ${CX} ${CY})`" opacity="0.18">
			<path v-for="k in 3" :key="k" :d="`M${CX} ${CY}L${CX + Math.cos(k * 2.094) * R} ${CY + Math.sin(k * 2.094) * R}`" :stroke="INK" stroke-width="3" />
		</g>
		<g v-for="b in balls" :key="b.name">
			<g v-if="b.i !== w" :transform="`translate(${tumble(b, now).x} ${tumble(b, now).y})`">
				<circle :r="ball" :fill="colorOf(b.i)" :stroke="INK" stroke-width="2" />
				<text text-anchor="middle" dominant-baseline="central" :font-size="ball * 0.62" font-weight="800" :fill="inkOf(b.i)">{{ short(b.name, 4) }}</text>
			</g>
		</g>
		<ellipse :cx="CX - R * 0.45" :cy="CY - R * 0.5" :rx="R * 0.12" :ry="R * 0.26" :fill="PAPER" opacity="0.7" :transform="`rotate(35 ${CX - R * 0.45} ${CY - R * 0.5})`" />
		<!-- The winning ball, and once it lands, the name on a paper ticket. -->
		<g :transform="`translate(${winner.x} ${winner.y}) rotate(${now > OUT + 0.8 ? (winner.x - CX) * 2 : 0})`">
			<circle :r="ball" :fill="colorOf(w)" :stroke="INK" stroke-width="2.5" />
			<text text-anchor="middle" dominant-baseline="central" :font-size="ball * 0.62" font-weight="800" :fill="inkOf(w)">{{ short(props.winner, 4) }}</text>
		</g>
		<g v-if="opened" class="ticket" transform="translate(485 210)">
			<rect x="-90" y="-28" width="180" height="56" rx="12" :fill="PAPER" :stroke="INK" stroke-width="3" />
			<text text-anchor="middle" dominant-baseline="central" font-size="22" font-weight="900" :fill="inkOf(w)">{{ short(props.winner, 13) }}</text>
		</g>
		<!-- Stickie turning the crank. -->
		<g :transform="`rotate(${spin(now) * 200} ${CX + R + 8} ${CY})`">
			<path :d="`M${CX + R + 8} ${CY}h30`" :stroke="INK" stroke-width="5" stroke-linecap="round" />
			<circle :cx="CX + R + 38" :cy="CY" r="7" fill="#F0997B" :stroke="INK" stroke-width="2.5" />
		</g>
		<g :transform="`translate(${CX + R + 40} ${CY - 70})`"><Mascot :size="56" :face="opened ? 'happy' : 'startled'" /></g>
	</svg>
</template>

<style scoped>
.ticket {
	animation: pop-in 0.4s cubic-bezier(0.3, 1.6, 0.5, 1);
}
@keyframes pop-in {
	from {
		scale: 0.3;
		opacity: 0;
	}
}
</style>
