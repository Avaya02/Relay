# Product

## Register

product

## Users

**Primary: small engineering teams doing collaborative agent work.** Two to six people
who already use an AI coding agent individually and want to do it together. Their
context is a shared work session — someone is at a keyboard driving, others are
watching on their own screens, often on a call at the same time. Concretely:

- **Onboarding** — a junior watches a senior drive an agent through a real task in the
  real codebase, and can take the wheel mid-task without a screen-share handoff.
- **Pairing on something gnarly** — two people who each have context the other lacks,
  steering one agent instead of arguing over one keyboard.
- **Review-as-it-happens** — watching the agent's edits land, rather than meeting them
  cold in a pull request an hour later.
- **Teaching / demoing** — one driver, many watchers, no "can you see my screen?"

The job to be done: *watch an agent work on our code, together, and be able to take
over without losing the thread.*

**Secondary reality: this is also a portfolio artifact.** It has to survive an engineer
reading the source and an interviewer watching a three-minute walkthrough. That does
not change the design register — the most convincing demo is a tool that looks like it
was built to be used, not one built to be demoed.

## Product Purpose

Agent sessions are single-player. When an agent works for twenty minutes, nobody else
can watch it happen — you get a transcript afterward, if that. The closest existing
thing, Claude Code's own session sharing, is a static snapshot that only updates on
reload, and there is no way for a second person to steer.

Relay makes an agent session a **room**: everyone holding the link watches the same
live stream in the same moment, exactly one person drives, and control hands off
cleanly. The agent engine is the Claude Agent SDK — the same engine Claude Code runs —
so output quality is inherited. What Relay adds is the collaboration layer nobody else
provides: live multi-viewer streaming, catch-up for late joiners, and a
server-enforced driver lock.

Success looks like: a second person opens the link mid-run, is caught up within a
second, understands what the agent is doing without asking, and can take control in
two clicks.

## Brand Personality

**Precise. Alive. Quiet.**

A calm, focused control room for watching a mind work. The subject's world is
terminals, live presence, and the quiet tension of who is holding the wheel. The
interface should feel like an instrument — something that reports faithfully and does
not editorialize. Confidence comes from restraint and accuracy, not from decoration.

The one place boldness is spent is the **action ledger**: a live, monospaced,
timestamped record of what the agent is doing, ticking in real time like a flight
recorder. Everything else stays still so the ledger can move.

Voice: write controls by what the person does — *Start a session*, *Request control*,
*Hand over to alex*, *Release*. Empty states are invitations, not moods. Errors state
what happened and what to do.

## Anti-references

- **Generic AI dark mode** — near-black plus one acid accent, glowing gradients,
  purple-on-black. Spec §7 calls this out explicitly and it is the default failure
  mode for this category.
- **Another chat app.** Tool calls are not chat bubbles. If the ledger reads like a
  messaging thread, the design has failed.
- **An IDE clone.** Relay is not competing with Cursor or the Claude Code extension on
  editing surface. No file tree, no editor pane, no tab bar. It is a *watching and
  steering* surface; borrowing IDE chrome would promise something it does not deliver.
- **Dashboard-ware.** No stat tiles, no sparkline row, no "hero metric" header. There
  is exactly one stream of truth on this screen.

## Design Principles

1. **The ledger is the product.** Every other element exists to frame it. When
   something competes with the ledger for attention, the other thing loses.
2. **Report, don't editorialize.** Show what happened, with a timestamp, in the
   agent's own terms. Summarize for scanability; never invent confidence the system
   doesn't have. A failed step says *why* it failed.
3. **Density is a feature.** A real run is 30+ events. Anything that looks fine at
   five events and unreadable at fifty is wrong. Optimize for the fiftieth event.
4. **Two screens must agree.** Anything that could make one viewer's picture differ
   from another's — silent staleness, client-side ordering, optimistic rendering — is
   a correctness bug, not a UX preference.
5. **State is never ambiguous.** Who is driving, whether the agent is working, whether
   you are still connected: each is answerable at a glance, and the interface never
   implies a capability the connection can't currently deliver.

## Accessibility & Inclusion

- **Target: WCAG 2.2 AA.** The §7 token palette already clears it — measured 5.18:1
  worst case (`--text-dim` on `--surface-2`), 14.47:1 for primary text.
- **Streaming content must be announced.** The ledger is a live region; new entries are
  announced politely in compressed form, control changes assertively (they change what
  the user can do). This is currently the weakest area — there are zero live regions
  today.
- **Reduced motion is a hard requirement.** The ledger's enter animation is the one
  piece of motion in the app; under `prefers-reduced-motion: reduce` entries appear
  without transition. Nothing depends on animation to become visible.
- **Keyboard-complete.** Every control reachable and operable by keyboard, with a
  visible focus ring using the accent (already implemented, with a 4px offset so the
  ring reads against same-hue fills).
- **Never color-alone.** Success/failure carry a glyph (`✓` / `✗`) as well as a hue, so
  the ledger is readable with any form of color blindness.
