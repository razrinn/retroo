<script setup lang="ts">
import { domToBlob } from "modern-screenshot";
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import Mascot from "./Mascot.vue";
import ShareCard from "./ShareCard.vue";
import { type BoardState, type Card, COLS, useFocusTrap } from "./lib";

// One page that wraps up the retro, plus a Markdown copy for Slack, Confluence or Notion.
const props = defineProps<{ state: BoardState; code: string; doodle?: () => string | null }>();
const emit = defineEmits<{ close: [] }>();

const byReactions = (col: string) =>
	props.state.cards
		.filter((c) => c.col === col && c.text !== null)
		.map((c, i) => ({ c, i }))
		.sort((a, b) => b.c.total - a.c.total || a.i - b.i)
		.map(({ c }) => c);
const columns = computed(() => COLS.filter((c) => c.key !== "action").map((col) => ({ ...col, cards: byReactions(col.key) })));
const actions = computed(() => props.state.cards.filter((c) => c.col === "action"));
const followUps = computed(() => ({
	done: props.state.followUps.filter((f) => f.status === "done"),
	dropped: props.state.followUps.filter((f) => f.status === "dropped"),
	open: props.state.followUps.filter((f) => f.status === "open"),
}));
const mood = computed(() => props.state.mood);
const delta = computed(() =>
	mood.value.average !== null && mood.value.previous !== null ? Math.round((mood.value.average - mood.value.previous) * 10) / 10 : null,
);
const date = new Date().toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
const reactionsText = (c: Card) => c.reactions.map((r) => `${r.emoji} ${r.count}`).join(" ");

const markdown = computed(() => {
	const s = props.state;
	const lines = [`# ${s.title || "Retro"}`, `${date} · retroo board ${props.code}`, ""];
	if (mood.value.average !== null) {
		const change = delta.value === null ? "" : ` (${delta.value > 0 ? "+" : ""}${delta.value} vs last sprint)`;
		lines.push(`**Team mood:** ${mood.value.average.toFixed(1)} / 5${change}, ${mood.value.rated} rated`, "");
	}
	for (const col of columns.value) {
		lines.push(`## ${col.label}`);
		if (!col.cards.length) lines.push("_Nothing here._");
		for (const c of col.cards) lines.push(`- ${c.text}${c.total ? `  ${reactionsText(c)}` : ""}`);
		lines.push("");
	}
	lines.push("## Action items");
	if (!actions.value.length) lines.push("_None._");
	for (const c of actions.value) lines.push(`- [ ] ${c.text}`);
	if (s.followUps.length) {
		lines.push("", `## From last sprint${s.previousTitle ? ` (${s.previousTitle})` : ""}`);
		for (const f of followUps.value.done) lines.push(`- [x] ${f.text}`);
		for (const f of followUps.value.open) lines.push(`- [ ] ${f.text}${f.carried > 1 ? ` (carried ×${f.carried})` : ""}`);
		for (const f of followUps.value.dropped) lines.push(`- ~~${f.text}~~ (dropped)`);
	}
	return lines.join("\n") + "\n";
});

