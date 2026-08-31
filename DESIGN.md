# Design

Visual system for Relay. Source of truth for tokens is
[`packages/web/app/globals.css`](packages/web/app/globals.css); this document explains
the intent behind them. Where this and `RELAY_BUILD_SPEC.md` §7 disagree, the spec wins.

## Theme

**Dark only, no toggle.** This is a deliberate commitment, not a default. The scene:
two or three engineers on a call at 9pm, one driving, watching an agent work through a
migration — the same lighting condition as the terminal and editor already open on
their screens. A light theme would be the odd window out. `dark` sits permanently on
`<html>`; there is exactly one theme, which is honest rather than a workaround.

The ground is **pure black**, with two barely-raised steps for layering. Depth comes
from hairline rules and a lit border edge — never from shadows or glow. The earlier
palette used a cool graphite base to avoid the near-black + acid-accent AI default; the
answer to that risk turned out to be *restraint with the accent*, not a compromised
black. Structure carries the design now, so the ground can commit.

Text is near-white (`#F4F5F7`) rather than `#FFF`: pure white on pure black halates on
OLED and makes a long transcript tiring to read.

## Color

Tokens as implemented, with measured contrast against their usual backgrounds.

### Surfaces

| Token | Value | Role |
|---|---|---|
| `--bg` | `#000000` | Page base |
| `--surface` | `#0A0B0D` | Stream pane, header, rails |
| `--surface-2` | `#131519` | Raised: composer, control bar, code blocks |
| `--border` | `#1E2024` | Hairline separators — 1px, low contrast, never decorative |
| `--border-lit` | `#2C2F35` | Frame edges and focus. The only "elevation" in the system |

### Text

| Token | Value | On `--surface` | On `--surface-2` |
|---|---|---|---|
| `--text` | `#F4F5F7` | 18.05:1 | 16.75:1 |
| `--text-dim` | `#8C9098` | 6.15:1 | 5.71:1 |
| `--text-faint` | `#7B8088` | 4.96:1 | 4.60:1 |

All three clear WCAG AA for normal text (4.5:1) at every pairing used in the app,
including the ledger's 12px mono rows.

`--text-faint` is the one that had to be solved for rather than chosen. The intuitive
value (`#70747C`) measured **3.90:1 on `--surface-2`** — under the floor. It was
lightened until the *worst* of the three grounds cleared it, not the best.

The same trap caught the recessed plan rows: `color-mix(… --text-dim 85%, --bg)`
measured 4.9:1 against the old graphite and **4.38:1** once `--bg` became pure black,
because mixing toward a darker ground darkens the result. Re-solved to 90%. Any token
change to a background needs every `color-mix` that references it re-measured.

### Signal

| Token | Value | Role |
|---|---|---|
| `--accent` | `#4DD0C7` | **Reserved for live / active / you-are-driving.** Signal cyan, 10.47:1 on `--surface`. Never decorative. |
| `--state-ok` | `#5FD68A` | Completed. Outcome, not liveness — a finished run is green, a running one is cyan. |
| `--state-warn` | `#E0B155` | Pending / queued. |
| `--state-error` | `#E0715A` | Restrained amber-red. Failure states, disconnection. Deliberately *not* alarm-red — a failed tool call is a normal part of agent work, not an emergency. |

**On accent discipline.** Moving to a black ground made the accent roughly twice as loud
for the same value, and three places that had quietly become decorative had to give it
up: the demo's Send button (a control, always present), the lock section's definition
terms (headings), and any filled-cyan button. Cyan now appears only on: the live badge
dot, the driving indicator, a hand-over, and the hero's one emphasized word. If it's on
screen and it isn't happening *now*, it shouldn't be cyan.

### Presence

A small fixed palette assigned per participant by hashing their id, so nobody's dot
changes color because someone else disconnected. Muted, not neon — presence is
ambient information, not an alert.

`--presence-1` `#E5A3B3` · `--presence-2` `#9BB4E0` · `--presence-3` `#B9E0A5` · `--presence-4` `#E0C48A`

### Color strategy

