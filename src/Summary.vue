<script setup lang="ts">
import { domToBlob } from "modern-screenshot";
import { computed, onMounted, onUnmounted, ref } from "vue";
import ShareCard from "./ShareCard.vue";
import { type BoardState, type Card, COLS, useFocusTrap } from "./lib";

// The wrap-up: a live preview of the share image (exactly what gets copied, downloaded or shared),
// plus a Markdown copy for Confluence or Notion.
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

// The preview is the real ShareCard at 1200×675, scaled down to fit; the PNG is taken from it directly.
const doodleUrl = ref<string | null>(props.doodle?.() ?? null);
const cardEl = ref<HTMLElement>();
const frame = ref<HTMLElement>();
const scale = ref(0.5);
let observer: ResizeObserver;
onMounted(() => {
	observer = new ResizeObserver(() => (scale.value = (frame.value?.clientWidth ?? 600) / 1200));
	observer.observe(frame.value!);
});
onUnmounted(() => observer.disconnect());
const imageStatus = ref("");
const fileName = computed(() => `${(props.state.title || "retro").replace(/[^\w-]+/g, "-").toLowerCase()}.png`);
async function makeImage() {
	await document.fonts.ready;
	// The preview is scaled down on screen, so give the real size; otherwise the PNG comes out small.
	return domToBlob(cardEl.value!, { width: 1200, height: 675, scale: 2, type: "image/png" });
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

async function copy() {
	await navigator.clipboard?.writeText(markdown.value);
	flash("Markdown copied");
}
const dialog = ref<HTMLElement>();
useFocusTrap(dialog);
const onKey = (e: KeyboardEvent) => e.key === "Escape" && emit("close");
onMounted(() => addEventListener("keydown", onKey));
onUnmounted(() => removeEventListener("keydown", onKey));
</script>

<template>
	<div ref="dialog" class="summary" role="dialog" aria-modal="true" aria-label="Retro summary" @click.self="emit('close')">
		<article class="sheet">
			<header>
				<h1>Summary</h1>
				<span class="spacer" />
				<button class="ghost close" aria-label="Close summary" @click="emit('close')">✕</button>
			</header>

			<div ref="frame" class="frame">
				<div class="scaler" :style="{ transform: `scale(${scale})` }">
					<div ref="cardEl"><ShareCard :state="state" :doodle="doodleUrl" /></div>
				</div>
			</div>

			<footer>
				<button class="primary" @click="copyImage">Copy image</button>
				<button @click="downloadImage">Download</button>
				<button v-if="canShare" @click="shareImage">Share</button>
				<span class="spacer" />
				<span v-if="imageStatus" class="status muted" role="status">{{ imageStatus }}</span>
				<button class="ghost" @click="copy">Copy as Markdown</button>
			</footer>
		</article>
	</div>
</template>

<style scoped>
.summary {
	position: fixed;
	inset: 0;
	z-index: 50;
	overflow-y: auto;
	display: grid;
	place-items: center;
	padding: 24px 16px;
	background: color-mix(in srgb, var(--text) 28%, transparent);
	backdrop-filter: blur(3px);
}
.sheet {
	width: min(900px, 100%);
	padding: 18px 20px 20px;
	display: grid;
	gap: 14px;
	background: var(--surface);
	border-radius: 18px;
	box-shadow: 0 24px 60px -20px rgba(40, 30, 10, 0.45);
	animation: rise-in 0.3s cubic-bezier(0.3, 1.3, 0.5, 1);
}
@keyframes rise-in {
	from {
		opacity: 0;
		translate: 0 16px;
	}
}
header {
	display: flex;
	align-items: center;
}
h1 {
	font-size: 20px;
}
.close {
	width: 34px;
	height: 34px;
	padding: 0;
	border-radius: 50%;
}
/* 16:9 box; the 1200×675 card inside is scaled to its width. */
.frame {
	position: relative;
	aspect-ratio: 1200 / 675;
	overflow: hidden;
	border-radius: 12px;
	border: 1.5px solid var(--border);
}
.scaler {
	position: absolute;
	top: 0;
	left: 0;
	width: 1200px;
	transform-origin: top left;
}
footer {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 8px;
}
.status {
	font-size: 13px;
}
</style>
