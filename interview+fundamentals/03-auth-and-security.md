# Auth & Security

This is the file to read most carefully before an interview, because "no authentication"
is the kind of line that gets probed hard, and the honest, complete answer is actually
stronger than pretending the project has full auth.

---

### Q: Does Relay have user authentication?

**A:** No — and it's a deliberate, stated scope decision, not an oversight. The mental
model is a video-call link: the session id (a 10-character id from a 55-character
unambiguous alphabet — no `0`/`O`/`1`/`I`/`l`, so it can be read aloud or typed without
confusion) works as a capability token. Anyone with the link can join. That's the right
trust model for "a small team already talking to each other," which is the stated target
use case — not a public multi-tenant product.

### Q: Isn't "no auth" just a security hole?

**A:** This is the question to answer carefully, because the honest answer has two parts,
and giving only the first one sounds naive.

**Part one:** for the stated scope — a link shared inside a trusted team, the way you'd
share a Zoom link — it's a defensible, common pattern. The blast radius of a leaked link is
bounded to whoever has it.

**Part two, the part that shows real judgment:** "no accounts by design" is a different
decision from "no input validation," and conflating them is exactly the mistake to avoid.
Before I added `validate.ts`, a `join` message with a 100,000-character display name, or
one containing invisible Unicode control/bidi characters, was accepted and broadcast to
everyone verbatim. That's not an auth gap — it's a validation gap that happened to sit
right next to the auth decision, which made it easy to overlook. I found it by re-reading
an earlier production audit that had flagged it and confirming it had never actually been
fixed.

### Q: What does the validation actually do?

**A:** Everything client-supplied passes through `packages/server/src/validate.ts` before
it reaches the transcript, a broadcast, a subprocess environment, or Postgres:

- **Display names** — strip control characters and invisible/bidi Unicode (the kind that
  can make a name render as something other than what it says), collapse whitespace, cap
  at 32 characters. Truncated, not rejected outright, on the length cap — someone pasting a
  long string wants a name, not an error.
- **Instructions** — keep newlines (a pasted stack trace is a legitimate instruction),
  reject empty, cap at 10,000 characters.
- **Publish titles** — one line, 120 characters, falls back to a default rather than
  blocking a publish over a cosmetic issue.
- **API keys** — shape-only validation (starts with `sk-ant-`, no whitespace or shell
  metacharacters, bounded length) — the *authority* on whether a key actually works is
  Anthropic, not this code, so it's checked separately (see below).

Every function returns `{ ok: true, value }` or `{ ok: false, error }` rather than
throwing, because these run inside the WebSocket message-handling loop, where an uncaught
throw takes down more than just the one bad message.

### Q: What's the actual worst-case if a session link leaks?

