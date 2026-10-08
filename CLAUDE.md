# Relay

Collaborative agent sessions: everyone with the link watches one Claude Agent SDK run live,
one person drives, and control hands over mid-task.

| Package | What it is |
|---|---|
| `packages/shared` | The WS protocol contract both sides compile against |
| `packages/server` | Coordination only: sessions, `seq` ordering, driver lock, presence, Postgres mirror |
| `packages/agent` | The `relayrun` CLI — holds the repo, runs the SDK on the host's own machine |
| `packages/web` | Next.js client (read `packages/web/AGENTS.md` first — that Next.js has breaking changes) |

## Architecture

The agent runs **on the host's own machine**, not the server. An earlier design ran it
server-side and was replaced because it meant handing a shared machine shell access to users'
code. `packages/server` never touches a repo, a shell, or a credential; verify that invariant
before adding anything to it.

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

- The real agent is the CLI default. The mock is opt-in via `--mock` — it ignores
  instructions and replays a fixed script, so receiving it unasked means watching a
  convincing answer to a question nobody asked. Keep it working, though: it's free,
  offline, and how the UI is developed (`pnpm dev` passes `--mock` deliberately).
- Verify against isolated scratch servers on non-default ports. Never the live `:3000`/`:4000`.
- Contrast is measured (canvas pixel readback), never estimated.
- Nothing is committed unless the user asks.
