# Relay — Build Specification

> Hand this file to Claude Code as the source of truth for the build.
> Build **in the phase order given at the bottom**. Do not jump ahead or gold-plate.
> Where this spec says "verify against current docs," fetch the linked page and use the
> live API — this spec was written against the SDK as of mid-2026 and the surface moves.

---

## 0. What Relay is

Relay is a web app where **one live AI coding-agent session is shared by more than one person
at the same time**. One person starts a task; the agent works on a real repository; everyone
holding the session link watches every step stream in live, in the same moment. Exactly one
person is "driving" (allowed to send instructions to the agent) at a time; others watch and can
request to take over.

The closest thing that exists — Claude Code's own web session sharing — is **not live** (viewers
see a static snapshot that only updates on reload) and has **no way for a second person to
steer**. Relay's whole reason to exist is those two things: live streaming to multiple viewers,
and handing control between them.

### The one-sentence architecture
Two browsers → one WebSocket server → one Claude Agent SDK process working one repo on disk,
with every event broadcast to all browsers and the running transcript kept so late joiners catch up.

---

## 1. Scope of THIS build

**In scope (build all of this):**
- A landing page that starts a new session and a session page at `/session/[id]`.
- A WebSocket server that runs a **single shared agent per session** via the Claude Agent SDK.
- Live streaming of the agent's output (text + tool actions) to **every** connected browser.
- A **shareable session link** — a second browser opening it joins the *same* live session and
  **catches up on everything that already happened**, then sees new events live.
- **Simple single-driver control:** one lock per session. Only the current driver can send
  instructions. A viewer can **request control**; the driver can **hand it over**.
