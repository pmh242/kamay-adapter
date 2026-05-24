import { jsonSuccess } from "../../../services/envelope.js";

export async function capabilitiesRoute(url, backend, ctx) {
  const data = await backend.capabilities();
  ctx.rateLimit = backend.lastRateLimit ?? ctx.rateLimit ?? null;
  return jsonSuccess(data, ctx);
}
