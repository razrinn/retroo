<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";
import Doodle from "./Doodle.vue";
import EmojiRain from "./EmojiRain.vue";
import Mascot from "./Mascot.vue";
import NoteCard from "./NoteCard.vue";
import Presenter from "./Presenter.vue";
import Timer from "./Timer.vue";
import { demoSocket, resetDemo } from "./demo";
import { type BoardState, type Card, COLS, GITHUB_URL, MOODS, confetti, formatCode, hash, load, post, save } from "./lib";

// `demo` swaps the real WebSocket for the in-browser stand-in from demo.ts (the /demo page).
const props = defineProps<{ code: string; demo?: boolean }>();
document.title = props.demo ? "retroo · Demo" : `retroo · ${formatCode(props.code)}`;

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
const doodle = ref<InstanceType<typeof Doodle>>();

// Animation bookkeeping: cards that just appeared drop in, cards that just got revealed flip over.
const fresh = ref(new Set<string>());
const flipping = ref(new Map<string, number>());

let ws: { readyState: number; send(data: string): void; close(): void } | null = null;
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

function onOpen() {
	everOpened = true;
	status.value = "open";
}
function onMessage(data: any) {
	// Full board states carry a phase; emoji rain and doodle strokes are small events of their own.
	if ("phase" in data) onState(data);
	else if (data.burst) rain.value?.drop(data.burst, data.name);
	else doodle.value?.apply(data);
}

