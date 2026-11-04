<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import ConfirmButton from "./ConfirmButton.vue";
import Icon from "./Icon.vue";
import Mascot from "./Mascot.vue";
import { type Pin, formatCode, useFocusTrap, usePinClock } from "./lib";

// The big join view the host shares on screen: where to go, the PIN, and time left on it. Also the links:
// an invite with the PIN (for people not watching the screen) and a host link (to host from another device).
// Both carry their secret after "#", which browsers never send to a server.
const props = defineProps<{ code: string; pin: Pin | null; offset: number; hostKey: string }>();
const emit = defineEmits<{ reset: []; close: [] }>();
const { digits, left } = usePinClock(
	() => props.pin,
	() => props.offset,
);
const link = `${location.host}/b/${formatCode(props.code)}`;
const copied = ref("");
async function copy(what: "invite" | "host") {
	const url = `${location.origin}/b/${formatCode(props.code)}#${what === "invite" ? `pin=${props.pin?.value}` : `host=${props.hostKey}`}`;
	await navigator.clipboard?.writeText(url);
	copied.value = what;
	setTimeout(() => copied.value === what && (copied.value = ""), 1600);
}

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
			<div class="row links">
				<button class="icon-btn" :disabled="!pin" title="Copy a join link with this PIN (works for about 2 minutes)" @click="copy('invite')">
					<Icon name="copy" /><span class="lbl">{{ copied === "invite" ? "Copied" : "Copy invite" }}</span>
				</button>
				<button class="ghost icon-btn" title="Copy a link that makes another device a host too. Keep it to yourself." @click="copy('host')">
					<Icon name="key" /><span class="lbl">{{ copied === "host" ? "Copied" : "Copy host link" }}</span>
				</button>
				<ConfirmButton ask="Disconnect everyone? They'll need the new PIN." yes="Reset access" danger class="ghost small" @confirm="emit('reset')">
					Reset access
				</ConfirmButton>
			</div>
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
.links {
	flex-wrap: wrap;
	justify-content: center;
	gap: 6px;
	margin-top: 6px;
}
</style>
