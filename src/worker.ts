import { DurableObject } from "cloudflare:workers";

const COLS = ["well", "improve", "action"];
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O, 1/I/L
const MAX_TEXT = 500;
const TIMER_SECONDS = [180, 300, 600];
const REACTIONS = ["👍", "👎", "❤️", "😂", "🎉", "🚀", "🔥", "🤔"];
const MAX_COMMENT = 300;
const DOODLE_COLORS = ["#2a2723", "#e24b4a", "#ef9f27", "#1d9e75", "#378add", "#7f77dd"];
const DOODLE_WIDTHS = [3, 8];
const MAX_STROKES = 2000;
const MAX_POINTS = 500;

type Phase = "writing" | "revealed" | "locked";
type FollowUp = { text: string; carried: number };
type Stroke = { c: string; w: number; p: [number, number][] };
type Msg = { type: string; stroke?: Stroke; id?: string; col?: string; text?: string; name?: string; status?: string; value?: number; seconds?: number; emoji?: string };

const json = (data: unknown, status = 200) => Response.json(data, { status });

function newCode() {
	const bytes = crypto.getRandomValues(new Uint8Array(8));
	return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

// Codes are 8 plain characters; "k7qm-4xpt" and "K7QM 4XPT" mean the same board. The dash is only for display.
function normalizeCode(raw: string) {
	const c = raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
	return c.length === 8 ? c : null;
}

async function checkPassword(given: unknown, env: Env) {
	if (typeof given !== "string" || !env.CREATE_PASSWORD) return false;
	const enc = new TextEncoder();
	const [a, b] = await Promise.all(
		[given, env.CREATE_PASSWORD].map((s) => crypto.subtle.digest("SHA-256", enc.encode(s))),
	);
	return crypto.subtle.timingSafeEqual(a, b);
}

// ponytail: schema created lazily on the two rare D1 paths, move to migrations if the table ever changes
const ensureIndex = (env: Env) =>
	env.DB.exec("CREATE TABLE IF NOT EXISTS boards (code TEXT PRIMARY KEY, title TEXT NOT NULL, created_at INTEGER NOT NULL)");

// The binding names this Worker by string, so cf can't infer the class; tell TS which one it is.
const boardStub = (env: Env, code: string) => env.BOARD.getByName(code) as DurableObjectStub<Board>;

export default {
	async fetch(req, env) {
		const url = new URL(req.url);
		const path = url.pathname;

		if (req.method === "POST" && path === "/api/boards") {
			const body = await req.json<{ password?: string; title?: string; previous?: string }>().catch(() => ({}) as never);
			if (!(await checkPassword(body.password, env))) return json({ error: "Wrong password" }, 403);
			const title = String(body.title ?? "").trim().slice(0, 100);
			const previous = body.previous ? normalizeCode(String(body.previous)) : null;
			const carried = previous ? await boardStub(env, previous).carryOver() : null;
			const code = newCode();
			await ensureIndex(env);
			await env.DB.prepare("INSERT INTO boards (code, title, created_at) VALUES (?, ?, ?)")
				.bind(code, title, Date.now())
				.run();
			await boardStub(env, code).init(title, carried);
			return json({ code });
		}

		if (req.method === "POST" && path === "/api/boards/list") {
			const body = await req.json<{ password?: string }>().catch(() => ({}) as never);
			if (!(await checkPassword(body.password, env))) return json({ error: "Wrong password" }, 403);
			await ensureIndex(env);
			const { results } = await env.DB.prepare("SELECT code, title, created_at FROM boards ORDER BY created_at DESC").all();
			return json(results);
		}

		const m = path.match(/^\/api\/boards\/([^/]+)\/(ws|lock)$/);
		const code = m && normalizeCode(m[1]);
		if (!m || !code) return json({ error: "Not found" }, 404);
		const board = boardStub(env, code);

		if (m[2] === "ws") return board.fetch(req);

		if (req.method === "POST") {
			const body = await req.json<{ password?: string; locked?: boolean }>().catch(() => ({}) as never);
			if (!(await checkPassword(body.password, env))) return json({ error: "Wrong password" }, 403);
			return (await board.setLocked(!!body.locked)) ? json({ ok: true }) : json({ error: "Not found" }, 404);
		}
		return json({ error: "Not found" }, 404);
	},
} satisfies ExportedHandler<Env>;

// Accepts only our colors and widths, points as 0..1 fractions rounded to 3 decimals, at most MAX_POINTS.
function cleanStroke(raw: unknown): Stroke | null {
	const s = raw as Stroke;
	if (!s || !DOODLE_COLORS.includes(s.c) || !DOODLE_WIDTHS.includes(s.w) || !Array.isArray(s.p)) return null;
	if (s.p.length < 1 || s.p.length > MAX_POINTS) return null;
	const p: [number, number][] = [];
	for (const pt of s.p) {
		if (!Array.isArray(pt) || pt.length !== 2) return null;
		const [x, y] = pt.map(Number);
		if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return null;
		p.push([Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]);
	}
	return { c: s.c, w: s.w, p };
}

export class Board extends DurableObject<Env> {
	sql = this.ctx.storage.sql;
	// ponytail: in-memory spam limit for emoji rain, resets if the object hibernates, which is fine for a toy
	recentBursts = new Map<string, number[]>();

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.sql.exec(`
			CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
			CREATE TABLE IF NOT EXISTS people (id TEXT PRIMARY KEY, name TEXT NOT NULL);
			CREATE TABLE IF NOT EXISTS cards (id TEXT PRIMARY KEY, col TEXT NOT NULL, text TEXT NOT NULL, author TEXT NOT NULL, created_at INTEGER NOT NULL);
			CREATE TABLE IF NOT EXISTS reactions (card TEXT NOT NULL, person TEXT NOT NULL, emoji TEXT NOT NULL, PRIMARY KEY (card, person, emoji));
			CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, card TEXT NOT NULL, author TEXT NOT NULL, text TEXT NOT NULL, created_at INTEGER NOT NULL);
			CREATE TABLE IF NOT EXISTS followups (id TEXT PRIMARY KEY, text TEXT NOT NULL, carried INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'open');
			CREATE TABLE IF NOT EXISTS strokes (id TEXT PRIMARY KEY, author TEXT NOT NULL, data TEXT NOT NULL, created_at INTEGER NOT NULL);
			CREATE TABLE IF NOT EXISTS moods (person TEXT PRIMARY KEY, value INTEGER NOT NULL);
		`);
	}

	meta(key: string) {
		return this.sql.exec<{ value: string }>("SELECT value FROM meta WHERE key = ?", key).toArray()[0]?.value;
	}

	setMeta(key: string, value: string) {
		this.sql.exec("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
	}

	get phase() {
		return this.meta("phase") as Phase | undefined;
	}

	init(title: string, previous: { title: string; mood: number | null; items: FollowUp[] } | null) {
		this.setMeta("title", title);
		this.setMeta("phase", "writing");
		if (!previous) return;
		this.setMeta("previous_title", previous.title);
		if (previous.mood !== null) this.setMeta("previous_mood", String(previous.mood));
		for (const f of previous.items) this.sql.exec("INSERT INTO followups (id, text, carried) VALUES (?, ?, ?)", crypto.randomUUID(), f.text, f.carried);
	}

	moodAverage() {
		const avg = this.sql.exec<{ avg: number | null }>("SELECT AVG(value) AS avg FROM moods").one().avg;
		return avg === null ? null : Math.round(avg * 10) / 10;
	}

	// What the next sprint's board inherits: follow-ups still open (not done or dropped), this board's action items, and its mood.
	carryOver() {
		if (!this.phase) return null;
		const items = this.sql
			.exec<FollowUp>(
				`SELECT text, carried FROM (
					SELECT text, carried + 1 AS carried, 0 AS grp, rowid AS ord FROM followups WHERE status = 'open'
					UNION ALL SELECT text, 1, 1, created_at FROM cards WHERE col = 'action'
				) ORDER BY grp, ord`,
			)
			.toArray();
		return { title: this.meta("title") ?? "", mood: this.moodAverage(), items };
	}

	// Locking reveals too, so a locked board never keeps hidden cards. Unlock returns to revealed.
	setLocked(locked: boolean) {
		if (!this.phase) return false;
		this.setMeta("phase", locked ? "locked" : "revealed");
		this.broadcast();
		return true;
	}

	async fetch(req: Request) {
		if (!this.phase) return new Response("Board not found", { status: 404 });
		if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });

		const url = new URL(req.url);
		const client = url.searchParams.get("client") ?? "";
		if (!/^[\w-]{8,64}$/.test(client)) return new Response("Bad client id", { status: 400 });
		this.setName(client, url.searchParams.get("name"));

		const { 0: browser, 1: server } = new WebSocketPair();
		this.ctx.acceptWebSocket(server);
		server.serializeAttachment({ client });
		this.broadcast();
		return new Response(null, { status: 101, webSocket: browser });
	}

	setName(client: string, raw: unknown) {
		const name = String(raw ?? "").trim().slice(0, 40) || "Anonymous";
		this.sql.exec("INSERT INTO people (id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name", client, name);
	}

	webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
		const { client } = ws.deserializeAttachment() as { client: string };
		let msg: Msg;
		try {
			msg = JSON.parse(String(raw));
		} catch {
			return;
		}
		const phase = this.phase;
		const text = typeof msg.text === "string" ? msg.text.trim().slice(0, MAX_TEXT) : "";
		const own = (id: unknown) =>
			this.sql.exec("SELECT 1 FROM cards WHERE id = ? AND author = ?", String(id), client).toArray().length > 0;
		const cardCol = (id: unknown) => this.sql.exec<{ col: string }>("SELECT col FROM cards WHERE id = ?", String(id)).toArray()[0]?.col;

		switch (msg.type) {
			case "name":
				this.setName(client, msg.name);
				break;
			case "add":
				if (phase === "locked" || !text || !COLS.includes(String(msg.col))) return;
				this.sql.exec("INSERT INTO cards (id, col, text, author, created_at) VALUES (?, ?, ?, ?, ?)", crypto.randomUUID(), msg.col, text, client, Date.now());
				break;
			case "edit":
				if (phase === "locked" || !text || !own(msg.id)) return;
				this.sql.exec("UPDATE cards SET text = ? WHERE id = ?", text, msg.id);
				break;
			case "delete":
				if (phase !== "writing" || !own(msg.id)) return;
				this.sql.exec("DELETE FROM cards WHERE id = ?", msg.id);
				this.sql.exec("DELETE FROM reactions WHERE card = ?", msg.id);
				this.sql.exec("DELETE FROM comments WHERE card = ?", msg.id);
				break;
			case "react": {
				if (phase !== "revealed" || !REACTIONS.includes(String(msg.emoji))) return;
				// One reaction per person per card: same emoji again removes it, a different one replaces it.
				const same = this.sql.exec("DELETE FROM reactions WHERE card = ? AND person = ? AND emoji = ?", msg.id, client, msg.emoji).rowsWritten;
				if (!same) {
					this.sql.exec("DELETE FROM reactions WHERE card = ? AND person = ?", msg.id, client);
					this.sql.exec("INSERT INTO reactions (card, person, emoji) SELECT id, ?, ? FROM cards WHERE id = ?", client, msg.emoji, msg.id);
				}
				break;
			}
			case "comment": {
				// Comments need a card you can see: any card once revealed, action items (never hidden) any time.
				const col = cardCol(msg.id);
				const body = typeof msg.text === "string" ? msg.text.trim().slice(0, MAX_COMMENT) : "";
				if (phase === "locked" || !col || !body || (phase === "writing" && col !== "action")) return;
				this.sql.exec("INSERT INTO comments (id, card, author, text, created_at) VALUES (?, ?, ?, ?, ?)", crypto.randomUUID(), msg.id, client, body, Date.now());
				break;
			}
			case "uncomment":
				if (phase === "locked") return;
				if (!this.sql.exec("DELETE FROM comments WHERE id = ? AND author = ?", String(msg.id), client).rowsWritten) return;
				break;
			case "followup":
				if (phase === "locked" || !["open", "done", "dropped"].includes(String(msg.status))) return;
				this.sql.exec("UPDATE followups SET status = ? WHERE id = ?", msg.status, msg.id);
				break;
			case "mood": {
				const value = Number(msg.value);
				if (phase === "locked" || !Number.isInteger(value) || value < 1 || value > 5) return;
				this.sql.exec("INSERT INTO moods (person, value) VALUES (?, ?) ON CONFLICT(person) DO UPDATE SET value = excluded.value", client, value);
				break;
			}
			case "timer": {
				// Store only the end time; every browser counts down on its own.
				const seconds = Number(msg.seconds);
				if (seconds === 0) this.sql.exec("DELETE FROM meta WHERE key = 'timer_end'");
				else if (TIMER_SECONDS.includes(seconds)) this.setMeta("timer_end", String(Date.now() + seconds * 1000));
				else return;
				break;
			}
			case "burst": {
				// Emoji rain: relayed to everyone, never stored. At most 6 per person per 2 seconds.
				if (!REACTIONS.includes(String(msg.emoji))) return;
				const now = Date.now();
				const recent = (this.recentBursts.get(client) ?? []).filter((t) => now - t < 2000);
				if (recent.length >= 6) return;
				this.recentBursts.set(client, [...recent, now]);
				const name = this.sql.exec<{ name: string }>("SELECT name FROM people WHERE id = ?", client).toArray()[0]?.name ?? "";
				const out = JSON.stringify({ burst: msg.emoji, name });
				for (const s of this.ctx.getWebSockets()) if (s.readyState === WebSocket.OPEN) s.send(out);
				return;
			}
			// Doodle wall: strokes go out one at a time, separate from the board state, so a big drawing never
			// makes card updates heavy. A newcomer asks for the whole wall once with "doodle".
			case "doodle": {
				const strokes = this.sql
					.exec<{ id: string; author: string; data: string }>("SELECT id, author, data FROM strokes ORDER BY created_at")
					.toArray()
					.map((r) => ({ id: r.id, mine: r.author === client, ...JSON.parse(r.data) }));
				ws.send(JSON.stringify({ doodle: strokes }));
				return;
			}
			case "stroke": {
				const stroke = cleanStroke(msg.stroke);
				if (phase === "locked" || !stroke) return;
				if (this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM strokes").one().n >= MAX_STROKES) return;
				const id = crypto.randomUUID();
				this.sql.exec("INSERT INTO strokes (id, author, data, created_at) VALUES (?, ?, ?, ?)", id, client, JSON.stringify(stroke), Date.now());
				this.toEach((c) => ({ stroke: { id, mine: c === client, ...stroke } }));
				return;
			}
			case "undo": {
				if (phase === "locked") return;
				const last = this.sql.exec<{ id: string }>("SELECT id FROM strokes WHERE author = ? ORDER BY created_at DESC LIMIT 1", client).toArray()[0];
				if (!last) return;
				this.sql.exec("DELETE FROM strokes WHERE id = ?", last.id);
				this.toEach(() => ({ unstroke: last.id }));
				return;
			}
			case "clear":
				if (phase === "locked") return;
				this.sql.exec("DELETE FROM strokes");
				this.toEach(() => ({ doodle: [] }));
				return;
			case "reveal":
				if (phase !== "writing") return;
				this.setMeta("phase", "revealed");
				break;
			default:
				return;
		}
		this.broadcast();
	}

	// Sends a per-person message to every open socket (no full board state).
	toEach(build: (client: string) => unknown) {
		for (const s of this.ctx.getWebSockets()) {
			if (s.readyState !== WebSocket.OPEN) continue;
			s.send(JSON.stringify(build((s.deserializeAttachment() as { client: string }).client)));
		}
	}

	webSocketClose() {
		this.broadcast();
	}

	// ponytail: sends the whole board on every change, send diffs if boards grow past a few hundred cards
	broadcast() {
		const sockets = this.ctx.getWebSockets().filter((ws) => ws.readyState === WebSocket.OPEN);
		const clients = sockets.map((ws) => (ws.deserializeAttachment() as { client: string }).client);
		const names = (ids: string[]) =>
			ids.length
				? this.sql.exec<{ name: string }>(`SELECT name FROM people WHERE id IN (${ids.map(() => "?").join(",")}) ORDER BY name`, ...ids).toArray().map((r) => r.name)
				: [];
		const phase = this.phase;
		const title = this.meta("title") ?? "";
		const previousTitle = this.meta("previous_title") ?? "";
		const followUps = this.sql.exec("SELECT id, text, carried, status FROM followups ORDER BY rowid").toArray();
		const online = names([...new Set(clients)]);
		const timerEnd = Number(this.meta("timer_end")) || null;
		const moods = this.sql.exec<{ person: string; value: number }>("SELECT person, value FROM moods").toArray();
		const people = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM people").one().n;
		const counts = [1, 2, 3, 4, 5].map((v) => moods.filter((m) => m.value === v).length);
		const previousMood = this.meta("previous_mood");
		const cards = this.sql
			.exec<{ id: string; col: string; text: string; author: string; name: string }>(
				`SELECT c.id, c.col, c.text, c.author, COALESCE(p.name, 'Anonymous') AS name
				FROM cards c LEFT JOIN people p ON p.id = c.author ORDER BY c.created_at`,
			)
			.toArray();
		const reactions = this.sql.exec<{ card: string; person: string; emoji: string }>("SELECT card, person, emoji FROM reactions").toArray();
		const comments = this.sql
			.exec<{ id: string; card: string; author: string; name: string; text: string }>(
				`SELECT m.id, m.card, m.author, COALESCE(p.name, 'Anonymous') AS name, m.text
				FROM comments m LEFT JOIN people p ON p.id = m.author ORDER BY m.created_at`,
			)
			.toArray();
		// Counts per emoji in the fixed order, only the ones someone used.
		const reactionsFor = (card: string, me: string) =>
			REACTIONS.map((emoji) => {
				const rows = reactions.filter((r) => r.card === card && r.emoji === emoji);
				return { emoji, count: rows.length, mine: rows.some((r) => r.person === me) };
			}).filter((r) => r.count > 0);

		sockets.forEach((ws, i) => {
			const me = clients[i];
			ws.send(
				JSON.stringify({
					title,
					previousTitle,
					followUps,
					phase,
					online,
					now: Date.now(),
					timerEnd,
					mood: {
						mine: moods.find((m) => m.person === me)?.value ?? null,
						rated: moods.length,
						people,
						// Totals only, never who picked what; hidden until reveal so early ratings don't sway later ones.
						counts: phase === "writing" ? null : counts,
						average: phase === "writing" ? null : this.moodAverage(),
						previous: previousMood ? Number(previousMood) : null,
					},
					cards: cards.map(({ author, ...c }) => {
						const mine = author === me;
						// Hidden text never leaves the server, so devtools can't peek.
						const hidden = phase === "writing" && c.col !== "action" && !mine;
						const cardReactions = reactionsFor(c.id, me);
						return {
							...c,
							text: hidden ? null : c.text,
							mine,
							reactions: cardReactions,
							total: cardReactions.reduce((n, r) => n + r.count, 0),
							comments: hidden ? [] : comments.filter((m) => m.card === c.id).map(({ card, author, ...m }) => ({ ...m, mine: author === me })),
						};
					}),
				}),
			);
		});
	}
}
