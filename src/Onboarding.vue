<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import Mascot from "./Mascot.vue";
import { useFocusTrap } from "./lib";

// First-time tours. "join" is for anyone opening a board; "run" is for whoever just created one.
// Each step has a small looping scene made from the app's own pieces (see the .scene-* styles).
const props = defineProps<{ tour: "join" | "run"; code: string; live?: boolean }>();
const emit = defineEmits<{ close: []; done: [] }>();

type Step = { title: string; body: string; scene: string };
const TOURS: Record<"join" | "run", Step[]> = {
	join: [
		{ scene: "write", title: "Write privately", body: "Add notes in any column. Nobody sees what you wrote until Reveal, and cards never show who wrote them." },
		{ scene: "reveal", title: "Reveal and react", body: "When the facilitator reveals, every card flips over. React with one emoji per card, comment, and drag similar cards together to group them." },
		{ scene: "carry", title: "Last sprint and action items", body: "Check off last sprint's items, and write this sprint's action items. Anything unfinished carries over next time." },
		{ scene: "fun", title: "Have some fun", body: "Rain emoji on everyone, doodle together while you wait. Stickie's face follows the room's mood." },
	],
	run: [
		{ scene: "share", title: "Share the link and PIN", body: "Send the link, then show the join PIN on screen (click it in the header). It changes every minute; once in, people stay in." },
		{ scene: "guide", title: "Guide the session", body: "Start a timer for writing, Reveal when everyone's ready (the button glows), then Present to go through cards one by one." },
		{ scene: "wrap", title: "Wrap up", body: "Pick next retro's MC with the crown button, then lock the board. The Summary is ready to paste into Slack, Confluence or Notion." },
	],
};
// Live boards show cards as they're written, so the first steps read differently there.
const LIVE: Record<string, Partial<Step>> = {
	write: { scene: "write-live", title: "Write anonymously", body: "Add notes in any column. Everyone sees them right away, but cards never show who wrote them." },
	reveal: { scene: "react", title: "React and discuss", body: "React with one emoji per card, comment to discuss, and drag similar cards together to group them. The most-reacted get presented first." },
	guide: { scene: "guide-live", body: "Start a timer for writing, give people a few minutes to read and react, then Present, most-reacted first." },
};
const steps = computed(() => TOURS[props.tour].map((s) => (props.live ? { ...s, ...LIVE[s.scene] } : s)));
const index = ref(0);
const step = computed(() => steps.value[index.value]);
const last = computed(() => index.value === steps.value.length - 1);

function next() {
	if (last.value) emit("done");
	else index.value++;
}
const back = () => (index.value = Math.max(0, index.value - 1));

const dialog = ref<HTMLElement>();
useFocusTrap(dialog);
function onKey(e: KeyboardEvent) {
	if (e.key === "Escape") emit("close");
	if (e.key === "ArrowRight") next();
	if (e.key === "ArrowLeft") back();
}
onMounted(() => addEventListener("keydown", onKey));
onUnmounted(() => removeEventListener("keydown", onKey));

const copied = ref(false);
async function copyLink() {
	await navigator.clipboard?.writeText(`${location.origin}/b/${props.code.replace("-", "")}`);
	copied.value = true;
	setTimeout(() => (copied.value = false), 1400);
}
</script>

