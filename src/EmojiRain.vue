<script setup lang="ts">
import { ref } from "vue";
import { REACTIONS } from "./lib";

// Emoji rain: tap an emoji and it floats up on everyone's screen. Nothing is stored.
const emit = defineEmits<{ send: [emoji: string] }>();

type Drop = { id: number; emoji: string; name: string; x: number; drift: number; size: number };
const drops = ref<Drop[]>([]);
const open = ref(false);
let nextId = 0;

function drop(emoji: string, name: string) {
	const d = { id: nextId++, emoji, name, x: 8 + Math.random() * 84, drift: (Math.random() - 0.5) * 120, size: 30 + Math.random() * 18 };
	drops.value.push(d);
	setTimeout(() => (drops.value = drops.value.filter((x) => x !== d)), 2600);
}
defineExpose({ drop });
</script>

<template>
	<div class="rain" aria-hidden="true">
		<span
			v-for="d in drops"
			:key="d.id"
			class="drop"
			:style="{ left: `${d.x}%`, fontSize: `${d.size}px`, '--drift': `${d.drift}px` }"
		>
			{{ d.emoji }}<small>{{ d.name }}</small>
		</span>
	</div>
	<div class="bar">
		<template v-if="open">
			<button v-for="e in REACTIONS" :key="e" class="ghost" :aria-label="`Send ${e} to everyone`" @click="emit('send', e)">{{ e }}</button>
		</template>
		<button class="toggle" :aria-expanded="open" :aria-label="open ? 'Close emoji rain' : 'Open emoji rain'" @click="open = !open">
			{{ open ? "✕" : "🎉" }}
		</button>
	</div>
</template>

<style scoped>
.rain {
	position: fixed;
	inset: 0;
	pointer-events: none;
	overflow: hidden;
	z-index: 60;
}
.drop {
	position: absolute;
	bottom: -60px;
	display: grid;
	justify-items: center;
	line-height: 1;
	animation: rise 2.6s cubic-bezier(0.25, 0.6, 0.4, 1) forwards;
}
.drop small {
	font-size: 11px;
	font-weight: 700;
	color: var(--muted);
	background: var(--surface);
	border-radius: 999px;
	padding: 1px 6px;
	margin-top: 2px;
}
@keyframes rise {
	15% {
		opacity: 1;
	}
	to {
		translate: var(--drift) -80vh;
		opacity: 0;
		rotate: 20deg;
	}
}
.bar {
	position: fixed;
	right: 16px;
	bottom: 16px;
	z-index: 55;
	display: flex;
	flex-wrap: wrap;
	justify-content: flex-end;
	gap: 2px;
	max-width: calc(100vw - 32px);
	padding: 4px;
	background: var(--surface);
	border: 1.5px solid var(--border);
	border-radius: 999px;
	box-shadow: var(--shadow);
}
.bar button {
	font-size: 22px;
	width: 44px;
	height: 44px;
	padding: 0;
	border-radius: 50%;
}
.bar button.ghost:hover {
	scale: 1.15;
}
.toggle {
	border: none;
	background: var(--accent-soft);
}
</style>
