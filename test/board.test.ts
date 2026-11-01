// Runs the real Worker + Durable Object in workerd through Vite. Needs .dev.vars (copy .dev.vars.example).
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer, type ViteDevServer } from "vite";

const PASSWORD = readFileSync(".dev.vars", "utf8").match(/^CREATE_PASSWORD=(.*)$/m)?.[1]?.trim();
assert.ok(PASSWORD, "CREATE_PASSWORD missing from .dev.vars");

process.env.RETROO_TEST = "1"; // in-memory storage, see vite.config.ts
let server: ViteDevServer;
let base = "";
before(async () => {
	server = await createServer({ logLevel: "silent", server: { port: 5199, strictPort: false } });
	await server.listen();
	base = server.resolvedUrls!.local[0].replace(/\/$/, "");
});
after(() => server.close());

const post = (path: string, body: object) =>
	fetch(base + path, { method: "POST", body: JSON.stringify(body) });

// Most tests exercise the hidden style (writing → reveal); pass { hidden: false } for a Live board.
async function create(previous = "", extra: object = {}) {
	const res = await post("/api/boards", { password: PASSWORD, title: "Test", previous, hidden: true, ...extra });
	assert.equal(res.status, 200);
	return ((await res.json()) as { code: string }).code;
}

type State = Record<string, any>;
async function join(code: string, client: string) {
	const ws = new WebSocket(`${base.replace("http", "ws")}/api/boards/${code}/ws?client=${client}&name=${client.split("-")[0]}`);
	let state: State = {};
	// Full board states carry a phase; everything else (emoji rain, doodle strokes) is an event.
	const events: State[] = [];
	let seen = 0;
	ws.onmessage = (e) => {
		const data = JSON.parse(e.data);
		if ("phase" in data) state = data;
		else events.push(data);
		seen++;
	};
	await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)));
	// Waits for the broadcast that follows a message (or a short idle, for messages the server ignores).
	const settle = async () => {
		const start = seen;
		for (let i = 0; i < 40 && seen === start; i++) await new Promise((r) => setTimeout(r, 25));
	};
	await settle();
	return {
		get s() {
			return state;
		},
		events,
		get bursts() {
			return events.filter((e) => e.burst);
		},
		async send(msg: object) {
			ws.send(JSON.stringify(msg));
			await settle();
		},
		close: () => ws.close(),
	};
}

test("create and list need the password", async () => {
	assert.equal((await post("/api/boards", { password: "nope" })).status, 403);
	assert.equal((await post("/api/boards/list", { password: "nope" })).status, 403);
	const code = await create();
	const list = (await (await post("/api/boards/list", { password: PASSWORD })).json()) as { code: string }[];
	assert.ok(list.some((b) => b.code === code));
});

test("hidden text, phases, reactions and ownership", async () => {
	const code = await create();
	const a = await join(code, "alice-0001");
	const b = await join(code, "bobby-0001");

	await a.send({ type: "add", col: "well", text: "secret" });
	await a.send({ type: "add", col: "action", text: "public action" });
	await b.send({ type: "name", name: "bobby" }); // round-trip so b has a's broadcasts too
	const [well, action] = b.s.cards;
	assert.equal(well.text, null, "other people's cards are hidden while writing");
	assert.equal(well.name, "", "and anonymous");
	assert.equal(action.text, "public action", "action items are never hidden");
	assert.ok(!JSON.stringify(b.s).includes("alice-0001"), "client ids never leak");

	await b.send({ type: "edit", id: well.id, text: "hacked" });
	await b.send({ type: "react", id: well.id, emoji: "👍" });
	await a.send({ type: "add", col: "well", text: "x".repeat(900) });
	assert.equal(a.s.cards[0].text, "secret");
	assert.equal(a.s.cards[0].total, 0, "no reactions while writing");
	assert.equal(a.s.cards[2].text.length, 500);

	await b.send({ type: "reveal" });
	assert.equal(b.s.phase, "revealed");
	assert.equal(b.s.cards[0].text, "secret");

	await b.send({ type: "react", id: well.id, emoji: "🔥" });
	await b.send({ type: "react", id: well.id, emoji: "👍" }); // replaces 🔥
	await b.send({ type: "react", id: well.id, emoji: "🍕" }); // not in the set
	await a.send({ type: "react", id: well.id, emoji: "❤️" });
	assert.deepEqual(b.s.cards[0].reactions, [
		{ emoji: "👍", count: 1, mine: true, names: ["bobby"] },
		{ emoji: "❤️", count: 1, mine: false, names: ["alice"] },
	]);
	assert.equal(b.s.cards[0].total, 2, "one reaction per person per card");
	await a.send({ type: "react", id: well.id, emoji: "❤️" }); // same emoji again removes it
	assert.equal(a.s.cards[0].total, 1);

	await a.send({ type: "delete", id: well.id });
	assert.equal(a.s.cards.length, 3, "no deleting after reveal");

	assert.equal((await post(`/api/boards/${code}/lock`, { password: "nope", locked: true })).status, 403);
	assert.equal((await post(`/api/boards/${code}/lock`, { password: PASSWORD, locked: true })).status, 200);
	await a.send({ type: "add", col: "well", text: "late" });
	await a.send({ type: "mood", value: 3 });
	assert.equal(a.s.phase, "locked");
	assert.equal(a.s.cards.length, 3, "locked boards are read-only");
	assert.equal(a.s.mood.rated, 0);

	a.close();
	b.close();
});

