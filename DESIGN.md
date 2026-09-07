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

The ground is `#0A0A0A`, with two barely-raised steps for layering. Depth comes from
hairline rules and a lit border edge — never from shadows or glow.

It was pure black for one iteration, on the belief that the visual reference committed to
black. Measuring that reference found `rgb(10,10,10)`, and the ramp moved to match. The
history is worth keeping because it is the same mistake twice: the first palette was a
cool graphite hedging against the near-black + acid-accent AI default, the second
over-corrected to `#000000` from a screenshot. Both were guesses at a value that could
have been read directly.

Text is `#FAFAFA` rather than `#FFF`: pure white on a near-black ground halates on OLED
and makes a long transcript tiring to read. The whole neutral ramp is achromatic — the
blue cast the earlier values carried was inherited from the graphite era and had no
reason to survive it.

## Color

Tokens as implemented, with measured contrast against their usual backgrounds.

### Surfaces

| Token | Value | Role |
|---|---|---|
| `--bg` | `#0A0A0A` | Page base |
| `--surface` | `#121212` | Stream pane, header, rails |
| `--surface-2` | `#1A1A1A` | Raised: composer, control bar, code blocks |
| `--border` | `rgba(250,250,250,0.12)` | Hairline separators — 1px, never decorative |
| `--border-lit` | `rgba(250,250,250,0.20)` | Frame edges and focus. The only "elevation" in the system |

The two border tokens are **alpha, not flat hex**. A hairline over a raised panel then
resolves brighter than the same rule over the ground (`#262626` / `#2D2D2D` / `#343434`
across the three surfaces), so structure stays legible as surfaces stack.

### Text

| Token | Value | On `--surface` | On `--surface-2` |
|---|---|---|---|
| `--text` | `#FAFAFA` | 17.95:1 | 16.67:1 |
| `--text-dim` | `#A3A3A3` | 7.43:1 | 6.90:1 |
| `--text-faint` | `#8A8A8A` | 5.43:1 | 5.04:1 |

All three clear WCAG AA for normal text (4.5:1) at every pairing used in the app,
including the ledger's 12px mono rows.

`--text-faint` is the one that has to be solved for rather than chosen, and it has now
failed twice. `#70747C` measured 3.90:1 on `--surface-2`; `#7B8088` then measured
**4.38:1** once the ground moved to `#1A1A1A`. The visual reference's own tertiary
(`#7C7C7C`) fails too — 4.49:1 on `--surface`, 4.17:1 on `--surface-2` — and survives
there only because that page uses it on the page ground alone, where Relay puts it on
raised panels. Solved against the *worst* ground: `#828282` is the bare 4.5:1 minimum and
`#8A8A8A` is that plus headroom.

The same trap caught the recessed plan rows: `color-mix(… --text-dim 85%, --bg)`
measured 4.9:1 against the old graphite and **4.38:1** once `--bg` darkened, because
mixing toward a darker ground darkens the result. Re-solved to 90%. Any token change to a
background needs every `color-mix` that references it re-measured.

**Measure with alpha compositing, or the number lies.** `getImageData` returns
*unpremultiplied* RGB, so reading a semi-transparent fill straight off canvas hands back
the colour as though it were opaque. A tinted row measured that way reported **1.01:1**
and looked like a failure; composited against its real layer stack it was comfortably
over the floor. Walk the ancestor chain to the first opaque background and paint the
layers in order.

### Signal

| Token | Value | Role |
|---|---|---|
| `--accent` | `#E2B64B` | **Reserved for live / active / you-are-driving.** Amber, 9.84:1 on `--surface`. Never decorative, and never in chrome. |
| `--state-ok` | `#37B773` | Completed. Outcome, not liveness — a finished run is green, a running one is amber. |
| `--state-error` | `#DE6060` | Failure states, disconnection. |

