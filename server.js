const http = require("http");
const next = require("next");
const { WebSocket, WebSocketServer } = require("ws");

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const dev = process.env.NODE_ENV !== "production";

const app = next({ dev, hostname: host, port, dir: __dirname });
const handler = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const server = http.createServer((req, res) => handler(req, res));
    const upgradeHandler = typeof app.getUpgradeHandler === "function" ? app.getUpgradeHandler() : null;
    const replySockets = new Map();
    const replyWss = new WebSocketServer({ noServer: true });

    globalThis.__stayhandReplyBroadcast = (sessionTokens, event) => {
      const payload = JSON.stringify(event);
      sessionTokens.forEach((token) => {
        const sockets = replySockets.get(token);
        if (!sockets) return;
        sockets.forEach((socket) => {
          if (socket.readyState === WebSocket.OPEN) socket.send(payload);
        });
      });
    };

    replyWss.on("connection", (socket, request) => {
      const url = new URL(request.url || "", `http://${host}:${port}`);
      const token = url.searchParams.get("session") || "";
      if (!token) {
        socket.close(1008, "Session required");
        return;
      }

      // Validate token securely
      try {
        const { DatabaseSync } = require("node:sqlite");
        const path = require("node:path");
        const dbPath = path.join(process.cwd(), ".appdata", "local.db");
        const db = new DatabaseSync(dbPath);
        const now = new Date().toISOString();
        const row = db.prepare("SELECT 1 FROM reply_sessions WHERE token = ? AND expires_at > ?").get(token, now);
        if (!row) {
          socket.close(1008, "Invalid session");
          return;
        }
      } catch (err) {
        // If DB isn't initialized yet or fails, assume invalid
        socket.close(1008, "Database error");
        return;
      }

      if (!replySockets.has(token)) replySockets.set(token, new Set());
      replySockets.get(token).add(socket);

      socket.on("close", () => {
        const sockets = replySockets.get(token);
        if (!sockets) return;
        sockets.delete(socket);
        if (!sockets.size) replySockets.delete(token);
      });
    });

    server.on("upgrade", (request, socket, head) => {
      const url = new URL(request.url || "", `http://${host}:${port}`);
      if (url.pathname !== "/ws/reply") {
        if (upgradeHandler) {
          upgradeHandler(request, socket, head);
          return;
        }
        socket.destroy();
        return;
      }
      replyWss.handleUpgrade(request, socket, head, (ws) => {
        replyWss.emit("connection", ws, request);
      });
    });

    server.on("error", (error) => {
      if (error && error.code === "EADDRINUSE") {
        console.error(`[stayhand] Port ${port} is already in use on ${host}. Stop the stale process or set PORT to another value.`);
        process.exit(1);
      }
      console.error("[stayhand] Server failed to start:", error);
      process.exit(1);
    });

    server.listen(port, host, () => {
      console.log(`[stayhand] Running at http://${host}:${port}`);
    });
  })
  .catch((error) => {
    console.error("[stayhand] Failed to prepare Next.js:", error);
    process.exit(1);
  });
