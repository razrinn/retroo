<script setup lang="ts">
import { computed, onUnmounted, ref, watch, watchEffect } from "vue";
import ConfirmButton from "./ConfirmButton.vue";
import Doodle from "./Doodle.vue";
import EmojiRain from "./EmojiRain.vue";
import Icon from "./Icon.vue";
import Mascot from "./Mascot.vue";
import NoteCard from "./NoteCard.vue";
import Onboarding from "./Onboarding.vue";
import Presenter from "./Presenter.vue";
import Summary from "./Summary.vue";
import Timer from "./Timer.vue";
import { demoSocket, resetDemo } from "./demo";
import { setSound, soundOn, sounds } from "./sound";
import { type BoardState, type Card, COLS, GITHUB_URL, MOODS, confetti, formatCode, hash, load, moodTint, post, save, useDismiss } from "./lib";

// `demo` swaps the real WebSocket for the in-browser stand-in from demo.ts (the /demo page).
const props = defineProps<{ code: string; demo?: boolean }>();
document.title = props.demo ? "retroo · Demo" : `retroo · ${formatCode(props.code)}`;

let clientId = load("clientId");
if (!clientId) save("clientId", (clientId = crypto.randomUUID()));
const name = ref(load("name"));
const nameDraft = ref(name.value);
const state = ref<BoardState | null>(null);
// connecting: first try · open · retrying: lost the connection, trying again · missing: no such board
const status = ref<"connecting" | "open" | "retrying" | "missing">("connecting");
const drafts = ref<Record<string, string>>({});
const error = ref("");
const showLock = ref(false);
const lockPassword = ref("");
const presenting = ref(false);
const summarizing = ref(false);
const copied = ref(false);
const offset = ref(0);
const rain = ref<InstanceType<typeof EmojiRain>>();
const doodle = ref<InstanceType<typeof Doodle>>();

// Animation bookkeeping: cards that just appeared drop in, cards that just got revealed flip over.
const fresh = ref(new Set<string>());
// Reactions other people just added to your cards, shown as a small "+emoji" floating off the card.
const floats = ref<{ id: number; card: string; emoji: string }[]>([]);
let floatId = 0;
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
			washTo(moodColor(next));
			hops.value++;
			sounds.reveal(wasHidden.length);
		}
		// Everyone hears about phase changes, including screen-reader users (the toast is a live region).
		if (prev.phase === "writing" && next.phase === "revealed") notify(`${next.cards.length} card${next.cards.length === 1 ? "" : "s"} revealed`);
		if (prev.phase !== "locked" && next.phase === "locked") notify("Board locked. The summary is ready.");
		if (prev.phase === "locked" && next.phase !== "locked") notify("Board unlocked");
		const before = new Map(prev.cards.map((c) => [c.id, c]));
		const gained: { card: string; emoji: string }[] = [];
		for (const c of next.cards) {
			const old = before.get(c.id);
			if (!c.mine || !old) continue;
			for (const r of c.reactions) {
				const was = old.reactions.find((x) => x.emoji === r.emoji);
				const mineAdded = r.mine && !was?.mine ? 1 : 0;
				if (r.count - (was?.count ?? 0) - mineAdded > 0) gained.push({ card: c.id, emoji: r.emoji });
			}
		}
		if (gained.length) {
			const added = gained.map((g) => ({ ...g, id: floatId++ }));
			floats.value = [...floats.value, ...added];
			setTimeout(() => (floats.value = floats.value.filter((f) => !added.some((a) => a.id === f.id))), 1300);
			// Browsers only allow vibration after the person has tapped the page; asking earlier logs an error.
			if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(25);
		}
		const open = (s: BoardState) => s.followUps.filter((f) => f.status === "open").length;
		if (open(prev) > 0 && open(next) === 0) confetti();
	}
	state.value = next;
}

// One short message at a time near the bottom; also read out by screen readers (role="status").
const toast = ref("");
let toastTimer = 0;
function notify(message: string) {
	toast.value = message;
	clearTimeout(toastTimer);
	toastTimer = setTimeout(() => (toast.value = ""), 2600);
}

