<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import ConfirmButton from "./ConfirmButton.vue";
import Icon from "./Icon.vue";
import Mascot from "./Mascot.vue";
import { formatCode, useFocusTrap } from "./lib";

// The big join view the host shares on screen: where to go, the PIN, and time left on it.
const props = defineProps<{ code: string; digits: string; left: number }>();
const emit = defineEmits<{ reset: []; close: [] }>();
const link = `${location.host}/b/${formatCode(props.code)}`;

const dialog = ref<HTMLElement>();
useFocusTrap(dialog);
const onKey = (e: KeyboardEvent) => e.key === "Escape" && emit("close");
onMounted(() => addEventListener("keydown", onKey));
onUnmounted(() => removeEventListener("keydown", onKey));
</script>

<template>
	<div ref="dialog" class="join-view" role="dialog" aria-modal="true" aria-label="Join this retro" @click.self="emit('close')">
		<article class="sheet">
			<button class="ghost close" title="Close" aria-label="Close" @click="emit('close')"><Icon name="close" /></button>
			<Mascot :size="72" :mood="5" />
			<h1>Join this retro</h1>
			<p class="muted">Open <strong class="mono">{{ link }}</strong> and enter:</p>
			<p class="digits mono" aria-live="polite">{{ digits }}</p>
			<div class="bar" aria-hidden="true"><span :style="{ width: `${left * 100}%` }" /></div>
			<p class="muted small">A new PIN every minute. Once you're in, you stay in.</p>
			<ConfirmButton ask="Disconnect everyone? They'll need the new PIN." yes="Reset access" danger class="ghost small" @confirm="emit('reset')">
				Reset access
			</ConfirmButton>
		</article>
	</div>
</template>

<style scoped>
.join-view {
	position: fixed;
	inset: 0;
	z-index: 60;
	display: grid;
	place-items: center;
	padding: 24px 16px;
	background: color-mix(in srgb, var(--text) 28%, transparent);
	backdrop-filter: blur(3px);
}
.sheet {
	position: relative;
	width: min(560px, 100%);
	padding: 32px 24px 24px;
	display: grid;
	justify-items: center;
	gap: 10px;
	text-align: center;
	background: var(--surface);
	border-radius: 22px;
	box-shadow: 0 24px 60px -20px rgba(40, 30, 10, 0.45);
}
.close {
	position: absolute;
	top: 12px;
	right: 12px;
	display: grid;
	place-items: center;
	width: 34px;
	height: 34px;
	padding: 0;
	border-radius: 50%;
}
h1 {
	font-size: 26px;
}
.sheet p {
	margin: 0;
}
.digits {
	font-size: clamp(48px, 12vw, 88px);
	font-weight: 800;
	letter-spacing: 6px;
	color: var(--accent);
	line-height: 1.1;
}
.bar {
	width: 60%;
	height: 6px;
	border-radius: 6px;
	background: var(--accent-soft);
	overflow: hidden;
}
.bar span {
	display: block;
	height: 100%;
	background: var(--accent);
	transition: width 0.25s linear;
}
.small {
	font-size: 13px;
}
</style>
