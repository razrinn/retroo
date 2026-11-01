<script setup lang="ts">
import { computed, watch } from "vue";
import { sounds } from "../sound";
import { type ShowProps, colorOf, outCubic, rng, shuffle, useClock } from "../shows";

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
	return { x: c.x + c.vx * t, y: 298 + c.vy * t + 300 * t * t, show: now.value - STOPS[2] > c.at };
};
const colorFor = (name: string) => colorOf(props.names.indexOf(name));
</script>

<template>
	<svg viewBox="0 0 640 360" class="show">
		<rect width="640" height="360" fill="#26215c" />
		<!-- Lights around the machine blink faster on a jackpot. -->
		<circle
			v-for="k in 18"
			:key="`b${k}`"
			:cx="70 + (k - 1) * 28.5"
			cy="40"
			r="6"
			:fill="(Math.floor(now * (jackpot ? 10 : 3)) + k) % 2 ? '#fac775' : '#7f77dd'"
		/>
		<rect x="60" y="56" width="500" height="250" rx="20" fill="#d85a30" stroke="#993c1d" stroke-width="4" />
		<text x="310" y="84" text-anchor="middle" font-size="22" font-weight="900" fill="#fac775" letter-spacing="3">{{ jackpot ? "JACKPOT!" : "NEXT MC" }}</text>
		<defs>
			<clipPath v-for="(r, k) in view" :id="`reel-${seed}-${k}`" :key="`c${k}`">
				<rect :x="r.x - 60" y="100" width="120" height="160" rx="10" />
			</clipPath>
		</defs>
		<g v-for="(r, k) in view" :key="`r${k}`">
			<rect :x="r.x - 60" y="100" width="120" height="160" rx="10" fill="#fffdf8" stroke="#993c1d" stroke-width="3" />
			<g :clip-path="`url(#reel-${seed}-${k})`">
				<text
					v-for="row in r.rows"
					:key="row.key"
					:x="r.x"
					:y="row.y"
					text-anchor="middle"
					dominant-baseline="central"
					font-size="19"
					font-weight="800"
					:fill="colorFor(row.name)"
				>
					{{ row.name.length > 9 ? `${row.name.slice(0, 8)}…` : row.name }}
				</text>
			</g>
			<rect :x="r.x - 60" y="100" width="120" height="160" rx="10" fill="url(#shade)" pointer-events="none" />
		</g>
		<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
			<stop offset="0" stop-color="#26215c" stop-opacity="0.35" />
			<stop offset="0.3" stop-color="#26215c" stop-opacity="0" />
			<stop offset="0.7" stop-color="#26215c" stop-opacity="0" />
			<stop offset="1" stop-color="#26215c" stop-opacity="0.35" />
		</linearGradient>
		<rect v-if="jackpot" x="64" y="154" width="492" height="52" rx="8" fill="none" stroke="#fac775" stroke-width="4" :opacity="Math.floor(now * 6) % 2 ? 1 : 0.4" />
		<path d="M64 180H556" stroke="#fac775" stroke-width="2" stroke-dasharray="6 6" opacity="0.8" />
		<!-- Lever. -->
		<g :transform="`rotate(${lever * 70} 566 230)`">
			<path d="M566 230V120" stroke="#b4b2a9" stroke-width="7" stroke-linecap="round" />
			<circle cx="566" cy="116" r="13" fill="#e24b4a" stroke="#993c1d" stroke-width="3" />
		</g>
		<rect x="250" y="290" width="140" height="14" rx="7" fill="#2a2723" />
		<template v-if="jackpot">
			<g v-for="(c, i) in coins" :key="`coin${i}`">
				<g v-if="coinAt(c).show" :transform="`translate(${coinAt(c).x} ${coinAt(c).y})`">
					<ellipse rx="7" ry="7" fill="#fac775" stroke="#b26a00" stroke-width="2" />
					<path d="M-2 -3h4M-2 3h4" stroke="#b26a00" stroke-width="1.5" />
				</g>
			</g>
		</template>
	</svg>
</template>
