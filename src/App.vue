<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";

type Card = { id: string; col: string; text: string | null; name: string; mine: boolean; votes: number; voted: boolean };
type FollowUp = { id: string; text: string; carried: number; status: "open" | "done" | "dropped" };
type BoardState = { title: string; previousTitle: string; followUps: FollowUp[]; phase: "writing" | "revealed" | "locked"; online: string[]; cards: Card[] };
type ListedBoard = { code: string; title: string; created_at: number };

const COLS = [
	{ key: "well", label: "Went well" },
	{ key: "improve", label: "To improve" },
	{ key: "action", label: "Action items" },
];

// localStorage can throw (private mode, blocked storage); the app still works, it just forgets.
const load = (key: string) => {
	try {
		return localStorage.getItem(key) ?? "";
	} catch {
		return "";
	}
};
const save = (key: string, value: string) => {
	try {
		localStorage.setItem(key, value);
	} catch {}
};

// "k7qm4xpt", "K7QM 4XPT" and "K7QM-4XPT" all mean the same board (same rule as the Worker).
const normalizeCode = (raw: string) => {
	const c = raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
	return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : "";
};

const path = location.pathname;
const rawCode = path.match(/^\/b\/([^/]+)/)?.[1];
const code = rawCode ? normalizeCode(decodeURIComponent(rawCode)) || rawCode : "";
if (rawCode && code !== rawCode) history.replaceState(null, "", `/b/${code}`);
const page = code ? "board" : path === "/boards" ? "list" : "home";

async function post<T>(url: string, body: object): Promise<T> {
	const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
	return data;
}

// Home
const joinCode = ref("");
const newTitle = ref("");
const password = ref("");
const previous = ref("");
const error = ref("");

function join() {
	const c = normalizeCode(joinCode.value);
	if (!c) return (error.value = "Codes have 8 characters, like K7QM-4XPT.");
	location.href = `/b/${c}`;
}

async function create() {
	error.value = "";
	try {
		const { code } = await post<{ code: string }>("/api/boards", { title: newTitle.value, password: password.value, previous: previous.value });
		location.href = `/b/${code}`;
	} catch (e) {
		error.value = (e as Error).message;
	}
}

// Past boards; also feeds the "previous board" picker once the create password is typed.
const boards = ref<ListedBoard[] | null>(null);
async function loadBoards(quiet = false) {
	error.value = "";
	try {
		boards.value = await post<ListedBoard[]>("/api/boards/list", { password: password.value });
		previous.value = boards.value[0]?.code ?? "";
	} catch (e) {
		if (!quiet) error.value = (e as Error).message;
	}
}

// Board
let clientId = load("clientId");
if (!clientId) save("clientId", (clientId = crypto.randomUUID()));
const name = ref(load("name"));
const nameDraft = ref(name.value);
const state = ref<BoardState | null>(null);
const status = ref<"connecting" | "open" | "missing">("connecting");
const drafts = ref<Record<string, string>>({});
const lockPassword = ref("");
const showLock = ref(false);
let ws: WebSocket | null = null;
let everOpened = false;
let stopped = false;

function connect() {
	const proto = location.protocol === "https:" ? "wss" : "ws";
	const q = new URLSearchParams({ client: clientId, name: name.value });
	ws = new WebSocket(`${proto}://${location.host}/api/boards/${code}/ws?${q}`);
	ws.onopen = () => {
		everOpened = true;
		status.value = "open";
	};
	ws.onmessage = (e) => (state.value = JSON.parse(e.data));
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

function setName() {
	const n = nameDraft.value.trim().slice(0, 40);
	if (!n) return;
	const first = !name.value;
	name.value = n;
	save("name", n);
	if (first) connect();
	else send({ type: "name", name: n });
}
if (page === "board" && name.value) connect();

const send = (msg: object) => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify(msg));

function add(col: string) {
	const text = drafts.value[col]?.trim();
	if (!text) return;
	send({ type: "add", col, text });
	drafts.value[col] = "";
}
function edit(card: Card) {
	const text = prompt("Edit card", card.text ?? "");
	if (text?.trim()) send({ type: "edit", id: card.id, text });
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
		await post(`/api/boards/${code}/lock`, { password: lockPassword.value, locked });
		showLock.value = false;
		lockPassword.value = "";
	} catch (e) {
		error.value = (e as Error).message;
	}
}

const cardsIn = (col: string) => state.value?.cards.filter((c) => c.col === col) ?? [];
const phaseLabel = computed(
	() => ({ writing: "Writing · cards hidden", revealed: "Revealed · voting open", locked: "Locked · read-only" })[state.value?.phase ?? "writing"],
);
const copyCode = () => navigator.clipboard?.writeText(code);
if (page === "board") document.title = `retro · ${code}`;
</script>

