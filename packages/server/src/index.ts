import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { attachWs } from "./ws.js";
import { bootstrapDemoSession } from "./sessions.js";

const PORT = Number(process.env.PORT ?? 4000);

const httpServer = createServer((req, res) => {
  res.writeHead(200, { "content-type": "text/plain" });
  res.end("relay server: ok\n");
});

const wss = new WebSocketServer({ server: httpServer });
attachWs(wss);

bootstrapDemoSession();

httpServer.listen(PORT, () => {
  console.log(`relay server listening on :${PORT}`);
});
