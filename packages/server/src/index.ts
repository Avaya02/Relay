import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { attachWs } from "./ws.js";
import { bootstrapDemoSession, createNewSession } from "./sessions.js";

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

const PORT = Number(process.env.PORT ?? 4000);

// Local dev only (spec §8 — the server isn't deployed publicly yet), so a
// permissive CORS policy is fine: no auth or sensitive data sits behind it,
// just "create an empty session."
function withCors(res: import("node:http").ServerResponse): void {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "POST, OPTIONS");
  res.setHeader("access-control-allow-headers", "content-type");
}

const httpServer = createServer((req, res) => {
  withCors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/sessions") {
    const session = createNewSession();
    res.writeHead(201, { "content-type": "application/json" });
    res.end(JSON.stringify({ id: session.id }));
    return;
  }

  res.writeHead(200, { "content-type": "text/plain" });
  res.end("relay server: ok\n");
});

const wss = new WebSocketServer({ server: httpServer });
attachWs(wss);

bootstrapDemoSession();

httpServer.listen(PORT, () => {
  console.log(`relay server listening on :${PORT}`);
});
