<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import EmojiRain from "./EmojiRain.vue";
import NoteCard from "./NoteCard.vue";
import Presenter from "./Presenter.vue";
import Timer from "./Timer.vue";
import { type BoardState, type Card, COLS, MOODS, confetti, formatCode, hash, load, post, save } from "./lib";

const props = defineProps<{ code: string }>();
document.title = `retro · ${formatCode(props.code)}`;

let clientId = load("clientId");
if (!clientId) save("clientId", (clientId = crypto.randomUUID()));
const name = ref(load("name"));
const nameDraft = ref(name.value);
const state = ref<BoardState | null>(null);
const status = ref<"connecting" | "open" | "missing">("connecting");
const drafts = ref<Record<string, string>>({});
const error = ref("");
const showLock = ref(false);
const lockPassword = ref("");
const presenting = ref(false);
const copied = ref(false);
const offset = ref(0);
const rain = ref<InstanceType<typeof EmojiRain>>();

// Animation bookkeeping: cards that just appeared drop in, cards that just got revealed flip over.
const fresh = ref(new Set<string>());
const flipping = ref(new Map<string, number>());

let ws: WebSocket | null = null;
let everOpened = false;
let stopped = false;

function onState(next: BoardState) {
	offset.value = next.now - Date.now();
	const prev = state.value;
	if (prev) {
		const known = new Set(prev.cards.map((c) => c.id));
		const added = next.cards.filter((c) => !known.has(c.id)).map((c) => c.id);
		if (added.length) {
			fresh.value = new Set(added);
			setTimeout(() => (fresh.value = new Set()), 600);
		}
		if (prev.phase === "writing" && next.phase !== "writing") {
			const wasHidden = prev.cards.filter((c) => c.text === null).map((c) => c.id);
			flipping.value = new Map(wasHidden.map((id, i) => [id, i]));
			setTimeout(() => (flipping.value = new Map()), 600 + wasHidden.length * 90);
		}
		const open = (s: BoardState) => s.followUps.filter((f) => f.status === "open").length;
		if (open(prev) > 0 && open(next) === 0) confetti();
	}
	state.value = next;
}

function connect() {
	const proto = location.protocol === "https:" ? "wss" : "ws";
	const q = new URLSearchParams({ client: clientId, name: name.value });
	ws = new WebSocket(`${proto}://${location.host}/api/boards/${props.code}/ws?${q}`);
	ws.onopen = () => {
		everOpened = true;
		status.value = "open";
	};
	ws.onmessage = (e) => {
		const data = JSON.parse(e.data);
		if (data.burst) rain.value?.drop(data.burst, data.name);
		else onState(data);
	};
	ws.onclose = () => {
		if (stopped) return;
		// A board that never opened is almost always a wrong code; otherwise it's a dropped connection.
		if (!everOpened) return (status.value = "missing");
		status.value = "connecting";
		setTimeout(connect, 1000);
	};
}
onUnmounted(() => {
	stopped = true;
	ws?.close();
});
if (name.value) connect();

const send = (msg: object) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg));

function setName() {
	const n = nameDraft.value.trim().slice(0, 40);
	if (!n) return;
	const first = !name.value;
	name.value = n;
	save("name", n);
	if (first) connect();
	else send({ type: "name", name: n });
}

function add(col: string) {
	const text = drafts.value[col]?.trim();
	if (!text) return;
	send({ type: "add", col, text });
	drafts.value[col] = "";
}
function remove(card: Card) {
	if (confirm("Delete this card?")) send({ type: "delete", id: card.id });
}
function reveal() {
	if (confirm("Reveal all cards for everyone? This can't be undone.")) send({ type: "reveal" });
}
async function setLocked(locked: boolean) {
	error.value = "";
	try {
		await post(`/api/boards/${props.code}/lock`, { password: lockPassword.value, locked });
		showLock.value = false;
		lockPassword.value = "";
	} catch (e) {
		error.value = (e as Error).message;
	}
}
async function copyCode() {
	await navigator.clipboard?.writeText(props.code);
	copied.value = true;
	setTimeout(() => (copied.value = false), 1200);
}

