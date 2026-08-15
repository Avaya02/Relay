# Relay — Production-Readiness Research Brief

> **Hand this to a fresh Claude Code session.** It is self-contained: it assumes
> no memory of prior conversations. Read `RELAY_BUILD_SPEC.md` (source of truth)
> and `RELAY_STATUS.md` (what's built) before starting.

---

## 0. Your task

**Research and produce a written plan. Do not write implementation code.**

The deliverable is a report I will review and approve *before* any building
starts. If you find yourself editing `packages/**`, you have gone too far — the
only file you should create is the report itself.

You may freely: read the codebase, run the app, drive it in a headless browser,
inspect network/WS traffic, fetch live documentation, check current library
versions, and prototype throwaway snippets in a scratch directory to verify a
claim. Verify things rather than asserting them from memory.

---

## 1. What Relay is

One live AI-coding-agent session shared by multiple people at once. One person
("the driver") sends instructions; everyone connected watches the agent work in
real time via a streamed "action ledger". Control can be requested and handed
over. The signature idea: **watching an agent work together, not sharing a
transcript afterward.**

Stack: pnpm workspace monorepo — `packages/shared` (WS protocol types),
`packages/server` (bare Node `http` + `ws`, no framework), `packages/web`
(Next.js App Router + Tailwind v4 + shadcn/ui). The agent is
`@anthropic-ai/claude-agent-sdk` driven from `packages/server/src/agent.ts`.

---

## 2. Verified current state (do not re-derive)

Phases 0–4 of `RELAY_BUILD_SPEC.md` §9 are complete and verified live in real
browsers. Phase 5 (persistence + design polish + recorded walkthrough) has not
started.

**Working today, proven end-to-end:**
- `POST /sessions` → shareable link → second browser joins the same live session
- Late joiners catch up via `history` replay, then stream live
- Server-owned monotonic `seq` per session guarantees identical ordering for all
  viewers
- Single-driver lock, server-enforced (a raw WS `instruct` sent from a non-driver
  bypassing the UI is correctly rejected)
- Request control → hand over → release → reclaim, all live across windows
- Driver disconnect frees the lock
- **The real Claude Agent SDK**, gated behind `RELAY_AGENT=real` in
  `packages/server/.env` (defaults to a scripted mock so nothing spends credit by
  accident). Verified: real multi-turn runs against a real repo, with `resume`
  carrying conversation context across instructions.
- Agent safety: the source repo is only ever a `git clone` **source**. The agent's
  `cwd` is always a disposable per-session clone under `packages/server/.sessions/<id>`,
  deleted on last disconnect. No code path points the agent at the source repo.

**Environment:** `packages/server/.env` holds `RELAY_AGENT`, `RELAY_MODEL`,
`RELAY_SOURCE_REPO`. Loaded via Node's built-in `process.loadEnvFile()`.
Auth uses the machine's existing `claude` CLI subscription login — **there is no
API key** anywhere in this project.

---

## 3. Known gaps — verified, do not spend time rediscovering

Confirmed by reading the code and driving the live app. Treat these as inputs,
and go find what *else* is wrong.

1. **Agent text renders as unformatted plain text.** `StreamView.tsx`'s
   `agent_text` branch is `<p>{String(event.data.text)}</p>`. Real agent output is
   markdown, so code fences, lists, and `**bold**` render as literal characters in
   a single run-on paragraph. Directory trees and code blocks are unreadable.
   **This is the most demo-blocking issue in the app.** It was invisible during
   Phases 1–3 because the mock only emitted short one-liners.
2. **Zero tests.** No test runner, no test files, nothing in CI. The entire
   verification story to date is manual browser driving.
3. **No persistence.** All sessions/transcripts live in server RAM. A server
   restart destroys every session; open tabs then hit a dead link. (Postgres
   mirror is Phase 5 per spec §6.5 — not yet built.)
4. **Localhost only.** Nothing is deployed or tunneled, so "share a link with
   someone" does not actually work off-machine yet. Spec §8 discusses this.
5. **Landing page ships a fake ledger preview.** `app/page.tsx` hardcodes
   `edited src/App.tsx` / `ran npm test — 4 passed` as static JSX to illustrate
   the product. It is not connected to anything.
6. **No cancel affordance for a pending control request.** Once a viewer clicks
   "Request control" the button sits on "Requested — waiting" until the driver
   acts.
7. **In-memory session records linger** after the last participant leaves
   (deliberate, so a refresh can rejoin) — but nothing ever reaps them.
8. **The action ledger has had no design pass.** It renders as it did in Phase 1:
   no enter animation, no `prefers-reduced-motion` handling, no considered mono
   font. Spec §7 calls the ledger the product's signature visual.
9. **No agent-run visibility beyond the ledger.** No token/cost surfacing, no
   elapsed time, no way to stop a running agent from the UI (the server *can*
   abort — `session.agentAbort` — but nothing exposes it).

---

## 4. Research areas

For each area: find what's missing or weak, research how it's done well, and
recommend a specific approach with a concrete rationale. Prefer evidence
(a doc, a version number, a measured result) over assertion.

### A. The action ledger — the signature surface
The one thing people will remember. Research:
- Markdown rendering for `agent_text`, including code blocks with syntax
  highlighting, inside a strict dark-token design system. Compare current options
  on bundle size, streaming-friendliness, and XSS safety. Name specific libraries
  at current versions.
- How tool calls/results should read at a glance. Grouping a call with its
  result, collapsed-by-default detail, failure states that explain *why*.
- Long-output handling: truncation, "show more", scroll anchoring that doesn't
  fight the user when they scroll up mid-run.
- Enter animation + `prefers-reduced-motion`, per spec §7.
- What a genuinely long real run looks like (30+ events) — go generate one and
  screenshot it rather than imagining it.

### B. Landing page
It must communicate a genuinely unusual idea in about five seconds. Research:
- How to show "multiple people watching one live agent" without a video.
  The current static fake-ledger snippet is a placeholder — is a live/animated
  demo ledger the right answer, or is that gimmicky?
- Whether an unauthenticated visitor should be able to watch a read-only demo
  session before starting their own.
- Copy, hierarchy, and the single CTA. Spec §7 has the design direction and
  §7's "Copy" subsection has voice guidance — follow it, don't invent a new voice.

### C. Session UX
- The join gate, empty states, error states, and reconnection. What happens today
  on flaky wifi? Test it (throttle/kill the socket) and report actual behavior.
- Presence: is a colored dot enough at 2 people? At 8?
- Driver/viewer clarity — can a viewer always tell why they can't type?
- Stopping a running agent; cancelling a control request; what a second
  instruction sent mid-run should do.
- Mobile/responsive reality check at real breakpoints.

### D. Functionality gaps that block a convincing demo
- Persistence (spec §6.5): what schema, what write path, and specifically what it
  buys — does a session survive a server restart, or is it only an audit mirror?
- Reconnect/resume after a dropped socket.
- Multi-repo or repo-selection: currently one repo per server process via env.
  Is per-session repo selection worth it, and what does it cost in safety?
- Surfacing agent cost/tokens/duration.
- Rate limiting or abuse control **if** this is ever publicly reachable.

### E. Production deployment
Spec §8 is the starting point and is honest about the hard part: **the Agent SDK
authenticates via a subscription login that lives on one machine**, and the server
must be a persistent process (not serverless) because it holds WebSockets and
in-memory state. Research:
- The tunnel path (cloudflared/ngrok) vs a real deploy (Railway/Render/Fly/VPS) —
  concrete steps, current pricing, and what breaks for each.
- How the SDK credential can legitimately be provisioned to a remote host, whether
  it expires, and what happens when it does. **Verify against current official
  docs — do not guess at auth mechanics.**
- Whether an API key is the honest answer for a deployed instance instead, and
  what that changes about cost.
- WebSocket support and idle timeouts on each candidate host.
- Frontend hosting + the `NEXT_PUBLIC_WS_URL` wiring for a non-localhost server.

### F. Quality floor
- A test strategy proportionate to a portfolio project — what's worth testing
  (the `seq` ordering guarantee, the lock's server-side enforcement, history
  replay) and what isn't. Name a runner and justify it.
- Structured server logging; what to do with unhandled agent errors.
- Accessibility pass on the real surfaces: focus order, live-region announcements
  for streaming events, contrast against the §7 tokens.
- CI worth having.

---

## 5. Constraints — these are binding

1. **`RELAY_BUILD_SPEC.md` is the source of truth.** Where this brief and the spec
   disagree, the spec wins; flag the conflict in your report.
2. **Follow spec §7's design direction exactly** — the dark tokens, the type
   pairing, the action-ledger-as-signature. Do not propose falling back to default
   shadcn styling or a generic dark-mode template.
3. **Use latest stable versions.** Check current versions at research time; do not
   trust versions named in the spec or in this brief.
4. **Where the spec says "verify against current docs" (§5), actually fetch the
   live docs.** The Agent SDK's API and the subscription/billing terms have both
   moved recently, and published docs have already been found to disagree with the
   shipped `.d.ts`. Prefer the installed package's own type definitions over any
   docs page.
5. **Never point the agent at a real user repo as a writable target.** The
   clone-and-dispose model in `repo.ts` is a safety property, not an
   implementation detail. Any proposal that weakens it must say so loudly.
6. **Do not weaken the driver lock.** It is enforced server-side by design.
7. **Ask rather than guess** on anything genuinely ambiguous.

---

## 6. The scope tension you must resolve, not silently decide

Spec §1 explicitly lists as **out of scope**: user auth, roles, permissions,
billing, rate limiting, per-session sandbox isolation, GitHub OAuth, and
free-for-all input. The spec also says to stop at the end of Phase 5.

"Production ready" and "pushed to production" pull directly against several of
those. **Do not resolve this on your own.** Instead:

- Split every recommendation into **(a) inside the spec's scope**, **(b) crosses
  an explicit out-of-scope line**, or **(c) genuinely new territory the spec
  doesn't address**.
- For each (b), state plainly what breaks without it if the app is publicly
  reachable — especially: anyone with a link can drive a real agent that executes
  shell commands on your server.
- Make a recommendation, but present it as a decision for me to make.

---

## 7. Deliverable

Write `RELAY_PRODUCTION_PLAN.md` at the repo root. Structure it as:

1. **Executive summary** — the 5 things that matter most, in priority order, and
   the single biggest risk.
2. **Findings by area** (A–F above). For each finding:
   - what's wrong or missing, with a `file:line` reference where applicable
   - what good looks like, with evidence (link, version, benchmark, screenshot)
   - recommended approach and why this one over the alternatives
   - **scope flag**: in-scope / crosses-out-of-scope / new territory
   - **effort**: S / M / L, and **demo impact**: high / medium / low
3. **A sequenced plan** — phased like spec §9, each phase ending at something
   demoable. Say explicitly what to do *first* if only one day is available.
4. **Open decisions for me**, with your recommendation on each.
5. **Explicitly not recommended** — things you considered and rejected, with the
   reason. This section is required; it's how I'll know the search was real.

Be blunt about weaknesses. A report that says everything is nearly fine is a
failed report — and equally, don't invent problems to look thorough. If something
is genuinely solid, say so and move on.
