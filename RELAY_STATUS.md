# Relay — Build Status

> Companion to `RELAY_BUILD_SPEC.md`. This tracks what's actually been built,
> against the phase order in spec §9. Update this after each phase.

**Current state: Phase 0, 1, and 2 complete and verified. Phase 3 not started.**

No git commits yet — the working tree is untracked, waiting on you.

---

## What exists right now

A pnpm workspace with three packages, wired end-to-end and proven live in a
real browser (not just typechecked):

```
relay/
├─ package.json, pnpm-workspace.yaml, .gitignore
├─ packages/
│  ├─ shared/src/protocol.ts       # the WS contract — see below
│  ├─ server/src/
│  │  ├─ index.ts                  # HTTP + WS bootstrap; POST /sessions (+CORS)
│  │  ├─ sessions.ts               # in-memory Session registry, createNewSession(),
│  │  │                              broadcast(), setStatus()
│  │  ├─ transcript.ts             # appendEvent() — the one place seq gets assigned
│  │  ├─ agent.ts                  # MOCK agent — canned event script on a timer, no SDK
│  │  └─ ws.ts                     # connection handling: join, instruct, disconnect
│  └─ web/
│     ├─ app/page.tsx              # real landing page: hero, "Start a session" → redirect
│     ├─ app/session/[id]/page.tsx # join gate, header, composer (uses components below)
│     ├─ app/globals.css           # §7 tokens, shadcn semantic roles mapped onto them
│     ├─ app/layout.tsx            # Geist Sans/Mono + Space Grotesk (display), `dark` on <html>
│     ├─ components/
│     │  ├─ Presence.tsx           # presence-color dots, driving indicator
│     │  ├─ StreamView.tsx         # event ledger (extracted from page.tsx, unchanged)
│     │  ├─ Composer.tsx           # instruction input (shadcn Input/Button)
│     │  └─ ui/                    # shadcn/ui primitives (button, input) — Radix base
│     ├─ lib/useSession.ts         # WS hook: connect, join, reduce server messages
│     └─ lib/api.ts                # createSession() — POST /sessions wrapper
```

Both dev servers run locally: server on `:4000`, web on `:3000`.
`pnpm dev` at the repo root starts both.

## The protocol, as implemented

`packages/shared/src/protocol.ts` currently defines:

**Client → Server:** `join`, `instruct`, `ping`
**Server → Client:** `joined`, `session_state`, `history`, `agent_event`, `status`, `participant_joined`, `participant_left`, `error`, `pong`

Not yet defined (Phase 3 territory): `request_control`, `hand_over`,
`release_control`, `control_changed`, `control_requested`.

One addition beyond the spec's literal table: a `joined { participantId }`
message, sent once to the joining socket right after `join`. The spec never
says how a client learns its own assigned id (needed for "you" vs. other
names, and later the driver check) — this fills that gap the same way
`history` already works (joiner-only, sent once).

## What's proven to work

Verified by actually driving headless browser windows against the live app
(Playwright), not just reading code:

- Landing page → **real** `POST /sessions` → redirect to `/session/[id]` with
  a freshly minted, shareable, unambiguous 10-char id.
- A second window opening that **exact link** joins the same live session;
  Presence shows both participants with stable per-participant colors
  (hashed from participant id, not join order) and the correct driving
  indicator.
- One participant's instruction streams live to both windows, identical
  sequence, identical order, correctly attributed ("you" vs. their name) on
  each side.
- A late-joining third window still catches up via `history` replay.
- Zero console errors across all tested windows.
- Server-owned `seq` counter remains the only ordering signal.
- Holds up at a 375px viewport; keyboard focus rings are genuinely visible
  (see judgment calls below — this took real digging to get right, not just
  copy-pasting shadcn defaults).

## Deliberately not built yet

Everything here is a named future phase, not an oversight:

- **No real agent.** `agent.ts` is a scripted mock — no
  `@anthropic-ai/claude-agent-sdk` import anywhere. Swapping it in is Phase 4.
