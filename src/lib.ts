import { type Ref, computed, onMounted, onUnmounted, ref } from "vue";

export type Phase = "writing" | "revealed" | "locked";
export type Reaction = { emoji: string; count: number; mine: boolean; names: string[] };
export type Comment = { id: string; name: string; text: string; mine: boolean };
export type Card = {
	id: string;
	col: string;
	text: string | null;
	name: string;
	mine: boolean;
	reactions: Reaction[];
	total: number;
	comments: Comment[];
	parent: string | null; // the card this one is stacked under, if grouped
};
// A card plus the cards stacked under it (a lone card is a stack of one); total adds up their reactions.
export type Stack = { id: string; col: string; cards: Card[]; total: number };
export type FollowUp = { id: string; text: string; carried: number; status: "open" | "done" | "dropped" };
export type Mood = { mine: number | null; rated: number; people: number; counts: number[] | null; average: number | null; previous: number | null };
export type BoardState = {
	host: boolean; // you're this board's host: you see the join PIN and can lock, unlock and reset access
	title: string;
	previousTitle: string;
	followUps: FollowUp[];
	phase: Phase;
	live: boolean; // cards visible as written (no Reveal step); the "revealed" phase shows as Open
	online: string[];
	now: number;
	timerEnd: number | null;
	mood: Mood;
	cards: Card[];
	// Next-MC picker: the team roster (done = had a turn), the MC picked on this board, and this retro's MC
	// (picked on the previous board).
	team: { roster: { name: string; done: boolean }[]; mc: string | null; host: string | null };
};
// Stacks in a column, in writing order; byReactions puts the most-reacted first (ties keep writing order).
export function stacksIn(cards: Card[], col: string, byReactions = false): Stack[] {
	const inCol = cards.filter((c) => c.col === col);
	const heads = inCol.filter((c) => !c.parent || !inCol.some((h) => h.id === c.parent));
	const stacks = heads.map((h) => {
		const all = [h, ...inCol.filter((c) => c.parent === h.id)];
		return { id: h.id, col, cards: all, total: all.reduce((n, c) => n + c.total, 0) };
	});
	if (!byReactions) return stacks;
	return stacks
		.map((s, i) => ({ s, i }))
		.sort((a, b) => b.s.total - a.s.total || a.i - b.i)
		.map(({ s }) => s);
}
// "👍 3  🔥 2" for a whole stack, emojis in the fixed order.
export const stackReactions = (s: Stack, sep = "  ") =>
	REACTIONS.map((emoji) => [emoji, s.cards.reduce((n, c) => n + (c.reactions.find((r) => r.emoji === emoji)?.count ?? 0), 0)] as const)
		.filter(([, n]) => n > 0)
		.map(([e, n]) => `${e} ${n}`)
		.join(sep);
export type ListedBoard = { code: string; title: string; created_at: number; mood: number | null };

export const COLS = [
	{ key: "well", label: "Went well" },
	{ key: "improve", label: "To improve" },
	{ key: "action", label: "Action items" },
];
// Mood levels 1-5, drawn as Stickie faces (Mascot.vue).
export const MOODS = [1, 2, 3, 4, 5];
// Mood 1-5 as colors (red, amber, grey, mint, lavender); moodTint blends between them for averages like 3.6.
export const MOOD_TINTS = ["#d85a30", "#ef9f27", "#888780", "#1d9e75", "#7f77dd"];
const mixHex = (a: string, b: string, t: number) =>
	"#" + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, "0")).join("");
export function moodTint(level: number) {
	const i = Math.min(3, Math.max(0, Math.floor(level - 1)));
	return mixHex(MOOD_TINTS[i], MOOD_TINTS[i + 1], Math.min(1, Math.max(0, level - 1 - i)));
}
export const GITHUB_URL = "https://github.com/razrinn/retroo";
export const REACTIONS = ["👍", "👎", "❤️", "😂", "🎉", "🚀", "🔥", "🤔"];

// localStorage can throw (private mode, blocked storage); the app still works, it just forgets.
export const load = (key: string) => {
	try {
		return localStorage.getItem(key) ?? "";
	} catch {
		return "";
	}
};
export const save = (key: string, value: string) => {
	try {
		localStorage.setItem(key, value);
	} catch {}
};

