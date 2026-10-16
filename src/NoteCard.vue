<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { type Card, type Phase, REACTIONS, hash, reducedMotion } from "./lib";

const props = defineProps<{
	card: Card;
	phase: Phase;
	fresh: boolean;
	flipIndex: number | null;
	typing?: boolean;
	floats?: { id: number; emoji: string }[];
}>();
const emit = defineEmits<{ react: [emoji: string]; edit: [text: string]; remove: []; comment: [text: string]; uncomment: [id: string] }>();

const picking = ref(false);
const threadOpen = ref(false);
const reply = ref("");
// Same rule as the server: any card once revealed, action items (never hidden) any time.
const canComment = computed(() => props.phase !== "locked" && (props.phase !== "writing" || props.card.col === "action"));
function react(emoji: string) {
	picking.value = false;
	emit("react", emoji);
}
function send() {
	if (reply.value.trim()) emit("comment", reply.value.trim());
	reply.value = "";
}

const editing = ref(false);
const draft = ref("");
const box = ref<HTMLTextAreaElement>();
async function startEdit() {
	draft.value = props.card.text ?? "";
	editing.value = true;
	await nextTick();
	box.value?.focus();
}
function finishEdit() {
	if (!editing.value) return;
	editing.value = false;
	if (draft.value.trim() && draft.value.trim() !== props.card.text) emit("edit", draft.value.trim());
}

// With a mouse, the note leans a few degrees toward the cursor, like paper.
const lean = ref({ x: 0, y: 0 });
function onPointerMove(e: PointerEvent) {
	if (e.pointerType !== "mouse" || reducedMotion()) return;
	const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
	lean.value = { x: ((e.clientY - r.top) / r.height - 0.5) * -6, y: ((e.clientX - r.left) / r.width - 0.5) * 6 };
}
const tilt = computed(() => `${((hash(props.card.id) % 7) - 3) * 0.5}deg`);
const delay = computed(() => (props.flipIndex === null ? undefined : `${props.flipIndex * 90}ms`));
</script>

<template>
	<article
		class="note"
		:class="[`note-${card.col}`, { back: card.text === null, fresh, flip: flipIndex !== null, raised: picking, typing }]"
		:style="{ rotate: tilt, animationDelay: delay, '--rx': `${lean.x}deg`, '--ry': `${lean.y}deg` }"
		@pointermove="onPointerMove"
		@pointerleave="lean = { x: 0, y: 0 }"
	>
		<template v-if="card.text === null">
			<span class="who">{{ card.name }}</span>
			<span class="hidden-label">{{ typing ? "Writing…" : "Hidden" }}</span>
		</template>
		<template v-else>
			<span v-for="f in floats" :key="f.id" class="float" aria-hidden="true">+{{ f.emoji }}</span>
			<textarea
				v-if="editing"
				ref="box"
				v-model="draft"
				maxlength="500"
				rows="3"
				aria-label="Edit card"
				@keydown.enter.exact.prevent="finishEdit"
				@keydown.esc="editing = false"
				@blur="finishEdit"
			/>
			<p v-else>{{ card.text }}</p>
			<footer>
				<span class="who">{{ card.name }}<template v-if="card.mine"> · you</template></span>
				<span class="spacer" />
				<template v-if="card.mine && phase !== 'locked'">
					<button v-if="!editing" class="ghost small" @click="startEdit">Edit</button>
					<button v-if="phase === 'writing'" class="ghost small" @click="$emit('remove')">Delete</button>
				</template>
			</footer>
			<div v-if="phase !== 'writing' || card.comments.length || canComment" class="social">
				<template v-if="phase !== 'writing'">
					<button
						v-for="r in card.reactions"
						:key="r.emoji"
						class="chip"
						:class="{ mine: r.mine }"
						:disabled="phase === 'locked'"
						:aria-pressed="r.mine"
						:aria-label="`${r.emoji} ${r.count}${r.mine ? ', including you' : ''}`"
						@click="react(r.emoji)"
					>
						{{ r.emoji }} <span :key="r.count" class="count">{{ r.count }}</span>
					</button>
					<span v-if="phase !== 'locked'" class="picker">
						<button class="chip add" :aria-expanded="picking" aria-label="Add reaction" @click="picking = !picking">＋🙂</button>
						<span v-if="picking" class="menu" role="menu">
							<button v-for="e in REACTIONS" :key="e" class="ghost" role="menuitem" @click="react(e)">{{ e }}</button>
						</span>
					</span>
				</template>
				<span class="spacer" />
				<button
					v-if="card.comments.length || canComment"
					class="chip"
					:aria-expanded="threadOpen"
					:aria-label="`${card.comments.length} comments`"
					@click="threadOpen = !threadOpen"
				>
					{{ card.comments.length ? `${card.comments.length} comment${card.comments.length > 1 ? "s" : ""}` : "Comment" }}
				</button>
			</div>
			<div v-if="threadOpen" class="thread">
				<p v-for="m in card.comments" :key="m.id" class="comment">
					<strong>{{ m.name }}</strong> {{ m.text }}
					<button v-if="m.mine && phase !== 'locked'" class="ghost small" aria-label="Delete comment" @click="emit('uncomment', m.id)">✕</button>
				</p>
				<form v-if="canComment" @submit.prevent="send">
					<input v-model="reply" maxlength="300" placeholder="Reply…" aria-label="Write a comment" />
				</form>
			</div>
		</template>
	</article>
