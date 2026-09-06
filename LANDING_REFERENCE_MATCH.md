# Landing reference match

**Proposed filename:** `LANDING_REFERENCE_MATCH.md` — it names the job (match the landing
page to the Nexflow reference) and cannot be confused with `REDESIGN_PLAN.md`, which stays
on disk as the record of the previous, partly-shipped direction.

**Status:** implemented. Phases 0–7 are applied and verified against the gates in §7;
nothing is committed. §0.3, §3.3b and §4.10 record decisions taken during implementation
that differ from the first draft.

**Reference:** <https://nexflow.framer.media/> — values below were read from the live DOM at
a 1440px viewport via computed styles and the Framer design-token block, not estimated from
the screenshots. Screenshots were used only to confirm placement.

**Target:** `packages/web` landing page (`app/page.tsx` + the `.landing` CSS block).

---

## 0. Decisions that govern everything below

### 0.1 Register: `brand`, not `product` — for this surface only

`PRODUCT.md` declares `register: product`. That declaration is correct and stays.

Impeccable selects mode **from the requested surface, not the product** — its own wording is
that a tool's landing page is still Persuade. The session UI is where someone completes a
task, so it is Operate/`product`: scanability, density, native affordances, brand living in
precise details. The landing page is where someone *decides*, and there design **is** the
product. Same repo, two surfaces, two registers.

The resolution is therefore not to edit `PRODUCT.md` but to record the landing page's
register where per-surface strategy belongs — a surface brief. `impeccable context` reports
`surfaceBriefPath: null`, so none exists yet. Create it with the script rather than
hand-placing a file, since the script owns the path convention:

```bash
~/.claude/skills/impeccable/scripts/impeccable surface-brief write packages/web/app/page.tsx <body-file>
```

Anything that reads `register: product` and applies it to the landing page is reading the
wrong scope. This is the single sentence to put in the brief.

### 0.2 What this plan keeps and what it overturns from `REDESIGN_PLAN.md`

`REDESIGN_PLAN.md` targets the same reference and its Part 1 tokens are **already shipped**.
This is a delta on an applied design. Read that file first; this section is the diff.

**Kept, unchanged:**

| Decision | Why it stands |
|---|---|
| Sharp radius | Direction confirmed, value corrected: the reference measures `0px`, so `--radius` went to `0` rather than staying at 2px. |
| Mono for all chrome | Confirmed exactly: the reference sets nav, buttons, eyebrows, step labels, stats, prices and footer links in Geist Mono. |
| The `.frame` hairline system | Confirmed: the reference frames content in a fixed-width column with 1px side rails and a 1px rule under every section. |
| The `.hatch` band | Confirmed present in the reference under the nav. |
| No fake social proof — no `Logoipsum` strip | Stands, and is not a design decision to revisit. Relay has no customers. |
| No pricing / testimonials / waitlist nav | Stands. Borrowing that IA promises a product that isn't there. |
| The spec sheet replacing a 6-card icon grid | Stands. Already shipped and it is the better pattern. |
| Numbered steps `01`–`04` | Stands — earned, because the section genuinely is a sequence. |
| One eyebrow on the whole page | Stands. |
| Add no new motion | Stands. |

**Overturned:**

| Old decision | New decision | Why |
|---|---|---|
| "Dithered mountain photography — that's *Nexflow's* brand texture. Lifting it makes the copy obvious." | The user has reversed this. Match the reference. | The user's instruction wins over the previous plan's judgment. See §4.9 for what this means concretely, and §9 Q1 for the one part of it I cannot resolve without an asset decision. |
| `--bg: #000000` (pure black) | `--bg: #0A0A0A` | **The reference is not pure black.** Measured `rgb(10,10,10)` on `body`. The old plan asserted black as "the commitment the graphite was hedging on" — but it was matching a reference it had mis-read. |
| Keep `--accent: #4DD0C7` cyan | `--accent: #E2B64B`, chrome achromatic | Superseded twice. Measuring where the reference's colour token actually renders showed its chrome is 97.4% achromatic and its colour lives in product imagery. See §0.3. |
| Display face = Archivo | Display face = **Geist** | The reference's headings are Geist at weight 400. See §1.1. |
| Mono face = JetBrains Mono | Mono face = **Geist Mono** | The reference's mono is Geist Mono. See §1.1 and §9 Q2 for the ligature consequence. |
| `--measure: 84rem` (1344px) | `--measure: 75rem` (1200px) | Measured. |
| `--text-faint: #7b8088` | `#8A8A8A` | Measured **4.38:1** on the new `#1A1A1A` ground — fails AA. Must change regardless of taste. |

### 0.3 Colour, resolved — monochrome chrome, status in the product

An earlier draft of this plan made `#F6543E` Relay's accent, on the reading that the
reference's palette is "nine neutrals plus one chromatic token". Measuring where that token
actually *renders* showed the reading was wrong, and the decision with it.

**What the reference actually does, measured on the live page:**

- `#F6543E` renders in exactly **three** places, all `rgba(246,84,62,0.2)` on 20×20px
  squares. It is a micro-detail, not a brand accent.
- **4 chromatic fills out of 156** filled elements — the chrome is 97.4% achromatic.
- The colour a visitor actually sees comes from the **status badges inside the product
  screenshots**: sampled by canvas readback from its own hero PNG, `#37B773` green
  (Completed), `#E2B64B` amber (Running), `#C24F4F` red (Failed).

