<script setup lang="ts">
import Mascot from "./Mascot.vue";
import { type PlazaPerson, hash } from "./lib";

// Draws the plaza: one Stickie per person at their spot, with name and emote bubble. No input or animation
// loop here, so the summary's team photo can use it as is.
export type Shown = PlazaPerson & { left?: boolean; walking?: boolean; sitting?: boolean; bump?: boolean };
defineProps<{ people: Shown[]; emotes: Record<string, { emoji: string; n: number }>; size: number }>();

// The office in plaza units (160 × 100, the plaza's 16:10), drawn in one-point perspective: the back wall
// spans x 22..138 down to y 32, the side walls and floor open out to the front edge (onFloor in lib.ts).
const BACK = 32;
const at = (y: number) => (22 * (100 - y)) / 68; // left edge of the floor at depth y
// Floor boards run toward the back wall; cross seams get closer together further away.
const BOARDS = Array.from({ length: 11 }, (_, i) => `M${22 + (116 * i) / 10} ${BACK}L${(160 * i) / 10} 100`);
const ROWS = [0.06, 0.14, 0.24, 0.37, 0.52, 0.7, 0.9].map((t) => BACK + 68 * t).map((y) => `M${at(y)} ${y}H${160 - at(y)}`);

// Furniture stands on the floor like people do: placed by its base point and layered by depth, so a Stickie
// can walk behind a desk or in front of the sofa. x, y: base point; w: width; all as fractions of the plaza.
const PROPS = [
	{ kind: "shelf", x: 0.21, y: 0.4, w: 0.13 },
	{ kind: "cooler", x: 0.8, y: 0.4, w: 0.045 },
	{ kind: "plant", x: 0.88, y: 0.42, w: 0.055 },
	{ kind: "desk", x: 0.28, y: 0.58, w: 0.19 },
	{ kind: "chair", x: 0.28, y: 0.66, w: 0.06 },
	{ kind: "desk", x: 0.72, y: 0.58, w: 0.19 },
	{ kind: "chair", x: 0.72, y: 0.66, w: 0.06 },
	{ kind: "table", x: 0.5, y: 0.8, w: 0.15 },
	{ kind: "sofa", x: 0.17, y: 0.97, w: 0.22 },
	{ kind: "plant", x: 0.93, y: 0.99, w: 0.08 },
];
const BOOKS = ["#d85a30", "#ef9f27", "#1d9e75", "#7f77dd", "#378add", "#f5c4b3", "#5f5e5a"];
</script>