<template>
	<div class="backdrop" @click.self="emit('close')">
		<div ref="dialog" class="sheet" role="dialog" aria-modal="true" :aria-label="tour === 'join' ? 'How retroo works' : 'Running a retro'">
			<button class="ghost skip" @click="emit('close')">Skip</button>

			<Transition name="scene" mode="out-in">
				<div :key="step.scene" class="scene" :class="`scene-${step.scene}`" aria-hidden="true">
					<!-- Write privately: notes land face-down while Stickie types. -->
					<template v-if="step.scene === 'write-live'">
						<div class="notes">
							<span class="note well land n1">Shipped on time</span>
							<span class="note improve land n2">Too many meetings</span>
							<span class="note well land n3">Great pairing</span>
						</div>
					</template>
					<template v-else-if="step.scene === 'write'">
						<div class="stickie-typing"><Mascot :size="54" /><span class="dots"><i /><i /><i /></span></div>
						<div class="notes">
							<span class="note back n1" /><span class="note back n2" /><span class="note back n3" />
						</div>
					</template>

					<!-- React (Live boards): the cards are already visible; reactions pop onto them. -->
					<template v-else-if="step.scene === 'react'">
						<div class="notes">
							<span class="note well">Shipped on time<b class="react r1">👍 2</b></span>
							<span class="note improve">Too many meetings<b class="react">🔥 3</b></span>
							<span class="note well">Great pairing<b class="react r2">❤️ 1</b></span>
						</div>
					</template>
					<!-- Reveal and react: the notes flip over and a reaction pops onto one. -->
					<template v-else-if="step.scene === 'reveal'">
						<div class="notes">
							<span class="note well flip f1">Shipped on time</span>
							<span class="note improve flip f2">Too many meetings<b class="react">🔥 3</b></span>
							<span class="note well flip f3">Great pairing</span>
						</div>
					</template>

					<!-- Last sprint: a tick draws itself, a dropped item gets struck through. -->
					<template v-else-if="step.scene === 'carry'">
						<ul class="list">
							<li><svg class="tick" viewBox="0 0 16 16"><path d="M3 8.5l3 3 7-7" /></svg><span>Fix flaky CI</span></li>
							<li><span class="box" /><span>Write onboarding doc</span><em>carried ×2</em></li>
							<li class="dropped"><span class="box" /><span class="strike">Move standup to async</span></li>
						</ul>
					</template>

					<!-- Fun: emoji float up and Stickie hops. -->
					<template v-else-if="step.scene === 'fun'">
						<div class="floaters"><i>🎉</i><i>🔥</i><i>❤️</i><i>🚀</i><i>😂</i></div>
						<Mascot class="hopper" :size="70" :mood="5" />
					</template>

					<!-- Share: the real board code with a copy button. -->
					<template v-else-if="step.scene === 'share'">
						<Mascot :size="54" />
						<button class="code mono" @click="copyLink">{{ copied ? "Link copied" : code }}</button>
						<p class="muted hint">Click to copy the link</p>
					</template>

					<!-- Guide (Live boards): timer, then Present glows, then Summary. -->
					<template v-else-if="step.scene === 'guide-live'">
						<div class="guide-row">
							<span class="ring"><svg viewBox="0 0 22 22"><circle cx="11" cy="11" r="8" class="track" /><circle cx="11" cy="11" r="8" class="fill" /></svg>4:59</span>
							<span class="fake primary glow">Present</span>
							<span class="fake">Summary</span>
						</div>
					</template>
					<!-- Guide: a timer ring drains, Reveal glows, Present follows. -->
					<template v-else-if="step.scene === 'guide'">
						<div class="guide-row">
							<span class="ring"><svg viewBox="0 0 22 22"><circle cx="11" cy="11" r="8" class="track" /><circle cx="11" cy="11" r="8" class="fill" /></svg>4:59</span>
							<span class="fake primary glow">Reveal</span>
							<span class="fake">Present</span>
						</div>
					</template>

					<!-- Wrap: lock, then a summary page writes itself. -->
					<template v-else-if="step.scene === 'wrap'">
						<div class="doc">
							<span class="lock-chip">Locked</span>
							<i class="line l1" /><i class="line l2" /><i class="line l3" /><i class="line l4" />
							<span class="fake primary small-fake">Copy as Markdown</span>
						</div>
					</template>
				</div>
			</Transition>

			<div class="copy" aria-live="polite">
				<h2>{{ step.title }}</h2>
				<p>{{ step.body }}</p>
			</div>

			<footer>
				<span class="dots-nav" role="tablist" :aria-label="`Step ${index + 1} of ${steps.length}`">
					<button
						v-for="(s, i) in steps"
						:key="s.scene"
						class="dot"
						:class="{ on: i === index }"
						role="tab"
						:aria-selected="i === index"
						:aria-label="`Step ${i + 1}: ${s.title}`"
						@click="index = i"
					/>
				</span>
				<span class="spacer" />
				<button v-if="index > 0" class="ghost" @click="back">Back</button>
				<button class="primary" @click="next">{{ last ? (tour === "join" ? "Start writing" : "Got it") : "Next" }}</button>
			</footer>
		</div>
	</div>