function connect() {
	if (props.demo) {
		ws = demoSocket(clientId, name.value, { open: onOpen, message: onMessage });
		return;
	}
	const proto = location.protocol === "https:" ? "wss" : "ws";
	const q = new URLSearchParams({ client: clientId, name: name.value });
	const socket = new WebSocket(`${proto}://${location.host}/api/boards/${props.code}/ws?${q}`);
	ws = socket;
	socket.onopen = onOpen;
	socket.onmessage = (e) => onMessage(JSON.parse(e.data));
	socket.onclose = () => {
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
	if (props.demo) return send({ type: "lock", locked });
	try {
		await post(`/api/boards/${props.code}/lock`, { password: lockPassword.value, locked });
		showLock.value = false;
		lockPassword.value = "";
	} catch (e) {
		error.value = (e as Error).message;
	}
}
function startOver() {
	if (!confirm("Reset the demo board to its starting cards?")) return;
	resetDemo();
	location.reload();
}
async function copyCode() {
	await navigator.clipboard?.writeText(props.code);
	copied.value = true;
	setTimeout(() => (copied.value = false), 1200);
}

const cardsIn = (col: string) => state.value?.cards.filter((c) => c.col === col) ?? [];
const needsMood = computed(() => state.value && state.value.mood.mine === null && state.value.phase !== "locked");
const moodMax = computed(() => Math.max(1, ...(state.value?.mood.counts ?? [])));
// Change from last sprint's average, e.g. -2 or +0.4; null when there's nothing to compare.
const moodDelta = computed(() => {
	const m = state.value?.mood;
	if (!m || m.average === null || m.previous === null) return null;
	return Math.round((m.average - m.previous) * 10) / 10;
});
const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const bubble = (n: string) => ({ background: `hsl(${hash(n) % 360} 65% 82%)`, color: `hsl(${hash(n) % 360} 55% 22%)` });
const phaseLabel = computed(() => ({ writing: "Writing", revealed: "Revealed", locked: "Locked" })[state.value?.phase ?? "writing"]);
</script>

<template>
	<form v-if="!name" class="gate panel" @submit.prevent="setName">
		<Mascot :size="64" class="gate-mascot" />
		<h1>What's your name?</h1>
		<input id="name" v-model="nameDraft" maxlength="40" placeholder="Your name" aria-label="Your name" required autofocus />
		<button class="primary">Join board</button>
	</form>

	<div v-else-if="status === 'missing'" class="gate panel">
		<Mascot :size="64" face="confused" class="gate-mascot" />
		<h1>Board not found</h1>
		<p class="muted">There's no board with code <span class="mono">{{ formatCode(code) }}</span>.</p>
		<a href="/">Back to home</a>
	</div>

	<p v-else-if="!state" class="gate muted">Connecting…</p>

	<div v-else-if="needsMood" class="gate panel">
		<Mascot :size="64" class="gate-mascot" />
		<h1>How was the sprint?</h1>
		<p class="muted">Your rating is anonymous.</p>
		<div class="faces" role="group" aria-label="Rate the sprint">
			<button v-for="(_, i) in MOODS" :key="i" class="face" :aria-label="`${i + 1} of 5`" @click="send({ type: 'mood', value: i + 1 })">
				<Mascot :mood="i + 1" :size="52" />
			</button>
		</div>
	</div>

	<main v-else>
		<header>
			<a href="/" class="brand"><Mascot :size="28" /> retroo</a>
			<h1 v-if="state.title">{{ state.title }}</h1>
			<button v-if="!demo" class="chip mono" :title="copied ? 'Copied' : 'Copy code'" @click="copyCode">{{ copied ? "Copied" : formatCode(code) }}</button>
			<span class="phase" :class="state.phase">{{ phaseLabel }}</span>
			<span v-if="status !== 'open'" class="muted">Reconnecting…</span>
			<span class="spacer" />
			<div class="people" :aria-label="`Online: ${state.online.join(', ')}`">
				<span v-for="p in state.online.slice(0, 6)" :key="p" class="bubble" :style="bubble(p)" :title="p">{{ initials(p) }}</span>
				<span v-if="state.online.length > 6" class="bubble more">+{{ state.online.length - 6 }}</span>
			</div>
			<Timer :end="state.timerEnd" :offset="offset" @set="(seconds) => send({ type: 'timer', seconds })" />
			<button v-if="state.phase !== 'writing'" @click="presenting = true">Present</button>
			<button v-if="state.phase === 'writing'" class="primary" @click="reveal">Reveal</button>
			<button v-if="demo" class="ghost" @click="setLocked(state.phase !== 'locked')">{{ state.phase === "locked" ? "Unlock" : "Lock" }}</button>
			<button v-else-if="!showLock" class="ghost" @click="showLock = true">{{ state.phase === "locked" ? "Unlock" : "Lock" }}</button>
			<form v-else class="row lock" @submit.prevent="setLocked(state.phase !== 'locked')">
				<input v-model="lockPassword" type="password" placeholder="Password" aria-label="Password" required />
				<button>{{ state.phase === "locked" ? "Unlock" : "Lock" }}</button>
				<button type="button" class="ghost" @click="showLock = false">Cancel</button>
			</form>
		</header>
		<div v-if="demo" class="demo-banner" role="note">
			<span><strong>Demo board.</strong> Dina, Budi and Sari are made up, and everything is saved in this browser only. Try writing a card, then Reveal.</span>
			<span class="spacer" />
			<button class="small" @click="startOver">Reset demo</button>
			<a href="/" class="small">Back to home</a>
		</div>
		<p v-if="error" class="error" role="alert">{{ error }}</p>

		<div class="top">
			<div class="side">
				<section class="panel mood">
					<div class="mood-head">
						<h2>Team mood</h2>
						<span v-if="state.mood.average === null" class="stat muted" title="Results show after reveal">
							{{ state.mood.rated }}/{{ state.mood.people }} rated
						</span>
						<span v-else class="stat" :title="`${state.mood.rated} rated${state.mood.previous !== null ? ` · last sprint ${state.mood.previous}` : ''}`">
							<strong>{{ state.mood.average.toFixed(1) }}</strong>
							<span
								v-if="moodDelta !== null"
								class="delta"
								:class="moodDelta > 0 ? 'up' : moodDelta < 0 ? 'down' : 'same'"
								:aria-label="`${moodDelta > 0 ? 'up' : moodDelta < 0 ? 'down' : 'no change'} from last sprint`"
							>
								{{ moodDelta > 0 ? "▲" : moodDelta < 0 ? "▼" : "=" }} {{ moodDelta === 0 ? "" : Math.abs(moodDelta).toFixed(1) }}
							</span>
							<span class="muted">{{ state.mood.rated }} rated</span>
						</span>
					</div>
					<div class="bars" role="group" aria-label="Your rating">
						<div v-for="(_, i) in MOODS" :key="i" class="bar">
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
								<Mascot :mood="i + 1" :size="36" />
							</button>
						</div>
					</div>
				</section>
				<section v-if="state.followUps.length" class="panel followups-panel">
					<h2>Last sprint<span v-if="state.previousTitle" class="muted"> · {{ state.previousTitle }}</span></h2>
					<ul class="followups">
						<li v-for="f in state.followUps" :key="f.id" :class="f.status">
							<span class="text">{{ f.text }}</span>
							<span v-if="f.carried > 1" class="badge">carried ×{{ f.carried }}</span>
							<template v-if="state.phase !== 'locked'">
								<template v-if="f.status === 'open'">
									<button class="act done" aria-label="Mark done" title="Done" @click="send({ type: 'followup', id: f.id, status: 'done' })">✓</button>
									<button class="act drop" aria-label="Drop" title="Drop" @click="send({ type: 'followup', id: f.id, status: 'dropped' })">✕</button>
								</template>
								<button v-else class="act undo" aria-label="Undo" title="Undo" @click="send({ type: 'followup', id: f.id, status: 'open' })">↩</button>
							</template>
						</li>
					</ul>
				</section>
			</div>

			<Doodle ref="doodle" :locked="state.phase === 'locked'" @send="send" />
		</div>

		<div class="cols">
			<section v-for="col in COLS" :key="col.key" class="col" :class="`col-${col.key}`">
				<h2>
					{{ col.label }}
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
			·
			<a :href="GITHUB_URL" target="_blank" rel="noopener">GitHub</a>
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
.faces {
	display: flex;
	justify-content: center;
	gap: 8px;
}
.face {
	display: grid;
	place-items: center;
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
	width: 100%;
	padding: 4px 0;
	filter: grayscale(1);
	opacity: 0.5;
	transition: filter 0.15s, opacity 0.15s, scale 0.15s;
}
.bars .face:hover:not(:disabled) {
	filter: none;
	opacity: 1;
}
.bars .face.picked {
	filter: none;
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
.demo-banner {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px 12px;
	margin: -4px 0 16px;
	padding: 10px 14px;
	font-size: 14px;
	color: var(--note-action-ink);
	background: var(--note-action);
	border: 1.5px solid color-mix(in srgb, var(--accent) 30%, transparent);
	border-radius: 12px;
}
.demo-banner .small {
	font-size: 13px;
}
.gate-mascot {
	justify-self: center;
}
.brand {
	display: inline-flex;
	align-items: center;
	gap: 6px;
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
.phase::before {
	content: "";
	display: inline-block;
	width: 7px;
	height: 7px;
	margin-right: 6px;
	border-radius: 50%;
	background: currentColor;
	vertical-align: 1px;
}
.phase.locked {
	color: var(--muted);
}
.phase.writing {
	color: var(--warn);
}
.phase.revealed {
	color: var(--ok);
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
/* Mood and last sprint stacked in the left third, the doodle in the right two-thirds; one column on phones. */
.top {
	display: grid;
	grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
	gap: 16px;
	align-items: start;
	margin-bottom: 22px;
}
@media (max-width: 760px) {
	.top {
		grid-template-columns: minmax(0, 1fr);
	}
}
.side {
	display: grid;
	gap: 16px;
}
.followups-panel .followups {
	max-height: 220px;
	overflow-y: auto;
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
.act {
	width: 28px;
	height: 28px;
	padding: 0;
	border-radius: 50%;
	font-size: 14px;
	font-weight: 800;
	flex-shrink: 0;
}
.act.done {
	color: var(--ok);
	border-color: color-mix(in srgb, var(--ok) 45%, transparent);
	background: color-mix(in srgb, var(--ok) 10%, var(--surface));
}
.act.done:hover {
	background: var(--ok);
	color: var(--surface);
}
.act.drop {
	color: var(--danger);
	border-color: color-mix(in srgb, var(--danger) 40%, transparent);
	background: color-mix(in srgb, var(--danger) 7%, var(--surface));
}
.act.drop:hover {
	background: var(--danger);
	color: var(--surface);
}
.act.undo {
	color: var(--muted);
	border-color: var(--border);
}
.badge {
	font-size: 12px;
	font-weight: 700;
	color: var(--warn);
	background: color-mix(in srgb, var(--warn) 14%, transparent);
	border-radius: 999px;
	padding: 1px 9px;
}
.mood-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 8px;
	margin-bottom: 8px;
}
.mood-head h2 {
	margin: 0;
}
.stat {
	display: inline-flex;
	align-items: center;
	gap: 6px;
	font-size: 13px;
	font-weight: 600;
}
.stat strong {
	font-size: 18px;
	font-weight: 800;
}
.delta {
	font-size: 12px;
	font-weight: 800;
	padding: 1px 7px;
	border-radius: 999px;
}
.delta.up {
	color: var(--ok);
	background: color-mix(in srgb, var(--ok) 12%, transparent);
}
.delta.down {
	color: var(--danger);
	background: color-mix(in srgb, var(--danger) 10%, transparent);
}
.delta.same {
	color: var(--muted);
	background: color-mix(in srgb, var(--muted) 12%, transparent);
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
/* Five equal columns across the whole panel. */
.bar {
	flex: 1;
	min-width: 0;
	display: grid;
	justify-items: center;
	gap: 2px;
}
.bar .track {
	height: 52px;
	width: 60%;
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
