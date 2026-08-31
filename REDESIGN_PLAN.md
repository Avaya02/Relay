# Redesign plan — instrument-grade dark

Target: the visual language in the Nexflow reference — pure black, hairline structural
frames, monospace chrome, sharp corners, very high contrast — applied to both the
marketing site and the session UI.

This is an **intensification of the direction already committed to**, not a pivot.
`DESIGN.md` already names the aesthetic lane as *"INSTRUMENTATION — cockpit placards,
oscilloscope faceplates, a recorder running."* The reference is that lane executed
harder. Everything below sharpens what's there rather than replacing the thinking behind
it.

Work top to bottom. Each phase has a **Done when** gate; don't start the next phase until
the current one passes it.

---

## Part 0 — What to take, and what to deliberately leave

Read this part before writing any code. Copying the reference wholesale would work
*against* the goal, because several of its strongest-looking elements are the most
recognizable template patterns in existence — and this is a portfolio piece whose value
depends on not looking generated.

### Take

| Element | Why it fits Relay |
|---|---|
| **Pure black ground, near-white text** | Relay is a recorder watched in a dark room. The current graphite is a compromise; black is the commitment. |
| **Hairline structural frame** | Visible 1px rails and section rules read as a technical drawing / instrument faceplate. Directly on-brand. |
| **Monospace for all chrome** | Relay already uses mono for data. Extending it to nav, buttons, labels and badges is the single highest-impact change, and costs nothing. |
| **Sharp corners (≈2px)** | The current 10px radius is what makes it read "generic web app." |
| **Rectangular tinted status badges** | Relay already has status states (idle/working/done/error) that currently render as plain text. |
| **Product UI as the hero image** | Already done via `DemoLedger` — the reference validates the approach. Give it more visual weight. |
| **Diagonal hatch band as a divider** | Pure CSS, no assets, and reads as technical print. |

### Leave

| Element | Why not |
|---|---|
| **Dithered mountain photography** | That's *Nexflow's* brand texture. Lifting it makes the copy obvious. Relay's texture must be CSS-native (hatch, dot-matrix, scanline) plus its own live output. See Phase 2.3. |
| **The 6-card icon grid** ("Built to run production without friction") | The single most saturated landing-page pattern that exists — icon-in-a-box + heading + one line, repeated six times. Replace with a **spec sheet** (Phase 3.6): more instrument-like, and genuinely distinctive. |
| **`▎Benefits`-style eyebrow on every section** | One as a deliberate system is voice; on every section it's scaffolding. Use at most twice on the whole page. |
| **The `Logoipsum` customer strip** | Relay has no customers. Never fake social proof — an interviewer will ask, and there's no good answer. |
| **`Pricing` / `Testimonials` / `Waitlist` / `Book Free Demo` nav** | Relay is not a SaaS with tiers and customers. Borrowing that information architecture creates a page that promises things the product doesn't have. Nav should be: what it is → how it works → GitHub → start a session. |

### Keep from Relay's own identity

- **Signal cyan `--accent`, and its rule: reserved for live/active state only.** The
  reference has essentially no brand color. Relay's whole subject is *liveness*, so an
  accent that means "this is happening now" is load-bearing, not decoration. Use it even
  more sparingly than today — the mono + black does the work, cyan marks only what's live.
- **Mono for data, always. Ligatures off in the ledger.**
- **The ledger's one-row-per-action rule** and everything in `DESIGN.md`'s ledger section.
  The redesign restyles the ledger; it does not restructure it.

---

## Part 1 — Token layer

**Goal:** every later phase reads from tokens, so nothing hardcodes a color.

**File:** `packages/web/app/globals.css` (`:root` block, lines ~15–57)

### 1.1 Replace the surface + text ramp

