# Deploying Relay

Two things get deployed: the **coordination server** and the **web app**. The
agent is never deployed — it runs on each host's own machine, which is the
whole point of the architecture.

Budget about 40 minutes. Most of it is waiting for builds.

---

## The one thing to understand before you start

The server and the web app each need the other's URL, so they cannot both be
configured first. The order below resolves it, and it only works in this order:

```
1. Deploy the server        →  get  https://relay-server.up.railway.app
2. Deploy the web app       →  using that URL, get  https://relay.vercel.app
3. Go back and tell the server about the web app's origin
```

Step 3 is not optional. Until it happens the server rejects nothing, and any
website can open sockets against it.

**Why the web app can't be fixed up afterwards the same way:** its config is
`NEXT_PUBLIC_*`, which Next.js **inlines into the JavaScript at build time**.
Changing it on Vercel later does nothing until you redeploy. The server's config
is read at runtime, so it can be changed freely — which is why the server is the
one that gets fixed up at the end.

---

## Before anything

Your work is uncommitted, and both platforms deploy from GitHub. Push first:

```bash
git status                       # see what's uncommitted
git add -A
git commit -m "production hardening + deploy config"
git push origin testing
```

Deploy from whichever branch you push. You do not need to merge to `main` first.

---

## 1. The server → Railway

Railway is the recommendation over Render for one reason: **Render's free tier
sleeps after 15 minutes of inactivity.** Relay keeps every session in memory, so
a spin-down drops every live session and every connected agent. Railway's
starter plan (~$5/month of usage) does not sleep. Whichever you pick, do not put
this on a tier that sleeps.

```bash
npm i -g @railway/cli
railway login                    # opens a browser — this is the part only you can do
```

Then, from the repo root:

```bash
railway init                     # name it "relay-server"
railway add --database postgres  # optional, see below
railway up                       # deploys; watch the build log
railway domain                   # generates a public URL
```

`railway.json` in the repo root already sets the build command, start command
and health check, so Railway should need no further configuration.

**Write down the URL it prints.** You need it in step 2.

### Is Postgres worth adding?

It buys exactly one thing: when a session is no longer live, its link renders a
**read-only replay of the transcript** instead of "no session". Without it, a
link you shared yesterday is simply dead.

It does *not* resume sessions — sockets, the driver lock and the agent's
conversation are memory-only by design, and no database changes that.

Add it. It's the difference between a shared link decaying gracefully and
decaying into an error. Railway sets `DATABASE_URL` automatically when you add
the service, and migrations run on boot via the start command.

### Verify before moving on

```bash
curl https://YOUR-SERVER.up.railway.app/healthz
# {"ok":true,"sessions":0,"uptime":12.3}
```

If that returns JSON, the server is up. Check the deploy logs for:

```
WARNING: RELAY_ALLOWED_ORIGINS is unset — any website can open sockets against this server
```

That warning is expected right now. Step 3 clears it.

---

## 2. The web app → Vercel

