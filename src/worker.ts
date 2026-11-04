import { DurableObject } from "cloudflare:workers";

const COLS = ["well", "improve", "action"];
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O, 1/I/L
const MAX_TEXT = 500;
const TIMER_SECONDS = [180, 300, 600];
const REACTIONS = ["👍", "👎", "❤️", "😂", "🎉", "🚀", "🔥", "🤔"];
const MAX_COMMENT = 300;
const DOODLE_COLORS = ["#2a2723", "#e24b4a", "#ef9f27", "#1d9e75", "#378add", "#7f77dd", "#d4537e", "#854f0b", "#0f8b8d"];
// Pen strokes leave `b` out, so drawings from before brushes existed still read as pens.
const DOODLE_BRUSHES = ["marker", "spray", "rainbow", "stamp", "text"];
const MAX_DOODLE_TEXT = 60;
// The next-MC picker: one of these shows plays out on every screen. Keep in step with SHOWS in src/shows.ts.
const SHOWS = ["wheel", "cars", "horses", "balloons", "slots", "plinko", "claw", "ducks", "potato", "lottery"];
const MAX_ROSTER = 30;
const MAX_STROKES = 2000;
// Per board, so one script can't flood it.
const MAX_CARDS = 400;
const MAX_COMMENTS = 1500;
const MAX_PASSES = 300;
const MAX_HOST_KEYS = 20; // one per host device; the oldest is dropped past this
// Per connection: at most this many messages in RATE_WINDOW ms; the rest are dropped.
const RATE_LIMIT = 60;
const RATE_WINDOW = 10_000;
// Joining: a 6-digit PIN from the host's screen that changes every minute (the previous one still works),
// and at most PIN_TRIES wrong guesses per board per minute.
const PIN_STEP = 60_000;
const PIN_TRIES = 10;
// The create password: at most this many wrong tries per address per GATE_WINDOW.
const GATE_TRIES = 10;
const GATE_WINDOW = 15 * 60_000;
const MAX_POINTS = 500;

type Phase = "writing" | "revealed" | "locked";
// `source` is the id of the card or follow-up it came from on the previous board, so re-pulling never duplicates.
type FollowUp = { source: string; text: string; carried: number };
type Member = { name: string; had_turn: number };
// `team` carries the MC picker: the roster with who has had a turn, the MC picked here and the last show played.
type Team = { roster: Member[]; mc: string | null; show: string | null };
type CarryOver = { title: string; mood: number | null; items: FollowUp[]; team?: Team };
type Stroke = { c: string; w: number; p: [number, number][]; b?: string; t?: string };
type Msg = { type: string; stroke?: Stroke; id?: string; onto?: string; col?: string; text?: string; name?: string; status?: string; value?: number; seconds?: number; emoji?: string; locked?: boolean };

const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store" } });