So the reference is not "monochrome plus one accent". It is **monochrome chrome wrapped
around product imagery that carries a normal status palette** — which is exactly Relay's own
shape, with a live ledger where the reference has a PNG.

**The rule that follows, and what shipped:**

| Layer | Colour |
|---|---|
| Chrome — nav, hero, buttons, sections, footer | **Achromatic.** No accent at all. |
| Product — ledger, status badges, demo panel, control bar | Status palette, sampled from the reference |

- `--accent: #E2B64B` — amber, matching the reference's *Running*. Live / working /
  you-are-driving, and only inside product surfaces.
- `--state-ok: #37B773` — its *Completed*.
- `--state-error: #DE6060` — its *Failed* (`#C24F4F`) lifted along its own hue; the raw
  sample measures **3.75:1** on `--surface-2` and fails AA as text, surviving on the
  reference only because it sits on a tinted badge fill.
- `--state-warn` **removed** — the reference has no pending colour, and the variant was
  unused in markup. Pending reads neutral.
- The hero eyebrow dropped `badge--live`: it is chrome, so it is grey, and the dot carries
  liveness by pulsing rather than by hue. The pulse selector was extended to keep it, since
  it is now the only live signal there.

Cyan is gone, and so is coral. Measured result: **one chromatic element in the entire
landing page** — the driver's name inside the session panel.

**What carries "this is happening live":** amber in the session panel (status badge, driver
indicator, hand-over row), plus the eyebrow's pulsing achromatic dot. Both are paired with a
text label, so neither depends on colour alone.

## 1. Reference analysis (measured)

### 1.1 Fonts

Two families, both from Google Fonts, both already reachable through `next/font/google`:

| Role | Family | Weights in use | Where |
|---|---|---|---|
| Display + body | **Geist** | `400` only | All headings h1–h4, all body prose |
| Chrome + data | **Geist Mono** | `400`, `500` | Nav, buttons, eyebrows, step labels, stats, prices, footer links, badges |

`Onest` is also loaded by the page but does not appear on any rendered element — a leftover in
the template. Ignore it.

**The single largest typographic finding: the reference's headings are weight `400`.** Not
600, not 700. Presence comes from *size plus very tight tracking*, never from weight. Relay
currently sets `.hero-title`, `.section-title` and `.close-title` at `font-weight: 600`.
Dropping to 400 is the highest-impact single change in this plan.

**Measured type scale (Geist, weight 400, at 1440px):**

| Role | Size | Line-height | Tracking |
|---|---|---|---|
| h1 hero | `64px` | `64px` (1.0) | `-3.2px` = **−0.05em** |
| h2 section | `54px` | `59.4px` (1.1) | `-2.7px` = **−0.05em** |
| h3 feature | `34px` | `37.4px` (1.1) | `-1.7px` = **−0.05em** |
| h4 | `20px` | `24px` (1.2) | `-0.6px` = −0.03em |
| h4 small / FAQ | `16px` | `22.4px` (1.4) | `-0.32px` = −0.02em |
| body p | `15px` | `21px` (1.4) | `0` to `-0.3px` |
| small | `13px` | `19.5px` (1.5) | `0` |

At a 1024px viewport the hero drops to `48px / 48px / -2.4px` — the −0.05em ratio holds, so
the rule is proportional, not a fixed pixel value.

**Measured Geist Mono scale:**

| Role | Size | Weight | Tracking | Line-height |
|---|---|---|---|---|
| Button label | `13px` | `500` | `-0.4px` (−0.03em) | `15.6px` (1.2) |
| Eyebrow / section label | `13px` | `400` | `+0.13px` (+0.01em) | `18.2px` (1.4) |
| Step label, meta | `12px` | `400` | `+0.12px` (+0.01em) | `16.8px` (1.4) |
| Fine print | `11px` | `400` | `-0.44px` | `15.4px` (1.4) |
| Footer link | `14px` | `400` | `-0.56px` | `16.8px` (1.2) |
| Stat numeral | `28px` | `400` | `-0.84px` (−0.03em) | `28px` (1.0) |

Note the sign flip: **mono labels at ≤13px carry *positive* tracking (+0.01em); mono buttons
and numerals carry negative.** Relay currently applies no tracking to mono at all.

### 1.2 Colors — the complete token set

Read from the Framer design-token block. This is the entire palette; there is nothing else.

| Value | Role |
|---|---|
| `#0A0A0A` | Page ground |
| `#121212` | Panel / card surface |
| `#1A1A1A` | Raised surface |
| `#FAFAFA` | Primary text; also the inverted button fill |
| `#A3A3A3` | Secondary text |
| `#7C7C7C` | Tertiary text |
| `#525252` | Quaternary / disabled — **non-text only**, see §3.2 |
| `#F6543E` | The one chromatic token |
| `#F2F2F2`, `#F7F7F7` | Light-theme mirrors, unused here |

Alpha tokens, used for structure rather than text:

| Value | Composited on `#0A0A0A` | Role |
|---|---|---|
| `#FAFAFA0D` (5%) | `#161616` | Subtle fill |
| `#FAFAFA1F` (12%) | `#262626` | **The border.** Every 1px rule on the page. |
| `#FAFAFA33` (20%) | `#3A3A3A` | Stronger border, focus |
| `#FAFAFAB3` (70%) | — | Muted text on dark |
| `#F6543E33` (20%) | `#391914` | Coral tint fill / border |