let retries = 0;
function onOpen() {
	if (status.value === "retrying") notify("Back online");
	everOpened = true;
	retries = 0;
	status.value = "open";
}
function onMessage(data: any) {
	// Full board states carry a phase; emoji rain and doodle strokes are small events of their own.
	if ("phase" in data) onState(data);
	else if ("typing" in data) typingUntil.value = { ...typingUntil.value, [data.typing]: Date.now() + 4000 };
	else if (data.burst) rain.value?.drop(data.burst, data.name, data.from);
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
	socket.onclose = async () => {
		if (stopped) return;
		// Only call a board missing when the server says so (404); anything else is the network, so retry.
		if (!everOpened) {
			const res = await fetch(`/api/boards/${props.code}/ws`).catch(() => null);
			if (res?.status === 404) return (status.value = "missing");
		}
		status.value = everOpened ? "retrying" : "connecting";
		setTimeout(connect, Math.min(10_000, 1000 * 2 ** retries++));
	};
}
onUnmounted(() => {
	stopped = true;
	ws?.close();
});
if (name.value) connect();

// Returns false when not connected, so callers can keep what the person typed.
function send(msg: object) {
	if (ws?.readyState !== WebSocket.OPEN) return false;
	ws.send(JSON.stringify(msg));
	return true;
}

function setName() {
	const n = nameDraft.value.trim().slice(0, 40);
	if (!n) return;
	const first = !name.value;
	name.value = n;
	save("name", n);
	if (first) connect();
	else send({ type: "name", name: n });
}

