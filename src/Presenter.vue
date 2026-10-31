<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import Icon from "./Icon.vue";
import { COLS, type Card, type Stack, stacksIn, useFocusTrap } from "./lib";

// Only the presenter's screen changes; everyone else keeps the normal board and follows the screen share.
const props = defineProps<{ cards: Card[] }>();
const emit = defineEmits<{ close: []; addAction: [text: string] }>();

// Column by column (Went well, then To improve); inside each, most reactions first, ties in writing order.
// The order is fixed when presenting starts and your place is kept by card, so reactions or new cards
// never change what's on screen. Cards written meanwhile join the end of their column, tagged "New".
const PRESENTED = ["well", "improve"];
// One step per stack (a grouped set of cards, or a lone card).
const allStacks = (cards: Card[], byReactions = false) =>
	PRESENTED.flatMap((col) => stacksIn(cards, col, byReactions).filter((s) => s.cards[0].text !== null));
const order = ref(allStacks(props.cards, true).map((s) => s.id));
const known = new Set(props.cards.map((c) => c.id));
const added = ref(new Set<string>());
watch(
	() => props.cards,
	(cards) => {
		const next = [...order.value];
		const byId = new Map(cards.map((x) => [x.id, x]));
		for (const s of allStacks(cards)) {
			if (next.includes(s.id)) continue;
			// After the last stack of the same column, or before the next column's stacks.
			const col = PRESENTED.indexOf(s.col);
			let at = next.length;
			for (let i = next.length - 1; i >= 0; i--) {
				const other = PRESENTED.indexOf(byId.get(next[i])?.col ?? "");
				if (other <= col) break;
				at = i;
			}
			next.splice(at, 0, s.id);
			// Only cards written during presenting are "New"; one that was just unstacked isn't.
			if (!known.has(s.id)) added.value = new Set([...added.value, s.id]);
		}
		order.value = next;
	},
	{ deep: true },
);
const items = computed(() => {
	const stacks = allStacks(props.cards);
	return order.value.map((id) => stacks.find((s) => s.id === id)).filter((s): s is Stack => !!s);
});
// Your place is kept by card, so if the current card gets stacked under another, you stay on that stack.
const currentId = ref(order.value[0] ?? "");
const current = computed(() => items.value.find((s) => s.cards.some((c) => c.id === currentId.value)) ?? items.value[0]);
const index = computed(() => Math.max(0, items.value.indexOf(current.value!)));
const position = computed(() => {
	const inCol = items.value.filter((c) => c.col === current.value?.col);
	return `${inCol.indexOf(current.value!) + 1} of ${inCol.length}`;
});
const actions = computed(() => props.cards.filter((c) => c.col === "action"));
const colLabel = (key: string) => COLS.find((c) => c.key === key)!;
const draft = ref("");
const dialog = ref<HTMLElement>();
useFocusTrap(dialog);

function go(step: number) {
	const next = items.value[Math.max(0, Math.min(items.value.length - 1, index.value + step))];
	if (next) currentId.value = next.id;
}
function onKey(e: KeyboardEvent) {
	if ((e.target as HTMLElement).tagName === "INPUT") return;
	if (e.key === "ArrowRight") go(1);
	if (e.key === "ArrowLeft") go(-1);
	if (e.key === "Escape") emit("close");
}
onMounted(() => addEventListener("keydown", onKey));
onUnmounted(() => removeEventListener("keydown", onKey));

function add() {
	if (draft.value.trim()) emit("addAction", draft.value.trim());
	draft.value = "";
}
</script>

