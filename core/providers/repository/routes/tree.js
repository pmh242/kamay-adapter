import { jsonSuccess } from "../../../services/envelope.js";

export async function treeRoute(url, backend, ctx) {
  const data = await backend.getTree(
    url.searchParams.get("ref"),
    url.searchParams.get("path")
  );
  ctx.rateLimit = backend.lastRateLimit ?? ctx.rateLimit ?? null;
  return jsonSuccess(data, ctx);
}