```css
:root {
  /* Ground. Pure black, matching the reference's commitment. */
  --bg: #000000;
  --surface: #0A0B0D;      /* header, rails, panels */
  --surface-2: #131519;    /* raised: composer, expanded detail, popovers */

  /* Structure. Two weights: hairlines vs. frame edges. */
  --border: #1E2024;       /* ordinary separators */
  --border-lit: #2C2F35;   /* frame edges, focused/active borders */

  /* Text. Near-white, NOT #FFF — pure white on pure black halates on OLED. */
  --text: #F4F5F7;
  --text-dim: #8C9098;
  --text-faint: #70747C;   /* timestamps, tertiary. VERIFY before use — see 1.4 */

  /* Signal. Cyan keeps its meaning: live/active/you-are-driving only. */
  --accent: #4DD0C7;

  /* Status. New — the reference's badge colours, which Relay lacked. */
  --state-ok: #5FD68A;
  --state-warn: #E0B155;
  --state-error: #E0715A;
}
```

### 1.2 Sharpen the radius

```css
--radius: 0.125rem;   /* was 0.625rem */
```

This one line does a large share of the visual work — it flows through every shadcn
primitive (buttons, inputs, popovers) via the existing `--radius-sm/md/lg` chain.

### 1.3 Add the presence palette back unchanged

`--presence-1` … `--presence-4` stay as they are. They're already muted and they read
correctly on black.

### 1.4 Verify contrast before proceeding

`--text-faint` at `#70747C` on `#000000` is **near the 4.5:1 floor and may fail.** Do not
guess. Run the existing measurement approach (canvas pixel readback + alpha compositing —
the method already used in this project, which correctly resolves `color-mix()` and
`oklch()` strings that naive parsing gets wrong).

If `--text-faint` measures below 4.5:1, lighten it until it passes, or restrict it to
≥18.66px text only and document that restriction in `DESIGN.md`.

**Done when:** every text/background pair in the app measures ≥4.5:1 (≥3:1 for large
text), measured, not estimated.

---

## Part 2 — Primitives

**Goal:** build the four reusable pieces the reference's whole look rests on. Everything
in Parts 3 and 4 composes these.

### 2.1 The frame

The signature structural move: content lives inside a bordered container with visible
vertical rails, and every section is separated by a full-width hairline.

```css
.frame {
  max-width: 84rem;
  margin-inline: auto;
  border-inline: 1px solid var(--border);
}
.frame > section {
  border-bottom: 1px solid var(--border);
}
.frame > section:last-child {
  border-bottom: 0;
}
```

Note: `.landing` already defines `--measure: 84rem` and a `--gutter`. Reuse them rather
than introducing a second measure.

### 2.2 The hatch band

The diagonal-striped divider under the nav. Pure CSS, no asset:

```css
.hatch {
  height: 3.5rem;
  border-bottom: 1px solid var(--border);
  background-image: repeating-linear-gradient(
    45deg,
    var(--border) 0 1px,
    transparent 1px 9px
  );
}
@media (prefers-reduced-motion: no-preference) {
  /* Optional, very slow drift. Skip if it reads as noise — static is fine. */
}
```

### 2.3 Relay's own texture (replaces the dithered photos)

Three CSS-native options. **Pick one and use it consistently** — mixing all three is
noise.

```css
/* (a) Dot matrix — reads as a plotter grid / faceplate. Recommended default. */
.texture-dots {
  background-image: radial-gradient(var(--border) 1px, transparent 1px);
  background-size: 8px 8px;
}

/* (b) Scanlines — reads as CRT / oscilloscope. Use sparingly, can shimmer. */
.texture-scan {
  background-image: repeating-linear-gradient(
    to bottom, var(--border) 0 1px, transparent 1px 4px
  );
}

/* (c) Hatch at low opacity — same family as the divider, quieter. */
```

Apply as a large, low-contrast field behind hero/section backgrounds — never behind
running text.

### 2.4 Chrome typography rule

The highest-impact, lowest-effort change in the whole plan.

**Everything that is chrome becomes monospace:** nav links, buttons, badges, labels,
breadcrumbs, session ids, counts, status text, form labels, the footer.

**Stays as-is:** `--font-display` (Archivo) for hero and section titles only;
`--font-geist-sans` for prose paragraphs only.

Tighten display tracking to match the reference's density:

```css
.hero-title, .section-title { letter-spacing: -0.035em; }
```

(`.hero-title` already sets `-0.035em`; apply the same to `.section-title`.)