test("comments: action items any time, other cards after reveal, delete only your own", async () => {
	const code = await create();
	const a = await join(code, "alice-0006");
	const b = await join(code, "bobby-0006");
	await a.send({ type: "add", col: "well", text: "nice" });
	await a.send({ type: "add", col: "action", text: "do it" });
	const [well, action] = a.s.cards;

	await b.send({ type: "comment", id: well.id, text: "peek" });
	await b.send({ type: "comment", id: action.id, text: "on it" });
	assert.equal(a.s.cards[0].comments.length, 0, "no comments on hidden-phase cards");
	assert.deepEqual(a.s.cards[1].comments.map((m: any) => [m.name, m.text, m.mine]), [["bobby", "on it", false]]);

	await a.send({ type: "reveal" });
	await b.send({ type: "comment", id: well.id, text: "y".repeat(400) });
	const mine = b.s.cards[0].comments[0];
	assert.equal(mine.text.length, 300);
	await a.send({ type: "uncomment", id: mine.id });
	assert.equal(a.s.cards[0].comments.length, 1, "can't delete someone else's comment");
	await b.send({ type: "uncomment", id: mine.id });
	assert.equal(b.s.cards[0].comments.length, 0);
	assert.ok(!JSON.stringify(a.s).includes("bobby-0006"), "commenter ids never leak");
	a.close();
	b.close();
});

test("mood stays hidden until reveal and stays anonymous", async () => {
	const code = await create();
	const a = await join(code, "alice-0002");
	const b = await join(code, "bobby-0002");
	await a.send({ type: "mood", value: 2 });
	await b.send({ type: "mood", value: 9 }); // invalid, ignored
	await b.send({ type: "mood", value: 5 });
	assert.equal(b.s.mood.mine, 5);
	assert.equal(b.s.mood.rated, 2);
	assert.equal(b.s.mood.counts, null);
	assert.equal(b.s.mood.average, null);

	await a.send({ type: "reveal" });
	assert.deepEqual(a.s.mood.counts, [0, 1, 0, 0, 1]);
	assert.equal(a.s.mood.average, 3.5);
	assert.equal(a.s.mood.mine, 2);
	a.close();
	b.close();
});

test("timer stores one shared end time", async () => {
	const a = await join(await create(), "alice-0003");
	await a.send({ type: "timer", seconds: 300 });
	assert.ok(Math.abs(a.s.timerEnd - a.s.now - 300_000) < 2000);
	const end = a.s.timerEnd;
	await a.send({ type: "timer", seconds: 7 }); // not a preset, ignored
	assert.equal(a.s.timerEnd, end);
	await a.send({ type: "timer", seconds: 0 });
	assert.equal(a.s.timerEnd, null);
	a.close();
});

test("open action items and mood carry over to the next sprint", async () => {
	const s1 = await create();
	let c = await join(s1, "alice-0004");
	await c.send({ type: "add", col: "action", text: "keeps slipping" });
	await c.send({ type: "add", col: "action", text: "gets done" });
	await c.send({ type: "add", col: "action", text: "gets dropped" });
	await c.send({ type: "mood", value: 4 });
	c.close();

	const s2 = await create(s1.toLowerCase().replace("-", ""));
	c = await join(s2, "alice-0004");
	assert.equal(c.s.mood.previous, 4);
	const [slip, done, drop] = c.s.followUps;
	assert.deepEqual(c.s.followUps.map((f: any) => [f.text, f.carried, f.status]), [
		["keeps slipping", 1, "open"],
		["gets done", 1, "open"],
		["gets dropped", 1, "open"],
	]);
	await c.send({ type: "followup", id: done.id, status: "done" });
	await c.send({ type: "followup", id: drop.id, status: "dropped" });
	await c.send({ type: "followup", id: slip.id, status: "bogus" });
	c.close();

	const s3 = await create(s2);
	c = await join(s3, "alice-0004");
	assert.deepEqual(c.s.followUps.map((f: any) => [f.text, f.carried]), [["keeps slipping", 2]]);
	assert.equal(c.s.mood.previous, null, "no ratings on the previous board means no previous mood");
	c.close();

	const fresh = await join(await create(), "alice-0004");
	assert.deepEqual(fresh.s.followUps, []);
	fresh.close();
});

