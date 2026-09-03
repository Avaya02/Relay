# Origins, CORS & WebSocket Hijacking

The strongest answer in here is the one about WebSockets: **CORS does not protect them**,
and most people assume it does. That gap is the whole reason `originAllowed` exists.

---

### Q: What is an "origin", exactly?

**A:** The triple **scheme + host + port**. `https://relay-web.vercel.app` and
`http://relay-web.vercel.app` are *different* origins (different scheme), as are
`localhost:3000` and `localhost:4000` (different port). Anything not identical in all three
is cross-origin.

The browser stamps an `Origin` header on cross-origin requests automatically. The page's own
JavaScript cannot set or forge it — that is browser-controlled, and it is the only reason
any of this is trustworthy.

### Q: What is CORS actually for? Most people get this backwards.

**A:** CORS is not a server-side access control mechanism. It is a **browser** mechanism that
protects *users* from the sites they visit.

The default (the same-origin policy) is that JavaScript on `evil.com` cannot read a response
from `yourbank.com`, because the user's cookies would ride along and the attacker would get
to read authenticated data. CORS is how a server **opts out** of that restriction and says
"this specific origin may read my responses."

Two consequences worth stating in an interview:

1. **CORS relaxes security, it doesn't add it.** `Access-Control-Allow-Origin: *` is the
   maximally permissive setting, not a safe default.
2. **It only binds browsers.** `curl`, a CLI, or any scripted client ignores CORS entirely —
   it will happily read a response no browser would surrender. So CORS is never a defense
   against an attacker with a terminal; it is a defense for the user sitting in a browser.

### Q: So why does your server allow requests with no `Origin` header at all?

**A:** Because that is the case that *isn't* a browser.

```ts
export function originAllowed(origin: string | undefined): boolean {
  if (!origin) return true;                               // not a browser
  if (ALLOWED_ORIGINS.length === 0) return !IS_PRODUCTION; // unconfigured
  return ALLOWED_ORIGINS.includes(origin.replace(/\/$/, ""));
}
```

The `relayd` CLI attaches to a session over the same WebSocket server the browsers use, and
it sends no `Origin`. Rejecting a missing origin would lock out the one client the whole
architecture depends on while stopping no attacker — anything scripted sends whatever headers
it likes, so a rule against absent origins is trivially bypassed by *adding* one.

The honest framing: the origin check defends against a web page acting through an unwitting
visitor's browser. It was never a defense against a determined attacker with `curl`, and it
shouldn't be described as one.

### Q: The important one — does CORS protect WebSockets?

**A:** **No.** This is the part that surprises people.

The same-origin policy does not apply to WebSocket connections. Any page on the internet can
open a `WebSocket` to any server, and the browser will not block it or perform a CORS
preflight. The `Access-Control-Allow-Origin` header is simply not consulted during a
WebSocket handshake.

That is the basis of a named vulnerability class: **Cross-Site WebSocket Hijacking (CSWSH)**.
A malicious page opens a socket to your server from a logged-in victim's browser; because
cookies ride along on the handshake, the attacker's page ends up holding an *authenticated*
socket and can read everything streamed down it.

The defense is to check the `Origin` header **yourself**, manually, on the upgrade —
because nothing else will:

```ts
const wss = new WebSocketServer({ noServer: true });

httpServer.on("upgrade", (req, socket, head) => {
  if (!originAllowed(req.headers.origin)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});
```

### Q: Why `noServer: true` instead of passing the http server to `ws`?

**A:** Timing. The convenient form (`new WebSocketServer({ server })`) completes the handshake
and *then* emits `connection`, so the earliest you can react is after the socket is already
established. Rejecting there means the connection existed, however briefly.

`noServer: true` hands you the raw `upgrade` event, so a disallowed origin is refused with a
403 before any WebSocket exists at all. Same outcome in the happy path, materially different
in the rejection path.

### Q: Is Relay actually vulnerable to CSWSH?

**A:** Not in the classic form, and the reason is worth saying because it shows you understand
the mechanism rather than reciting the vulnerability.

CSWSH steals *authenticated* sockets, and its engine is ambient credentials — cookies the
browser attaches automatically. Relay has no cookies and no sessions-in-the-browser sense of
auth; the session id in the URL is the capability. An attacker's page that already knows a
session id could just fetch it directly, so hijacking a victim's browser buys nothing.

What the origin check does buy here is narrower and still real: it stops an arbitrary web
page from opening sockets and creating sessions on the server using visitors' browsers as
unwitting clients. That is resource abuse, not credential theft — and describing it
accurately is better than claiming a CSWSH fix that doesn't apply.

### Q: Why echo the origin back instead of `*`?

**A:** Because `*` and an allowlist are mutually exclusive. Once you enumerate who is allowed,
the response has to name *which* origin was allowed:

```ts
if (origin && originAllowed(origin)) {
  res.setHeader("access-control-allow-origin", origin);
}
res.setHeader("vary", "origin");
```

The `Vary: origin` header is the subtle half. The response now differs per requester, so any
cache in front of the server must key on `Origin` too. Without it, a CDN can serve a response
computed for an allowed origin to a disallowed one — and the allowlist is silently defeated
by caching rather than by any flaw in the check itself.

### Q: What happens when the allowlist isn't configured?

**A:** It fails **closed**:

```ts
if (ALLOWED_ORIGINS.length === 0) return !IS_PRODUCTION;
```

Locally that returns `true` — no configuration needed to develop. In production it returns
`false` and every browser origin is rejected until you set `RELAY_ALLOWED_ORIGINS`.

The design principle is that a forgotten security setting should break loudly rather than
quietly leave the door open. "Nothing works" gets fixed in five minutes; "everything is open"
can persist for months.

I got this wrong in my own notes while deploying — I expected the server to log a warning and
stay permissive, and instead it returned 403 to everything. Fail-closed did exactly what it
should, and my mental model was the thing that was wrong.

### Q: What would you add if this needed real auth?

**A:** The origin check is a perimeter control, not authentication, and it should never be the
only thing standing between a request and the work it triggers. With real accounts I would
add a token on the WebSocket handshake — validated server-side on upgrade, exactly where the
origin is checked now — so that a socket has to prove *who* it is, not merely *where it came
from*. Origin answers "which website sent this"; it can never answer "which user is this."
