# Interview Prep — Relay

Q&A files for talking about this project in interviews. Every answer is grounded in
actual code in this repo — file paths and line-level detail are included on purpose, so
you can go verify anything and internalize it, rather than memorizing lines.

## How to use these

1. Read `00-project-overview.md` first — it's the "walk me through your project" answer,
   and everything else expands on pieces of it.
2. The other files go deep on one topic each. Read whichever matches the role/interviewer
   focus, or all of them if you have time.
3. Where a file says "here's a real bug I found" — those are the strongest stories in
   here. They show debugging process, not just a finished feature. Know them well enough
   to tell as a story without reading off the page: what looked fine, what you checked
   that made you suspicious, what you found, how you fixed it, how you proved the fix
   worked.
4. Where a file is honest about a limitation ("no auth," "no horizontal scaling," "no
   rate limiting") — **don't hide these if asked.** Volunteering them, with a clear
   explanation of *why* the trade-off was made, reads as more senior than pretending the
   project has no weak points. Every "what's missing" answer in here also says what you'd
   do about it, which is the part that actually matters.

## Files

| File | Covers |
|---|---|
| `00-project-overview.md` | The pitch, the stack, the one-sentence differentiator, request walkthrough |
| `01-websockets-and-realtime.md` | WebSocket fundamentals, the ordering guarantee, heartbeat, reconnect, a crash bug I fixed |
| `02-concurrency-and-locking.md` | The driver lock, instruction queueing, and a real git race condition I found and fixed |
| `03-auth-and-security.md` | Why there's no auth, input validation, and the API-key credential-routing bug (the best story in the project) |
| `04-react-state-management.md` | The `useSession` hook, derive-don't-duplicate, localStorage, a React purity bug |
| `05-database-and-persistence.md` | Postgres as an audit mirror (not source of truth), Prisma 7's new config model, read-only replay |
| `06-system-design-tradeoffs.md` | Scaling limits, rate limiting, production-readiness gaps — said plainly, with what you'd do about each |

## The three stories worth having ready cold

If an interview only has time for one or two "tell me about a bug" questions, these are
the strongest, in order:

1. **The API key silently routing to the wrong account** (`03-auth-and-security.md`) — a
   feature that *looked* correct and produced successful runs, but was silently billing
   the wrong account. Found by verifying the actual credential on the wire rather than
   trusting a green checkmark. Best story because the bug was genuinely invisible without
   deliberate verification.
2. **The concurrent git race** (`02-concurrency-and-locking.md`) — found live while doing
   something unrelated, correctly diagnosed as a general concurrency problem (not a
   one-off), fixed with a real synchronization primitive, and includes a reentrancy trap
   you had to reason through.
3. **The unhandled socket error crashing the whole process** (`01-websockets-and-realtime.md`)
   — a one-line fix, but a good example of "one bad input from any user, no auth needed,
   takes down every session on the box" — the kind of severity story that's short to tell.