`rgb(0,153,255)` appears 241 times in the HTML and is **not** part of the design — it is
Framer's default `--framer-link-text-color`. `#1C46FF` is a Framer shadow default. Neither
belongs in the palette.

### 1.3 Spacing, borders, radii, grid

| Property | Measured value |
|---|---|
| Content column | **1200px** max-width (`75rem`) |
| Inner gutter | **32px** each side (1200 → 1136px content) |
| Section vertical padding | **64px** top and bottom (dominant; 8 sections) |
| Secondary band padding | `24px`, `16px` for compact strips |
| Border width | `1px`, always |
| Border color | `rgba(250,250,250,0.12)` — solid-token equivalent `#242424` |
| Structural radius | **`0px`** — cards, panels, badges and buttons are square |
| Non-structural radius | `50px` on avatars and the Framer overlay badges only |
| Hero split | Two columns, ≈1:1 (596px copy column inside the 1200px frame) |
| Hero column gap | `24px` internal, `12px` between stacked elements |

Frame structure confirmed: elements carry `border-width: 1,0,0,1` / `1,1,0,1` / `1,0,1,1` —
i.e. cells in a grid drawing shared hairlines, with no radius. That is exactly the `.frame`
model already shipped.

---

## 2. Current-state audit

### 2.1 What `app/page.tsx` (363 lines) renders today

The markup is already close to the target structure — `REDESIGN_PLAN.md` Part 3 largely
shipped. Sections in order, with the real class names:

| Section | Classes | State |
|---|---|---|
| Nav | `.landing-nav`, `.landing-mark`, `.landing-nav-links`, `.landing-nav-link`, `.landing-nav-cta` | Structurally correct |
| Hero | `.hero`, `.hero-copy`, `.hero-eyebrow`, `.hero-title`, `.hero-sub`, `.hero-cta`, `.hero-join`, `.hero-demo` | Structurally correct; wrong ratio, weight, tracking |
| Hatch | `.hatch` ×3 | Correct |
| Lock | `.lock`, `.lock-inner`, `.lock-grid`, `.lock-head`, `.lock-lede`, `.lock-facts` | Correct |
| Trust | same `.lock` classes, `id="trust"` | Correct |
| How | `.how`, `.how-inner`, `.steps`, `.step`, `.step-n`, `.step-body`, `.step-title`, `.step-text` | Correct |
| Spec | `.spec`, `.spec-inner`, `.spec-sheet`, `.spec-row` | Correct |
| Close | `.close`, `.close-title`, `.close-cta` | Correct |
| Footer | `.landing-foot` | Correct |

Supporting components: `DemoLedger` (180 lines, `.demo-*`), `CommandBlock` (56 lines,
`.cmd-*`), `RecentSessions` (47 lines).

**Conclusion: this is a restyle, not a rebuild.** `page.tsx` needs no structural change. The
only markup edits are two additions (§4.2, §4.9) and they are additive.

### 2.2 The precise gap to target

| Dimension | Current | Reference | Gap |
|---|---|---|---|
| Ground | `#000000` | `#0A0A0A` | Pure black is not the reference |
| Panel | `#0a0b0d` | `#121212` | Too dark, too blue |
| Raised | `#131519` | `#1A1A1A` | Too dark, too blue |
| Border | `#1e2024` | `#242424` | Slightly blue-tinted |
| Text | `#f4f5f7` | `#FAFAFA` | Slightly blue-tinted |
| Text dim | `#8c9098` | `#A3A3A3` | Too dark, too blue |
| Text faint | `#7b8088` | see §3.2 | **Fails AA on new ground (4.38:1)** |
| Accent | `#4dd0c7` cyan | `#F6543E` coral | Full swap |
| Display face | Archivo 600 | Geist 400 | Family + weight |
| Mono face | JetBrains Mono | Geist Mono | Family |
| Hero size | `clamp(2.5rem, 5.4vw, 4.25rem)` = 68px max | `64px` @1440 | Slightly oversized |
| Hero tracking | `-0.035em` | `-0.05em` | Not tight enough |
| Hero line-height | `1.03` | `1.0` | Marginal |
| Section title | `clamp(1.75rem, 3vw, 2.5rem)` = 40px max, w600 | `54px`, w400 | **Materially undersized** |
| Measure | `84rem` = 1344px | `75rem` = 1200px | Too wide |
| Gutter | `clamp(1.25rem, 5vw, 4rem)` = 64px max | `32px` | Too generous |
| Hero ratio | `5fr / 7fr` | ≈`1fr / 1fr` | Demo over-weighted |
| Mono tracking | none | ±0.01–0.03em | Missing |
| Texture | `.texture-dots` CSS only | Dithered photography | See §4.9 / §9 Q1 |

The palette gap has a consistent shape: **every current neutral is cooler (blue-shifted) and
darker than the reference.** The reference's neutrals are pure achromatic greys. Relay's carry
a blue cast inherited from the pre-black graphite system.

---

## 3. Token diff, with measured contrast

All ratios below were measured by **canvas pixel readback with alpha compositing** — fill the
ground, composite the foreground, read the painted pixel, compute WCAG relative luminance.
Not parsed from computed-style strings, which mis-resolve `color-mix()` and `oklch()`.

### 3.1 Surfaces and structure

