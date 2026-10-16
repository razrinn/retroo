import { DurableObject } from "cloudflare:workers";

const COLS = ["well", "improve", "action"];
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O, 1/I/L
const MAX_TEXT = 500;

type Phase = "writing" | "revealed" | "locked";
type FollowUp = { text: string; carried: number };
type Msg = { type: string; id?: string; col?: string; text?: string; name?: string; status?: string };

const json = (data: unknown, status = 200) => Response.json(data, { status });

function newCode() {
	const bytes = crypto.getRandomValues(new Uint8Array(8));
	const chars = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
	return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

// "k7qm4xpt", "K7QM 4XPT" and "K7QM-4XPT" all mean the same board.
function normalizeCode(raw: string) {
	const c = raw.toUpperCase().replace(/[^0-9A-Z]/g, "");
	return c.length === 8 ? `${c.slice(0, 4)}-${c.slice(4)}` : null;
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
			const carried = previous ? await boardStub(env, previous).openFollowUps() : { title: "", items: [] };
			const code = newCode();
			await ensureIndex(env);
			await env.DB.prepare("INSERT INTO boards (code, title, created_at) VALUES (?, ?, ?)")
				.bind(code, title, Date.now())
				.run();
			await boardStub(env, code).init(title, carried.title, carried.items);
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

export class Board extends DurableObject<Env> {
	sql = this.ctx.storage.sql;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.sql.exec(`
			CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
			CREATE TABLE IF NOT EXISTS people (id TEXT PRIMARY KEY, name TEXT NOT NULL);
			CREATE TABLE IF NOT EXISTS cards (id TEXT PRIMARY KEY, col TEXT NOT NULL, text TEXT NOT NULL, author TEXT NOT NULL, created_at INTEGER NOT NULL);
			CREATE TABLE IF NOT EXISTS votes (card TEXT NOT NULL, voter TEXT NOT NULL, PRIMARY KEY (card, voter));
			CREATE TABLE IF NOT EXISTS followups (id TEXT PRIMARY KEY, text TEXT NOT NULL, carried INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'open');
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

	init(title: string, previousTitle: string, followUps: FollowUp[]) {
		this.setMeta("title", title);
		this.setMeta("previous_title", previousTitle);
		this.setMeta("phase", "writing");
		for (const f of followUps) this.sql.exec("INSERT INTO followups (id, text, carried) VALUES (?, ?, ?)", crypto.randomUUID(), f.text, f.carried);
	}

	// What the next sprint's board inherits: follow-ups still open (not done or dropped) plus this board's action items.
	openFollowUps() {
		if (!this.phase) return { title: "", items: [] };
		const items = this.sql
			.exec<FollowUp>(
				`SELECT text, carried FROM (
					SELECT text, carried + 1 AS carried, 0 AS grp, rowid AS ord FROM followups WHERE status = 'open'
					UNION ALL SELECT text, 1, 1, created_at FROM cards WHERE col = 'action'
				) ORDER BY grp, ord`,
			)
			.toArray();
		return { title: this.meta("title") ?? "", items };
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
				this.sql.exec("DELETE FROM votes WHERE card = ?", msg.id);
				break;
			case "vote": {
				if (phase !== "revealed") return;
				const removed = this.sql.exec("DELETE FROM votes WHERE card = ? AND voter = ?", msg.id, client).rowsWritten;
				if (!removed) this.sql.exec("INSERT INTO votes (card, voter) SELECT id, ? FROM cards WHERE id = ?", client, msg.id);
				break;
			}
			case "followup":
				if (phase === "locked" || !["open", "done", "dropped"].includes(String(msg.status))) return;
				this.sql.exec("UPDATE followups SET status = ? WHERE id = ?", msg.status, msg.id);
				break;
			case "reveal":
				if (phase !== "writing") return;
				this.setMeta("phase", "revealed");
				break;
			default:
				return;
		}
		this.broadcast();
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
		const cards = this.sql
			.exec<{ id: string; col: string; text: string; author: string; name: string; votes: number }>(
				`SELECT c.id, c.col, c.text, c.author, COALESCE(p.name, 'Anonymous') AS name,
					(SELECT COUNT(*) FROM votes v WHERE v.card = c.id) AS votes
				FROM cards c LEFT JOIN people p ON p.id = c.author ORDER BY c.created_at`,
			)
			.toArray();
		const myVotes = new Map(clients.map((c) => [c, new Set(this.sql.exec<{ card: string }>("SELECT card FROM votes WHERE voter = ?", c).toArray().map((r) => r.card))]));

		sockets.forEach((ws, i) => {
			const me = clients[i];
			ws.send(
				JSON.stringify({
					title,
					previousTitle,
					followUps,
					phase,
					online,
					cards: cards.map(({ author, ...c }) => {
						const mine = author === me;
						// Hidden text never leaves the server, so devtools can't peek.
						const hidden = phase === "writing" && c.col !== "action" && !mine;
						return { ...c, text: hidden ? null : c.text, mine, voted: myVotes.get(me)!.has(c.id) };
					}),
				}),
			);
		});
	}
}
