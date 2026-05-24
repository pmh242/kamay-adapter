import { jsonSuccess } from "../../../services/envelope.js";
import { ERROR_CODES, KamayError } from "../../../services/errors.js";

export async function fileRoute(url, backend, ctx) {
  const path = url.searchParams.get("path");
  if (!path) {
    throw new KamayError(ERROR_CODES.INVALID_REQUEST, "path query parameter is required");
  }
  const data = await backend.getFile(path, url.searchParams.get("ref"));
  ctx.rateLimit = backend.lastRateLimit ?? ctx.rateLimit ?? null;
  return jsonSuccess(data, ctx);
}
