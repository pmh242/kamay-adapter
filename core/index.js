import { router } from "./router.js";
import { validateToken } from "./services/auth.js";
import { jsonError } from "./services/envelope.js";
import { generateRequestId } from "./services/request-id.js";
import { hasSignedUrlParams, validateSignedUrl } from "./services/signed-url.js";

export async function handle(request, env = {}) {
  const ctx = {
    requestId: generateRequestId(),
    provider: null,
    backend: null,
    rateLimit: null
  };
  try {
    if (request.method === "OPTIONS") {
      return optionsResponse();
    }
    if (request.headers.has("X-Kamay-Token")) {
      validateToken(request, env.KAMAY_TOKEN);
    } else if (hasSignedUrlParams(request)) {
      await validateSignedUrl(request, env.KAMAY_SIGNING_SECRET);
    } else {
      validateToken(request, env.KAMAY_TOKEN);
    }
    return await router(request, env, ctx);
  } catch (error) {
    return jsonError(error, ctx);
  }
}

function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Kamay-Token",
      "Access-Control-Max-Age": "600"
    }
  });
}
