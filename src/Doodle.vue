<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import Icon from "./Icon.vue";
import { REACTIONS } from "./lib";

// Shared doodle wall. Points are 0..1 fractions of a fixed 16:10 canvas, so drawings look the same on every screen.
// `b` is the brush (pens leave it out); stamps and text are one point with their emoji or words in `t`.
type Brush = "pen" | "marker" | "spray" | "rainbow" | "stamp" | "text";
type Stroke = { c: string; w: number; p: [number, number][]; b?: Exclude<Brush, "pen">; t?: string };
type Saved = Stroke & { id: string; mine: boolean };

const props = defineProps<{ locked: boolean }>();
const emit = defineEmits<{ send: [msg: object] }>();

// On phones the wall starts folded so the cards stay near the top; tap the title to open it.
const folded = ref(matchMedia("(max-width: 760px)").matches);

const COLORS = ["#2a2723", "#e24b4a", "#ef9f27", "#1d9e75", "#378add", "#7f77dd", "#d4537e", "#854f0b", "#0f8b8d"];
const BRUSHES: { key: Brush; label: string }[] = [
	{ key: "pen", label: "Pen" },
	{ key: "marker", label: "Marker" },
	{ key: "spray", label: "Spray" },
	{ key: "rainbow", label: "Rainbow" },
	{ key: "stamp", label: "Stamp" },
	{ key: "text", label: "Text" },
];
const brush = ref<Brush>("pen");
const color = ref(COLORS[0]);
const size = ref(4); // 2-24, same rule as the server
const stamp = ref(REACTIONS[0]);
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
	for (const s of strokes.value) draw(ctx, s);
	return c.toDataURL("image/png");
}
defineExpose({ apply, snapshot });