<template>
	<div class="scene">
		<svg class="ground" viewBox="0 0 160 100" preserveAspectRatio="none" aria-hidden="true">
			<defs>
				<linearGradient id="plaza-floor" x1="0" y1="0" x2="0" y2="1">
					<stop offset="0" stop-color="#e6d2ae" />
					<stop offset="1" stop-color="#f2e4ca" />
				</linearGradient>
			</defs>
			<!-- Floor, side walls, back wall. -->
			<polygon :points="`22,${BACK} 138,${BACK} 160,100 0,100`" fill="url(#plaza-floor)" />
			<path v-for="(d, i) in [...BOARDS, ...ROWS]" :key="`b${i}`" :d="d" stroke="#d9c39c" stroke-width="0.35" />
			<polygon :points="`0,0 22,0 22,${BACK} 0,100`" fill="#e9e0cf" />
			<polygon :points="`160,0 138,0 138,${BACK} 160,100`" fill="#e9e0cf" />
			<rect x="22" width="116" :height="BACK" fill="#f6f1e7" />
			<path :d="`M22 ${BACK}H138M22 ${BACK}L0 100M138 ${BACK}L160 100`" stroke="#c9b08a" stroke-width="1.4" />
			<path d="M22 0V32M138 0V32" stroke="#ddd2bd" stroke-width="0.6" />
			<!-- Rug under the coffee table. -->
			<ellipse cx="80" cy="76" rx="30" ry="9" fill="#e8e5ff" stroke="#cecbf6" stroke-width="1" />
			<ellipse cx="80" cy="76" rx="26" ry="7.2" fill="none" stroke="#afa9ec" stroke-width="0.45" stroke-dasharray="2 1.5" />
			<!-- Left wall: a door. Right wall: a window. Both drawn along the wall's slant. -->
			<polygon points="6,24 14,14 14,48 6,74" fill="#c08a5a" stroke="#854f0b" stroke-width="0.6" stroke-linejoin="round" />
			<circle cx="12.4" cy="46" r="0.8" fill="#fac775" />
			<polygon points="146,12 154,14 154,36 146,30" fill="#cfe9f7" stroke="#c9b08a" stroke-width="0.9" stroke-linejoin="round" />
			<path d="M150 13v20" stroke="#c9b08a" stroke-width="0.6" />
			<!-- Back wall: window with blinds, whiteboard of sticky notes, frame and clock. -->
			<rect x="27" y="5" width="22" height="16" rx="0.8" fill="#cfe9f7" stroke="#c9b08a" stroke-width="1" />
			<path d="M38 5v16" stroke="#c9b08a" stroke-width="0.7" />
			<path v-for="i in 5" :key="`bl${i}`" :d="`M27.5 ${5 + i * 1.6}H48.5`" stroke="#fffdf8" stroke-width="0.9" />
			<path d="M30 17a1.8 1.8 0 0 1 3.2-1a2.2 2.2 0 0 1 3.8 1z" fill="#fffdf8" />
			<rect x="56" y="4" width="46" height="17" rx="1" fill="#fffdf8" stroke="#b4b2a9" stroke-width="1" />
			<rect x="60" y="7" width="5.5" height="4.5" fill="#9fe1cb" transform="rotate(-4 63 9)" />
			<rect x="67" y="8" width="5.5" height="4.5" fill="#9fe1cb" transform="rotate(3 70 10)" />
			<rect x="76" y="7" width="5.5" height="4.5" fill="#fac775" transform="rotate(5 79 9)" />
			<rect x="83" y="10" width="5.5" height="4.5" fill="#f5c4b3" transform="rotate(-3 86 12)" />
			<rect x="93" y="7" width="5.5" height="4.5" fill="#cecbf6" transform="rotate(-6 96 9)" />
			<path d="M60 16.5h9M76 17h11M92 14.5h7" stroke="#d3d1c7" stroke-width="0.6" stroke-linecap="round" />
			<rect x="68" y="21" width="20" height="1.3" rx="0.5" fill="#b4b2a9" />
			<rect x="108" y="6" width="10" height="8" fill="#fac775" stroke="#854f0b" stroke-width="0.8" />
			<path d="M109.5 12.5l2.5-3 2 2 1.5-1.5 1.5 2.5z" fill="#1d9e75" />
			<circle cx="128" cy="11" r="4.2" fill="#fffdf8" stroke="#5f5e5a" stroke-width="0.9" />
			<path d="M128 11V8.4M128 11l1.7 1.1" stroke="#26215c" stroke-width="0.7" stroke-linecap="round" />
			<!-- Pendant lamps. -->
			<g v-for="x in [52, 108]" :key="`l${x}`">
				<path :d="`M${x} 0V3`" stroke="#5f5e5a" stroke-width="0.4" />
				<path :d="`M${x - 3} 5.5Q${x} 1.5 ${x + 3} 5.5Z`" fill="#26215c" />
				<ellipse :cx="x" cy="5.7" rx="1.4" ry="0.5" fill="#fac775" />
			</g>
		</svg>
		<svg
			v-for="(f, i) in PROPS"
			:key="`f${i}`"
			class="prop"
			:style="{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, zIndex: Math.round(f.y * 100) }"
			:viewBox="{ shelf: '0 0 24 30', cooler: '0 0 10 26', plant: '0 0 16 24', desk: '0 0 40 26', chair: '0 0 14 16', table: '0 0 30 15', sofa: '0 0 44 20' }[f.kind]"
			aria-hidden="true"
		>
			<g v-if="f.kind === 'shelf'" stroke="#854f0b" stroke-width="0.8">
				<rect x="1" y="1" width="22" height="28.5" fill="#c08a5a" />
				<path d="M2 10H22M2 19.5H22" />
				<rect v-for="(c, k) in BOOKS" :key="`a${k}`" :x="3 + k * 2.6" :y="k % 3 ? 3.5 : 4.5" width="2.2" :height="k % 3 ? 6.5 : 5.5" :fill="c" stroke-width="0.3" />
				<rect v-for="(c, k) in BOOKS.slice(0, 5)" :key="`b${k}`" :x="4 + k * 2.8" y="13" width="2.4" height="6.5" :fill="BOOKS[(k + 3) % BOOKS.length]" stroke-width="0.3" />
				<circle cx="18.5" cy="16.5" r="2.2" fill="#5dcaa5" stroke-width="0.3" />
				<rect x="4" y="22" width="16" height="7" rx="0.6" fill="#d9a066" stroke-width="0.4" />
			</g>
			<g v-else-if="f.kind === 'cooler'" stroke="#888780" stroke-width="0.5">
				<rect x="2.5" y="0.5" width="5" height="8" rx="2" fill="#a9d8ef" stroke="#85b7eb" />
				<rect x="1" y="8.5" width="8" height="17" rx="1" fill="#fffdf8" />
				<rect x="3.5" y="11" width="3" height="1.5" rx="0.4" fill="#378add" stroke="none" />
			</g>
			<g v-else-if="f.kind === 'plant'" stroke-linejoin="round">
				<ellipse cx="4.5" cy="9" rx="3" ry="7" fill="#5dcaa5" transform="rotate(-25 4.5 9)" />
				<ellipse cx="11.5" cy="9" rx="3" ry="7" fill="#1d9e75" transform="rotate(25 11.5 9)" />
				<ellipse cx="8" cy="7.5" rx="2.8" ry="7.5" fill="#9fe1cb" />
				<path d="M2.5 14.5h11l-1.6 9h-7.8z" fill="#e08b5f" stroke="#993c1d" stroke-width="0.6" />
			</g>
			<g v-else-if="f.kind === 'desk'" stroke="#854f0b" stroke-width="0.6" stroke-linejoin="round">
				<rect x="11" y="0.5" width="18" height="11" rx="1" fill="#5f5e5a" stroke="#2a2723" />
				<rect x="12.5" y="2" width="15" height="8" rx="0.5" fill="#9fd0f0" stroke="none" />
				<path d="M14 5h7M14 7h10" stroke="#fffdf8" stroke-width="0.7" stroke-linecap="round" />
				<rect x="18.5" y="11.5" width="3" height="2.5" fill="#5f5e5a" stroke="none" />
				<polygon points="3,14 37,14 39,17 1,17" fill="#d9a066" />
				<rect x="14" y="14.4" width="12" height="1.4" rx="0.3" fill="#fffdf8" stroke="#b4b2a9" stroke-width="0.3" />
				<rect x="31" y="11.5" width="3" height="3" rx="0.6" fill="#f5c4b3" stroke="#993c1d" stroke-width="0.4" />
				<rect x="1" y="17" width="38" height="2" fill="#c08a5a" />
				<path d="M3 19v6.5M37 19v6.5" stroke-width="1.6" stroke-linecap="round" />
				<rect x="26" y="19" width="9" height="6" fill="#c08a5a" />
			</g>
			<g v-else-if="f.kind === 'chair'" stroke="#26215c" stroke-width="0.6" stroke-linejoin="round">
				<rect x="2" y="0.5" width="10" height="7" rx="2.5" fill="#7f77dd" />
				<rect x="1" y="7" width="12" height="3" rx="1.4" fill="#afa9ec" />
				<path d="M7 10v3M3 15.2l4-2.2l4 2.2" fill="none" stroke="#5f5e5a" stroke-width="0.9" stroke-linecap="round" />
			</g>
			<g v-else-if="f.kind === 'table'" stroke="#854f0b" stroke-width="0.6">
				<path d="M13.5 7v6.5h3V7" fill="#c08a5a" />
				<ellipse cx="15" cy="14" rx="5.5" ry="1" fill="#c08a5a" />
				<ellipse cx="15" cy="5.5" rx="14" ry="4.5" fill="#d9a066" />
				<rect x="8" y="2" width="3" height="3" rx="0.6" fill="#fffdf8" stroke="#888780" stroke-width="0.4" />
				<rect x="18" y="3" width="3" height="3" rx="0.6" fill="#cecbf6" stroke="#534ab7" stroke-width="0.4" />
				<ellipse cx="14.5" cy="5.5" rx="3.2" ry="1.2" fill="#fffdf8" stroke="#b4b2a9" stroke-width="0.3" />
				<circle cx="13.6" cy="4.8" r="1" fill="#f0997b" stroke="none" />
				<circle cx="15.6" cy="5" r="1" fill="#fac775" stroke="none" />
			</g>
			<g v-else-if="f.kind === 'sofa'" stroke="#534ab7" stroke-width="0.7" stroke-linejoin="round">
				<rect x="4" y="1" width="36" height="10" rx="3" fill="#afa9ec" />
				<rect x="4" y="9" width="36" height="7" rx="1.5" fill="#cecbf6" />
				<path d="M22 9.5v6" />
				<rect x="0.5" y="5" width="6" height="12" rx="2.5" fill="#afa9ec" />
				<rect x="37.5" y="5" width="6" height="12" rx="2.5" fill="#afa9ec" />
				<path d="M4 17v2.5M40 17v2.5" stroke="#26215c" stroke-width="1.2" stroke-linecap="round" />
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
.prop {
	position: absolute;
	translate: -50% -100%;
	overflow: visible;
	pointer-events: none;
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
