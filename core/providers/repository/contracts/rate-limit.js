export function nullRateLimit(source) {
  return {
    source,
    remaining: null,
    limit: null,
    resetAt: null
  };
}

export function parseGitHubRateLimit(headers) {
  const remaining = parseIntegerHeader(headers.get("x-ratelimit-remaining"));
  const limit = parseIntegerHeader(headers.get("x-ratelimit-limit"));
  const resetSeconds = parseIntegerHeader(headers.get("x-ratelimit-reset"));
  return {
    source: "github",
    remaining,
    limit,
    resetAt: resetSeconds === null
      ? null
      : new Date(resetSeconds * 1000).toISOString()
  };
}

function parseIntegerHeader(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numberValue = Number.parseInt(value, 10);
  return Number.isNaN(numberValue) ? null : numberValue;
}
