<script setup lang="ts">
import Mascot from "./Mascot.vue";
import { type PlazaPerson, hash } from "./lib";

// Draws the plaza: one Stickie per person at their spot, with name and emote bubble. No input or animation
// loop here, so the summary's team photo can use it as is.
export type Shown = PlazaPerson & { left?: boolean; walking?: boolean; sitting?: boolean; bump?: boolean };
defineProps<{ people: Shown[]; emotes: Record<string, { emoji: string; n: number }>; size: number }>();

// The park, in plaza units (160 × 100, the plaza's 16:10). The tree line sits above where anyone can walk.
const TUFTS = [[22, 46], [48, 38], [92, 48], [126, 44], [16, 64], [60, 86], [104, 92], [140, 74], [74, 34], [150, 52], [36, 90], [118, 62]];
const TREES = [[6, 10, 11], [22, 7, 10], [40, 11, 12], [58, 6, 10], [77, 10, 12], [96, 7, 11], [114, 11, 10], [131, 6, 12], [150, 10, 11]];
const FLOWERS = [
	[10, 90, "#F0997B"], [15, 94, "#FAC775"], [8, 96, "#CECBF6"], [146, 88, "#CECBF6"], [152, 93, "#F0997B"],
	[141, 94, "#FAC775"], [84, 40, "#F0997B"], [88, 43, "#FAC775"], [52, 58, "#CECBF6"], [112, 82, "#F0997B"],
] as const;
</script>

<template>
	<div class="scene">
		<svg class="ground" viewBox="0 0 160 100" preserveAspectRatio="none" aria-hidden="true">
			<rect width="160" height="100" fill="#d4ebc4" />
			<!-- A winding path across the lawn. -->
			<path d="M-6 80C36 62 66 96 108 72S150 50 166 56" fill="none" stroke="#e2d3b3" stroke-width="13" stroke-linecap="round" />
			<path d="M-6 80C36 62 66 96 108 72S150 50 166 56" fill="none" stroke="#f3e9d2" stroke-width="10.5" stroke-linecap="round" />
			<path v-for="([x, y], i) in TUFTS" :key="`t${i}`" :d="`M${x - 2} ${y}l1-2.5l1 2.5l1-3l1 3`" fill="none" stroke="#a9d394" stroke-width="0.7" stroke-linejoin="round" />
			<!-- Pond and bench under the trees. -->
			<ellipse cx="136" cy="29" rx="14" ry="6" fill="#a9d8ef" stroke="#85b7eb" stroke-width="1" />
			<path d="M128 28q4-1.5 8 0M138 31q3-1 6 0" fill="none" stroke="#e6f5fc" stroke-width="0.8" stroke-linecap="round" />
			<g stroke="#854f0b" stroke-width="0.8" stroke-linejoin="round">
				<rect x="24" y="22" width="16" height="2.5" rx="0.8" fill="#d9a066" />
				<rect x="23" y="26" width="18" height="2.5" rx="0.8" fill="#c08a5a" />
				<path d="M25 28.5v3M39 28.5v3" fill="none" />
			</g>
			<!-- Tree line along the top. -->
			<rect width="160" height="9" fill="#9fd09a" />
			<g v-for="([x, y, r], i) in TREES" :key="`tr${i}`">
				<rect :x="x - 1.2" :y="y + r * 0.5" width="2.4" :height="r * 0.75" rx="0.6" fill="#9c6b45" />
				<circle :cx="x" :cy="y" :r="r" fill="#6fbf80" stroke="#0f6e56" stroke-width="0.8" />
				<circle :cx="x - r * 0.35" :cy="y - r * 0.35" :r="r * 0.35" fill="#a6dcae" />
			</g>
			<g v-for="([x, y, c], i) in FLOWERS" :key="`f${i}`">
				<circle :cx="x" :cy="y" r="1.5" :fill="c" />
				<circle :cx="x" :cy="y" r="0.55" fill="#fffdf8" />
			</g>
		</svg>
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
.ground {
	position: absolute;
	inset: 0;
	width: 100%;
	height: 100%;
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
