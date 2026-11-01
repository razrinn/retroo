// The /demo board: a stand-in for the Board Durable Object that runs in the browser and saves to
// localStorage, so people can try retroo without a password or a server. It speaks the same messages
// as the real WebSocket. Keep its rules in step with Board in src/worker.ts (the tests cover the real one).
import { REACTIONS, load, save } from "./lib";
import { SHOWS } from "./shows";

const KEY = "retroo-demo-live"; // new key when the starting data changes, so old saved demos start fresh
const COLS = ["well", "improve", "action"];

type Data = {
	title: string;
	phase: "writing" | "revealed" | "locked";
	previousTitle: string;
	previousMood: number;
	timerEnd: number | null;
	people: Record<string, string>;
	cards: { id: string; col: string; text: string; author: string; at: number; parent?: string | null }[];
	reactions: { card: string; person: string; emoji: string }[];
	comments: { id: string; card: string; author: string; text: string; at: number }[];
	followUps: { id: string; text: string; carried: number; status: "open" | "done" | "dropped" }[];
	moods: Record<string, number>;
	strokes: { id: string; author: string; c: string; w: number; p: [number, number][] }[];
	roster?: { name: string; done: boolean }[];
	mc?: string | null;
	lastShow?: string;
};

const id = () => crypto.randomUUID();
const TEAM = { dina: "Dina", budi: "Budi", sari: "Sari" };

function seed(): Data {
	const t = Date.now() - 600_000;
	const circle = Array.from({ length: 40 }, (_, i): [number, number] => [
		0.78 + 0.1 * Math.cos((i / 39) * 2 * Math.PI),
		0.45 + 0.16 * Math.sin((i / 39) * 2 * Math.PI),
	]);
	const cards = [
		{ id: id(), col: "well", text: "Pairing on the payment bug saved us days", author: "dina", at: t },
		{ id: id(), col: "well", text: "New hire onboarding went smoothly", author: "sari", at: t + 1 },
		{ id: id(), col: "improve", text: "Too many meetings on Wednesday", author: "budi", at: t + 2 },
		{ id: id(), col: "improve", text: "Staging was flaky again", author: "dina", at: t + 3 },
		{ id: id(), col: "action", text: "Try no-meeting Wednesday afternoons (Budi)", author: "budi", at: t + 4 },
	];
	// A few reactions from the made-up teammates, so the board looks like a retro in progress.
	const react = (card: number, person: string, emoji: string) => ({ card: cards[card].id, person, emoji });
	return {
		title: "Sprint 42 (demo)",
		phase: "revealed", // a Live board, like new boards: cards visible, reactions open
		previousTitle: "Sprint 41",
		previousMood: 3.4,
		timerEnd: null,
		people: { ...TEAM },
		cards,
		reactions: [react(2, "dina", "🔥"), react(2, "sari", "🔥"), react(0, "budi", "❤️"), react(3, "budi", "👍")],
		comments: [],
		followUps: [
			{ id: id(), text: "Write the onboarding doc (Sari)", carried: 3, status: "open" },
			{ id: id(), text: "Fix flaky CI (Dina)", carried: 1, status: "open" },
			{ id: id(), text: "Move standup to async (Budi)", carried: 1, status: "done" },
		],
		moods: { dina: 4, budi: 2, sari: 3 },
		strokes: [{ id: id(), author: "sari", c: "#ef9f27", w: 8, p: circle }],
	};
}

export function resetDemo() {
	save(KEY, "");
}

type Handlers = { open: () => void; message: (data: any) => void };

