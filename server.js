const http = require("http");
const next = require("next");

const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4173);
const dev = process.env.NODE_ENV !== "production";

const app = next({ dev, hostname: host, port, dir: __dirname });
const handler = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const server = http.createServer((req, res) => handler(req, res));

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