There is **no `--state-warn`**: the visual reference has no pending colour, so pending
reads neutral. All three values are sampled from that reference's own product imagery by
canvas readback rather than interpreted. Its red (`#C24F4F`) measures **3.75:1** on
`--surface-2` and fails AA as text — it works there only by sitting on a tinted badge
fill — so it is lifted along its own hue until the worst ground clears the floor.

Amber is mid-luminance, unlike the cyan it replaced. Any filled-accent surface needs
`--bg` text (5.90:1), never `--text`, which measures 3.22:1 and fails.

**On accent discipline.** The rule has only ever tightened. Places that had quietly gone
decorative and had to give the accent up, in order: the demo's Send button (a control,
always present), the lock section's definition terms (headings), any filled-accent button,
the hero's one emphasized word, and finally the hero eyebrow — which is chrome, so it is
now grey and signals liveness by pulsing instead of by hue.

The accent appears only on: the session status badge, the driving indicator, a hand-over,
and a pending control request. If it is on screen and it isn't happening *now*, it isn't
accent-coloured — and if it is chrome, it isn't coloured at all.

### Presence

A small fixed palette assigned per participant by hashing their id, so nobody's dot
changes color because someone else disconnected. Muted, not neon — presence is
ambient information, not an alert.

`--presence-1` `#E5A3B3` · `--presence-2` `#9BB4E0` · `--presence-3` `#B9E0A5` · `--presence-4` `#E0C48A`

### Color strategy

**Two layers, and the split is the whole rule.**

| Layer | Colour |
|---|---|
| Chrome — nav, hero, headings, buttons, sections, footer | **Achromatic.** No accent at all. |
| Product — ledger, status badges, demo panel, control bar | Status palette, above |

This is what the visual reference actually does, which is not what it looks like it does.
Its chrome measures **4 chromatic fills out of 156**, and its one colour token renders on
three 20×20px squares; the colour a visitor sees comes from the status badges inside its
product screenshots. So: monochrome chrome wrapped around product imagery that carries a
normal status palette — Relay's own shape exactly, with a live ledger where the reference
has a PNG.

Measured result on the landing page: **one chromatic element on the entire page**, the
driver's name inside the session panel.

A control is never accent-filled. `--primary` maps to `--text`, not `--accent` — it was
mapped to the accent for a long time, which quietly gave every shadcn `<Button>` an accent
fill in violation of this rule. Cyan merely looked like a bright CTA; amber and coral both
read as status, which is what finally exposed it.

## Typography

Two families. The contrast axis is **sans against mono**, not sans against sans.

| Role | Family | Usage |
|---|---|---|
| Display | **Geist** (`--font-display`) | Landing hero, section titles, the `relay` wordmark. Big and rare. Never body, buttons, labels, or data. |
| Body / UI | **Geist** (`--font-geist-sans`) | All prose, controls, labels. Quiet by design — the personality lives elsewhere. |
| Mono | **Geist Mono** (`--font-mono`) | **Load-bearing.** All agent tool output, the action ledger, timestamps, session ids, diffs. The agent's actions should read like a terminal, because that is the subject's native material. |

**Display and body are the same family, deliberately.** An earlier system paired Archivo
against Geist on the argument that a display face needs a genuine contrast axis. The
visual reference does not do that — it sets every heading in the same sans as its body
copy and gets its separation from mono instead. Matching it removed a font rather than
adding one, so the page is lighter than before. `--font-display` stays a distinct token
even though it currently aliases Geist: the indirection is what lets the display face
change later without touching every call site.

**Weight is not how emphasis is made here.** Headings are `400`. Presence comes from size
and −0.05em tracking; setting them at 600 was the single largest tell that this was a
different system from the one it was matching.

**On ligatures.** The ledger disables them, because `=>` must render as `=>` — that
surface is a record of what the code actually contains, and a diff showing characters the
file does not have is editorializing. Geist Mono forms none of these to begin with
(`=>`, `!=`, `->`, `===` all measure identical advance widths with and without
suppression), so the rule is currently a no-op. It is kept anyway: the guarantee belongs
to the surface, not to whichever mono face happens to be mounted on it.

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