| Token | Old | New | Note |
|---|---|---|---|
| `--bg` | `#000000` | `#0A0A0A` | Reference ground |
| `--surface` | `#0a0b0d` | `#121212` | |
| `--surface-2` | `#131519` | `#1A1A1A` | |
| `--border` | `#1e2024` | `rgba(250,250,250,0.12)` | Composites to `#262626` on `--bg`, `#2D2D2D` on `--surface`, `#343434` on `--surface-2`. Using the alpha form rather than the flat `#242424` reproduces the reference's behaviour of rules getting *brighter* on raised panels. |
| `--border-lit` | `#2c2f35` | `rgba(250,250,250,0.20)` | `#3A3A3A` on `--bg` |

### 3.2 Text — measured against all three grounds

| Token | Value | on `#0A0A0A` | on `#121212` | on `#1A1A1A` | AA |
|---|---|---|---|---|---|
| `--text` | `#FAFAFA` | **18.97** | **17.95** | **16.67** | pass |
| `--text-dim` | `#A3A3A3` | **7.85** | **7.43** | **6.90** | pass |
| `--text-faint` | `#8A8A8A` | **5.73** | **5.43** | **5.04** | pass |

**Two findings that force a divergence from the reference:**

1. **The reference's `#7C7C7C` fails AA on raised surfaces** — measured 4.74 / **4.49** /
   **4.17**. It survives on the reference's marketing page because it is only ever used on the
   page ground. Relay uses `--text-faint` at 13 sites, including ledger timestamps on
   `--surface-2`. Solving for the *worst* ground gives `#828282` as the bare minimum (4.53).
   **Use `#8A8A8A`** for headroom, exactly the way `DESIGN.md` solved this token before.
2. **`#525252` fails everywhere as text** (2.53 / 2.40 / 2.23). Adopt it only as a non-text
   token — disabled fills, inactive pips — never for a glyph or a label.

The current `--text-faint: #7b8088` measures **4.38:1** on the new `#1A1A1A` and **must**
change; this is a correctness fix, not a preference.

### 3.3 Signal

| Token | Old | New | on `#0A0A0A` | on `#121212` | on `#1A1A1A` |
|---|---|---|---|---|---|
| `--accent` | `#4dd0c7` | `#F6543E` | **5.90** | **5.58** | **5.19** |
| `--state-ok` | `#5fd68a` | *removed* | — | — | — |
| `--state-warn` | `#e0b155` | *removed* | — | — | — |
| `--state-error` | `#e0715a` | *removed* — see §0.3 | — | — | — |
| `--diff-add` | — | `#6FCF8B` | **10.35** | 9.79 | 9.09 |
| `--diff-del` | — | `#FF8A75` | **8.62** | 8.16 | 7.58 |

**A trap worth naming:** `#FAFAFA` on a `#F6543E` fill measures **3.22:1 — fails AA.** Coral
is a mid-luminance colour, unlike cyan. Any filled-coral surface must use `#0A0A0A` text
(**5.90:1**). There is currently no filled-accent button in the system and none should be
added; this constraint exists for the live badge if it ever gains a fill.

Accent contrast drops from cyan's 10.47:1 to coral's 5.90:1. Still comfortably AA, but the
accent is now *quieter* against the ground than the primary text is. That reinforces the
decision to keep it strictly functional.

### 3.3b `--primary` — a latent violation the accent swap exposed

`--primary: var(--accent)` handed every shadcn `<Button>` an accent fill. `DESIGN.md` already
forbids this — it lists "any filled-cyan button" among the three places that had to give the
accent up — but the mapping was never updated, so the session UI's Join button stayed
accent-filled. Cyan merely looked like a bright CTA; coral reads as *destructive*, turning a
dormant rule violation into a misleading control.

Remapped to `--primary: var(--text)` / `--primary-foreground: var(--bg)`, which is the landing
page's `.btn-solid` exactly — §4.1's "the one place the two registers should look identical."
`--ring` stays on the accent: a focus ring is active state.

**Applied in Phase 1**, not deferred to Q5: it enforces a rule the project had already written
down rather than making a new design decision.

### 3.4 Presence

`--presence-1`…`-4` unchanged. They are muted, already read correctly on a near-black ground,
and are identity rather than brand.

### 3.5 Geometry

| Token | Old | New |
|---|---|---|
| `--radius` | `0.125rem` | `0` — the reference's structural radius is `0px`. `0.125rem` (2px) was a good guess; `0` is the measurement. |
| `--measure` | `84rem` | `75rem` |
| `--gutter` | `clamp(1.25rem, 5vw, 4rem)` | `clamp(1.25rem, 4vw, 2rem)` |
| `--section-pad` | — (per-section clamps) | new: `clamp(2.5rem, 6vw, 4rem)` |

### 3.6 The one `color-mix` that must be re-measured

`globals.css:1668` — `color-mix(in oklch, var(--text-dim) 90%, var(--bg))`, the recessed plan
row. `DESIGN.md` documents that this measured 4.38:1 when `--bg` became pure black and was
re-solved to 90%. Both inputs change here (`--text-dim` lightens to `#A3A3A3`, `--bg`
lightens to `#0A0A0A`), so it moves in the *safe* direction — but it is still the exact trap
`DESIGN.md` warns about and must be measured in the browser after the token change, not
reasoned about. It is the only `color-mix` of the 19 in the file that references `--bg`.

---

## 4. Section-by-section plan

Using the real class names in the markup.