<template>
	<main v-if="page === 'home'" class="narrow">
		<h1>retro</h1>
		<form class="box" @submit.prevent="join">
			<label for="code">Board code</label>
			<div class="row">
				<input id="code" v-model="joinCode" class="mono" placeholder="K7QM-4XPT" autocomplete="off" />
				<button>Join</button>
			</div>
		</form>
		<form class="box" @submit.prevent="create">
			<label for="title">New board</label>
			<input id="title" v-model="newTitle" maxlength="100" placeholder="Sprint 42 (optional)" />
			<div class="row">
				<input v-model="password" type="password" placeholder="Create password" aria-label="Create password" required @change="loadBoards(true)" />
				<button>Create</button>
			</div>
			<template v-if="boards">
				<label for="previous">Previous board (open action items carry over)</label>
				<select id="previous" v-model="previous">
					<option value="">None</option>
					<option v-for="b in boards" :key="b.code" :value="b.code">{{ b.title || "Untitled" }} · {{ b.code }}</option>
				</select>
			</template>
		</form>
		<p v-if="error" class="error" role="alert">{{ error }}</p>
		<p class="muted"><a href="/boards">Past boards</a></p>
	</main>

	<main v-else-if="page === 'list'" class="narrow">
		<h1><a href="/">retro</a> · past boards</h1>
		<form v-if="!boards" class="box" @submit.prevent="loadBoards()">
			<div class="row">
				<input v-model="password" type="password" placeholder="Create password" aria-label="Create password" required />
				<button>Show</button>
			</div>
		</form>
		<p v-if="error" class="error" role="alert">{{ error }}</p>
		<p v-if="boards && !boards.length" class="muted">No boards yet.</p>
		<ul v-if="boards" class="list">
			<li v-for="b in boards" :key="b.code">
				<a :href="`/b/${b.code}`">{{ b.title || "Untitled" }}</a>
				<span class="mono muted">{{ b.code }}</span>
				<span class="muted">{{ new Date(b.created_at).toLocaleDateString() }}</span>
			</li>
		</ul>
	</main>

	<main v-else>
		<form v-if="!name" class="box narrow" @submit.prevent="setName">
			<label for="name">Your name</label>
			<div class="row">
				<input id="name" v-model="nameDraft" maxlength="40" required autofocus />
				<button>Join board</button>
			</div>
		</form>

		<div v-else-if="status === 'missing'" class="narrow">
			<p>No board with code <span class="mono">{{ code }}</span>.</p>
			<p><a href="/">Back to home</a></p>
		</div>

		<template v-else-if="state">
			<header>
				<a href="/" class="brand">retro</a>
				<strong v-if="state.title">{{ state.title }}</strong>
				<button class="mono ghost" title="Copy code" @click="copyCode">{{ code }}</button>
				<span class="pill" :class="state.phase">{{ phaseLabel }}</span>
				<span v-if="status !== 'open'" class="muted">Reconnecting…</span>
				<span class="spacer" />
				<span class="muted">{{ state.online.join(", ") }}</span>
				<button v-if="state.phase === 'writing'" @click="reveal">Reveal</button>
				<button v-if="!showLock" class="ghost" @click="showLock = true">{{ state.phase === "locked" ? "Unlock" : "Lock" }}</button>
				<form v-else class="row" @submit.prevent="setLocked(state.phase !== 'locked')">
					<input v-model="lockPassword" type="password" placeholder="Create password" aria-label="Create password" required />
					<button>{{ state.phase === "locked" ? "Unlock" : "Lock" }}</button>
					<button type="button" class="ghost" @click="showLock = false">Cancel</button>
				</form>
			</header>
			<p v-if="error" class="error" role="alert">{{ error }}</p>
			<p class="muted small">
				You're {{ name }}.
				<a href="#" @click.prevent="nameDraft = name; name = ''">Change name</a>
			</p>

			<section v-if="state.followUps.length" class="followups">
				<h2>From last sprint<template v-if="state.previousTitle"> ({{ state.previousTitle }})</template></h2>
				<ul>
					<li v-for="f in state.followUps" :key="f.id" :class="f.status">
						<span class="mark" aria-hidden="true">{{ { open: "☐", done: "✓", dropped: "✕" }[f.status] }}</span>
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

			<div class="cols">
				<section v-for="col in COLS" :key="col.key" :class="`col-${col.key}`">
					<h2>{{ col.label }}</h2>
					<article v-for="card in cardsIn(col.key)" :key="card.id" class="card" :class="{ hidden: card.text === null }">
						<p v-if="card.text !== null">{{ card.text }}</p>
						<p v-else class="muted">Hidden until reveal</p>
						<footer>
							<span>{{ card.name }}<template v-if="card.mine"> · you</template></span>
							<span class="spacer" />
							<template v-if="card.mine && state.phase !== 'locked'">
								<button class="ghost small" @click="edit(card)">Edit</button>
								<button v-if="state.phase === 'writing'" class="ghost small" @click="remove(card)">Delete</button>
							</template>
							<button
								v-if="state.phase !== 'writing'"
								class="ghost small"
								:class="{ voted: card.voted }"
								:disabled="state.phase === 'locked'"
								:aria-pressed="card.voted"
								@click="send({ type: 'vote', id: card.id })"
							>
								▲ {{ card.votes }}
							</button>
						</footer>
					</article>
					<form v-if="state.phase !== 'locked'" @submit.prevent="add(col.key)">
						<input v-model="drafts[col.key]" maxlength="500" placeholder="Add a card" :aria-label="`Add a card to ${col.label}`" />
					</form>
				</section>
			</div>
		</template>

		<p v-else class="muted narrow">Connecting…</p>
	</main>