Import `github.com/Avaya02/Relay` at [vercel.com/new](https://vercel.com/new).

Two settings matter, and the first one is the one people miss:

| Setting | Value |
|---|---|
| **Root Directory** | `packages/web` |
| Framework Preset | Next.js (auto-detected) |

Vercel detects the pnpm workspace and installs from the repo root on its own.
Leave the build and install commands alone.

**Set both environment variables before the first deploy** — remember they're
baked in at build time:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_WS_URL` | `wss://YOUR-SERVER.up.railway.app` |
| `NEXT_PUBLIC_SITE_URL` | `https://YOUR-APP.vercel.app` |

`wss://`, not `https://`. An `https://` value here fails at connect time with an
error that does not mention the protocol.

`NEXT_PUBLIC_SITE_URL` is a chicken-and-egg — you don't know the Vercel URL
until it deploys. Either deploy once, read the URL, set the variable and
redeploy, or set it to the project name you chose (Vercel's default hostname is
predictable: `<project>.vercel.app`). Only link previews depend on it, so
getting it on the second try costs nothing.

---

## 3. Lock the server to the web app

Back in Railway → your service → Variables:

```
RELAY_ALLOWED_ORIGINS = https://YOUR-APP.vercel.app
NODE_ENV              = production
```

No trailing slashes. Comma-separate if you add a custom domain later.

Railway restarts the service automatically. Confirm the warning is gone from the
logs.

**Check it actually took effect:**

```bash
# your app — expect 201
curl -o /dev/null -s -w "%{http_code}\n" -X POST \
  -H "Origin: https://YOUR-APP.vercel.app" \
  https://YOUR-SERVER.up.railway.app/sessions

# anywhere else — expect 403
curl -o /dev/null -s -w "%{http_code}\n" -X POST \
  -H "Origin: https://evil.example.com" \
  https://YOUR-SERVER.up.railway.app/sessions
```

If the second one returns 201, `NODE_ENV` isn't set to `production`.

---

## 4. First real session

From any repository on your machine:

```bash
pnpm --filter relayrun exec tsx src/cli.ts --repo /path/to/some/repo
```

The deployed URLs are already the defaults (see §5) — add `--server`/`--web`
only to point at a scratch deployment.

It prints a link. **Send it to someone who is not you** — that is the first
genuine test this project has ever had. Every session before that was you in two
windows on one machine.

Ask them to click **Request control**, approve it, and watch the composer move
to their screen.

---

## 5. Publishing the CLI

Bake the deployed URLs in as defaults —
[`packages/agent/src/cli.ts`](packages/agent/src/cli.ts), the two constants near
the top:

```ts
const DEFAULT_SERVER = process.env.RELAY_SERVER ?? "https://relay-production-c9bd.up.railway.app";
const DEFAULT_WEB    = process.env.RELAY_WEB    ?? "https://relayrun.in";
```

Pin the agent's `dev` script to localhost in the same commit, or `pnpm dev`
silently points your local mock agent at the production server.

Then:

```bash
git checkout main          # pnpm refuses to publish from other branches
cd packages/agent
pnpm publish --access public --otp=<6-digit-code>
```

Four things that will stop you, each learned by being stopped:

**Use `pnpm publish`, not `npm publish`.** The manifest carries
`"@relay/shared": "workspace:*"`. That protocol is pnpm-only — `npm publish`
uploads the literal string, `pnpm publish` rewrites it to a real version.

**npm requires 2FA to publish.** Tokens that bypass it are being restricted
(direct publishing ends Jan 2027). Enable 2FA on the account and pass `--otp`
with a fresh code; they rotate every 30 seconds.

**`npm view <name>` cannot tell you whether a name is publishable.** It only
proves nobody owns it. npm runs a typosquat filter server-side at PUT time that
refuses names too close to popular ones — `relayd` was rejected for sitting near
`delay`. There is no way to test it except to try.

**Hyphens are normalized away.** `relay-live` existing is enough to block
`relaylive`. Check both forms before committing to a name.

The `bin` key must also match the package name, or `npx <name>` cannot work out
which command to run.

Verify before trusting it:

```bash
cd $(mktemp -d) && npm i relayrun && ./node_modules/.bin/relayrun --help
```
---

## What will bite you

**The session dies when you redeploy.** Live state is in memory. Any redeploy,
restart or crash ends every session on the server. Expected, documented, and the
reason Postgres is worth adding — the transcript survives even though the
session doesn't.

**`NEXT_PUBLIC_*` needs a rebuild, not a restart.** Worth repeating because it
looks like a broken deploy: you change the variable, the app doesn't change, and
nothing in the UI explains why.

**One process, no scaling.** Sessions live in one server's memory. Two instances
would mean two independent sets of sessions with no way to reach across. Don't
raise the replica count.

**Free tiers sleep.** Said above; it's the failure most likely to look like a
bug in your code rather than a setting.

---

## Rolling back

```bash
railway rollback           # or pick a previous deploy in the dashboard
```

Vercel keeps every deployment — promote an earlier one from the dashboard.
Neither preserves live sessions, so roll back freely.
