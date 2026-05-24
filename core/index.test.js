import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "./index.js";

const KAMAY_TOKEN = "test-kamay-token";
const SIGNING_SECRET = "test-signing-secret";
const ENV = Object.freeze({
  KAMAY_TOKEN,
  KAMAY_SIGNING_SECRET: SIGNING_SECRET,
  KAMAY_SOURCE: "github",
  KAMAY_REPO: "pmh242/kamay",
  GITHUB_TOKEN: "ghp_mock",
  fetchImpl: async () => new Response("{}", { status: 500 })
});

test("header auth still authorizes repository routes", async () => {
  const response = await handle(
    new Request("https://adapter.test/v1/repo/capabilities", {
      headers: { "X-Kamay-Token": KAMAY_TOKEN }
    }),
    ENV
  );
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.provider, "repository");
  assert.equal(body.data.backend, "github");
});

test("missing auth returns UNAUTHORIZED", async () => {
  const response = await handle(
    new Request("https://adapter.test/v1/repo/capabilities"),
    ENV
  );
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.error.code, "UNAUTHORIZED");
});

test("valid signed GET URL authorizes repository routes", async () => {
  const signedUrl = await signUrl("https://adapter.test/v1/repo/capabilities");
  const response = await handle(new Request(signedUrl), ENV);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.provider, "repository");
});

test("signed URL verification is independent of query parameter ordering", async () => {
  const signedUrl = await signUrl("https://adapter.test/v1/repo/file?ref=main&path=README.md");
  const url = new URL(signedUrl);
  const reordered = new URL("https://adapter.test/v1/repo/file");
  reordered.searchParams.set("kmy_sig", url.searchParams.get("kmy_sig"));
  reordered.searchParams.set("path", url.searchParams.get("path"));
  reordered.searchParams.set("kmy_expires", url.searchParams.get("kmy_expires"));
  reordered.searchParams.set("ref", url.searchParams.get("ref"));
  const request = new Request(reordered, {
    headers: { "X-Test-Skip-Upstream": "unused" }
  });
  const response = await handle(request, {
    ...ENV,
    fetchImpl: async () => new Response(JSON.stringify({
      type: "file",
      path: "README.md",
      sha: "abc123",
      size: 7,
      content: btoa("content")
    }), {
      headers: {
        "x-ratelimit-remaining": "1",
        "x-ratelimit-limit": "2",
        "x-ratelimit-reset": "1727049600"
      }
    })
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.path, "README.md");
});

test("expired signed URL returns UNAUTHORIZED", async () => {
  const signedUrl = await signUrl("https://adapter.test/v1/repo/capabilities", {
    expires: Math.floor(Date.now() / 1000) - 1
  });
  const response = await handle(new Request(signedUrl), ENV);
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.error.code, "UNAUTHORIZED");
});

test("signed URL with TTL above 30 minutes returns UNAUTHORIZED", async () => {
  const signedUrl = await signUrl("https://adapter.test/v1/repo/capabilities", {
    expires: Math.floor(Date.now() / 1000) + 1801
  });
  const response = await handle(new Request(signedUrl), ENV);
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.error.code, "UNAUTHORIZED");
});

test("tampered signed URL query returns UNAUTHORIZED", async () => {
  const signedUrl = await signUrl("https://adapter.test/v1/repo/file?path=README.md&ref=main");
  const url = new URL(signedUrl);
  url.searchParams.set("path", "AGENTS.md");
  const response = await handle(new Request(url), ENV);
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.error.code, "UNAUTHORIZED");
});

test("tampered signed URL path returns UNAUTHORIZED", async () => {
  const signedUrl = await signUrl("https://adapter.test/v1/repo/file?path=README.md&ref=main");
  const url = new URL(signedUrl);
  url.pathname = "/v1/repo/commits";
  const response = await handle(new Request(url), ENV);
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.error.code, "UNAUTHORIZED");
});

test("signed URL does not authorize POST requests", async () => {
  const signedUrl = await signUrl("https://adapter.test/v1/repo/files", {
    method: "POST"
  });
  const response = await handle(new Request(signedUrl, {
    method: "POST",
    body: JSON.stringify({ paths: ["README.md"], ref: "main" })
  }), ENV);
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.error.code, "UNAUTHORIZED");
});

async function signUrl(input, options = {}) {
  const method = options.method ?? "GET";
  const expires = options.expires ?? Math.floor(Date.now() / 1000) + 900;
  const url = new URL(input);
  url.searchParams.set("kmy_expires", String(expires));
  const payload = canonicalRequest(method, url);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  url.searchParams.set("kmy_sig", base64UrlEncode(signature));
  return url.toString();
}

function canonicalRequest(method, url) {
  const params = [];
  for (const [key, value] of url.searchParams) {
    if (key !== "kmy_sig") {
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

function base64UrlEncode(buffer) {
  return Buffer.from(buffer)
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
