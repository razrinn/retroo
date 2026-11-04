<script setup lang="ts">
import Icon from "./Icon.vue";
import { type Pin, usePinClock } from "./lib";

// The host's join PIN as a chip in the header, with a thin line for time left; click for the big join view.
const props = defineProps<{ pin: Pin | null; offset: number }>();
const emit = defineEmits<{ open: [] }>();
const { digits, left } = usePinClock(
	() => props.pin,
	() => props.offset,
);
</script>

<template>
	<button class="pin-chip mono" title="Join PIN: show it on screen" aria-label="Show the join PIN" @click="emit('open')">
		<Icon name="key" />{{ digits }}
		<span class="ring" :style="{ '--left': left }" aria-hidden="true" />
	</button>
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
