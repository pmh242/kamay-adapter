import { ERROR_CODES, KamayError } from "./errors.js";

export const SIGNED_URL_PARAMS = Object.freeze({
  COMPACT_CAPABILITY: "kmy_cap",
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
const decoder = new TextDecoder();

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
  if (url.searchParams.has(SIGNED_URL_PARAMS.COMPACT_CAPABILITY)) {
    return await validateCompactSignedUrl(request, signingSecret, nowMs);
  }
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
  return request;
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
  if (options.compact) {
    return await signCompactUrl(input, signingSecret, {
      method,
      ttlSeconds,
      capability: options.capability
    });
  }
  const url = new URL(input);
  url.searchParams.delete(SIGNED_URL_PARAMS.SIGNATURE);
  url.searchParams.delete(SIGNED_URL_PARAMS.COMPACT_CAPABILITY);
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
  return url.searchParams.has(SIGNED_URL_PARAMS.COMPACT_CAPABILITY)
    || url.searchParams.has(SIGNED_URL_PARAMS.EXPIRES)
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
  return await signPayload(signingSecret, payload);
}

async function signPayload(signingSecret, payload) {
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

async function signCompactUrl(input, signingSecret, options) {
  const url = new URL(input);
  url.searchParams.delete(SIGNED_URL_PARAMS.COMPACT_CAPABILITY);
  const query = [];
  for (const [key, value] of url.searchParams) {
    if (!isSignedUrlParam(key)) {
      query.push([key, value]);
    }
  }
  const payload = {
    v: 1,
    method: options.method,
    route: url.pathname,
    query,
    expires: Math.floor(Date.now() / 1000) + options.ttlSeconds
  };
  if (options.capability) {
    payload.capability = compactCapability(options.capability);
  }
  const encodedPayload = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = await signPayload(signingSecret, encodedPayload);
  const compactUrl = new URL(url.origin + url.pathname);
  compactUrl.searchParams.set(
    SIGNED_URL_PARAMS.COMPACT_CAPABILITY,
    `${encodedPayload}.${signature}`
  );
  return compactUrl.toString();
}

async function validateCompactSignedUrl(request, signingSecret, nowMs) {
  const url = new URL(request.url);
  const token = url.searchParams.get(SIGNED_URL_PARAMS.COMPACT_CAPABILITY);
  const [encodedPayload, receivedSignature, extra] = String(token ?? "").split(".");
  if (!encodedPayload || !receivedSignature || extra !== undefined) {
    throw unauthorized();
  }
  const expectedSignature = await signPayload(signingSecret, encodedPayload);
  if (!timingSafeEqual(receivedSignature, expectedSignature)) {
    throw unauthorized();
  }

  const payload = parseCompactPayload(encodedPayload);
  const nowSeconds = Math.floor(nowMs / 1000);
  if (payload.expires <= nowSeconds) {
    throw unauthorized();
  }
  if (payload.expires - nowSeconds > SIGNED_URL_TTL.MAX_SECONDS) {
    throw unauthorized();
  }
  if (payload.method !== "GET" || request.method !== payload.method) {
    throw unauthorized();
  }
  if (url.pathname !== payload.route) {
    throw unauthorized();
  }

  const routedUrl = new URL(url.origin + payload.route);
  for (const [key, value] of payload.query) {
    routedUrl.searchParams.append(key, value);
  }
  validateCapabilityScope(payload.method, routedUrl, payload.capability ?? null);
  return new Request(routedUrl, {
    method: "GET",
    headers: request.headers
  });
}

function parseCompactPayload(encodedPayload) {
  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    if (
      payload?.v !== 1
      || payload.method !== "GET"
      || !isValidRoute(payload.route)
      || !Array.isArray(payload.query)
      || !Number.isInteger(payload.expires)
    ) {
      throw unauthorized();
    }
    for (const entry of payload.query) {
      if (
        !Array.isArray(entry)
        || entry.length !== 2
        || typeof entry[0] !== "string"
        || typeof entry[1] !== "string"
        || isSignedUrlParam(entry[0])
      ) {
        throw unauthorized();
      }
    }
    if (payload.capability !== undefined && !isValidCapability(payload.capability)) {
      throw unauthorized();
    }
    return payload;
  } catch (error) {
    if (error instanceof KamayError) {
      throw error;
    }
    throw unauthorized();
  }
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

function validateCapabilityScope(method, url, capability = null) {
  const operation = capability
    ? capability.operation ?? null
    : url.searchParams.get(SIGNED_URL_PARAMS.CAPABILITY_OPERATION);
  const pathPrefix = capability
    ? capability.pathPrefix ?? null
    : url.searchParams.get(SIGNED_URL_PARAMS.CAPABILITY_PATH_PREFIX);
  const ref = capability
    ? capability.ref ?? null
    : url.searchParams.get(SIGNED_URL_PARAMS.CAPABILITY_REF);

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

function compactCapability(capability) {
  const compact = {};
  setOptionalProperty(compact, "operation", capability.operation);
  setOptionalProperty(compact, "pathPrefix", capability.pathPrefix);
  setOptionalProperty(compact, "ref", capability.ref);
  setOptionalProperty(compact, "label", capability.label);
  return compact;
}

function setOptionalProperty(target, key, value) {
  if (value !== undefined && value !== null && String(value) !== "") {
    target[key] = String(value);
  }
}

function isValidCapability(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const allowedKeys = ["operation", "pathPrefix", "ref", "label"];
  return Object.entries(value).every(([key, entry]) => (
    allowedKeys.includes(key)
    && typeof entry === "string"
    && entry.length > 0
  ));
}

function isValidRoute(value) {
  return typeof value === "string"
    && value.startsWith("/")
    && !value.startsWith("//")
    && !value.includes("\\");
}

function isSignedUrlParam(key) {
  return Object.values(SIGNED_URL_PARAMS).includes(key);
}

function base64UrlEncode(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlDecode(value) {
  const normalized = String(value)
    .replaceAll("-", "+")
    .replaceAll("_", "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return decoder.decode(bytes);
}

function unauthorized() {
  return new KamayError(ERROR_CODES.UNAUTHORIZED, "Invalid or expired signed URL");
}