// Codes are 8 plain characters (same rule as the Worker); the dash is only for display.
const codeChars = (raw: string) => raw.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 9);
export const normalizeCode = (raw: string) => {
	const c = codeChars(raw);
	return c.length === 8 ? c : "";
};
// "K7QM4XPT" -> "K7QM-4XPT"; also formats partial input while typing ("K7QM4" -> "K7QM-4").
export const formatCode = (raw: string) => codeChars(raw).slice(0, 8).replace(/^(.{4})(?=.)/, "$1-");

export async function post<T>(url: string, body: object): Promise<T> {
	const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(data.error ?? "Something went wrong. Try again.");
	return data;
}

// Stable small number per string: gives each card its tilt and each person their bubble color.
export const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

// ponytail: hand-rolled confetti on a throwaway canvas, swap for a library only if we want more effects
export function confetti() {
	if (reducedMotion()) return;
	const canvas = document.createElement("canvas");
	canvas.className = "confetti";
	canvas.width = innerWidth;
	canvas.height = innerHeight;
	document.body.append(canvas);
	const ctx = canvas.getContext("2d")!;
	const colors = ["#5DCAA5", "#F0997B", "#AFA9EC", "#EF9F27", "#85B7EB"];
	const bits = Array.from({ length: 140 }, () => ({
		x: innerWidth / 2,
		y: innerHeight / 3,
		vx: (Math.random() - 0.5) * 16,
		vy: Math.random() * -14 - 4,
		r: Math.random() * Math.PI,
		c: colors[Math.floor(Math.random() * colors.length)],
	}));
	let frame = 0;
	(function tick() {
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		for (const b of bits) {
			b.x += b.vx;
			b.y += b.vy;
			b.vy += 0.45;
			b.r += 0.2;
			ctx.save();
			ctx.translate(b.x, b.y);
			ctx.rotate(b.r);
			ctx.fillStyle = b.c;
			ctx.fillRect(-4, -2, 8, 4);
			ctx.restore();
		}
		if (++frame < 150) requestAnimationFrame(tick);
		else canvas.remove();
	})();
}

// Closes a menu or popover on a click outside `el` or on Esc, while `open` is true.
export function useDismiss(open: Ref<boolean>, el: Ref<HTMLElement | undefined>) {
	const onPointer = (e: PointerEvent) => {
		if (open.value && el.value && !el.value.contains(e.target as Node)) open.value = false;
	};
	const onKey = (e: KeyboardEvent) => {
		if (open.value && e.key === "Escape") open.value = false;
	};
	onMounted(() => {
		document.addEventListener("pointerdown", onPointer);
		document.addEventListener("keydown", onKey);
	});
	onUnmounted(() => {
		document.removeEventListener("pointerdown", onPointer);
		document.removeEventListener("keydown", onKey);
	});
}

// For dialogs: keeps Tab inside `el`, focuses its first control on open, and returns focus on close.
export function useFocusTrap(el: Ref<HTMLElement | undefined>) {
	let before: Element | null = null;
	const controls = () =>
		[...(el.value?.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex]:not([tabindex='-1'])") ?? [])].filter(
			(c) => !c.hasAttribute("disabled"),
		);
	const onKey = (e: KeyboardEvent) => {
		if (e.key !== "Tab") return;
		const list = controls();
		if (!list.length) return;
		const first = list[0];
		const last = list[list.length - 1];
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	};
	onMounted(() => {
		before = document.activeElement;
		controls()[0]?.focus();
		document.addEventListener("keydown", onKey);
	});
	onUnmounted(() => {
		document.removeEventListener("keydown", onKey);
		(before as HTMLElement | null)?.focus?.();
	});
}

// The host's join PIN: "123 456" and the share of its minute still left (0..1), ticking. `until` is server
// time; `offset` is server minus this clock.
export type Pin = { value: string; until: number };
export function usePinClock(pin: () => Pin | null, offset: () => number) {
	const now = ref(Date.now());
	let clock = 0;
	onMounted(() => (clock = setInterval(() => (now.value = Date.now()), 250)));
	onUnmounted(() => clearInterval(clock));
	const p = computed(pin);
	return {
		digits: computed(() => (p.value ? `${p.value.value.slice(0, 3)} ${p.value.value.slice(3)}` : "··· ···")),
		left: computed(() => (p.value ? Math.max(0, p.value.until - (now.value + offset())) / 60_000 : 0)),
	};
}