### 4.1 Nav — `.landing-nav`, `.landing-mark`, `.landing-nav-link`, `.landing-nav-cta`

- `.landing-nav-link`: Geist Mono `13px`, weight `400`, tracking `+0.01em`, `--text-dim`;
  `--text` on hover.
- `.landing-mark`: keep the wordmark; Geist Mono, `--text`.
- `.landing-nav-cta` (`.btn-solid`): already `background: var(--text); color: var(--bg)`,
  which becomes `#FAFAFA` on `#0A0A0A` = **18.97:1**. This already matches the reference's
  inverted button exactly. Only the label metrics change: `13px / 500 / -0.03em`.
- Nav content stays: `What it is` · `How it works` · `Agent SDK ↗` · `Get started`. Not the
  reference's `Pricing / Testimonials / Waitlist`.
- Keep the existing outlined/filled pairing. Do **not** add the reference's second `Waitlist`
  button — there is no waitlist.

### 4.2 Hero — `.hero`, `.hero-title`, `.hero-sub`, `.hero-eyebrow`, `.hero-demo`

- `.hero`: `grid-template-columns` `5fr / 7fr` → **`1fr / 1fr`**. Gap to `2rem`.
- `.hero-title`: `font-family` → `var(--font-display)` (now Geist), `font-weight` **`600` →
  `400`**, `letter-spacing` **`-0.035em` → `-0.05em`**, `line-height` `1.03` → `1.0`,
  `font-size` → `clamp(2.5rem, 4.75vw, 4rem)` (64px ceiling).
- `.hero-title em`: currently `color: var(--accent)` — under §0.3 the accent means *live*, and
  a headline word is not live. **Drop the accent from the headline**; the emphasis becomes
  `--text` against a `--text-dim` remainder, or the `<em>` is dropped entirely. This is a
  tightening of the accent rule the previous plan already started.
- `.hero-sub`: `15px / 1.4 / -0.02em`, `--text-dim`. Currently `1.0625rem / 1.65` — both the
  size and the leading are larger than the reference.
- `.hero-eyebrow` (`.badge.badge--live`): Geist Mono `13px / 400 / +0.01em`. Dot stays filled
  and pulsing; colour becomes coral.
- `.hero-demo` / `.demo-frame`: keep. This is the reference's inset-product-panel treatment
  and it is already right. Square its corners via `--radius: 0`.
- **Markup addition:** none required for the above. See §4.9 for the one optional addition.

### 4.3 Hatch — `.hatch`

No change. Confirmed against the reference. Retint automatically via `--border`.

### 4.4 Lock and Trust — `.lock`, `.lock-grid`, `.lock-head`, `.lock-lede`, `.lock-facts`

- `.section-title`: `font-weight` **`600` → `400`**, `letter-spacing` `-0.035em` →
  **`-0.05em`**, `font-size` `clamp(1.75rem, 3vw, 2.5rem)` → **`clamp(1.75rem, 3.75vw,
  3.375rem)`** (54px ceiling). This is the most under-scaled element on the page today.
- `.lock-lede`: `15px / 1.4`, `--text-dim`.
- `.lock-facts dt`: Geist Mono `13px / 400 / +0.01em`, `--text`.
- `.lock-facts dd`: Geist `15px / 1.4`, `--text-dim`.
- Section padding → `4rem` block.

### 4.5 How it works — `.how`, `.steps`, `.step`, `.step-n`, `.step-title`, `.step-text`

- `.step-n`: Geist Mono `12px / 400 / +0.01em`, `--text-faint` (now `#8A8A8A`, **5.73:1** —
  the current `#7b8088` would fail here at 4.98 on `--bg` and worse on panels).
- `.step-title`: Geist `16px / 1.4 / -0.02em`, weight `400` not `500`, `--text`.
- `.step-text`: `15px / 1.4`, `--text-dim`.
- Keep the hairline between steps; it is the reference's row-separator language.

### 4.6 Spec sheet — `.spec`, `.spec-sheet`, `.spec-row`

- Keep entirely. This is the plan's best divergence and the reference's own datasheet rows
  validate the pattern.
- `.spec-row dt`: Geist Mono `12px / 400 / +0.01em`, `--text-dim`.
- `.spec-row dd`: Geist `15px / 1.4`, `--text`.
- Row separator `1px` `--border`; no radius.

### 4.7 Close — `.close`, `.close-title`, `.close-cta`

- `.close-title`: weight `400`, tracking `-0.05em`, `clamp(1.75rem, 4vw, 3.375rem)`.
- `.close-cta`: keep the `CommandBlock`. The primary action stays a command, not a button —
  `page.tsx` already documents why, and it remains true: the page has no repository.

### 4.8 Footer — `.landing-foot`

Geist Mono `14px / 400 / -0.04em`, `--text-dim`, `1px` top border. Currently `0.6875rem`
(11px) — the reference's footer links are 14px.

### 4.9 Texture — the reversed decision

The user has overturned "leave the dithered photography." Three routes, in order of fidelity:

1. **Real dithered photography.** Highest fidelity, and the only one that actually matches.
   Requires source images Relay does not have and I will not invent — see §9 Q1. If images are
   supplied, the treatment is: greyscale, Floyd–Steinberg or ordered-Bayer dither, used as a
   large low-contrast field behind section headers, never behind running text.
