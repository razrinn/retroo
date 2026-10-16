# retroo

**A Cloudflare-first retro board.** Run your sprint retro together, in real time, on Workers, Durable Objects and D1. It fits in Cloudflare's free tier.

![retroo](public/og.png)

## Features

- **Hidden until reveal.** Everyone writes at once; other people's cards stay face-down (the text never leaves the server) until someone clicks Reveal, then they flip over.
- **Three columns:** Went well, To improve, Action items. Action items are always visible.
- **Reactions:** eight emoji, one per person per card, all count the same.
- **Comments** on any card after reveal, and on action items any time.
- **Team mood:** everyone rates the sprint 1 to 5 before writing; the average and the change from last sprint show after reveal.
- **Action items carry over.** Pick the previous board when creating a new one: its open action items show up under "Last sprint" to mark done or drop. Items added late to the old board still arrive.
- **Presenter view:** one card at a time, column by column, most reactions first, with its comments.
- **Shared timer** (3, 5 or 10 minutes), **doodle wall**, and **emoji rain** with combos when several people send the same emoji.
- **Lock** a finished board to make it read-only. Boards are kept forever and listed under Past boards.
- **Access:** anyone with a board code can join; creating, listing and locking boards need one shared password.

## How it works

```
Browser (Vue)  ──WebSocket──►  Worker  ──►  Durable Object "Board" (one per board, SQLite inside)
                                  │
                                  └──────►  D1 (index of boards, for Past boards and carry-over)
```

- **Worker** (`src/worker.ts`) serves the built app and routes `/api/*`.
- **Board Durable Object** holds a board's cards, reactions, comments, moods and doodle in its own SQLite, and pushes updates to everyone over hibernating WebSockets.
- **D1** stores only the list of boards.
- **Frontend** is Vue 3 + Vite with the Cloudflare Vite plugin, so `pnpm dev` runs the real Worker and Durable Objects locally.
- Tooling is the [`cf` CLI](https://github.com/cloudflare/cf) (beta) with `cloudflare.config.ts`.

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

3. **Deploy.** This builds the app, uploads the Worker, creates the Durable Object class and attaches the domain. It should also create the D1 database; if it reports a missing database instead, create one in the Cloudflare dashboard and put its id in `cloudflare.config.ts` as `bindings.d1({ id: "..." })`.

   ```sh
   pnpm deploy
   ```

4. **Set the password** used to create, list and lock boards. Use 20+ random characters. `cf` can't set a single secret yet, so use Wrangler for this one step:

   ```sh
   pnpm dlx wrangler secret put CREATE_PASSWORD
   ```

Later updates are just `pnpm deploy`; data and the password stay.

### Free tier

Everything here is on the Workers Free plan: Durable Objects with SQLite storage, D1, and static assets. A team retro uses a tiny fraction of the daily limits (100k requests, 5 GB storage). Going over a limit makes requests fail until 00:00 UTC; it never bills you.

## Project layout

```
src/worker.ts         Worker routes and the Board Durable Object
src/Board.vue         The board screen
src/NoteCard.vue      A card with reactions and comments
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
