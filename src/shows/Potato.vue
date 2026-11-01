<script setup lang="ts">
import { computed, watch } from "vue";
import Mascot from "../Mascot.vue";
import { sounds } from "../sound";
import { INK, PAPER, type ShowProps, inkOf, paintOf, rng, short, useClock } from "../shows";
import Paper from "./Paper.vue";

// Hot potato: Stickies in a circle toss a lit bomb around, faster and faster as the fuse burns down.
// It goes off in the winner's hands: they're it.
const props = defineProps<ShowProps>();
const emit = defineEmits<{ done: [] }>();
const rand = rng(props.seed);
const n = props.names.length;
const w = props.names.indexOf(props.winner);

const CX = 320;
const CY = 194;
const RX = n <= 8 ? 190 : 230;
const RY = n <= 8 ? 110 : 128;
const size = n <= 8 ? 50 : n <= 12 ? 42 : 36;
const seats = props.names.map((name, i) => {
	const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
	return { name, i, x: CX + Math.cos(a) * RX, y: CY + Math.sin(a) * RY };
});
// The tosses: random holders (never the same twice running), ending on the winner. Each toss is quicker.
const holders = [Math.floor(rand() * n)];
while (holders.length < 14) {
	const next = holders.length === 13 ? w : Math.floor(rand() * n);
	if (next !== holders.at(-1)) holders.push(next);
	else if (holders.length === 13) holders[12] = (w + 1) % n; // make room for the last toss to the winner
}
const durations = holders.slice(1).map((_, k) => 0.55 - (0.37 * k) / 12);
const starts = durations.map((_, k) => 0.4 + durations.slice(0, k).reduce((a, b) => a + b, 0));
const tossed = starts.at(-1)! + durations.at(-1)!;
const BOOM = tossed + 0.9;
const now = useClock(BOOM + 1.3, () => emit("done"));

const bomb = computed(() => {
	const t = now.value;
	const k = starts.findLastIndex((s) => t >= s);
	if (k < 0) return { ...seats[holders[0]], y: seats[holders[0]].y - size };
	const from = seats[holders[k]];
	const to = seats[holders[k + 1]];
	const f = Math.min(1, (t - starts[k]) / durations[k]);
	return { x: from.x + (to.x - from.x) * f, y: from.y + (to.y - from.y) * f - size - Math.sin(f * Math.PI) * 60 };
});
watch(
	() => starts.findLastIndex((s) => now.value >= s),
	() => sounds.tick(),
);
const boom = computed(() => now.value - BOOM);
watch(
	() => boom.value >= 0,
	(v) => v && sounds.pop(),
);
const fuse = computed(() => Math.max(0, 1 - now.value / BOOM));
</script>

<template>
	<svg viewBox="0 0 640 360" class="show">
		<Paper />
		<ellipse :cx="CX" :cy="CY + 16" :rx="RX - 30" :ry="RY - 24" fill="#26215c" opacity="0.05" />
		<g v-for="s in seats" :key="s.name">
			<g :transform="`translate(${s.x - size / 2} ${s.y - size})`">
				<Mascot :size="size" :paint="paintOf(s.i)" :face="boom >= 0 && s.i === w ? 'startled' : boom >= 0 ? 'happy' : 'worried'" />
			</g>
			<!-- Soot on the winner after the bang. -->
			<ellipse v-if="boom >= 0 && s.i === w" :cx="s.x" :cy="s.y - size * 0.55" :rx="size * 0.42" :ry="size * 0.34" :fill="INK" opacity="0.25" />
			<text :x="s.x" :y="s.y + 13" text-anchor="middle" font-size="12" font-weight="800" :fill="inkOf(s.i)" :stroke="PAPER" stroke-width="3" paint-order="stroke">{{ short(s.name, 9) }}</text>
		</g>
		<!-- The bomb with its burning fuse. -->
		<g v-if="boom < 0" :transform="`translate(${bomb.x} ${bomb.y}) rotate(${now * 200})`">
			<circle r="13" :fill="INK" />
			<circle cx="-4" cy="-4" r="3.5" :fill="PAPER" opacity="0.5" />
			<rect x="-4" y="-17" width="8" height="5" rx="1.5" fill="#5F5E5A" />
			<path :d="`M0 -17q${4 + fuse * 6} ${-6 - fuse * 8} ${2 + fuse * 10} ${-8 - fuse * 12}`" fill="none" stroke="#854F0B" stroke-width="2" stroke-linecap="round" />
			<circle :cx="2 + fuse * 10" :cy="-25 - fuse * 12" :r="3 + (Math.floor(now * 20) % 2) * 2" fill="#FAC775" :stroke="INK" stroke-width="1" />
		</g>
		<!-- BOOM: a paper starburst over the winner. -->
		<g v-else-if="boom < 1" :transform="`translate(${seats[w].x} ${seats[w].y - size * 0.6}) scale(${0.4 + Math.min(1, boom * 4) * 0.8})`" :opacity="boom < 0.7 ? 1 : (1 - boom) / 0.3">
			<path
				:d="Array.from({ length: 20 }, (_, k) => `${k ? 'L' : 'M'}${Math.cos(k * 0.314) * (k % 2 ? 34 : 62)} ${Math.sin(k * 0.314) * (k % 2 ? 34 : 62)}`).join('') + 'Z'"
				fill="#FAC775"
				:stroke="INK"
				stroke-width="3"
				stroke-linejoin="round"
			/>
			<text text-anchor="middle" dominant-baseline="central" font-size="24" font-weight="900" :fill="INK">BOOM</text>
		</g>
	</svg>
</template>
