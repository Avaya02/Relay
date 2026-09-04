# The Agent CLI — How Code Ends Up Running On a Stranger's Machine

The one sentence to memorise:

> **Publishing to npm doesn't run anything. It puts a copy of the code on a shelf. The
> customer's own machine is what downloads it and does the running.**

Everything below is either proof of that sentence or a consequence of it.

---

### Q: When you publish to npm, what actually gets uploaded — and who runs it?

**A:** Not your source code. A compiled build, plus a README, sitting on a registry that
does nothing but store files and hand them out on request.

`relayrun`'s published tarball is 13 files, 19.6 kB:

```
README.md
dist/cli.js
dist/runner.js
dist/repo.js
dist/sessionKey.js
dist/agent/run.js
dist/agent/mock.js
dist/agent/orient.js
dist/agent/summarize.js
dist/agent/diff.js
dist/emit.js
dist/redact.js
package.json
```

No `src/`, no `.ts` files, nothing from `packages/shared` — `package.json`'s `"files"`
field explicitly lists only `["dist", "README.md"]`. npm's registry is a CDN with a
database in front of it: `npm view relayrun dist.tarball` returns a literal URL to a zip.
That's the entire product. Nobody's server executes anything when you run `npm publish` —
the file just becomes downloadable.

Compare it to installing a phone app: the App Store doesn't run Instagram for you: your
phone downloads the code and runs it locally, using your camera roll, your storage. The
App Store's servers are involved only for the parts that have to be shared — uploads,
notifications. `relayrun` is the same shape: npm stores it, the customer's laptop runs it.

### Q: What is `cli.ts` responsible for?

**A:** It's the front desk, not a worker. `packages/agent/src/cli.ts` is the one file with
a shebang —

```ts
#!/usr/bin/env node
```

— which is what tells the OS "run this with `node`" instead of trying to execute it as a
shell script. That line is *why* it's the file that runs when someone types `relayrun`;
`package.json`'s `"bin"` field points straight at its compiled output.

Its whole job, read off `main()` in order, is five steps and then a handoff:

1. Parse the flags (`--repo`, `--mock`, `--api-key`, …)
2. Resolve which git repo you're standing in (`repoRoot`, walking up to the repo's actual
   top level, since `git clone` needs the root, not wherever your terminal happens to be)
3. Work out what this run bills to — your existing login, or a supplied `--api-key`,
   verified against Anthropic *before* anything connects
4. `POST /sessions` to the coordination server, getting back a session id and a token
5. Print the shareable link

Then it calls `startRunner(...)` and steps out of the way entirely. It never touches git
directly and never calls the Claude SDK directly — both of those belong to other files.
That's the whole point of it being a front desk: one job, route to the right department.

### Q: Walk through the rest of `packages/agent/src` — what does each file do?

**A:** One file, one job, same discipline the whole repo holds itself to:

| File | Job |
|---|---|
| `repo.ts` | Clones the repo into a disposable scratch directory; later handles publishing a branch and opening a PR |
| `sessionKey.ts` | Makes sure a supplied `--api-key` is actually the credential used — see below, this one exists because of a real SDK trap |
| `runner.ts` | Owns the live WebSocket connection to the coordination server: sends what happened, receives instructions |
| `emit.ts` | A three-method shape (`event`, `status`, `agentSession`) so the agent code doesn't need to know a socket exists at all |
| `redact.ts` | Scrubs anything shaped like `sk-ant-…` out of text before it leaves the machine |
| `agent/run.ts` | Calls the real Claude Agent SDK — the actual work |
| `agent/mock.ts` | Plays a fixed scripted performance instead, for `--mock` — free, offline, ignores what you type |
| `agent/orient.ts` | Hands the real agent a directory listing before its first turn, so it stops guessing at file paths |
| `agent/summarize.ts`, `agent/diff.ts` | Turn raw tool output into the ledger's one-row-per-action summaries |

`runner.ts` is the one worth knowing cold, because it's the actual mechanism that makes
"runs on someone else's machine" true rather than theoretical. Its `connect()` opens the
socket and immediately identifies itself:

```ts
ws.on("open", () => {
  send({
    type: "runner_hello",
    sessionId, token, repoName: repo.repoName(),
    mode, keySource: opts.keySource, keyHint: opts.keyHint,
  });
});
```

If the socket drops, it reconnects with exponential backoff (`RECONNECT_BASE_MS` doubling
up to `RECONNECT_MAX_MS`) rather than either hammering the server or giving up — a wifi
blip shouldn't end the session.

### Q: Mechanically, what happens the moment someone runs `npx relayrun`?

**A:** Six steps, and every one of them happens **on their machine**, not yours:

1. `npx` downloads the tarball from the registry into their local npm cache. Nothing has
   run yet — this is a file copy.
2. It unpacks it and finds the `bin` entry. Verified directly: installing the tarball into
   a clean directory produces `node_modules/.bin/relayrun -> ../relayrun/dist/cli.js`, a
   plain symlink.
3. `node` runs `cli.js` — now an entirely ordinary local process on their laptop, with
   their filesystem permissions, able to shell out to their own `git`. Nothing about this
   step is special; it's the same as if they'd typed `node cli.js` themselves.
4. `cli.ts` runs its five steps (above), ending with one HTTP request to the coordination
   server asking it to open a session.
5. `runner.ts` takes over and opens a WebSocket **outbound**, from their machine to the
   server.
6. From here it's a genuine relay: a browser sends an instruction → hits the coordination
   server → the server forwards it down that socket → `runner.ts` receives it on their
   laptop → hands it to `agent/run.ts`, which edits files that exist only on their disk.

The server never sees a file and never runs `git`. It's a switchboard passing messages
between two computers that each do their own local work — which is the literal reason the
project is named **Relay**, not just a description of the WebSocket layer.

### Q: Why clone the repo into a temp directory instead of working on the real checkout?

**A:** So a mistake the agent makes is a mistake in a throwaway copy, never in the
directory the operator is still editing. `repo.ts` states the reasoning directly:

```ts
// Scratch space under the OS temp dir, not inside the operator's repo — the
// clones are disposable and must never show up in their working tree.
const root = path.join(tmpdir(), "relayrun");
```

and a few lines later, on why a clone specifically rather than a copy:

```ts
// `git clone` copies committed state only — no node_modules, no .DS_Store,
// and deliberately none of the operator's uncommitted work.
```

That second point matters as much as the first. A plain file copy would carry over
whatever uncommitted changes were sitting in the operator's working tree when they ran the
CLI. A clone only ever contains what's actually committed — the agent starts from a known,
clean state, and anything you hadn't committed yet is structurally unreachable to it.

### Q: Why does the connection have to be outbound-only, and why does that matter?

**A:** Because the customer's machine is never expected to accept connections — it only
ever *makes* one, to the coordination server. The landing page states this as the actual
selling point, not just an implementation detail:

> "It works in a disposable clone, connects out to the relay, and prints a link. Nothing
> inbound, so no ports to open."

Concretely: no port forwarding, no firewall exception, no public IP — the same reason a
laptop behind a home router can run a video call. The alternative architecture (the server
reaching *in* to a customer's machine) would need the opposite of all that, and would mean
the coordination server needs a network path to every operator's laptop, which mostly
doesn't exist and shouldn't.

### Q: Give me the summary I can recite.

**A:**

1. **npm is storage, not compute.** Publishing uploads a zip; nothing runs until someone
   downloads and executes it themselves.
2. **`cli.ts` is a front desk** — five setup steps, then a handoff. It never touches git or
   the SDK directly.
3. **One file, one job.** `repo.ts` clones, `sessionKey.ts` guards credentials, `runner.ts`
   owns the socket, `agent/run.ts` does the real work, `agent/mock.ts` fakes it.
4. **Execution is entirely local.** After `npx` unpacks the tarball, it's just `node`
   running a script with the operator's own permissions — nothing different from running
   any other program on their machine.
5. **The socket is outbound-only.** The server is a switchboard that relays messages; it
   never reaches into anyone's machine and never touches a repo itself.
6. **The clone is disposable and commit-only.** Mistakes land in a throwaway copy, and
   uncommitted work is never even visible to the agent.
