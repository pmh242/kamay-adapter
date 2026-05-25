import { ERROR_CODES, KamayError } from "./errors.js";

export const SIGNED_URL_PARAMS = Object.freeze({
  EXPIRES: "kmy_expires",
  SIGNATURE: "kmy_sig",
  CAPABILITY_OPERATION: "kmy_cap_op",
  CAPABILITY_PATH_PREFIX: "kmy_cap_path_prefix",
  CAPABILITY_REF: "kmy_cap_ref",
  CAPABILITY_LABEL: "kmy_cap_label"
});

export const SIGNED_URL_TTL = Object.freeze({
  DEFAULT_SECONDS: 900,
  MAX_SECONDS: 1800
});

const encoder = new TextEncoder();

export async function validateSignedUrl(request, signingSecret, nowMs = Date.now()) {
  if (!signingSecret) {
    throw new KamayError(
      ERROR_CODES.INTERNAL_ERROR,
      "Adapter not configured: KAMAY_SIGNING_SECRET secret missing"
    );
  }
  if (request.method !== "GET") {
    throw unauthorized();
  }
  const url = new URL(request.url);
  const expires = parseExpiry(url);
  const nowSeconds = Math.floor(nowMs / 1000);
  if (expires <= nowSeconds) {
    throw unauthorized();
  }
  if (expires - nowSeconds > SIGNED_URL_TTL.MAX_SECONDS) {
    throw unauthorized();
  }
  const receivedSignature = url.searchParams.get(SIGNED_URL_PARAMS.SIGNATURE);
  if (!receivedSignature) {
    throw unauthorized();
  }
  const expectedSignature = await signCanonicalRequest(
    signingSecret,
    canonicalRequest(request.method, url)
  );
  if (!timingSafeEqual(receivedSignature, expectedSignature)) {
    throw unauthorized();
  }
  validateCapabilityScope(request.method, url);
}