2. **CSS-native Bayer dither.** A 4×4 or 8×8 ordered-dither matrix as a repeating
   `conic-gradient` / `background-image`, applied over a subtle luminance ramp. Reproduces the
   *texture* without the photography. No assets, no licensing, no weight. This is my
   recommendation if no images are supplied.
3. **Keep `.texture-dots`.** Already shipped. Lowest fidelity to the reference.

Whichever is chosen, it is a `--border`-level contrast field. It must never sit behind body
copy, and it must not appear in the session UI.

### 4.10 Page rhythm — product visuals per section

**This section corrects an omission in the first draft of this plan.** §4.1–4.8 restyle the
existing sections, five of which are text-only, while the reference anchors *every* section
with a product visual. That is a page-rhythm gap, not a styling gap, and no amount of
type-scale work closes it.

**What the reference actually does (measured, not inferred):**

21 images, of which ~7 are large product panels — hero 881×564, three 704×451 section panels,
three 331×248 step cards, one 894×561 footer panel. Their alt text names them as product
screenshots ("Nexflow workflow dashboard…", "Nexflow pipeline validation…").

They are **baked PNGs, not rendered DOM.** Probing the live page for text visible inside those
panels — `Deployment validation`, `Release checks`, `pricing_rules`, `Runtime CPU Guard`,
`nexflow checks` — returns `false` for every one. The dithered photography is composited into
the *same* PNGs; photo frame and product panel are one flattened asset per section.

**Relay should not match this literally, and the repo has already decided why.** The comment
at the top of `components/landing/DemoLedger.tsx` makes the argument in the codebase's own
words: Relay's claim is temporal — the same session, the same moment, for everyone — and a
still image cannot express that. Nexflow's product is *invisible* (a CI pipeline has no
inherent visual), so it must be depicted. Relay's product **is a screen**, and it is already
on the page, live. Copying the flattened-PNG approach would replace a live proof with a
picture of one, which is a downgrade dressed as fidelity.

There is also a practical cost: the repo has **no screenshot tooling** — no Playwright, no
Puppeteer, nothing in any `package.json`. `docs/session.png` and `docs/plan.png` were captured
by hand. Seven landing-page PNGs would be seven hand-captured assets that go stale on the next
UI change — and this plan *is* a UI change, so they would be shot twice before launch.

**Decision: close the rhythm gap with live components, not images. Two panels, not seven.**

| Section | Today | Add | Built from |
|---|---|---|---|
| `.hero` | `DemoLedger`, live | keep unchanged | existing |
| `.lock` — "One writer. Never two." | text only | **hand-over panel**: presence row with `alex` requesting control, driver indicator, hand-over control | `Presence.tsx` + `ControlBar.tsx` |
| `#trust` — "Your code stays on your machine." | text only | **topology diagram**: your machine → relay → viewers, showing what does and does not cross the network | new CSS/SVG, ~40 lines |
| `.how` — steps 01–04 | text only | nothing | the sequence is the visual |
| `.spec` | text only | nothing | a datasheet is deliberately not illustrated |
| `.close` | text only | nothing | |

**Feasibility confirmed, not assumed.** `ControlBar`, `Presence` and `PlanStrip` are pure
presentational components taking plain props — no context, no store, no WebSocket dependency:

```
ControlBar({ participants, driverId, selfId, pendingRequests,
             onRequestControl, onCancelRequest, onHandOver, onRelease })
Presence  ({ participants, driverId, selfId })
PlanStrip ({ plan })
```

Landing reuse is fixture props plus four no-op callbacks. No refactor, no `demo` variant, no
prop-drilling.

Why these two sections and not more: `.lock` is the differentiator and currently carries **zero**
visual, which is the worst allocation on the page. `#trust` makes an *architecture* claim, and
the right form for an architecture claim is a diagram — not a screenshot and not a component.
The remaining sections are text-shaped on purpose.

This also shrinks §4.9: with two real panels carrying visual weight through the mid-page, the
dithered photography is doing less work than it does for Nexflow, where it is the only thing
between seven flat product shots.

---

## 5. Font loading

Current `app/layout.tsx` (80 lines) loads three families via `next/font/google`:
`Geist` → `--font-geist-sans`, `JetBrains_Mono` → `--font-geist-mono`, `Archivo` →
`--font-display`.

**Availability confirmed**, not assumed — checked against
`packages/web/node_modules/next/dist/compiled/@next/font/dist/google/font-data.json`:

| Family | Available | Weights | Variable axes |
|---|---|---|---|
| `Geist` | yes | 100–900 + variable | yes |
| `Geist Mono` | yes | 100–900 + variable | yes |

**API confirmed against the installed docs**, per `packages/web/AGENTS.md`. Next.js here is
**16.2.12**; `node_modules/next/dist/docs/01-app/01-getting-started/13-fonts.md` shows the
`next/font/google` call signature unchanged — import the family, call it with `subsets` /
`variable` / `weight`, apply the variable class on `<html>`. No API migration needed.

**The change is a net simplification: three families become two.**

```
Geist        → --font-geist-sans   (body)   ← unchanged
Geist        → --font-display      (display) ← was Archivo
Geist_Mono   → --font-geist-mono   (mono)    ← was JetBrains_Mono
Archivo                                       ← removed entirely
```

Two consequences:

- **Geist is already loaded.** Pointing `--font-display` at the same instance costs zero
  additional bytes, and removing Archivo *deletes* a font download. The redesign makes the
  page lighter.