const cardsIn = (col: string) => state.value?.cards.filter((c) => c.col === col) ?? [];
const needsMood = computed(() => state.value && state.value.mood.mine === null && state.value.phase !== "locked");
const moodMax = computed(() => Math.max(1, ...(state.value?.mood.counts ?? [])));
const moodTrend = computed(() => {
	const m = state.value?.mood;
	if (!m || m.average === null || m.previous === null) return "";
	return m.average > m.previous ? "📈" : m.average < m.previous ? "📉" : "➡️";
});
const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const bubble = (n: string) => ({ background: `hsl(${hash(n) % 360} 65% 82%)`, color: `hsl(${hash(n) % 360} 55% 22%)` });
const phaseInfo = computed(
	() =>
		({
			writing: { label: "Writing", hint: "cards are hidden", emoji: "🙈" },
			revealed: { label: "Revealed", hint: "vote on what matters", emoji: "👀" },
			locked: { label: "Locked", hint: "read-only", emoji: "🔒" },
		})[state.value?.phase ?? "writing"],
);
</script>

<template>
	<form v-if="!name" class="gate panel" @submit.prevent="setName">
		<p class="emoji" aria-hidden="true">👋</p>
		<h1>Who's joining?</h1>
		<input id="name" v-model="nameDraft" maxlength="40" placeholder="Your name" aria-label="Your name" required autofocus />
		<button class="primary">Join board</button>
	</form>

	<div v-else-if="status === 'missing'" class="gate panel">
		<p class="emoji" aria-hidden="true">🤷</p>
		<h1>No board here</h1>
		<p class="muted">Nothing matches <span class="mono">{{ formatCode(code) }}</span>. Check the code with whoever shared it.</p>
		<a href="/">Back to home</a>
	</div>

	<p v-else-if="!state" class="gate muted">Connecting…</p>

	<div v-else-if="needsMood" class="gate panel">
		<p class="emoji" aria-hidden="true">🌡️</p>
		<h1>How was the sprint, {{ name }}?</h1>
		<p class="muted">Anonymous. Everyone sees the results after reveal.</p>
		<div class="faces" role="group" aria-label="Rate the sprint">
			<button v-for="(m, i) in MOODS" :key="i" class="face" :aria-label="`${i + 1} of 5`" @click="send({ type: 'mood', value: i + 1 })">{{ m }}</button>
		</div>
	</div>

	<main v-else>
		<header>
			<a href="/" class="brand">retro</a>
			<h1 v-if="state.title">{{ state.title }}</h1>
			<button class="chip mono" :title="copied ? 'Copied' : 'Copy code'" @click="copyCode">{{ copied ? "Copied ✓" : formatCode(code) }}</button>
			<span class="phase" :class="state.phase">{{ phaseInfo.emoji }} {{ phaseInfo.label }} <span class="hint">· {{ phaseInfo.hint }}</span></span>
			<span v-if="status !== 'open'" class="muted">Reconnecting…</span>
			<span class="spacer" />
			<div class="people" :aria-label="`Online: ${state.online.join(', ')}`">
				<span v-for="p in state.online.slice(0, 6)" :key="p" class="bubble" :style="bubble(p)" :title="p">{{ initials(p) }}</span>
				<span v-if="state.online.length > 6" class="bubble more">+{{ state.online.length - 6 }}</span>
			</div>
			<Timer :end="state.timerEnd" :offset="offset" @set="(seconds) => send({ type: 'timer', seconds })" />
			<button v-if="state.phase !== 'writing'" @click="presenting = true">🎤 Present</button>
			<button v-if="state.phase === 'writing'" class="primary" @click="reveal">Reveal 🃏</button>
			<button v-if="!showLock" class="ghost" @click="showLock = true">{{ state.phase === "locked" ? "🔓 Unlock" : "🔒 Lock" }}</button>
			<form v-else class="row lock" @submit.prevent="setLocked(state.phase !== 'locked')">
				<input v-model="lockPassword" type="password" placeholder="Password" aria-label="Password" required />
				<button>{{ state.phase === "locked" ? "Unlock" : "Lock" }}</button>
				<button type="button" class="ghost" @click="showLock = false">Cancel</button>
			</form>
		</header>
		<p v-if="error" class="error" role="alert">{{ error }}</p>

		<div class="top">
			<section v-if="state.followUps.length" class="panel">
				<h2>🔁 From last sprint<span v-if="state.previousTitle" class="muted"> · {{ state.previousTitle }}</span></h2>
				<ul class="followups">
					<li v-for="f in state.followUps" :key="f.id" :class="f.status">
						<span class="mark" aria-hidden="true">{{ { open: "⬜", done: "✅", dropped: "🗑️" }[f.status] }}</span>
						<span class="text">{{ f.text }}</span>
						<span v-if="f.carried > 1" class="badge">carried ×{{ f.carried }}</span>
						<template v-if="state.phase !== 'locked'">
							<template v-if="f.status === 'open'">
								<button class="ghost small" @click="send({ type: 'followup', id: f.id, status: 'done' })">Done</button>
								<button class="ghost small" @click="send({ type: 'followup', id: f.id, status: 'dropped' })">Drop</button>
							</template>
							<button v-else class="ghost small" @click="send({ type: 'followup', id: f.id, status: 'open' })">Undo</button>
						</template>
					</li>
				</ul>
			</section>

			<section class="panel mood">
				<h2>🌡️ Team mood</h2>
				<div class="bars" role="group" aria-label="Your rating">
					<div v-for="(m, i) in MOODS" :key="i" class="bar">
						<template v-if="state.mood.counts">
							<span class="track"><span class="fill" :style="{ height: `${(state.mood.counts[i] / moodMax) * 100}%` }" /></span>
							<span class="n">{{ state.mood.counts[i] }}</span>
						</template>
						<button
							class="face"
							:class="{ picked: state.mood.mine === i + 1 }"
							:aria-pressed="state.mood.mine === i + 1"
							:aria-label="`${i + 1} of 5${state.mood.counts ? `, ${state.mood.counts[i]} people` : ''}`"
							:disabled="state.phase === 'locked'"
							@click="send({ type: 'mood', value: i + 1 })"
						>
							{{ m }}
						</button>
					</div>
				</div>
				<p v-if="!state.mood.counts" class="muted small-text">
					{{ state.mood.rated }} of {{ state.mood.people }} rated · results show after reveal
				</p>
				<p v-else class="small-text">
					<strong>{{ state.mood.average ?? "–" }}</strong> average
					<template v-if="state.mood.previous !== null"> · last sprint {{ state.mood.previous }} {{ moodTrend }}</template>
				</p>
			</section>
		</div>

		<div class="cols">
			<section v-for="col in COLS" :key="col.key" class="col" :class="`col-${col.key}`">
				<h2>
					<span aria-hidden="true">{{ col.icon }}</span> {{ col.label }}
					<span class="count">{{ cardsIn(col.key).length }}</span>
				</h2>
				<NoteCard
					v-for="card in cardsIn(col.key)"
					:key="card.id"
					:card="card"
					:phase="state.phase"
					:fresh="fresh.has(card.id)"
					:flip-index="flipping.get(card.id) ?? null"
					@react="(emoji) => send({ type: 'react', id: card.id, emoji })"
					@comment="(text) => send({ type: 'comment', id: card.id, text })"
					@uncomment="(id) => send({ type: 'uncomment', id })"
					@edit="(text) => send({ type: 'edit', id: card.id, text })"
					@remove="remove(card)"
				/>
				<form v-if="state.phase !== 'locked'" class="add" @submit.prevent="add(col.key)">
					<input v-model="drafts[col.key]" maxlength="500" placeholder="+ Add a note" :aria-label="`Add a note to ${col.label}`" />
				</form>
			</section>
		</div>

		<p class="foot muted">
			You're {{ name }} ·
			<a href="#" @click.prevent="nameDraft = name; name = ''">change name</a>
		</p>
	</main>

	<EmojiRain v-if="state && !needsMood" ref="rain" @send="(emoji) => send({ type: 'burst', emoji })" />
	<Presenter v-if="presenting && state" :cards="state.cards" @close="presenting = false" @add-action="(text) => send({ type: 'add', col: 'action', text })" />
