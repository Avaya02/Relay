# React & Frontend State Management

Grounded in `packages/web/lib/useSession.ts`, `StreamView.tsx`, `WorkspaceRail.tsx`,
`PlanStrip.tsx`, and `recentSessions.ts`.

---

### Q: Where does client-side state live in this app?

**A:** Almost all of it in one custom hook, `useSession(sessionId)`. It owns the
WebSocket connection, reduces every incoming server message into local React state
(`events`, `participants`, `driverId`, `status`, etc.), and exposes both that state and a
handful of action functions (`instruct`, `stop`, `handOver`, ...) to the page component.
The session page itself is close to a pure view over what the hook returns — almost no
business logic lives in the component tree.

### Q: What's the single most important state-management decision in this codebase?

**A:** **Derive, don't duplicate.** Several pieces of UI look like they need their own
piece of state, but are actually just a *computation over the event transcript that
already exists.* Three real examples:

1. **The plan strip.** The agent's `TodoWrite` calls are just tool-call events like any
   other. The "current plan" isn't stored anywhere separately — it's computed by scanning
   `events` backwards for the most recent one with a `plan` detail:

   ```ts
   function latestPlan(events: Event[]): PlanItem[] | null {
     for (let i = events.length - 1; i >= 0; i--) {
       const event = events[i];
       if (event.kind !== "tool_call") continue;
       const detail = (event.data as { detail?: ToolDetail }).detail;
       if (detail?.type === "plan" && detail.todos.length) return detail.todos;
     }
     return null;
   }
   ```

2. **Cumulative session cost.** Each `agent_done` event carries that turn's cost. The
   running total is just `events.filter(...).reduce(...)` — see `runTotals()` in the same
   file.

3. **Turn numbers in the ledger.** Every `user_instruction` event is a turn boundary, so
   the turn count is produced by walking the transcript once while building the ledger's
   rows (`buildRows()` in `StreamView.tsx`), not tracked as separate counter state.

### Q: Why does this matter — what would go wrong if you stored these separately instead?

**A:** Two things, both real, not theoretical:

- **Replay/reconnect correctness for free.** A late joiner gets the full `events` array
  via the `history` message. Because the plan, the cost, and the turn numbers are all
  *functions of* that array, they're automatically correct the instant history arrives —
  there's no separate "and also send them the current plan" message to remember, and no
  way for two viewers to disagree about what the current plan is, because they're
  computing it from the identical source array.
- **No synchronization bugs.** If "current plan" were its own piece of state, updated by a
  separate code path, there's a whole category of bug where an event updates the
  transcript but forgets to also update the plan state (or updates it in the wrong order),
  and the two silently drift apart. Deriving from a single source of truth makes that bug
  impossible rather than something to remember to avoid.

This is the same idea as `useMemo`-based selectors in Redux, or normalized-state-plus-
derived-selectors in general — compute expensive/duplicated-looking values from one
canonical array rather than maintaining parallel state.

### Q: Doesn't scanning the whole events array on every render get slow?

**A:** It's wrapped in `useMemo(() => latestPlan(events), [events])`, so it only
recomputes when the array reference actually changes — which happens once per incoming
event, not once per render. For a session with a few hundred events (a realistic upper
bound for one agent run), a linear scan is genuinely cheap; I didn't need a fancier
data structure. If sessions routinely had tens of thousands of events, I'd reach for an
incrementally-maintained "latest plan" ref updated as events arrive, rather than
re-scanning — but that's solving a problem the app doesn't actually have.

### Q: How is the workspace rail (file changes) different from the plan strip — it's not purely derived, is it?

**A:** Good catch if asked, and worth explaining precisely rather than overclaiming purity.
It's a **merge of two sources**, not a single derivation:

- A **live half**, read straight from the transcript (`Write`/`Edit` tool-call events) —
  shows a file the instant the agent touches it, with no line counts yet, because nothing
  has measured them.
- An **authoritative half**, pushed from the server once a turn settles — real `git diff
  --numstat` output with actual insertion/deletion counts and a real diff.

The authoritative data supersedes the live guess for the same path once it arrives. I
was explicit about this being two sources merged, not one derivation, in the code
comments — pretending it was "just derived like the plan strip" would be a real inaccuracy
in an interview if pressed on it.

### Q: What's `localStorage` used for, and why not just always fetch from the server?

**A:** The sessions rail — "which sessions have I joined, in this browser." It's a
deliberate architectural choice tied to the no-accounts decision (see the auth file):
there's no server-side concept of "your sessions," because there's no user identity to
attach that to. `localStorage` is per-browser truth about what *this browser* has been
in — genuinely different data than anything the server could answer, not a caching layer
in front of a server endpoint that doesn't exist.

### Q: `localStorage` reads during render will throw — how did you handle the server/client mismatch?

**A:** `useRecentSessions()` returns empty state on first render and reads the actual
data inside a `useEffect`, not during the render itself. This matters for two separate
reasons: Next.js renders the initial HTML on the server, which has no `localStorage` at
all, so reading it directly would throw during server rendering; and even purely on the
client, a component that reads from a mutable, unpredictable outside source (private
browsing mode, disabled site data, a full quota) needs to do it somewhere React expects
side effects — `useEffect`, not render — or you risk hydration mismatches, where the
server-rendered HTML and the first client render disagree.

### Q: Where does `Date.now()` show up, and why was that a bug?

**A:** `useRecentSessions` originally called `Date.now()` directly inside the component
body to compute "how long ago" labels (`"3h"`, `"just now"`) while iterating the session
list during render. React's rules of components explicitly forbid impure reads during
render — a "pure" render means calling it twice with the same state should produce the
same output, and `Date.now()` obviously doesn't. React's own lint rule
(`react-hooks/purity`) caught it directly. The fix: the clock value is captured once,
inside the `useEffect` that also reads `localStorage`, and returned *alongside* the
session list rather than read fresh during every render — with a 60-second `setInterval`
to keep "just now" from silently going stale an hour later.

### Q: What's the auto-scroll behavior in the ledger, and what edge case did it need to handle?

**A:** The ledger auto-scrolls to the newest event — but *only* if the viewer was already
at the bottom. If someone's scrolled up to read an earlier part of a long run, the next
incoming event must not yank their scroll position back down; that's exactly the kind of
thing that makes a live-updating feed unusable. It's tracked with a `pinnedToBottom`
boolean, set by a scroll listener with ~24px of slack (so a scroll position that's a hair
off "exactly at the bottom" still counts as pinned), and a `useLayoutEffect` that only
force-scrolls when `pinnedToBottom` is true. When it's not, a small "N new events" pill
appears instead, letting the viewer jump back down explicitly.
