<script setup lang="ts">
import { ref } from "vue";
import { REACTIONS } from "./lib";
import { sounds } from "./sound";

// Emoji rain: tap an emoji and it floats up on everyone's screen. Nothing is stored.
const emit = defineEmits<{ send: [emoji: string] }>();

type Drop = { id: number; emoji: string; name: string; x: number; drift: number; size: number; delay: number };
type Combo = { id: number; emoji: string; people: string[]; names: string[]; count: number; pulse: number; leaving: boolean; timer: number };
const PER_BURST = 6;
// Combo: when COMBO_PEOPLE different people send the same emoji within COMBO_WINDOW ms, their rain
// collapses into one big emoji in the middle (like Google Meet). More of it bumps the counter.
const COMBO_PEOPLE = 3;
const COMBO_WINDOW = 1500;
const COMBO_HOLD = 1600;
const drops = ref<Drop[]>([]);
const combos = ref<Combo[]>([]);
const recent = new Map<string, { from: string; name: string; at: number }[]>();
const open = ref(false);
let nextId = 0;

function holdCombo(c: Combo) {
	clearTimeout(c.timer);
	c.timer = setTimeout(() => {
		c.leaving = true;
		setTimeout(() => (combos.value = combos.value.filter((x) => x.id !== c.id)), 400);
	}, COMBO_HOLD);
}

// People are told apart by `from` (an opaque tag from the server), so two people with the same name still count twice.
function drop(emoji: string, name: string, from = name) {
	const combo = combos.value.find((c) => c.emoji === emoji && !c.leaving);
	if (combo) {
		combo.count++;
		combo.pulse++;
		if (!combo.people.includes(from)) combo.people.push(from);
		if (name && !combo.names.includes(name)) combo.names.push(name);
		holdCombo(combo);
		return;
	}
	const now = Date.now();
	const seen = [...(recent.get(emoji) ?? []).filter((r) => now - r.at < COMBO_WINDOW), { from, name, at: now }];
	recent.set(emoji, seen);
	const people = [...new Set(seen.map((r) => r.from))];
	if (people.length >= COMBO_PEOPLE) {
		recent.delete(emoji);
		drops.value = drops.value.filter((d) => d.emoji !== emoji);
		const names = [...new Set(seen.map((r) => r.name).filter(Boolean))];
		combos.value.push({ id: nextId++, emoji, people, names, count: seen.length, pulse: 0, leaving: false, timer: 0 });
		holdCombo(combos.value[combos.value.length - 1]);
		sounds.combo();
		return;
	}
	rain(emoji, name);
}

// One burst message becomes a small cluster around a random spot; only the first one carries the name.
function rain(emoji: string, name: string) {
	const center = 12 + Math.random() * 76;
	const batch = Array.from({ length: PER_BURST }, (_, i) => ({
		id: nextId++,
		emoji,
		name: i === 0 ? name : "",
		x: Math.min(96, Math.max(2, center + (Math.random() - 0.5) * 16)),
		drift: (Math.random() - 0.5) * 160,
		size: (i === 0 ? 40 : 22) + Math.random() * 16,
		delay: i * 70 + Math.random() * 60,
	}));
	drops.value.push(...batch);
	// Compare ids, not objects: the array hands back reactive copies, so object identity never matches.
	const ids = new Set(batch.map((d) => d.id));
	setTimeout(() => (drops.value = drops.value.filter((d) => !ids.has(d.id))), 3200);
}
defineExpose({ drop });
</script>

<template>
	<div class="rain" aria-hidden="true">
		<span
			v-for="d in drops"
			:key="d.id"
			class="drop"
			:style="{ left: `${d.x}%`, fontSize: `${d.size}px`, '--drift': `${d.drift}px`, animationDelay: `${d.delay}ms` }"
		>
			{{ d.emoji }}<small v-if="d.name">{{ d.name }}</small>
		</span>
		<div class="combos">
			<div v-for="c in combos" :key="c.id" class="combo" :class="{ leaving: c.leaving }">
				<span :key="c.pulse" class="big">{{ c.emoji }}</span>
				<strong :key="`n${c.count}`" class="count">×{{ c.count }}</strong>
				<small v-if="c.names.length">{{ c.names.slice(0, 2).join(", ") }}<template v-if="c.people.length > 2"> +{{ c.people.length - 2 }}</template></small>
				<small v-else>{{ c.people.length }} people</small>
			</div>
		</div>
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
	opacity: 0;
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
	from,
	60% {
		opacity: 1;
	}
	to {
		translate: var(--drift) -80vh;
		opacity: 0;
		rotate: 20deg;
	}
}
.combos {
	position: absolute;
	inset: 0;
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 48px;
}
.combo {
	display: grid;
	justify-items: center;
	gap: 4px;
	animation: combo-in 0.45s cubic-bezier(0.3, 1.6, 0.5, 1) both;
	transition: opacity 0.4s, scale 0.4s;
}
.combo.leaving {
	opacity: 0;
	scale: 0.6;
}
.combo .big {
	font-size: 128px;
	line-height: 1;
	filter: drop-shadow(0 10px 18px rgba(60, 45, 20, 0.25));
	animation: combo-pulse 0.35s ease-out;
}
.combo .count {
	font-size: 28px;
	font-weight: 800;
	color: var(--text);
	background: var(--surface);
	border-radius: 999px;
	padding: 0 14px;
	box-shadow: var(--shadow);
	animation: pop 0.3s ease-out;
}
.combo small {
	font-size: 13px;
	font-weight: 700;
	color: var(--muted);
}
@keyframes combo-in {
	from {
		opacity: 0;
		scale: 0.2;
		rotate: -15deg;
	}
}
@keyframes combo-pulse {
	40% {
		scale: 1.18;
		rotate: 6deg;
	}
}
/* Without motion the drops just appear briefly near the bottom instead of floating up. */
@media (prefers-reduced-motion: reduce) {
	.drop {
		opacity: 1;
		bottom: 72px;
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
