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

The palette deliberately avoids the near-black + acid-accent AI default. The base is a
**cool graphite**, not black, with two raised steps for layering — depth comes from
surface elevation and hairline rules, not from shadows or glow.

## Color

Tokens as implemented, with measured contrast against their usual backgrounds.

### Surfaces

| Token | Value | Role |
|---|---|---|
| `--bg` | `#0E1116` | Page base |
| `--surface` | `#151A21` | Stream pane, cards, header |
| `--surface-2` | `#1C232C` | Raised: composer, control bar, code blocks |
| `--border` | `#232B35` | Hairline separators — 1px, low contrast, never decorative |

### Text

| Token | Value | On `--surface` | On `--surface-2` |
|---|---|---|---|
| `--text` | `#E6EAF0` | 14.47:1 | 13.0:1 |
| `--text-dim` | `#8A94A6` | 5.72:1 | 5.18:1 |

Both clear WCAG AA for normal text (4.5:1) at every pairing used in the app, including
the ledger's 12px mono rows.

### Signal

| Token | Value | Role |
|---|---|---|
| `--accent` | `#4DD0C7` | **Reserved for live / active / you-are-driving.** Signal cyan, 9.29:1 on `--surface`. Never decorative. |
| `--state-error` | `#D98A6A` | Restrained amber-red. Failure states, disconnection. Deliberately *not* alarm-red — a failed tool call is a normal part of agent work, not an emergency. |

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
- Nothing else in the app moves.

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
┌───────────────────────────────────────────────────────────┐
│  relay · session id          status  ● you · ● alex(driving)│  header, --surface
├───────────────────────────────────────────────────────────┤
│                                                           │
│   ACTION LEDGER (scrolls)                        --bg     │
│   │ ▸ read   README.md          ✓ 100 lines   18:49:13    │
│   │ ▸ edit   src/App.tsx        ✓ +12 −3  ⌄   18:49:15    │
│   agent prose renders here as markdown                    │
│                                                           │
├───────────────────────────────────────────────────────────┤
│  ControlBar — who's driving, request / hand over   --surface-2
├───────────────────────────────────────────────────────────┤
│  Composer — driver only                            --surface-2
└───────────────────────────────────────────────────────────┘
```

Single column, full height, three fixed chrome bands around one scrolling pane. No
sidebar, no file tree, no tabs — see anti-references in `PRODUCT.md`. Responsive down
to 375px; the presence list and control bar collapse rather than wrap.

## Components

Built on shadcn/ui primitives (Radix base), themed onto the tokens above rather than
left at shadcn defaults. `--primary` maps to `--accent`, `--background`/`--foreground`
to `--bg`/`--text`, and so on, so a stock shadcn component lands on-brand without
per-instance overrides.

| Component | Notes |
|---|---|
| `StreamView` | The ledger. See rules above. |
| `Composer` | Driver only — rendered, not merely disabled, so its absence is the signal. |
| `ControlBar` | Driving state + hand-over. Collapses to a menu past ~4 participants. |
| `Presence` | Hashed presence-color dots, driving indicator. Overflows to `+N` past 4. |

Focus rings use `--accent` with a 4px `ring-offset` — without the offset, a same-hue
ring is perceptually invisible against an accent-filled button.

## Radius & spacing

`--radius` `0.625rem`, with a `sm`/`md`/`lg`/`xl` scale derived from it. Ledger rows
are square — radius is for containers (cards, inputs, buttons, code blocks), not for
records.