test("action items added to the old board after the new one exists still carry over", async () => {
	const a = await create();
	let c = await join(a, "alice-0009");
	await c.send({ type: "add", col: "action", text: "early" });
	c.close();

	const b = await create(a);
	c = await join(a, "alice-0009");
	await c.send({ type: "add", col: "action", text: "late" });
	const early = c.s.cards.find((x: any) => x.text === "early");
	await c.send({ type: "edit", id: early.id, text: "early, reworded" });
	c.close();

	let d = await join(b, "bobby-0009");
	const show = () => d.s.followUps.map((f: any) => [f.text, f.status]);
	assert.deepEqual(show(), [["early, reworded", "open"], ["late", "open"]], "late item arrives, open item picks up the edit");

	await d.send({ type: "followup", id: d.s.followUps[0].id, status: "done" });
	d.close();
	c = await join(a, "alice-0009");
	await c.send({ type: "edit", id: early.id, text: "edited again" });
	c.close();
	d = await join(b, "bobby-0009");
	assert.deepEqual(show(), [["early, reworded", "done"], ["late", "open"]], "items marked done here are left alone, nothing duplicates");
	d.close();

	// Chains keep working: the board after b gets b's still-open item once, even after several joins.
	const next = await create(b);
	for (let i = 0; i < 2; i++) (await join(next, "carol-0009")).close();
	d = await join(next, "carol-0009");
	assert.deepEqual(d.s.followUps.map((f: any) => [f.text, f.carried]), [["late", 2]]);
	d.close();
});

test("emoji rain reaches everyone, only known emojis, with a spam limit", async () => {
	const code = await create();
	const a = await join(code, "alice-0007");
	const b = await join(code, "bobby-0007");
	await a.send({ type: "burst", emoji: "🎉" });
	await a.send({ type: "burst", emoji: "🍕" });
	assert.deepEqual(b.bursts.map(({ burst, name }) => ({ burst, name })), [{ burst: "🎉", name: "alice" }]);
	assert.equal(b.s.phase, "writing", "bursts don't replace board state");
	for (let i = 0; i < 10; i++) a.send({ type: "burst", emoji: "🚀" });
	await new Promise((r) => setTimeout(r, 500));
	assert.equal(b.bursts.length, 6, "at most 6 per person per 2 seconds");
	a.close();
	b.close();
});

test("doodle: valid strokes only, sent on their own, undo your own, no clearing, read-only when locked", async () => {
	const code = await create();
	const a = await join(code, "alice-0008");
	const b = await join(code, "bobby-0008");
	const line = { c: "#e24b4a", w: 3, p: [[0.1, 0.1], [0.5, 0.123456]] };
	await a.send({ type: "stroke", stroke: line });
	await a.send({ type: "stroke", stroke: { ...line, c: "#bada55" } }); // not our palette
	await a.send({ type: "stroke", stroke: { ...line, p: [[0.1, 2]] } }); // off the canvas
	await a.send({ type: "stroke", stroke: { ...line, p: Array(501).fill([0.5, 0.5]) } }); // too long
	await b.send({ type: "stroke", stroke: { ...line, w: 8 } });

	const strokes = b.events.filter((e) => e.stroke).map((e) => e.stroke);
	assert.equal(strokes.length, 2);
	assert.deepEqual(strokes[0].p, [[0.1, 0.1], [0.5, 0.123]], "points rounded to 3 decimals");
	assert.deepEqual(strokes.map((s: any) => s.mine), [false, true]);
	assert.ok(!("strokes" in b.s) && !JSON.stringify(b.s).includes("#e24b4a"), "board state never carries the drawing");

	await b.send({ type: "doodle" });
	assert.equal(b.events.at(-1)!.doodle.length, 2);

	await b.send({ type: "undo" });
	assert.equal(a.events.at(-1)!.unstroke, strokes[1].id, "undo removes your own last stroke");
	await b.send({ type: "undo" }); // b has none left; a's stroke stays
	await a.send({ type: "doodle" });
	assert.equal(a.events.at(-1)!.doodle.length, 1);

	await b.send({ type: "clear" }); // there is no clear-all
	await post(`/api/boards/${code}/lock`, { password: PASSWORD, locked: true });
	await a.send({ type: "stroke", stroke: line });
	await a.send({ type: "undo" });
	await a.send({ type: "doodle" });
	assert.equal(a.events.at(-1)!.doodle.length, 1, "nothing clears it, and locked boards can't be drawn on or undone");
	a.close();
	b.close();
});

