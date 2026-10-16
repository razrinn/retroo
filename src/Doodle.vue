<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

// Shared doodle wall. Points are 0..1 fractions of a fixed 16:10 canvas, so drawings look the same on every screen.
type Stroke = { c: string; w: number; p: [number, number][] };
type Saved = Stroke & { id: string; mine: boolean };

const props = defineProps<{ locked: boolean }>();
const emit = defineEmits<{ close: []; send: [msg: object] }>();

const COLORS = ["#2a2723", "#e24b4a", "#ef9f27", "#1d9e75", "#378add", "#7f77dd"];
const color = ref(COLORS[0]);
const width = ref(3);
const strokes = ref<Saved[] | null>(null);
const canvas = ref<HTMLCanvasElement>();
let current: Stroke | null = null;
// Strokes we sent but the server hasn't echoed yet; drawn so nothing flickers.
let pending: Stroke[] = [];

// Called by the board for doodle messages from the server.
function apply(data: { doodle?: Saved[]; stroke?: Saved; unstroke?: string }) {
	if (data.doodle) strokes.value = data.doodle;
	if (data.stroke && strokes.value) {
		strokes.value.push(data.stroke);
		if (data.stroke.mine) pending.shift();
	}
	if (data.unstroke && strokes.value) strokes.value = strokes.value.filter((s) => s.id !== data.unstroke);
	redraw();
}
defineExpose({ apply });

function line(ctx: CanvasRenderingContext2D, s: Stroke) {
	const { width: W, height: H } = ctx.canvas;
	ctx.strokeStyle = s.c;
	ctx.lineWidth = (s.w * W) / 1000;
	ctx.beginPath();
	s.p.forEach(([x, y], i) => (i ? ctx.lineTo(x * W, y * H) : ctx.moveTo(x * W, y * H)));
	if (s.p.length === 1) ctx.lineTo(s.p[0][0] * W + 0.01, s.p[0][1] * H); // a tap draws a dot
	ctx.stroke();
}

function redraw() {
	const c = canvas.value;
	if (!c) return;
	const ctx = c.getContext("2d")!;
	ctx.clearRect(0, 0, c.width, c.height);
	ctx.lineCap = ctx.lineJoin = "round";
	for (const s of [...(strokes.value ?? []), ...pending, ...(current ? [current] : [])]) line(ctx, s);
}

function resize() {
	const c = canvas.value!;
	c.width = c.clientWidth * devicePixelRatio;
	c.height = c.clientHeight * devicePixelRatio;
	redraw();
}

function point(e: PointerEvent): [number, number] {
	const r = canvas.value!.getBoundingClientRect();
	return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
}
function down(e: PointerEvent) {
	if (props.locked) return;
	canvas.value!.setPointerCapture(e.pointerId);
	current = { c: color.value, w: width.value, p: [point(e)] };
	redraw();
}
function move(e: PointerEvent) {
	if (!current || current.p.length >= 500) return;
	const [x, y] = point(e);
	const [lx, ly] = current.p[current.p.length - 1];
	// Skip points that barely moved: keeps strokes small (~1 KB) without visible loss.
	if (Math.hypot(x - lx, y - ly) < 0.003) return;
	current.p.push([x, y]);
	redraw();
}
function up() {
	if (!current) return;
	pending.push(current);
	emit("send", { type: "stroke", stroke: current });
	current = null;
}

function clearAll() {
	if (confirm("Clear the whole doodle wall for everyone?")) emit("send", { type: "clear" });
}

onMounted(() => {
	resize();
	addEventListener("resize", resize);
	emit("send", { type: "doodle" });
});
onUnmounted(() => removeEventListener("resize", resize));
</script>

<template>
	<div class="doodle" role="dialog" aria-modal="true" aria-label="Doodle wall">
		<header>
			<strong>🎨 Doodle wall</strong>
			<template v-if="!locked">
				<div class="row" role="group" aria-label="Color">
					<button
						v-for="c in COLORS"
						:key="c"
						class="swatch"
						:class="{ on: color === c }"
						:style="{ background: c }"
						:aria-label="`Color ${c}`"
						:aria-pressed="color === c"
						@click="color = c"
					/>
				</div>
				<div class="row" role="group" aria-label="Brush size">
					<button class="ghost" :class="{ on: width === 3 }" :aria-pressed="width === 3" @click="width = 3">Thin</button>
					<button class="ghost" :class="{ on: width === 8 }" :aria-pressed="width === 8" @click="width = 8">Thick</button>
				</div>
				<button class="ghost" @click="emit('send', { type: 'undo' })">↩︎ Undo</button>
				<button class="ghost" @click="clearAll">🧽 Clear all</button>
			</template>
			<span v-else class="muted">Locked, view only</span>
			<span class="spacer" />
			<button @click="emit('close')">Done</button>
		</header>
		<div class="stage">
			<canvas
				ref="canvas"
				:class="{ locked }"
				@pointerdown="down"
				@pointermove="move"
				@pointerup="up"
				@pointercancel="up"
			/>
			<p v-if="strokes === null" class="hint muted">Loading…</p>
			<p v-else-if="!strokes.length && !locked" class="hint muted">Draw something. Everyone sees it.</p>
		</div>
	</div>
</template>

<style scoped>
.doodle {
	position: fixed;
	inset: 0;
	z-index: 50;
	display: grid;
	grid-template-rows: auto 1fr;
	gap: 12px;
	padding: 16px;
	background: var(--bg);
}
header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 10px;
}
.swatch {
	width: 28px;
	height: 28px;
	padding: 0;
	border-radius: 50%;
	border: 3px solid var(--surface);
	box-shadow: 0 0 0 1.5px var(--border);
}
.swatch.on {
	box-shadow: 0 0 0 2.5px var(--text);
}
button.on {
	background: var(--accent-soft);
	color: var(--accent);
}
.stage {
	position: relative;
	display: grid;
	place-items: center;
	min-height: 0;
	container-type: size;
}
canvas {
	aspect-ratio: 16 / 10;
	width: min(100cqw, 160cqh); /* largest 16:10 box that fits the space left under the toolbar */
	background: var(--surface);
	border: 1.5px solid var(--border);
	border-radius: 16px;
	box-shadow: var(--shadow);
	touch-action: none;
	cursor: crosshair;
}
canvas.locked {
	cursor: default;
}
.hint {
	position: absolute;
	pointer-events: none;
}
</style>
