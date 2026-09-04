# Scope review — is Relay a coherent product, and what would make it pitch-worthy

**Purpose of this document.** It is a handoff for a fresh session. It states what exists,
names the flaws honestly (including one that undermines the current product model), and
proposes a scope that resolves them. Read it top to bottom before changing code.

**Status when written:** branch `Avi-Setup`, last commit `a2a58ec`. Everything through the
sessions rail / BYO-key / validation work is committed. Uncommitted: the black-theme
redesign, `REDESIGN_PLAN.md`, `interview+fundamentals/`, and a stray `test.md` (see
§2.1 — it is evidence, keep it until read).

---

## 1. The question that triggered this

> *"Why would someone give their repo access to us? The repo is saved on our server."*

This is the correct question and the current architecture does not have a good answer.
Verified in `packages/server/src/repo.ts`:

```ts
function sourceRepo(): string {
  return process.env.RELAY_SOURCE_REPO ?? "/Applications/Projects/PromptGuard";
}
await run("git", ["clone", sourceRepo(), PRISTINE_DIR]);   // once, server-side
await run("git", ["clone", PRISTINE_DIR, dir]);            // per session
```

Three facts follow, and all three are load-bearing:

1. **The repo lives on the server, not on any participant's machine.** Both browsers only
   ever receive a JSON event stream. Nobody "has access to the repo" — they watch a
   description of what happened to a folder on the server.
2. **`RELAY_SOURCE_REPO` is a single server-wide env var.** There is no per-session repo
   field anywhere. One deployment = one repo, chosen by whoever runs the server. A visitor
   cannot say "use my codebase."
3. **The agent runs on that server with unrestricted shell** (`permissionMode:
   "bypassPermissions"`), as the server's own OS user.

So as a *hosted* product, Relay currently asks a user to: upload their source code to a
stranger's server, let an LLM run arbitrary shell against it there, and (for private
repos) hand over a GitHub credential. That is an enormous trust ask for a collaboration
tool. **The instinct that something is wrong here is right.**

---

## 2. The three honest resolutions

Pick one deliberately. They are genuinely different products.

### Option A — Self-hosted dev tool *(what the code already assumes)*

Relay is something a team runs on their own infrastructure, like Storybook or a local
dashboard. `RELAY_SOURCE_REPO` being a local path stops being a limitation and becomes the
design: it's *your* server, *your* repo, *your* network.

- **Effort:** zero code. It's a positioning and documentation change.
- **Kills:** the trust problem entirely (there is no "us").
- **Costs:** no public demo link that does real work. The public deploy can only run the
  mock agent.
- **Honest framing:** *"A tool you run alongside your team, not a service you upload to."*

### Option B — Hosted SaaS with GitHub OAuth

Per-user OAuth, private repo cloning, per-session repos, container sandboxing, secrets
management, quota/billing.

- **Effort:** months. This is a company, not a portfolio project.
- **Not recommended.** Named here so the decision is explicit rather than avoided.

### Option C — Split the agent out to the driver's machine ⭐ *strongest*

**This is the recommendation, and it is worth reading carefully.** It resolves the trust
problem, the sandboxing problem, the API-key custody problem and the "whose repo" problem
simultaneously — and it makes the product name literally accurate.

Today the server does everything: holds the repo, runs the agent, broadcasts events.
Instead, **split it in two**:

```
  ┌─ relayrun (a CLI the host runs locally) ────────────┐
  │  has the repo (it's just their working directory)      │
  │  runs the Claude Agent SDK on their own credentials    │
  │  streams events UP over one WebSocket                  │
  └────────────────────┬───────────────────────────────────┘
                       │  events up / instructions down
                       ▼
  ┌─ relay server (deployed, public) ──────────────────────┐
  │  coordination ONLY: sessions, seq ordering, the driver │
  │  lock, presence, broadcast, transcript mirror          │
  │  NO repo. NO shell. NO API keys. NO code, ever.        │
  └────────────────────┬───────────────────────────────────┘
                       ▼
              browsers (watch + request control)
```

What this buys:

| Problem today | Under Option C |
|---|---|
| User's code sits on your server | Code never leaves the host's machine |
| Agent has shell on your server | Agent runs on the host's own machine, as them |
| Needs GitHub OAuth for private repos | Irrelevant — it's already their checkout |
| Whose API key pays? | The host's own local Claude Code credentials |
| One repo per deployment | Any repo, because it's whatever directory they run it in |
| Public deploy is unsafe | Server is a pure WebSocket relay — trivially safe to deploy |

This is the VS Code Live Share model: the host executes, guests observe and can take the
wheel. It is a well-understood, defensible architecture.

**What actually moves.** The protocol barely changes — the `Event` shapes, `seq` ordering,
driver lock, presence and reconnect logic all stay. What changes is *who produces events*.
Concretely: `agent.ts`, `agent-mock.ts`, `repo.ts`, and `sessionKey.ts` move out of the
server into a new `packages/agent` CLI. The server keeps `ws.ts`, `sessions.ts`,
`transcript.ts`, `persist.ts`, `validate.ts`.

**New problems it introduces — name these, don't hide them:**
- The host must install and run something. That's real friction.
- The host's machine going offline kills the session (the server can't continue alone).
- A new trust direction: the host is letting remote people run instructions on *their*
  machine. That's the same trust as pair programming, but it must be explicit in the UI —
  the host should see exactly what a guest is asking for, and driver hand-over becomes a
  genuine security control, not just a coordination one.
- Authenticating the agent CLI to a session (a one-time token printed by the CLI) is new
  work.

