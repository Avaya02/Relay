# Relay

Watch a Claude agent work on a real codebase, live, with one person in control and everyone
else watching in real time.

A normal agent session is single-player. If someone else wants to see what the agent did,
they get a transcript afterward, or a screen share. Relay turns a session into something
closer to a shared terminal: everyone with the link watches the same event stream as it
happens, and control can be handed to someone else without restarting anything.

The agent itself is the [Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk/overview),
the same engine Claude Code runs on. Relay is the layer around it: multi-viewer streaming,
catch-up for people who join late, and a driver lock enforced by the server, not the UI.

![A Relay session: sessions on the left, the plan strip and action ledger in the middle, the workspace rail on the right, with a second participant watching](docs/session.png)

## Concurrency

Multiplayer plus an agent that writes files is a concurrency problem. Two rules keep it
safe:

**Only one participant can send input at a time.** This is enforced on the server, not just
hidden in the UI. A non-driver's `instruct` message is rejected server-side, so a
hand-crafted WebSocket frame can't get around a disabled button. Control changes by explicit
hand-over or release. If the driver disconnects, control is freed instead of getting stuck.

**The server assigns order to every event.** `seq` is set in exactly one place
([`transcript.ts`](packages/server/src/transcript.ts)), and clients only ever append in that
order. They don't sort or merge locally. That's what keeps two browsers agreeing on what
happened and when.

Relay doesn't support multiple people sending instructions at once. That would need a
defined ordering for competing instructions and a defined meaning for interrupting the agent
mid tool call, and it's out of scope by design.

## Interface

Three panels:

- **Action ledger.** One row per action. A tool call shows up immediately in a pending
  state, and its result fills the same row when it arrives, so a run with 32 raw events
  reads as roughly 13 rows. Diffs and long output sit behind a toggle instead of getting
  truncated.
- **Plan strip.** The agent's own `TodoWrite` checklist, shown live above the ledger. It's
  built from the transcript rather than stored separately, so it's still correct for someone
  who joins in the middle of a run.
- **Workspace rail.** Which files changed, by how much, and their diffs. It isn't a file
  tree: it only lists what the current session touched, and it's empty until the agent
  writes something. The driver can commit from here to a branch.

