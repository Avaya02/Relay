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
| Monorepo | pnpm workspaces, 3 packages | `shared` (protocol types both sides compile against), `server`, `web` |

## Why raw `ws` instead of Socket.IO / a framework?

Because the entire value proposition is "everyone sees the same thing in the same order,
and the server is the referee." A framework that adds its own retry/ack/room semantics on
top would hide exactly the mechanism I needed to reason about and demonstrate I understand.
Raw WebSocket + a typed message protocol (`packages/shared/src/protocol.ts`) means every
message on the wire is something I designed on purpose.

## The one-sentence differentiator

**"A non-driver's instruction is rejected on the server, not just hidden by a disabled
button in the UI."** That's the sentence that separates this from a toy. Anyone can build
a UI that hides the send button for non-drivers. The real question is: what happens if
someone opens dev tools and sends the WebSocket frame directly? In Relay, the server checks
`participant.id !== session.driverId` before touching the transcript — see
`packages/server/src/ws.ts`, the `instruct` case. The UI restriction is a courtesy; the
server check is the actual security boundary.

## The architecture, in one diagram

```
Browser A ──┐                                    ┌── Browser B (watching)
            │        WebSocket (one per tab)      │
            ▼                                     ▼
     ┌──────────────────────────────────────────────────┐
     │  Node server (packages/server)                    │
     │  - one Session object per session, held in memory │
     │  - session.events[] — the ordered transcript       │
     │  - session.driverId — who can send instructions    │
     │  - session.workingDir — disposable git clone       │
     └──────────────────┬─────────────────────────────────┘
                         │ query() calls
                         ▼
              @anthropic-ai/claude-agent-sdk
                         │
                         ▼
              a throwaway git clone of your repo
```

Every event the agent produces (a tool call, a result, a plan update) gets a
server-assigned sequence number and is broadcast to every connected socket in that
session. Nobody's browser decides order — the server does, once, in one function.

## If they ask "walk me through a request end to end"

1. Browser sends `{ type: "instruct", text: "..." }` over the WebSocket.
2. Server checks: is this socket's participant the current driver? If not, reject —
   `ws.ts`, `case "instruct"`.
3. Server validates the text (length, not empty) — `validate.ts`.
4. Server appends a `user_instruction` event to `session.events` with the next `seq`
   number, and broadcasts it to everyone in the room immediately.
5. Server calls the Agent SDK's `query()` with the instruction, streaming its response.
6. Each SDK message (a tool call, a tool result, prose) gets turned into a Relay `Event`
   and broadcast the same way — appended with a `seq`, sent to every socket.
7. Every browser's `useSession` hook just appends incoming events to an array in order.
   No sorting, no merging, no guessing — the array IS the order because the server
   already decided it.

## What I'd say if asked "what's the weakest part of this project"

Be honest, not defensive — this is answered fully in `06-system-design-tradeoffs.md`, but
the short version: it's a single Node process holding all session state in memory. It
doesn't survive a restart, and it doesn't horizontally scale. Those are boundaries I chose
deliberately for the scope of the project (a small trusted team, not a public SaaS), and I
can describe exactly what it would take to fix each one — which is a better answer than
pretending the project has no limits.