</template>

<style scoped>
.note {
	position: relative;
	border-radius: 4px 4px 14px 4px;
	padding: 12px 14px 10px;
	margin-bottom: 12px;
	box-shadow: var(--shadow);
	transform: perspective(700px) rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg));
	transition: rotate 0.2s, translate 0.2s, transform 0.15s ease-out;
}
/* The tilt makes each note its own stacking layer, so lift the one with an open emoji menu above its neighbours. */
.raised {
	z-index: 10;
}
.note:hover {
	rotate: 0deg !important;
	translate: 0 -2px;
}
.note-well {
	background: var(--note-well);
	color: var(--note-well-ink);
	--tag: var(--note-well-tag);
}
.note-improve {
	background: var(--note-improve);
	color: var(--note-improve-ink);
	--tag: var(--note-improve-tag);
}
.note-action {
	background: var(--note-action);
	color: var(--note-action-ink);
	--tag: var(--note-action-tag);
}
.note.back {
	display: flex;
	align-items: center;
	gap: 8px;
	color: var(--muted);
	background: repeating-linear-gradient(-45deg, var(--surface), var(--surface) 7px, var(--bg) 7px, var(--bg) 14px);
	border: 1.5px dashed var(--border);
	box-shadow: none;
}
.note.back.typing {
	animation: breathe 1.4s ease-in-out infinite;
}
@keyframes breathe {
	50% {
		border-color: var(--tag);
		scale: 1.015;
	}
}
.float {
	position: absolute;
	right: 14px;
	top: 6px;
	font-size: 18px;
	font-weight: 800;
	pointer-events: none;
	animation: float-up 1.2s ease-out forwards;
}
@keyframes float-up {
	to {
		translate: 0 -34px;
		opacity: 0;
		scale: 1.3;
	}
}
.hidden-label {
	margin-left: auto;
	font-size: 12px;
}
p {
	margin: 0 0 8px;
	white-space: pre-wrap;
	overflow-wrap: anywhere;
	font-size: 15.5px;
}
footer {
	display: flex;
	align-items: center;
	gap: 4px;
	font-size: 13px;
}
.who {
	color: var(--tag, var(--muted));
	font-weight: 600;
}
footer button.ghost {
	color: var(--tag);
}
textarea {
	width: 100%;
	font: inherit;
	color: inherit;
	background: color-mix(in srgb, var(--surface) 50%, transparent);
	border: 1.5px solid var(--tag);
	border-radius: 6px;
	padding: 6px 8px;
	margin-bottom: 6px;
	resize: vertical;
}
.social {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px;
	margin-top: 8px;
}
.chip {
	border: 1.5px solid color-mix(in srgb, var(--tag) 30%, transparent);
	background: color-mix(in srgb, var(--surface) 45%, transparent);
	color: inherit;
	border-radius: 999px;
	padding: 1px 8px;
	font-size: 13px;
	font-weight: 700;
}
.chip.mine {
	background: var(--tag);
	border-color: var(--tag);
	color: var(--surface);
}
.chip.add {
	opacity: 0.7;
	font-weight: 500;
}
.picker {
	position: relative;
}
.menu {
	position: absolute;
	left: 0;
	top: calc(100% + 4px);
	z-index: 5;
	display: grid;
	grid-template-columns: repeat(4, 38px);
	gap: 2px;
	padding: 4px;
	background: var(--surface);
	border: 1.5px solid var(--border);
	border-radius: 12px;
	box-shadow: var(--shadow);
	animation: drop 0.2s ease-out;
}
.menu button {
	width: 38px;
	height: 38px;
	padding: 0;
	font-size: 20px;
	line-height: 1;
}
.menu button:hover {
	scale: 1.2;
}
.thread {
	margin-top: 8px;
	padding-top: 8px;
	border-top: 1.5px dashed color-mix(in srgb, var(--tag) 30%, transparent);
	font-size: 14px;
}
.comment {
	margin: 0 0 6px;
	overflow-wrap: anywhere;
}
.comment strong {
	color: var(--tag);
}
.thread input {
	background: color-mix(in srgb, var(--surface) 60%, transparent);
	border-color: color-mix(in srgb, var(--tag) 30%, transparent);
	padding: 5px 10px;
	font-size: 14px;
}
.count {
	display: inline-block;
	animation: pop 0.3s ease-out;
}
.fresh {
	animation: drop 0.45s cubic-bezier(0.3, 1.5, 0.5, 1);
}
.flip {
	animation: flip 0.55s ease-out both;
}
@keyframes drop {
	from {
		opacity: 0;
		translate: 0 -14px;
		scale: 0.92;
	}
}
@keyframes flip {
	from {
		transform: perspective(600px) rotateY(90deg);
		opacity: 0.3;
	}
}
</style>
