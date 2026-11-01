<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import Icon from "./Icon.vue";

// Shared doodle wall. Points are 0..1 fractions of a fixed 16:10 canvas, so drawings look the same on every screen.
type Stroke = { c: string; w: number; p: [number, number][] };
type Saved = Stroke & { id: string; mine: boolean };

const props = defineProps<{ locked: boolean }>();
const emit = defineEmits<{ send: [msg: object] }>();

// On phones the wall starts folded so the cards stay near the top; tap the title to open it.
const folded = ref(matchMedia("(max-width: 760px)").matches);

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
// A crisp picture of the wall for the summary image (null when nobody has drawn anything).
function snapshot() {
	if (!strokes.value?.length) return null;
	const c = document.createElement("canvas");
	c.width = 1280;
	c.height = 800;
	const ctx = c.getContext("2d")!;
	ctx.lineCap = ctx.lineJoin = "round";
	for (const s of strokes.value) line(ctx, s);
	return c.toDataURL("image/png");
}
defineExpose({ apply, snapshot });

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

// The panel's width follows the page layout, so watch the canvas itself rather than the window.
let observer: ResizeObserver;
onMounted(() => {
	observer = new ResizeObserver(resize);
	observer.observe(canvas.value!);
	emit("send", { type: "doodle" });
});
onUnmounted(() => observer.disconnect());
</script>

<template>
	<section class="panel doodle" aria-label="Doodle wall">
		<header>
			<h2>
				<button class="fold" :aria-expanded="!folded" @click="folded = !folded">Doodle <Icon name="chevron" class="chev" :class="{ shut: folded }" /></button>
			</h2>
			<template v-if="!locked && !folded">
				<div class="row swatches" role="group" aria-label="Color">
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
				<button
					class="ghost small icon-btn"
					:class="{ on: width === 8 }"
					:aria-pressed="width === 8"
					:title="width === 8 ? 'Thick brush' : 'Thin brush'"
					:aria-label="width === 8 ? 'Thick brush' : 'Thin brush'"
					@click="width = width === 8 ? 3 : 8"
				>
					<Icon name="brush" :style="{ strokeWidth: width === 8 ? 2.8 : 1.6 }" /><span class="lbl">{{ width === 8 ? "Thick" : "Thin" }}</span>
				</button>
				<button class="ghost small icon-btn" title="Undo" aria-label="Undo your last stroke" @click="emit('send', { type: 'undo' })">
					<Icon name="undo" /><span class="lbl">Undo</span>
				</button>
			</template>
			<span v-else-if="locked" class="muted small-text">View only</span>
		</header>
		<div v-show="!folded" class="stage">
			<canvas ref="canvas" :class="{ locked }" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" />
			<p v-if="strokes === null" class="hint muted">Loading…</p>
			<p v-else-if="!strokes.length && !locked" class="hint muted">Shared with everyone on this board</p>
		</div>
	</section>
</template>

<style scoped>
header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px 10px;
	margin-bottom: 8px;
}
h2 {
	font-size: 15px;
	margin-right: auto;
}
.fold {
	all: unset;
	display: inline-flex;
	align-items: center;
	gap: 4px;
	cursor: pointer;
	font: inherit;
	font-weight: 700;
}
.chev {
	width: 16px;
	height: 16px;
	vertical-align: 0;
	color: var(--muted);
	transition: rotate 0.2s;
}
.chev.shut {
	rotate: -90deg;
}
.fold:focus-visible {
	outline: 2.5px solid var(--accent);
	outline-offset: 2px;
	border-radius: 4px;
}
.swatches {
	gap: 4px;
}
.swatch {
	width: 20px;
	height: 20px;
	padding: 0;
	border-radius: 50%;
	border: 2px solid var(--surface);
	box-shadow: 0 0 0 1.5px var(--border);
}
.swatch.on {
	box-shadow: 0 0 0 2px var(--text);
}
button.on {
	background: var(--accent-soft);
	color: var(--accent);
}
.small-text {
	font-size: 13px;
}
.stage {
	position: relative;
	display: grid;
	place-items: center;
}
canvas {
	width: 100%;
	aspect-ratio: 16 / 10;
	background: var(--bg) radial-gradient(var(--dot) 1px, transparent 1px) 0 0 / 16px 16px;
	border-radius: 10px;
	touch-action: none;
	cursor: crosshair;
}
canvas.locked {
	cursor: default;
}
.hint {
	position: absolute;
	margin: 0;
	font-size: 13px;
	pointer-events: none;
}
</style>
