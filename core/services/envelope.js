import { ERROR_CODES, KamayError, statusForCode } from "./errors.js";

const JSON_HEADERS = Object.freeze({
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store"
});

export function buildMeta(ctx) {
  return {
    requestId: ctx.requestId,
    apiVersion: "v1",
    provider: ctx.provider ?? null,
    backend: ctx.backend ?? null,
    timestamp: new Date().toISOString(),
    rateLimit: ctx.rateLimit ?? null
  };
}

export function jsonSuccess(data, ctx, init = {}) {
  return new Response(
    JSON.stringify({ data, meta: buildMeta(ctx) }, null, 2),
    {
      status: init.status ?? 200,
      headers: JSON_HEADERS
    }
  );
}

export function jsonError(error, ctx) {
  const kamayError = error instanceof KamayError
    ? error
    : new KamayError(ERROR_CODES.INTERNAL_ERROR, "Internal adapter error");
  const body = {
    error: {
      code: kamayError.code,
      message: kamayError.message
    },
    meta: buildMeta(ctx)
  };
  if (kamayError.details !== undefined) {
    body.error.details = kamayError.details;
  }
  return new Response(JSON.stringify(body, null, 2), {
    status: statusForCode(kamayError.code),
    headers: JSON_HEADERS
  });
}