// Text and stamp sizes as a share of the canvas width, so they scale with it like lines do.
const textPx = (w: number, W: number) => W * (0.012 + w * 0.0025);
const stampPx = (w: number, W: number) => W * (0.02 + w * 0.004);
// The same "random" spray on every screen: seeded from the stroke's first point.
function seeded(s: Stroke) {
	let a = Math.round(s.p[0][0] * 1000) * 1009 + Math.round(s.p[0][1] * 1000) + s.p.length;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function draw(ctx: CanvasRenderingContext2D, s: Stroke) {
	const { width: W, height: H } = ctx.canvas;
	const pts = s.p.map(([x, y]) => [x * W, y * H]);
	const lw = (s.w * W) / 1000;
	ctx.save();
	ctx.lineCap = ctx.lineJoin = "round";
	ctx.strokeStyle = ctx.fillStyle = s.c;
	if (s.b === "text" || s.b === "stamp") {
		const px = s.b === "text" ? textPx(s.w, W) : stampPx(s.w, W);
		ctx.font = `${s.b === "text" ? 700 : 400} ${px}px ${getComputedStyle(document.body).fontFamily}`;
		ctx.textAlign = s.b === "text" ? "left" : "center";
		ctx.textBaseline = "middle";
		ctx.fillText(s.t ?? "", pts[0][0], pts[0][1]);
	} else if (s.b === "spray") {
		const rand = seeded(s);
		const r = lw * 2.2;
		const grain = Math.max(W / 700, lw * 0.18);
		for (const [x, y] of pts) {
			for (let i = 0; i < 14 + s.w * 2; i++) {
				const a = rand() * Math.PI * 2;
				const d = Math.sqrt(rand()) * r;
				ctx.fillRect(x + Math.cos(a) * d, y + Math.sin(a) * d, grain, grain);
			}
		}
	} else if (s.b === "rainbow") {
		ctx.lineWidth = lw;
		for (let i = 1; i < pts.length; i++) {
			ctx.strokeStyle = `hsl(${(i * 9) % 360} 80% 55%)`;
			ctx.beginPath();
			ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
			ctx.lineTo(pts[i][0], pts[i][1]);
			ctx.stroke();
		}
		if (pts.length === 1) dot(ctx, pts[0], lw, "hsl(0 80% 55%)");
	} else {
		// Pen, or marker: wide and see-through, darkening where it crosses other ink.
		if (s.b === "marker") {
			ctx.globalAlpha = 0.5;
			ctx.globalCompositeOperation = "multiply";
		}
		ctx.lineWidth = s.b === "marker" ? lw * 2.5 : lw;
		ctx.beginPath();
		pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
		if (pts.length === 1) ctx.lineTo(pts[0][0] + 0.01, pts[0][1]); // a tap draws a dot
		ctx.stroke();
	}
	ctx.restore();
}
function dot(ctx: CanvasRenderingContext2D, [x, y]: number[], lw: number, c: string) {
	ctx.fillStyle = c;
	ctx.beginPath();
	ctx.arc(x, y, lw / 2, 0, Math.PI * 2);
	ctx.fill();
}

function redraw() {
	const c = canvas.value;
	if (!c) return;
	const ctx = c.getContext("2d")!;
	ctx.clearRect(0, 0, c.width, c.height);
	for (const s of [...(strokes.value ?? []), ...pending, ...(current ? [current] : [])]) draw(ctx, s);
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
function send(stroke: Stroke) {
	pending.push(stroke);
	emit("send", { type: "stroke", stroke });
	redraw();
}
const base = () => ({ c: color.value, w: size.value, ...(brush.value === "pen" ? {} : { b: brush.value as Exclude<Brush, "pen"> }) });
function down(e: PointerEvent) {
	if (props.locked) return;
	if (brush.value === "stamp") return send({ ...base(), p: [point(e)], t: stamp.value });
	if (brush.value === "text") return startText(e);
	canvas.value!.setPointerCapture(e.pointerId);
	current = { ...base(), p: [point(e)] };
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
	send(current);
	current = null;
}

// Text: tap where it goes, type, Enter (or click away) to place it, Esc to cancel.
const typing = ref<{ p: [number, number]; text: string } | null>(null);
const textBox = ref<HTMLInputElement>();
async function startText(e: PointerEvent) {
	e.preventDefault(); // keep the focus for the new box
	if (typing.value) placeText();
	typing.value = { p: point(e), text: "" };
	await nextTick();
	textBox.value?.focus();
}
function placeText() {
	const t = typing.value;
	typing.value = null;
	if (t?.text.trim()) send({ ...base(), p: [t.p], t: t.text.trim() });
}
const textStyle = computed(() => {
	const W = canvas.value?.clientWidth ?? 600;
	const p = typing.value?.p ?? [0, 0];
	return { left: `${p[0] * 100}%`, top: `${p[1] * 100}%`, color: color.value, fontSize: `${textPx(size.value, W)}px` };
});
// What the next mark looks like, next to the size slider.
const preview = computed(() => {
	const W = canvas.value?.clientWidth ?? 600;
	const px = Math.max(3, Math.min(26, (size.value * W) / 1000 * (brush.value === "marker" ? 2.5 : 1)));
	return { width: `${px}px`, height: `${px}px`, background: brush.value === "rainbow" ? "conic-gradient(red, orange, yellow, lime, cyan, blue, magenta, red)" : color.value };
});

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
			<button v-if="!locked && !folded" class="ghost small icon-btn" title="Undo" aria-label="Undo your last stroke" @click="emit('send', { type: 'undo' })">
				<Icon name="undo" /><span class="lbl">Undo</span>
			</button>
			<span v-else-if="locked" class="muted small-text">View only</span>
		</header>
		<div v-if="!locked && !folded" class="tools">
			<div class="row brushes" role="group" aria-label="Brush">
				<button
					v-for="b in BRUSHES"
					:key="b.key"
					class="ghost tool"
					:class="{ on: brush === b.key }"
					:title="b.label"
					:aria-label="b.label"
					:aria-pressed="brush === b.key"
					@click="brush = b.key"
				>
					<Icon :name="b.key" />
				</button>
			</div>
			<div v-if="brush === 'stamp'" class="row stamps" role="group" aria-label="Stamp">
				<button v-for="e in REACTIONS" :key="e" class="ghost tool" :class="{ on: stamp === e }" :aria-label="`Stamp ${e}`" :aria-pressed="stamp === e" @click="stamp = e">
					{{ e }}
				</button>
			</div>
			<div v-else-if="brush !== 'rainbow'" class="row swatches" role="group" aria-label="Color">
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
			<label class="size" title="Size">
				<span class="preview-box"><span v-if="brush === 'stamp'" :style="{ fontSize: `${8 + size}px` }">{{ stamp }}</span><span v-else-if="brush === 'text'" :style="{ color, fontSize: `${8 + size * 0.7}px` }" class="aa">Aa</span><span v-else class="preview" :style="preview" /></span>
				<input v-model.number="size" type="range" min="2" max="24" aria-label="Size" />
			</label>
		</div>
		<div v-show="!folded" class="stage">
			<canvas
				ref="canvas"
				:class="{ locked, 'text-mode': brush === 'text', 'stamp-mode': brush === 'stamp' }"
				@pointerdown="down"
				@pointermove="move"
				@pointerup="up"
				@pointercancel="up"
			/>
			<input
				v-if="typing"
				ref="textBox"
				v-model="typing.text"
				class="text-box"
				maxlength="60"
				placeholder="Type…"
				aria-label="Text to place on the doodle"
				:style="textStyle"
				@keydown.enter.prevent="placeText"
				@keydown.esc="typing = null"
				@blur="placeText"
			/>
			<p v-if="strokes === null" class="hint muted">Loading…</p>
			<p v-else-if="!strokes.length && !locked && !typing" class="hint muted">Shared with everyone on this board</p>
		</div>
	</section>
</template>

<style scoped>
header {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px 10px;
	margin-bottom: 6px;
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
.tools {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px 14px;
	margin-bottom: 8px;
}
.brushes,
.stamps {
	gap: 2px;
}
.tool {
	display: grid;
	place-items: center;
	width: 32px;
	height: 32px;
	padding: 0;
	font-size: 16px;
	line-height: 1;
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
.size {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-left: auto;
}
.size input {
	width: 110px;
	accent-color: var(--accent);
}
.preview-box {
	display: grid;
	place-items: center;
	width: 30px;
	height: 30px;
	line-height: 1;
}
.preview {
	border-radius: 50%;
}
.aa {
	font-weight: 700;
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
	/* Plain paper, the same as in the summary image; it doesn't take the mood tint like the page does. */
	background: var(--surface) radial-gradient(color-mix(in srgb, var(--border) 70%, transparent) 1px, transparent 1px) 0 0 / 16px 16px;
	border: 1.5px solid var(--border);
	border-radius: 10px;
	touch-action: none;
	cursor: crosshair;
}
canvas.text-mode {
	cursor: text;
}
canvas.stamp-mode {
	cursor: copy;
}
canvas.locked {
	cursor: default;
}
/* Sits where the text will go: left edge at the tap, centred on it vertically, like the drawn text. */
.text-box {
	position: absolute;
	translate: 0 -50%;
	width: auto;
	min-width: 8ch;
	max-width: 60%;
	padding: 0 2px;
	font-weight: 700;
	line-height: 1.2;
	background: color-mix(in srgb, var(--surface) 70%, transparent);
	border: 1.5px dashed var(--accent);
	border-radius: 4px;
}
.hint {
	position: absolute;
	margin: 0;
	font-size: 13px;
	pointer-events: none;
}
</style>
