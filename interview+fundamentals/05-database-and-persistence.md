# Database & Persistence

Grounded in `packages/server/src/persist.ts`, `packages/server/prisma/schema.prisma`,
`packages/server/prisma.config.ts`, and the "read-only replay" path in `ws.ts`.

---

### Q: What does Postgres actually store, and what does it *not* store?

**A:** It's a mirror of the transcript and a small amount of session metadata — **not**
the live, working state of a session. Two tables, essentially: `Session` (id, status,
driverId, the SDK's own conversation id) and `Event` (one row per transcript event —
`seq`, timestamp, kind, who did it, and its data as JSON). What's deliberately *not* in
Postgres: the actual WebSocket connections, the driver lock as a live concept, the
in-memory `instructionQueue`, or the agent's cloned working directory on disk. All of
that only exists in the running Node process's memory.

### Q: Why that split — why not make Postgres the actual source of truth?

**A:** Because the things that aren't in Postgres are exactly the things that don't make
sense to persist across a restart anyway — an open TCP socket, an `AbortController` for
an in-flight agent run, a directory on the local filesystem. Full "survive a server
restart" (session resume) is a real, larger feature — the SDK does support resuming a
conversation by id — but it's a distinctly bigger job than an audit mirror, and I chose
not to build it for this project's scope. Being upfront about that distinction, rather
than implying more durability than actually exists, is the honest answer.

### Q: What actually happens if the server restarts while a session is live?

**A:** Every live connection drops (sockets die with the process). If someone opens that
session's URL again: the session isn't in the server's in-memory map anymore, so the
server checks Postgres. If the transcript is there, it renders as a **read-only replay** —
you see everything that happened, but there's no participant identity to join as, no
driver, no way to send a new instruction. That's the `ReplayMessage` path — see the
`replay` handling in `ws.ts`'s `handleJoin()`. A dead link becomes "here's what happened,"
not a raw error, which is the honest middle ground given the actual persistence model.

### Q: How are writes to Postgres kept from blocking or crashing the live app?

**A:** Every write is fire-and-forget. `mirrorEvent()` and `mirrorSessionMeta()` in
`persist.ts` call Prisma and attach a `.catch()` that just logs — they're never `await`ed
by their callers. The reasoning: a database hiccup must never block or crash the live
broadcast to everyone in the room. If Postgres is down, sessions keep working perfectly
for everyone connected — they just silently lose the "survives a restart" property until
the database comes back. That's a deliberate trade-off: live experience is never allowed
to degrade because of a persistence-layer problem.

The **read** path (`loadPersistedSession`, used for the replay feature) is the one
exception — it *is* awaited, because reading the transcript back is the entire point of
that feature, not a side effect of it.

### Q: `DATABASE_URL` is optional — what happens if it's not set?

**A:** `getPrisma()` returns `null`, and every persistence function checks for that and
short-circuits immediately. The whole feature degrades gracefully to "off" — sessions work
identically for anyone currently connected, they just don't survive a restart and dead
links produce a plain error instead of a replay. This was a real design goal: Postgres
should be additive, never a hard dependency for the app to function at all.

### Q: What's Prisma 7, and what changed enough to be worth mentioning?

**A:** Prisma 7 introduced a materially different config model from what most
Prisma-familiar people expect (I hit this directly and had to research it live rather
than trust memory of older Prisma versions):

- The database connection URL is **no longer in `schema.prisma`**'s `datasource` block —
  putting it there now fails with `P1012: property 'url' is no longer supported`.
- Instead, there's a separate `prisma.config.ts` using `defineConfig`/`env()`, and the
  client is constructed with an explicit **driver adapter**:
  ```ts
  new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
  ```
- The generator provider changed from `"prisma-client-js"` to `"prisma-client"`, with an
  explicit `output` path for the generated client rather than the old implicit location.

Worth mentioning if asked "how do you handle working with something you don't already
know" — the honest answer is: I read the actual current docs and verified against the
`.d.ts` / generated output rather than assuming the API matched training data or an older
version I'd used before, because it visibly didn't.

### Q: Why the `git clone` + disposable working directory model instead of, say, storing file contents in the database?

**A:** Because the agent needs a *real filesystem* to run real tools against — `npm test`,
`grep`, editing files with normal file I/O. Each session gets its own throwaway clone of a
pristine local mirror (which is itself cloned once from `RELAY_SOURCE_REPO`); the agent's
working directory is never the user's actual source checkout. The clone is deleted the
moment the last participant leaves (`disposeWorkingDir`). Nothing about "what files
changed" needs a database at all — `git diff` against the clone's starting commit already
answers that, on demand, which is exactly what `sessionChanges()` does. Storing file
contents in Postgres would mean re-deriving what git already gives you for free, and
worse would leave stale copies of a real (if disposable) codebase sitting in a database
long after the session that produced them is gone.

### Q: How would you evolve this into "sessions survive a restart" if asked to?

**A:** The path exists, it's just not built: the Agent SDK supports resuming a
conversation by its own session id (`session.agentSessionId`, already mirrored to
Postgres today). On startup, the server would need to: reconstruct in-memory `Session`
objects from Postgres rows for anything not fully finished, re-clone or restore each
one's working directory (or accept that in-flight file state is lost and only the
conversation resumes), and re-establish the driver lock and participant list from
scratch since sockets can't survive a restart regardless. It's a real, larger feature —
answering this way shows I understand *why* it's bigger than it sounds, not just that it's
"future work."