// Looks like a WebSocket to the board: readyState, send, close.
export function demoSocket(me: string, name: string, on: Handlers) {
	let data: Data;
	try {
		data = JSON.parse(load(KEY)) as Data;
	} catch {
		data = seed();
	}
	data.people[me] = name || "You";
	// The demo team's real names for the next-MC picker; Budi was MC last time.
	data.roster ??= ["Dina", "Budi", "Sari", "Ray"].map((n) => ({ name: n, done: n === "Budi" }));
	const persist = () => save(KEY, JSON.stringify(data));

	function view() {
		const writing = data.phase === "writing";
		const moods = Object.entries(data.moods);
		const counts = [1, 2, 3, 4, 5].map((v) => moods.filter(([, m]) => m === v).length);
		const avg = moods.length ? Math.round((moods.reduce((n, [, m]) => n + m, 0) / moods.length) * 10) / 10 : null;
		return {
			title: data.title,
			previousTitle: data.previousTitle,
			followUps: data.followUps,
			phase: data.phase,
			live: true,
			online: Object.values(data.people).sort(),
			now: Date.now(),
			timerEnd: data.timerEnd,
			team: { roster: data.roster, mc: data.mc ?? null, host: "Budi" },
			mood: {
				mine: data.moods[me] ?? null,
				rated: moods.length,
				people: Object.keys(data.people).length,
				counts: writing ? null : counts,
				average: writing ? null : avg,
				previous: data.previousMood,
			},
			cards: data.cards.map((c) => {
				const mine = c.author === me;
				const hidden = writing && c.col !== "action" && !mine;
				const reactions = REACTIONS.map((emoji) => {
					const rows = data.reactions.filter((r) => r.card === c.id && r.emoji === emoji);
					return { emoji, count: rows.length, mine: rows.some((r) => r.person === me), names: rows.map((r) => data.people[r.person] ?? "Anonymous") };
				}).filter((r) => r.count > 0);
				return {
					id: c.id,
					col: c.col,
					text: hidden ? null : c.text,
					name: "", // cards are anonymous, like on real boards
					mine,
					parent: c.parent ?? null,
					reactions,
					total: reactions.reduce((n, r) => n + r.count, 0),
					comments: hidden
						? []
						: data.comments
								.filter((m) => m.card === c.id)
								.map((m) => ({ id: m.id, name: data.people[m.author] ?? "Anonymous", text: m.text, mine: m.author === me })),
				};
			}),
		};
	}

	function handle(msg: any) {
		const phase = data.phase;
		const text = typeof msg.text === "string" ? msg.text.trim() : "";
		const card = data.cards.find((c) => c.id === msg.id);
		const own = card?.author === me;
		switch (msg.type) {
			case "name":
				data.people[me] = String(msg.name ?? "").trim().slice(0, 40) || "You";
				break;
			case "add":
				if (phase === "locked" || !text || !COLS.includes(msg.col)) return;
				data.cards.push({ id: id(), col: msg.col, text: text.slice(0, 500), author: me, at: Date.now() });
				break;
			case "edit":
				if (phase === "locked" || !text || !own) return;
				card!.text = text.slice(0, 500);
				break;
			case "delete":
				if (phase !== "writing" || !own) return;
				data.cards = data.cards.filter((c) => c !== card);
				break;
			case "react": {
				if (phase !== "revealed" || !card || !REACTIONS.includes(msg.emoji)) return;
				const same = data.reactions.some((r) => r.card === card.id && r.person === me && r.emoji === msg.emoji);
				data.reactions = data.reactions.filter((r) => !(r.card === card.id && r.person === me));
				if (!same) data.reactions.push({ card: card.id, person: me, emoji: msg.emoji });
				break;
			}
			case "stack": {
				const target = data.cards.find((c) => c.id === msg.onto);
				if (phase !== "revealed" || !card || !target || card.col !== target.col || card.col === "action") return;
				const root = target.parent ?? target.id;
				if (root === card.id || card.parent === root) return;
				for (const c of data.cards) if (c === card || c.parent === card.id) c.parent = root;
				break;
			}
			case "unstack":
				if (phase !== "revealed" || !card) return;
				card.parent = null;
				break;
			case "comment":
				if (phase === "locked" || !card || !text || (phase === "writing" && card.col !== "action")) return;
				data.comments.push({ id: id(), card: card.id, author: me, text: text.slice(0, 300), at: Date.now() });
				break;
			case "uncomment":
				if (phase === "locked") return;
				data.comments = data.comments.filter((m) => !(m.id === msg.id && m.author === me));
				break;
			case "followup": {
				const f = data.followUps.find((x) => x.id === msg.id);
				if (phase === "locked" || !f || !["open", "done", "dropped"].includes(msg.status)) return;
				f.status = msg.status;
				break;
			}
			case "mood":
				if (phase === "locked" || !(msg.value >= 1 && msg.value <= 5)) return;
				data.moods[me] = msg.value;
				break;
			case "timer":
				data.timerEnd = msg.seconds ? Date.now() + msg.seconds * 1000 : null;
				break;
			case "reveal":
				if (phase !== "writing") return;
				data.phase = "revealed";
				break;
			// No password in the demo: locking just flips the board read-only and back.
			case "lock":
				data.phase = msg.locked ? "locked" : "revealed";
				break;
			case "roster_add":
				if (phase === "locked" || !text || data.roster!.some((m) => m.name.toLowerCase() === text.toLowerCase())) return;
				data.roster!.push({ name: text.slice(0, 40), done: false });
				break;
			case "roster_remove":
				data.roster = data.roster!.filter((m) => m.name !== msg.name);
				if (data.mc === msg.name) data.mc = null;
				break;
			case "pick": {
				// Same rules as the server's pickMc.
				const roster = data.roster!;
				if (phase === "locked" || roster.length < 2) return;
				if (data.mc) roster.forEach((m) => m.name === data.mc && (m.done = false));
				let pool = roster.filter((m) => !m.done);
				if (!pool.length) roster.forEach((m) => (m.done = false)), (pool = roster);
				const winner = pool[Math.floor(Math.random() * pool.length)].name;
				const shows = SHOWS.filter((x) => x !== data.lastShow);
				const show = shows[Math.floor(Math.random() * shows.length)];
				roster.forEach((m) => m.name === winner && (m.done = true));
				data.mc = winner;
				data.lastShow = show;
				persist();
				on.message({ pick: { show, winner, names: roster.map((m) => m.name), seed: Math.floor(Math.random() * 2 ** 31) } });
				break;
			}
			case "burst":
				on.message({ burst: msg.emoji, name: data.people[me], from: me });
				return;
			case "doodle":
				on.message({ doodle: data.strokes.map((s) => ({ ...s, mine: s.author === me })) });
				return;
			case "stroke": {
				if (phase === "locked" || !msg.stroke) return;
				const s = { id: id(), author: me, ...msg.stroke };
				data.strokes.push(s);
				persist();
				on.message({ stroke: { ...s, mine: true } });
				return;
			}
			case "undo": {
				if (phase === "locked") return;
				const last = data.strokes.findLast((s) => s.author === me);
				if (!last) return;
				data.strokes = data.strokes.filter((s) => s !== last);
				persist();
				on.message({ unstroke: last.id });
				return;
			}
			default:
				return;
		}
		persist();
		on.message(view());
	}

	setTimeout(() => {
		on.open();
		persist();
		on.message(view());
	});
	return {
		readyState: WebSocket.OPEN as number,
		send: (raw: string) => handle(JSON.parse(raw)),
		close() {},
	};
}
