<script setup lang="ts">
import { computed, watch } from "vue";
import Mascot from "../Mascot.vue";
import { sounds } from "../sound";
import { INK, PAPER, type ShowProps, inkOf, paintOf, rng, short, span, useClock } from "../shows";
import Paper from "./Paper.vue";

// Claw machine: a pile of Stickie plushies. The claw heads for one, changes its mind, grabs the winner,
// nearly drops them on the way up, and delivers them down the chute.
const props = defineProps<ShowProps>();
const emit = defineEmits<{ done: [] }>();
const rand = rng(props.seed);
const n = props.names.length;
const w = props.names.indexOf(props.winner);
const now = useClock(7.6, () => emit("done"));

// Plushies in a loose pile along the floor of the cabinet.
const size = n <= 8 ? 46 : n <= 12 ? 40 : 34;
const perRow = Math.ceil(n / 2);
const plush = props.names.map((name, i) => {
	const row = i < perRow ? 0 : 1;
	const k = row ? i - perRow : i;
	const count = row ? n - perRow : perRow;
	return { name, i, x: 210 + ((k + 0.5) / count) * 330 + (rand() - 0.5) * 10, y: row ? 300 : 236 + (rand() - 0.5) * 6, tilt: (rand() - 0.5) * 30 };
});
const decoy = plush[(w + 1 + Math.floor(rand() * (n - 1))) % n];
const target = plush[w];
const CHUTE = 128;
const RAIL = 58;

// The claw's position through the show, phase by phase.
const claw = computed(() => {
	const t = now.value;
	let x = CHUTE;
	x += (decoy.x - CHUTE) * span(t, 0.5, 1.6);
	x += (target.x - decoy.x) * span(t, 1.9, 2.6);
	x += (CHUTE - target.x) * span(t, 5.2, 6.3);
	const drop = target.y - size * 0.9 - RAIL;
	let y = RAIL + drop * span(t, 2.7, 3.5) - drop * span(t, 3.9, 4.8);
	const slip = t > 4.8 && t < 5.3 ? Math.sin(((t - 4.8) / 0.5) * Math.PI) * 14 : 0;
	const open = t < 3.5 ? 1 : t < 3.8 ? 1 - (t - 3.5) / 0.3 : t > 6.4 ? Math.min(1, (t - 6.4) / 0.2) : 0;
	const sway = t > 1.6 && t < 1.9 ? Math.sin((t - 1.6) * 30) * 4 : 0;
	return { x: x + sway, y, open, slip };
});
const holding = computed(() => now.value > 3.8 && now.value < 6.5);
const fallen = computed(() => now.value >= 6.5);
const prize = computed(() => {
	if (!holding.value && !fallen.value) return { x: target.x, y: target.y, rot: target.tilt };
	if (holding.value) return { x: claw.value.x, y: claw.value.y + size * 0.95 + claw.value.slip, rot: Math.sin(now.value * 6) * 8 };
	const f = Math.min(1, (now.value - 6.5) / 0.4);
	// Down into the chute, behind its front panel.
	return { x: CHUTE, y: RAIL + size + f * f * (315 - RAIL - size), rot: f * 40 };
});
watch(holding, (v) => v && sounds.tick());
watch(fallen, (v) => v && sounds.pop());
</script>

<template>
	<svg viewBox="0 0 640 360" class="show">
		<Paper />
		<!-- Cabinet and glass. -->
		<rect x="78" y="34" width="490" height="300" rx="18" fill="#CECBF6" :stroke="INK" stroke-width="3.5" />
		<rect x="94" y="50" width="458" height="270" rx="10" :fill="PAPER" :stroke="INK" stroke-width="2.5" />
		<path d="M110 70l40 -12M120 110l70 -22" :stroke="INK" stroke-width="2" opacity="0.12" stroke-linecap="round" />
		<path :d="`M94 ${RAIL}H552`" :stroke="INK" stroke-width="3" />
		<!-- Chute in the corner. -->
		<path :d="`M${CHUTE - 34} 230h68v90h-68z`" fill="#AFA9EC" :stroke="INK" stroke-width="2.5" />
		<text :x="CHUTE" y="250" text-anchor="middle" font-size="11" font-weight="800" :fill="INK">PRIZE</text>
		<!-- The pile. -->
		<g v-for="p in plush" :key="p.name" :opacity="p.i === w && (holding || fallen) ? 0 : 1">
			<g :transform="`translate(${p.x} ${p.y}) rotate(${p.tilt})`">
				<g :transform="`translate(${-size / 2} ${-size})`"><Mascot :size="size" :paint="paintOf(p.i)" /></g>
			</g>
			<text :x="p.x" :y="p.y + 10" text-anchor="middle" :font-size="size < 40 ? 10 : 12" font-weight="800" :fill="inkOf(p.i)" :stroke="PAPER" stroke-width="3" paint-order="stroke">{{ short(p.name, 8) }}</text>
		</g>
		<!-- The prize on its way. -->
		<g v-if="holding || fallen" :transform="`translate(${prize.x} ${prize.y}) rotate(${prize.rot})`">
			<g :transform="`translate(${-size / 2} ${-size})`"><Mascot :size="size" :paint="paintOf(w)" :face="fallen ? 'happy' : 'startled'" /></g>
		</g>
		<!-- Front of the chute hides the prize as it drops in. -->
		<rect :x="CHUTE - 34" y="262" width="68" height="58" fill="#AFA9EC" :stroke="INK" stroke-width="2.5" />
		<!-- Claw: cable, head and two prongs that open and close. -->
		<path :d="`M${claw.x} ${RAIL}V${claw.y}`" :stroke="INK" stroke-width="2.5" />
		<rect :x="claw.x - 14" :y="RAIL - 8" width="28" height="12" rx="4" :fill="INK" />
		<g :transform="`translate(${claw.x} ${claw.y})`">
			<rect x="-12" y="-4" width="24" height="12" rx="4" fill="#F0997B" :stroke="INK" stroke-width="2.5" />
			<path :d="`M-8 8l${-10 - claw.open * 10} 16l${8 + claw.open * 4} 10`" fill="none" :stroke="INK" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
			<path :d="`M8 8l${10 + claw.open * 10} 16l${-8 - claw.open * 4} 10`" fill="none" :stroke="INK" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
		</g>
	</svg>
</template>
