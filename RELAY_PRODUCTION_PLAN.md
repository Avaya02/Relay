# Relay — Production-Readiness Plan

> Research report. No implementation code was written; the only file added is this one.
> Every claim below was verified against the running app, the installed `.d.ts`, or a
> primary-source doc fetched during research. Where I could not verify something, I say so.
>
> Research date: **2026-08-13**. Versions and prices were checked that day.

---

## 1. Executive summary

Relay's core is genuinely good. The `seq`-ordering guarantee, the server-enforced lock, and
the clone-and-dispose repo model are all real and all hold up under adversarial probing — I
tried to break the lock with a raw WebSocket and could not. That part of the spec is done and
you should stop worrying about it.

Everything else has a gap between "demoed once by hand" and "survives a stranger clicking
around." Five things, in priority order:

1. **A single malformed WebSocket frame kills the entire server process — every session on
   it, permanently.** `attachWs` registers `message` and `close` handlers but no `error`
   handler ([ws.ts:24](packages/server/src/ws.ts#L24)); in `ws`, a protocol-level error emits
   `'error'` on the socket, and an unhandled `'error'` on an EventEmitter throws. I reproduced
   this in isolation: normal disconnects (graceful close, TCP RST, half-close) all survive;
   an unmasked frame or a reserved opcode takes the process down. With no persistence, that is
   total, unrecoverable data loss for every concurrent viewer. **Two lines to fix.**

2. **The Agent SDK's subscription credential is not licensed for a deployed Relay.**
   Anthropic's legal-and-compliance page now states plainly that Anthropic "does not permit
   third-party developers to offer Claude.ai login or to route requests through Free, Pro, or
   Max plan credentials **on behalf of their users**." A deployed Relay where a viewer takes
   control and drives an agent is exactly that. This contradicts spec §5 and §8 and is the
   single biggest strategic risk in the project — see [§2.E](#e-production-deployment).

3. **A second instruction sent while the agent is running starts a second concurrent agent.**
   No guard at [ws.ts:99](packages/server/src/ws.ts#L99). I verified two runs interleaving in
   one transcript. Worse: the spec's own Phase 5 demo script calls for "a mid-task
   correction" — **the recorded walkthrough you're planning triggers this bug.**

4. **There is no reconnect, and no indication that anything is wrong.** I dropped the app's
   own socket mid-run: the browser kept rendering a normal-looking live session while the
   server moved on without it (4 rows rendered vs 11 events on the server), and the driver's
   next instruction was silently swallowed. Two people watching "the same" session can
   silently diverge — which is the one promise the product exists to make.

5. **Agent prose renders as literal markdown.** Confirmed visually on a real 32-event run: the
   final summary is a run-on paragraph full of `**bold**` asterisks and backticks. This is the
   most demo-visible defect and the cheapest of the five to fix.

**The single biggest risk** is #2, because it is the only one you cannot engineer around. Every
other item is a bounded amount of work. #2 is a decision about what Relay *is*: a local
instrument you demo yourself, or a deployed service — and the deployed version requires an API
key and real per-token cost. I need your call on this before any deployment work starts
([§4, Decision 1](#decision-1-what-does-deployed-mean-for-relay)).

---

## 2. Findings by area

Scope flags follow the brief: **in-scope** (inside spec §1), **crosses-out-of-scope** (spec §1
explicitly excludes it), **new territory** (spec doesn't address it).

### A. The action ledger — the signature surface

I generated a real 32-event run (13 tool calls, 46 seconds, Sonnet 5, against a session clone
of PromptGuard) and screenshotted the result rather than imagining it. Screenshots and the raw
event JSON are in the session scratchpad.

#### A1. `agent_text` renders as unformatted plain text — **confirmed, and worse than described**

**What's wrong.** [StreamView.tsx:72-78](packages/web/components/StreamView.tsx#L72-L78) is
`<p>{String(event.data.text)}</p>`. On the real run, the closing summary was a 943-character
single paragraph reading `...saved the report to **REPORT.md** at the repo root... covering
`apps/` (api-server, worker, web-dashboard)... 1. **Directory tree** (fenced code block)...`
— literal asterisks, literal backticks, a numbered list collapsed onto one line.

**What good looks like.** `react-markdown@10.1.0` (52 KB unpacked) + `remark-gfm@4.0.1`
(22 KB) renders GFM correctly and is **XSS-safe by construction** — it builds a React tree and
never touches `dangerouslySetInnerHTML` unless you explicitly add `rehype-raw`. `marked@18.0.9`
(468 KB) returns an HTML string and therefore requires DOMPurify plus `dangerouslySetInnerHTML`;
that is a strictly worse safety posture for a surface rendering model output.

**Recommendation: `react-markdown` + `remark-gfm`, and explicitly *not* `streamdown`.**
`streamdown@2.5.0` bills itself as "a drop-in replacement for react-markdown, designed for
AI-powered streaming," and its entire advantage is parsing *incomplete* markdown — an
unterminated code fence mid-stream. Relay took spec §4's option (a) and coalesces text into one
complete `agent_text` per assistant message, with `includePartialMessages` off
([agent.ts:150](packages/server/src/agent.ts#L150)). Text arrives whole. Streamdown's advantage
does not apply, and it costs 96 KB to not use it. If you ever switch to delta streaming,
revisit.

**On syntax highlighting: don't, yet.** `shiki@4.4.3` is 603 KB unpacked and would need a
custom theme hand-built from the §7 tokens to avoid clashing with the design system.
`rehype-highlight@7.0.2` (26 KB, highlight.js) is far lighter and themeable with CSS variables.
But the demo-blocking problem is "asterisks are visible," not "code isn't colored" — and the
agent's code blocks in a ledger are typically 3–10 lines. Style fenced code with the mono face
on `--surface-2` and ship. Add highlighting later if it still feels thin.

*In-scope · Effort S · Demo impact **high***

#### A2. Tool calls and results are two separate rows — 26 rows for 13 actions

**What's wrong.** Each `tool_call` and its `tool_result` render as independent siblings
([StreamView.tsx:80-94](packages/web/components/StreamView.tsx#L80-L94)), each with its own
timestamp, usually identical. The screenshot shows `▸ read README.md  18:49:13` immediately
followed by `✓ 100 lines  18:49:13`. Half the ledger is duplicate timestamps.

**Recommendation.** Fold the result into the call row: `▸ read README.md … ✓ 100 lines
18:49:13`, one row, one timestamp, with the row in a pending state until its result arrives.
The server already carries the correlation (`pending` map keyed by `tool_use_id`,
[agent.ts:114](packages/server/src/agent.ts#L114)) but drops it before broadcasting — add the
id to both events' `data` so the client can pair them. This halves ledger length and makes the
"flight recorder" read like one.

*In-scope · Effort M · Demo impact **high***

#### A3. Tool result summaries carry almost no information

**What's wrong.** Of 13 results in the real run, **12 were the bare string "N lines"**
(`22 lines`, `100 lines`, `190 lines`, `214 lines`…). `summarizeToolResult`
([agent.ts:102-103](packages/server/src/agent.ts#L102-L103)) short-circuits to a line count
whenever output is multi-line, which is nearly always. For `ran pwd && ls -la`, "22 lines"
tells a watcher nothing.

The 13th leaked an internal harness string into the product UI:
`✓ File created successfully at: REPORT.md (file state is current in your…` — that
parenthetical is the SDK's own message to the model, truncated mid-sentence by the 70-char clip.

**Recommendation.** Summarize per tool, not generically: `Read` → `100 lines`; `Bash` → exit
status plus the first meaningful output line; `Write`/`Edit` → `+12 −3` if derivable, else
`written`; `Grep`/`Glob` → `7 matches`. Strip known SDK boilerplate prefixes. Then make the row
expandable — collapsed by default, click to reveal the raw output in a scrollable block, which
also answers the brief's "long output handling" question without truncation heuristics.

*In-scope · Effort M · Demo impact **medium***

#### A4. Scroll anchoring fights the user — **verified**

**What's wrong.** [StreamView.tsx:17-19](packages/web/components/StreamView.tsx#L17-L19) calls
`scrollIntoView` on *every* change to `events.length`, unconditionally. I filled a ledger past
overflow, scrolled to the top mid-run, and measured: `scrollTop` went **0 → 245** as the next
events landed. A viewer cannot read back through a run while it is happening.

**Recommendation.** The standard fix: before appending, record whether the container is within
~80px of the bottom; only auto-scroll if it was. When it wasn't, show a "N new events ↓" pill
that jumps to the bottom on click. Also note `scrollIntoView` on a nested scroller can move
ancestor scroll containers — prefer setting `el.scrollTop = el.scrollHeight` on the pane itself.

*In-scope · Effort S · Demo impact **medium***

#### A5. No enter animation, no `prefers-reduced-motion`, no considered mono

**What's wrong.** Spec §7 calls the ledger "the one memorable thing" and asks for "a subtle
enter animation (respect `prefers-reduced-motion`)". Neither exists. The font is Geist Mono
via `--font-mono` ([globals.css:70](packages/web/app/globals.css#L70)) — a fine face, but it
came from `create-next-app`, not from a decision. §7 names JetBrains Mono or Berkeley Mono.

One further detail the screenshot exposes: the left rule is `border-l-2` **per row**
([StreamView.tsx:86](packages/web/components/StreamView.tsx#L86)) with `gap-2` between rows, so
it renders as a dashed ladder of disconnected stubs, not the continuous rule §7 describes.

**Recommendation.** One continuous 1px rule on the ledger container, rows hanging off it.
Enter animation: a 120–160ms opacity + 4px translate-y on newly-arrived rows only (not on
`history` replay — a late joiner should not watch 200 rows animate in), wrapped in
`@media (prefers-reduced-motion: no-preference)`. Swap `--font-mono` to JetBrains Mono via
`next/font/google`; it is free, and matching the spec's named face is worth the one-line change.

*In-scope · Effort S · Demo impact **high** (this is the signature surface)*

#### A6. History replay is unbounded

**What's wrong.** `join` sends the entire `events[]` in one frame
([ws.ts:65](packages/server/src/ws.ts#L65)) with no cap. Measured on the real run: **171 bytes
per event**, so a 500-event session replays as ~85 KB in a single message. Not catastrophic,
but it grows linearly forever and there is no back-pressure.

**Recommendation.** Cap the replay at the last N events (500 is generous) with a "session
started earlier" marker above it. Low urgency, but it's a two-line change that removes an
unbounded from the system.

*In-scope · Effort S · Demo impact **low***

---

### B. Landing page

#### B1. The hero does almost nothing, and there is a screen of dead space

**What's wrong.** At 1280×900 the content occupies a ~340px band in the middle of the viewport;
everything below the fake ledger is empty ([shot-landing.png]). The headline is the single
lowercase word `relay` ([page.tsx:27](packages/web/app/page.tsx#L27)) — a wordmark, not a
proposition. All the explaining is done by a 2-line subhead in `--text-dim`. For an idea as
unusual as "multiple people watching one live agent," five seconds of a visitor's attention is
currently spent on a word that means nothing to them yet.

**Recommendation.** Keep the display face doing one big rare thing, but let the headline carry
the idea — something in §7's voice ("what the person does"), e.g. **"Watch an agent work.
Together."** with `relay` demoted to a small wordmark in the corner. Then let the ledger fill
the space that's currently empty, at real size, not `max-w-sm`.

*In-scope · Effort S · Demo impact **high***

#### B2. The fake ledger is a placeholder, and a live demo ledger is the right replacement — but not a live *session*

**What's wrong.** [page.tsx:53-73](packages/web/app/page.tsx#L53-L73) hardcodes
`edited src/App.tsx` / `ran npm test — 4 passed` as static JSX, `aria-hidden`, connected to
nothing.

**Is an animated demo ledger gimmicky?** No — *if* it animates the thing the product actually
does. The reason is that Relay's whole claim is temporal ("live", "at the same time", "in
sync") and a static screenshot cannot express time. But there's a discipline: replay a **real
recorded transcript** (capture one from a genuine run — you now have a 32-event one) on a timer,
with two presence dots and the composer visibly locked on one side. That shows liveness *and*
multiplayer *and* the lock, which is the entire pitch, without a video and without a server.
It must respect `prefers-reduced-motion` by rendering the completed state.

**On the read-only demo session for unauthenticated visitors:** I'd skip it. It requires either
a persistent always-running agent (burning credit continuously) or an idle empty session that
demos nothing, plus it's the exact surface that makes the auth-policy problem in §2.E acute.
The recorded-transcript replay gets you ~90% of the value at ~5% of the cost and risk.

*In-scope · Effort M · Demo impact **high***

#### B3. Copy

Current copy is already close to §7's voice — "Start a session", "No sign-up — just a name and
a link." both follow the "write controls by what the person does" rule. Keep them. The only
change needed is the headline (B1). This section is solid; moving on.

---

### C. Session UX

#### C1. Dropped socket: no reconnect, no notice, silent divergence — **verified**

**What's wrong.** `useSession` opens one socket in an effect and, on close, only sets
`connection: "closed"` ([useSession.ts:65](packages/web/lib/useSession.ts#L65)). Nothing
retries. And because the session page gates only on `selfId !== null`
([page.tsx:27](packages/web/app/session/[id]/page.tsx#L27)), which stays set forever, the full
live UI keeps rendering.

I tested this by closing the app's own `WebSocket` mid-run (Playwright's offline emulation does
*not* reliably tear down an established WS — my first attempt was a false negative, and I
re-ran it properly). Measured:

| Observation | Result |
|---|---|
| New socket opened after close? | **No** — `window.__sockets` stayed length 1, readyState 3 |
| Disconnection notice on screen? | **No** — visually identical to a healthy session |
| Browser rows vs server transcript | **4 vs 11** — permanently 7 events behind |
| Driver sends another instruction | **Silently discarded** — `instruct()` checks `readyState === OPEN` and returns without telling anyone ([useSession.ts:127-132](packages/web/lib/useSession.ts#L127-L132)) |

The last row is the worst of it: the composer accepts the text, clears the input, and nothing
happens.

**Recommendation.** Three parts, in order of value:
1. **Tell the truth.** When `connection !== "open"`, show a persistent banner and disable the
   composer. This alone converts a silent correctness failure into a visible, honest one.
2. **Reconnect with backoff** (1s → 2s → 4s → capped at ~15s, with jitter) and re-`join` on
   open. Since `join` replays full `history`, the client catches up for free — the catch-up
   mechanism you already built for late joiners *is* the reconnect mechanism.
3. **Fix the ghost-participant bug first** (C2), because reconnect drives straight into it.

*In-scope · Effort M · Demo impact **high***

#### C2. Re-joining on the same socket leaks a ghost participant — **verified**

**What's wrong.** `join` unconditionally mints a new participant and overwrites the
socket→state mapping ([ws.ts:49-55](packages/server/src/ws.ts#L49-L55)). `connections` is keyed
by socket, so the first participant becomes unreachable and `close` only removes the second.

Probe result: after one socket joined twice, the session reported **3 participants** (should be
2), and after that socket closed, a ghost `alice` remained in the presence list forever.

No browser does this today — but a reconnect implementation is precisely a second `join`, and
if the server ever re-uses a socket the leak is immediate. Fix before C1's part 2.

**Recommendation.** On `join`, if the socket already has a `ConnectionState`, either reject or
reuse the existing participant. Better: give clients a resumable participant token so a
reconnect re-attaches to the same identity instead of appearing as a new person — otherwise
every flaky-wifi blip shows up in everyone's presence bar as a stranger arriving.

*In-scope · Effort S · Demo impact **medium***

#### C3. A second instruction mid-run runs two agents at once — **verified**

**What's wrong.** [ws.ts:93-100](packages/server/src/ws.ts#L93-L100) appends the instruction
and calls `runAgent` with no check on `session.status` or `session.agentAbort`. Probe result:
both instructions accepted, no error sent, **22 events, 6 tool calls (one run is 3), 2
`agent_done` events**, visibly interleaved:

```
 1 user_instruction   first task
 2 agent_text         On it — looking into "first task".
 3 tool_call          ran ls src/
 4 user_instruction   second task          ← second run starts
 5 agent_text         On it — looking into "second task".
 6 tool_result        12 files
 7 tool_call          ran ls src/
```

`seq` stayed monotonic (the ordering guarantee holds — it just faithfully orders nonsense).

With the **real** SDK this is materially worse than the mock shows, in three ways:
- Both `query()` calls pass the same `resume: session.agentSessionId`
  ([agent.ts:136](packages/server/src/agent.ts#L136)) — two agents resuming one conversation.
- `session.agentAbort = abort` ([agent.ts:112](packages/server/src/agent.ts#L112)) is
  overwritten, orphaning the first run's controller. It can no longer be stopped, including by
  the last-disconnect teardown — **an abandoned tab can keep burning credit after all.**
- `session.workingDir ??= await prepareWorkingDir(...)`
  ([agent.ts:121](packages/server/src/agent.ts#L121)) is a check-then-await, not atomic. Both
  runs see `null`, both clone, and `prepareWorkingDir` starts with
  `rm(dir, {recursive:true, force:true})` ([repo.ts:47](packages/server/src/repo.ts#L47)) —
  the second run deletes the first run's checkout out from under it.

**Recommendation.** Decide the semantics, then enforce them server-side. The three options, and
what each buys:

| Option | Behavior | Cost |
|---|---|---|
| **Reject** | `error: "the agent is still working"`, composer disabled while `status === "working"` | Trivial. Honest. Loses the "mid-task correction" demo beat. |
| **Queue** | Accept, show it pending in the ledger, run when the current turn ends | Small. Keeps the demo beat. Doesn't truly interrupt. |
| **Interrupt** | Abort the run, then start the new instruction | Requires deciding what a half-finished turn means |

**Recommend queue**, because it preserves the spec's own Phase 5 walkthrough script ("a
mid-task correction") while being genuinely simple: one array on the session, drained in the
`result` branch. Note that true `interrupt()` is **not available in the current architecture** —
the shipped `.d.ts` documents `Query.interrupt()` as "only supported when streaming input/output
is used," and Relay uses a plain string prompt with `resume`. `abortController.abort()` works,
but it is a stop, not an interrupt.

*In-scope · Effort M · Demo impact **high** (it's in the demo script)*

#### C4. Presence is fine at 2; the **control bar** is what breaks at 8

**What's wrong.** I ran a session with 8 participants. The presence bar itself *just* fits at
1280px (the last name lands at x≈1245 of 1280) — one more person and it clips. But the real
failure is elsewhere: `ControlBar` renders **one full-width row with a "Hand over" button per
participant**, unconditionally
([ControlBar.tsx:32-54](packages/web/components/ControlBar.tsx#L32-L54)). At 8 people that is a
7-row block consuming ~40% of the viewport, squeezing the ledger — the signature surface — into
a strip.

At 375px with 8 participants the header's `scrollWidth` is **675px against a 375px client
width**, and `document.documentElement` scrolls horizontally. At 2 participants mobile is
clean (44px gap, no clipping, verified) — it degrades from 3 up.

**Recommendation.** Presence: show 4 dots + "+4" past a threshold, full list on hover/tap.
Control bar: replace the per-participant row list with a single "Hand over ▾" menu, and keep
only pending requesters promoted as inline rows — that's the case that actually needs
one-click action.

*In-scope · Effort M · Demo impact **medium***

#### C5. No way to stop a running agent, and no cost/time visibility

**What's wrong.** The server can already stop a run — `session.agentAbort` exists and is used
on last-disconnect ([ws.ts:191](packages/server/src/ws.ts#L191)) — but no protocol message and
no UI exposes it. A driver who fires a bad instruction watches it run.

Separately, the SDK hands you run economics for free and Relay throws them away. The installed
`SDKResultSuccess` type carries `total_cost_usd`, `usage`, `num_turns`, `duration_ms`, and
`modelUsage`; [agent.ts:187-190](packages/server/src/agent.ts#L187-L190) matches on
`msg.subtype === "success"` and emits `{ kind: "agent_done", data: {} }` — an empty object.

**Recommendation.** Add `stop` to the protocol (driver-only, same guard shape as `instruct`)
wired to `agentAbort`; and put `duration_ms` / `num_turns` / `total_cost_usd` into the
`agent_done` event so the ledger's closing row reads
`— done · 13 steps · 46s · $0.04 —`. That last line is a strong portfolio detail: it shows you
understand what running an agent actually costs.

One bug to fix alongside: on abort, `runRealAgent` returns early
([agent.ts:202](packages/server/src/agent.ts#L202)) **without** calling `setStatus`, so the
session is pinned at `working` forever. Harmless today (abort only happens when everyone has
left) but it becomes visible the moment a stop button exists.

*Stop button + cost display: **new territory** (spec doesn't address either) · Effort S ·
Demo impact **high***

#### C6. No cancel for a pending control request

Known gap, and it's genuinely minor — but it's ~10 lines given the existing `key={driverId}`
remount pattern in [ControlBar.tsx:70](packages/web/components/ControlBar.tsx#L70). The reason
to do it is that "Requested — waiting for avi" with no escape is a small dead end in the exact
flow you'll be demoing. Add a `cancel_request` message and let the button toggle.

*In-scope · Effort S · Demo impact **low***

#### C7. Join payload is unvalidated

**What's wrong.** Probe result: a `join` with no `displayName` is accepted (participant
broadcast with `displayName: undefined`), and a **100,000-character** name is accepted and
broadcast to every participant. There's no length cap, no type check, no trim.

**Recommendation.** Validate at the boundary: require a string, trim, cap at ~32 chars, reject
empty. Cheap, and it's the difference between "no auth by design" and "no input validation."

*In-scope · Effort S · Demo impact **low***

---

### D. Functionality gaps

#### D1. Persistence (spec §6.5): what it actually buys

**The honest answer: with the schema as specced, it's an audit mirror, not session survival.**
Spec §6.5's `Session`/`Event` tables persist the transcript, but a session's *live* state —
`participants` (holding live sockets), `driverId`, `agentAbort`, `agentSessionId`, `workingDir`
— is inherently in-memory. After a restart you could re-materialize the transcript, but the
agent conversation, the working dir, and the lock are gone.

I verified the user-visible consequence: killed the server with a tab open, restarted it,
reloaded. The tab shows the join screen and then **`no session "6NgDZbyv97"`** — a dead link.
The join gate does handle this correctly and honestly (that's a good judgment call already
made), but the link is dead.

**What it buys, precisely:**
- ✅ Transcripts survive restarts and can be reviewed later — the "durable session transcript"
  talking point, which is real.
- ✅ A dead link can render a **read-only replay** instead of an error — a much better failure
  mode, and genuinely impressive in a demo ("the server restarted and the session is still
  there to read").
- ⚠️ Sessions can *resume* only if you also persist `agentSessionId` and re-clone the working
  dir — feasible (the SDK's `resume` is exactly this), but a distinctly larger job than the
  mirror.
- ❌ It does not make the app restart-transparent.

**Recommendation.** Ship the mirror as specced, write `agentSessionId` into the `Session` row
while you're there (it costs one column and preserves the option), and make dead links render
the persisted transcript read-only. Do **not** attempt full session resume for this build.

**Write path:** `appendEvent` ([transcript.ts:14](packages/server/src/transcript.ts#L14)) is
already the single place every event is born — mirror from there, fire-and-forget with a
`.catch()` so a DB hiccup can never block or crash the broadcast. That function's design is
what makes this a small change; it was the right call.

*In-scope (spec §6.5 names it) · Effort M · Demo impact **medium***

#### D2. Per-session repo selection

**Recommendation: don't.** Spec §1 puts "per-session sandbox isolation / multi-tenant repo
handling" out of scope and says "one demo repo is fine." Accepting a repo URL per session means
accepting attacker-chosen input into `git clone`, and the agent runs with
`permissionMode: "bypassPermissions"` ([agent.ts:132](packages/server/src/agent.ts#L132)) — an
arbitrary repo can carry `.claude/` config, hooks, or a `CLAUDE.md` that steers the agent. The
clone-and-dispose model is a safety property; this would put attacker-controlled content
*inside* the sandbox. The env-var-per-process model is correct for this build.

*Crosses-out-of-scope · Not recommended*

#### D3. Rate limiting / abuse control **if** publicly reachable

Deferred to [§2.E](#e-production-deployment) and [§4](#4-open-decisions-for-you) — it is
inseparable from the deployment decision. Spec §1 explicitly excludes rate limiting, so if
Relay stays local this is correctly not built.

One item belongs here regardless: **[index.ts:50](packages/server/src/index.ts#L50) calls
`bootstrapDemoSession()`, creating a permanently-available session at the guessable id
`demo`.** I connected to it with no invite and was **auto-granted the driver lock**. On
localhost that's a convenience. On anything publicly reachable it is an open, unauthenticated
handle to an agent that executes shell commands on your machine. Delete it before any tunnel
goes up — it's a Phase 1 leftover the real `POST /sessions` path replaced.

*Removing the demo session: **in-scope** · Effort S · Demo impact **none** (pure risk removal)*

---

### E. Production deployment

This is where the spec has been overtaken by events. I fetched the primary sources rather than
trusting the (loud, and somewhat overstated) news coverage.

#### E1. The auth constraint — verified against the primary source

Anthropic's [legal and compliance page](https://code.claude.com/docs/en/legal-and-compliance),
under **"Authentication and credential use"**, states verbatim:

> **OAuth authentication** is intended exclusively for purchasers of Claude Free, Pro, Max,
> Team, and Enterprise subscription plans and is designed to support ordinary use of Claude
> Code and other native Anthropic applications.
>
> **Developers** building products or services that interact with Claude's capabilities,
> including those using the Agent SDK, should use API key authentication through Claude Console
> or a supported cloud provider. **Anthropic does not permit third-party developers to offer
> Claude.ai login or to route requests through Free, Pro, or Max plan credentials on behalf of
> their users.**
>
> Anthropic reserves the right to take measures to enforce these restrictions and may do so
> without prior notice.

And under Acceptable use: *"Advertised usage limits for Pro and Max plans assume **ordinary,
individual usage** of Claude Code and the Agent SDK."*

Note the secondary coverage (The Register, Feb 2026 and others) reports this as a blanket
"Agent SDK + subscription OAuth is banned." The primary source is **narrower and more precise**
than that, and the precision is what matters for Relay:

- Your own individual Agent SDK use, on your machine — **contemplated and fine.**
- Routing *another person's* requests through your Pro/Max credential — **explicitly not
  permitted.**

That second line is Relay's core feature. The moment a viewer takes control and drives, the
server runs their instruction on your subscription credential on their behalf.

**Mechanically**, `claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN` still exists and still works
(it's #5 in the [authentication precedence list](https://code.claude.com/docs/en/authentication),
a one-year token, "requires a Pro, Max, Team, or Enterprise plan"). So spec §8's path 2 is
*technically* achievable and *contractually* not permitted. The spec is honest that this is the
hard part; it just predates the policy. **Flagging this as the spec conflict the brief asked
for: spec §5's "authenticate with your Claude subscription, not a pay-per-token API key" and
§8's path 2 are both now wrong for anything other than you driving it yourself.**

Also worth knowing: subscription logins **expire**. The docs describe a "Your login expires in
3 days · run /login to renew" warning and note that "a background session... that outlives the
login stops making progress once the credential expires and can't recover until you sign in
again." An unattended deployed Relay on a subscription credential would silently die.

On billing: `RELAY_STATUS.md` is currently correct — the
[support article](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan)
says the separate-credit-pool change was **paused**, and Agent SDK usage "still draw[s] from
your subscription's usage limits."

#### E2. What the API-key answer costs

If Relay is deployed, an API key is the honest answer. Current first-party pricing (checked
2026-08-13):

| Model | Input /MTok | Output /MTok |
|---|---|---|
| Claude Opus 5 | $5.00 | $25.00 |
| Claude Sonnet 5 | $3.00 (**$2.00 intro through 2026-08-31**) | $15.00 (**$10.00 intro**) |
| Claude Haiku 4.5 | $1.00 | $5.00 |

Prompt caching: reads ≈0.1× input; writes 1.25× (5-min TTL) or 2× (1-hour). The Agent SDK
caches aggressively across turns, so a multi-turn session is much cheaper than naive
token-counting suggests.

The change this forces isn't really the money — it's that **cost becomes unbounded and
attacker-controllable.** Anyone with a link drives an agent that spends your money. Which is
why D3/rate-limiting stops being optional the moment deployment happens.

Two SDK options I verified in the shipped types and docs that directly bound this:
`maxBudgetUsd` ("stop when cost estimate reaches USD value") and `maxTurns`. Both are
`query()` options available today, and both are one-line additions to
[agent.ts:126](packages/server/src/agent.ts#L126). Even for local use, `maxBudgetUsd` is cheap
insurance against a runaway loop.

#### E3. The deployment paths, concretely

**Path 1 — local + tunnel (recommended, and still what spec §8 says).** `cloudflared` quick
tunnels: **WebSockets are supported** ("Cloudflare Tunnel supports WebSocket connections"),
`trycloudflare.com` subdomains require **no Cloudflare account**, and the documented caveat is
that account-less tunnels have **no uptime guarantee** — fine for a live demo or a recording,
not for a link you leave up. A named tunnel (free Cloudflare account + a domain you own) fixes
the stability and gives a stable hostname.

- **Cost:** $0.
- **Auth:** your own login on your own machine — no credential copying, and the least
  policy-exposed configuration.
- **Breaks:** your laptop is the server; sleep kills it. And a friend taking control still
  routes their request through your subscription (see E1) — acceptable for a supervised live
  demo, not for a link you post publicly.

**Path 2 — deploy the server.** Both Railway and Render run always-on instances that handle
WebSockets; Fly.io is the strongest of the three for long-lived connections (connection-aware
routing) but its scale-to-zero must be **disabled** — a stopped machine drops every socket and
destroys all in-memory session state. Render's free tier is disqualified outright: it spins
down after 15 minutes idle with a 30–50s cold start. Realistic floor is ~$7/mo (Render Starter)
or metered equivalents on Railway/Fly. **All of this requires the API key from E2.**

**Frontend + wiring.** Vercel for `packages/web` is fine. `NEXT_PUBLIC_WS_URL` is read at
module scope ([useSession.ts:11](packages/web/lib/useSession.ts#L11)) and inlined at build
time, so it must be set as a Vercel build-time env var — changing the tunnel URL requires a
redeploy. Two things to fix when this happens: it must become `wss://` (a `https://` Vercel
page cannot open an insecure `ws://` socket — mixed content is blocked), and
[api.ts](packages/web/lib/api.ts) needs the same treatment for the `POST /sessions` origin.
Also tighten `access-control-allow-origin: "*"`
([index.ts:22](packages/server/src/index.ts#L22)) to the known frontend origin.

**Recommendation: Path 1, with a named tunnel, and delete the `demo` session first.** It's what
the spec says, it's free, it's the least policy-exposed, and for a portfolio artifact the
recorded walkthrough is the deliverable anyway.

*Tunnel: **in-scope** (spec §8) · Effort S · Demo impact **high***
*Deployed + API key + rate limiting: **crosses-out-of-scope** · Effort L · Demo impact **low***

---

### F. Quality floor

#### F1. The server crashes on malformed frames — **the highest-severity finding**

Covered in the executive summary; details here. `attachWs`
([ws.ts:24-25](packages/server/src/ws.ts#L24-L25)) registers `'message'` and `'close'` on each
socket and never `'error'`. `ws` handles *socket-level* errors internally (that's why RST is
survivable) but routes *protocol* errors through `websocket.emit('error', err)`, and Node
throws on an unhandled `'error'` event.

Isolated trials, one server process per trigger, clean port between each:

| Client behavior | Result |
|---|---|
| Graceful `ws.close()` | SURVIVED |
| Abrupt TCP RST (flaky network) | SURVIVED |
| Half-close (FIN, no close frame) | SURVIVED |
| **Unmasked client frame** (RFC 6455 violation) | **CRASHED** — `WS_ERR_EXPECTED_MASK` |
| **Reserved opcode** | **CRASHED** — `WS_ERR_INVALID_OPCODE` |

The good news is that ordinary flaky networks are safe. The bad news is that one hand-crafted
packet — no auth, no session id needed — terminates every session on the box, and with no
persistence they are gone for good.

**Recommendation.** `socket.on('error', ...)` that logs and terminates that one socket, plus
`process.on('uncaughtException')` / `unhandledRejection` as a backstop, plus a process manager
that restarts (`tsx watch` in dev already does; a deployment needs `restart: always`).

*In-scope · Effort S · Demo impact **high** (a crash mid-demo is the worst outcome available)*

#### F2. No server-side heartbeat

The protocol defines `ping`/`pong` ([protocol.ts:46](packages/shared/src/protocol.ts#L46)) and
the server answers `ping` — but nothing ever *initiates* one. Half-open TCP connections (laptop
lid, NAT timeout) leave phantom participants in the presence list and phantom sockets in
`broadcast`. This also matters behind a tunnel or proxy, which will close idle connections.

**Recommendation.** The standard `ws` pattern: server-side `setInterval` pinging every ~30s,
`terminate()` any socket that missed the previous pong.

*In-scope · Effort S · Demo impact **low** (but it's what keeps a long recording alive)*

#### F3. Zero tests — what's actually worth testing

The valuable tests are the invariants that are hard to check by eye and catastrophic when
broken. Everything I probed by hand this week is a test you should own:

1. **`seq` monotonicity under concurrency** — the spec's "single most important correctness
   detail."
2. **The lock is server-enforced** — a raw non-driver `instruct` is rejected and creates no
   event. (Holds today; a test keeps it holding.)
3. **`history` replay** — a late joiner receives exactly the events that already happened, in
   order.
4. **Driver disconnect frees the lock**, and the disconnected participant leaves the list.
5. **Regression tests for every bug in this report** — double-join, concurrent instruct,
   malformed frame, oversized `displayName`.

Not worth testing: React component rendering, the mock agent's script, CSS.

**Runner: `node:test`, not Vitest.** I verified it works on this machine (Node v22.17.0,
`describe`/`it` both present). The server is plain Node + `ws` with no bundler; `node --test`
needs **zero new dependencies and zero config**, and the tests are all "boot a server on a
port, connect real sockets, assert on messages" — exactly what it's good at. Vitest 4.1.10 is
excellent and would be the right answer if you wanted component tests, but adding a test
framework + config to get less than `node --test` already gives you is the wrong trade for a
project this size. The one wrinkle: server sources are TS, so run via `tsx --test` or add a
build step.

*In-scope-ish (spec's "quality floor", §7) · Effort M · Demo impact **low**, but high
interview value*

#### F4. The root `pnpm` scripts are all broken — **verified**

**What's wrong.** [package.json:8-10](package.json#L8-L10) uses an unquoted glob:

```
"dev":       "pnpm --parallel --filter ./packages/** dev",
"build":     "pnpm --recursive --filter ./packages/** build",
"typecheck": "pnpm --recursive --filter ./packages/** typecheck",
```

The shell expands `./packages/**` before pnpm sees it:

```
$ pnpm --recursive --filter ./packages/server ./packages/shared ./packages/web typecheck
[ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT] None of the selected packages has a "./packages/shared" script
```

`pnpm build` and `pnpm typecheck` both fail this way. **Quoting the glob fixes all three** —
I confirmed `pnpm --recursive --filter "./packages/**" typecheck` runs clean across all three
packages with no type errors. `eslint` also passes clean.

This matters beyond the annoyance: it contradicts `RELAY_STATUS.md`'s "How to verify it
yourself" instructions, so the first thing a reader tries fails. And it means **no CI could
have been green**, because the commands CI would run don't work.

*In-scope · Effort S (one line) · Demo impact **low**, credibility impact high*

#### F5. Accessibility — measured, and it's the weakest area

Measured on a live session with events streaming:

| Check | Result |
|---|---|
| `aria-live` regions anywhere on the page | **0** |
| `role="status"` | **0** |
| `<h1>` on the session page | **0** |

A screen-reader user is never told that anything streamed in — on an app whose entire purpose
is streaming. Focus rings are genuinely good (the 4px ring-offset fix noted in
`RELAY_STATUS.md` was a real fix, and I saw it render).

**Recommendation.** A polite `aria-live="polite"` region announcing new ledger entries in a
compressed form (`"read README.md, 100 lines"`) rather than the whole DOM; `role="log"` on the
ledger container; a visually-hidden `<h1>` naming the session; `aria-live="assertive"` on
control changes ("avi is now driving") since those change what *you* can do.

**Contrast is fine — I checked, and it's a non-issue.** I expected the dim text at `text-xs` to
be a problem and it isn't. Computed ratios for the §7 tokens:

| Pair | Ratio | AA (4.5:1 normal text) |
|---|---|---|
| `--text-dim` on `--surface` | 5.72:1 | pass |
| `--text-dim` on `--surface-2` (control bar) | 5.18:1 | pass |
| `--text-dim` on `--bg` | 6.18:1 | pass |
| `--text` on `--surface` | 14.47:1 | pass |
| `--accent` on `--surface` | 9.29:1 | pass |

The §7 palette holds up. The a11y work here is entirely about live regions and structure, not
color.

*In-scope (spec §7 "Quality floor") · Effort M · Demo impact **low**, portfolio impact high*

#### F6. Structured logging and unhandled agent errors

The server logs exactly one line, at boot ([index.ts:53](packages/server/src/index.ts#L53)).
Nothing logs session creation, joins, instructions, agent errors, or teardown — so when
something goes wrong in a demo there is no record of it.

`runRealAgent`'s catch does the right thing for the *client* (emits `agent_error`, sets status)
but never writes server-side ([agent.ts:200-207](packages/server/src/agent.ts#L200-L207)), so
an SDK failure is invisible in your terminal.

**Recommendation.** No logging library needed at this size — a small `log(event, fields)`
helper emitting one JSON line per event (`session_created`, `participant_joined`, `instruct`,
`agent_error`, `session_disposed`) with the session id in every line. That's a 20-line file
that makes the whole system debuggable, and it's what you'd point at in an interview.

*New territory · Effort S · Demo impact **low***

#### F7. CI worth having

Once F4 is fixed: one GitHub Actions workflow on push/PR — `pnpm install --frozen-lockfile`,
`typecheck`, `lint`, `test`. That's it. No deploy step (there's nothing to deploy under the
recommended path), no matrix, no coverage gates.

*New territory · Effort S · Demo impact **low***

---

## 3. Sequenced plan

Phased like spec §9. Each phase ends at something you can show.

### If you only have one day

Do **Phase 5a** below and nothing else. In priority order: the crash fix, the markdown
renderer, the instruct guard, and the disconnect banner. That is roughly a day, and it converts
Relay from "impressive until someone pokes it" to "solid." The design pass is more visible but
strictly less important than not crashing and not silently lying about session state.

### Phase 5a — Correctness and honesty *(~1 day)*

The bugs that make the app wrong rather than unpolished.

1. `socket.on('error')` + `uncaughtException` backstop **(F1)**
2. Markdown rendering for `agent_text` **(A1)**
3. Guard/queue concurrent `instruct`, and fix the `workingDir` race and orphaned `agentAbort`
   **(C3)**
4. Disconnected-state banner + disable composer when the socket isn't open **(C1 part 1)**
5. Fix the root `pnpm` scripts **(F4)**
6. Delete `bootstrapDemoSession()` **(D3)**
7. Validate `join` payloads **(C7)**

**Demoable:** the same walkthrough as today, but a mid-run correction behaves sensibly, agent
prose is readable, and you can't crash it from a terminal.

### Phase 5b — The ledger design pass *(~1–1.5 days)*

Spec §7's signature surface, which is the thing people remember.

1. Merge `tool_call` + `tool_result` into one row **(A2)**
2. Better result summaries + expand-on-click for raw output **(A3)**
3. Continuous left rule, JetBrains Mono, enter animation with `prefers-reduced-motion` **(A5)**
4. Scroll anchoring that respects the user **(A4)**
5. `agent_done` carrying duration / turns / cost, and a stop button **(C5)**

**Demoable:** the ledger reads like an instrument. This is the screenshot that goes in the
portfolio.

### Phase 5c — Multiplayer robustness *(~1 day)*

1. Fix the double-join ghost **(C2)**
2. Reconnect with backoff + re-join **(C1 parts 2–3)**
3. Server-side heartbeat **(F2)**
4. Presence overflow + control-bar menu at scale **(C4)**
5. Cancel a pending control request **(C6)**

**Demoable:** kill the wifi mid-run, watch it reconnect and catch up. That is a *better* demo
beat than anything currently in the script, because it shows the `history`-replay design paying
off twice.

### Phase 5d — Persistence + landing page *(~1–1.5 days)*

1. Postgres transcript mirror from `appendEvent`, storing `agentSessionId` **(D1)**
2. Dead links render the persisted transcript read-only **(D1)**
3. Landing page: headline, layout, recorded-transcript replay ledger **(B1, B2)**
4. Reap in-memory session records after a grace period

**Demoable:** restart the server with a session link open; reload; read the whole transcript
back.

### Phase 5e — Quality floor *(~0.5–1 day)*

1. `node:test` suite for the five invariants + regressions **(F3)**
2. Structured JSON logging **(F6)**
3. Accessibility: live regions, `role="log"`, `h1` **(F5)**
4. GitHub Actions **(F7)**

### Phase 5f — Record the walkthrough

Named tunnel, two windows, one live agent, a mid-task correction (which now works), a control
hand-off, and a reconnect. Stop here, per spec §9.

---

## 4. Open decisions for you

### Decision 1: What does "deployed" mean for Relay?

The auth policy in [§2.E1](#e1-the-auth-constraint--verified-against-the-primary-source) makes
this a real fork, not a preference.

| | **A. Local + tunnel** | **B. Deployed + API key** |
|---|---|---|
| Cost | $0 | ~$7/mo + per-token |
| Auth | Your login, your machine | API key (policy-clean) |
| Policy exposure | Low (none if you're the only driver) | None |
| Needs rate limiting | No | **Yes** — crosses spec §1 |
| Link works when laptop sleeps | No | Yes |
| Effort | S | L |

**My recommendation: A.** It's what spec §8 already says, it keeps you inside spec §1's
out-of-scope list, and for a portfolio piece the recorded walkthrough is the artifact — a
permanently-live URL that costs money and needs abuse controls buys very little extra. If you
later want a live link for a specific conversation, B is a well-understood afternoon's work on
top of A, and the plan above doesn't foreclose it.

**But this is genuinely your call**, because it hinges on something I don't know: whether you
want to send this link to people asynchronously (recruiters, say) or only ever drive it live.
If it's the former, B is the honest answer and rate limiting comes with it.

### Decision 2: What should a second instruction mid-run do?

**Recommend: queue it** ([§C3](#c3-a-second-instruction-mid-run-runs-two-agents-at-once--verified)).
Reject is simpler; interrupt is not really available in the current `resume`-based
architecture. Queue preserves the spec's own "mid-task correction" demo beat. Say the word if
you'd rather just reject — it's a smaller change and defensible.

### Decision 3: Persistence — mirror only, or aim at resume?

**Recommend: mirror only, but store `agentSessionId`.** Full resume is out of proportion to the
remaining budget, and the mirror already buys the two things that matter (durable transcripts,
read-only dead links). Storing the one extra column keeps resume available later for free.

### Decision 4: Model for the recorded demo

`RELAY_STATUS.md` flags that Haiku 4.5 fumbled the `Read` tool three times. Your `.env` is
already on `claude-sonnet-5`, and my 32-event verification run on Sonnet 5 had **zero** tool
errors and finished in 46s. **Recommend staying on Sonnet 5** — and note the intro pricing
($2/$10 per MTok) runs through **2026-08-31**, so if you're doing many test runs, sooner is
cheaper. No change needed; flagging it because the status doc still lists this as undecided.

### Decision 5: Syntax highlighting in code blocks?

**Recommend: not in this build** ([§A1](#a1-agent_text-renders-as-unformatted-plain-text--confirmed-and-worse-than-described)).
Shiki is 603 KB and needs a hand-built theme to match §7. Ship styled-but-uncolored fenced code
first and see whether it actually feels lacking.

---

## 5. Explicitly not recommended

Things I looked at and rejected, with reasons.

- **`streamdown` for markdown.** Its whole advantage is parsing incomplete markdown mid-stream,
  and Relay coalesces text into complete `agent_text` events (spec §4 option (a)), so there is
  nothing incomplete to parse. 96 KB for an unused capability. Revisit only if you switch to
  delta streaming.

- **`marked` + DOMPurify.** Works, but it means `dangerouslySetInnerHTML` on model output.
  `react-markdown` gets the same result with no raw-HTML path at all. Strictly worse safety for
  no benefit.

- **Shiki for syntax highlighting, now.** 603 KB unpacked plus a custom theme build to avoid
  fighting the §7 palette, to color code blocks that are usually under ten lines. Wrong
  cost/benefit at this stage.

- **Vitest.** Genuinely better than `node:test` if you want component testing or a rich watch
  UI. You don't — the valuable tests are all socket-level server invariants, and `node --test`
  runs them with zero dependencies and zero config on the Node you already have.

- **Redis.** Spec §2 says it's optional and only needed for multiple server instances, and
  explicitly says "do not add it yet." Still true. One process, one Map.

- **Per-session repo selection.** [§D2](#d2-per-session-repo-selection) — it puts
  attacker-controlled content inside a sandbox where the agent runs with
  `bypassPermissions`. The clone-and-dispose model is a safety property; this weakens it, and
  spec §1 excludes it anyway.

- **A live read-only demo session on the landing page.** Requires either a continuously-running
  agent burning credit or an idle session that demonstrates nothing, and it's the exact surface
  that makes the [§E1](#e1-the-auth-constraint--verified-against-the-primary-source) policy
  problem acute. A replayed recording of a real transcript gets nearly all the value.

- **Free-for-all input / removing the lock.** Spec §1 out of scope, spec §6.4 explains exactly
  why (total ordering of competing instructions + defined semantics for interrupting
  mid-tool-call). It's a better interview answer as a described design than as a built feature.

- **Auth / accounts.** Spec §1 out of scope. The unguessable session id (nanoid, 10 chars from
  a 54-char alphabet ≈ 57 bits) is the intended access-control model, and it's adequate for
  link-sharing. Note this only holds once `bootstrapDemoSession()` is gone.

- **Switching the SDK to streaming-input mode to get real `interrupt()`.** The shipped `.d.ts`
  confirms `interrupt()` requires it, and it would be the "correct" way to interrupt a run. But
  it means holding an async iterable open across the whole session while instructions arrive as
  discrete WS events at unpredictable times — the `resume` approach was the right call for this
  architecture (spec §5 sanctions both), and `abortController.abort()` covers the stop button.
  Not worth re-architecting for.

- **Rewriting `POST /sessions` onto Express or a framework.** Bare `http` is ~50 lines and
  works. Spec §6.1 allows either. Adding a framework now is churn.

---

## Appendix: spec conflicts flagged

Per constraint 1, where this report and `RELAY_BUILD_SPEC.md` disagree, the spec wins and I
flag it. Two real conflicts:

1. **§5 "Authenticate the SDK with your Claude subscription... not a pay-per-token API key"
   and §8 path 2 ("provision your logged-in SDK credential to [a deployed server] as a
   secret").** Anthropic's current policy does not permit routing other people's requests
   through a Pro/Max credential, which is what a deployed Relay does. The spec is not wrong
   about the *mechanics* — `CLAUDE_CODE_OAUTH_TOKEN` still works — it predates the policy. This
   is the one place I'd say the spec should be amended rather than followed.

2. **§9 Phase 5's walkthrough script calls for "a mid-task correction,"** which triggers the
   concurrent-instruct bug in [§C3](#c3-a-second-instruction-mid-run-runs-two-agents-at-once--verified).
   Not a disagreement with the spec so much as a dependency it doesn't name: that demo beat
   requires the queue/reject work first.

Two apparent conflicts that are **not** conflicts, for the record:

- §6.6 says "do not re-clone-and-reinstall per session," and `repo.ts` clones per session —
  but from a **local pristine mirror**, which is the alternative that same paragraph explicitly
  offers ("or `git clone` from a local bare mirror"). Correct as built.
- §4's protocol table doesn't include `joined`, and §6.4 doesn't define who grants control when
  nobody is driving. Both additions are documented in `RELAY_STATUS.md` and both fill genuine
  gaps. Correct as built.