</template>

<style scoped>
.gate {
	max-width: 420px;
	margin: 12vh auto 0;
	display: grid;
	gap: 12px;
	text-align: center;
}
.gate h1 {
	font-size: 24px;
}
.gate p {
	margin: 0;
}
.emoji {
	font-size: 44px;
}
.faces {
	display: flex;
	justify-content: center;
	gap: 8px;
}
.face {
	font-size: 34px;
	padding: 8px;
	border-radius: 16px;
	background: transparent;
	border-color: transparent;
	transition: scale 0.15s, background 0.15s;
}
.face:hover:not(:disabled) {
	scale: 1.2;
	background: var(--accent-soft);
}
.bars .face {
	font-size: 22px;
	padding: 2px 6px;
	opacity: 0.45;
}
.bars .face.picked {
	opacity: 1;
	background: var(--accent-soft);
	scale: 1.1;
}
main {
	max-width: 1280px;
	margin: 0 auto;
	padding: 16px;
}
header {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	align-items: center;
	margin-bottom: 16px;
}
.brand {
	font-weight: 800;
	font-size: 20px;
	color: var(--text);
	text-decoration: none;
	letter-spacing: -0.5px;
}
header h1 {
	font-size: 20px;
}
.chip {
	border-radius: 999px;
	padding: 2px 12px;
	font-size: 13px;
}
.phase {
	font-size: 13px;
	font-weight: 700;
	padding: 3px 12px;
	border-radius: 999px;
	background: var(--surface);
	border: 1.5px solid var(--border);
}
.phase.writing {
	color: var(--warn);
}
.phase.revealed {
	color: var(--ok);
}
.phase .hint {
	font-weight: 500;
	color: var(--muted);
}
.people {
	display: flex;
}
.bubble {
	width: 30px;
	height: 30px;
	border-radius: 50%;
	display: grid;
	place-items: center;
	font-size: 12px;
	font-weight: 800;
	border: 2px solid var(--bg);
	margin-left: -8px;
}
.bubble.more {
	background: var(--surface);
	color: var(--muted);
}
.lock input {
	width: 170px;
}
.top {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
	gap: 16px;
	margin-bottom: 22px;
}
.top h2 {
	font-size: 15px;
	margin-bottom: 8px;
}
.followups {
	list-style: none;
	margin: 0;
	padding: 0;
}
.followups li {
	display: flex;
	align-items: center;
	gap: 8px;
	padding: 4px 0;
}
.followups .text {
	flex: 1;
	overflow-wrap: anywhere;
}
.followups .done .text,
.followups .dropped .text {
	color: var(--muted);
}
.followups .dropped .text {
	text-decoration: line-through;
}
.badge {
	font-size: 12px;
	font-weight: 700;
	color: var(--warn);
	background: color-mix(in srgb, var(--warn) 14%, transparent);
	border-radius: 999px;
	padding: 1px 9px;
}
.small-text {
	font-size: 13px;
	margin: 6px 0 0;
}
.bars {
	display: flex;
	align-items: flex-end;
	gap: 4px;
}
.bar {
	width: 40px;
	display: grid;
	justify-items: center;
	gap: 2px;
}
.bar .track {
	height: 44px;
	width: 26px;
	display: flex;
	align-items: flex-end;
}
.bar .fill {
	width: 100%;
	min-height: 3px;
	background: var(--accent);
	border-radius: 6px 6px 2px 2px;
	transition: height 0.4s ease-out;
}
.bar .n {
	font-size: 12px;
	font-weight: 800;
}

.cols {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
	gap: 22px;
}
.col h2 {
	font-size: 16px;
	margin-bottom: 12px;
	display: flex;
	align-items: center;
	gap: 6px;
}
.col h2 .count {
	font-size: 12px;
	color: var(--muted);
	background: var(--surface);
	border: 1.5px solid var(--border);
	border-radius: 999px;
	padding: 0 8px;
}
.col-well h2 {
	color: var(--note-well-tag);
}
.col-improve h2 {
	color: var(--note-improve-tag);
}
.col-action h2 {
	color: var(--note-action-tag);
}
.add input {
	border-style: dashed;
	background: transparent;
	border-radius: 4px 4px 14px 4px;
	padding: 10px 14px;
}
.add input:focus {
	border-style: solid;
	background: var(--surface);
}
.foot {
	margin-top: 32px;
	font-size: 13px;
	text-align: center;
}
</style>
