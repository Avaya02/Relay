# @relay/web

The Relay web app: the landing page at [relayrun.in](https://relayrun.in) and the live session
view. Next.js App Router, Tailwind v4, shadcn/ui.

```bash
pnpm --filter @relay/web dev    # http://localhost:3000
```

Run `pnpm dev` from the repository root instead to start the coordination server and a mock
agent alongside it.

| Variable | Default | What it does |
|---|---|---|
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:4000` | Coordination server to connect to. Read at build time |
| `NEXT_PUBLIC_SITE_URL` | `VERCEL_URL`, then `http://localhost:3000` | Base for absolute URLs in link previews |

This version of Next.js has breaking changes from older releases. Read [`AGENTS.md`](AGENTS.md)
before changing framework-level code.