- One **preconfigured demo repository** the agent works on (you own it; it is not the user's code).
- Lightweight identity: a display name typed on join. **No accounts, no passwords, no signup.**

**Explicitly OUT of scope (do NOT build — note as future work only):**
- Free-for-all input (two people instructing the agent at once) and any conflict-resolution
  beyond the single lock.
- Per-session sandbox isolation / multi-tenant repo handling. One demo repo is fine.
- GitHub OAuth "connect your repo" flows. (A server-side push token is optional — see §6.6.)
- User auth, roles, permission scopes, billing, rate limiting.
- Swapping the agent's credentials mid-session when control changes hands.

Keep the surface small. The value is the live shared session + the lock, nothing more.

---

## 2. Tech stack

Use the **latest stable** version of each; do not pin to versions named here (pull current at build time).

| Layer | Choice | Notes |
|---|---|---|
| Monorepo | pnpm workspaces (or Turborepo) | Two packages: `web`, `server`. |
| Frontend | Next.js (App Router) + TypeScript | React 19-era. |
| Styling | Tailwind CSS | Dark theme by default — see §7. |
| UI components | shadcn/ui | Themed to the tokens in §7, not defaults. |
| Fonts | See §7 | A characterful display + clean body + a real mono. |
| WS client | native `WebSocket` | No heavy client lib needed. |
| Backend | Node.js + TypeScript | Long-running process (not serverless — the agent + WS need a persistent process). |
| WS server | `ws` | Plain, well-understood. |
| Agent engine | `@anthropic-ai/claude-agent-sdk` | The core. See §5. |
| DB | PostgreSQL + Prisma | Transcript persistence. See §6.5. |
| Ephemeral state | **In-memory (Map) for now** | Redis is **optional** and only needed if you run more than one server instance — do not add it yet. |
| Hosting | Frontend on Vercel; server on Railway/Render | But read §8 first — for the demo, running the server locally + a tunnel is the path of least resistance. |

---

## 3. Repo structure

```
relay/
├─ package.json                 # workspace root
├─ pnpm-workspace.yaml
├─ packages/
│  ├─ shared/
│  │  └─ src/protocol.ts        # WS message types — the contract between web & server (§4)
│  ├─ server/
│  │  ├─ src/
│  │  │  ├─ index.ts            # HTTP + WS bootstrap
│  │  │  ├─ sessions.ts         # in-memory session registry + lifecycle (§6.2)
│  │  │  ├─ agent.ts            # Agent SDK wrapper: run a task, yield events (§5)
│  │  │  ├─ ws.ts               # connection handling, join, broadcast, control (§6.3–6.4)
│  │  │  ├─ repo.ts             # clone/reset the demo repo working dir (§6.6)
│  │  │  ├─ transcript.ts       # in-memory event buffer + Postgres mirror (§6.5)
│  │  │  └─ db.ts               # Prisma client
│  │  └─ prisma/schema.prisma
│  └─ web/
│     ├─ app/
│     │  ├─ page.tsx            # landing: "Start a session"
│     │  └─ session/[id]/page.tsx
│     ├─ components/
│     │  ├─ StreamView.tsx      # the live agent feed (text + action ledger) (§7)
│     │  ├─ Composer.tsx        # instruction input; disabled unless you're driver
│     │  ├─ ControlBar.tsx      # who's driving, request/hand-over control
│     │  └─ Presence.tsx        # participants
│     └─ lib/useSession.ts      # WS connection hook: connect, join, dispatch events
```

Put the WS message types in `packages/shared` so **both** sides import the exact same
definitions. This one decision prevents a whole class of front/back drift bugs.

---

## 4. The WebSocket protocol (the contract)

Everything flows over one WS connection per browser. Messages are JSON `{ type, ...payload }`.
Define these in `packages/shared/src/protocol.ts` and import on both sides.

### Client → Server
| Type | Payload | Who | Meaning |
|---|---|---|---|
| `join` | `{ sessionId, displayName }` | anyone | Register this connection with a session. |
| `instruct` | `{ text }` | **driver only** | Send an instruction to the agent (start or continue the task). Server **rejects** if sender isn't the driver. |
| `request_control` | `{}` | viewer | Ask the current driver to hand over. |
| `hand_over` | `{ toParticipantId }` | **driver only** | Give the lock to a specific requester. |
| `release_control` | `{}` | driver | Drop the lock (nobody drives until someone requests + is granted, or the next joiner if none). |

### Server → Client
| Type | Payload | Sent to | Meaning |
|---|---|---|---|
| `session_state` | `{ participants[], driverId, status }` | the joiner + on every change | Full snapshot. `status`: `idle \| working \| done \| error`. |
| `history` | `{ events: Event[] }` | the joiner only | **Replay** of everything so far, so a late joiner catches up. Send once, right after `join`. |
| `agent_event` | `{ event: Event }` | **all** in session | One new live event (see event shape below). |
| `status` | `{ status }` | all | Agent went idle→working→done/error. |
| `control_changed` | `{ driverId }` | all | The lock moved. |
| `control_requested` | `{ participantId, displayName }` | current driver | Someone wants control (drives the "grant?" prompt). |
| `participant_joined` / `participant_left` | `{ participant }` | all | Presence updates. |
| `error` | `{ message }` | one client | e.g. a non-driver tried to `instruct`. |

### The `Event` shape (the transcript unit)
Every meaningful thing the agent does becomes one ordered `Event`. This is what gets streamed,
replayed, and persisted.

```ts
type Event = {
  seq: number;            // monotonic per session — the ordering guarantee
  ts: string;             // ISO timestamp
  kind:
    | "user_instruction"  // what a driver typed
    | "agent_text"        // assistant prose (may arrive in chunks — see note)
    | "tool_call"         // agent invoked a tool: { tool, summary, args? }
    | "tool_result"       // result of a tool: { tool, ok, summary }
    | "agent_done"        // task turn finished
    | "agent_error";
  by?: string;            // participantId, for user_instruction
  data: Record<string, unknown>;
};
```

**Ordering rule:** the server owns a per-session counter and stamps `seq` the instant an event is
created. Browsers render strictly in `seq` order. Never trust client timing. This is the single
most important correctness detail in the whole app — it's what makes two screens agree.

**Streaming note:** if you enable partial streaming (§5), `agent_text` may arrive as many small
deltas. Either (a) coalesce deltas server-side into one `agent_text` event per assistant message,
or (b) emit `agent_text_delta` events and let the client append. Start with (a) — simpler, fewer
events, still feels live because tool actions punctuate the stream.

---

## 5. The Agent engine (Claude Agent SDK)

**Package:** `@anthropic-ai/claude-agent-sdk`.
**Docs to read before writing this file (fetch them):**
- TS reference: `https://code.claude.com/docs/en/agent-sdk/typescript`
- Streaming output: `https://platform.claude.com/docs/en/agent-sdk/streaming-output`

### Core usage
The primary export is `query({ prompt, options })`, an **async generator** that runs the full
agent loop (model turn → tool calls → tool results → repeat) and yields `SDKMessage`s until a
final result message. Representative shape — **verify option names against the live docs**:

```ts
import { query } from "@anthropic-ai/claude-agent-sdk";

const q = query({
  prompt: instructionText,               // or an AsyncIterable for multi-turn steering (see below)
  options: {
    cwd: session.workingDir,             // the demo repo checkout on disk — the agent works HERE
    model: "claude-opus-4-6",            // pick a current model
    includePartialMessages: true,        // stream deltas as they generate (for live feel)
    // permissionMode: <the value that lets file-edit + bash run WITHOUT an interactive prompt>
    //   The agent runs headless on the server — there is no human to click "allow" per tool.
    //   Find the current option in the permissions docs and set it to auto-run tools.
    //   (Note: in a real product you'd constrain this hard. For one demo repo it's fine.)
  },
});

for await (const msg of q) {
  // Map each SDKMessage to one or more Relay Events, then:
  //   transcript.append(event)  →  broadcast agent_event to all clients
  // msg.type === "assistant"  → agent_text / tool_call events
  // partial "stream_event" msgs (SDKPartialAssistantMessage) → text deltas, if you use option (b)
  // msg.type === "result"     → agent_done (or agent_error)
}
```

### Mapping SDK messages → Relay Events
- Assistant text content → `agent_text` (coalesce partials into one event per message).
- A tool-use block (file edit, bash, etc.) → `tool_call` with a **human summary** you build,
  e.g. `edited src/App.tsx`, `ran npm test`. Don't dump raw args into the UI — summarize.
- The corresponding tool result → `tool_result` with `ok` + a short summary.
- Final result message → `agent_done`; an error → `agent_error`.

### Multi-turn steering (driver sends a follow-up mid-session)
For the driver to send additional instructions into the **same** ongoing session (not a brand-new
one each time), use the SDK's **streaming input** mode — pass an `AsyncIterable<SDKUserMessage>`
as `prompt` and push new user messages onto it when the driver types — **or** resume the prior
session by id on the next `query`. Both are documented; pick the streaming-input approach if you
can, it's the cleaner fit. If it fights you, ship sequential resumed queries first and improve later.

### Authentication + cost (read carefully)
- Authenticate the SDK with your **Claude subscription** (the Pro-plan login), **not** a
  pay-per-token API key.
- **Billing caveat — verify current terms:** how subscription SDK usage is metered changed during
  mid-2026 (at one point announced as drawing from a separate monthly Agent SDK credit pool
  distinct from interactive limits). **Check the current policy in your account before relying on
  it**, so there are no surprises. Don't hard-code assumptions about it.
- **Keep dev cost ~zero:** build the entire real-time layer against a **mock agent** first (§Phase
  order). Only connect the real SDK once streaming, sessions, and the lock all work against fakes.
  This is the single biggest cost- and time-saver in the build.

---

## 6. Backend guide (the important part)

The backend is a **single long-running Node process**. It is NOT serverless — the agent loop and
the WS connections both need a process that stays alive across a whole session.

### 6.1 Bootstrap (`index.ts`)
Start an HTTP server (Express or bare `http`) for two things: a tiny REST endpoint
`POST /sessions` that creates a session and returns its id, and the WS upgrade. Attach the `ws`
server to the same HTTP server.

### 6.2 Session registry + lifecycle (`sessions.ts`)
Hold sessions in an in-memory `Map<sessionId, Session>`. A `Session` holds:

```ts
type Session = {
  id: string;
  status: "idle" | "working" | "done" | "error";
  driverId: string | null;                 // the lock
  participants: Map<participantId, { displayName; socket }>;
  workingDir: string;                       // demo repo checkout for this session
  events: Event[];                          // in-memory transcript (for replay)
  seq: number;                              // monotonic counter
  agentAbort?: AbortController;             // to stop a run if needed
};
```

**Create** (`POST /sessions`): generate id → prepare the working dir (§6.6) → insert into the
Map → persist a `sessions` row (§6.5) → return `{ id }`. The web app then routes to
`/session/[id]` and opens the WS.

**First joiner becomes driver.** When someone `join`s a session that has `driverId === null`,
assign them the lock and broadcast `control_changed`.

**Teardown:** when the last participant disconnects, optionally keep the session briefly (so a
refresh rejoins) then dispose: reset/remove the working dir, keep the persisted transcript.

### 6.3 Connection handling + join (`ws.ts`)
On a new WS connection, wait for a `join`. On `join`:
1. Look up the session; reject with `error` if unknown.
2. Add the participant; assign driver if none.
3. Send that socket a **`history`** message = the full `events[]` so far (catch-up).
4. Send that socket a **`session_state`** snapshot.
5. Broadcast `participant_joined` + an updated `session_state` to everyone else.

**`broadcast(session, message)`** = iterate `session.participants` and `socket.send` to each. That
function is the heart of "live for everyone." Every `agent_event`, `status`, `control_changed`,
and presence change goes through it.

### 6.4 The control lock (`ws.ts`)
- `instruct`: **guard first** — if `sender.id !== session.driverId`, reply `error` and stop.
  Otherwise: append a `user_instruction` event (broadcast it), then feed the text to the agent
  (§5), setting `status = working` and broadcasting `status`.
- `request_control`: send `control_requested` to the **current driver only**.
- `hand_over { toParticipantId }`: only the driver may call it; set
  `driverId = toParticipantId`; broadcast `control_changed`.
- `release_control`: driver only; set `driverId = null` (or auto-assign the earliest requester if
  you want); broadcast `control_changed`.

That's the entire concurrency model: **one lock, server-enforced, one writer.** No races, because
only one participant is ever permitted to send input. Say exactly this if asked in an interview,
and name what the harder version (free-for-all input) would additionally require: total ordering
of competing instructions and a defined meaning for "interrupt the agent mid-tool-call."

### 6.5 Transcript: in-memory + Postgres (`transcript.ts`, `schema.prisma`)
- **Required:** the in-memory `events[]` per session — this is what powers `history` replay for
  late joiners. Without it, stages 1–4 don't actually work.
- **Recommended (can defer within this build):** mirror each event into Postgres so transcripts
  survive a server restart and can be reviewed later. This also gives you the "durable session
  transcript" talking point. If you're time-boxed, ship in-memory first, add the mirror right after.

Prisma schema:

```prisma
model Session {
  id        String   @id
  status    String
  driverId  String?
  createdAt DateTime @default(now())
  events    Event[]
}

model Event {
  id        String   @id @default(cuid())
  sessionId String
  seq       Int                       // per-session ordering
  ts        DateTime @default(now())
  kind      String
  by        String?
  data      Json
  session   Session  @relation(fields: [sessionId], references: [id])

  @@unique([sessionId, seq])          // enforce ordering integrity
  @@index([sessionId])
}
```

`append(sessionId, partialEvent)` should: take the session's next `seq`, build the full `Event`,
push to `events[]`, `broadcast` an `agent_event`, and (if enabled) write the Postgres row. One
function, called from everywhere an event is born.

### 6.6 The demo repo working dir (`repo.ts`)
- Keep **one pristine checkout** of the demo repo on the server, already `npm install`ed / built.
  Do **not** re-clone-and-reinstall per session — it's slow and wasteful.
- Per session, produce a working dir from the pristine copy. Simplest reliable approach: copy the
  folder (or `git clone` from a local bare mirror). Point the agent's `cwd` at it.
- **Reset between sessions** with `git reset --hard && git clean -fd` so each session starts clean.
- Note on repo size: the multi-GB number you see in a file manager is mostly `node_modules` and
  build output, which `.gitignore` excludes. What actually gets cloned is the tracked source —
  usually a small fraction of that. Rebuild `node_modules` once on the pristine copy, then reuse.
- **Optional — push to GitHub (§ out-of-scope-ish):** if you want the agent's changes to persist
  to the repo, store a GitHub **personal access token scoped to only the one demo repo** as a
  server-side env secret (never sent to the browser), and `commit && push` on demand or at session
  end. Scope it to that single repo — least privilege, small blast radius if leaked.

---

## 7. Frontend + design direction

**Brief:** a calm, focused control room for watching a mind work. The subject's world is
terminals, live presence, and the quiet tension of who's holding the wheel. Dark theme is a
**brief requirement** — honor it — but do not settle for the generic "near-black + one acid accent"
AI-default look. Spend the boldness in exactly one place (see Signature) and keep everything else
disciplined.

### Design tokens (implement these, not shadcn defaults)
- **Surface** — not pure black. A deep, slightly cool graphite base with two raised steps for
  layering:
  - `--bg`: `#0E1116` (base)
  - `--surface`: `#151A21` (cards, the stream pane)
  - `--surface-2`: `#1C232C` (raised: composer, control bar)
  - `--border`: `#232B35` (hairline separators — 1px, low contrast)
- **Text**
  - `--text`: `#E6EAF0` (primary)
  - `--text-dim`: `#8A94A6` (secondary, labels, timestamps)
- **Accent — reserved for "live / active / you-are-driving" only.** Pick one and use it sparingly:
  a signal cyan `--accent: #4DD0C7`. It marks *aliveness*, nothing decorative.
- **Presence colors** — a small fixed palette assigned per participant (for their name dot + cursor
  of who's driving), e.g. `#E5A3B3`, `#9BB4E0`, `#B9E0A5`, `#E0C48A`. Muted, not neon.
- **State tint** — `working` uses a subtle accent glow; `error` a restrained amber-red `#D98A6A`
  (not alarm-red).

### Typography
- **Display** (headline on the landing hero, session title): a characterful grotesque with
  personality — e.g. *Space Grotesk* or *Neue Haas*-like — used **big and rarely**.
- **Body / UI**: a clean, quiet sans — *Inter* is fine here since the personality lives elsewhere.
- **Mono**: a real monospace for **all agent tool output and the action ledger** — e.g. *JetBrains
  Mono* or *Berkeley Mono*-like. This is load-bearing: the agent's actions should *read like a
  terminal*, because that's the subject's native material.

### Layout
```
┌───────────────────────────────────────────────────────────┐
│  relay · session title            ● you · ● alex(driving)  │  ← Presence bar (top-right dots)
├───────────────────────────────────────────────────────────┤
│                                                           │
│   STREAM VIEW                                             │
│   ─ agent_text renders as quiet prose                    │
│   ─ tool_call / tool_result render as an ACTION LEDGER:  │
│       ▸ edited  src/App.tsx                    12:04:02   │
│       ▸ ran     npm test            ✓ passed   12:04:09   │
│   (mono, left rule, timestamps dim on the right)         │
│                                                           │
├───────────────────────────────────────────────────────────┤
│  [ Composer ]  ── enabled only if you're driving         │
│  else: "alex is driving · Request control"               │
└───────────────────────────────────────────────────────────┘
```

### Signature (the one memorable thing)
The **action ledger**: the agent's tool calls are not chat bubbles — they're a live,
monospaced, timestamped ledger with a thin left rule, like a flight recorder ticking in real time.
Text from the agent sits quietly *between* ledger entries. This is what makes Relay look like an
instrument rather than another chat app, and it's the same view two people are watching in sync —
so the "liveness" reads instantly. Give ledger entries a subtle enter animation (respect
`prefers-reduced-motion`); keep everything else still.

### Copy
Write controls by what the person does: **Start a session**, **Request control**, **Hand over to
alex**, **Release**. Empty session state is an invitation, not a mood: "Nothing running yet —
type an instruction to start." Errors state what happened and what to do, in the interface's voice.

### Quality floor
Responsive to a narrow viewport, visible keyboard focus rings (use the accent), reduced-motion
respected, and the driver/viewer state of the composer must be obvious at a glance (disabled +
the "request control" affordance).

---

## 8. Running it (deployment reality — read before deploying)

The frontend deploys fine to Vercel. The **server** must be a persistent process (Railway/Render),
not serverless. **But for the demo, the friction is the SDK's subscription auth on a remote host**
(the login credential lives on the machine where you logged in). Two honest paths:

1. **Local + tunnel (recommended for the demo):** run the server on your own machine where your
   subscription login already works, expose it with a tunnel (e.g. cloudflared / ngrok), and point
   the deployed frontend (or a second browser) at that URL. Zero credential-copying. Perfect for a
   recorded walkthrough or sending a friend a link during a live demo.
2. **Deploy the server** to Railway/Render and provision your logged-in SDK credential to it as a
   secret. Doable, but more setup and tokens can need refresh — only worth it if Relay needs to run
   unattended.

For a portfolio demo, do **path 1** first.

---

## 9. Build order (do these in sequence — each ends at something demoable)

**Phase 0 — Scaffold.** pnpm workspace; `web` and `server` boot; `shared/protocol.ts` stubbed.
Verify: both run, a health-check WS message round-trips.

**Phase 1 — Live broadcast against a MOCK agent (no SDK yet).** Sessions in memory; WS `join`;
a "mock agent" that, on `instruct`, emits a scripted series of `agent_event`s on a timer. Two
browser windows on the same session id both see the mock stream live, in order.
*This proves the entire real-time core with zero cost.* ✅ First real milestone.

**Phase 2 — Shareable sessions + catch-up.** `POST /sessions` + landing page. Session link.
A browser that opens the link **late** receives `history` and is caught up, then sees new events.
Presence bar shows who's connected. ✅ This alone already beats Claude Code's snapshot sharing.

**Phase 3 — The simple lock.** Driver vs viewer. Composer disabled for viewers. `request_control`
→ driver sees a grant prompt → `hand_over` moves the lock → `control_changed` updates everyone.
Server rejects `instruct` from non-drivers. ✅ Now it's genuinely multiplayer-with-handoff.

**Phase 4 — Swap the mock for the real Agent SDK.** Implement `agent.ts` against
`@anthropic-ai/claude-agent-sdk` (§5), pointed at the demo repo working dir, mapping SDK messages
to Relay Events. Subscription auth; verify current billing terms. Keep the mock behind a flag so
you can develop offline. ✅ Real agent, watched live by two people, steerable, with handoff.

**Phase 5 — Persist + polish.** Add the Postgres transcript mirror (§6.5). Apply the design tokens
and the action-ledger signature (§7). Tidy empty/error states. Record the walkthrough (Remotion
works well for this) — two windows, one live agent, a mid-task correction, a control hand-off.

Stop at the end of Phase 5. Everything past it (free-for-all input, sandboxing, GitHub OAuth,
auth) is future work you can *describe* but should not build for this deliverable.

---

## 10. Interview-ready summary of the hard parts (keep for later)

- **Ordering across clients:** one server-owned monotonic `seq` per session; clients render in
  `seq` order; client timing is never trusted. This is why two screens agree.
- **Catch-up:** late joiners get a full `history` replay before the live stream, so "join a session
  in progress" actually works.
- **Concurrency:** a single server-enforced lock = exactly one writer, so there are no input races
  by construction. The harder version (open input) would need total ordering of competing
  instructions and a defined semantics for interrupting the agent mid-tool-call — named, not built.
- **Headless agent autonomy:** the SDK runs with tool-permission prompts disabled because there's
  no human in the loop per tool — the exact autonomy you'd want to *constrain* in a real product,
  scoped safely here to one throwaway demo repo.
