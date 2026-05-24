import { jsonSuccess } from "../../../services/envelope.js";

export async function healthRoute(url, backend, ctx) {
  const data = await backend.health();
  ctx.rateLimit = backend.lastRateLimit ?? ctx.rateLimit ?? null;
  return jsonSuccess(data, ctx);
}
