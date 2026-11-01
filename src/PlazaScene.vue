<script setup lang="ts">
import Mascot from "./Mascot.vue";
import { type PlazaPerson, hash } from "./lib";

// Draws the plaza: one Stickie per person at their spot, with name and emote bubble. No input or animation
// loop here, so the summary's team photo can use it as is.
export type Shown = PlazaPerson & { left?: boolean; walking?: boolean; sitting?: boolean; bump?: boolean };
defineProps<{ people: Shown[]; emotes: Record<string, { emoji: string; n: number }>; size: number }>();
</script>

<template>
	<div class="scene">
		<div
			v-for="p in people"
			:key="p.id"
			class="who"
			:class="{ away: !p.here, me: p.me, walking: p.walking, sitting: p.sitting, bump: p.bump }"
			:style="{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, zIndex: Math.round(p.y * 100) }"
		>
			<span v-if="emotes[p.id]" :key="emotes[p.id].n" class="bubble">{{ emotes[p.id].emoji }}</span>
			<span v-else-if="!p.here" class="zzz" aria-hidden="true">z</span>
			<span class="body" :class="{ left: p.left }"><Mascot :size="size" :tint="(hash(p.id) % 5) + 1" /></span>
			<span class="name" :style="{ fontSize: `${size / 4}px` }">{{ p.me ? "You" : p.name }}</span>
		</div>
	</div>
</template>

<style scoped>
/* Stickies stack by depth among themselves only, never above dialogs. */
.scene {
	position: absolute;
	inset: 0;
	isolation: isolate;
}
.who {
	position: absolute;
	display: grid;
	justify-items: center;
	translate: -50% -100%;
	pointer-events: none;
}
/* A soft shadow under the feet. */
.body {
	position: relative;
	display: block;
	transition: scale 0.3s;
}
.body::after {
	content: "";
	position: absolute;
	left: 18%;
	right: 18%;
	bottom: -3px;
	height: 6px;
	border-radius: 50%;
	background: rgba(60, 45, 20, 0.18);
	z-index: -1;
}
.left {
	scale: -1 1;
}
.walking .body > :deep(svg) {
	animation: bob 0.32s ease-in-out infinite alternate;
}
.sitting .body > :deep(svg) {
	scale: 1 0.86;
	transform-origin: bottom;
	transition: scale 0.4s;
}
.bump .body > :deep(svg) {
	animation: bump 0.4s ease-out;
}
.away {
	opacity: 0.45;
}
.name {
	margin-top: 2px;
	padding: 0 6px;
	border-radius: 999px;
	font-weight: 700;
	white-space: nowrap;
	color: var(--text, #2a2723);
	background: color-mix(in srgb, var(--surface, #fffdf8) 85%, transparent);
}
.me .name {
	color: var(--accent, #534ab7);
}
.bubble {
	position: absolute;
	bottom: calc(100% - 4px);
	padding: 2px 6px;
	font-size: 18px;
	line-height: 1.2;
	border-radius: 12px 12px 12px 3px;
	background: var(--surface, #fffdf8);
	box-shadow: 0 2px 6px rgba(60, 45, 20, 0.2);
	animation: pop-in 0.3s cubic-bezier(0.3, 1.6, 0.5, 1);
}
.zzz {
	position: absolute;
	bottom: calc(100% - 10px);
	right: 0;
	font-size: 12px;
	font-weight: 800;
	color: var(--muted, #77716a);
}
@keyframes bob {
	to {
		translate: 0 -3px;
		rotate: 3deg;
	}
}
@keyframes bump {
	30% {
		rotate: -10deg;
		translate: -2px 0;
	}
	60% {
		rotate: 6deg;
	}
}
@keyframes pop-in {
	from {
		scale: 0.3;
		opacity: 0;
	}
}
</style>