// Share image: render the off-screen ShareCard, snapshot it to a PNG in the browser, then copy, download or share.
const rendering = ref<string | null | undefined>(undefined); // doodle snapshot while rendering; undefined = idle
const cardEl = ref<HTMLElement>();
const imageStatus = ref("");
const fileName = computed(() => `${(props.state.title || "retro").replace(/[^\w-]+/g, "-").toLowerCase()}.png`);
async function makeImage() {
	rendering.value = props.doodle?.() ?? null;
	await nextTick();
	await document.fonts.ready;
	try {
		return await domToBlob(cardEl.value!, { scale: 2, type: "image/png" });
	} finally {
		rendering.value = undefined;
	}
}
function flash(text: string) {
	imageStatus.value = text;
	setTimeout(() => imageStatus.value === text && (imageStatus.value = ""), 1800);
}
function download(blob: Blob) {
	const a = document.createElement("a");
	a.href = URL.createObjectURL(blob);
	a.download = fileName.value;
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
async function copyImage() {
	imageStatus.value = "Making image…";
	try {
		// The promise goes straight into ClipboardItem so Safari still counts it as part of the click.
		await navigator.clipboard.write([new ClipboardItem({ "image/png": makeImage() })]);
		flash("Image copied");
	} catch {
		download(await makeImage());
		flash("Copying images isn't supported here, so it was downloaded");
	}
}
async function downloadImage() {
	imageStatus.value = "Making image…";
	download(await makeImage());
	flash("Downloaded");
}
const canShare = typeof navigator.canShare === "function" && navigator.canShare({ files: [new File([""], "x.png", { type: "image/png" })] });
async function shareImage() {
	imageStatus.value = "Making image…";
	const file = new File([await makeImage()], fileName.value, { type: "image/png" });
	imageStatus.value = "";
	await navigator.share({ files: [file], title: props.state.title || "Retro" }).catch(() => {});
}

const copied = ref(false);
async function copy() {
	await navigator.clipboard?.writeText(markdown.value);
	copied.value = true;
	setTimeout(() => (copied.value = false), 1500);
}
const dialog = ref<HTMLElement>();
useFocusTrap(dialog);
const onKey = (e: KeyboardEvent) => e.key === "Escape" && emit("close");
onMounted(() => addEventListener("keydown", onKey));
onUnmounted(() => removeEventListener("keydown", onKey));
</script>

<template>
	<div ref="dialog" class="summary" role="dialog" aria-modal="true" aria-label="Retro summary">
		<article class="sheet">
			<header>
				<div>
					<h1>{{ state.title || "Retro" }}</h1>
					<p class="muted">{{ date }}</p>
				</div>
				<span class="spacer" />
				<div class="exports">
					<button class="primary" @click="copy">{{ copied ? "Copied" : "Copy as Markdown" }}</button>
					<button @click="copyImage">Copy image</button>
					<button class="ghost" @click="downloadImage">Download</button>
					<button v-if="canShare" class="ghost" @click="shareImage">Share</button>
					<span v-if="imageStatus" class="status muted" role="status">{{ imageStatus }}</span>
				</div>
				<button class="ghost" aria-label="Close summary" @click="emit('close')">✕</button>
			</header>

			<section v-if="mood.average !== null" class="mood">
				<Mascot :mood="Math.round(mood.average)" :size="56" />
				<div>
					<strong class="big">{{ mood.average.toFixed(1) }}</strong>
					<span class="muted"> / 5 team mood</span>
					<p class="muted small">
						{{ mood.rated }} rated
						<template v-if="delta !== null">
							·
							<span :class="delta > 0 ? 'up' : delta < 0 ? 'down' : ''">
								{{ delta > 0 ? "▲" : delta < 0 ? "▼" : "=" }} {{ Math.abs(delta).toFixed(1) }} vs last sprint
							</span>
						</template>
					</p>
				</div>
			</section>

			<div class="grid">
				<section v-for="col in columns" :key="col.key" :class="`col-${col.key}`">
					<h2>{{ col.label }}</h2>
					<p v-if="!col.cards.length" class="muted small">Nothing here.</p>
					<ol>
						<li v-for="c in col.cards" :key="c.id">
							<span>{{ c.text }}</span>
							<span class="meta">{{
								[c.total ? reactionsText(c) : "", c.comments.length ? `${c.comments.length} comment${c.comments.length > 1 ? "s" : ""}` : ""]
									.filter(Boolean)
									.join(" · ")
							}}</span>
						</li>
					</ol>
				</section>
			</div>

			<section class="col-action">
				<h2>Action items</h2>
				<p v-if="!actions.length" class="muted small">None.</p>
				<ul class="checks">
					<li v-for="c in actions" :key="c.id">{{ c.text }}</li>
				</ul>
			</section>

			<section v-if="state.followUps.length">
				<h2>From last sprint<span v-if="state.previousTitle" class="muted"> · {{ state.previousTitle }}</span></h2>
				<p class="muted small">
					{{ followUps.done.length }} done · {{ followUps.open.length }} still open · {{ followUps.dropped.length }} dropped
				</p>
				<ul class="checks">
					<li v-for="f in followUps.done" :key="f.id" class="done">{{ f.text }}</li>
					<li v-for="f in followUps.open" :key="f.id">
						{{ f.text }}<span v-if="f.carried > 1" class="meta"> · carried ×{{ f.carried }}</span>
					</li>
					<li v-for="f in followUps.dropped" :key="f.id" class="dropped">{{ f.text }}</li>
				</ul>
			</section>
		</article>
		<div v-if="rendering !== undefined" class="offscreen" aria-hidden="true">
			<div ref="cardEl"><ShareCard :state="state" :doodle="rendering" /></div>
		</div>
	</div>
</template>

<style scoped>
.summary {
	position: fixed;
	inset: 0;
	z-index: 50;
	overflow-y: auto;
	padding: 24px 16px;
	background: color-mix(in srgb, var(--bg) 92%, transparent);
	backdrop-filter: blur(4px);
}
.sheet {
	max-width: 820px;
	margin: 0 auto;
	padding: 28px 32px;
	background: var(--surface);
	border: 1.5px solid var(--border);
	border-radius: 18px;
	box-shadow: var(--shadow);
	display: grid;
	gap: 24px;
	animation: rise-in 0.35s cubic-bezier(0.3, 1.3, 0.5, 1);
}
@keyframes rise-in {
	from {
		opacity: 0;
		translate: 0 16px;
	}
}
header {
	display: flex;
	align-items: flex-start;
	flex-wrap: wrap;
	gap: 10px;
}
.exports {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}
.status {
	width: 100%;
	text-align: right;
	font-size: 12px;
}
/* The share card renders out of view while the PNG is made. */
.offscreen {
	position: fixed;
	left: -10000px;
	top: 0;
	pointer-events: none;
}
h1 {
	font-size: 26px;
}
h1 + p {
	margin: 2px 0 0;
}
h2 {
	font-size: 16px;
	margin-bottom: 8px;
}
.small {
	font-size: 13px;
	margin: 2px 0 0;
}
.mood {
	display: flex;
	align-items: center;
	gap: 14px;
	padding: 14px 16px;
	border-radius: 14px;
	background: color-mix(in srgb, var(--mood) 12%, var(--surface));
}
.big {
	font-size: 28px;
	font-weight: 800;
}
.up {
	color: var(--ok);
	font-weight: 700;
}
.down {
	color: var(--danger);
	font-weight: 700;
}
.grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
	gap: 24px;
}
.col-well h2 {
	color: var(--note-well-tag);
}
.col-improve h2 {
	color: var(--note-improve-tag);
}
.col-action h2 {
	color: var(--note-action-tag);
}
ol,
ul {
	margin: 0;
	padding-left: 20px;
	display: grid;
	gap: 8px;
}
li {
	overflow-wrap: anywhere;
}
.meta {
	display: block;
	font-size: 12px;
	color: var(--muted);
}
.checks {
	list-style: none;
	padding: 0;
}
.checks .meta {
	display: inline;
}
.checks li::before {
	content: "☐";
	margin-right: 8px;
	color: var(--muted);
}
.checks li.done::before {
	content: "✓";
	color: var(--ok);
	font-weight: 800;
}
.checks li.done {
	color: var(--muted);
}
.checks li.dropped {
	color: var(--muted);
	text-decoration: line-through;
}
.checks li.dropped::before {
	content: "✕";
}
.meta:empty {
	display: none;
}
@media (max-width: 600px) {
	.sheet {
		padding: 20px;
	}
	header {
		flex-wrap: wrap;
	}
}
</style>