![The plan strip expanded into its full checklist, with a file's diff open in the workspace rail on the right](docs/plan.png)

On the left, a list of sessions you've joined, kept in the browser's `localStorage`. There
are no accounts, so the list is per browser. A different browser shows an empty list, and
the session links still work from it.

The header shows what's actually running: `Demo` for the scripted agent, `Live` for the real
one, and `Live ··4f2a` when someone in the room supplied their own API key, so it's visible
whose account is paying for the run.

## Running it

Node 22.x and pnpm, to work in this repo (see `engines` in the root `package.json`).
Postgres is optional.

```bash
pnpm install
pnpm dev
```

This starts the coordination server, the web app, and a `relayrun` instance in mock mode
together. The CLI prints a session link. Open it in two windows to see a driver and a
viewer at once.

To point an agent at a real repository, run the CLI directly:

```bash
cd /path/to/your/repo
pnpm --filter @relay/agent start              # real agent, uses the Agent SDK
pnpm --filter @relay/agent start -- --mock    # scripted, offline, no real answers
```

The real agent is the default. If the machine already has Claude Code set up, the SDK uses
those credentials automatically. Pass `--api-key sk-ant-...` to bill a specific key instead;
it's checked before the session starts and never leaves the machine.

`--mock` runs a scripted agent against a disposable clone: plan updates, a failing test, a
fix, real file writes, no cost. It's how most of the UI was built. It ignores anything you
type, so it stays opt-in instead of the default.

Once published to npm, `relayrun` only needs Node `>=20.9.0` to run (see
`packages/agent/package.json`); the 22.x requirement above is for developing this repo, not
for using the published CLI.

### CLI flags

| Flag | Default | What it does |
|---|---|---|
| `--repo <path>` | current directory | Repository to work in |
| `--mock` | off | Scripted offline agent, ignores input |
| `--api-key <key>` | none | Bill this key instead of the local Claude Code login |
| `--server <url>` | `http://localhost:4000` | Coordination server to connect to |
| `--web <url>` | `http://localhost:3000` | Web app, used for the printed link |
| `--session <id>` + `--token` | none | Reattach to an existing session |
| `--github-repo` / `--github-token` | none | Open a PR on publish |

`--model` (or `RELAY_MODEL`) sets the model. Default is `claude-sonnet-5`.

### Server config

| Variable | Default | What it does |
|---|---|---|
| `DATABASE_URL` | none | Postgres connection for the transcript mirror. Omit to disable it |
| `PORT` | `4000` | Server port |

That's the full configuration. The server holds no repository, runs no shell commands, and
stores no credentials.

With Postgres:

```bash
createdb relay_dev
# add DATABASE_URL=postgresql://<you>@localhost:5432/relay_dev to packages/server/.env
pnpm --filter @relay/server exec prisma migrate deploy
```

## Architecture

```
packages/shared   WebSocket protocol types shared by both sides
packages/agent    relayrun CLI. Holds the repo, runs the Agent SDK, streams events up
packages/server   Node http + ws. Sessions, ordering, the lock, presence, Postgres mirror
packages/web      Next.js App Router, Tailwind v4, shadcn/ui
```

```
  relayrun (your machine)   events up / instructions down    server        browsers
  the repo, the shell, the keys                          no repo, no shell, no keys
```

The agent runs on whichever machine already has the repository. The server only
coordinates: it never receives your code, and there's no per-deployment repository to
configure. Browsers receive a JSON event stream and render it; nobody is given direct
access to the repository.

Each session runs against a fresh `git clone` of the repo, deleted once the run ends. That's
a clean starting point, not a sandbox: the agent has unrestricted shell access
(`permissionMode: "bypassPermissions"`) with no OS-level isolation, so it can still reach
the rest of the filesystem. This is the same trust model as running Claude Code directly,
just on your own machine instead of a shared server.

A few details:

- **Reconnects keep your seat.** A dropped socket retries and rejoins under the same
  participant identity. The server holds that identity for 30 seconds, so a brief
  disconnect doesn't drop you from the session or release the driver lock.
- **Instructions queue instead of racing.** A second instruction sent mid-run is added to
  the transcript immediately but doesn't start a second agent against the same working
  directory.
- **Postgres mirrors the transcript, not the live session.** See below.

## Deploying

The server needs a host with long-lived WebSocket support (Railway, Render, Fly; not
Vercel), plus Postgres if transcripts should survive a restart. Because it holds no
repository, shell, or credentials, deploying it publicly doesn't carry the same risk a
typical hosted dev tool would.

Nobody deploys the agent. Each person runs `relayrun` against their own repository to host
a session. The CLI dials out to the server, so there are no inbound ports to open.

### Credentials

Anthropic's [terms](https://code.claude.com/docs/en/legal-and-compliance) restrict
OAuth-based Claude Code login to the subscriber's own use, and don't permit routing other
people's requests through it. Running `relayrun` locally fits inside that: it's your own
credentials, on your own machine, used the same way Claude Code itself would use them. The
server never sees a credential at all. Whoever starts the agent pays for the run, and the
running cost is shown in the header so the room can see it.

One implementation note: passing `ANTHROPIC_API_KEY` through the SDK's `env` does not work
on a machine that already has a Claude Code login. It's silently ignored, and the subprocess
authenticates with the stored OAuth token instead, so the wrong account pays and nothing
looks wrong. Confirmed by pointing `ANTHROPIC_BASE_URL` at a local server and inspecting the
request headers. The mechanism that actually works is `apiKeyHelper`; see
[`sessionKey.ts`](packages/agent/src/sessionKey.ts).

## Known limitations

- **No authentication.** A session link is the access control, the same as a video call
  link. Anyone with it can join and request control. Input is still validated and bounded
  server-side ([`validate.ts`](packages/server/src/validate.ts)); "no accounts" and "no
  validation" are separate decisions, and only the first is intentional. Attaching an agent
  to a session does require a secret: a runner token, generated per session and held only
  by the CLI that started it.
- **No accounts, so no sync.** The joined-sessions list is per browser. Links still work
  from anywhere; the list doesn't follow you.
- **Sessions don't survive a server restart.** Live state (sockets, the lock, the agent
  process, the working directory) is in memory. Postgres stores the transcript, so a dead
  session renders as a read-only replay instead of an error, but there's no live resume.
- **Single process.** No horizontal scaling. Sessions live in one server's memory.
- **Not an IDE.** No file tree, no editor, no tabs. It's for watching and steering a run,
  not browsing a codebase.
- **The GitHub PR path is untested against live GitHub.** Committing and pushing to a
  branch is tested against a local remote. Opening the PR itself is implemented but has
  never run against the real API.

## Further reading

[`docs/internal/SCOPE_REVIEW.md`](docs/internal/SCOPE_REVIEW.md) is the design review that
led to the current architecture: it names the original trust problem (the server used to
hold the repository and run the agent's shell) and the decision to move the agent onto the
host's own machine instead. `PRODUCT.md` and `DESIGN.md` in the same folder cover product
intent and the visual system.

The screenshots above are from the mock agent, so the repository and file names in them are
synthetic. The interface itself is the real one.

## License

MIT
