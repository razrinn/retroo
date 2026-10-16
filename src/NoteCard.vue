<script setup lang="ts">
import { computed, nextTick, ref } from "vue";
import { type Card, type Phase, hash } from "./lib";

const props = defineProps<{ card: Card; phase: Phase; fresh: boolean; flipIndex: number | null }>();
const emit = defineEmits<{ vote: []; edit: [text: string]; remove: [] }>();

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

const tilt = computed(() => `${((hash(props.card.id) % 7) - 3) * 0.5}deg`);
const delay = computed(() => (props.flipIndex === null ? undefined : `${props.flipIndex * 90}ms`));
</script>

<template>
	<article
		class="note"
		:class="[`note-${card.col}`, { back: card.text === null, fresh, flip: flipIndex !== null }]"
		:style="{ rotate: tilt, animationDelay: delay }"
	>
		<template v-if="card.text === null">
			<span class="peek" aria-hidden="true">🙈</span>
			<span class="who">{{ card.name }}</span>
			<span class="sr-only">wrote a hidden card</span>
		</template>
		<template v-else>
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
				<button
					v-if="phase !== 'writing'"
					class="vote"
					:class="{ voted: card.voted }"
					:disabled="phase === 'locked'"
					:aria-pressed="card.voted"
					:aria-label="`${card.votes} votes${card.voted ? ', you voted' : ''}`"
					@click="$emit('vote')"
				>
					👍 <span :key="card.votes" class="count">{{ card.votes }}</span>
				</button>
			</footer>
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
	transition: rotate 0.2s, translate 0.2s;
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
.peek {
	font-size: 20px;
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
.vote {
	border: 1.5px solid color-mix(in srgb, var(--tag) 35%, transparent);
	background: transparent;
	color: inherit;
	border-radius: 999px;
	padding: 1px 10px;
	font-size: 13px;
}
.vote.voted {
	background: var(--tag);
	border-color: var(--tag);
	color: var(--surface);
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
