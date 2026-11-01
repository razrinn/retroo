<script setup lang="ts">
import { type Component, computed, onMounted, onUnmounted, ref, watch } from "vue";
import Icon from "./Icon.vue";
import Mascot from "./Mascot.vue";
import { type BoardState, confetti, reducedMotion, useFocusTrap } from "./lib";
import { type Pick } from "./shows";
import { sounds } from "./sound";
import Wheel from "./shows/Wheel.vue";

// Next MC: the team roster and a pick. A pick opens this on every screen and plays the same show,
// ending on the winner card. The server chooses the show, never the same one twice in a row.
const props = defineProps<{ team: BoardState["team"]; locked: boolean; pick: Pick | null }>();
const emit = defineEmits<{ send: [msg: object]; close: [] }>();

const SHOW_VIEWS: Partial<Record<Pick["show"], Component>> = { wheel: Wheel };
const view = computed(() => (props.pick ? (SHOW_VIEWS[props.pick.show] ?? Wheel) : null));

// playing → the show; revealed → winner card; otherwise the roster.
const playing = ref(false);
watch(
	() => props.pick,
	(p) => {
		playing.value = !!p && !reducedMotion();
		if (p && !playing.value) reveal();
	},
	{ immediate: true },
);
function reveal() {
	playing.value = false;
	sounds.fanfare();
	confetti();
}

const draft = ref("");
function add() {
	if (draft.value.trim()) emit("send", { type: "roster_add", text: draft.value.trim() });
	draft.value = "";
}
const left = computed(() => props.team.roster.filter((m) => !m.done).length);

const dialog = ref<HTMLElement>();
useFocusTrap(dialog);
const onKey = (e: KeyboardEvent) => e.key === "Escape" && !playing.value && emit("close");
onMounted(() => addEventListener("keydown", onKey));
onUnmounted(() => removeEventListener("keydown", onKey));
</script>

<template>
	<div ref="dialog" class="picker" role="dialog" aria-modal="true" aria-label="Next MC" @click.self="!playing && emit('close')">
		<article class="sheet">
			<header>
				<h1>Next MC</h1>
				<span class="spacer" />
				<button v-if="playing" class="ghost small" @click="reveal">Skip</button>
				<button v-else class="ghost close" title="Close" aria-label="Close" @click="emit('close')"><Icon name="close" /></button>
			</header>

			<div v-if="pick && playing" class="stage">
				<component :is="view" :names="pick.names" :winner="pick.winner" :seed="pick.seed" @done="reveal" />
			</div>

			<div v-else-if="pick" class="winner" role="status">
				<div class="crowned">
					<span class="crown" aria-hidden="true">👑</span>
					<Mascot :size="110" :mood="5" />
				</div>
				<p class="muted">Next retro's MC</p>
				<p class="name">{{ pick.winner }}</p>
				<div class="row actions">
					<button class="ghost" :disabled="locked" @click="emit('send', { type: 'pick' })">Pick again</button>
					<button class="primary" @click="emit('close')">Done</button>
				</div>
			</div>

			<template v-else>
				<p v-if="team.mc" class="current">Next MC: <strong>{{ team.mc }}</strong></p>
				<ul class="roster">
					<li v-for="m in team.roster" :key="m.name" :class="{ done: m.done }" :title="m.done ? 'Had a turn' : ''">
						{{ m.name }}
						<button v-if="!locked" class="ghost x" :aria-label="`Remove ${m.name}`" @click="emit('send', { type: 'roster_remove', name: m.name })">
							<Icon name="close" />
						</button>
					</li>
				</ul>
				<form v-if="!locked" class="add" @submit.prevent="add">
					<input v-model="draft" maxlength="40" placeholder="Add a teammate" aria-label="Add a teammate" />
				</form>
				<p class="muted hint">
					<template v-if="team.roster.length < 2">Add the team's names (at least 2). The list carries over to the next retro.</template>
					<template v-else>Picks from the {{ left || team.roster.length }} who haven't been MC yet. Faded names already had a turn.</template>
				</p>
				<button class="primary go" :disabled="locked || team.roster.length < 2" @click="emit('send', { type: 'pick' })">
					{{ team.mc ? "Pick again" : "Pick the next MC" }}
				</button>
			</template>
		</article>
	</div>
</template>

<style scoped>
.picker {
	position: fixed;
	inset: 0;
	z-index: 50;
	overflow-y: auto;
	display: grid;
	place-items: center;
	padding: 24px 16px;
	background: color-mix(in srgb, var(--text) 28%, transparent);
	backdrop-filter: blur(3px);
}
.sheet {
	width: min(720px, 100%);
	padding: 18px 20px 20px;
	display: grid;
	gap: 14px;
	background: var(--surface);
	border-radius: 18px;
	box-shadow: 0 24px 60px -20px rgba(40, 30, 10, 0.45);
	animation: rise-in 0.3s cubic-bezier(0.3, 1.3, 0.5, 1);
}
@keyframes rise-in {
	from {
		opacity: 0;
		translate: 0 16px;
	}
}
header {
	display: flex;
	align-items: center;
}
h1 {
	font-size: 20px;
}
.close {
	display: grid;
	place-items: center;
	width: 34px;
	height: 34px;
	padding: 0;
	border-radius: 50%;
}
.stage {
	border-radius: 12px;
	overflow: hidden;
	background: var(--bg);
}
.stage :deep(.show) {
	display: block;
	width: 100%;
	height: auto;
}
.current {
	margin: 0;
}
.roster {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	margin: 0;
	padding: 0;
	list-style: none;
}
.roster li {
	display: flex;
	align-items: center;
	gap: 2px;
	padding: 4px 6px 4px 12px;
	border-radius: 999px;
	font-weight: 600;
	background: var(--accent-soft);
	color: var(--accent);
}
.roster li.done {
	opacity: 0.45;
}
.x {
	display: grid;
	place-items: center;
	width: 22px;
	height: 22px;
	padding: 0;
	border-radius: 50%;
	color: inherit;
}
.x :deep(.icon) {
	width: 14px;
	height: 14px;
}
.hint {
	margin: 0;
	font-size: 13px;
}
.go {
	justify-self: start;
}
.winner {
	display: grid;
	justify-items: center;
	padding: 10px 0 4px;
	text-align: center;
}
.crowned {
	position: relative;
	animation: rise-in 0.5s cubic-bezier(0.3, 1.6, 0.5, 1);
}
.crown {
	position: absolute;
	top: -26px;
	left: 50%;
	translate: -50% 0;
	rotate: -8deg;
	font-size: 44px;
	animation: crown 0.6s 0.2s cubic-bezier(0.3, 1.6, 0.5, 1) both;
}
@keyframes crown {
	from {
		translate: -50% -60px;
		opacity: 0;
	}
}
.winner p {
	margin: 0;
}
.name {
	font-size: 34px;
	font-weight: 800;
	color: var(--accent);
}
.actions {
	gap: 8px;
	margin-top: 14px;
}
</style>