- `--font-display` and `--font-sans` resolving to one family means the display/body contrast
  axis `DESIGN.md` describes ("paired on a genuine contrast axis, not two similar sans faces")
  no longer exists. **That is what the reference does** — its whole type system is one sans
  plus one mono, and the axis is sans-vs-mono, not sans-vs-sans. `DESIGN.md`'s typography
  section must be rewritten to say so rather than left contradicting the code.

Keep `--font-display` as a distinct token even though it aliases Geist: the indirection is
what lets the display face change later without touching every call site.

**Ligatures:** the ledger disables ligatures because `=>` must render as `=>`. Geist Mono's
default ligature behaviour differs from JetBrains Mono's; the existing
`font-variant-ligatures: none` on `.ledger-*` must be verified to still hold, not assumed.
See §9 Q2.

---

## 6. File map

| File | Lines now | Change | Why |
|---|---|---|---|
| `packages/web/app/globals.css` | 2,861 | **Split** into the files below, then reduced to imports + `@theme` | Over the 1,000-line hard cap; see §7.1 |
| `packages/web/app/styles/tokens.css` | new ~130 | Token values | §3 |
| `packages/web/app/styles/primitives.css` | new ~95 | `.frame`, `.hatch`, texture, `.badge` | §4.3, §4.9 |
| `packages/web/app/styles/landing.css` | new ~670 | Every landing rule | §4 |
| `packages/web/app/styles/ledger.css` | new ~260 | Ledger; ligature + status-glyph changes | §0.3, §5 |
| `packages/web/app/styles/chrome.css` | new ~740 | Session chrome; status badge de-chroming | §0.3 |
| `packages/web/app/styles/rails.css` | new ~640 | Workspace + sessions rails | token ripple |
| `packages/web/app/styles/agent.css` | new ~300 | Agent chip, share, turn dividers | token ripple |
| `packages/web/app/styles/suggestions.css` | new ~150 | Suggestions block | token ripple |
| `packages/web/app/layout.tsx` | 80 | `Archivo` → `Geist`; `JetBrains_Mono` → `Geist_Mono` | §5 |
| `packages/web/app/page.tsx` | 363 | Drop `<em>` accent; mount two new section panels | §4.2, §4.10 |
| `packages/web/components/landing/HandoverPanel.tsx` | new ~70 | `.lock` visual: `Presence` + `ControlBar` on fixture props | §4.10 |
| `packages/web/components/landing/TopologyDiagram.tsx` | new ~50 | `#trust` visual: CSS/SVG architecture diagram | §4.10 |
| `packages/web/components/landing/DemoLedger.tsx` | 180 | Status colours → glyph + neutral | §0.3 |
| `packages/web/app/session/[id]/page.tsx` | 364 | `StatusBadge` variants lose green/amber | §0.3 |
| `packages/web/components/StreamView.tsx` | 468 | Failure row: coral → glyph + `--text` | §0.3 |
| `packages/web/components/PlanStrip.tsx` | 91 | Pip colours follow the new status rules | §0.3 |
| `packages/web/app/opengraph-image.tsx` | 109 | Hardcoded colours + font refs must track the palette | Ships a stale palette otherwise |
| `DESIGN.md` | 402 | Rewrite: theme, colour, typography, accent-discipline sections | Records the shipped result |
| `PRODUCT.md` | 109 | **No change** | §0.1 |
| Surface brief | new | Landing register + direction contract | §0.1 |
| `docs/session.png`, `docs/plan.png` | — | Regenerate | §7.4 |

`app/opengraph-image.tsx` is easy to miss and would otherwise keep serving cyan-on-black
social cards for a coral-on-`#0A0A0A` site.

---

## 7. Verification gates

Each phase is proved by its own gate. No phase starts before the previous gate passes.

### 7.1 Gate A — the split is a no-op

The split must change zero pixels. Prove it, don't assert it:

1. Screenshot the landing page and a mock session at 390 / 768 / 1440 before the split.
2. Split.
3. Screenshot again and diff. **Any non-zero pixel diff is a bug in the split**, not an
   improvement to keep.
4. `.claude/hooks/check-file-size.sh` reports no file over 1,000 lines.

Splitting first means every later diff is small and reviewable, and the redesign lands under
the cap rather than pushing a 2,861-line file further past it.

### 7.2 Gate B — tokens measured

Every text/background pair in **both** surfaces measured by canvas pixel readback with alpha
compositing, ≥4.5:1 normal, ≥3:1 large. Explicitly including:

- All three grounds × `--text`, `--text-dim`, `--text-faint`.
- `--accent` on all three grounds.
- `#0A0A0A` on any coral fill (**never `#FAFAFA` — 3.22:1**).
- The `color-mix` at the recessed-plan-row site (§3.6), re-measured after both inputs change.
- Every one of the 13 `--text-faint` sites confirmed against its *actual* ground.

Reject any value that only passes on `--bg`; solve for the worst ground.

### 7.3 Gate C — landing renders

- No horizontal scroll at 390 / 768 / 1024 / 1440 / 1920.
- Every heading fits without overflow at every width.
- Headings measurably weight 400 and −0.05em (read back from computed style, not eyeballed).
- No green, amber or cyan anywhere on the landing page.
- No fake social proof.

### 7.4 Gate D — session UI intact

- A full mock run renders correctly at 1440 and 390 against an **isolated scratch server on a
  non-default port** — never `:3000`/`:4000`.
