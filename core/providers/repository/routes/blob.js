import { jsonSuccess } from "../../../services/envelope.js";
import { ERROR_CODES, KamayError } from "../../../services/errors.js";

export async function blobRoute(url, backend, ctx) {
  const sha = decodeURIComponent(url.pathname.slice("/v1/repo/blob/".length));
  if (!sha) {
    throw new KamayError(ERROR_CODES.INVALID_REQUEST, "sha path parameter is required");
  }
  const data = await backend.getBlob(sha);
  ctx.rateLimit = backend.lastRateLimit ?? ctx.rateLimit ?? null;
  return jsonSuccess(data, ctx);
}