**Restrained.** Tinted neutrals carry the surface; accent appears on well under 10% of
pixels. The ledger is almost entirely `--text-dim` and `--text`, with color used only
where it carries meaning: accent for liveness, error for failure, presence hues for
identity, and diff green/red inside expanded diffs.

## Typography

Paired on a genuine contrast axis, not two similar sans faces.

| Role | Family | Usage |
|---|---|---|
| Display | **Archivo** (`--font-display`) | Landing hero, section titles, the `relay` wordmark. Big and rare. Never body, buttons, labels, or data. |
| Body / UI | **Geist Sans** (`--font-geist-sans`) | All prose, controls, labels. Quiet by design — the personality lives elsewhere. |
| Mono | **JetBrains Mono** (`--font-mono`) | **Load-bearing.** All agent tool output, the action ledger, timestamps, session ids, diffs. The agent's actions should read like a terminal, because that is the subject's native material. Ligatures are **disabled** in the ledger — `=>` must render as `=>`, not `⇒`, because that surface is a record of what the code actually contains. |

**On the display face.** `RELAY_BUILD_SPEC.md` §7 asks for "a characterful grotesque with
personality" and names Space Grotesk as an *example*. Archivo satisfies that direction from a
different starting point: it descends from grotesques cut for print signage and wayfinding,
which is the right physical reference for an instrument — a cockpit placard, not a startup
wordmark. Space Grotesk is also among the most over-reached-for display faces in generated
design work; avoiding it is the point, not a deviation from the spec.

The mono face is the one that matters. It is not a stylistic choice — it is what makes
the ledger legible as a machine record rather than as prose.

## The action ledger — signature surface

The one memorable thing. Design rules, in priority order:

1. **One row per action.** A tool call and its result are a single row, not two. The
   call renders immediately in a pending state; the result folds into the same row when
   it arrives. A 32-event run reads as ~13 rows, not 26.
2. **One continuous left rule.** A single 1px `--border` line runs down the ledger,
   with rows hanging off it. Not a per-row `border-left` — that renders as a dashed
   ladder of stubs and breaks the flight-recorder read. (Per the skill's absolute bans,
   a >1px colored side-stripe is never the answer here either.)
3. **Fixed columns.** Verb, target, result, timestamp. Monospaced and aligned so the
   eye can scan a column rather than parse each line.
4. **Timestamps are dim and right-aligned.** Present, never competing.
5. **Detail is collapsed by default.** Rows with more to show (a diff, long output, a
   failure reason) carry a disclosure affordance and expand in place. Nothing is
   truncated with an ellipsis that loses information — it's either summarized honestly
   or available on expand.
6. **Agent prose sits quietly between entries.** Rendered markdown, body face, not
   mono — it is the agent talking, not the agent acting. This is the one place the
   ledger relaxes.
7. **Failure explains itself.** `✗` plus the reason, in `--state-error`. Never a bare
   "failed".

### Motion

The ledger is the only animated surface in the app, and the animation has one job:
convey *liveness* — that this is happening now, not being replayed.

- New entries enter with a 140ms opacity + 4px translate-Y, `ease-out-quart`.
- **Only genuinely new entries animate.** History replay for a late joiner renders
  instantly — watching 200 rows animate in would be a stutter, not a signal.
- Under `prefers-reduced-motion: reduce`, entries appear with no transition at all.
  Nothing depends on motion to become visible.
- **One deliberate exception:** the status dot pulses (2s, opacity 1 → 0.35) while
  `status === "working"`, and the connection banner's dot pulses faster (1.4s) while
  reconnecting. The rule's purpose is that chrome must never *compete* with the ledger;
  a 6px dot does not, and it is the only thing answering "is this live right now",
  which PRODUCT.md principle 5 requires be answerable at a glance. Both are gated on
  `prefers-reduced-motion: no-preference`. Nothing else in the app moves.

## The plan strip — the ledger's counterpart

The ledger answers *what just happened*. The plan strip answers *where are we going,
and how far in*. A flight recorder and a flight plan; neither is much use alone once a
run passes a few minutes.

This matters more for Relay than for a single-player agent tool, and that difference is
the reason it exists. In Claude Code you are the driver and the plan is in your head. In
Relay **most people in the room are watching, not driving**, and a watcher cannot ask
"where are we?" without interrupting. The strip is what makes a twenty-minute run
legible to someone who joined at minute twelve.

