<script setup lang="ts">
import { computed, ref } from "vue";
import Mascot from "./Mascot.vue";
import { type ListedBoard, formatCode, moodTint, post } from "./lib";

const password = ref("");
const boards = ref<ListedBoard[] | null>(null);
const error = ref("");

// Mood trend: each revealed board's average, oldest to newest, last 12 sprints.
const W = 600;
const H = 150;
const PAD = { x: 28, top: 14, bottom: 30 };
const trend = computed(() => {
	const rated = (boards.value ?? []).filter((b) => b.mood !== null).reverse().slice(-12);
	const step = rated.length > 1 ? (W - PAD.x * 2) / (rated.length - 1) : 0;
	const y = (m: number) => PAD.top + ((5 - m) / 4) * (H - PAD.top - PAD.bottom);
	return rated.map((b, i) => ({ ...b, mood: b.mood!, x: PAD.x + i * step, y: y(b.mood!) }));
});
const latest = computed(() => trend.value.at(-1));
const change = computed(() => {
	const t = trend.value;
	return t.length > 1 ? Math.round((t[t.length - 1].mood - t[t.length - 2].mood) * 10) / 10 : null;
});
const average = computed(() => {
	const t = trend.value;
	return t.length ? Math.round((t.reduce((n, p) => n + p.mood, 0) / t.length) * 10) / 10 : null;
});
const gridY = (m: number) => PAD.top + ((5 - m) / 4) * (H - PAD.top - PAD.bottom);
const short = (s: string) => (s.length > 12 ? s.slice(0, 11) + "…" : s);

const loading = ref(false);
const errorKey = ref(0);
async function show() {
	if (loading.value) return;
	error.value = "";
	loading.value = true;
	try {
		boards.value = await post<ListedBoard[]>("/api/boards/list", { password: password.value });
	} catch (e) {
		error.value = (e as Error).message;
		errorKey.value++;
	} finally {
		loading.value = false;
	}
}
</script>

<template>
	<main>
		<h1><a href="/" class="brand"><Mascot :size="32" /> retroo</a> <span class="muted">/ Past boards</span></h1>
		<form v-if="!boards" class="panel row" @submit.prevent="show">
			<input v-model="password" type="password" placeholder="Password" aria-label="Password" required />
			<button class="primary" :aria-busy="loading">Show</button>
		</form>
		<p v-if="error" :key="errorKey" class="error" role="alert">{{ error }}</p>
		<p v-if="boards && !boards.length" class="muted">No boards yet.</p>

		<section v-if="trend.length >= 2" class="panel trend" aria-label="Team mood over time">
			<div class="trend-head">
				<Mascot :mood="Math.round(latest!.mood)" :size="40" />
				<div>
					<h2>Team mood</h2>
					<p class="muted">
						Latest <strong>{{ latest!.mood.toFixed(1) }}</strong>
						<span v-if="change !== null" :class="change > 0 ? 'up' : change < 0 ? 'down' : ''">
							{{ change > 0 ? "▲" : change < 0 ? "▼" : "=" }} {{ Math.abs(change).toFixed(1) }}
						</span>
						· average {{ average!.toFixed(1) }} over {{ trend.length }} sprints
					</p>
				</div>
			</div>
			<svg class="chart" :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="trend.map((p) => `${p.title || 'Untitled'}: ${p.mood}`).join(', ')">
				<g v-for="m in [1, 3, 5]" :key="m">
					<line :x1="PAD.x - 10" :x2="W - PAD.x + 10" :y1="gridY(m)" :y2="gridY(m)" class="grid" />
					<text :x="4" :y="gridY(m) + 4" class="axis">{{ m }}</text>
				</g>
				<polyline :points="trend.map((p) => `${p.x},${p.y}`).join(' ')" class="line" />
				<g v-for="(p, i) in trend" :key="p.code">
					<circle :cx="p.x" :cy="p.y" r="7" :fill="moodTint(p.mood)" class="dot" :style="{ animationDelay: `${i * 60}ms` }" />
					<text v-if="trend.length <= 8 || i % 2 === trend.length % 2 || i === trend.length - 1" :x="p.x" :y="H - 8" class="label">
						{{ short(p.title || formatCode(p.code)) }}
					</text>
				</g>
			</svg>
		</section>
		<ul v-if="boards">
			<li v-for="(b, i) in boards" :key="b.code" :style="{ rotate: `${(i % 3) - 1}deg` }">
				<Mascot v-if="b.mood !== null" :mood="Math.round(b.mood)" :size="24" />
				<span v-else-if="trend.length" class="no-mood" aria-hidden="true" />
				<a :href="`/b/${b.code}`">{{ b.title || "Untitled" }}</a>
				<span class="mono muted">{{ formatCode(b.code) }}</span>
				<span class="muted">{{ new Date(b.created_at).toLocaleDateString() }}</span>
			</li>
		</ul>
	</main>
</template>

<style scoped>
main {
	max-width: 560px;
	margin: 0 auto;
	padding: 32px 16px;
}
h1 {
	margin-bottom: 20px;
}
h1 a {
	color: inherit;
	text-decoration: none;
}
.brand {
	display: inline-flex;
	align-items: center;
	gap: 8px;
	vertical-align: middle;
}
.trend {
	margin-bottom: 20px;
}
.trend-head {
	display: flex;
	align-items: center;
	gap: 12px;
	margin-bottom: 8px;
}
.trend-head h2 {
	font-size: 16px;
}
.trend-head p {
	margin: 0;
	font-size: 14px;
}
.up {
	color: var(--ok);
	font-weight: 700;
}
.down {
	color: var(--danger);
	font-weight: 700;
}
.chart {
	width: 100%;
	height: auto;
	overflow: visible;
}
.grid {
	stroke: var(--border);
	stroke-dasharray: 3 5;
}
.axis,
.label {
	font-size: 12px;
	fill: var(--muted);
	font-family: inherit;
}
.label {
	text-anchor: middle;
}
.line {
	fill: none;
	stroke: color-mix(in srgb, var(--text) 25%, transparent);
	stroke-width: 2.5;
	stroke-linejoin: round;
	stroke-dasharray: 2000;
	animation: draw-line 1.2s ease-out both;
}
@keyframes draw-line {
	from {
		stroke-dashoffset: 2000;
	}
}
.dot {
	stroke: var(--surface);
	stroke-width: 3;
	transform-box: fill-box;
	transform-origin: center;
	animation: pop-in 0.4s cubic-bezier(0.3, 1.6, 0.5, 1) both;
}
@keyframes pop-in {
	from {
		scale: 0;
	}
}
.small {
	font-size: 12px;
}
.no-mood {
	width: 24px;
}
ul {
	list-style: none;
	padding: 0;
	display: grid;
	gap: 10px;
}
li {
	display: flex;
	flex-wrap: wrap;
	gap: 4px 12px;
	align-items: center;
	padding: 12px 14px;
	border-radius: 6px;
	background: var(--surface);
	box-shadow: var(--shadow);
}
li a {
	flex: 1;
	font-weight: 700;
	text-decoration: none;
	color: var(--text);
}
</style>