**A:** Anyone with it can join and request control. If granted, they can send instructions
to an agent that has *unrestricted shell access* inside its cloned working directory
(`permissionMode: "bypassPermissions"` in `agent.ts` — there's no human approving each tool
call, since it's headless). That's a real, honestly-stated boundary: this is safe on a
trusted network among people who already trust each other, and not something to expose
publicly as-is. I'd rather say that plainly than have an interviewer find the gap
themselves.

### Q: If you had to add real authentication, what would you build first?

**A:** Not full accounts — a lighter middle ground first. Either a join-approval flow
(the session creator has to approve each new participant, a "knock" rather than
auto-admit), or a per-session passphrase. Both are small, scoped, buildable increments on
top of what exists. Full OAuth/accounts/roles would be a much larger feature, and I'd want
a real reason to build it — "because auth is generally good" isn't a design decision, it's
a reflex.

---

## Handling a real credential: the API key

The most substantial security work in the project is the bring-your-own-key feature,
because it involves a real secret moving through the system, and I found and fixed a
genuinely dangerous bug in it before shipping.

### Q: How does a user-supplied API key get from the browser to the agent?

**A:** Over the WebSocket, as a plain `set_key` message — driver-only, gated behind
`RELAY_ALLOW_USER_KEYS` (off by default; see the deployment question below). The server:

1. Validates its shape (`validate.ts`).
2. **Verifies it against Anthropic** before accepting it (`sessionKey.ts`,
   `verifyApiKey()`) — a cheap authenticated `GET /v1/models` call. If it's invalid, the
   error comes back immediately.
3. Stores it in memory only, on the `Session` object — never in Postgres (the persistence
   layer explicitly lists which fields it mirrors, and the key isn't one of them), never
   logged, never sent back to *any* client, including the one that set it. Every client
   only ever sees the key's last four characters and the name of who supplied it.
4. Clears it automatically when its owner disconnects for good, or when the driver clears
   it explicitly.

### Q: Why verify the key immediately instead of just trying it on the next run?

**A:** Because I measured what happens if you don't: a bad key would silently get
accepted, and the *first sign* anything was wrong was the agent's own answer, 191 seconds
later, after the SDK had retried the failing auth with backoff internally. That's a bad
experience for something as simple as "did I paste my key correctly." Verifying at set-time
turns a 3-minute mystery into an instant, accurate "no."

### Q: Walk me through the actual bug you found in the key-handling code.

**A:** This is the best story in the whole project, because the bug was invisible — the
feature *looked* like it worked.

My first implementation passed the key like this:

```ts
env: { ...process.env, ANTHROPIC_API_KEY: session.apiKey }
```

That typechecks, the SDK accepts it, and calling it produces a *successful* run. Nothing
about the output looks wrong. But I decided to actually verify the credential in use
rather than trust the green checkmark, so I pointed `ANTHROPIC_BASE_URL` at a local HTTP
server I controlled and read the actual headers the SDK sent. Every single request
carried `Authorization: Bearer sk-ant-oat...` — the *host's own* stored OAuth token from
Claude Code — with the supplied API key nowhere in any request. **The subprocess was
silently ignoring the environment variable and using the operator's login instead**,
whenever the host machine already had Claude Code credentials.

That's the worst possible failure mode for this exact feature: the UI would confidently
tell a user "you're on your own key" and show whose account was paying, while the *host*
silently footed the bill for every run — and it would also mean routing someone else's
requests through a subscription credential, which is specifically what Anthropic's terms
prohibit for third-party products.

### Q: How did you actually fix it?

**A:** I found the mechanism the SDK actually respects: `settings.apiKeyHelper` — a path
to a script the CLI runs to obtain a credential, whose stdout is sent as the `x-api-key`
header and takes precedence over a stored OAuth token. I proved this the same way I found
the bug: pointed the base URL at my local server again and confirmed the request now
carried the *session's* key, and swapping which key was in the environment produced a
matching change in the header — see `sessionKey.ts`.

One detail worth mentioning if asked: the helper script itself contains **no secret**. It's
a two-line shell script that echoes an environment variable (`RELAY_SESSION_API_KEY`) —
the key still only ever exists in the subprocess's environment, never written to disk, so
"held in memory only" stays true, which matters because the UI explicitly promises that.

### Q: There's also a race condition in the key-verification flow — what was it?

**A:** Making verification an async network call (step 2 above) introduced a real race:
if a driver sets a key, then immediately clears it before the verification request
finishes, the slower `set_key` handler could complete *after* the clear and silently
restore a key the driver just removed. Fixed with an epoch counter —
`session.apiKeyEpoch`, incremented on every set *and* clear. The verification callback
captures the epoch when it starts, and only applies its result if the epoch is still
current when it finishes. I proved this works with a stub Anthropic server that
deliberately delays its response by 2 seconds, sent a clear while a set was still
in-flight, and confirmed the key did *not* come back.

### Q: Why is `RELAY_ALLOW_USER_KEYS` off by default?

**A:** Because letting a stranger supply their own key doesn't fix the underlying risk —
it just changes who pays for the shell access. The agent runs with unrestricted shell
access inside its clone regardless of whose credentials it's using. On a public instance,
"bring your own key" would really mean "run whatever you like on my server, on your own
dime" — a sandboxing problem, not a billing one. It's meant to be turned on for a
self-hosted instance among people who could already get a shell on that box anyway, where
the credential-routing is the only real gap being closed.