export async function signUrl(input, signingSecret, options = {}) {
  if (!signingSecret) {
    throw new KamayError(
      ERROR_CODES.INTERNAL_ERROR,
      "KAMAY_SIGNING_SECRET is required to sign URLs"
    );
  }
  const method = (options.method ?? "GET").toUpperCase();
  const ttlSeconds = Number.parseInt(
    String(options.ttlSeconds ?? SIGNED_URL_TTL.DEFAULT_SECONDS),
    10
  );
  if (method !== "GET") {
    throw new KamayError(ERROR_CODES.INVALID_REQUEST, "Signed URLs only support GET");
  }
  if (Number.isNaN(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > SIGNED_URL_TTL.MAX_SECONDS) {
    throw new KamayError(ERROR_CODES.INVALID_REQUEST, "ttl seconds must be between 1 and 1800");
  }
  const url = new URL(input);
  url.searchParams.delete(SIGNED_URL_PARAMS.SIGNATURE);
  url.searchParams.set(
    SIGNED_URL_PARAMS.EXPIRES,
    String(Math.floor(Date.now() / 1000) + ttlSeconds)
  );
  applyCapability(url, options.capability);
  const signature = await signCanonicalRequest(signingSecret, canonicalRequest(method, url));
  url.searchParams.set(SIGNED_URL_PARAMS.SIGNATURE, signature);
  return url.toString();
}

export function hasSignedUrlParams(request) {
  const url = new URL(request.url);
  return url.searchParams.has(SIGNED_URL_PARAMS.EXPIRES)
    || url.searchParams.has(SIGNED_URL_PARAMS.SIGNATURE);
}

export function canonicalRequest(method, url) {
  const params = [];
  for (const [key, value] of url.searchParams) {
    if (key !== SIGNED_URL_PARAMS.SIGNATURE) {
      params.push([key, value]);
    }
  }
  params.sort(([aKey, aValue], [bKey, bValue]) => {
    const keyCompare = aKey.localeCompare(bKey);
    return keyCompare === 0 ? aValue.localeCompare(bValue) : keyCompare;
  });
  const query = params
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  return `${method.toUpperCase()}\n${url.pathname}\n${query}`;
}

async function signCanonicalRequest(signingSecret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(signingSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return base64UrlEncode(signature);
}

function parseExpiry(url) {
  const value = url.searchParams.get(SIGNED_URL_PARAMS.EXPIRES);
  if (!value || !/^\d+$/.test(value)) {
    throw unauthorized();
  }
  return Number.parseInt(value, 10);
}

function timingSafeEqual(left, right) {
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  if (leftBytes.length !== rightBytes.length) {
    return false;
  }
  let diff = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    diff |= leftBytes[index] ^ rightBytes[index];
  }
  return diff === 0;
}

function applyCapability(url, capability) {
  if (!capability) {
    return;
  }
  setOptionalParam(url, SIGNED_URL_PARAMS.CAPABILITY_OPERATION, capability.operation);
  setOptionalParam(url, SIGNED_URL_PARAMS.CAPABILITY_PATH_PREFIX, capability.pathPrefix);
  setOptionalParam(url, SIGNED_URL_PARAMS.CAPABILITY_REF, capability.ref);
  setOptionalParam(url, SIGNED_URL_PARAMS.CAPABILITY_LABEL, capability.label);
}

function setOptionalParam(url, key, value) {
  if (value !== undefined && value !== null && String(value) !== "") {
    url.searchParams.set(key, String(value));
  }
}

function validateCapabilityScope(method, url) {
  const operation = url.searchParams.get(SIGNED_URL_PARAMS.CAPABILITY_OPERATION);
  const pathPrefix = url.searchParams.get(SIGNED_URL_PARAMS.CAPABILITY_PATH_PREFIX);
  const ref = url.searchParams.get(SIGNED_URL_PARAMS.CAPABILITY_REF);

  if (operation && operation !== inferOperation(method, url)) {
    throw unauthorized();
  }
  if (ref && ref !== url.searchParams.get("ref")) {
    throw unauthorized();
  }
  if (pathPrefix) {
    const paths = pathsForRequest(url);
    if (paths.length === 0 || !paths.every((path) => pathMatchesPrefix(path, pathPrefix))) {
      throw unauthorized();
    }
  }
}

function inferOperation(method, url) {
  if (method !== "GET") {
    return null;
  }
  if (url.pathname === "/health" || url.pathname === "/v1/repo/health") {
    return "health";
  }
  if (url.pathname === "/v1/repo/capabilities") {
    return "capabilities";
  }
  if (url.pathname === "/v1/repo/file") {
    return "getFile";
  }
  if (url.pathname === "/v1/repo/files") {
    return "getFiles";
  }
  if (url.pathname.startsWith("/v1/repo/blob/")) {
    return "getBlob";
  }
  if (url.pathname === "/v1/repo/tree") {
    return "getTree";
  }
  if (url.pathname === "/v1/repo/commits") {
    return "getCommits";
  }
  if (url.pathname === "/v1/repo/diff") {
    return "getDiff";
  }
  return null;
}

function pathsForRequest(url) {
  if (url.pathname === "/v1/repo/file" || url.pathname === "/v1/repo/tree") {
    return [url.searchParams.get("path") ?? ""];
  }
  if (url.pathname === "/v1/repo/files") {
    return (url.searchParams.get("paths") ?? "")
      .split(",")
      .map((path) => path.trim())
      .filter(Boolean);
  }
  return [];
}

function pathMatchesPrefix(path, prefix) {
  const normalizedPath = stripLeadingSlash(path);
  const normalizedPrefix = stripLeadingSlash(prefix).replace(/\/+$/, "");
  return normalizedPath === normalizedPrefix || normalizedPath.startsWith(`${normalizedPrefix}/`);
}

function stripLeadingSlash(value) {
  return String(value).replace(/^\/+/, "");
}

function base64UrlEncode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function unauthorized() {
  return new KamayError(ERROR_CODES.UNAUTHORIZED, "Invalid or expired signed URL");
}
