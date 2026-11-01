<script setup lang="ts">
import { computed, watch } from "vue";
import { sounds } from "../sound";
import Mascot from "../Mascot.vue";
import { INK, PAPER, type ShowProps, inkOf, outCubic, rng, short, shuffle, useClock } from "../shows";
import Paper from "./Paper.vue";

// Slot machine: pull the lever, three reels of names spin and stop one by one (the last one crawls),
// lining up three of the winner for the jackpot.
const props = defineProps<ShowProps>();
const emit = defineEmits<{ done: [] }>();
const rand = rng(props.seed);
const STOPS = [2.2, 3.1, 4.6];
const now = useClock(STOPS[2] + 2, () => emit("done"));

const ROW = 52;
// Each reel is the names in its own shuffled order, repeated; it stops on the winner a few loops in.
const reels = STOPS.map((stop, k) => {
	const strip = shuffle(props.names, rand);
	const loops = 4 + k * 2;
	const final = loops * strip.length + strip.indexOf(props.winner);
	return { strip, final, stop };
});
const offset = (k: number) => reels[k].final * outCubic(Math.min(1, Math.max(0, now.value - 0.4) / (reels[k].stop - 0.4)));
const view = computed(() =>
	reels.map((reel, k) => {
		const o = offset(k);
		const base = Math.floor(o);
		// Five visible rows around the centre line, sliding by the fraction.
		const rows = [-2, -1, 0, 1, 2].map((d) => {
			const idx = (((base + d) % reel.strip.length) + reel.strip.length) % reel.strip.length;
			return { name: reel.strip[idx], y: 180 + (d - (o - base)) * ROW, key: base + d };
		});
		return { x: 120 + k * 140, rows, stopped: now.value >= reel.stop };
	}),
);
watch(
	() => Math.floor(offset(0) + offset(1) + offset(2)),
	() => sounds.tick(),
);
const stopped = computed(() => view.value.filter((r) => r.stopped).length);
watch(stopped, () => sounds.pop());
const jackpot = computed(() => stopped.value === 3);
const lever = computed(() => (now.value < 0.4 ? now.value / 0.4 : Math.max(0, 1 - (now.value - 0.4) / 0.3)));
const coins = Array.from({ length: 28 }, () => ({ x: 260 + rand() * 120, vx: (rand() - 0.5) * 260, vy: -60 - rand() * 80, at: rand() * 0.9 }));
const coinAt = (c: (typeof coins)[number]) => {
	const t = Math.max(0, now.value - STOPS[2] - c.at);
	return { x: c.x + c.vx * t, y: 290 + c.vy * t + 300 * t * t, show: now.value - STOPS[2] > c.at };
};
const inkFor = (name: string) => inkOf(props.names.indexOf(name));
</script>

<template>
	<svg viewBox="0 0 640 360" class="show">
		<Paper />
		<!-- The machine: a peach cabinet with an ink outline, Stickie on top, bulbs that blink faster on a jackpot. -->
		<rect x="66" y="62" width="490" height="250" rx="22" fill="#26215c" opacity="0.08" transform="translate(6 8)" />
		<rect x="66" y="62" width="490" height="250" rx="22" fill="#F5C4B3" :stroke="INK" stroke-width="3.5" />
		<rect x="200" y="40" width="220" height="40" rx="14" :fill="PAPER" :stroke="INK" stroke-width="3" />
		<text x="310" y="61" text-anchor="middle" dominant-baseline="central" font-size="18" font-weight="900" :fill="INK" letter-spacing="2">{{ jackpot ? "JACKPOT!" : "NEXT MC" }}</text>
		<g transform="translate(408 14)"><Mascot :size="40" :face="jackpot ? 'happy' : 'startled'" /></g>
		<circle
			v-for="k in 14"
			:key="`b${k}`"
			:cx="90 + (k - 1) * 34"
			cy="96"
			r="5"
			:fill="(Math.floor(now * (jackpot ? 10 : 3)) + k) % 2 ? '#FAC775' : PAPER"
			:stroke="INK"
			stroke-width="1.5"
		/>
		<defs>
			<clipPath v-for="(r, k) in view" :id="`reel-${seed}-${k}`" :key="`c${k}`">
				<rect :x="r.x - 60" y="110" width="120" height="150" rx="12" />
			</clipPath>
		</defs>
		<g v-for="(r, k) in view" :key="`r${k}`">
			<rect :x="r.x - 60" y="110" width="120" height="150" rx="12" :fill="PAPER" />
			<g :clip-path="`url(#reel-${seed}-${k})`">
				<text
					v-for="row in r.rows"
					:key="row.key"
					:x="r.x"
					:y="row.y + 5"
					text-anchor="middle"
					dominant-baseline="central"
					font-size="18"
					font-weight="800"
					:fill="inkFor(row.name)"
					:opacity="Math.abs(row.y - 180) < 26 ? 1 : 0.4"
				>
					{{ short(row.name, 9) }}
				</text>
			</g>
			<rect :x="r.x - 60" y="110" width="120" height="150" rx="12" fill="none" :stroke="INK" stroke-width="3" />
		</g>
		<rect v-if="jackpot" x="62" y="158" width="498" height="54" rx="12" fill="none" stroke="#EF9F27" stroke-width="4" :opacity="Math.floor(now * 6) % 2 ? 1 : 0.4" />
		<path d="M66 185H556" :stroke="INK" stroke-width="1.5" stroke-dasharray="5 6" opacity="0.35" />
		<!-- Lever. -->
		<g :transform="`rotate(${lever * 70} 570 236)`">
			<path d="M570 236V126" :stroke="INK" stroke-width="6" stroke-linecap="round" />
			<circle cx="570" cy="120" r="13" fill="#F0997B" :stroke="INK" stroke-width="3" />
		</g>
		<rect x="250" y="284" width="140" height="14" rx="7" :fill="INK" />
		<template v-if="jackpot">
			<g v-for="(c, i) in coins" :key="`coin${i}`">
				<g v-if="coinAt(c).show" :transform="`translate(${coinAt(c).x} ${coinAt(c).y})`">
					<circle r="7" fill="#FAC775" :stroke="INK" stroke-width="2" />
					<path d="M0 -3.5v7" stroke="#854F0B" stroke-width="1.8" stroke-linecap="round" />
				</g>
			</g>
		</template>
	</svg>
</template>