</template>

<style scoped>
.backdrop {
	position: fixed;
	inset: 0;
	z-index: 80;
	display: grid;
	place-items: center;
	padding: 16px;
	background: color-mix(in srgb, var(--text) 28%, transparent);
	backdrop-filter: blur(3px);
	animation: fade 0.2s ease-out;
}
@keyframes fade {
	from {
		opacity: 0;
	}
}
.sheet {
	position: relative;
	width: min(460px, 100%);
	padding: 20px 22px 18px;
	border-radius: 20px;
	background: var(--surface);
	box-shadow: 0 24px 60px -20px rgba(40, 30, 10, 0.45);
	animation: rise 0.35s cubic-bezier(0.3, 1.3, 0.5, 1);
}
@keyframes rise {
	from {
		opacity: 0;
		translate: 0 20px;
		scale: 0.97;
	}
}
.skip {
	position: absolute;
	top: 10px;
	right: 10px;
	font-size: 13px;
	color: var(--muted);
}
.copy h2 {
	font-size: 20px;
	margin-bottom: 6px;
}
.copy p {
	margin: 0;
	color: var(--muted);
	line-height: 1.5;
}
footer {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-top: 18px;
}
.dots-nav {
	display: flex;
	gap: 6px;
}
.dot {
	width: 8px;
	height: 8px;
	padding: 0;
	border: none;
	border-radius: 999px;
	background: var(--border);
	transition: width 0.25s, background 0.25s;
}
.dot.on {
	width: 22px;
	background: var(--accent);
}

