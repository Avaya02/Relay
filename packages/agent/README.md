# relayrun

Watch a Claude agent work on a real codebase — together, live, with exactly one
person holding the wheel.

`relayrun` runs the agent **on your own machine**, against your own repository, on
your own credentials. It connects out to a coordination server and prints a link.
Anyone who opens that link watches the same session stream in the same moment.

Part of [Relay](https://github.com/Avaya02/Relay). The agent engine is the
[Claude Agent SDK](https://docs.claude.com/en/api/agent-sdk/overview) — the same
one Claude Code runs.

## Quick start

```bash
cd your-project
npx relayrun
```

That's it. You'll get:

```
  repo     your-project  (/Users/you/your-project)
  agent    claude code login
  session  8M2zrrx9Ng

  Share this link:
    https://relay-web-green.vercel.app/session/8M2zrrx9Ng
```

Send the link to anyone. They watch the agent work — every tool call, every
diff, every failure — as it happens.

## Why exactly one driver

Multiplayer plus an agent that writes files is a concurrency problem. Relay
avoids it rather than solving it: **only one participant can send instructions**,
and the lock is enforced on the server, not in the UI. Everyone else watches, and
can propose an instruction that the driver chooses to send or dismiss.

Control moves by explicit hand-over. A driver who disconnects frees the wheel
rather than wedging the session.

## Options

| Flag | |
|---|---|
| `--repo <path>` | Repository to work in (default: current directory) |
| `--api-key <key>` | Bill runs to this key instead of your Claude Code login |
| `--mock` | Scripted offline agent — see below |
| `--session <id>` | Reattach to an existing session (needs `--token`) |
| `--token <tok>` | Runner token for `--session` |
| `--github-repo <o/n>` | Open a PR here on publish |
| `--github-token <tok>` | Token for `--github-repo` |
| `--server <url>` | Coordination server to use |
| `--web <url>` | Web app, for the printed link |
| `-h, --help` | Show usage |

`--mock` replays a fixed script and **ignores what you type**. It's free and
offline, and it exists for developing the UI — not for real answers.

## Billing

By default runs are billed to your existing Claude Code login. Pass `--api-key`
to bill an Anthropic API key instead; it's verified before the session opens, so
a bad key fails immediately rather than mid-run.

Either way, the credential stays on your machine. It is never sent to the
coordination server.

## What leaves your machine

The agent works in a **disposable clone**, not your live checkout, so an agent
mistake can't touch uncommitted work.

Sent to the server: the transcript viewers need — instructions, tool calls,
results, diffs, and status. Not sent: your credentials, your working tree, or
anything the agent didn't emit as part of a run.

The connection is outbound only. Nothing listens, so there are no ports to open.

## Reattaching

If the CLI stops, the session survives. Restart with the token it printed:

```bash
relayrun --session 8M2zrrx9Ng --token <runner-token>
```

## Requirements

- Node.js >= 20.9.0
- `git`, and a repository to run in
- A Claude Code login or an Anthropic API key (unless using `--mock`)

## License

MIT
