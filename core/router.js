import { jsonSuccess } from "./services/envelope.js";
import { ERROR_CODES, KamayError } from "./services/errors.js";
import { getRepositoryBackend } from "./providers/repository/backends/index.js";
import { routeRepository } from "./providers/repository/routes/index.js";

export async function router(request, env, ctx) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/health") {
    return jsonSuccess({
      status: "ok",
      provider: null,
      backend: null,
      apiVersion: "v1"
    }, ctx);
  }
  if (url.pathname.startsWith("/v1/repo/")) {
    const source = env.KAMAY_SOURCE ?? "github";
    const backend = getRepositoryBackend(source, env);
    ctx.provider = "repository";
    ctx.backend = backend.source;
    return routeRepository(url, backend, ctx, request);
  }
  throw new KamayError(ERROR_CODES.NOT_FOUND, "Route not found", {
    method: request.method,
    path: url.pathname
  });
}
