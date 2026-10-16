export type Phase = "writing" | "revealed" | "locked";
export type Reaction = { emoji: string; count: number; mine: boolean };
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
};
export type FollowUp = { id: string; text: string; carried: number; status: "open" | "done" | "dropped" };
export type Mood = { mine: number | null; rated: number; people: number; counts: number[] | null; average: number | null; previous: number | null };
export type BoardState = {
	title: string;
	previousTitle: string;
	followUps: FollowUp[];
	phase: Phase;
	online: string[];
	now: number;
	timerEnd: number | null;
	mood: Mood;
	cards: Card[];
};
export type ListedBoard = { code: string; title: string; created_at: number };

export const COLS = [
	{ key: "well", label: "Went well" },
	{ key: "improve", label: "To improve" },
	{ key: "action", label: "Action items" },
];
// Mood levels 1-5, drawn as Stickie faces (Mascot.vue).
export const MOODS = [1, 2, 3, 4, 5];
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
