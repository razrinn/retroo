# retro

Sprint retro board on Cloudflare Workers: Vue, one Durable Object per board, D1 for the board list.

## Develop

```sh
pnpm install
cp .dev.vars.example .dev.vars   # set CREATE_PASSWORD
pnpm dev                         # http://localhost:5173
pnpm typecheck
```

## Deploy

```sh
pnpm exec cf auth login
pnpm deploy                      # serves at retro.rzrn.dev
```

Set the `CREATE_PASSWORD` secret on the deployed Worker (20+ random characters). `cf` can't set a single secret yet, so use `pnpm dlx wrangler secret put CREATE_PASSWORD`.
