# System Design & Trade-offs

The "so what would you change / what breaks at scale / why didn't you..." file. Interviewers
use these questions to check whether you understand your own project's limits or just
built it and moved on. Being specific and honest here reads as senior; being vague or
defensive reads as junior.

---

### Q: What's the biggest structural limitation of this system?

**A:** It's a single Node process holding all session state in memory — the `Map` of
`Session` objects in `sessions.ts` never leaves that process. That means:

- **No horizontal scaling.** You can't run two instances behind a load balancer, because a
  WebSocket connection is pinned to whichever process it opened on, and that process is
  the *only* one that knows about the session's driver lock, event array, and working
  directory.
- **A restart drops every live connection.** Covered in detail in the persistence file —
  Postgres mirrors the transcript, but the live state (sockets, the lock, the working
  directory) is gone.

I'd say this plainly rather than let an interviewer discover it: it's a deliberate scope
boundary for "a small team on a trusted network," not an oversight.

### Q: If you had to make this scale to many concurrent sessions across multiple servers, what would you change?

**A:** The core problem is that a session's state and its live connections need to live
in the same place for the current design to work. Two real approaches:

1. **Sticky sessions + shared session state.** Keep sessions pinned to one server (via a
   load balancer's session affinity, or by routing on session id), but move the
   *durable* state (the event log, the driver lock) into something like Redis, so a
   server crash doesn't lose in-flight sessions — another instance could pick up a session
   after a restart, at the cost of real complexity in "who owns this session right now."
2. **Pub/sub fan-out.** Keep each session pinned to one server for *writes* (still one
   place decides `seq` order — that invariant can't be relaxed without solving the
   ordering problem all over again), but let *any* server accept a WebSocket connection
   for a session and subscribe to that session's event stream via something like Redis
   pub/sub or a message queue. Reads scale out; the single-writer property for ordering
   stays intact.

Either way, the one property I would refuse to give up is **single point of ordering
truth per session** — that's the thing the whole product's correctness rests on, and
distributing it is a much bigger, riskier project than distributing everything else.

### Q: Why is there no rate limiting?

**A:** Same category of honest gap as auth — not built, for the same reason (small trusted
team, not a public endpoint). If this were public-facing, I'd rate-limit at minimum:
session creation (`POST /sessions` — nothing stops someone from creating thousands),
instruction sends per session (an agent run has real cost, and a compromised or careless
driver could burn through API credit fast), and WebSocket connection attempts per IP.

### Q: What would you do differently about the mock agent, if this were a "for real" v2?

**A:** Nothing, actually — I'd keep it, and I'd defend that choice. The scripted mock
agent isn't a placeholder for something unfinished; it's a deliberate, permanent part of
the architecture. It streams the *same event shapes* the real agent produces (same
`ToolDetail` types, same `agent_done` structure), so the entire UI — the ledger, the plan
strip, the workspace rail — was built and tested against it with zero API cost. Every
feature in this project, including ones I built in later sessions, got verified first
against a scripted mock before ever touching a real model. That's a genuinely useful
pattern for any project where the "real" backend is slow, costly, or has side effects:
build a contract-compatible fake early, and keep it around as the default so both
development and the public demo cost nothing.

### Q: What's the actual production readiness gap between "runs on my machine" and "I'd deploy this for a real team"?

**A:** In order of how much I'd worry about each:

1. **The auth/validation boundary** — covered fully in the auth file. Fine as-is for a
   trusted network; not something to expose publicly without a join-approval step.
2. **Single point of failure** — covered above. Acceptable for a small team's internal
   tool; not acceptable for anything with an SLA.
3. **The GitHub publish path is undertested** — committing and pushing to a local bare
   remote is tested; the actual `POST /repos/{owner}/{repo}/pulls` call against live
   GitHub has never been exercised end-to-end. I'd want that proven before depending on it.
4. **No rate limiting** — a real cost risk once a server is reachable by more than a
   handful of trusted people.

I'd rather list these unprompted than have an interviewer find the first one and wonder
what else I'm not saying.

### Q: What's a design decision you made that you'd defend even if someone pushed back on it?

**A:** The one-driver-at-a-time lock, if someone suggests "why not just let everyone type
and merge it somehow." I'd hold that line: the alternative is a much harder distributed-
systems problem (ordering competing instructions, defining what "interrupt mid-tool-call"
even means) in service of a use case — several people typing into one agent
simultaneously — that isn't actually how teams collaborate around one person driving a
task. The constraint is the feature, not a limitation I ran out of time to lift.

### Q: What's something you'd genuinely reconsider if you rebuilt this?

**A:** Whether `SESSION_KEY_ENV`-style server-managed temp files (the API key helper
script) are the right long-term pattern versus, say, a Unix domain socket or an in-process
credential provider if the SDK ever supports one — the file-on-disk-that-echoes-an-env-var
approach works and is provably secretless, but it's a workaround for a gap in the SDK's
public API (`env` being silently ignored) rather than something I'd call elegant. I'd
watch for the SDK adding a first-class "inject a key without touching the environment"
option and switch to it.
