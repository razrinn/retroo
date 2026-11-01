<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import PlazaScene, { type Shown } from "./PlazaScene.vue";
import { type PlazaPerson, REACTIONS, reducedMotion } from "./lib";

// The plaza: everyone's Stickie in a shared little office. Tap to walk there, tap an emoji to say it.
// Only tap targets travel over the socket; every browser animates the walk itself.
const props = defineProps<{ people: PlazaPerson[] }>();
const emit = defineEmits<{ send: [msg: object] }>();

// On phones the plaza starts folded so the cards stay near the top; tap the title to open it.
const folded = ref(matchMedia("(max-width: 760px)").matches);

const SPEED = 0.28; // plaza widths per second
const ASPECT = 10 / 16; // height / width, so walking up is as fast as walking across
type Spot = { x: number; y: number; tx: number; ty: number; left: boolean; still: number; bump: number };
const spots = ref<Record<string, Spot>>({});
const emotes = ref<Record<string, { emoji: string; n: number }>>({});
const now = ref(Date.now());
let myWalkAt = 0;

// Board states carry everyone's saved spot; they also catch up anyone whose walk we missed.
watch(
	() => props.people,
	(people) => {
		for (const p of people) {
			const s = spots.value[p.id];
			if (!s) spots.value[p.id] = { x: p.x, y: p.y, tx: p.x, ty: p.y, left: false, still: Date.now(), bump: 0 };
			else if (!(p.me && Date.now() - myWalkAt < 1500) && (s.tx !== p.x || s.ty !== p.y)) walkTo(p.id, p.x, p.y);
		}
	},
	{ immediate: true },
);

function walkTo(id: string, x: number, y: number) {
	const s = spots.value[id];
	if (!s) return;
	s.tx = x;
	s.ty = y;
	if (x !== s.x) s.left = x < s.x;
	if (reducedMotion()) Object.assign(s, { x, y, still: Date.now() });
	tick();
}

// Called by the board for plaza events from the server.
let emoteN = 0;
const emoteTimers: Record<string, number> = {};
function apply(data: { walk?: { id: string; x: number; y: number }; emote?: { id: string; emoji: string } }) {
	if (data.walk && !(data.walk.id === me.value?.id && Date.now() - myWalkAt < 1500)) walkTo(data.walk.id, data.walk.x, data.walk.y);
	if (data.emote) {
		const { id, emoji } = data.emote;
		emotes.value = { ...emotes.value, [id]: { emoji, n: ++emoteN } };
		clearTimeout(emoteTimers[id]);
		emoteTimers[id] = setTimeout(() => {
			const { [id]: _, ...rest } = emotes.value;
			emotes.value = rest;
		}, 3000);
	}
}

// One animation loop while anyone is walking; it stops when everyone has arrived.
let frame = 0;
let last = 0;
function tick() {
	if (frame) return;
	last = performance.now();
	frame = requestAnimationFrame(step);
}
function step(t: number) {
	const dt = Math.min(0.05, (t - last) / 1000);
	last = t;
	let moving = false;
	const all = Object.entries(spots.value);
	for (const [id, s] of all) {
		const dx = s.tx - s.x;
		const dy = (s.ty - s.y) * ASPECT;
		const d = Math.hypot(dx, dy);
		if (d < 0.002) {
			if (s.x !== s.tx || s.y !== s.ty) Object.assign(s, { x: s.tx, y: s.ty, still: Date.now() });
			continue;
		}
		moving = true;
		const k = Math.min(1, (SPEED * dt) / d);
		s.x += dx * k;
		s.y += (dy * k) / ASPECT;
		// Walking into someone gives them a little bump.
		for (const [other, o] of all) {
			if (other !== id && Date.now() - o.bump > 1000 && Math.hypot(o.x - s.x, (o.y - s.y) * ASPECT) < 0.04) o.bump = Date.now();
		}
	}
	frame = moving ? requestAnimationFrame(step) : 0;
}

