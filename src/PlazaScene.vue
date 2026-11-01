<script setup lang="ts">
import Mascot from "./Mascot.vue";
import { type PlazaPerson, hash } from "./lib";

// Draws the plaza: one Stickie per person at their spot, with name and emote bubble. No input or animation
// loop here, so the summary's team photo can use it as is.
export type Shown = PlazaPerson & { left?: boolean; walking?: boolean; sitting?: boolean; bump?: boolean };
defineProps<{ people: Shown[]; emotes: Record<string, { emoji: string; n: number }>; size: number }>();

// The office, in plaza units (160 × 100, the plaza's 16:10). The back wall sits above where anyone can walk.
const PLANKS = Array.from({ length: 12 }, (_, i) => 27 + i * 6.2);
const SEAMS = PLANKS.flatMap((y, i) => [0, 1, 2, 3].map((k) => [((i % 2) * 20 + k * 40 + 12) % 160, y]));
</script>

<template>
	<div class="scene">
		<svg class="ground" viewBox="0 0 160 100" preserveAspectRatio="none" aria-hidden="true">
			<!-- Wooden floor. -->
			<rect width="160" height="100" fill="#efdfc3" />
			<path v-for="y in PLANKS" :key="`p${y}`" :d="`M0 ${y}H160`" stroke="#e2cca6" stroke-width="0.5" />
			<path v-for="([x, y], i) in SEAMS" :key="`s${i}`" :d="`M${x} ${y}v6.2`" stroke="#e2cca6" stroke-width="0.5" />
			<!-- Rug in the middle. -->
			<rect x="40" y="46" width="80" height="38" rx="6" fill="#e8e5ff" stroke="#cecbf6" stroke-width="1.2" />
			<rect x="44" y="50" width="72" height="30" rx="4" fill="none" stroke="#afa9ec" stroke-width="0.5" stroke-dasharray="2 1.5" />
			<!-- Back wall. -->
			<rect width="160" height="26" fill="#f6f1e7" />
			<rect y="25" width="160" height="2" fill="#d9cbb0" />
			<!-- Window with a cloud. -->
			<rect x="8" y="4" width="28" height="15" rx="1" fill="#cfe9f7" stroke="#c9b08a" stroke-width="1.2" />
			<path d="M22 4v15M8 11.5h28" stroke="#c9b08a" stroke-width="0.8" />
			<path d="M11 9a2 2 0 0 1 3.5-1.2a2.4 2.4 0 0 1 4.3 1.2z" fill="#fffdf8" />
			<!-- Plant between the window and the whiteboard. -->
			<ellipse cx="44" cy="15" rx="2.2" ry="5" fill="#5dcaa5" transform="rotate(-25 44 15)" />
			<ellipse cx="47" cy="14" rx="2.2" ry="5.5" fill="#1d9e75" transform="rotate(15 47 14)" />
			<ellipse cx="45.5" cy="12.5" rx="2" ry="5" fill="#9fe1cb" />
			<path d="M42 19h7l-1 8h-5z" fill="#e08b5f" stroke="#993c1d" stroke-width="0.6" stroke-linejoin="round" />
			<!-- The whiteboard, covered in sticky notes. -->
			<rect x="56" y="3" width="50" height="17" rx="1" fill="#fffdf8" stroke="#b4b2a9" stroke-width="1" />
			<rect x="60" y="6" width="6" height="5" fill="#9fe1cb" transform="rotate(-4 63 8.5)" />
			<rect x="68" y="7" width="6" height="5" fill="#9fe1cb" transform="rotate(3 71 9.5)" />
			<rect x="79" y="6" width="6" height="5" fill="#fac775" transform="rotate(5 82 8.5)" />
			<rect x="87" y="9" width="6" height="5" fill="#f5c4b3" transform="rotate(-3 90 11.5)" />
			<rect x="97" y="6" width="6" height="5" fill="#cecbf6" transform="rotate(-6 100 8.5)" />
			<path d="M60 15.5h10M79 16.5h12M96 13.5h7" stroke="#d3d1c7" stroke-width="0.6" stroke-linecap="round" />
			<rect x="70" y="20" width="22" height="1.4" rx="0.5" fill="#b4b2a9" />
			<!-- Clock. -->
			<circle cx="118" cy="9" r="4.5" fill="#fffdf8" stroke="#5f5e5a" stroke-width="0.9" />
			<path d="M118 9V6.3M118 9l1.8 1.2" stroke="#26215c" stroke-width="0.7" stroke-linecap="round" />
			<!-- Coffee counter. -->
			<rect x="130" y="16" width="27" height="11" fill="#c08a5a" stroke="#854f0b" stroke-width="0.7" />
			<rect x="129" y="15" width="29" height="2" rx="0.6" fill="#d9a066" stroke="#854f0b" stroke-width="0.6" />
			<rect x="134" y="7" width="9" height="8" rx="1" fill="#5f5e5a" />
			<rect x="136" y="11" width="5" height="3" rx="0.5" fill="#2a2723" />
			<path d="M148 11h4v4h-4zM152 12h1.2v2H152" fill="#fffdf8" stroke="#888780" stroke-width="0.5" />
			<path d="M149.5 10q.6-1 0-2M151 10q.6-1 0-2" fill="none" stroke="#b4b2a9" stroke-width="0.4" stroke-linecap="round" />
			<!-- Potted plants in the front corners. -->
			<g v-for="x in [9, 151]" :key="`pl${x}`">
				<ellipse :cx="x - 3" :cy="88" rx="2.6" ry="6" fill="#5dcaa5" :transform="`rotate(-25 ${x - 3} 88)`" />
				<ellipse :cx="x + 3" :cy="88" rx="2.6" ry="6" fill="#1d9e75" :transform="`rotate(25 ${x + 3} 88)`" />
				<ellipse :cx="x" :cy="86" rx="2.4" ry="6.5" fill="#9fe1cb" />
				<path :d="`M${x - 5} 92h10l-1.5 8h-7z`" fill="#e08b5f" stroke="#993c1d" stroke-width="0.6" stroke-linejoin="round" />
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