<template>
	<div ref="dialog" class="presenter" role="dialog" aria-modal="true" aria-label="Presenter view">
		<header>
			<strong>Presenting</strong>
			<span class="muted">Arrow keys to move, Esc to exit</span>
			<span class="spacer" />
			<button class="icon-btn" title="Exit" aria-label="Exit presenter" @click="emit('close')"><Icon name="close" /><span class="lbl">Exit</span></button>
		</header>

		<div class="stage">
			<p v-if="!current" class="muted">No revealed cards to discuss yet.</p>
			<template v-else>
				<button class="nav" aria-label="Previous card" :disabled="index === 0" @click="go(-1)">←</button>
				<div class="slot">
					<p class="meta">
						{{ colLabel(current.col).label }} · {{ position }}
						<span v-if="added.has(current.id)" class="new">New</span>
					</p>
					<Transition name="zoom" mode="out-in">
						<div :key="current.id" class="group">
							<article v-for="card in current.cards" :key="card.id" class="big" :class="[`note-${card.col}`, { sub: card.id !== current.id }]">
								<p>{{ card.text }}</p>
								<footer>
									<span v-for="r in card.reactions" :key="r.emoji" class="r">{{ r.emoji }} {{ r.count }}</span>
									<span class="spacer" />
								</footer>
								<ul v-if="card.comments.length" class="comments">
									<li v-for="m in card.comments" :key="m.id"><strong>{{ m.name }}</strong> {{ m.text }}</li>
								</ul>
							</article>
						</div>
					</Transition>
				</div>
				<button class="nav" aria-label="Next card" :disabled="index >= items.length - 1" @click="go(1)">→</button>
			</template>
		</div>

		<aside class="panel">
			<h2>Action items</h2>
			<ul>
				<li v-for="a in actions" :key="a.id">{{ a.text }}</li>
			</ul>
			<form @submit.prevent="add">
				<input v-model="draft" maxlength="500" placeholder="Add an action item" aria-label="Add an action item" />
			</form>
		</aside>
	</div>
</template>

<style scoped>
.presenter {
	position: fixed;
	inset: 0;
	z-index: 50;
	display: grid;
	grid-template-columns: 1fr 300px;
	grid-template-rows: auto 1fr;
	gap: 16px;
	padding: 16px;
	background: var(--bg) radial-gradient(var(--dot) 1.2px, transparent 1.2px) 0 0 / 22px 22px;
}
header {
	grid-column: 1 / -1;
	display: flex;
	align-items: center;
	gap: 12px;
}
.stage {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 16px;
	min-width: 0;
}
.slot {
	flex: 1;
	max-width: 640px;
	text-align: center;
}
.meta {
	color: var(--muted);
	font-weight: 600;
}
.new {
	margin-left: 6px;
	padding: 1px 8px;
	border-radius: 999px;
	font-size: 12px;
	color: var(--accent);
	background: var(--accent-soft);
}
.nav {
	font-size: 22px;
	width: 52px;
	height: 52px;
	border-radius: 50%;
}
.group {
	display: grid;
	gap: 14px;
	max-height: calc(100vh - 160px);
	overflow-y: auto;
	padding: 8px;
}
/* Cards grouped under the first one: same note, a size down. */
.big.sub {
	padding: 18px 28px 12px;
	rotate: 0.6deg;
}
.big.sub p {
	font-size: clamp(17px, 2.2vw, 23px);
	margin-bottom: 10px;
}
.big {
	border-radius: 6px 6px 28px 6px;
	padding: 40px 36px 24px;
	box-shadow: var(--shadow);
	rotate: -1deg;
	text-align: left;
}
.big p {
	font-size: clamp(22px, 3.2vw, 34px);
	line-height: 1.3;
	font-weight: 700;
	margin: 0 0 20px;
	overflow-wrap: anywhere;
}
.big footer {
	display: flex;
	flex-wrap: wrap;
	gap: 6px 12px;
	font-weight: 600;
	font-size: 17px;
	opacity: 0.85;
}
.comments {
	list-style: none;
	margin: 18px 0 0;
	padding: 14px 0 0;
	border-top: 1.5px dashed currentColor;
	font-size: 16px;
	opacity: 0.9;
}
.comments li {
	margin-bottom: 6px;
	overflow-wrap: anywhere;
}
.note-well {
	background: var(--note-well);
	color: var(--note-well-ink);
}
.note-improve {
	background: var(--note-improve);
	color: var(--note-improve-ink);
}
aside {
	overflow: auto;
}
aside ul {
	padding-left: 18px;
}
aside li {
	margin-bottom: 6px;
	overflow-wrap: anywhere;
}
.zoom-enter-active,
.zoom-leave-active {
	transition: opacity 0.18s, scale 0.18s;
}
.zoom-enter-from,
.zoom-leave-to {
	opacity: 0;
	scale: 0.9;
}
@media (max-width: 760px) {
	.presenter {
		grid-template-columns: 1fr;
		grid-template-rows: auto 1fr auto;
		overflow: auto;
	}
	.nav {
		width: 40px;
		height: 40px;
	}
}
</style>
