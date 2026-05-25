import test from "node:test";
import assert from "node:assert/strict";
import { handle } from "./index.js";
import { signUrl as signCapabilityUrl } from "./services/signed-url.js";

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

test("valid scoped signed capability GET authorizes matching file path and ref", async () => {
  const signedUrl = await signCapabilityUrl(
    "https://adapter.test/v1/repo/file?path=docs/status/runtime-baseline.md&ref=main",
    SIGNING_SECRET,
    {
      capability: {
        operation: "getFile",
        pathPrefix: "docs/",
        ref: "main",
        label: "review-docs"
      }
    }
  );
  const response = await handle(new Request(signedUrl), {
    ...ENV,
    fetchImpl: async () => new Response(JSON.stringify({
      type: "file",
      path: "docs/status/runtime-baseline.md",
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
  assert.equal(body.data.path, "docs/status/runtime-baseline.md");
});

test("compact signed capability GET authorizes matching file path and ref", async () => {
  const signedUrl = await signCapabilityUrl(
    "https://adapter.test/v1/repo/file?path=docs/status/runtime-baseline.md&ref=main",
    SIGNING_SECRET,
    {
      compact: true,
      capability: {
        operation: "getFile",
        pathPrefix: "docs/",
        ref: "main",
        label: "review-docs"
      }
    }
  );
  const response = await handle(new Request(signedUrl), {
    ...ENV,
    fetchImpl: mockRepositoryFetch()
  });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.path, "docs/status/runtime-baseline.md");
});

test("compact signed capability GET authorizes matching tree and commits reads", async () => {
  const treeUrl = await signCapabilityUrl(
    "https://adapter.test/v1/repo/tree?ref=main&path=docs",
    SIGNING_SECRET,
    {
      compact: true,
      capability: {
        operation: "getTree",
        pathPrefix: "docs",
        ref: "main"
      }
    }
  );
  const commitsUrl = await signCapabilityUrl(
    "https://adapter.test/v1/repo/commits?ref=main&n=2",
    SIGNING_SECRET,
    {
      compact: true,
      capability: {
        operation: "getCommits",
        ref: "main"
      }
    }
  );

  const env = { ...ENV, fetchImpl: mockRepositoryFetch() };
  const treeResponse = await handle(new Request(treeUrl), env);
  const treeBody = await treeResponse.json();
  const commitsResponse = await handle(new Request(commitsUrl), env);
  const commitsBody = await commitsResponse.json();

  assert.equal(treeResponse.status, 200);
  assert.equal(treeBody.data.files[0].path, "docs/status/runtime-baseline.md");
  assert.equal(commitsResponse.status, 200);
  assert.equal(commitsBody.data.count, 2);
});

test("compact signed capability rejects expired and over-max TTL tokens", async () => {
  const expiredUrl = await signCompactToken({
    v: 1,
    method: "GET",
    route: "/v1/repo/capabilities",
    query: [],
    expires: Math.floor(Date.now() / 1000) - 1
  });
  const overMaxUrl = await signCompactToken({
    v: 1,
    method: "GET",
    route: "/v1/repo/capabilities",
    query: [],
    expires: Math.floor(Date.now() / 1000) + 1801
  });

  const expiredResponse = await handle(new Request(expiredUrl), ENV);
  const expiredBody = await expiredResponse.json();
  const overMaxResponse = await handle(new Request(overMaxUrl), ENV);
  const overMaxBody = await overMaxResponse.json();

  assert.equal(expiredResponse.status, 401);
  assert.equal(expiredBody.error.code, "UNAUTHORIZED");
  assert.equal(overMaxResponse.status, 401);
  assert.equal(overMaxBody.error.code, "UNAUTHORIZED");
});

test("compact signed capability rejects tampered payload or signature", async () => {
  const signedUrl = await signCompactToken({
    v: 1,
    method: "GET",
    route: "/v1/repo/file",
    query: [["path", "README.md"], ["ref", "main"]],
    expires: Math.floor(Date.now() / 1000) + 900,
    capability: { operation: "getFile", pathPrefix: "README.md", ref: "main" }
  });
  const tamperedPayloadUrl = new URL(signedUrl);
  const [payload, signature] = tamperedPayloadUrl.searchParams.get("kmy_cap").split(".");
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  parsed.query = [["path", "AGENTS.md"], ["ref", "main"]];
  tamperedPayloadUrl.searchParams.set(
    "kmy_cap",
    `${Buffer.from(JSON.stringify(parsed)).toString("base64url")}.${signature}`
  );
  const tamperedSignatureUrl = new URL(signedUrl);
  tamperedSignatureUrl.searchParams.set("kmy_cap", `${payload}.bad${signature.slice(3)}`);

  const payloadResponse = await handle(new Request(tamperedPayloadUrl), ENV);
  const payloadBody = await payloadResponse.json();
  const signatureResponse = await handle(new Request(tamperedSignatureUrl), ENV);
  const signatureBody = await signatureResponse.json();

  assert.equal(payloadResponse.status, 401);
  assert.equal(payloadBody.error.code, "UNAUTHORIZED");
  assert.equal(signatureResponse.status, 401);
  assert.equal(signatureBody.error.code, "UNAUTHORIZED");
});

test("compact signed capability rejects visible route mismatch", async () => {
  const signedUrl = await signCompactToken({
    v: 1,
    method: "GET",
    route: "/v1/repo/file",
    query: [["path", "README.md"], ["ref", "main"]],
    expires: Math.floor(Date.now() / 1000) + 900,
    capability: { operation: "getFile", pathPrefix: "README.md", ref: "main" }
  });
  const url = new URL(signedUrl);
  url.pathname = "/v1/repo/commits";

  const response = await handle(new Request(url), ENV);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error.code, "UNAUTHORIZED");
});

test("compact signed capability rejects operation, ref, and path-prefix mismatches", async () => {
  const operationUrl = await signCompactToken({
    v: 1,
    method: "GET",
    route: "/v1/repo/commits",
    query: [["ref", "main"], ["n", "3"]],
    expires: Math.floor(Date.now() / 1000) + 900,
    capability: { operation: "getFile", ref: "main" }
  });
  const refUrl = await signCompactToken({
    v: 1,
    method: "GET",
    route: "/v1/repo/tree",
    query: [["ref", "dev"], ["path", "docs"]],
    expires: Math.floor(Date.now() / 1000) + 900,
    capability: { operation: "getTree", pathPrefix: "docs", ref: "main" }
  });
  const pathUrl = await signCompactToken({
    v: 1,
    method: "GET",
    route: "/v1/repo/file",
    query: [["path", "README.md"], ["ref", "main"]],
    expires: Math.floor(Date.now() / 1000) + 900,
    capability: { operation: "getFile", pathPrefix: "docs", ref: "main" }
  });

  for (const signedUrl of [operationUrl, refUrl, pathUrl]) {
    const response = await handle(new Request(signedUrl), ENV);
    const body = await response.json();
    assert.equal(response.status, 401);
    assert.equal(body.error.code, "UNAUTHORIZED");
  }
});

test("compact signed capability does not authorize POST requests", async () => {
  const signedUrl = await signCapabilityUrl(
    "https://adapter.test/v1/repo/files?paths=README.md&ref=main",
    SIGNING_SECRET,
    {
      compact: true,
      capability: {
        operation: "getFiles",
        pathPrefix: "README.md",
        ref: "main"
      }
    }
  );
  const response = await handle(new Request(signedUrl, {
    method: "POST",
    body: JSON.stringify({ paths: ["README.md"], ref: "main" })
  }), ENV);
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error.code, "UNAUTHORIZED");
});

test("scoped signed capability rejects path outside prefix", async () => {
  const signedUrl = await signCapabilityUrl(
    "https://adapter.test/v1/repo/file?path=README.md&ref=main",
    SIGNING_SECRET,
    {
      capability: {
        operation: "getFile",
        pathPrefix: "docs/",
        ref: "main"
      }
    }
  );
  const response = await handle(new Request(signedUrl), ENV);
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.error.code, "UNAUTHORIZED");
});

test("scoped signed capability rejects mismatched ref", async () => {
  const signedUrl = await signCapabilityUrl(
    "https://adapter.test/v1/repo/tree?ref=dev&path=docs",
    SIGNING_SECRET,
    {
      capability: {
        operation: "getTree",
        pathPrefix: "docs",
        ref: "main"
      }
    }
  );
  const response = await handle(new Request(signedUrl), ENV);
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.error.code, "UNAUTHORIZED");
});