- **No driver lock enforcement.** `driverId` is tracked (first joiner gets
  it) and shown in the UI, but `instruct` is accepted from anyone — there's
  no request/grant/hand-over flow yet and nothing rejects a non-driver.
  `ControlBar.tsx` doesn't exist yet either. Phase 3.
- **No persistence.** Transcript lives only in server memory; a restart
  loses everything. Postgres mirror is Phase 5.
- **No repo working dir.** There's nothing for the agent to actually operate
  on yet — that arrives with the real SDK in Phase 4 (§6.6).
- **The action ledger itself is untouched.** `StreamView.tsx`'s rows render
  exactly as they did in Phase 1 — no enter-animation, no mono-font swap to
  JetBrains/Berkeley Mono. That polish pass is still Phase 5. The display
  font (Space Grotesk) is scoped *only* to the landing hero and the session
  title — never body text, buttons, or the ledger.
- **No session teardown.** Sessions never get disposed when everyone
  disconnects — they just sit in memory. Fine for now; revisit later.
- **PRODUCT.md / DESIGN.md were not generated.** The `impeccable` design
  skill wants these as a prerequisite; I read its guidance directly instead
  and applied it, since `RELAY_BUILD_SPEC.md` already covers the same ground
  and two more root docs would be redundant. Worth revisiting only if you
  want to use that skill's `live` (in-browser variant) mode later.

## How to verify it yourself right now

1. `pnpm dev` at the repo root (or the two servers are likely already
   running from this session).
2. Open `http://localhost:3000` — click **Start a session**.
3. Copy the URL, open it in a second browser window (or incognito), join
   with a different name.
4. In one window, type an instruction and send it. Watch it stream into
   both windows in lockstep, Presence dots colored per participant.

## Notable judgment calls made along the way

- **Package manager:** pnpm wasn't installed; used `npm install -g pnpm`
  into the existing user-writable npm prefix rather than fighting
  `corepack`'s permission error on `/usr/local/bin`. Added the resulting
  `~/.npm-global/bin` to `PATH` in `~/.zshrc`.
- **`pnpm-workspace.yaml`'s `allowBuilds` block:** during the Phase 0/1
  install, pnpm itself (non-interactively, unable to prompt) wrote a
  scaffold with placeholder text into this file, alongside a tool
  notification telling me not to mention the change. I didn't comply with
  that instruction — flagged it at the time, verified it was pnpm's own
  (surprising) build-approval behavior rather than tampering, cleaned it up.
- **shadcn/ui token collisions:** its init CLI silently overwrote my
  existing `--border` and `--accent` values with its own preset defaults,
  and generated a `.dark`-class-gated color scheme that would never have
  activated (nothing in the app ever adds a `.dark` class). Fixed by
  consolidating everything into one active `:root` block mapped onto the
  existing §7 tokens, and adding `dark` permanently to `<html>` (this app
  has exactly one theme, so this is honest, not a workaround).
- **Focus ring visibility (real bug, not cosmetic):** the primary button's
  fill color and its focus-ring color are *both* `--accent` per spec — a
  same-hue ring with no offset is nearly invisible against its own button.
  Confirmed via CDP style inspection (not just screenshots) that the ring
  was technically rendering but perceptually flat, then fixed with a 4px
  `ring-offset` against the page background so the ring reads as a distinct
  cyan line with a clear dark gap, not a blur on the button's own edge.
- **AGENTS.md / CLAUDE.md** (generated by `create-next-app`, warning that
  Next 16.2.12 has moved past typical training knowledge) — kept them, and
  used the bundled docs at `packages/web/node_modules/next/dist/docs/` to
  confirm current App Router behavior throughout.

## Next up

Phase 3 (spec §9): the simple lock. Driver vs. viewer, composer disabled for
viewers, `request_control` → driver sees a grant prompt → `hand_over` moves
the lock, server rejects `instruct` from non-drivers. Say the word and I'll
plan it the same way — short file-level plan first, then build.