/* ---- scenes ---- */
.scene {
	height: 170px;
	margin: 18px 0 16px;
	border-radius: 14px;
	background: var(--bg) radial-gradient(var(--dot) 1.2px, transparent 1.2px) 0 0 / 18px 18px;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 18px;
	overflow: hidden;
	position: relative;
}
.scene-enter-active,
.scene-leave-active {
	transition: opacity 0.18s, translate 0.18s;
}
.scene-enter-from {
	opacity: 0;
	translate: 16px 0;
}
.scene-leave-to {
	opacity: 0;
	translate: -16px 0;
}
.notes {
	display: flex;
	gap: 10px;
}
.note {
	position: relative;
	width: 92px;
	height: 72px;
	padding: 8px;
	border-radius: 3px 3px 12px 3px;
	font-size: 12px;
	font-weight: 700;
	line-height: 1.3;
	box-shadow: var(--shadow);
}
.note.land {
	animation: land 3.2s ease-out infinite both;
}
.note.back {
	background: repeating-linear-gradient(-45deg, var(--surface), var(--surface) 6px, var(--bg) 6px, var(--bg) 12px);
	border: 1.5px dashed var(--border);
	box-shadow: none;
	animation: land 3.2s ease-out infinite both;
}
.n1 {
	rotate: -3deg;
}
.n2 {
	rotate: 2deg;
	animation-delay: 0.4s !important;
}
.n3 {
	rotate: -1deg;
	animation-delay: 0.8s !important;
}
@keyframes land {
	0% {
		opacity: 0;
		translate: 0 -14px;
	}
	12%,
	88% {
		opacity: 1;
		translate: 0 0;
	}
	100% {
		opacity: 0;
	}
}
.stickie-typing {
	display: grid;
	justify-items: center;
	gap: 4px;
}
.dots {
	display: flex;
	gap: 4px;
}
.dots i {
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: var(--muted);
	animation: dot 1.2s ease-in-out infinite;
}
.dots i:nth-child(2) {
	animation-delay: 0.15s;
}
.dots i:nth-child(3) {
	animation-delay: 0.3s;
}
@keyframes dot {
	30% {
		translate: 0 -5px;
		opacity: 1;
	}
	0%,
	60%,
	100% {
		opacity: 0.4;
	}
}
.note.well {
	background: var(--note-well);
	color: var(--note-well-ink);
}
.note.improve {
	background: var(--note-improve);
	color: var(--note-improve-ink);
}
.flip {
	animation: flip 3.4s ease-in-out infinite both;
}
.f2 {
	animation-delay: 0.15s;
}
.f3 {
	animation-delay: 0.3s;
}
@keyframes flip {
	0%,
	12% {
		transform: perspective(500px) rotateY(90deg);
	}
	30%,
	100% {
		transform: perspective(500px) rotateY(0deg);
	}
}
.r1 {
	animation-delay: 0.6s;
}
.r2 {
	animation-delay: 1.1s;
}
.react {
	position: absolute;
	right: 6px;
	bottom: 6px;
	padding: 1px 7px;
	border-radius: 999px;
	font-size: 11px;
	color: var(--surface);
	background: var(--note-improve-tag);
	animation: react-pop 3.4s ease-out infinite both;
}
@keyframes react-pop {
	0%,
	45% {
		scale: 0;
	}
	55% {
		scale: 1.3;
	}
	65%,
	100% {
		scale: 1;
	}
}
.list {
	list-style: none;
	margin: 0;
	padding: 14px 16px;
	width: 270px;
	display: grid;
	gap: 10px;
	background: var(--surface);
	border-radius: 12px;
	box-shadow: var(--shadow);
	font-size: 13px;
	font-weight: 600;
}
.list li {
	display: flex;
	align-items: center;
	gap: 8px;
}
.list em {
	margin-left: auto;
	font-style: normal;
	font-size: 11px;
	font-weight: 700;
	color: var(--warn);
	background: color-mix(in srgb, var(--warn) 14%, transparent);
	padding: 1px 7px;
	border-radius: 999px;
	animation: wiggle 3s ease-in-out infinite;
}
@keyframes wiggle {
	70%,
	80% {
		rotate: 0deg;
	}
	75% {
		rotate: -7deg;
	}
	85% {
		rotate: 7deg;
	}
}
.box {
	width: 14px;
	height: 14px;
	border: 1.5px solid var(--border);
	border-radius: 4px;
	flex-shrink: 0;
}
.tick {
	width: 16px;
	height: 16px;
	flex-shrink: 0;
	fill: none;
	stroke: var(--ok);
	stroke-width: 2.5;
	stroke-linecap: round;
	stroke-linejoin: round;
	stroke-dasharray: 16;
	animation: draw 3s ease-out infinite both;
}
@keyframes draw {
	0%,
	15% {
		stroke-dashoffset: 16;
	}
	35%,
	100% {
		stroke-dashoffset: 0;
	}
}
.dropped {
	color: var(--muted);
}
.strike {
	background: linear-gradient(currentColor, currentColor) left 55% / 100% 1.5px no-repeat;
	animation: strike 3s ease-out infinite both;
}
@keyframes strike {
	0%,
	45% {
		background-size: 0 1.5px;
	}
	65%,
	100% {
		background-size: 100% 1.5px;
	}
}
.floaters {
	position: absolute;
	inset: 0;
}
.floaters i {
	position: absolute;
	bottom: 10px;
	font-style: normal;
	font-size: 26px;
	animation: up 2.8s ease-out infinite both;
}
.floaters i:nth-child(1) {
	left: 14%;
}
.floaters i:nth-child(2) {
	left: 30%;
	animation-delay: 0.5s;
}
.floaters i:nth-child(3) {
	left: 66%;
	animation-delay: 0.9s;
}
.floaters i:nth-child(4) {
	left: 80%;
	animation-delay: 1.4s;
}
.floaters i:nth-child(5) {
	left: 48%;
	animation-delay: 1.9s;
}
@keyframes up {
	0% {
		translate: 0 30px;
		opacity: 0;
	}
	20% {
		opacity: 1;
	}
	100% {
		translate: 0 -150px;
		opacity: 0;
	}
}
.hopper {
	animation: hop-loop 2.4s cubic-bezier(0.3, 1.6, 0.5, 1) infinite;
}
@keyframes hop-loop {
	0%,
	60%,
	100% {
		translate: 0 0;
	}
	75% {
		translate: 0 -24px;
		rotate: -6deg;
	}
}
.scene-share {
	flex-direction: column;
	gap: 8px;
}
.code {
	font-size: 22px;
	font-weight: 800;
	padding: 6px 18px;
	border-radius: 999px;
	animation: nudge 2.4s ease-in-out infinite;
}
@keyframes nudge {
	0%,
	70%,
	100% {
		scale: 1;
	}
	80% {
		scale: 1.06;
	}
}
.hint {
	margin: 0;
	font-size: 12px;
}
.guide-row {
	display: flex;
	align-items: center;
	gap: 10px;
}
.ring {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 4px 10px 4px 6px;
	border: 1.5px solid var(--border);
	border-radius: 999px;
	background: var(--surface);
	font-family: ui-monospace, monospace;
	font-weight: 700;
	font-size: 13px;
}
.ring svg {
	width: 20px;
	height: 20px;
	rotate: -90deg;
}
.ring circle {
	fill: none;
	stroke-width: 3;
}
.ring .track {
	stroke: var(--border);
}
.ring .fill {
	stroke: var(--ok);
	stroke-dasharray: 50.3;
	animation: drain 4s linear infinite;
}
@keyframes drain {
	to {
		stroke-dashoffset: 50.3;
	}
}
.fake {
	display: inline-block;
	padding: 7px 14px;
	border: 1.5px solid var(--border);
	border-radius: 10px;
	background: var(--surface);
	font-weight: 700;
	font-size: 14px;
}
.fake.primary {
	background: var(--accent);
	border-color: var(--accent);
	color: var(--surface);
}
.glow {
	animation: glow 2s ease-in-out infinite;
}
@keyframes glow {
	50% {
		box-shadow: 0 0 0 5px color-mix(in srgb, var(--accent) 22%, transparent), 0 0 18px 2px color-mix(in srgb, var(--accent) 35%, transparent);
	}
}
.doc {
	position: relative;
	width: 230px;
	padding: 16px;
	display: grid;
	gap: 8px;
	background: var(--surface);
	border-radius: 12px;
	box-shadow: var(--shadow);
}
.lock-chip {
	justify-self: start;
	font-size: 11px;
	font-weight: 800;
	color: var(--muted);
	border: 1.5px solid var(--border);
	border-radius: 999px;
	padding: 1px 8px;
}
.line {
	height: 8px;
	border-radius: 4px;
	background: var(--border);
	transform-origin: left;
	animation: write 3.6s ease-out infinite both;
}
.l1 {
	width: 70%;
}
.l2 {
	width: 92%;
	animation-delay: 0.25s;
}
.l3 {
	width: 60%;
	animation-delay: 0.5s;
}
.l4 {
	width: 80%;
	animation-delay: 0.75s;
}
@keyframes write {
	0%,
	10% {
		scale: 0 1;
	}
	30%,
	100% {
		scale: 1 1;
	}
}
.small-fake {
	justify-self: end;
	padding: 4px 10px;
	font-size: 12px;
}
@media (max-width: 520px) {
	.backdrop {
		align-items: end;
		padding: 0;
	}
	.sheet {
		width: 100%;
		border-radius: 20px 20px 0 0;
		padding-bottom: 24px;
	}
	.scene {
		gap: 10px;
	}
	.notes {
		gap: 6px;
	}
	.note {
		width: 72px;
		height: 64px;
		font-size: 11px;
	}
}
</style>
