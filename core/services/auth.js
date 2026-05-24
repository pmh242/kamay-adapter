import { ERROR_CODES, KamayError } from "./errors.js";

export function validateToken(request, expectedToken) {
  if (!expectedToken) {
    throw new KamayError(
      ERROR_CODES.INTERNAL_ERROR,
      "Adapter not configured: KAMAY_TOKEN secret missing"
    );
  }
  const actualToken = request.headers.get("X-Kamay-Token");
  if (!actualToken || actualToken !== expectedToken) {
    throw new KamayError(
      ERROR_CODES.UNAUTHORIZED,
      "Invalid or missing X-Kamay-Token header"
    );
  }
}