**Corner marks.** A small plate sits on every crossing where a section rule meets a frame
rail — 5px, a 1px outline filled with the page ground, centred on the joint so it genuinely
covers it. Technical drawings mark the joint rather than letting two lines simply intersect,
and it is the detail that separates "boxes with borders" from a drawn frame.

One pseudo-element per rule, not two: `.close` already owns its `::before` for the dot field,
so only `::after` is free. The strip spans the full width and paints a plate at each end via
four background layers (inner fill over outline, twice), which means it never has to know how
wide the frame is. Below the 75rem measure the rails sit on the window edge, so the plates
half-clip there — consistent with the rails themselves, which already touch the edge.

**Nav balance.** The links sit beside the mark, not against the far edge. Pushed right they
sat next to the CTA and read as a toolbar; next to the mark they read as this product's own
sections, which is what they are. The CTA carries the auto margin, so it is the only thing on
the right.

**Composition.** One shared measure (`--measure: 75rem`, 1200px) and a 2rem gutter, so the
nav mark, hero headline, every section title, and the footer sit on the same left edge. The
hero splits 1:1 into two halves divided by a hairline, with no gutter between them: copy on
the left, the session panel standing on the hero photograph on the right. Each half carries
its own padding so the photograph can reach the frame's rail. Sections are a flat 4rem block.
A hatch band sits directly under the nav, before any content — the reference uses it there to
read as the top edge of an instrument rather than as a divider between two things.

**Texture.** A black-and-white landscape photograph fills the hero's right half and the
session panel stands on it, occluding it top and left. The lock and trust panels repeat the
move, so the lower half of the page belongs to the same document.
`scripts/prepare-hero-image.py` grades `packages/web/assets/hero-background.png` into two
crops: `public/hero-ridge.webp` (1200×1420, the tall hero column) and
`public/band-ridge.webp` (2400×720, the wide section bands). Two, because stretching a
portrait crop across a wide band crops it to a sliver of sky with no ridge in it.

Two things about it, both learned by getting them wrong first:

- **The screen quantises to a handful of levels, not to 1 bit.** That distinction is the
  whole thing, and it took three passes to find. This shipped twice as a 1-bit ordered
  dither, on the reading that the reference's texture was a black-and-white dot screen — it
  forced every pixel to black or white, destroyed every mid-tone, read as dots rather than as
  sky, and then needed a blur to look like anything. Removing the screen entirely fixed that
  and lost the texture the reference clearly has. `LEVELS = 6` with a 2px cell on a 2x crop
  is the middle: the dither only ever nudges a pixel to a neighbouring level, so the
  photograph survives and the texture shows up in the transitions. `LEVELS` is the one knob
  — raise it toward 10 for a subtler screen, drop it toward 4 for a heavier one.
- **The encoder is lossless, and that is not a stylistic choice.** A screen is high-frequency
  detail by construction, the worst case for a lossy codec: at WebP quality 82 the hero crop
  came out 412KB *and* smeared the dither into mush. Quantised to six greys it compresses
  losslessly to 129KB.
- **The photograph's black is graded onto `--bg` exactly.** That is what makes the crop
  edgeless — the dark half of the frame is the page itself, to the pixel, so no alpha channel
  is needed to hide a rectangle. It matters for weight too: carrying the tone in alpha instead
  cost 600KB a crop, because WebP encodes alpha near-losslessly and the whole image was alpha.
  Both crops together are now under 200KB. If `--bg` moves, `GROUND` in the script moves with
  it or a faint rectangle appears in the hero.

The image runs at full strength. A photograph held at low opacity is grey mush, which was the
first version's actual failure — not that it was subtle, but that it was dark *and* washed.

