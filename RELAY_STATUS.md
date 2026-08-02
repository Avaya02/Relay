# Relay — Build Status

> Companion to `RELAY_BUILD_SPEC.md`. This tracks what's actually been built,
> against the phase order in spec §9. Update this after each phase.

**Current state: Phase 0, 1, 2, and 3 complete and verified. Phase 4 not started.**

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
│  │  └─ ws.ts                     # connection handling, instruct guard, the lock itself
│  └─ web/
│     ├─ app/page.tsx              # real landing page: hero, "Start a session" → redirect
│     ├─ app/session/[id]/page.tsx # join gate, header, ControlBar, composer (driver-only)
│     ├─ app/globals.css           # §7 tokens, shadcn semantic roles mapped onto them
│     ├─ app/layout.tsx            # Geist Sans/Mono + Space Grotesk (display), `dark` on <html>
│     ├─ components/
│     │  ├─ Presence.tsx           # presence-color dots, driving indicator
│     │  ├─ StreamView.tsx         # event ledger (extracted from page.tsx, unchanged)
│     │  ├─ Composer.tsx           # instruction input — only rendered for the driver
│     │  ├─ ControlBar.tsx         # driver: hand-over list + release; viewer: request banner
│     │  └─ ui/                    # shadcn/ui primitives (button, input) — Radix base
│     ├─ lib/useSession.ts         # WS hook: connect, join, reduce server messages
│     └─ lib/api.ts                # createSession() — POST /sessions wrapper
```

Both dev servers run locally: server on `:4000`, web on `:3000`.
`pnpm dev` at the repo root starts both (or run each in its own terminal —
see "How to verify" below — to watch their logs separately).

## The protocol, as implemented

`packages/shared/src/protocol.ts` currently defines:

**Client → Server:** `join`, `instruct`, `ping`, `request_control`, `hand_over`, `release_control`
**Server → Client:** `joined`, `session_state`, `history`, `agent_event`, `status`, `participant_joined`, `participant_left`, `error`, `pong`, `control_changed`, `control_requested`

Everything the spec's protocol table names is now implemented. Two additions
beyond the literal table, both because the spec left a real gap:

- `joined { participantId }` (Phase 1) — the spec never says how a socket
  learns its own id; sent joiner-only, same pattern as `history`.
- **`request_control` auto-grants when nobody is driving** (Phase 3) — spec
  §6.4 says release leaves "nobody driving until someone requests *and is
  granted*," but doesn't say who grants it when there's no driver to ask. If
  `driverId` is already `null`, the server assigns the requester immediately
  instead of leaving the request stranded.

## What's proven to work

Verified by actually driving headless browser windows against the live app
(Playwright) through full multi-step scenarios, not just reading code:

- Landing page → real `POST /sessions` → shareable link → a second window
  joining that exact link sees the same live session, correct Presence
  colors, correct driving indicator.
- One participant's instruction streams live to all windows, identical
  order, correctly attributed; a late joiner still catches up via `history`.
- **The lock, full lifecycle in one run:** first joiner drives, second is a
  viewer with no composer at all (not just a disabled one) and a "*name* is
  driving · Request control" banner instead → clicking it flips to
  "Requested — waiting for *name*" → the driver sees that participant
  flagged "requesting control" in a live hand-over list → hand-over moves
  the lock, composer swaps sides on both windows instantly → **a raw
  WebSocket `instruct` sent directly by the now-ex-driver, bypassing the UI
  entirely, gets rejected server-side** (`"only the driver can send
  instructions"`) — proving the guard is real enforcement, not hidden UI →
  releasing drops to "Nobody's driving · Take control" → anyone can reclaim
  it → **closing the driver's tab outright also frees the lock** for
  whoever's left.
- Zero console errors through every scenario above.
- Holds up at a 375px viewport; keyboard focus rings are genuinely visible
  (see judgment calls below).

## Deliberately not built yet

Everything here is a named future phase, not an oversight:

- **No real agent.** `agent.ts` is a scripted mock — no
  `@anthropic-ai/claude-agent-sdk` import anywhere. Swapping it in is Phase 4.
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
- **No "cancel a pending request" affordance.** Once a viewer clicks
  Request control, the button just sits on "Requested — waiting" until the
  driver acts (or hands over to someone else, which clears it). Minor,
  didn't seem worth the complexity yet.
- **PRODUCT.md / DESIGN.md were not generated.** The `impeccable` design
  skill wants these as a prerequisite; I read its guidance directly instead
  and applied it, since `RELAY_BUILD_SPEC.md` already covers the same ground.

## How to verify it yourself right now

1. Two terminals: `cd packages/server && pnpm dev`, `cd packages/web && pnpm dev`
   (or `pnpm dev` at the root for both in one).
2. Open `http://localhost:3000` — click **Start a session**.
3. Copy the URL, open it in a second window (or incognito), join with a
   different name. The second window has no composer — just "*name* is
   driving · Request control."
4. Click that button in window 2 → window 1 shows them in a hand-over list
   with "requesting control." Click **Hand over** → control (and the
   composer) switches to window 2.
5. Try **Release** (either window, whoever's driving) → both show "Nobody's
   driving · Take control." Click it in either window to reclaim the lock.
6. Close the driver's tab entirely — the remaining window should drop to
   "Nobody's driving" on its own within a second.

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
- **shadcn/ui token collisions (Phase 2):** its init CLI silently overwrote
  my existing `--border` and `--accent` values with its own preset
  defaults, and generated a `.dark`-class-gated color scheme that would
  never have activated. Fixed by consolidating everything into one active
  `:root` block mapped onto the existing §7 tokens, with `dark` permanently
  on `<html>` (this app has exactly one theme, so that's honest, not a
  workaround).
- **Focus ring visibility (Phase 2, real bug not cosmetic):** the primary
  button's fill and its focus-ring color are both `--accent` per spec — a
  same-hue ring with no offset is nearly invisible against its own button.
  Confirmed via CDP style inspection that the ring was technically
  rendering but perceptually flat, fixed with a 4px `ring-offset`.
- **Hand-over isn't only a reply to a request (Phase 3):** the driver can
  hand control to any connected participant directly, not just one who
  asked — the spec's own copy list includes "Hand over to alex" as a
  standalone action, and a pending request just flags that same row rather
  than needing a separate mechanism.
- **`react-hooks/set-state-in-effect` (Phase 3):** the first cut of the
  "requested — waiting" reset used `useEffect` to clear local state when
  `driverId` changed — eslint's newer hooks rule flagged that as the wrong
  pattern. Fixed with a `key={driverId}` remount instead, which is the
  React-recommended way to reset state tied to a prop change.
- **AGENTS.md / CLAUDE.md** (generated by `create-next-app`, warning that
  Next 16.2.12 has moved past typical training knowledge) — kept them, and
  used the bundled docs at `packages/web/node_modules/next/dist/docs/` to
  confirm current App Router behavior throughout.

## Next up

Phase 4 (spec §9): swap the mock for the real Agent SDK. This is the first
phase that costs real API money and needs subscription auth — worth talking
through before I start (which auth path, whether to keep the mock behind a
flag for offline dev, what demo repo the agent should work against). Say the
word when you're ready.