// Random keys (host keys, member passes, the PIN secret) and how they're stored: only a hash is kept.
const randomKey = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/\+/g, "-").replace(/\//g, "_");
async function sha256(s: string) {
	const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
	return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
// The join PIN for a one-minute step: HMAC of the step with the board's secret, as 6 digits (like an authenticator app).
async function pinAt(secret: string, step: number) {
	const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
	const mac = new DataView(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(String(step))));
	return String(mac.getUint32(0) % 1_000_000).padStart(6, "0");
}

function newCode() {
	// Rejection sampling, so every character is equally likely.
	let code = "";
	while (code.length < 8) {
		const b = crypto.getRandomValues(new Uint8Array(1))[0];
		if (b < 248) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
	}
	return code;
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

// ponytail: schema created lazily on the two rare D1 paths (create, list); move to migrations if it keeps growing.
// `mood` is the board's average once revealed (for the trend on Past boards).
async function ensureIndex(env: Env) {
	await env.DB.exec("CREATE TABLE IF NOT EXISTS boards (code TEXT PRIMARY KEY, title TEXT NOT NULL, created_at INTEGER NOT NULL)");
	const { results } = await env.DB.prepare("PRAGMA table_info(boards)").all<{ name: string }>();
	const cols = results.map((c) => c.name);
	if (!cols.includes("mood")) await env.DB.exec("ALTER TABLE boards ADD COLUMN mood REAL");
}

// The binding names this Worker by string, so cf can't infer the class; tell TS which one it is.
const boardStub = (env: Env, code: string) => env.BOARD.getByName(code) as DurableObjectStub<Board>;

// Only boards in the index reach a Durable Object, so guessing codes never creates storage.
async function exists(env: Env, code: string) {
	try {
		return !!(await env.DB.prepare("SELECT 1 FROM boards WHERE code = ?").bind(code).first());
	} catch {
		return false; // no index yet: no boards
	}
}

// Wrong create-password tries are counted per address in one small Durable Object ("gate").
const gate = (env: Env) => boardStub(env, "gate");
const ipOf = (req: Request) => req.headers.get("CF-Connecting-IP") ?? "unknown";
async function passwordOk(req: Request, env: Env, given: unknown) {
	const ip = ipOf(req);
	if (await gate(env).gateBlocked(ip)) return "blocked";
	if (await checkPassword(given, env)) return "ok";
	await gate(env).gateFail(ip);
	return "wrong";
}
const denied = (result: string) =>
	result === "blocked" ? json({ error: "Too many wrong tries. Wait 15 minutes." }, 429) : json({ error: "Wrong password" }, 403);

export default {
	async fetch(req, env) {
		const url = new URL(req.url);
		const path = url.pathname;

		if (req.method === "POST" && path === "/api/boards") {
			const body = await req.json<{ password?: string; title?: string; previous?: string; hidden?: boolean }>().catch(() => ({}) as never);
			const ok = await passwordOk(req, env, body.password);
			if (ok !== "ok") return denied(ok);
			const title = String(body.title ?? "").trim().slice(0, 100);
			const asked = body.previous ? normalizeCode(String(body.previous)) : null;
			const previous = asked && (await exists(env, asked)) ? asked : null;
			const carried = previous ? await boardStub(env, previous).carryOver() : null;
			const code = newCode();
			await ensureIndex(env);
			await env.DB.prepare("INSERT INTO boards (code, title, created_at) VALUES (?, ?, ?)")
				.bind(code, title, Date.now())
				.run();
			// The creator is the host: a host key for host-only controls, and a pass to join their own board.
			const keys = await boardStub(env, code).init(title, carried, previous, code, body.hidden === true);
			return json({ code, ...keys });
		}

		if (req.method === "POST" && path === "/api/boards/list") {
			const body = await req.json<{ password?: string }>().catch(() => ({}) as never);
			const ok = await passwordOk(req, env, body.password);
			if (ok !== "ok") return denied(ok);
			await ensureIndex(env);
			const { results } = await env.DB.prepare("SELECT code, title, created_at, mood FROM boards ORDER BY created_at DESC").all();
			return json(results);
		}

		const m = path.match(/^\/api\/boards\/([^/]+)\/(ws|join|host)$/);
		const code = m && normalizeCode(m[1]);
		if (!m || !code || !(await exists(env, code))) return json({ error: "Not found" }, 404);
		const board = boardStub(env, code);

		if (m[2] === "ws") return board.fetch(req);
		if (req.method !== "POST") return json({ error: "Not found" }, 404);

		// Join with the PIN from the host's screen; you get a pass for this board.
		if (m[2] === "join") {
			const body = await req.json<{ pin?: string; legacy?: string }>().catch(() => ({}) as never);
			const result = await board.join(String(body.pin ?? ""), String(body.legacy ?? ""));
			if ("pass" in result) return json(result);
			if (result.error === "wait") return json({ error: "Too many wrong PINs. Wait a minute and try the new one." }, 429);
			if (result.error === "full") return json({ error: "This board is full." }, 403);
			return json({ error: "Wrong PIN. Check the host's screen; it changes every minute." }, 403);
		}

		// Become a host: with a host link from another host device, or with the create password (a lost host key,
		// or a board made before hosts existed).
		const body = await req.json<{ password?: string; hostKey?: string }>().catch(() => ({}) as never);
		if (body.hostKey) {
			const keys = await board.redeemHostKey(String(body.hostKey));
			return keys ? json(keys) : json({ error: "This host link doesn't work any more." }, 403);
		}
		const ok = await passwordOk(req, env, body.password);
		if (ok !== "ok") return denied(ok);
		return json(await board.becomeHost());
	},
} satisfies ExportedHandler<Env>;

// A short, stable, non-reversible tag for a browser id (used where names may be hidden).
const tag = (client: string) => [...client].reduce((h, ch) => (h * 33 + ch.charCodeAt(0)) >>> 0, 5381).toString(36);

// Accepts only our colors, brushes and sizes (2-24), points as 0..1 fractions rounded to 3 decimals, at most
// MAX_POINTS. Stamps (an emoji from the reactions) and text are a single point.
function cleanStroke(raw: unknown): Stroke | null {
	const s = raw as Stroke;
	if (!s || !DOODLE_COLORS.includes(s.c) || !Number.isInteger(s.w) || s.w < 2 || s.w > 24 || !Array.isArray(s.p)) return null;
	if (s.b !== undefined && !DOODLE_BRUSHES.includes(s.b)) return null;
	if (s.p.length < 1 || s.p.length > MAX_POINTS) return null;
	const p: [number, number][] = [];
	for (const pt of s.p) {
		if (!Array.isArray(pt) || pt.length !== 2) return null;
		const [x, y] = pt.map(Number);
		if (!(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return null;
		p.push([Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]);
	}
	const out: Stroke = { c: s.c, w: s.w, p };
	if (s.b) out.b = s.b;
	if (s.b === "stamp" || s.b === "text") {
		const t = typeof s.t === "string" ? s.t.trim().slice(0, MAX_DOODLE_TEXT) : "";
		if (p.length !== 1 || !t || (s.b === "stamp" && !REACTIONS.includes(t))) return null;
		out.t = t;
	}
	return out;
}

export class Board extends DurableObject<Env> {
	sql = this.ctx.storage.sql;
	// ponytail: in-memory spam limit for emoji rain, resets if the object hibernates, which is fine for a toy
	recentBursts = new Map<string, number[]>();
	lastTyping = new Map<string, number>();
	lastPick = 0;

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
			CREATE TABLE IF NOT EXISTS roster (name TEXT PRIMARY KEY COLLATE NOCASE, had_turn INTEGER NOT NULL DEFAULT 0);
			CREATE TABLE IF NOT EXISTS passes (hash TEXT PRIMARY KEY, client TEXT NOT NULL, created_at INTEGER NOT NULL);
			CREATE TABLE IF NOT EXISTS hosts (hash TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
		`);
		// Boards created before follow-ups tracked their source get the column added in place.
		const cols = this.sql.exec<{ name: string }>("PRAGMA table_info(followups)").toArray().map((c) => c.name);
		if (!cols.includes("source")) this.sql.exec("ALTER TABLE followups ADD COLUMN source TEXT");
		this.sql.exec("CREATE UNIQUE INDEX IF NOT EXISTS followups_source ON followups (source)");
		// Grouping: a stacked card points at the card it sits under (one level deep, same column).
		const cardCols = this.sql.exec<{ name: string }>("PRAGMA table_info(cards)").toArray().map((c) => c.name);
		if (!cardCols.includes("parent")) this.sql.exec("ALTER TABLE cards ADD COLUMN parent TEXT");
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

	// Live boards (the default) start open: cards are visible as they're written, reactions and mood results
	// right away. Hidden boards start in "writing" and flip everything over at Reveal.
	async init(title: string, previous: CarryOver | null, previousCode: string | null, code: string, hidden: boolean) {
		this.setMeta("title", title);
		this.setMeta("secret", randomKey());
		this.setMeta("phase", hidden ? "writing" : "revealed");
		if (!hidden) this.setMeta("live", "1");
		this.setMeta("code", code);
		if (previous && previousCode) {
			this.setMeta("previous_code", previousCode);
			this.setMeta("previous_title", previous.title);
			if (previous.mood !== null) this.setMeta("previous_mood", String(previous.mood));
			this.mergeFollowUps(previous.items);
			if (previous.team) this.takeTeam(previous.team);
		}
		return this.becomeHost();
	}

	// A host key for one more device (only its hash is kept; other hosts keep theirs) and a pass for it.
	async becomeHost() {
		const hostKey = randomKey();
		this.sql.exec("INSERT INTO hosts (hash, created_at) VALUES (?, ?)", await sha256(hostKey), Date.now());
		this.sql.exec("DELETE FROM hosts WHERE hash NOT IN (SELECT hash FROM hosts ORDER BY created_at DESC LIMIT ?)", MAX_HOST_KEYS);
		return { hostKey, pass: await this.issuePass(crypto.randomUUID()) };
	}

	async isHost(hostKey: string) {
		return !!hostKey && this.sql.exec("SELECT 1 FROM hosts WHERE hash = ?", await sha256(hostKey)).toArray().length > 0;
	}

	// A host link opened on another device: that device becomes a host too, with its own key.
	async redeemHostKey(hostKey: string) {
		return (await this.isHost(hostKey)) ? this.becomeHost() : null;
	}

	async issuePass(client: string) {
		const pass = randomKey();
		this.sql.exec("INSERT INTO passes (hash, client, created_at) VALUES (?, ?, ?)", await sha256(pass), client, Date.now());
		return pass;
	}

	// Boards from before join PINs get their secret the first time it's needed.
	secret() {
		let secret = this.meta("secret");
		if (!secret) this.setMeta("secret", (secret = randomKey()));
		return secret;
	}

	async currentPin() {
		const step = Math.floor(Date.now() / PIN_STEP);
		return { value: await pinAt(this.secret(), step), until: (step + 1) * PIN_STEP };
	}

	// Joining with the PIN. `legacy` is the browser id someone used before passes existed: they keep their
	// own cards if that id has been here and has no pass yet.
	async join(pin: string, legacy: string): Promise<{ pass: string } | { error: "pin" | "wait" | "full" }> {
		const minute = String(Math.floor(Date.now() / 60_000));
		if (this.meta("pin_minute") !== minute) {
			this.setMeta("pin_minute", minute);
			this.setMeta("pin_fails", "0");
		}
		if (Number(this.meta("pin_fails")) >= PIN_TRIES) return { error: "wait" };
		const step = Math.floor(Date.now() / PIN_STEP);
		const ok = /^\d{6}$/.test(pin) && (pin === (await pinAt(this.secret(), step)) || pin === (await pinAt(this.secret(), step - 1)));
		if (!ok) {
			this.setMeta("pin_fails", String(Number(this.meta("pin_fails")) + 1));
			return { error: "pin" };
		}
		if (this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM passes").one().n >= MAX_PASSES) return { error: "full" };
		const known =
			/^[\w-]{8,64}$/.test(legacy) &&
			this.sql.exec("SELECT 1 FROM people WHERE id = ?", legacy).toArray().length > 0 &&
			this.sql.exec("SELECT 1 FROM passes WHERE client = ?", legacy).toArray().length === 0;
		return { pass: await this.issuePass(known ? legacy : crypto.randomUUID()) };
	}

	// The gate: wrong create-password tries per address (only used by the Durable Object named "gate").
	gateBlocked(ip: string) {
		this.sql.exec("CREATE TABLE IF NOT EXISTS gate (ip TEXT PRIMARY KEY, fails INTEGER NOT NULL, since INTEGER NOT NULL)");
		const row = this.sql.exec<{ fails: number; since: number }>("SELECT fails, since FROM gate WHERE ip = ?", ip).toArray()[0];
		return !!row && Date.now() - row.since < GATE_WINDOW && row.fails >= GATE_TRIES;
	}
	gateFail(ip: string) {
		this.sql.exec("CREATE TABLE IF NOT EXISTS gate (ip TEXT PRIMARY KEY, fails INTEGER NOT NULL, since INTEGER NOT NULL)");
		const now = Date.now();
		this.sql.exec(
			`INSERT INTO gate (ip, fails, since) VALUES (?, 1, ?)
			ON CONFLICT(ip) DO UPDATE SET fails = CASE WHEN ? - since < ? THEN fails + 1 ELSE 1 END,
				since = CASE WHEN ? - since < ? THEN since ELSE ? END`,
			ip, now, now, GATE_WINDOW, now, GATE_WINDOW, now,
		);
		this.sql.exec("DELETE FROM gate WHERE ? - since > ?", now, GATE_WINDOW);
	}

	// The roster and rotation continue from the previous board, and its pick is this retro's MC. Until someone
	// here edits the roster or picks, a later pick or roster change on the previous board still flows in.
	takeTeam(team: Team) {
		if (team.mc) this.setMeta("host", team.mc);
		if (this.meta("team_touched")) return;
		this.sql.exec("DELETE FROM roster");
		for (const m of team.roster) this.sql.exec("INSERT OR IGNORE INTO roster (name, had_turn) VALUES (?, ?)", m.name, m.had_turn);
		if (team.show) this.setMeta("last_show", team.show);
	}

	team(): Team {
		return {
			roster: this.sql.exec<Member>("SELECT name, had_turn FROM roster ORDER BY rowid").toArray(),
			mc: this.meta("mc") ?? null,
			show: this.meta("last_show") ?? null,
		};
	}

	// Picks the next MC from those who haven't had a turn (everyone again once all have), and a show that isn't
	// the one played last time. Picking again here puts the earlier pick back in the rotation.
	pickMc() {
		const earlier = this.meta("mc");
		if (earlier) this.sql.exec("UPDATE roster SET had_turn = 0 WHERE name = ?", earlier);
		let pool = this.sql.exec<{ name: string }>("SELECT name FROM roster WHERE had_turn = 0 ORDER BY rowid").toArray();
		if (!pool.length) {
			this.sql.exec("UPDATE roster SET had_turn = 0");
			pool = this.sql.exec<{ name: string }>("SELECT name FROM roster ORDER BY rowid").toArray();
		}
		const rand = (n: number) => crypto.getRandomValues(new Uint32Array(1))[0] % n;
		const winner = pool[rand(pool.length)].name;
		const shows = SHOWS.filter((x) => x !== this.meta("last_show"));
		const show = shows[rand(shows.length)];
		this.sql.exec("UPDATE roster SET had_turn = 1 WHERE name = ?", winner);
		this.setMeta("mc", winner);
		this.setMeta("last_show", show);
		this.setMeta("team_touched", "1");
		const names = this.sql.exec<{ name: string }>("SELECT name FROM roster ORDER BY rowid").toArray().map((r) => r.name);
		return { show, winner, names, seed: rand(2 ** 31) };
	}

	// Adds items we don't have yet; for ones still open, picks up text edits. Never removes anything,
	// and never touches items already marked done or dropped here.
	mergeFollowUps(items: FollowUp[]) {
		for (const f of items) {
			this.sql.exec(
				`INSERT INTO followups (id, source, text, carried) VALUES (?, ?, ?, ?)
				ON CONFLICT(source) DO UPDATE SET text = excluded.text WHERE status = 'open'`,
				crypto.randomUUID(),
				f.source,
				f.text,
				f.carried,
			);
		}
	}

	// Action items added to the previous board after this one was created still arrive: re-pull whenever someone joins.
	async pullFromPrevious() {
		const previousCode = this.meta("previous_code");
		if (!previousCode || this.phase === "locked") return;
		try {
			const carried = await boardStub(this.env, previousCode).carryOver();
			if (carried) this.mergeFollowUps(carried.items);
			if (carried?.team) this.takeTeam(carried.team);
		} catch (err) {
			// Joining must never fail because the previous board didn't answer; the next join tries again.
			console.error("pull from previous board failed", previousCode, err);
		}
	}

	// Keeps the board list's mood in step once results are public (never during writing, so it can't leak early).
	async saveMood() {
		const code = this.meta("code");
		if (!code || this.phase === "writing") return;
		try {
			await this.env.DB.prepare("UPDATE boards SET mood = ? WHERE code = ?").bind(this.moodAverage(), code).run();
		} catch (err) {
			console.error("saving mood to the board list failed", code, err);
		}
	}

	moodAverage() {
		const avg = this.sql.exec<{ avg: number | null }>("SELECT AVG(value) AS avg FROM moods").one().avg;
		return avg === null ? null : Math.round(avg * 10) / 10;
	}

	// What the next sprint's board inherits: follow-ups still open (not done or dropped), this board's action items, and its mood.
	carryOver(): CarryOver | null {
		if (!this.phase) return null;
		const items = this.sql
			.exec<FollowUp>(
				`SELECT source, text, carried FROM (
					SELECT id AS source, text, carried + 1 AS carried, 0 AS grp, rowid AS ord FROM followups WHERE status = 'open'
					UNION ALL SELECT id, text, 1, 1, created_at FROM cards WHERE col = 'action'
				) ORDER BY grp, ord`,
			)
			.toArray();
		return { title: this.meta("title") ?? "", mood: this.moodAverage(), items, team: this.team() };
	}

	// Locking reveals too, so a locked board never keeps hidden cards. Unlock returns to revealed.
	setLocked(locked: boolean) {
		if (!this.phase) return false;
		this.setMeta("phase", locked ? "locked" : "revealed");
		this.broadcast();
		this.saveMood();
		return true;
	}

	async fetch(req: Request) {
		if (!this.phase) return new Response("Board not found", { status: 404 });
		if (req.headers.get("Upgrade") !== "websocket") return new Response("Expected WebSocket", { status: 426 });

		// The pass (and the host key, for the host) ride in the WebSocket subprotocols, so they never sit in a URL.
		const offered = (req.headers.get("Sec-WebSocket-Protocol") ?? "").split(",").map((p) => p.trim());
		const key = (prefix: string) => offered.find((p) => p.startsWith(prefix))?.slice(prefix.length) ?? "";
		const pass = key("pass.");
		const hostKey = key("host.");
		const client = pass
			? this.sql.exec<{ client: string }>("SELECT client FROM passes WHERE hash = ?", await sha256(pass)).toArray()[0]?.client
			: undefined;
		const host = !!client && (await this.isHost(hostKey));

		const { 0: browser, 1: server } = new WebSocketPair();
		this.ctx.acceptWebSocket(server);
		const headers = { "Sec-WebSocket-Protocol": "retroo" };
		// No valid pass (never joined, or the host reset access): say so and close, so the page asks for the PIN.
		if (!client) {
			// It can't be closed before the handshake completes: the page closes it on `denied`, and it gets nothing
			// meanwhile (no attachment); anything it sends closes it.
			server.send(JSON.stringify({ denied: true }));
			return new Response(null, { status: 101, webSocket: browser, headers });
		}
		this.setName(client, new URL(req.url).searchParams.get("name"));
		await this.pullFromPrevious();
		server.serializeAttachment({ client, host });
		this.broadcast();
		return new Response(null, { status: 101, webSocket: browser, headers });
	}

	setName(client: string, raw: unknown) {
		const name = String(raw ?? "").trim().slice(0, 40) || "Anonymous";
		this.sql.exec("INSERT INTO people (id, name) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name", client, name);
	}

	// Message counts per person in the current window, for the rate limit. ponytail: in memory, resets when the
	// object hibernates, which only ever makes it more lenient.
	rate = new Map<string, { start: number; n: number }>();
	limited(client: string) {
		const now = Date.now();
		const r = this.rate.get(client);
		if (!r || now - r.start > RATE_WINDOW) {
			this.rate.set(client, { start: now, n: 1 });
			return false;
		}
		return ++r.n > RATE_LIMIT;
	}

	async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
		const att = ws.deserializeAttachment() as { client: string; host?: boolean } | null;
		if (!att) return ws.close(4001, "Join with the PIN");
		if (this.limited(att.client)) return;
		const { client, host } = att;
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
				if (this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM cards").one().n >= MAX_CARDS) return;
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
			case "stack": {
				// Drop a card (and anything stacked under it) onto another card's stack, in the same feedback column.
				const find = (id: unknown) =>
					this.sql.exec<{ id: string; col: string; parent: string | null }>("SELECT id, col, parent FROM cards WHERE id = ?", String(id)).toArray()[0];
				const card = find(msg.id);
				const target = find(msg.onto);
				if (phase !== "revealed" || !card || !target || card.col !== target.col || card.col === "action") return;
				const root = target.parent ?? target.id;
				if (root === card.id || card.parent === root) return;
				this.sql.exec("UPDATE cards SET parent = ? WHERE id = ? OR parent = ?", root, card.id, card.id);
				break;
			}
			case "unstack":
				if (phase !== "revealed") return;
				this.sql.exec("UPDATE cards SET parent = NULL WHERE id = ?", String(msg.id));
				break;
			case "comment": {
				// Comments need a card you can see: any card once revealed, action items (never hidden) any time.
				const col = cardCol(msg.id);
				const body = typeof msg.text === "string" ? msg.text.trim().slice(0, MAX_COMMENT) : "";
				if (phase === "locked" || !col || !body || (phase === "writing" && col !== "action")) return;
				if (this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM comments").one().n >= MAX_COMMENTS) return;
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
				this.saveMood();
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
				// `from` is an opaque per-person tag so combos can count different people even when names are hidden.
				const name = this.sql.exec<{ name: string }>("SELECT name FROM people WHERE id = ?", client).toArray()[0]?.name ?? "";
				this.toEach(() => ({ burst: msg.emoji, name, from: tag(client) }));
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
			// Next-MC picker. The roster is the team's real names, typed in (board names can be anything).
			case "roster_add": {
				const name = text.slice(0, 40);
				const count = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM roster").one().n;
				if (phase === "locked" || !name || count >= MAX_ROSTER) return;
				this.sql.exec("INSERT OR IGNORE INTO roster (name) VALUES (?)", name);
				this.setMeta("team_touched", "1");
				break;
			}
			case "roster_remove":
				if (phase === "locked") return;
				this.sql.exec("DELETE FROM roster WHERE name = ?", String(msg.name ?? ""));
				if (this.meta("mc") === msg.name) this.sql.exec("DELETE FROM meta WHERE key = 'mc'");
				this.setMeta("team_touched", "1");
				break;
			case "pick": {
				// Everyone watches the same show land on the same name; one pick at a time, while it plays.
				const now = Date.now();
				const count = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM roster").one().n;
				if (phase === "locked" || count < 2 || now - this.lastPick < 8000) return;
				this.lastPick = now;
				const pick = this.pickMc();
				this.toEach(() => ({ pick }));
				break;
			}
			case "typing": {
				// "Someone is writing": relayed to everyone else, never stored, at most once per 2 seconds each.
				const now = Date.now();
				// Only while cards are hidden: once cards appear as they're written, "Dina just stopped typing"
				// would give away which card is hers.
				if (phase !== "writing" || now - (this.lastTyping.get(client) ?? 0) < 2000) return;
				this.lastTyping.set(client, now);
				const name = this.sql.exec<{ name: string }>("SELECT name FROM people WHERE id = ?", client).toArray()[0]?.name ?? "";
				this.toEach((c) => (c === client ? null : { typing: name }));
				return;
			}
			// Host only: the current join PIN (just to the host), lock and unlock, and resetting access.
			case "pin":
				if (host) ws.send(JSON.stringify({ pin: await this.currentPin() }));
				return;
			case "lock":
				if (host) this.setLocked(!!msg.locked);
				return;
			case "reset": {
				// Everyone else's pass stops working; they're disconnected and rejoin with the new PIN.
				if (!host) return;
				this.sql.exec("DELETE FROM passes WHERE client != ?", client);
				this.setMeta("secret", randomKey());
				for (const s of this.ctx.getWebSockets()) {
					if ((s.deserializeAttachment() as { client: string } | null)?.client !== client) s.close(4001, "Access was reset");
				}
				ws.send(JSON.stringify({ pin: await this.currentPin() }));
				break;
			}
			case "reveal":
				if (phase !== "writing") return;
				this.setMeta("phase", "revealed");
				this.saveMood();
				break;
			default:
				return;
		}
		this.broadcast();
	}

	// Sends a per-person message to every joined socket (no full board state); null skips that person.
	toEach(build: (client: string) => unknown) {
		for (const s of this.ctx.getWebSockets()) {
			const att = s.deserializeAttachment() as { client: string } | null;
			if (s.readyState !== WebSocket.OPEN || !att) continue;
			const msg = build(att.client);
			if (msg !== null) s.send(JSON.stringify(msg));
		}
	}

	webSocketClose(ws: WebSocket) {
		const att = ws.deserializeAttachment() as { client: string } | null;
		if (att) this.rate.delete(att.client);
		this.broadcast();
	}

	// ponytail: sends the whole board on every change, send diffs if boards grow past a few hundred cards
	broadcast() {
		// Sockets turned away for having no pass carry no attachment; they get nothing.
		const sockets = this.ctx.getWebSockets().filter((ws) => ws.readyState === WebSocket.OPEN && ws.deserializeAttachment());
		const clients = sockets.map((ws) => (ws.deserializeAttachment() as { client: string }).client);
		const names = (ids: string[]) =>
			ids.length
				? this.sql.exec<{ name: string }>(`SELECT name FROM people WHERE id IN (${ids.map(() => "?").join(",")}) ORDER BY name`, ...ids).toArray().map((r) => r.name)
				: [];
		const phase = this.phase;
		const title = this.meta("title") ?? "";
		const live = this.meta("live") === "1";
		const previousTitle = this.meta("previous_title") ?? "";
		const followUps = this.sql.exec("SELECT id, text, carried, status FROM followups ORDER BY rowid").toArray();
		const online = names([...new Set(clients)]);
		const timerEnd = Number(this.meta("timer_end")) || null;
		const moods = this.sql.exec<{ person: string; value: number }>("SELECT person, value FROM moods").toArray();
		const people = this.sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM people").one().n;
		const counts = [1, 2, 3, 4, 5].map((v) => moods.filter((m) => m.value === v).length);
		const previousMood = this.meta("previous_mood");
		const cards = this.sql
			.exec<{ id: string; col: string; text: string; author: string; name: string; parent: string | null }>(
				`SELECT c.id, c.col, c.text, c.author, c.parent, COALESCE(p.name, 'Anonymous') AS name
				FROM cards c LEFT JOIN people p ON p.id = c.author ORDER BY c.created_at`,
			)
			.toArray();
		const reactions = this.sql.exec<{ card: string; person: string; emoji: string }>("SELECT card, person, emoji FROM reactions").toArray();
		const team = this.team();
		const comments = this.sql
			.exec<{ id: string; card: string; author: string; name: string; text: string }>(
				`SELECT m.id, m.card, m.author, COALESCE(p.name, 'Anonymous') AS name, m.text
				FROM comments m LEFT JOIN people p ON p.id = m.author ORDER BY m.created_at`,
			)
			.toArray();
		// Counts per emoji in the fixed order, only the ones someone used.
		const nameById = new Map(this.sql.exec<{ id: string; name: string }>("SELECT id, name FROM people").toArray().map((p) => [p.id, p.name]));
		const nameOf = (id: string) => nameById.get(id) ?? "Anonymous";
		const reactionsFor = (card: string, me: string) =>
			REACTIONS.map((emoji) => {
				const rows = reactions.filter((r) => r.card === card && r.emoji === emoji);
				return { emoji, count: rows.length, mine: rows.some((r) => r.person === me), names: rows.map((r) => nameOf(r.person)) };
			}).filter((r) => r.count > 0);

		sockets.forEach((ws, i) => {
			const me = clients[i];
			ws.send(
				JSON.stringify({
					host: !!(ws.deserializeAttachment() as { host?: boolean }).host,
					title,
					previousTitle,
					followUps,
					phase,
					live,
					online,
					now: Date.now(),
					timerEnd,
					team: { roster: team.roster.map((m) => ({ name: m.name, done: m.had_turn === 1 })), mc: team.mc, host: this.meta("host") ?? null },
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
							// Cards are always anonymous: author names never leave the server, "mine" marks your own.
							name: "",
							text: hidden ? null : c.text,
							mine,
							reactions: cardReactions,
							total: cardReactions.reduce((n, r) => n + r.count, 0),
							comments: hidden
								? []
								: comments.filter((m) => m.card === c.id).map(({ card, author, ...m }) => ({ ...m, mine: author === me })),
						};
					}),
				}),
			);
		});
	}
}
