# retroo

**A Cloudflare-first retro board.** Run your sprint retro together, in real time, on Workers, Durable Objects and D1. It fits in Cloudflare's free tier.

![retroo](public/og.png)

Try it without an account at `/demo` on any deployment (for example [retroo.rzrn.dev/demo](https://retroo.rzrn.dev/demo)): a sample board that lives in your browser.

## Features

- **Join with a rotating PIN**, Kahoot-style: the host shares a 6-digit PIN on screen that changes every minute, so a leaked link alone gets nobody in. No accounts, and cards stay anonymous.
- **Live or hidden:** cards appear as they're written (default), or stay face-down until a Reveal.
- **Reactions and comments** on every card; drag similar cards together to group them.
- **Team mood** each sprint, compared with the last one.
- **Action items carry over** to the next sprint until they're done.
- **Summary** at the end, copyable as Markdown for Slack, Confluence or Notion.
- **Mood trend** across sprints on Past boards.
- **Anonymous cards**: nobody sees who wrote what; comments and reactions show names.
- **Next MC picker**: a team roster that rotates across retros, revealed by one of ten random shows (wheel, races, claw machine…).
- **Presenter view**, **shared timer**, **doodle wall** and **emoji rain**.

## How it works

```
Browser (Vue)  ──WebSocket──►  Worker  ──►  Durable Object "Board" (one per board, SQLite inside)
                                  │
                                  └──────►  D1 (index of boards, for Past boards and carry-over)
```

- **Worker** (`src/worker.ts`) serves the built app and routes `/api/*`.
- **Board Durable Object** holds a board's cards, reactions, comments, moods, doodle, MC roster and access keys in its own SQLite, and pushes updates to everyone over hibernating WebSockets.
- **D1** stores only the list of boards; the Worker checks it before sending anyone to a board, so unknown codes never create storage.
- **Frontend** is Vue 3 + Vite with the Cloudflare Vite plugin, so `pnpm dev` runs the real Worker and Durable Objects locally.
- Tooling is the [`cf` CLI](https://github.com/cloudflare/cf) (beta) with `cloudflare.config.ts`.

## Access and security

There are no accounts. Access works like Kahoot:

- **Hosts.** Whoever creates a board is its host; their browser keeps a host key. The host sees the join PIN, and can lock, unlock and reset access. **Copy host link** (in the join view) makes another device a host too. Anyone with the create password can also take over as host, via **I'm the host** on the PIN screen.
- **Joining.** The host shares the join view on screen: the board link and a 6-digit PIN that changes every minute (the previous minute's PIN still works). **Copy invite** gives a link with the current PIN for people not watching; it stops working with the PIN. The PIN and host key ride after `#` in links, which browsers never send to a server.
- **Passes.** A correct PIN gives your browser a pass for that board, so you don't need the PIN again. It's sent in the WebSocket handshake (never the URL) and is your identity on the board, so nobody can act as you by copying a browser id. **Reset access** cancels everyone's pass but the host's; people rejoin with the new PIN.
- **Anonymity.** Cards are stored with a random id for their author, never shown to anyone; names only appear on comments and reactions. No emails, no tracking.
- **Limits.** 10 wrong PINs per board per minute; 10 wrong create passwords per address per 15 minutes; 60 messages per person per 10 seconds; at most 400 cards, 1,500 comments and 300 people per board.
- **Headers.** `public/_headers` sets a Content-Security-Policy (this site only, no inline scripts), blocks framing, and turns on HSTS and nosniff.

The `/demo` board needs no PIN; it lives in your browser only.

## Develop

Needs Node 22.18+ and pnpm.

```sh
pnpm install
cp .dev.vars.example .dev.vars   # set CREATE_PASSWORD for local use
pnpm dev                         # http://localhost:5173
```

```sh
pnpm typecheck   # Worker (tsc) and Vue screens (vue-tsc)
pnpm test        # runs the real Worker + Durable Object in memory; needs .dev.vars
```

Local data lives in `.cloudflare/state/`. Delete that folder to start fresh.

## Deploy your own

1. **Log in** (once per machine):

   ```sh
   pnpm exec cf auth login
   ```

2. **Pick your domain.** It must be a zone on your Cloudflare account. Change it in two places:

   - `cloudflare.config.ts`, `domains: ["retroo.rzrn.dev"]`. Remove the line to use the free `*.workers.dev` address instead.
   - `index.html`, the `og:url` and `og:image` tags (link previews need full URLs).

3. **Choose the password** used to create and list boards, and to take over as a board's host (20+ random characters) and put it in `.env.secrets`, which git ignores:

   ```sh
   echo "CREATE_PASSWORD=your-long-random-password" > .env.secrets
   ```

4. **Deploy.** This builds the app, uploads the Worker with the password, creates the D1 database and the Durable Object class, and attaches the domain. No ids to copy into the config.

   ```sh
   pnpm run deploy --secrets-file .env.secrets
   ```

   Use `pnpm run deploy`, not `pnpm deploy`; the latter is a built-in pnpm command.

Later updates are just `pnpm run deploy`; data and the password stay. To change the password, edit `.env.secrets` and deploy with `--secrets-file` again.

**Upgrading from a version without join PINs:** existing boards have no host yet. Open one, choose **I'm the host**, and enter the create password; then share the PIN as usual. Everyone else joins once with the PIN, and their own older cards stay theirs.

### Free tier

Everything here is on the Workers Free plan: Durable Objects with SQLite storage, D1, and static assets. A team retro uses a tiny fraction of the daily limits (100k requests, 5 GB storage). Going over a limit makes requests fail until 00:00 UTC; it never bills you.

## Project layout

```
src/worker.ts         Worker routes and the Board Durable Object
src/Board.vue         The board screen
src/NoteCard.vue      A card with reactions and comments
src/JoinView.vue      The host's join view: PIN, invite and host links, reset access
src/Picker.vue        Next MC picker; the ten shows are in src/shows/
src/Presenter.vue     Presenter view
src/Doodle.vue        Doodle wall
src/EmojiRain.vue     Emoji rain and combos
src/Timer.vue         Shared timer
src/Mascot.vue        Stickie, the mascot (also public/favicon.svg)
test/board.test.ts    Board rules, end to end
design/og.html        Source of the link preview image
```

### Social preview image

`public/og.png` is a screenshot of `design/og.html`. To rebuild it after editing:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=1200,630 \
  --screenshot="$PWD/public/og.png" "file://$PWD/design/og.html"
```

## License

[MIT](LICENSE)
