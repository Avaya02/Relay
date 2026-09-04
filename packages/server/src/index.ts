import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { WebSocketServer } from "ws";
import { attachWs } from "./ws.js";
import { bootstrapDemoSession, createNewSession, liveSessionCount } from "./sessions.js";
import {
  IS_PRODUCTION,
  MAX_LIVE_SESSIONS,
  PORT,
  originAllowed,
} from "./config.js";
import { clientKey, rateLimited } from "./ratelimit.js";

// Optional convenience: packages/server/.env, if present, saves retyping
// RELAY_AGENT etc. on every `pnpm dev`. Loaded first so agent.ts/repo.ts see
// it via process.env. Silently skipped if the file doesn't exist — the
// export-in-shell workflow still works exactly as before.
try {
  process.loadEnvFile();
} catch {
  // no .env file — fine, env vars can still be set in the shell
}

// Backstop only — the real fix for the known crash source (an unmasked/
// malformed WS frame) is the per-socket 'error' handler in ws.ts. This is
// here so a bug we haven't found yet degrades to one bad request instead of
// killing every session on the process.
process.on("uncaughtException", (err) => {
  console.error("uncaught exception:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("unhandled rejection:", err);
});

// Echoes the caller's origin rather than "*" so an allowlist is actually
// enforceable. Vary matters because the answer now differs per request, and a
// CDN that caches one origin's response for another would undo the whole check.
function withCors(res: ServerResponse, origin: string | undefined): void {
  if (origin && originAllowed(origin)) {
    res.setHeader("access-control-allow-origin", origin);
  } else if (!IS_PRODUCTION) {
    res.setHeader("access-control-allow-origin", "*");
  }
  res.setHeader("vary", "origin");
  res.setHeader("access-control-allow-methods", "POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function handleCreateSession(req: IncomingMessage, res: ServerResponse): void {
  if (rateLimited(clientKey(req.headers, req.socket.remoteAddress))) {
    json(res, 429, { error: "too many sessions created — try again in a minute" });
    return;
  }

  // Reaping bounds memory under normal use; this bounds it under abuse, when
  // sessions arrive faster than the 10-minute reap retires them. 503 rather
  // than 429 — the caller did nothing wrong, the server is simply full.
  if (liveSessionCount() >= MAX_LIVE_SESSIONS) {
    json(res, 503, { error: "server is at capacity — try again shortly" });
    return;
  }

  const session = createNewSession();
  // The runner token is returned exactly once, to whoever created the session —
  // normally the relayrun CLI, which is the only party that needs it. It is
  // never sent to a browser or persisted.
  json(res, 201, { id: session.id, runnerToken: session.runnerToken });
}

const httpServer = createServer((req, res) => {
  withCors(res, req.headers.origin);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Platform health checks (Railway, Render, Fly) poll a path and expect a
  // fast 200. Separate from `/` so that uptime pings are distinguishable from
  // real traffic in the logs.
  if (req.url === "/healthz") {
    json(res, 200, { ok: true, sessions: liveSessionCount(), uptime: process.uptime() });
    return;
  }

  if (req.method === "POST" && req.url === "/sessions") {
    // A browser POST from an unlisted origin is blocked by CORS at the reply,
    // but the session is created before the browser ever sees that. Checking
    // here is what actually prevents the allocation.
    if (!originAllowed(req.headers.origin)) {
      json(res, 403, { error: "origin not allowed" });
      return;
    }
    handleCreateSession(req, res);
    return;
  }

  res.writeHead(200, { "content-type": "text/plain" });
  res.end("relay server: ok\n");
});

// `noServer` rather than `{ server }`: the upgrade has to be refused *before*
// the handshake completes, and the built-in path gives no hook early enough to
// reject an origin without first accepting the socket.
const wss = new WebSocketServer({ noServer: true });

httpServer.on("upgrade", (req, socket, head) => {
  if (!originAllowed(req.headers.origin)) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

attachWs(wss);

// A permanently-joinable session on a public server is an open door nobody
// asked for, so this stays a local-development convenience.
if (!IS_PRODUCTION) bootstrapDemoSession();

httpServer.listen(PORT, () => {
  console.log(`relay server listening on :${PORT}`);
  if (IS_PRODUCTION && originAllowed("https://example.invalid")) {
    console.warn(
      "WARNING: RELAY_ALLOWED_ORIGINS is unset — any website can open sockets against this server",
    );
  }
});

// Platforms send SIGTERM and then SIGKILL a few seconds later. Closing sockets
// with a real code lets every browser's reconnect logic engage immediately
// instead of waiting out a heartbeat on a socket that is already gone.
let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} — shutting down`);

  for (const socket of wss.clients) {
    socket.close(1012, "server restarting");
  }
  wss.close();
  httpServer.close(() => process.exit(0));

  // Nothing is worth blocking a restart for: session state is in memory and
  // does not survive one regardless, so a stuck socket must not hold the
  // process past the platform's grace period.
  setTimeout(() => process.exit(0), 5_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
