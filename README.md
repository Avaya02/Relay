# Relay

Live, shared sessions for AI coding agents. Everyone with the link watches the same
[Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk/overview) run as it happens, one
person drives, and control can be handed over mid-task.

[relayrun.in](https://relayrun.in) · [`relayrun` on npm](https://www.npmjs.com/package/relayrun)

![A live Relay session: the agent's steps streaming in the middle, its plan above them, the files it changed on the right, and two people in the room](docs/session.png)

A normal agent session is single-player. If someone else wants to see what the agent did,
they get a transcript afterwards or a screen share. Relay turns the session into something
closer to a shared terminal: the agent runs on the host's machine, and everyone else follows
the same event stream in their browser.

## Quick start

Run it in the repository you want the agent to work on:

```bash
cd your-project
npx relayrun
```

The CLI prints a link. Anyone who opens it watches the run live and can ask for control.

You need Node 20.9 or later, `git`, and either a Claude Code login on the machine or an
Anthropic API key (`--api-key sk-ant-...`). A claude.ai browser session or the Claude Desktop
app is a separate login and won't work. If no credential is found, the CLI says so before it
opens a session.

`npx relayrun --mock` runs a scripted agent instead. It costs nothing, but it ignores what you
type and replays a fixed run, so it's for UI work and demos rather than real answers.

## How it works

```
  relayrun (host machine)     events up, instructions down      server          browsers
  repo, shell, credentials                                   no repo, no shell, no keys
```

- **The agent runs on the host's machine.** `relayrun` keeps a base clone of the repository
  in the OS temp directory and gives each session its own clone of it, so the agent never
  touches your working tree. The session clone is deleted when the CLI exits.
- **The server only coordinates.** It handles sessions, event ordering, the driver lock and
  presence. It never receives your repository, never runs a shell and never sees a
  credential. Browsers get a JSON event stream: the agent's actions, its replies, and the
  diff of every file it changes.
- **The connection is outbound.** The CLI dials out to the server, so there are no ports to
  open.
- **Changes come back as a branch.** The driver can publish the session's changes to a
  branch in the host's repository, and optionally open a pull request.

The clone is a clean starting point, not a sandbox. The agent runs with
`permissionMode: "bypassPermissions"` and no OS-level isolation, which is the same trust model
as running Claude Code directly on your own machine.

An earlier version ran the agent on the server. That meant anyone using Relay had to give a
shared machine shell access to their code, so the agent moved into the CLI and the server was
reduced to coordination.

## Concurrency

Multiplayer plus an agent that writes files is a concurrency problem. Two rules keep it safe.

**One person drives.** Only the driver can send instructions, and the check runs on the
server, so a hand-crafted WebSocket frame can't get around a disabled button. Control moves by
explicit hand-over or release. Everyone else can suggest an instruction, and the driver
decides whether to send it.

**The server orders every event.** `seq` is assigned in exactly one place
([`transcript.ts`](packages/server/src/transcript.ts)), and clients append in that order
without sorting or merging. That is what keeps every browser in agreement about what happened
and when.

A dropped connection or a page refresh rejoins under the same identity, still driving, as long
as it comes back within 30 seconds. After that, a departed driver's control is released rather
than left stuck. A second instruction sent while the agent is working is queued; it never
starts a second agent against the same working directory.

Relay doesn't support several people instructing the agent at once. That would need an
ordering for competing instructions and a meaning for interrupting the agent mid tool call,
and it is out of scope by design.

## Interface

- **Turns.** Each turn shows the prompt, the agent's reply and its steps. Steps stream live
  while the agent works, then fold into a single summary line when the turn finishes, with
  the full list a click away.
- **Plan.** The agent's own `TodoWrite` checklist sits above the conversation. It is built
  from the transcript rather than stored separately, so it is correct for someone who joins
  mid-run.
- **Changes.** The files the session changed, with line counts. A file's diff opens in a
  drawer, and the driver can publish everything to a branch from here.
- **Sessions.** The sessions you've joined, kept in the browser's `localStorage`. There are no
  accounts, so the list is per browser; session links work from anywhere.

The composer shows what is answering: the model name for the real agent, `Demo` for the
scripted one. Each finished turn shows what it cost, and the repository button in the top bar
opens the session's running total.

The screenshot above is from the scripted agent, so the file names in it are synthetic. The
interface is the real one.

## Developing

Working on this repository needs Node 22.x and pnpm. Postgres is optional.

```bash
pnpm install
pnpm dev
```

This starts the coordination server on `:4000`, the web app on `:3000`, and a `relayrun`
instance in mock mode against this repository. The CLI prints a session link; open it in two
windows to see a driver and a watcher at once.

To point the local stack at a real repository with the real agent:

```bash
pnpm --filter relayrun build
node packages/agent/dist/cli.js --repo /path/to/repo \
  --server http://localhost:4000 --web http://localhost:3000
```

Without `--server` and `--web`, the CLI connects to the hosted service at relayrun.in.

### CLI flags

| Flag | Default | What it does |
|---|---|---|
| `--repo <path>` | current directory | Repository to work in |
| `--mock` | off | Scripted offline agent; ignores input |
| `--api-key <key>` | none | Bill this key instead of the local Claude Code login |
| `--model <id>` | `claude-sonnet-5` | Model to run (also `RELAY_MODEL`) |
| `--server <url>` | `https://api.relayrun.in` | Coordination server (also `RELAY_SERVER`) |
| `--web <url>` | `https://relayrun.in` | Web app, used for the printed link (also `RELAY_WEB`) |
| `--session <id>` + `--token <token>` | none | Reattach to an existing session |
| `--github-repo` + `--github-token` | none | Push the branch to GitHub and open a pull request on publish |

### Server configuration

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `4000` | Server port |
| `RELAY_ALLOWED_ORIGINS` | none | Comma-separated web origins allowed to connect. Required in production: with `NODE_ENV=production` and no list, browsers are refused |
| `DATABASE_URL` | none | Postgres for the transcript mirror. Omit to disable it |
| `RELAY_MAX_SESSIONS_PER_MINUTE` | `10` | Session creation limit per client IP |
| `RELAY_MAX_LIVE_SESSIONS` | `500` | Cap on sessions held in memory |
| `RELAY_REAP_MS` | `600000` | How long an empty session is kept before it is dropped |

With Postgres:

```bash
createdb relay_dev
# add DATABASE_URL=postgresql://<you>@localhost:5432/relay_dev to packages/server/.env
pnpm --filter @relay/server exec prisma migrate deploy
```

### Packages

```
packages/shared   WebSocket protocol types both sides compile against
packages/agent    relayrun CLI: holds the repo, runs the Agent SDK, streams events up
packages/server   Node http + ws: sessions, ordering, the driver lock, presence, Postgres mirror
packages/web      Next.js App Router, Tailwind v4, shadcn/ui
```

## Deploying

The server needs a host with long-lived WebSocket support (Railway, Render or Fly; not
Vercel), plus Postgres if transcripts should survive a restart. Set `RELAY_ALLOWED_ORIGINS` to
the web app's origin. Because the server holds no repository, shell or credentials, running it
publicly doesn't carry the risk a typical hosted dev tool would.

Nobody deploys the agent. Each person runs `relayrun` against their own repository to host a
session.

## Credentials

Anthropic's [terms](https://code.claude.com/docs/en/legal-and-compliance) restrict OAuth-based
Claude Code login to the subscriber's own use and don't permit routing other people's requests
through it. Running `relayrun` locally fits inside that: it's your own credentials, on your
own machine, used the way Claude Code itself uses them. The server never sees a credential,
and whoever starts the agent pays for the run.

One implementation note: passing `ANTHROPIC_API_KEY` through the SDK's `env` does not work on
a machine that already has a Claude Code login. It is silently ignored and the subprocess
authenticates with the stored OAuth token instead, so the wrong account pays and nothing looks
wrong. This was confirmed by pointing `ANTHROPIC_BASE_URL` at a local server and reading the
request headers. The mechanism that works is `apiKeyHelper`; see
[`sessionKey.ts`](packages/agent/src/sessionKey.ts).

## Known limitations

- **No authentication.** A session link is the access control, like a video call link. Anyone
  with it can join and request control. Input is still validated and bounded server-side
  ([`validate.ts`](packages/server/src/validate.ts)). Attaching an agent to a session does
  require a secret: a runner token generated per session and held only by the CLI that
  started it.
- **No accounts, so no sync.** The sessions list is per browser.
- **Sessions don't survive a server restart.** Live state (sockets, the driver lock, presence,
  queued instructions) is in memory. Postgres keeps the transcript, so an ended session
  renders as a read-only replay instead of an error, but there is no live resume.
- **Single process.** There is no horizontal scaling; sessions live in one server's memory.
- **Reattaching restores the room, not the work.** `relayrun --session <id> --token <token>`
  rejoins the session, but the agent starts again on a fresh clone. Publish anything you want
  to keep before stopping the CLI; Ctrl-C warns first if there are unpublished changes.
- **The GitHub pull request path is untested against live GitHub.** Publishing a branch into
  the host's own repository works. Opening the pull request is implemented but has never run
  against the real API.

## License

MIT
