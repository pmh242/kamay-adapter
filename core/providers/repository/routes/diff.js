import { jsonSuccess } from "../../../services/envelope.js";
import { ERROR_CODES, KamayError } from "../../../services/errors.js";

export async function diffRoute(url, backend, ctx) {
  const sha = url.searchParams.get("sha");
  if (!sha) {
    throw new KamayError(ERROR_CODES.INVALID_REQUEST, "sha query parameter is required");
  }
  const data = await backend.getDiff(sha);
  ctx.rateLimit = backend.lastRateLimit ?? ctx.rateLimit ?? null;
  return jsonSuccess(data, ctx);
}
