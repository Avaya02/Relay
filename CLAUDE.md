# Relay

Collaborative agent sessions: everyone with the link watches one Claude Agent SDK run live,
one person drives, and control hands over mid-task.

| Package | What it is |
|---|---|
| `packages/shared` | The WS protocol contract both sides compile against |
| `packages/server` | Coordination only: sessions, `seq` ordering, driver lock, presence, Postgres mirror |
| `packages/agent` | The `relay-agent` CLI — holds the repo, runs the SDK on the host's own machine |
| `packages/web` | Next.js client (read `packages/web/AGENTS.md` first — that Next.js has breaking changes) |

## Architecture in flight

Mid-migration to `SCOPE_REVIEW.md` Option C: the agent moves **out** of the server and onto
the host's machine, so the server never touches a repo, a shell, or a credential. Until that
lands, expect `packages/server` to still contain agent/repo code that is on its way out.

## Code conventions

**Comments explain why, never what.** A comment that restates the code is noise — delete it.

- Worth writing: a non-obvious constraint, a measured finding, why the obvious approach
  fails, "this looks wrong but isn't."
- Never: a header comment on a self-evident type, `// Server -> Client` above a type already
  named that, a line narrating the next three lines.
- Existing files predate this rule and are deliberately essay-commented. Leave them as they
  are, but do not match their density in new code.

**1000 lines is a hard cap.** At ~400, start looking for the seam. Split by concern into a
named folder (`agent/run.ts`, `agent/summarize.ts`, `agent/diff.ts`) — never by line count
alone.

**One concern per file.** If you cannot name a file for what it does, it does too much.
A `PostToolUse` hook (`.claude/hooks/check-file-size.sh`) flags any source file that passes the cap.

## Project conventions

- The mock agent is the default and stays that way — free, offline, and how the UI is developed.
- Verify against isolated scratch servers on non-default ports. Never the live `:3000`/`:4000`.
- Contrast is measured (canvas pixel readback), never estimated.
- Nothing is committed unless the user asks.
