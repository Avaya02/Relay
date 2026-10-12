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

try {
  process.loadEnvFile();
} catch {
  // No .env file; shell env vars still work.
}

// Backstop for bugs we haven't found; the known crash (bad WS frame) is handled in ws.ts.
process.on("uncaughtException", (err) => {
  console.error("uncaught exception:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("unhandled rejection:", err);
});

// Echo the origin, not "*", so the allowlist is enforceable; Vary stops a CDN
// serving one origin's response to another.
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

  // 503 not 429: the caller did nothing wrong, the server is just full.
  if (liveSessionCount() >= MAX_LIVE_SESSIONS) {
    json(res, 503, { error: "server is at capacity — try again shortly" });
    return;
  }

  const session = createNewSession();
  // Returned once, to the creator (the CLI); never sent to a browser or persisted.
  json(res, 201, { id: session.id, runnerToken: session.runnerToken });
}

const httpServer = createServer((req, res) => {
  withCors(res, req.headers.origin);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url === "/healthz") {
    json(res, 200, { ok: true, sessions: liveSessionCount(), uptime: process.uptime() });
    return;
  }

  if (req.method === "POST" && req.url === "/sessions") {
    // CORS only blocks the reply; the session would already exist.
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

// `noServer` so the origin is rejected before the handshake completes.
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

// Dev only: a permanent session on a public server would be an open door.
if (!IS_PRODUCTION) bootstrapDemoSession();

httpServer.listen(PORT, () => {
  console.log(`relay server listening on :${PORT}`);
  if (IS_PRODUCTION && originAllowed("https://example.invalid")) {
    console.warn(
      "WARNING: RELAY_ALLOWED_ORIGINS is unset — any website can open sockets against this server",
    );
  }
});

// A real close code lets browsers reconnect immediately instead of waiting out a heartbeat.
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

  // Platforms SIGKILL a few seconds after SIGTERM; a stuck socket mustn't hold on.
  setTimeout(() => process.exit(0), 5_000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