- Live, done, and failed are distinguishable at a glance without relying on hue (§0.3).
- Ledger ligatures still off: `=>` renders as `=>` in Geist Mono.
- Regenerate `docs/session.png` and `docs/plan.png`.

### 7.5 Gate E — the mechanical detector

`impeccable context` reports `MANUAL_DETECTOR_REQUIRED`: no automatic design hook is active
this session. Run the detector **once, after implementation is finished** — not during concept
selection, and not per-phase:

```bash
~/.claude/skills/impeccable/scripts/impeccable detect --json packages/web/app packages/web/components
```

Then the finish review and the documenter pass that rewrites `DESIGN.md` from the built
result rather than from this plan's intentions.

### 7.6 Gate F — the slop test

Look at the finished page and ask whether someone could name the Framer template it came from.
The user has explicitly chosen fidelity to the reference, so the previous plan's answer
(diverge on texture and cards) no longer applies. What still carries Relay's own identity: the
spec sheet, the live `DemoLedger` showing a real transcript, the honest nav, and the absence of
pricing/testimonials/social proof. If the page reads as a template *despite* those, the
problem is content, not styling.

---

## 8. Phases and rollback

Branch first — currently on `ui-redesign`, working tree clean at `12b8bbf`. Nothing is
committed unless you ask.

| # | Phase | Gate | Rollback |
|---|---|---|---|
| 0 | Split `globals.css` into `app/styles/*`; no visual change | A | `git checkout -- packages/web/app` |
| 1 | Tokens: neutrals, coral accent, radius, measure, gutter | B | revert `styles/tokens.css` |
| 2 | Fonts: `layout.tsx` → Geist + Geist Mono, drop Archivo | C (type only) | revert `layout.tsx` |
| 3 | Landing type scale: weights to 400, tracking to −0.05em, sizes to the measured scale | C | revert `styles/landing.css` |
| 4 | Landing layout: hero 1:1, 75rem measure, 32px gutter, 64px section padding | C | revert `styles/landing.css` |
| 5 | Page rhythm: `HandoverPanel` + `TopologyDiagram` (§4.10) | C | delete both files, revert `page.tsx` |
| 6 | Texture decision (§4.9 / §9 Q1) | C | revert `styles/primitives.css` |
| 7 | Session UI: de-chrome status, glyph-carried failure, ledger ligature check | D | revert `styles/{ledger,chrome,rails,agent}.css` |
| 8 | `opengraph-image.tsx`, `DESIGN.md`, surface brief, screenshots | E, F | revert individually |

Each phase is one commit, so rollback is `git revert <sha>` for any single decision without
losing the others. Phase 0 being a proven no-op is what makes every later revert clean.

Full abort: `git checkout main -- packages/web/app packages/web/components` restores the
current system in one command.

---

## 9. Open questions — needed before implementation

**Q0 — Page rhythm (blocks Phase 5).** §4.10 proposes closing the reference's visual-rhythm gap
with two live component panels rather than seven baked screenshots, on the grounds that Relay's
product is a screen and is already on the page live. Confirm that, or say you want literal
screenshot parity — in which case the plan needs a screenshot-capture step and a policy for
keeping ~7 PNGs current, since the repo has no capture tooling today.

**Q1 — Texture assets (blocks Phase 6).** Matching the reference's dithered photography needs
source images. Relay has none, and I will not invent or source them unilaterally. Either
supply images (and confirm licensing), or approve the CSS-native Bayer dither in §4.9 option 2.
I recommend option 2: no assets, no licensing, and it reads as the same instrument-print
family as the existing hatch. Note the reference bakes photo and product panel into one flat
PNG per section; Relay cannot do that with live panels, so the photography would sit *behind*
the panels as a separate field rather than composited with them.

**Q2 — Ledger ligatures (blocks Phase 7).** `DESIGN.md` treats "`=>` renders as `=>`" as
load-bearing. Geist Mono's ligature set differs from JetBrains Mono's. If
`font-variant-ligatures: none` does not fully suppress them in Geist Mono, which wins — the
reference's font, or the ledger's fidelity rule? I would keep the ledger rule and, if forced,
retain JetBrains Mono *inside the ledger only* while Geist Mono takes all other mono.

**Q3 — The diff colour carve-out (§0.3).** I have kept green/red inside expanded diffs as the
one chromatic exception, on the grounds that a diff is quoted git output rather than Relay
chrome. Confirm, or tell me to make diffs neutral too.

**Q4 — The hero `<em>`.** `.hero-title em` currently colours a word with the accent. Under the
new accent rule that word is not "live", so the colour has to go. Do you want the emphasis
kept by another means (weight, a rule beneath) or the `<em>` dropped entirely? I lean towards
dropping it — the reference's headlines carry no inline emphasis at all.

**Q5 — Status vocabulary breadth (§0.3).** Dropping `--state-ok` and `--state-warn` is the
strict reference match, but it removes green/amber from the *product*, where four states
(idle / working / done / error) currently read at a glance. I am confident glyph + weight
carries it, but this is the change with the largest blast radius outside the landing page, and
it is the one I would most want confirmed before Phase 7.

**Q6 — `DESIGN.md` rewrite scope.** Several of its arguments become false: pure black, the
Archivo rationale, the display/body contrast axis, and the cyan accent-discipline section.
Impeccable's documenter rewrites `DESIGN.md` from the built result at finish. Do you want that
full rewrite, or a minimal edit that patches only the now-false statements?