### 2.5 Badge primitive

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.1875rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 2px;
  font-family: var(--font-mono);
  font-size: 0.6875rem;
  line-height: 1;
  color: var(--text-dim);
}
.badge--ok    { color: var(--state-ok);    border-color: color-mix(in oklch, var(--state-ok) 35%, transparent); }
.badge--warn  { color: var(--state-warn);  border-color: color-mix(in oklch, var(--state-warn) 35%, transparent); }
.badge--error { color: var(--state-error); border-color: color-mix(in oklch, var(--state-error) 35%, transparent); }
.badge--live  { color: var(--accent);      border-color: color-mix(in oklch, var(--accent) 35%, transparent); }
```

**Done when:** all four primitives render in isolation, sharp-cornered, mono, and the
badge variants measure ≥4.5:1 against `--surface`.

---

## Part 3 — Marketing site

**File:** `packages/web/app/page.tsx` + the `.landing` block in `globals.css`.

Content stays largely as written — it's honest and specific. This is a restyle plus one
structural change (3.6).

### 3.1 Nav

- Wrap in `.frame`. Mono links.
- Links: `What it is` · `How it works` · `GitHub ↗`
- Right side: outlined `Docs` (→ README) + filled white `Start a session`.
- **No** Pricing / Testimonials / Waitlist.

### 3.2 Hero

- Two columns: copy left (5fr), `DemoLedger` right (7fr) — the existing ratio is already
  right.
- Headline stays: *"Watch an agent work. Together."* Sizing per 2.4.
- Add a `.badge` above the headline reading `LIVE MULTIPLAYER` or similar — **one**
  eyebrow on the whole page, deliberately, per Part 0.
- Wrap `DemoLedger` in a bordered frame with a `--surface` chrome strip on top, matching
  the reference's inset-product-panel treatment.

### 3.3 Hatch divider

Insert `.hatch` immediately below the hero. This is the reference's most recognizable
structural beat and it's one element.

### 3.4 The lock section — give it the most weight

This is the differentiator; it should be the largest, most confident section on the page.

- Full-bleed section, generous vertical padding.
- Keep the three `<dl>` facts (request→hand over→release / enforced on the server / no
  input races).
- Consider a small inline diagram: two participant dots, one with a cyan ring (driving),
  an arrow between them. CSS/SVG only.

### 3.5 How it works — a numbered sequence

The impeccable ruleset bans numbered section markers *as reflex scaffolding*, with an
explicit exception: **when the section genuinely is a sequence and the order carries
information.** This one is (clone → instruct → stream → publish), so numbering is earned
here and only here.

Four steps, `01`–`04`, mono numerals, hairline rule between each.

### 3.6 Replace the how-list with a spec sheet ← the one structural change

Current `.how-list` is a key/value list. Push it further into a **datasheet**: a bordered
table, mono throughout, two columns, hairline row separators.

| | |
|---|---|
| `ENGINE` | Claude Agent SDK — the same engine Claude Code runs |
| `ORDERING` | Server-assigned `seq`, one function, clients never sort |
| `ISOLATION` | Disposable `git clone` per session |
| `CATCH-UP` | Full transcript replay, then live stream |
| `RECONNECT` | 30s grace window, same participant identity |
| `PERSISTENCE` | Postgres transcript mirror (optional) |

This is what replaces the reference's six-card grid. It's more information-dense, more
on-brand for an instrument, and it isn't a pattern every generated landing page uses.

### 3.7 Close + footer

- Close: large centered title, one filled button, hairline above.
- Footer: mono, two or three items, `border-top`.

**Done when:** the landing page renders with no horizontal scroll at 390px, 768px,
1440px and 1920px; every heading fits without overflow at every breakpoint; no fake
social proof anywhere on the page.

---

## Part 4 — Product UI (session view)

**Files:** `globals.css` (`.chrome-*`, `.ledger-*`, `.rail-*`, `.workspace-*`,
`.plan-*`, `.agent-*`, `.share-*`), plus component files only where markup must change.

The structure built in the last work session (three-column shell, sessions rail,
workspace rail, plan strip, agent chip) **stays exactly as it is.** This is purely a
restyle — do not restructure.

### 4.1 Global

- Backgrounds pick up the new tokens automatically. Verify the three-column shell still
  reads as three distinct planes on black; if the rails now disappear into the ground,
  lift `--surface` slightly rather than adding shadows.
- Radius drops to 2px everywhere via `--radius`.

### 4.2 Header chrome

- Everything mono (mostly already true).
- `StatusBadge` → `.badge` variants: `idle` neutral, `working` `--badge--live` (cyan,
  keeps the existing pulse), `done` `--badge--ok`, `error` `--badge--error`.
- The agent chip (`Demo` / `Live ··4f2a`) already matches this language — align its
  border treatment to `.badge`.

### 4.3 The ledger

- Keep the continuous left rule — it's already the right idea and matches the reference's
  rail language.
- Row hover: `--surface` fill, no radius.
- Verb column: `--text-dim`. Target: `--text`. Result: `--text-dim`. Timestamps:
  `--text-faint` **only if 1.4 cleared it**, otherwise `--text-dim`.
- Expanded detail panels: `--surface-2`, 1px border, square corners.

### 4.4 Rails

- Section heads (`Sessions`, `Workspace`) get a `border-bottom` and mono uppercase-free
  labels — keep sentence case, the reference doesn't shout.
- Current-session marker: keep the cyan left border (2px) — it denotes "here," which is
  live state, so accent is correct.

### 4.5 Composer + control bar

- `--surface-2` ground, 1px top border, square input.
- Send button: white-filled, mono, square — matching the marketing site's primary button
  exactly. This is the one place the two registers should look identical.

**Done when:** a full mock session run renders correctly at 1440px and 390px; the ledger,
plan strip, both rails and the composer all read as one system; no element still shows a
10px radius.

---

## Part 5 — Motion

The reference is almost entirely static, and `DESIGN.md`'s existing rule ("nothing else
in the app moves") is good. **Do not add motion in this redesign** beyond what exists:

- ledger row enter (140ms, opacity + 4px translate)
- status dot pulse while working
- plan strip in-progress pip pulse

All three already respect `prefers-reduced-motion`. Leave them. Adding scroll-reveal
animations to the marketing page is the fastest way to make it read as a template.

---

## Part 6 — Verification gates

Do not consider the redesign done until all four pass.

1. **Contrast.** Every text/background pair ≥4.5:1 (≥3:1 large), measured via canvas
   pixel readback with alpha compositing — not by parsing computed style strings, which
   silently mis-reads `oklch()` and semi-transparent layers.
2. **Responsive.** 390 / 768 / 1024 / 1440 / 1920px, both marketing and session view. No
   horizontal overflow at any width. Rails collapse per the existing breakpoints.
3. **Screenshots.** Regenerate `docs/session.png` and `docs/plan.png` against an isolated
   mock server (never the live one — it costs real API credit and touches the real repo).
4. **Slop test.** Look at the finished marketing page and ask: *could someone identify
   the Framer template this came from?* If the answer is yes, the texture (2.3) or the
   spec sheet (3.6) hasn't done enough work. Both exist specifically to break the
   resemblance.

---

## File map

| File | Phases |
|---|---|
| `packages/web/app/globals.css` | 1, 2, 3, 4 — the bulk of the work |
| `packages/web/app/page.tsx` | 3 |
| `packages/web/components/landing/DemoLedger.tsx` | 3.2 (frame wrapper only) |
| `packages/web/app/session/[id]/page.tsx` | 4.2 (StatusBadge → badge) |
| `DESIGN.md` | update tokens, radius, and the texture decision once shipped |

## Rollback

Everything is committed as of `a2a58ec`. Work on a branch; if the direction doesn't land,
`git checkout main -- packages/web/app/globals.css` restores the current system in one
command.

## Suggested commit sequence

1. `tokens: pure-black ground, sharp radius, status colours`
2. `primitives: frame, hatch, texture, badge`
3. `landing: restyle onto the frame system`
4. `landing: replace the how-list with a spec sheet`
5. `session: restyle chrome, ledger, rails onto the new tokens`
6. `docs: update DESIGN.md and regenerate screenshots`
