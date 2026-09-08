# Project Overview — Relay

How to talk about this project in 30 seconds, 2 minutes, and 10 minutes.

---

## The 30-second pitch

> "Relay is a tool for watching a coding AI agent work live, with other people, instead of
> alone. Claude Code and similar tools are single-player — if an agent runs for twenty
> minutes, nobody else can watch it happen or take over. Relay makes a session a shared
> room: everyone with the link sees the same stream in real time, and exactly one person
> can drive at a time, with control handed off cleanly. The hard part isn't the AI — it's
> the multiplayer: keeping everyone's screen showing the same thing in the same order, and
> making sure only one person can send commands even if someone tries to cheat."

---

## What it's built with, and why

| Layer | Tech | Why |
|---|---|---|
| Agent engine | `@anthropic-ai/claude-agent-sdk` | Same engine Claude Code runs — I didn't build a model, I built the room around one |
| Server | Node `http` + `ws` (raw WebSocket, no Socket.IO) | Simple, no framework magic hiding what's actually going over the wire — I needed full control of ordering |
| Client | Next.js 16 App Router, React, Tailwind v4 | Standard modern stack; the interesting parts are in the hooks and protocol, not the framework |
| Persistence | Postgres via Prisma 7 | An audit mirror of the transcript, not the source of truth — see `05-database-and-persistence.md` |
| Monorepo | pnpm workspaces, 4 packages | `shared` (protocol types every side compiles against), `server`, `agent` (the `relayrun` CLI), `web` |

## Why raw `ws` instead of Socket.IO / a framework?

Because the entire value proposition is "everyone sees the same thing in the same order,
and the server is the referee." A framework that adds its own retry/ack/room semantics on
top would hide exactly the mechanism I needed to reason about and demonstrate I understand.
Raw WebSocket + a typed message protocol (`packages/shared/src/protocol.ts`) means every
message on the wire is something I designed on purpose.

## The one-sentence differentiator — there are two, and they answer different questions

**On trust:** *"The server never sees your repo, your shell, or your credentials — the
agent runs on your own machine, and the server only relays messages between you and
whoever's watching."* This is why the project is named **Relay** and not, say, "Shared
Session." The obvious build puts the agent on a server; that means everyone using the
product has to grant a machine they don't control unrestricted shell access to their code,
which no team reasonably accepts. So the agent lives in the `relayrun` CLI, which runs
locally and connects **out** to the server — see `10-agent-cli-architecture.md`.

**On correctness:** *"A non-driver's instruction is rejected on the server, not just
hidden by a disabled button in the UI."* Anyone can hide a send button. The real question
is what happens if someone opens dev tools and sends the WebSocket frame directly. In
Relay, the server checks `participant.id !== session.driverId` before it does anything —
see `packages/server/src/ws.ts`, the `instruct` case. The UI restriction is a courtesy;
the server check is the actual boundary.

Lead with the trust one if asked "what's the interesting part" — it's the product
decision. Lead with the driver-lock one if asked "what's the security boundary" — it's
the implementation detail that proves the first claim isn't just marketing.

## The architecture, in one diagram

```
Browser A ──┐                                    ┌── Browser B (watching)
            │        WebSocket (one per tab)      │
            ▼                                     ▼
     ┌──────────────────────────────────────────────────┐
     │  Coordination server (packages/server)            │
     │  - one Session object per session, held in memory │
     │  - session.events[] — the ordered transcript       │
     │  - session.driverId — who can send instructions    │
     │  - session.runnerSocket — the CLI attached to this │
     │    session, if any. No repo, no shell, ever.       │
     └──────────────────┬─────────────────────────────────┘
                         │ WebSocket, opened OUTBOUND by the CLI
                         ▼
     ┌──────────────────────────────────────────────────┐
     │  relayrun CLI (packages/agent) — runs on the      │
     │  operator's own machine, not the server           │
     └──────────────────┬─────────────────────────────────┘
                         │ query() calls
                         ▼
              @anthropic-ai/claude-agent-sdk
                         │
                         ▼
        a throwaway git clone of the operator's repo,
        also on the operator's own machine
```

Every event the agent produces (a tool call, a result, a plan update) gets a
server-assigned sequence number and is broadcast to every connected socket in that
session. Nobody's browser decides order — the server does, once, in one function. The
server assigns order without ever seeing the code that produced the event.

## If they ask "walk me through a request end to end"

1. Browser sends `{ type: "instruct", text: "..." }` over the WebSocket.
2. Server checks: is this socket's participant the current driver? If not, reject —
   `ws.ts`, `case "instruct"`.
3. Server validates the text (length, not empty) — `validate.ts`.
4. Server checks a runner is actually attached to this session (`session.runnerSocket`).
   If nobody's run `relayrun` in the repo yet, it rejects with a clear message instead of
   queueing the instruction into a void.
5. Server appends the instruction to the transcript with the next `seq`, broadcasts it to
   the room immediately, and forwards it down the runner socket — the outbound connection
   the CLI opened when it started.
6. The CLI, running on the operator's own machine, receives it and calls the Agent SDK's
   `query()` locally. The server is never in this call at all.
7. Each SDK message (a tool call, a tool result, prose) travels back up that same socket
   to the server, which stamps it with the next `seq` and broadcasts it to every browser
   in the room — same mechanism as step 5, just going the other direction.
8. Every browser's `useSession` hook just appends incoming events to an array in order.
   No sorting, no merging, no guessing — the array IS the order because the server
   already decided it.

## What I'd say if asked "what's the weakest part of this project"

Be honest, not defensive — this is answered fully in `06-system-design-tradeoffs.md`, but
the short version: it's a single Node process holding all session state in memory. It
doesn't survive a restart, and it doesn't horizontally scale. Those are boundaries I chose
deliberately for the scope of the project (a small trusted team, not a public SaaS), and I
can describe exactly what it would take to fix each one — which is a better answer than
pretending the project has no limits.
