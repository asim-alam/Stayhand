const http = require("http");
const next = require("next");
const { WebSocket, WebSocketServer } = require("ws");
const postgres = require("postgres");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const crypto = require("node:crypto");

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const dev = process.env.NODE_ENV !== "production";

const app = next({ dev, hostname: host, port, dir: __dirname });
const handler = app.getRequestHandler();

const pgUrl = process.env.POSTGRES_URL || process.env.DATABASE_URL || "";
const hasPg = Boolean(pgUrl);
const pg = hasPg
  ? postgres(pgUrl, {
      ssl: "require",
      max: 2,
      idle_timeout: 20,
      connect_timeout: 10,
    })
  : null;

let sqliteDb = null;

function getSqliteDb() {
  if (sqliteDb) return sqliteDb;
  const dbPath = process.env.STAYHAND_DB_PATH || path.join(process.cwd(), "data", "stayhand.sqlite");
  sqliteDb = new DatabaseSync(dbPath);
  return sqliteDb;
}

/** Fast in-memory check for sessionv2 tokens — no DB hit required */
function isValidSessionV2Token(token) {
  if (!token || !token.startsWith("sessionv2_")) return false;
  const rest = token.slice("sessionv2_".length);
  const dotIdx = rest.lastIndexOf(".");
  if (dotIdx === -1) return false;
  const payload = rest.slice(0, dotIdx);
  const signature = rest.slice(dotIdx + 1);
  const secret = process.env.GROQ_API_KEY || process.env.GEMINI_API_KEY || "stayhand";
  const expected = crypto.createHash("sha256").update(`${payload}:${secret}`).digest("hex").slice(0, 24);
  if (signature !== expected) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return parsed.id && parsed.expiresAt && parsed.expiresAt > new Date().toISOString();
  } catch { return false; }
}

async function hasValidReplySession(token) {
  // Fast path: sessionv2 tokens are self-contained — validate in memory, no DB needed
  if (isValidSessionV2Token(token)) return true;

  // Slow path: legacy tokens require a DB lookup
  const now = new Date().toISOString();

  if (hasPg && pg) {
    try {
      const rows = await pg`
        SELECT 1
        FROM reply_sessions
        WHERE token = ${token}
          AND expires_at > ${now}
        LIMIT 1
      `;
      if (rows.length > 0) return true;
    } catch (err) {
      if (dev) {
        console.warn("[WS] Postgres validation failed, trying SQLite fallback:", err?.message || err);
      }
    }
  }

  try {
    const row = getSqliteDb()
      .prepare("SELECT 1 FROM reply_sessions WHERE token = ? AND expires_at > ?")
      .get(token, now);
    return Boolean(row);
  } catch (err) {
    if (dev) {
      console.error("[WS] SQLite validation failed:", err?.message || err);
    }
    return false;
  }
}

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

    replyWss.on("connection", async (socket, request) => {
      const url = new URL(request.url || "", `http://${host}:${port}`);
      const token = url.searchParams.get("session") || "";
      if (!token) {
        socket.close(1008, "Session required");
        return;
      }

      const validSession = await hasValidReplySession(token);
      if (!validSession) {
        if (dev) console.warn(`[WS] Rejected session token: ${token.slice(0, 8)}... (invalid or expired)`);
        socket.close(1008, "Invalid session");
        return;
      }
      if (dev) console.log(`[WS] Accepted session: ${token.slice(0, 8)}...`);

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