**Effort:** substantial but not enormous — perhaps a week of focused work, because the
hard parts (ordering, lock, reconnect, replay) are already built and don't move.

---

## 3. Other flaws worth naming

### 3.1 Isolation is a starting condition, not a boundary *(open, evidence in-repo)*

`test.md` in the repo root was written by the agent during manual testing. The session's
working directory was correctly a disposable clone — but the agent ran `ls ~`,
`find ~ -iname ...`, `ls ~/relay` and wrote outside the clone. `~` resolves to the real
user's home regardless of `cwd`, and there is no OS-level sandbox.

**The docs currently overstate this.** `README.md` and the interview notes say the working
directory "is never your source checkout," which is true as a *starting* condition and
misleading as a security claim. **Correct this wording before showing anyone.** It is a
10-minute fix and exactly the kind of thing an interviewer catches.

Note: under Option C this stops being a server security problem and becomes an honest
property ("the agent runs on your machine with your permissions, like Claude Code does").

### 3.2 No automated tests, no CI *(open)*

Everything has been verified by hand-written throwaway scripts (protocol tests via raw
`ws`, browser tests via Playwright, canvas-based contrast measurement). Those were
thorough and caught real bugs — but they aren't a repeatable suite, and "do you have
tests?" is a guaranteed follow-up to the interview docs. The existing scripts are a good
skeleton: port them into `node:test` + a Playwright config, wire a GitHub Action.

### 3.3 Sessions don't survive a restart *(known, documented)*

Postgres mirrors the transcript only. Live state (sockets, lock, working dir, agent
conversation) is in memory. Dead links render a read-only replay. This is documented
honestly and is a reasonable boundary — no action needed unless scope changes.

### 3.4 Single process, no horizontal scale *(known, documented)*

Fine for the stated scope. Under Option C it actually gets easier, because the server
becomes stateless-ish coordination rather than a machine holding working directories.

### 3.5 The GitHub PR path has never run against live GitHub *(open)*

Commit + push to a local bare remote is tested. `POST /repos/{owner}/{repo}/pulls` is
implemented and unexercised. Either test it once against a throwaway repo, or keep saying
so plainly.

### 3.6 No rate limiting *(open)*

Nothing bounds session creation or instruction volume. Matters the moment the server is
publicly reachable.

### 3.7 The unanswered product question

Is *watching an agent work for twenty minutes, together* something teams actually want to
do — or do they want the result? Have a real answer. The strongest use cases are probably:
- reviewing agent output **before** it lands, as a group
- pair-debugging something gnarly where one person has context and another has the repo
- onboarding — watching a senior drive
- incident response

And be ready for the obvious objection: **"why not just screen share?"** The answer needs
to be crisp: hand-off without giving up your screen, each viewer scrolls independently,
late joiners get full history, output is selectable text rather than a video stream, and
the artifact is a real diff you can publish rather than a recording.

---

## 4. What actually makes it pitch-worthy

In priority order. Note that none of these are "more features."

1. **Decide the scope question in §2 and rewrite the pitch around it.** Right now the
   README implies a hosted product while the code assumes a self-hosted one. That
   incoherence is the single biggest weakness, and it is free to fix.
2. **A live link.** Even mock-only. The gap between "a repo" and "a link someone clicks"
   is larger than any remaining feature gap. Server needs real WebSocket support —
   Railway / Render / Fly, **not** Vercel for the server process.
3. **A 60–90 second recorded walkthrough.** Two windows side by side, showing a hand-off
   mid-run. That single clip communicates more than the entire README.
4. **Correct the isolation wording** (§3.1). Credibility.
5. **A small real test suite + CI badge** (§3.2).
6. Only then: more features.

---

## 5. Recommended next session

Suggested order for a fresh chat:

1. Decide **Option A or Option C** (§2). This gates everything else. Option A is a
   documentation change; Option C is an architecture change with a much stronger story.
2. Fix the isolation wording in `README.md` + `interview+fundamentals/03-auth-and-security.md`
   (§3.1), and decide what to do with `test.md`.
3. Commit the pending redesign (see the suggested commit sequence in `REDESIGN_PLAN.md`).
4. Then either deploy (Option A) or start the agent/server split (Option C).

## 6. Repo orientation for a fresh session

| Path | What it is |
|---|---|
| `README.md` | Public-facing. Currently implies hosted; see §2. |
| `PRODUCT.md` / `DESIGN.md` | Product intent and the visual system (design is current). |
| `REDESIGN_PLAN.md` | The black-theme redesign plan; phases 1–6 are implemented but uncommitted. |
| `interview+fundamentals/` | Interview Q&A grounded in real code. `03-auth-and-security.md` needs the §3.1 correction. |
| `RELAY_PRODUCTION_PLAN.md` | Older production audit; several findings since fixed. |
| `packages/shared/src/protocol.ts` | The WS contract both sides compile against. |
| `packages/server/src/ws.ts` | Message handling, driver lock enforcement, join/reconnect. |
| `packages/server/src/repo.ts` | Cloning, the per-directory git lock, publish. **Moves under Option C.** |
| `packages/server/src/agent.ts` | Agent SDK wrapper. **Moves under Option C.** |
| `packages/web/lib/useSession.ts` | The client hook — WS, reconnect, derived state. |

**Conventions that matter:** the mock agent is the default and should stay that way (free,
offline, and how the UI is developed). Verify against isolated scratch servers on
non-default ports, never the user's live `:3000`/`:4000`. Contrast must be *measured*
(canvas pixel readback), never estimated. Nothing is committed unless the user asks.
