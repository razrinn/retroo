<script setup lang="ts">
import { computed, onUnmounted, ref } from "vue";

// `offset` is server time minus this browser's time, so everyone's countdown agrees even with skewed clocks.
const props = defineProps<{ end: number | null; offset: number }>();
const emit = defineEmits<{ set: [seconds: number] }>();

const now = ref(Date.now());
const tick = setInterval(() => (now.value = Date.now()), 250);
onUnmounted(() => clearInterval(tick));

const open = ref(false);
const remaining = computed(() => (props.end ? Math.max(0, props.end - (now.value + props.offset)) : null));
const label = computed(() => {
	const s = Math.ceil((remaining.value ?? 0) / 1000);
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
});
// Ring fraction, guessed from the closest preset since only the end time is shared.
const fraction = computed(() => {
	const r = remaining.value ?? 0;
	return r / ([180_000, 300_000, 600_000].find((t) => t >= r - 1000) ?? 600_000);
});

function start(seconds: number) {
	open.value = false;
	emit("set", seconds);
}
</script>

<template>
	<div class="timer">
		<template v-if="remaining === null">
			<button class="ghost" :aria-expanded="open" @click="open = !open">Timer</button>
			<div v-if="open" class="menu">
				<button v-for="m in [3, 5, 10]" :key="m" class="ghost" @click="start(m * 60)">{{ m }} min</button>
			</div>
		</template>
		<button v-else-if="remaining === 0" class="up" @click="emit('set', 0)">Time's up</button>
		<div v-else class="running" :class="{ low: remaining < 30_000 }" role="timer" :aria-label="`${label} left`">
			<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
				<circle cx="11" cy="11" r="8" class="track" />
				<circle cx="11" cy="11" r="8" class="fill" :stroke-dasharray="`${fraction * 50.3} 50.3`" />
			</svg>
			<span class="mono">{{ label }}</span>
			<button class="ghost small" aria-label="Stop timer" @click="emit('set', 0)">✕</button>
		</div>
	</div>
</template>

<style scoped>
.timer {
	position: relative;
}
.menu {
	position: absolute;
	right: 0;
	top: calc(100% + 6px);
	z-index: 10;
	display: grid;
	background: var(--surface);
	border: 1.5px solid var(--border);
	border-radius: 12px;
	padding: 4px;
	box-shadow: var(--shadow);
}
.running {
	display: flex;
	align-items: center;
	gap: 6px;
	border: 1.5px solid var(--border);
	border-radius: 999px;
	padding: 2px 4px 2px 8px;
	background: var(--surface);
	font-weight: 700;
}
svg {
	rotate: -90deg;
}
circle {
	fill: none;
	stroke-width: 3;
}
.track {
	stroke: var(--border);
}
.fill {
	stroke: var(--ok);
	stroke-linecap: round;
	transition: stroke-dasharray 0.25s linear;
}
.low {
	color: var(--danger);
}
.low .fill {
	stroke: var(--danger);
}
.up {
	background: var(--danger);
	border-color: var(--danger);
	color: var(--surface);
	animation: pulse 1s ease-in-out infinite;
}
@keyframes pulse {
	50% {
		scale: 1.06;
	}
}
</style>