test("scoped signed capability rejects mismatched operation", async () => {
  const signedUrl = await signCapabilityUrl(
    "https://adapter.test/v1/repo/commits?ref=main&n=3",
    SIGNING_SECRET,
    {
      capability: {
        operation: "getFile",
        ref: "main"
      }
    }
  );
  const response = await handle(new Request(signedUrl), ENV);
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.error.code, "UNAUTHORIZED");
});

test("scoped signed capability rejects path prefix on non-path operations", async () => {
  const signedUrl = await signCapabilityUrl(
    "https://adapter.test/v1/repo/commits?ref=main&n=3",
    SIGNING_SECRET,
    {
      capability: {
        operation: "getCommits",
        pathPrefix: "docs/",
        ref: "main"
      }
    }
  );
  const response = await handle(new Request(signedUrl), ENV);
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

async function signCompactToken(payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encodedPayload));
  return `https://adapter.test${payload.route}?kmy_cap=${encodedPayload}.${base64UrlEncode(signature)}`;
}

function mockRepositoryFetch() {
  return async (input) => {
    const url = new URL(input);
    const headers = {
      "x-ratelimit-remaining": "1",
      "x-ratelimit-limit": "2",
      "x-ratelimit-reset": "1727049600"
    };
    if (url.pathname.endsWith("/contents/docs/status/runtime-baseline.md")) {
      return jsonResponse({
        type: "file",
        path: "docs/status/runtime-baseline.md",
        sha: "abc123",
        size: 7,
        content: btoa("content")
      }, headers);
    }
    if (url.pathname.endsWith("/git/ref/heads/main")) {
      return jsonResponse({ object: { sha: "abcdef1234567890" } }, headers);
    }
    if (url.pathname.endsWith("/git/trees/abcdef1234567890")) {
      return jsonResponse({
        tree: [{
          path: "docs/status/runtime-baseline.md",
          sha: "abc123",
          size: 7,
          mode: "100644",
          type: "blob"
        }]
      }, headers);
    }
    if (url.pathname.endsWith("/commits")) {
      return jsonResponse([
        { sha: "aaa111", commit: { message: "one", author: { name: "A", date: "2026-01-01T00:00:00.000Z" } } },
        { sha: "bbb222", commit: { message: "two", author: { name: "B", date: "2026-01-02T00:00:00.000Z" } } }
      ], headers);
    }
    return new Response("{}", { status: 404, headers });
  };
}

function jsonResponse(body, headers) {
  return new Response(JSON.stringify(body), { headers });
}
