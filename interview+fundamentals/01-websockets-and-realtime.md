# WebSockets & Real-Time Protocol

Q&A grounded in `packages/server/src/ws.ts`, `packages/shared/src/protocol.ts`, and
`packages/web/lib/useSession.ts`.

---

### Q: What is a WebSocket, and why not just use HTTP polling?

**A:** HTTP is request-response — the client always asks first. A WebSocket is a single
TCP connection that stays open, and *either side* can send a message at any time. Relay
needs the server to push events to the browser the instant the agent does something —
polling every second would mean up to a 1-second delay on every action, and it would mean
constantly asking "anything new?" even when nothing's happening. A WebSocket means the
server says "here's a new event" the moment it has one, with basically no overhead in
between.

### Q: How does a WebSocket connection start?

**A:** It starts as a normal HTTP request with an `Upgrade: websocket` header. The server
responds `101 Switching Protocols`, and from that point on it's not HTTP anymore — it's a
raw bidirectional byte stream, framed into messages by the WebSocket protocol itself. In
Relay this is handled by the `ws` npm package attached to the same `http.Server` that
serves the `POST /sessions` endpoint — see `packages/server/src/index.ts`.

### Q: What's actually inside a Relay WebSocket message?

**A:** JSON, always. Every message — both directions — is one of the types in
`packages/shared/src/protocol.ts`'s `ClientMessage` or `ServerMessage` union, serialized
with `JSON.stringify` and parsed with `JSON.parse`. That file is imported by *both* the
server and the client packages, so TypeScript enforces that both sides agree on the shape
of every message at compile time — if I add a field to a message type, both sides have to
handle it or the build fails.

### Q: How do you guarantee every browser sees events in the same order?

**A:** This is the single most important design decision in the project. `seq` is a
number assigned in exactly one place — `appendEvent()` in `packages/server/src/transcript.ts`
— and it's a simple incrementing counter per session. The rule I follow everywhere else in
the codebase is: **clients never sort, merge, or reorder events. They only ever append
what the server sends, in the order the server sends it.**

That sounds obvious but it's the part that's easy to get wrong. If two browsers each
timestamped events with their own `Date.now()` and sorted by that, you'd get different
orders on different machines (clock skew, network jitter) — and worse, the two browsers
could *disagree* about what happened when. By making the server the single source of
truth for ordering, that whole class of bug is impossible by construction, not by careful
testing.

### Q: What happens when a browser joins a session that's already been running for 20 minutes?

**A:** The server sends a `history` message containing the *entire* `session.events`
array before anything else. The client's `useSession` hook just does
`setEvents(msg.events)` — replacing its whole local state with the authoritative array.
Then live events arrive one at a time and get appended. Because both paths (catch-up and
live) go through the same "append in order" logic on the client, there's no special case
for "I joined late" — it's the same code either way.

### Q: How do you detect a dead connection? (heartbeat / ping-pong)

**A:** TCP doesn't reliably tell you when the other side is gone — a laptop lid closing,
a phone switching networks, or a NAT router silently dropping an idle connection can all
leave a socket that *looks* open but will never send or receive anything again. Relay
runs a 30-second heartbeat: every 30 seconds, the server pings every connected socket
using the native WebSocket ping frame (not an app-level message — this is the actual
`ws.ping()` at the protocol layer). If a socket didn't respond to the *previous* ping
before the next one fires, it's presumed dead and `terminate()`d. See `HEARTBEAT_MS` in
`ws.ts`.

There's a second, unrelated `{ type: "ping" }` / `{ type: "pong" }` pair in the app-level
protocol too — that one exists so the *client* can detect a stalled connection from its
side, independent of the transport-level heartbeat.

### Q: What happens when someone's wifi drops for 5 seconds?

**A:** The client's `useSession` hook detects the socket close and retries with
exponential backoff (1s, 2s, 4s, 8s, capped at 15s, with random jitter so a whole room of
clients doesn't all reconnect in the same instant and hammer the server). On reconnect, it
sends the `resumeToken` it got when it originally joined. The server checks that token
against `findParticipantByToken()` — if it matches a participant who's within a 30-second
grace window, the *same* participant identity is reattached to the new socket. Presence
never even flickers to other viewers, because nothing about the room's participant list
actually changed — just the underlying socket. If they were the driver, they're still the
driver when they come back.

### Q: Why 30 seconds for the grace window specifically?

**A:** It's a judgment call, not a formula — long enough to survive a real wifi blip plus
the client's own backoff delay, short enough that a genuine departure (someone closing
their laptop for the day) still reads as "gone" reasonably promptly, so the driver lock
doesn't stay stuck on an empty room. It's a tunable constant (`GRACE_MS` in
`sessions.ts`), not a value I'd claim is provably optimal.

### Q: What's the difference between `socket.on('close')` and the participant actually leaving?

**A:** `close` fires immediately when the TCP connection drops. But that might be a
reconnect-in-progress, not a real departure. So `close` doesn't immediately delete the
participant — it starts the 30-second grace timer (`scheduleParticipantGrace`). Only if
that timer *expires without a reconnect claiming it* does `finalizeDisconnect()` actually
run: remove the participant, free the driver lock if they were driving, and broadcast
`participant_left` to everyone else. This two-step model (fast close detection, slow
"are they really gone" decision) is what makes reconnects invisible to everyone else in
the room.

### Q: What's a real bug you found in this area, and how did you find it?

**A:** Early in the project, an unmasked or malformed WebSocket frame from a client would
cause the socket to emit an `'error'` event — and an unhandled `'error'` event on a Node
`EventEmitter` throws and crashes the whole process. That's not a hypothetical: it means
one malformed packet, sent by anyone, with no auth needed, would take down every session
on the server at once. I found this by intentionally sending malformed frames during
testing and watching the server die. The fix is a `socket.on('error', ...)` handler that
logs and calls `socket.terminate()` instead of letting it propagate — see the comment in
`ws.ts` right above that handler. There's also a process-level `uncaughtException` /
`unhandledRejection` backstop in `index.ts` in case something *else* I haven't found yet
does the same thing — it degrades to one bad request instead of killing the process.

### Q: Why not use Socket.IO?

**A:** Socket.IO adds rooms, automatic reconnection, acknowledgements, and a fallback
transport, which is genuinely useful for a lot of apps. I chose raw `ws` on purpose here
because the entire point of the project is demonstrating that *I* built the ordering
guarantee, the reconnect/resume logic, and the driver lock — not that a library did it for
me. If an interviewer asks "how does Socket.IO handle reconnection," I can't give a
detailed answer; if they ask how Relay does it, I built it and can trace every line.