// The text only clears once it's actually sent; the field then flashes a check so you can keep going.
const saved = ref("");
function add(col: string) {
	const text = drafts.value[col]?.trim();
	if (!text) return;
	if (!send({ type: "add", col, text })) return notify("Not connected yet. Your card is still in the box.");
	drafts.value[col] = "";
	saved.value = col;
	setTimeout(() => saved.value === col && (saved.value = ""), 900);
}
const locking = ref(false);
const lockEl = ref<HTMLElement>();
useDismiss(showLock, lockEl);
const errorKey = ref(0);
async function setLocked(locked: boolean) {
	if (locking.value) return;
	error.value = "";
	if (props.demo) return send({ type: "lock", locked });
	locking.value = true;
	try {
		await post(`/api/boards/${props.code}/lock`, { password: lockPassword.value, locked });
		showLock.value = false;
		lockPassword.value = "";
	} catch (e) {
		error.value = (e as Error).message;
		errorKey.value++;
	} finally {
		locking.value = false;
	}
}
function startOver() {
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
// The page tints toward the mood: your own rating while writing (team results are still hidden),
// the team average once revealed. Averages blend between neighbours, so 3.6 sits between grey and mint.
function moodColor(s: BoardState) {
	const level = s.phase === "writing" ? s.mood.mine : (s.mood.average ?? s.mood.mine);
	return level === null ? null : moodTint(level);
}
watchEffect(() => {
	const color = state.value && moodColor(state.value);
	if (color) document.documentElement.style.setProperty("--mood", color);
	else document.documentElement.style.removeProperty("--mood");
});

// "Someone is writing": other people's typing signals keep their bubble breathing for 4 seconds (cards are
// anonymous, so it never points at a card). Ours goes out at most every 2 seconds while typing a card.
const typingUntil = ref<Record<string, number>>({});
const isTyping = (name: string) => (typingUntil.value[name] ?? 0) > clock.value;
let lastTypingSent = 0;
function typing() {
	// Only while cards are hidden (the server ignores it otherwise, to keep visible cards anonymous).
	if (state.value?.phase !== "writing" || Date.now() - lastTypingSent < 2000) return;
	lastTypingSent = Date.now();
	send({ type: "typing" });
}

// Reveal glows softly once the room looks done: everyone online has written a card and rated the sprint.
// People are matched by name, so this is a hint, not a gate.
const ready = computed(() => {
	const s = state.value;
	if (!s || s.phase !== "writing" || s.online.length < 2) return false;
	const writers = new Set(s.cards.map((c) => c.name));
	return s.online.every((n) => writers.has(n)) && s.mood.rated >= s.online.length;
});

// The header Stickie mirrors the room: the timer wins when it's nearly up, otherwise it wears the
// same mood as the background (yours while writing, the team's after reveal).
const hops = ref(0);
const clock = ref(Date.now());
const tick = setInterval(() => (clock.value = Date.now()), 1000);
onUnmounted(() => clearInterval(tick));
const timeLeft = computed(() => (state.value?.timerEnd ? state.value.timerEnd - (clock.value + offset.value) : null));
watch(timeLeft, (now, before) => {
	if (now !== null && now <= 0 && before !== null && before > 0) {
		sounds.timesUp();
		notify("Time's up");
	}
});
const sound = ref(soundOn());
function toggleSound() {
	sound.value = !sound.value;
	setSound(sound.value);
}
const headerFace = computed(() => (timeLeft.value === null ? "happy" : timeLeft.value <= 0 ? "startled" : timeLeft.value < 30_000 ? "worried" : "happy"));
const headerMood = computed(() => {
	if (headerFace.value !== "happy" || !state.value) return null;
	const m = state.value.mood;
	const level = state.value.phase === "writing" ? m.mine : (m.average ?? m.mine);
	return level === null ? null : Math.round(level);
});

// On reveal the team color spreads out from the middle instead of fading in place. The page underneath
// holds its old color until the wash has covered it (see :root.washing in style.css).
const washColor = ref<string | null>(null);
function washTo(color: string | null) {
	if (!color) return;
	washColor.value = color;
	document.documentElement.classList.add("washing");
	setTimeout(() => {
		washColor.value = null;
		document.documentElement.classList.remove("washing");
	}, 1600);
}
onUnmounted(() => document.documentElement.style.removeProperty("--mood"));

// First-time tours: whoever just created the board gets "Running a retro" (from ?new), everyone else
// gets "How retroo works" on their first board. Remembered per browser; the footer links replay them.
const justCreated = new URLSearchParams(location.search).has("new");
if (justCreated) history.replaceState(null, "", location.pathname);
const tour = ref<"join" | "run" | null>(null);
watch(
	() => !!state.value && !needsMood.value,
	(ready) => {
		if (!ready || tour.value) return;
		if (justCreated && !load("tour-run")) tour.value = "run";
		else if (!load("tour-join")) tour.value = "join";
	},
	{ immediate: true },
);
function endTour(started: boolean) {
	const seen = tour.value;
	tour.value = null;
	save(`tour-${seen}`, "1");
	if (seen === "run") save("tour-join", "1"); // the facilitator doesn't need both on day one
	if (started && seen === "join") document.querySelector<HTMLInputElement>(".add input")?.focus();
}

// "N" jumps to the first add-note field (unless you're already typing somewhere or a dialog is open).
function onShortcut(e: KeyboardEvent) {
	if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey || presenting.value || summarizing.value || tour.value) return;
	const t = e.target as HTMLElement;
	if (t.closest("input, textarea, select, [contenteditable]")) return;
	const field = document.querySelector<HTMLInputElement>(".add input");
	if (!field) return;
	e.preventDefault();
	field.focus();
}
addEventListener("keydown", onShortcut);
onUnmounted(() => removeEventListener("keydown", onShortcut));

// Change from last sprint's average, e.g. -2 or +0.4; null when there's nothing to compare.
const moodDelta = computed(() => {
	const m = state.value?.mood;
	if (!m || m.average === null || m.previous === null) return null;
	return Math.round((m.average - m.previous) * 10) / 10;
});
const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
const bubble = (n: string) => ({ background: `hsl(${hash(n) % 360} 65% 82%)`, color: `hsl(${hash(n) % 360} 55% 22%)` });
const phaseLabel = computed(() =>
	state.value?.phase === "revealed" && state.value.live ? "Open" : { writing: "Writing", revealed: "Revealed", locked: "Locked" }[state.value?.phase ?? "writing"],
);
</script>