Rules:

1. **It's derived, never stored.** The agent's `TodoWrite` calls carry the checklist as
   a `plan` tool-detail on the event; the client takes the newest one in the transcript.
   That's why it survives replay, reconnect, and late joins for free — no plan message,
   no server-side plan state, and no way for two viewers' plans to disagree.
2. **One row tall when closed.** Pips (one per step) + the step currently running + a
   count. It frames the ledger; it must never compete with it.
3. **The in-progress pip is the only other thing that moves.** Same 2s pulse as the
   status dot, same `prefers-reduced-motion` gate, same justification.
4. **Completed steps are struck through *and* dimmed** — never colour alone.
5. **Plan rows in the ledger are recessed.** The agent revises its checklist constantly;
   on a real run that's roughly a third of all rows. At full weight they crowd out the
   reads, edits and test runs that are the actual record, so they sit at a measured
   4.9:1 rather than the usual 15.7:1 target colour — present as timeline anchors
   ("it reached step 3 at 19:55:14"), not as work done.

### Turn dividers

A session is a conversation, but a six-turn one rendered as one continuous stream: your
instruction, forty rows, another instruction, forty more. The boundary was there and
invisible.

An instruction **is** the boundary, so it carries the marker: a labelled rule above it,
with the turn number sitting on the rule. The ledger's continuous left rule stays
continuous and the horizontal one crosses it, the way a marker crosses a timeline rather
than cutting it.

The count is derived in `buildRows` from the `user_instruction` events themselves, never
stored. Same reason as the plan strip: a late joiner replaying `history` counts to the
same number from the same events. The first instruction gets no rule and no label —
there is nothing above it to be separated from, and a divider there would be decoration.

### Long agent replies

A single reply can be a 130-line file listing. Rendered whole it pushes every row off
screen and the flight-recorder read is gone — the exact failure "optimize for the
fiftieth event" is about. Replies past ~14 lines clamp to a fixed height with a
mask-fade and a `Show all N lines` toggle. The decision is made from the text during
render, not by measuring the node in an effect, so an append-heavy surface stays cheap.

### Session economics

Each `agent_done` already carried `steps · duration · cost`; nothing summed them, so a
six-turn session showed six separate prices and no total. The header now carries the
cumulative figure, derived from the same events. Per-run detail stays on the capstone
row — the two answer different questions and both are worth having.

## The workspace rail — what the session did to the repo

The ledger says a file was written. The rail says *which files stand changed right now,
by how much, and what the change was*. Before it existed that question had one answer: a
collapsed bar under the ledger that only appeared once a turn finished, held the entire
patch in a single `<pre>`, and was easy to never notice.

Rules:

1. **Two sources, one list.** Live rows come from the transcript — every `Write`/`Edit`
   the ledger has seen — and appear the instant the agent writes. Measured rows come
   from `git diff --numstat` when a turn settles and supersede them with real counts,
   real A/M/D status, and a per-file patch. Deriving the live half from events rather
   than tracking it separately is the plan strip's trick again: it makes the rail
   correct for a late joiner and after a reconnect with no extra protocol.
2. **Never claim a number you haven't measured.** While every row is a live guess the
   summary shows a file count and nothing else. `+0 −0` mid-run reads as "no changes",
   which is the opposite of what's happening. Publish is hidden for the same reason —
   there is nothing measured to publish yet.
3. **Status is a letter, then a tone.** `A` / `M` / `D` carry the meaning; colour only
   reinforces it. Same rule as the ledger's `✓`/`✗` and the plan strip's strikethrough.
4. **Only measured rows are expandable.** A file with no patch yet is a plain row, not a
   button that does nothing — a dead affordance is worse than none.
5. **Path order, always.** Recency would be more useful for about a second, then
   reshuffle the list under the reader's cursor every time a row gets measured.
6. **Directory dim, filename bright,** and the directory truncates from the *right*.
   The usual left-truncation trick (`direction: rtl`) silently reorders the trailing
   separator, so `docs/` paints as `/docs` and the row reads `/docssession-log.md`. DOM
   text order stays correct while this happens, which means a test that reads
   `innerText` will pass — it was caught in a screenshot, not an assertion.

