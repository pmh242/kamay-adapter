import { jsonSuccess } from "../../../services/envelope.js";
import { ERROR_CODES, KamayError } from "../../../services/errors.js";

export async function filesRoute(url, backend, ctx, request) {
  let paths = [];
  let ref = url.searchParams.get("ref");
  if (request.method === "GET") {
    const csv = url.searchParams.get("paths");
    if (!csv) {
      throw new KamayError(ERROR_CODES.INVALID_REQUEST, "paths query parameter is required");
    }
    paths = csv.split(",").map((path) => path.trim()).filter(Boolean);
  } else if (request.method === "POST") {
    const body = await readJsonBody(request);
    paths = body.paths;
    ref = body.ref ?? ref;
  } else {
    throw new KamayError(ERROR_CODES.INVALID_REQUEST, "Unsupported method for /v1/repo/files");
  }
  const data = await backend.getFiles(paths, ref);
  ctx.rateLimit = backend.lastRateLimit ?? ctx.rateLimit ?? null;
  return jsonSuccess(data, ctx);
}

async function readJsonBody(request) {
  try {
    return await request.json();
  } catch {
    throw new KamayError(ERROR_CODES.INVALID_REQUEST, "Request body must be valid JSON");
  }
}