<template>
	<form v-if="!name" class="gate panel" @submit.prevent="setName">
		<Mascot :size="64" class="gate-mascot" follow />
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
		<Mascot :size="64" class="gate-mascot" follow />
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
			<a href="/" class="brand"><Mascot :size="28" :mood="headerMood" :face="headerFace" :hop="hops" /> retroo</a>
			<h1 v-if="state.title">{{ state.title }}</h1>
			<button v-if="!demo" class="chip mono" :title="copied ? 'Copied' : 'Copy code'" @click="copyCode">{{ copied ? "Copied" : formatCode(code) }}</button>
			<span class="phase" :class="state.phase">{{ phaseLabel }}</span>
			<div class="actions">
			<div class="people" :aria-label="`Online: ${state.online.join(', ')}`">
				<span v-for="p in state.online.slice(0, 6)" :key="p" class="bubble" :class="{ typing: isTyping(p) }" :style="bubble(p)" :title="isTyping(p) ? `${p} is writing` : p">{{ initials(p) }}</span>
				<span v-if="state.online.length > 6" class="bubble more">+{{ state.online.length - 6 }}</span>
			</div>
			<button class="ghost icon-btn" :aria-pressed="sound" :title="sound ? 'Sound on' : 'Sound off'" :aria-label="sound ? 'Turn sound off' : 'Turn sound on'" @click="toggleSound">
				<Icon :name="sound ? 'sound' : 'mute'" />
			</button>
			<Timer :end="state.timerEnd" :offset="offset" @set="(seconds) => send({ type: 'timer', seconds })" />
			<button v-if="state.phase !== 'writing'" class="icon-btn" title="Present" aria-label="Present" @click="presenting = true">
				<Icon name="present" /><span class="lbl">Present</span>
			</button>
			<button
				v-if="state.phase !== 'writing'"
				class="summary-btn icon-btn"
				:class="{ primary: state.phase === 'locked' }"
				title="Summary"
				aria-label="Summary"
				@click="summarizing = true"
			>
				<Icon name="summary" /><span class="lbl">Summary</span>
			</button>
			<ConfirmButton
				v-if="state.phase === 'writing'"
				ask="Reveal for everyone?"
				yes="Reveal"
				class="primary"
				:class="{ ready }"
				:title="ready ? 'Everyone has written and rated' : undefined"
				@confirm="send({ type: 'reveal' })"
			>
				Reveal
			</ConfirmButton>
			<span ref="lockEl" class="lock-wrap">
				<button
					class="ghost icon-btn"
					:title="state.phase === 'locked' ? 'Unlock' : 'Lock'"
					:aria-label="state.phase === 'locked' ? 'Unlock' : 'Lock'"
					:aria-expanded="demo ? undefined : showLock"
					@click="demo ? setLocked(state.phase !== 'locked') : (showLock = !showLock)"
				>
					<Icon :name="state.phase === 'locked' ? 'unlock' : 'lock'" /><span class="lbl">{{ state.phase === "locked" ? "Unlock" : "Lock" }}</span>
				</button>
				<!-- A popover under the button, so asking for the password never changes the header's size. -->
				<form v-if="showLock && !demo" class="lock-pop" @submit.prevent="setLocked(state.phase !== 'locked')">
					<label for="lock-pw">{{ state.phase === "locked" ? "Unlock this board" : "Lock this board" }}</label>
					<input id="lock-pw" v-model="lockPassword" type="password" placeholder="Password" required autofocus />
					<button class="primary" :aria-busy="locking">{{ state.phase === "locked" ? "Unlock" : "Lock" }}</button>
				</form>
			</span>
			</div>
		</header>
		<div v-if="demo" class="demo-banner" role="note">
			<span class="long"><strong>Demo board.</strong> Dina, Budi and Sari are made up, and everything is saved in this browser only. Try writing a card, then Reveal.</span>
			<span class="short"><strong>Demo board</strong>, saved in this browser only.</span>
			<span class="spacer" />
			<ConfirmButton ask="Start the demo over?" yes="Reset" class="small" @confirm="startOver">Reset demo</ConfirmButton>
			<a href="/" class="small">Back to home</a>
		</div>
		<p v-if="error" :key="errorKey" class="error" role="alert">{{ error }}</p>

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
				<!-- Always shown so people learn that action items carry over, even before there's anything to carry. -->
				<section class="panel followups-panel">
					<h2>Last sprint<span v-if="state.previousTitle" class="muted"> · {{ state.previousTitle }}</span></h2>
					<p v-if="!state.followUps.length && state.previousTitle" class="empty muted">All caught up.</p>
					<p v-else-if="!state.followUps.length" class="empty muted">Unfinished action items from last sprint show up here.</p>
					<ul v-else class="followups">
						<li v-for="f in state.followUps" :key="f.id" :class="f.status">
							<svg v-if="f.status === 'done'" class="tick" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" /></svg>
							<span class="text">{{ f.text }}</span>
							<span v-if="f.carried > 1" class="badge" :class="{ slipping: f.carried >= 3 && f.status === 'open' }">carried ×{{ f.carried }}</span>
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
					:floats="floats.filter((f) => f.card === card.id)"
					@react="(emoji) => send({ type: 'react', id: card.id, emoji })"
					@comment="(text) => send({ type: 'comment', id: card.id, text })"
					@uncomment="(id) => send({ type: 'uncomment', id })"
					@edit="(text) => send({ type: 'edit', id: card.id, text })"
					@remove="send({ type: 'delete', id: card.id })"
				/>
				<form v-if="state.phase !== 'locked'" class="add" :class="{ saved: saved === col.key }" @submit.prevent="add(col.key)">
					<input
						v-model="drafts[col.key]"
						maxlength="500"
						placeholder="+ Add a note"
						:aria-label="`Add a note to ${col.label}`"
						:data-col="col.key"
						@input="typing"
					/>
					<span v-if="(drafts[col.key]?.length ?? 0) > 400" class="counter">{{ 500 - drafts[col.key].length }}</span>
					<span v-if="saved === col.key" class="tick-mark" aria-hidden="true">✓</span>
				</form>
			</section>
		</div>

		<p class="foot muted">
			You're {{ name }} ·
			<a href="#" @click.prevent="nameDraft = name; name = ''">change name</a>
			·
			<a href="#" @click.prevent="tour = 'join'">Tips</a>
			·
			<a href="#" @click.prevent="tour = 'run'">Facilitator tips</a>
			·
			<a :href="GITHUB_URL" target="_blank" rel="noopener">GitHub</a>
		</p>
	</main>

	<div v-if="washColor" class="wash" :style="{ '--mood': washColor }" aria-hidden="true" />
	<div v-if="status === 'retrying'" class="conn" role="status">Connection lost. Reconnecting…</div>
	<Transition name="toast">
		<div v-if="toast" :key="toast" class="toast" role="status" aria-live="polite">{{ toast }}</div>
	</Transition>
	<EmojiRain v-if="state && !needsMood" ref="rain" @send="(emoji) => send({ type: 'burst', emoji })" />
	<Onboarding v-if="tour && state" :tour="tour" :live="state.live" :code="formatCode(code)" @close="endTour(false)" @done="endTour(true)" />
	<Summary v-if="summarizing && state" :state="state" :code="formatCode(code)" @close="summarizing = false" />
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
	padding: 16px 16px 96px; /* bottom room so the last cards scroll out from under the emoji button */
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
.demo-banner .short {
	display: none;
}
.demo-banner .small {
	font-size: 13px;
}
.conn {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	z-index: 70;
	padding: 6px 12px;
	text-align: center;
	font-size: 13px;
	font-weight: 700;
	color: var(--note-improve-ink);
	background: var(--note-improve);
	border-bottom: 1.5px solid color-mix(in srgb, var(--warn) 40%, transparent);
	animation: slide-down 0.25s ease-out;
}
@keyframes slide-down {
	from {
		translate: 0 -100%;
	}
}
.toast {
	position: fixed;
	left: 50%;
	bottom: 24px;
	z-index: 70;
	translate: -50% 0;
	max-width: calc(100vw - 32px);
	padding: 9px 16px;
	border-radius: 999px;
	font-size: 14px;
	font-weight: 700;
	color: var(--surface);
	background: var(--text);
	box-shadow: var(--shadow);
}
.toast-enter-active,
.toast-leave-active {
	transition: opacity 0.2s, translate 0.25s cubic-bezier(0.3, 1.4, 0.5, 1);
}
.toast-enter-from,
.toast-leave-to {
	opacity: 0;
	translate: -50% 12px;
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
/* When the board locks, the Summary button turns primary and nudges twice. */
.summary-btn.primary {
	animation: nudge-up 0.5s ease-in-out 2;
}
@keyframes nudge-up {
	50% {
		translate: 0 -3px;
		scale: 1.05;
	}
}
.primary.ready {
	animation: ready-glow 2.4s ease-in-out infinite;
}
@keyframes ready-glow {
	50% {
		box-shadow: 0 0 0 5px color-mix(in srgb, var(--accent) 22%, transparent), 0 0 18px 2px color-mix(in srgb, var(--accent) 35%, transparent);
	}
}
.bubble.typing {
	animation: breathe 1.4s ease-in-out infinite;
}
@keyframes breathe {
	50% {
		translate: 0 -3px;
		box-shadow: 0 4px 10px -4px currentColor;
	}
}
.bubble.more {
	background: var(--surface);
	color: var(--muted);
}
/* Actions sit on the right on wide screens and drop to their own row on phones. */
.actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
	margin-left: auto;
}
@media (max-width: 640px) {
	header {
		gap: 8px;
	}
	header h1 {
		font-size: 17px;
	}
	.actions {
		width: 100%;
		margin-left: 0;
		padding-top: 8px;
		border-top: 1.5px dashed var(--border);
	}
	.people {
		margin-right: auto;
	}
	.demo-banner .long {
		display: none;
	}
	/* Compact top panels so the cards start on the first screen. */
	.top {
		gap: 10px;
		margin-bottom: 16px;
	}
	.side {
		gap: 10px;
	}
	.top .bars .bar .track {
		height: 26px;
	}
	.top .bars .face :deep(svg) {
		width: 28px;
		height: 28px;
	}
	.top .followups-panel .followups {
		max-height: 132px;
	}
	.top :deep(.panel) {
		padding: 12px 14px;
	}
	/* Smaller header buttons so the actions fit on one row. */
	.actions > :is(button, .timer :deep(button), :deep(.confirm button)),
	.actions :deep(.timer > button) {
		padding: 5px 9px;
		font-size: 14px;
	}
	.actions {
		gap: 4px;
	}
	.demo-banner .short {
		display: inline;
	}
}
.lock-wrap {
	position: relative;
}
.lock-pop {
	position: absolute;
	right: 0;
	top: calc(100% + 6px);
	z-index: 20;
	display: grid;
	gap: 8px;
	width: 220px;
	padding: 12px;
	background: var(--surface);
	border: 1.5px solid var(--border);
	border-radius: 12px;
	box-shadow: var(--shadow);
	animation: pop-down 0.18s ease-out;
}
.lock-pop label {
	font-size: 13px;
	font-weight: 700;
}
@keyframes pop-down {
	from {
		opacity: 0;
		translate: 0 -6px;
	}
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
.followups-panel .empty {
	margin: 0;
	font-size: 13px;
	line-height: 1.5;
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
/* Dropped items get a line drawn through them; done items get a tick that draws itself. */
.followups .dropped .text {
	background: linear-gradient(currentColor, currentColor) left 55% / 100% 1.5px no-repeat;
	animation: strike 0.35s ease-out;
}
@keyframes strike {
	from {
		background-size: 0 1.5px;
	}
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
	animation: draw 0.35s ease-out;
}
@keyframes draw {
	from {
		stroke-dashoffset: 16;
	}
}
/* Items that keep slipping give a small nudge when the board opens. */
.badge.slipping {
	animation: nudge 0.5s ease-in-out 0.8s 2;
}
@keyframes nudge {
	25% {
		rotate: -6deg;
	}
	75% {
		rotate: 6deg;
	}
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
	display: inline-block;
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
.add {
	position: relative;
}
.add .counter,
.add .tick-mark {
	position: absolute;
	right: 12px;
	top: 50%;
	translate: 0 -50%;
	font-size: 12px;
	font-weight: 700;
	color: var(--muted);
	pointer-events: none;
}
.add .tick-mark {
	font-size: 16px;
	color: var(--ok);
	animation: pop 0.4s ease-out;
}
.add.saved input {
	border-color: var(--ok);
	border-style: solid;
	transition: border-color 0.2s;
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
