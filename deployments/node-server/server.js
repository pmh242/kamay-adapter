import http from "node:http";
import { handle } from "../../core/index.js";
import { ERROR_CODES } from "../../core/services/errors.js";

const port = Number.parseInt(process.env.PORT ?? "8766", 10);

const server = http.createServer(async (req, res) => {
  try {
    const request = await toRequest(req);
    const response = await handle(request, process.env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(await response.text());
  } catch {
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ error: { code: ERROR_CODES.INTERNAL_ERROR, message: "Internal adapter error" } }, null, 2));
  }
});

server.listen(port, () => {
  console.log(JSON.stringify({
    service: "kamay-adapter",
    runtime: "node",
    port,
    timestamp: new Date().toISOString()
  }));
});

async function toRequest(req) {
  const url = `http://${req.headers.host ?? `localhost:${port}`}${req.url ?? "/"}`;
  const body = ["GET", "HEAD"].includes(req.method ?? "GET") ? undefined : await readBody(req);
  return new Request(url, { method: req.method, headers: req.headers, body });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}