test("typing signal goes to everyone else, at most every 2 seconds", async () => {
	const code = await create();
	const a = await join(code, "alice-0010");
	const b = await join(code, "bobby-0010");
	await a.send({ type: "typing" });
	await a.send({ type: "typing" }); // within 2s, dropped
	const typing = (c: typeof a) => c.events.filter((e) => "typing" in e);
	assert.deepEqual(typing(b), [{ typing: "alice" }]);
	assert.deepEqual(typing(a), [], "you don't get your own typing signal");
	a.close();
	b.close();
});

test("cards are anonymous; comments and reactions show names", async () => {
	const code = await create();
	const a = await join(code, "alice-0011");
	const b = await join(code, "bobby-0011");
	await a.send({ type: "add", col: "action", text: "secret author" });
	await b.send({ type: "comment", id: a.s.cards[0].id, text: "who wrote this?" });
	await a.send({ type: "reveal" });
	await b.send({ type: "react", id: a.s.cards[0].id, emoji: "🔥" });
	const card = b.s.cards[0];
	assert.equal(card.name, "", "no author name on cards");
	assert.equal(card.mine, false);
	assert.equal(a.s.cards[0].mine, true, "you can still tell your own cards");
	assert.equal(card.comments[0].name, "bobby");
	assert.deepEqual(card.reactions[0].names, ["bobby"]);
	assert.ok(!JSON.stringify(b.s.cards).includes("alice"), "the card author's name never reaches anyone");
	a.close();
	b.close();
});

test("the board list keeps each board's mood, but only once revealed", async () => {
	const code = await create();
	const a = await join(code, "alice-0012");
	await a.send({ type: "mood", value: 4 });
	const moodOf = async () => {
		const list = (await (await post("/api/boards/list", { password: PASSWORD })).json()) as { code: string; mood: number | null }[];
		return list.find((b) => b.code === code)!.mood;
	};
	assert.equal(await moodOf(), null, "hidden while writing");
	await a.send({ type: "reveal" });
	await new Promise((r) => setTimeout(r, 200));
	assert.equal(await moodOf(), 4);
	await a.send({ type: "mood", value: 2 });
	await new Promise((r) => setTimeout(r, 200));
	assert.equal(await moodOf(), 2, "later changes are picked up");
	a.close();
});

test("live boards: cards visible as written, reactions and mood right away, no typing signal", async () => {
	const code = await create("", { hidden: false });
	const a = await join(code, "alice-0013");
	const b = await join(code, "bobby-0013");
	assert.equal(a.s.phase, "revealed");
	assert.equal(a.s.live, true);
	await a.send({ type: "add", col: "improve", text: "visible right away" });
	await b.send({ type: "typing" });
	await b.send({ type: "react", id: b.s.cards[0].id, emoji: "🔥" });
	await b.send({ type: "mood", value: 2 });
	assert.equal(b.s.cards[0].text, "visible right away");
	assert.equal(b.s.cards[0].name, "", "still anonymous");
	assert.equal(a.s.cards[0].total, 1, "reactions work before any reveal");
	assert.deepEqual(a.s.mood.counts, [0, 1, 0, 0, 0], "mood results show right away");
	assert.ok(!a.events.some((e) => "typing" in e), "no typing signal once cards are visible");
	a.close();
	b.close();
});

test("unknown boards are 404", async () => {
	await assert.rejects(join("AAAA-BBBB", "alice-0005"));
	assert.equal((await post("/api/boards/AAAA-BBBB/lock", { password: PASSWORD, locked: true })).status, 404);
});

