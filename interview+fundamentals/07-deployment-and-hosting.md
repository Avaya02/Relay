# Deployment & Hosting

Short file. Three ideas, and the first one explains the other two.

---

### Q: Do you deploy the HTTP server and the WebSocket server separately?

**A:** No — there is nothing to separate. They are the same process on the same port,
because a WebSocket *is* an HTTP connection that got upgraded in place.

The client opens a normal HTTP request with an upgrade header:

```http
GET / HTTP/1.1
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: x3JJHMbDL1EzLkh9GBhXDw==
```

The server answers `101 Switching Protocols`, and from that point **the same TCP
connection** stops speaking HTTP and starts carrying WebSocket frames. No second port,
no second connection.

`packages/server/src/index.ts` is exactly this shape:

```ts
const httpServer = createServer((req, res) => { … });  // REST: /healthz, POST /sessions
const wss = new WebSocketServer({ noServer: true });   // owns no port at all
httpServer.on("upgrade", (req, socket, head) => { … }); // hands upgraded sockets to wss
httpServer.listen(PORT, …);                             // one listen, one port
```

`noServer: true` is the tell: the WebSocket server never listens for anything. It is
handed sockets that the HTTP server has already upgraded. Splitting the two would put a
session's sockets in one process and its state in another.

### Q: Why can't the server go on Vercel, next to the web app?

**A:** Because the two have opposite lifecycle requirements, and "frontend vs backend" is
the wrong axis to think about it on. The real axis is **serverless vs long-running**:

| | Serverless (Vercel, Lambda) | Long-running (Railway, Render, Fly) |
|---|---|---|
| Lifecycle | Spawns per request, then dies | Starts once, stays up |
| Memory between requests | None | Yes |
| Long-lived connections | Impossible — the function returns | Yes |

Relay's server needs all three of the right-hand column, for reasons visible in the code:

1. `sessions` is an in-memory `Map` (`sessions.ts`). A process that dies per request has
   no sessions.
2. Sockets stay open for the length of a session — minutes to hours. A function that
   returns cannot hold one.
3. The driver lock is in-process state. Two instances would give two different answers to
   "who is driving."

The web app needs none of that: it ships HTML, CSS and JS, and every piece of live state
lives in the browser's socket to the coordination server. That is why it is fine on
Vercel and the server is not.

### Q: Railway or Render — what's the actual difference?

**A:** Architecturally, none worth naming. Both run a container continuously, both
terminate TLS at a proxy, both support WebSockets. The application code is identical;
only the config file changes.

The difference is operational, and one of them matters a lot here:

| | Railway | Render |
|---|---|---|
| Free tier | No permanent free tier | **Sleeps after ~15 min idle** |
| Service creation | CLI-driven | Dashboard-driven |
| Billing | Usage-based | Fixed instance |

**Why sleeping is disqualifying for this specific app.** A spin-down kills the process,
and every session lives in that process's memory: connected agents drop, sockets close,
driver locks evaporate. A stateless REST API would not care — the next request just pays
a cold start. Relay cares completely.

That is the generalizable point: **the hosting requirement follows from where the state
lives**, not from what language or framework it is written in.

### Q: What breaks when you redeploy?

**A:** Every live session, by design. Sockets, the driver lock and the agent's
conversation are in memory and cannot survive a process restart. Postgres mirrors the
*transcript* only, so a dead link degrades to a read-only replay instead of an error —
that is the whole reason the database is worth attaching.

Two consequences worth stating before someone asks:

- **Don't raise the replica count.** Sessions are held in one process; a second instance
  would hold a second, unreachable set of them.
- **`NEXT_PUBLIC_*` is baked in at build time.** Next.js inlines those variables during
  `next build`, so changing `NEXT_PUBLIC_WS_URL` on the host does nothing until a
  rebuild. The server's own config is read at runtime, which is why the deploy order is
  server → web → back to the server to set its allowed origins.

### Q: What did you have to change before this could be public at all?

**A:** The server was written for localhost and said so in its own comments. Going public
required four things, none of which were bugs beforehand:

- **Origin enforcement.** CORS was `*` and the socket accepted upgrades from any origin —
  meaning any web page could open sockets using a visitor's browser. Both now check an
  allowlist. A missing `Origin` header still passes on purpose: that is the CLI, and
  rejecting it would block the one client that matters while stopping no attacker, since
  scripted clients send whatever headers they like.
- **Rate limiting** on session creation, which is unauthenticated by design.
- **A health check** (`/healthz`) for the platform to poll.
- **Graceful shutdown**, so `SIGTERM` closes sockets with a real code and browsers
  reconnect immediately instead of waiting out a heartbeat on a dead socket.