const me = computed(() => props.people.find((p) => p.me));
const shown = computed<Shown[]>(() =>
	props.people.map((p) => {
		const s = spots.value[p.id];
		if (!s) return p;
		const walking = s.x !== s.tx || s.y !== s.ty;
		return {
			...p,
			x: s.x,
			y: s.y,
			left: s.left,
			walking,
			// Idle for a while: sit down.
			sitting: !walking && p.here && now.value - s.still > 8000,
			bump: now.value - s.bump < 400,
		};
	}),
);

// Feet stay inside the room with space for the name below and the bubble above.
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
function go(x: number, y: number) {
	const id = me.value?.id;
	if (!id) return;
	x = Math.round(clamp(x, 0.05, 0.95) * 1000) / 1000;
	y = Math.round(clamp(y, 0.28, 0.9) * 1000) / 1000;
	myWalkAt = Date.now();
	walkTo(id, x, y);
	emit("send", { type: "walk", x, y });
}
const floor = ref<HTMLElement>();
function onTap(e: PointerEvent) {
	const r = floor.value!.getBoundingClientRect();
	go((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
}
// Arrow keys walk a step at a time, for keyboards.
function onKey(e: KeyboardEvent) {
	const s = me.value && spots.value[me.value.id];
	const d = { ArrowLeft: [-0.06, 0], ArrowRight: [0.06, 0], ArrowUp: [0, -0.08], ArrowDown: [0, 0.08] }[e.key];
	if (!s || !d) return;
	e.preventDefault();
	go(s.tx + d[0], s.ty + d[1]);
}
function emote(emoji: string) {
	emit("send", { type: "emote", emoji });
}

// What the summary's team photo shows: everyone where they're heading, and any bubbles up right now.
function photo() {
	// It's shared with the team, so everyone shows by name (no "You").
	const people = props.people.map((p) => ({ ...p, me: false, x: spots.value[p.id]?.tx ?? p.x, y: spots.value[p.id]?.ty ?? p.y }));
	return { people, emotes: { ...emotes.value } };
}
defineExpose({ apply, photo });

let clock = 0;
onMounted(() => (clock = setInterval(() => (now.value = Date.now()), 1000)));
onUnmounted(() => {
	clearInterval(clock);
	cancelAnimationFrame(frame);
});
</script>

<template>
	<section class="panel plaza" aria-label="Plaza">
		<header>
			<h2>
				<button class="fold" :aria-expanded="!folded" @click="folded = !folded">Plaza <span aria-hidden="true">{{ folded ? "›" : "⌄" }}</span></button>
			</h2>
			<div v-if="!folded" class="row emotes" role="group" aria-label="Emote">
				<button v-for="e in REACTIONS" :key="e" class="ghost" :aria-label="`Emote ${e}`" @click="emote(e)">{{ e }}</button>
			</div>
		</header>
		<div
			v-show="!folded"
			ref="floor"
			class="floor"
			tabindex="0"
			aria-label="Plaza. Tap or use arrow keys to walk."
			@pointerdown="onTap"
			@keydown="onKey"
		>
			<PlazaScene :people="shown" :emotes="emotes" :size="44" />
			<p v-if="people.length < 2" class="hint muted">Tap anywhere to walk</p>
		</div>
	</section>
</template>

<style scoped>
header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px 10px;
	margin-bottom: 8px;
}
h2 {
	font-size: 15px;
	margin-right: auto;
}
.fold {
	all: unset;
	cursor: pointer;
	font: inherit;
	font-weight: 700;
}
.fold:focus-visible {
	outline: 2.5px solid var(--accent);
	outline-offset: 2px;
	border-radius: 4px;
}
.emotes {
	gap: 0;
}
.emotes button {
	width: 32px;
	height: 32px;
	padding: 0;
	font-size: 17px;
	line-height: 1;
}
.emotes button:hover {
	scale: 1.2;
}
.floor {
	position: relative;
	width: 100%;
	aspect-ratio: 16 / 10;
	overflow: hidden;
	border-radius: 10px;
	background: #efdfc3;
	touch-action: manipulation;
	cursor: pointer;
	user-select: none;
}
.hint {
	position: absolute;
	left: 0;
	right: 0;
	bottom: 10px;
	margin: 0;
	text-align: center;
	font-size: 13px;
	pointer-events: none;
}
</style>
