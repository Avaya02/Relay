import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { attachWs } from "./ws.js";
import { bootstrapDemoSession, createNewSession } from "./sessions.js";

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
