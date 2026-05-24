export const ERROR_CODES = Object.freeze({
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  INVALID_REQUEST: "INVALID_REQUEST",
  NOT_IMPLEMENTED: "NOT_IMPLEMENTED",
  UPSTREAM_ERROR: "UPSTREAM_ERROR",
  UPSTREAM_RATE_LIMITED: "UPSTREAM_RATE_LIMITED",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  TIMEOUT: "TIMEOUT",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE"
});

const STATUS_BY_CODE = Object.freeze({
  [ERROR_CODES.UNAUTHORIZED]: 401,
  [ERROR_CODES.FORBIDDEN]: 403,
  [ERROR_CODES.NOT_FOUND]: 404,
  [ERROR_CODES.INVALID_REQUEST]: 400,
  [ERROR_CODES.NOT_IMPLEMENTED]: 501,
  [ERROR_CODES.UPSTREAM_ERROR]: 502,
  [ERROR_CODES.UPSTREAM_RATE_LIMITED]: 429,
  [ERROR_CODES.INTERNAL_ERROR]: 500,
  [ERROR_CODES.TIMEOUT]: 504,
  [ERROR_CODES.PAYLOAD_TOO_LARGE]: 413
});

export class KamayError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "KamayError";
    this.code = code;
    if (details !== undefined) {
      this.details = details;
    }
  }
}

export function statusForCode(code) {
  return STATUS_BY_CODE[code] ?? 500;
}