</template>

<style>
:root {
	--bg: #f7f6f3;
	--surface: #fff;
	--text: #1f1e1d;
	--muted: #6b6a66;
	--border: #dddbd4;
	--accent: #2f6fd0;
	--well: #2e7d4f;
	--improve: #b26a00;
	--danger: #c0392b;
	color-scheme: light dark;
}
@media (prefers-color-scheme: dark) {
	:root {
		--bg: #1a1a19;
		--surface: #242423;
		--text: #ecebe8;
		--muted: #a3a29d;
		--border: #3a3a38;
		--accent: #6fa3f0;
		--well: #6cc48f;
		--improve: #e3a447;
		--danger: #f07a6c;
	}
}
* {
	box-sizing: border-box;
}
body {
	margin: 0;
	background: var(--bg);
	color: var(--text);
	font: 15px/1.5 system-ui, sans-serif;
}
main {
	padding: 16px;
	max-width: 1200px;
	margin: 0 auto;
}
.narrow {
	max-width: 420px;
	margin-inline: auto;
}
h1 {
	font-size: 24px;
	font-weight: 600;
}
h2 {
	font-size: 15px;
	margin: 0 0 8px;
}
a {
	color: var(--accent);
}
h1 a,
.brand {
	color: inherit;
	text-decoration: none;
	font-weight: 600;
}
input,
select,
button {
	font: inherit;
	color: inherit;
	border: 1px solid var(--border);
	border-radius: 8px;
	padding: 6px 10px;
	background: var(--surface);
	min-width: 0;
}
input,
select {
	width: 100%;
}
button {
	cursor: pointer;
	white-space: nowrap;
}
button:disabled {
	cursor: default;
}
button.ghost {
	border-color: transparent;
	background: transparent;
}
button.small,
.small {
	font-size: 13px;
	padding: 2px 6px;
}
:focus-visible {
	outline: 2px solid var(--accent);
	outline-offset: 1px;
}
.box {
	display: grid;
	gap: 8px;
	background: var(--surface);
	border: 1px solid var(--border);
	border-radius: 12px;
	padding: 16px;
	margin-bottom: 12px;
}
.row {
	display: flex;
	gap: 8px;
	align-items: center;
}
.mono {
	font-family: ui-monospace, monospace;
	letter-spacing: 1px;
}
.muted {
	color: var(--muted);
}
.error {
	color: var(--danger);
}
.spacer {
	flex: 1;
}
.list {
	list-style: none;
	padding: 0;
}
.list li {
	display: flex;
	gap: 12px;
	padding: 8px 0;
	border-bottom: 1px solid var(--border);
}
.list li a {
	flex: 1;
}
header {
	display: flex;
	flex-wrap: wrap;
	gap: 10px;
	align-items: center;
}
header form input {
	width: 160px;
}
.pill {
	font-size: 13px;
	padding: 2px 10px;
	border-radius: 999px;
	border: 1px solid var(--border);
}
.pill.writing {
	color: var(--improve);
}
.pill.revealed {
	color: var(--well);
}
.cols {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
	gap: 16px;
	margin-top: 8px;
}
.col-well h2 {
	color: var(--well);
}
.col-improve h2 {
	color: var(--improve);
}
.col-action h2 {
	color: var(--accent);
}
.card {
	background: var(--surface);
	border: 1px solid var(--border);
	border-radius: 8px;
	padding: 8px 10px;
	margin-bottom: 8px;
}
.card.hidden {
	border-style: dashed;
	background: transparent;
}
.card p {
	margin: 0 0 4px;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
}
.card footer {
	display: flex;
	align-items: center;
	gap: 4px;
	font-size: 13px;
	color: var(--muted);
}
.followups {
	background: var(--surface);
	border: 1px solid var(--border);
	border-radius: 12px;
	padding: 12px 14px;
	margin: 8px 0 16px;
}
.followups ul {
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
.followups .done .text {
	color: var(--muted);
}
.followups .dropped .text {
	color: var(--muted);
	text-decoration: line-through;
}
.followups .done .mark {
	color: var(--well);
}
.badge {
	font-size: 12px;
	color: var(--improve);
	border: 1px solid currentColor;
	border-radius: 999px;
	padding: 0 8px;
}
.voted {
	color: var(--accent);
	font-weight: 600;
}
</style>