test("stacking groups cards in one column, only while cards are visible", async () => {
	const code = await create();
	const a = await join(code, "alice-0009");
	await a.send({ type: "add", col: "well", text: "one" });
	await a.send({ type: "add", col: "well", text: "two" });
	await a.send({ type: "add", col: "well", text: "three" });
	await a.send({ type: "add", col: "improve", text: "other column" });
	const [one, two, three, other] = a.s.cards;
	await a.send({ type: "stack", id: two.id, onto: one.id }); // still writing: ignored
	assert.equal(a.s.cards[1].parent, null);
	await a.send({ type: "reveal" });
	await a.send({ type: "stack", id: two.id, onto: one.id });
	await a.send({ type: "stack", id: other.id, onto: one.id }); // different column: ignored
	assert.equal(a.s.cards[1].parent, one.id);
	assert.equal(a.s.cards[3].parent, null);
	// Dropping a stack's head onto a card in that stack is a no-op; dropping it elsewhere moves the whole stack.
	await a.send({ type: "stack", id: one.id, onto: two.id });
	assert.equal(a.s.cards[0].parent, null);
	await a.send({ type: "stack", id: one.id, onto: three.id });
	assert.deepEqual(
		a.s.cards.slice(0, 3).map((c) => c.parent),
		[three.id, three.id, null],
	);
	await a.send({ type: "unstack", id: two.id });
	assert.equal(a.s.cards[1].parent, null);
	a.close();
});

test("doodle brushes: sizes 2-24, known brushes only, stamps from the reactions, short text", async () => {
	const code = await create();
	const a = await join(code, "alice-0011");
	const dot = { c: "#2a2723", w: 4, p: [[0.5, 0.5]] };
	await a.send({ type: "stroke", stroke: { ...dot, w: 30 } }); // too big
	await a.send({ type: "stroke", stroke: { ...dot, b: "laser" } }); // unknown brush
	await a.send({ type: "stroke", stroke: { ...dot, b: "stamp", t: "🍕" } }); // not a reaction
	await a.send({ type: "stroke", stroke: { ...dot, b: "text", t: "   " } }); // empty
	await a.send({ type: "stroke", stroke: { ...dot, b: "text", t: "hi", p: [[0.1, 0.1], [0.2, 0.2]] } }); // text is one point
	await a.send({ type: "stroke", stroke: { ...dot, b: "spray", w: 24, p: [[0.1, 0.1], [0.2, 0.2]] } });
	await a.send({ type: "stroke", stroke: { ...dot, b: "stamp", t: "🚀" } });
	await a.send({ type: "stroke", stroke: { ...dot, b: "text", t: ` ${"x".repeat(80)} `, c: "#d4537e" } });
	const kept = a.events.filter((e) => e.stroke).map((e) => e.stroke);
	assert.deepEqual(
		kept.map((s: any) => [s.b, s.t?.length ?? 0]),
		[
			["spray", 0],
			["stamp", 2],
			["text", 60],
		],
	);
	a.close();
});

test("next MC: roster, a shared pick, and the rotation and show carry to the next board", async () => {
	const first = await create();
	const a = await join(first, "alice-0012");
	await a.send({ type: "pick" }); // no roster yet: ignored
	for (const name of ["Dina", "Budi", "dina", "Sari"]) await a.send({ type: "roster_add", text: name });
	assert.deepEqual(a.s.team.roster.map((m: State) => m.name), ["Dina", "Budi", "Sari"], "no duplicates, any case");
	await a.send({ type: "pick" });
	const pick = a.events.find((e) => e.pick).pick;
	assert.ok(["Dina", "Budi", "Sari"].includes(pick.winner));
	assert.equal(typeof pick.seed, "number");
	assert.equal(a.s.team.mc, pick.winner);
	await a.send({ type: "pick" }); // still playing: ignored
	assert.equal(a.events.filter((e) => e.pick).length, 1);
	a.close();

	// Next sprint: last pick is this retro's MC, and they sit out until everyone has had a turn.
	const second = await create(first);
	const b = await join(second, "bobby-0012");
	assert.equal(b.s.team.host, pick.winner);
	assert.deepEqual(b.s.team.roster.filter((m: State) => m.done).map((m: State) => m.name), [pick.winner]);
	await b.send({ type: "pick" });
	const next = b.events.find((e) => e.pick).pick;
	assert.notEqual(next.winner, pick.winner);
	assert.notEqual(next.show, pick.show, "never the same show twice in a row");
	await b.send({ type: "roster_remove", name: "Sari" });
	await b.send({ type: "roster_add", text: "New hire" });
	assert.deepEqual(b.s.team.roster.map((m: State) => m.name), ["Dina", "Budi", "New hire"].filter((n) => n !== "Sari"));
	b.close();
});
