<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import Icon from "./Icon.vue";
import JoinView from "./JoinView.vue";

// The host's join PIN as a chip in the header; click for the big view to share on screen. The PIN changes
// every minute; `until` is when (server time; `offset` is server minus this clock).
const props = defineProps<{ code: string; pin: { value: string; until: number } | null; offset: number }>();
const emit = defineEmits<{ reset: [] }>();

const big = ref(false);
const now = ref(Date.now());
let clock = 0;
onMounted(() => (clock = setInterval(() => (now.value = Date.now()), 250)));
onUnmounted(() => clearInterval(clock));
const left = computed(() => (props.pin ? Math.max(0, props.pin.until - (now.value + props.offset)) / 60_000 : 0));
const spaced = computed(() => (props.pin ? `${props.pin.value.slice(0, 3)} ${props.pin.value.slice(3)}` : "··· ···"));
</script>

<template>
	<button class="pin-chip mono" title="Join PIN: show it on screen" aria-label="Show the join PIN" @click="big = true">
		<Icon name="key" />{{ spaced }}
		<span class="ring" :style="{ '--left': left }" aria-hidden="true" />
	</button>
	<Teleport to="body">
		<JoinView v-if="big" :code="code" :digits="spaced" :left="left" @reset="emit('reset')" @close="big = false" />
	</Teleport>
</template>

<style scoped>
.pin-chip {
	position: relative;
	display: inline-flex;
	align-items: center;
	gap: 6px;
	padding: 4px 12px;
	font-size: 15px;
	font-weight: 800;
	letter-spacing: 1px;
	border-radius: 999px;
	color: var(--accent);
	background: var(--accent-soft);
	border: 1.5px solid color-mix(in srgb, var(--accent) 35%, transparent);
}
/* Time left on this PIN, as a thin line under the chip. */
.ring {
	position: absolute;
	left: 12px;
	right: 12px;
	bottom: 2px;
	height: 2px;
	border-radius: 2px;
	background: linear-gradient(90deg, var(--accent) calc(var(--left) * 100%), transparent 0);
	opacity: 0.6;
}
</style>
