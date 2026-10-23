<script setup lang="ts">
import { computed } from "vue";
import Mascot from "./Mascot.vue";
import { type BoardState, type Card, moodTint } from "./lib";

// The 1200×675 picture behind "Share image" in the Summary. Rendered off-screen and turned into a PNG
// in the browser (modern-screenshot); nothing here is ever shown on the page itself.
const props = defineProps<{ state: BoardState; doodle: string | null }>();

const top = (col: string) =>
	props.state.cards
		.filter((c) => c.col === col && c.text !== null)
		.map((c, i) => ({ c, i }))
		.sort((a, b) => b.c.total - a.c.total || a.i - b.i)
		.slice(0, 3)
		.map(({ c }) => c);
const well = computed(() => top("well"));
const improve = computed(() => top("improve"));
const actions = computed(() => props.state.cards.filter((c) => c.col === "action").slice(0, 6));
const moreActions = computed(() => props.state.cards.filter((c) => c.col === "action").length - actions.value.length);
const mood = computed(() => props.state.mood);
const delta = computed(() =>
	mood.value.average !== null && mood.value.previous !== null ? Math.round((mood.value.average - mood.value.previous) * 10) / 10 : null,
);
const last = computed(() => ({
	done: props.state.followUps.filter((f) => f.status === "done").length,
	open: props.state.followUps.filter((f) => f.status === "open").length,
}));
const date = new Date().toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
const tint = computed(() => (mood.value.average !== null ? moodTint(mood.value.average) : "#f6f3ec"));
const reactions = (c: Card) => c.reactions.map((r) => `${r.emoji} ${r.count}`).join("  ");
</script>

<template>
	<div class="card" :style="{ '--tint': tint }">
		<header>
			<Mascot :mood="mood.average !== null ? Math.round(mood.average) : null" :size="64" />
			<div class="head-text">
				<h1>{{ state.title || "Retro" }}</h1>
				<p v-if="mood.average !== null">
					Team mood <strong>{{ mood.average.toFixed(1) }}</strong> / 5
					<span v-if="delta !== null" :class="delta > 0 ? 'up' : delta < 0 ? 'down' : ''">
						{{ delta > 0 ? "▲" : delta < 0 ? "▼" : "=" }} {{ Math.abs(delta).toFixed(1) }}
					</span>
					· {{ mood.rated }} rated
				</p>
			</div>
			<span class="date">{{ date }}</span>
		</header>

		<div class="cols">
			<section v-for="col in [{ key: 'well', label: 'Went well', cards: well }, { key: 'improve', label: 'To improve', cards: improve }]" :key="col.key" :class="col.key">
				<h2>{{ col.label }}</h2>
				<p v-if="!col.cards.length" class="none">Nothing here</p>
				<div v-for="c in col.cards" :key="c.id" class="note">
					<span class="text">{{ c.text }}</span>
					<span v-if="c.total" class="reacts">{{ reactions(c) }}</span>
				</div>
			</section>
		</div>

		<div class="bottom">
			<section class="actions">
				<h2>Action items</h2>
				<p v-if="!actions.length" class="none">None</p>
				<p v-for="c in actions" :key="c.id" class="action">☐ {{ c.text }}</p>
				<p v-if="moreActions > 0" class="none">+{{ moreActions }} more</p>
				<p v-if="state.followUps.length" class="last">Last sprint: {{ last.done }} done · {{ last.open }} carried over</p>
			</section>
			<img v-if="doodle" class="doodle" :src="doodle" alt="" />
		</div>

		<footer>made with <strong>retroo</strong></footer>
	</div>
</template>

<style scoped>
.card {
	width: 1200px;
	height: 675px;
	box-sizing: border-box;
	padding: 36px 44px 26px;
	display: flex;
	flex-direction: column;
	gap: 22px;
	font-family: ui-rounded, "SF Pro Rounded", system-ui, sans-serif;
	color: #2a2723;
	background: color-mix(in srgb, #f6f3ec 88%, var(--tint)) radial-gradient(color-mix(in srgb, #e2ddd0 75%, var(--tint)) 1.6px, transparent 1.6px) 0 0 / 26px 26px;
}
header {
	display: flex;
	align-items: center;
	gap: 18px;
}
.head-text {
	flex: 1;
	min-width: 0;
}
h1 {
	margin: 0;
	font-size: 36px;
	font-weight: 800;
	letter-spacing: -0.5px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
header p {
	margin: 4px 0 0;
	font-size: 19px;
	color: #5a554e;
}
header strong {
	color: #2a2723;
}
.up {
	color: #0f6e56;
	font-weight: 800;
}
.down {
	color: #c0392b;
	font-weight: 800;
}
.date {
	align-self: flex-start;
	font-size: 17px;
	font-weight: 700;
	color: #77716a;
}
.cols {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 26px;
}
h2 {
	margin: 0 0 10px;
	font-size: 18px;
	font-weight: 800;
}
.well h2 {
	color: #0f6e56;
}
.improve h2 {
	color: #993c1d;
}
.note {
	display: flex;
	align-items: flex-start;
	gap: 12px;
	margin-bottom: 9px;
	padding: 11px 14px;
	border-radius: 4px 4px 14px 4px;
	font-size: 17px;
	font-weight: 600;
	box-shadow: 0 6px 14px -8px rgba(60, 45, 20, 0.35);
}
.well .note {
	background: #d9f5e8;
	color: #04342c;
}
.improve .note {
	background: #ffe3d6;
	color: #4a1b0c;
}
.text {
	flex: 1;
	display: -webkit-box;
	-webkit-line-clamp: 2;
	-webkit-box-orient: vertical;
	overflow: hidden;
}
.reacts {
	flex-shrink: 0;
	white-space: nowrap;
	font-size: 15px;
	font-weight: 700;
}
.bottom {
	flex: 1;
	min-height: 0;
	display: flex;
	gap: 26px;
}
.actions {
	flex: 1;
	min-width: 0;
	padding: 14px 18px;
	border-radius: 14px;
	background: #e8e5ff;
	color: #26215c;
	overflow: hidden;
}
.actions h2 {
	color: #534ab7;
}
.action {
	margin: 0 0 5px;
	font-size: 16px;
	font-weight: 600;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
}
.last {
	margin: 8px 0 0;
	font-size: 14px;
	color: #534ab7;
}
.none {
	margin: 0;
	font-size: 15px;
	color: #77716a;
}
.doodle {
	height: 100%;
	aspect-ratio: 16 / 10;
	border-radius: 14px;
	background: #fffdf8;
	box-shadow: 0 6px 14px -8px rgba(60, 45, 20, 0.35);
}
footer {
	font-size: 15px;
	color: #77716a;
	text-align: right;
}
footer strong {
	color: #534ab7;
}
</style>