## The sessions rail — the way back

Relay has no accounts and shouldn't (`PRODUCT.md`: a link shared with people you're already
talking to). That decision had a consequence nobody chose: close the tab and the session
was gone unless you'd saved the URL somewhere.

`localStorage` is the honest fix for that exact shape of problem — per-browser, no
server-side identity, and it stores only what the person already knows: sessions they
personally joined. It is not sync and doesn't pretend to be; another device shows a
different list, which is correct for something with no account behind it.

Rules:

1. **A list, not a tree.** Flat, reverse-chronological, three date buckets (Today /
   Yesterday / Earlier). The question is "what was I just in?", and a calendar answers a
   question nobody asked.
2. **The current session is marked, never filtered out.** A list that hides where you are
   makes you count rows to work out where you are. Accent left border plus the word `here`.
3. **Two sessions on one repo is the normal case,** so rows carry a short id when they
   aren't the current one — labelled only by repo they're indistinguishable. `here` and the
   id are mutually exclusive; both at once is clutter.
4. **Subtitles are built from what's known.** No files and no runs means neither is shown.
   "0 files" is noise dressed as information.
5. **It's the first column to go.** Below 1100px the rail hides — the stream is the
   product, and this is navigation reachable from the wordmark.
6. **Forget removes the bookmark, not the session.** The link keeps working for anyone who
   has it, and the control says so rather than reading as a delete.

## The agent chip — what's running, and on whose money

The mock agent is the default, and it was indistinguishable from a real one: a visitor
watched a convincing run with no way to know no model was involved. On a shared instance
the opposite question matters more — if this *is* real, someone is being billed, and the
room should be able to see who.

So the chip is always present and says one of three things: `Demo`, `Live`, or
`Live ··4f2a` when someone here supplied a key.

Rules:

1. **Accent only when it carries live state.** The dot is `--text-dim` in demo and
   `--accent` when a real agent is in play — the same rule the status dot and presence list
   follow. A scripted run is not live state.
2. **Four characters, never the key.** The key does not reach the browser at all; the
   server sends a hint and a name. The panel says so, because a person pasting a
   credential deserves to be told what happens to it.
3. **The whole room sees it, not just the driver.** Whose account is paying for the run
   you're watching is the room's business.
4. **The locked case is explained, not hidden.** Where a deployment doesn't accept keys,
   the panel says why: the agent has shell access inside its clone, so letting strangers
   drive a real one is a sandboxing problem rather than a billing one. The reason is more
   interesting than the feature would have been.

## Landing page (brand register)

The one surface where design *is* the product. Different register from the app, same identity.

**Named aesthetic lane: instrumentation.** Cockpit placards, oscilloscope faceplates, a
recorder running. Explicitly *not* editorial-typographic (display serif + italic + ruled
columns + mono metadata), which is the currently-saturated lane for tools in this category,
and not Stripe-minimal or acid-maximalism.

**The demo is the argument.** The hero's right-hand pane replays a **real captured
transcript** — a trimmed, verbatim excerpt of an actual Relay run (13 tool calls, 46s). It
renders the app's own ledger components, not a mockup, and it's labelled as a recording. It
replaces a hardcoded fake ledger that illustrated nothing.

Three reasons a replay beats a screenshot here:
1. Relay's claim is **temporal** — "the same session, the same moment, for everyone." A still
   image cannot express that.
2. It shows the **lock** rather than describing it: you watch as the *viewer*, the composer
   isn't yours, and then control hands over to you mid-run.
3. It is real. Nothing on the page is invented.

The replay is an enhancement over a complete default — the full transcript renders on first
paint and under `prefers-reduced-motion: reduce`, so nothing depends on JS or motion to be
visible.

**Composition.** One shared measure (`--measure: 84rem`) and gutter, so the nav mark, hero
headline, every section title, and the footer sit on the same left edge. The hero is
deliberately asymmetric (5fr copy / 7fr session) because the session carries the argument.
Color strategy stays Restrained, but the accent carries considerably more here than in the
app — "live" is the entire pitch.

## Layout (session view)

