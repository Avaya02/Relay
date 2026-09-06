# Critique — landing page (`packages/web/app/page.tsx`)

Date: 2026-09-07
Method: ⚠️ DEGRADED single-context (harness withholds sub-agent spawning unless the user asks)
Mode: Persuade · Register: brand
Applicable maximum: 32 (heuristics 7 and 10 scored n/a for a Persuade surface)

## Score: 24/32

| # | Heuristic | Score |
|---|---|---|
| 1 | Visibility of System Status | 3 |
| 2 | Match System / Real World | 4 |
| 3 | User Control & Freedom | 3 |
| 4 | Consistency & Standards | 3 |
| 5 | Error Prevention | 2 |
| 6 | Recognition Over Recall | 3 |
| 7 | Flexibility & Efficiency | n/a |
| 8 | Aesthetic & Minimalist | 4 |
| 9 | Error Recovery | 2 |
| 10 | Help & Documentation | n/a |

## Deterministic scan
`impeccable detect --json packages/web/app/page.tsx packages/web/components/landing`
→ `[]`, exit 0. Zero findings.

## Design specificity
Authored, not assembled — the hatch bands, ledger panel, topology diagram and
halftone all encode this product's argument specifically. Weakness is structural
monotony, not genericness: folds 2 and 3 share one layout, folds 4 and 5 share
another.

## Priority issues
1. **[P1] Nothing on the page can be verified.** No repo, source, author or
   version link anywhere. Only outbound link is Anthropic's SDK docs. Footer is
   two words and no links. Highest-leverage fix on the page.
2. **[P1] "Your code stays on your machine." overclaims.** The agent sends file
   contents to Anthropic's API. The section prose scopes the claim to Relay's
   server; the h2 does not. Volunteering the model boundary would persuade more
   than the current silence.
3. **[P2] Copy argues almost entirely by negation.** 9 em-dashes and 7 triads in
   49 sentences; ~12 of ~20 body paragraphs turn on what the thing is not. The
   formula reads as machine-written, not any single line.
4. **[P2] Join form has no failure path.** `handleJoin` routes without validating;
   `.hero-error` is styled in CSS and never rendered.
5. **[P2] Primary nav CTA is inert.** `Get started` scrolls to a command block
   already on screen; the code carries a flash hack so the click registers.

## Minor
- Three photo bands reuse the same crop of the source photograph.
- Folds 2 and 3 are structurally identical; reference alternates its sections.
- `TopologyDiagram` is `aria-hidden`, so the strikethrough `no repository` never
  reaches screen readers.
- Nav "What it is" links to a section titled "One writer. Never two."
