# Concurrency & Locking

Two different concurrency problems live in this codebase, at two different layers. Don't
conflate them in an interview — they're solved differently and an interviewer who knows
the space will notice if you blur them together.

1. **Human concurrency** — two people trying to drive at once. Solved with the driver lock.
2. **Process concurrency** — two async operations touching the same git working directory
   at once. Solved with a per-directory queue. This one was a real bug I found and fixed.

---

## Part 1 — The driver lock

### Q: What problem does the driver lock actually solve?

**A:** An AI agent that writes files can't sensibly take instructions from two people at
once — whose instruction wins? What if they conflict? Relay sidesteps the whole problem by
making it structurally impossible: **exactly one participant can send input at a time.**
Not "the UI discourages it" — the server rejects it.

### Q: Where is the lock actually enforced?

**A:** `packages/server/src/ws.ts`, in the `instruct` message handler:

```ts
if (participant.id !== session.driverId) {
  send(socket, { type: "error", message: "only the driver can send instructions" });
  return;
}
```

That's it. That's the whole security boundary. The button being disabled in the React UI
for non-drivers is a courtesy — it stops an honest user from being confused. This check is
what stops a dishonest one from bypassing it with a hand-crafted WebSocket frame sent from
the browser console.

### Q: How does control get handed off?

**A:** Three ways, all going through `setDriver()` in `sessions.ts` so every path stays
consistent:

- **Request → grant.** A non-driver sends `request_control`. If nobody's driving, they get
  it immediately (nothing to wait for). If someone is, the current driver gets a
  `control_requested` message and can approve or ignore it.
- **Direct hand-over.** The driver can hand control to *any* connected participant
  directly, without them asking — `hand_over` with a target participant id.
  Driver-only, enforced server-side the same way `instruct` is.
- **Release.** The driver can drop the lock; nobody drives until someone claims it.

### Q: What happens if the driver just closes their laptop?

**A:** Same grace-window mechanism as reconnection (see the WebSocket file), but a
different outcome depending on whether they come back. If they reconnect within 30
seconds, they're still the driver — nothing changed. If the grace window expires,
`finalizeDisconnect()` explicitly frees the lock (`setDriver(session, null)`) rather than
leaving the session permanently stuck with a driver who's never coming back. There's no
auto-reassignment to someone else — the room has to explicitly claim it, which avoids a
surprising "wait, who's driving now?" moment.

### Q: What about instructions sent while the agent is already working?

**A:** They queue — they don't race. `session.instructionQueue` is a plain array. If a
second instruction arrives while `session.status === "working"`, it's pushed onto the
queue *and* appended to the transcript immediately (so everyone sees it was sent right
away), but the actual agent run doesn't start until the current one settles. See
`onRunSettled()` in `agent.ts`, which drains one instruction off the queue each time a run
finishes. This is what makes it safe to run unattended — there's a hard guarantee that
only one agent run is ever in flight against one working directory at a time.

### Q: Why not let people type into the agent freely, like a chat, and merge everyone's input?

**A:** I get asked this and the honest answer is: I deliberately didn't attempt it. Free-
for-all input needs a defined answer to "what does it mean to interrupt the agent
mid-tool-call," and total ordering of *competing* instructions from different people is a
genuinely hard problem — you'd need some kind of operational-transform or CRDT-style
merge, or an explicit "your turn" negotiation UI, and either way you've built a different,
much bigger product. One-driver-at-a-time is a real constraint, but it turns a hard
distributed-systems problem into a solved one for the actual use case (a team watching one
person work).

---

## Part 2 — The git working-directory race (a real bug)

This is the strongest "tell me about a bug you found and fixed" story in the project,
because I found it by accident while doing something unrelated (regenerating README
screenshots), reasoned about the root cause correctly, and fixed it generally rather than
patching the symptom.

### Q: Describe a concurrency bug you actually found in this project.

**A:** `sessionChanges()` in `repo.ts` runs a sequence of raw git commands (`git add -A`,
then `git diff --numstat`, then `git diff --cached`) against a session's working
directory to compute what's changed. It's called every time a client sends
`request_changes` — and I'd made every client send that automatically the moment they
join, so a late joiner sees the current state immediately.

That's fine for one client. But when **two** participants join around the same time, both
of their `request_changes` calls hit `sessionChanges()` on the *same directory*
concurrently. Two concurrent `git add -A` calls in the same repo can collide, because git
takes a lock file (`.git/index.lock`) while staging — the second one fails with `fatal:
Unable to create '.git/index.lock': File exists`.

I found this live: a two-participant test session I was using to generate screenshots
just hung, and the server log showed exactly that error.

### Q: How did you fix it?

**A:** Not by special-casing `request_changes` — the same class of bug exists for
`publishSession()` too (it also runs multiple sequential git commands against the same
directory, and could race against a `request_changes` firing mid-publish). So I added a
general per-directory async queue in `repo.ts`:

```ts
const repoLocks = new Map<string, Promise<unknown>>();

function withRepoLock<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  const prior = repoLocks.get(dir) ?? Promise.resolve();
  const run = prior.catch(() => {}).then(fn);
  repoLocks.set(dir, run.catch(() => {}));
  return run;
}
```

Any caller that wants to touch a working directory's git state calls `withRepoLock(dir,
fn)`. Each call chains onto whatever's already queued for that directory, so operations on
the *same* directory always run one at a time, in order — but sessions run on
*different* directories don't block each other at all, because the map is keyed by path.

### Q: Why a hand-rolled promise chain instead of a mutex library?

**A:** Because the only property I actually needed was "the next operation on this
directory waits for the previous one to finish" — that's exactly what chaining promises
gives you for free, in about six lines, with no dependency. A `finally`/rejection edge
case I had to get right: the chain has to advance even if the operation *ahead* of it
threw, otherwise one failed git command would permanently wedge every future request
against that directory — that's what the `.catch(() => {})` on `prior` is doing.

### Q: There's a reentrancy trap here — did you hit it?

**A:** Yes, and it's worth mentioning because it shows I understood the lock rather than
just pattern-matching. `publishSession()` calls `sessionChanges()` internally as its
first step (it needs to know what changed before it can commit). If `publishSession` took
the lock and then called the *locked* `sessionChanges()` from inside itself, it would be
waiting for a lock it already holds — a deadlock, forever. The fix: I split the git logic
into an unlocked core function (`computeSessionChanges`) and a locked public wrapper
(`sessionChanges`). `publishSession` takes the lock once, at the top, and calls the
*unlocked* core directly from inside — it never asks for a lock it's already holding.

### Q: How did you verify the fix actually works, rather than just looking correct?

**A:** I wrote a script that reproduces the exact failure: two WebSocket clients join the
same session, then fire five concurrent `request_changes` from each socket in a tight
loop — the same shape of traffic that broke it originally. Before the fix, that produced
`.git/index.lock` errors. After the fix: zero errors, all ten requests answered, and every
answer reports the *same* file count (proving there's no torn read where one caller sees
a half-staged state). I also specifically tested that `publishSession` still works
correctly with `request_changes` calls racing against it, since that path shares the same
lock. Both are in the project's verification scripts from that session.