```
┌──────────────────────────────────────────┬────────────────┐
│ relay · repo · id   status ● you · ● alex │                │  header, --surface
├──────────────────────────────────────────┤  WORKSPACE     │
│ ▸ Plan ●●○○  running the test suite  2/4 │  3 files +11 −0│  plan strip
├──────────────────────────────────────────┤                │
│                                          │  A docs/log.md │
│  ACTION LEDGER (scrolls)          --bg   │  M README.md   │
│  │ ▸ read   README.md   ✓ 100 lines      │  A NOTES.md    │
│  │ ▸ edit   src/App.tsx ✓ +12 −3  ⌄      │    turn 1      │
│  agent prose renders here as markdown    │                │
│                                          │                │
├──────────────────────────────────────────┤                │
│  ControlBar — request / hand over        │                │
├──────────────────────────────────────────┤────────────────┤
│  Composer — driver only                  │ [Publish]      │
└──────────────────────────────────────────┴────────────────┘
```

Two columns: the stream, and what the stream did to the repo. The left column keeps its
original shape — fixed chrome bands around one scrolling pane. Responsive down to 375px;
below 900px the rail drops underneath as a capped panel, and the presence list and
control bar collapse rather than wrap.

The rail is **not** the file tree the anti-references rule out. A tree is for *browsing a
codebase*; this lists only what this session changed, and it's empty until the agent
writes something. The distinction is the one `PRODUCT.md` draws — Relay is a surface for
watching and steering, and borrowing IDE chrome would promise an editor it isn't.

## Components

Built on shadcn/ui primitives (Radix base), themed onto the tokens above rather than
left at shadcn defaults. `--primary` maps to `--accent`, `--background`/`--foreground`
to `--bg`/`--text`, and so on, so a stock shadcn component lands on-brand without
per-instance overrides.

| Component | Notes |
|---|---|
| `StreamView` | The ledger. See rules above. Takes an `emptyHint` from the caller, because only the caller knows whether the viewer can actually act on it. |
| `Composer` | Driver only — rendered, not merely disabled, so its absence is the signal. While a run is in flight the primary action reads **Queue**, not Send, because the server queues rather than interrupts. |
| `ControlBar` | Driving state + hand-over. Pending requesters are promoted to their own row; everyone else lives behind the hand-over menu. |
| `Presence` | Hashed presence-color dots, driving indicator. Overflows to `+N` past 4; the driver always sorts first so it survives both the cut and the mobile name-collapse. |

### Session chrome

Everything framing the ledger — header, status, presence, control bar, composer, join
gate, banners — shares one named CSS block (`.chrome-*`, `.status-*`, `.presence-*`,
`.control-*`, `.composer-*`, `.join-*`, `.banner-*`) in the same style as `.ledger-*`
and `.landing-*`. It was previously inline utility classes, and that split is exactly
why it drifted: an unstyled native `<select>` rendered as a light-mode macOS control
inside a dark instrument.

Rules that govern it:

- **Chrome never uses accent unless it carries live state.** Accent in the chrome means
  *working*, *you are driving*, or *someone is asking to drive*. Nothing decorative.
- **The hand-over control is a themed native `<select>`,** not a custom menu. Its popup
  can never be clipped by the scrolling ledger above it, and it is keyboard- and
  screen-reader-complete for free — product register's "don't reinvent standard
  affordances", applied by restyling one rather than replacing it.
- **Stop is quieter than Send.** Both were filled buttons of similar weight; the
  destructive action competed with the primary one on every keystroke.
- **Empty states are role-aware.** The ledger's empty state used to tell every viewer to
  "type an instruction to start" — including watchers with no composer to type into.
- **At ≤640px the presence list keeps dots and drops names,** except the driver's. Four
  participants plus a session id overflowed a 375px header and forced the document to
  scroll sideways.

Focus rings use `--accent` with a 4px `ring-offset` — without the offset, a same-hue
ring is perceptually invisible against an accent-filled button.

## Radius & spacing

`--radius` `0.625rem`, with a `sm`/`md`/`lg`/`xl` scale derived from it. Ledger rows
are square — radius is for containers (cards, inputs, buttons, code blocks), not for
records.