**The product outweighs the scenery, and the panel is square.** Measured against the
reference: its image band is ~90px and its product panel ~730 wide, where this page had a
187px band and a 471px panel — the photograph was winning an argument the product should win.
The band is now 109px and the panel 527x527 at 1440.

Square by `aspect-ratio`, not by stretching. An intermediate version filled whatever height
the copy column set, which looked right at 1440 and got worse as the viewport narrowed: the
copy column wraps taller as it narrows, so the panel grew with it into a long rectangle that
was mostly empty transcript. Height following width means the frame is the same shape at
every size and the replay always fills it. A long run scrolls inside the frame instead —
which is what the real session view does — with a thin hairline-coloured scrollbar, because
the platform default reads as browser chrome sitting inside the instrument. The transcript
pins to its bottom as rows land; without that the replay continues below the fold of its own
panel and looks stalled.

The caption under it is left-aligned to the panel edge rather than centred: centred it read
as a figure caption in a document, on the edge it reads as a label on an instrument. It stays
visible either way — this page does not get to imply a live session is running when it is a
replay.

**The lock section proves itself rather than asserting.** "One writer. Never two." is argued in
the only form that can carry it: the same session, at the same instant, on two people's screens.
Both viewports render from one piece of state, so the transcripts cannot drift — the claim is
structural, not captioned. The only difference between the halves is `selfId`, which is why the
real `ControlBar` drops into both: it already renders the driver's controls or the viewer's from
that one prop, so nothing re-implements the product in order to describe it. A shared header
spanning both halves carries one session id, one `seq` and one status, which is what makes the
two panes read as one session instead of two screenshots.

Two details do the work. The control area has a fixed floor tall enough for its tallest state,
so the frame does not jump a row the instant someone asks to drive — the moment the eye is meant
to be reading. And both control areas flash once together when the lock moves, keyed on the
driver: simultaneity is the claim, and a silent swap reads as two independent panels that
happened to change. The participants are `avi` and `noor`, not "you": `ControlBar` renders
"<name> is driving", so a participant named "you" produces "you is driving". The hero puts the
visitor in the seat; this section is the mechanism seen from outside, which is the right register
for evidence.

**Green for the handover, not the accent.** The driver's name and the "handed control to you"
row were both set in the accent, which means *in progress* everywhere else in the system — and
a completed handover is the opposite of that. `--state-ok` at 7.30:1 on the panel surface.
Moving them also leaves the accent doing exactly one job inside this panel: the live status.

**The replay dwells on the handover.** `DemoLedger` ran one flat 760ms per step, which spent
as much of the loop on "read README.md" as on control changing hands — the one moment that
shows something no other agent product does, and where three things change at once (the
ledger row, the presence line, the composer unlocking). Dwell is now per step kind: tool
calls at 480ms, the handover at 2800ms. The loop is the same ~11s either way; the beat that
carries the pitch got 3.7x more of it.

**The photograph hangs off a wrapper, never off the panel.** A `z-index: -1` pseudo-element
paints *after* its own element's background but *before* that element's text. Putting the
image on the panel slid the clouds between the panel's fill and its labels and made the
topology diagram unreadable. `.on-photo` carries the image and has no fill of its own; the
panel inside is an ordinary child whose opaque fill occludes it. Same shape as the hero, where
`.hero-demo` carries the image and `.demo-frame` carries the fill.

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

`--radius` is `0`, with a `sm`/`md`/`lg`/`xl` scale derived from it. Everything is
square: cards, inputs, buttons, code blocks and ledger rows alike.

This went `0.625rem` → `0.125rem` → `0`. The 10px radius was the strongest "generic web
app" signal in the original system; 2px was a guess at the reference; `0` is what the
reference actually measures on every structural card, panel, badge and button. The only
curves left are circles — presence dots and avatars.

Measure is `75rem` (1200px) with a 2rem gutter, and sections are a flat 4rem block —
all three measured rather than chosen.
