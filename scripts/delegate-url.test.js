import test from "node:test";
import assert from "node:assert/strict";
import { mintDelegatedCapability } from "./delegate-url.js";
import { validateSignedUrl } from "../core/services/signed-url.js";

const SIGNING_SECRET = "test-signing-secret";

test("readme preset mints a scoped capability URL but hides it by default", async () => {
  const result = await mintDelegatedCapability("readme", {
    baseUrl: "https://adapter.test",
    signingSecret: SIGNING_SECRET,
    ttlSeconds: 300
  });

  assert.equal(result.status, "PASS");
  assert.equal(result.preset, "readme");
  assert.equal(result.format, "compact-v2");
  assert.equal(result.urlPrinted, false);
  assert.equal(result.url, undefined);
  assert.equal(result.target.operation, "getFile");
  assert.equal(result.target.pathPrefix, "README.md");
  assert.equal(result.target.label, null);
});

test("print-url option explicitly includes a valid bearer URL", async () => {
  const result = await mintDelegatedCapability("docs-tree", {
    baseUrl: "https://adapter.test",
    signingSecret: SIGNING_SECRET,
    ttlSeconds: 300,
    printUrl: true
  });

  assert.equal(result.status, "PASS");
  assert.equal(result.urlPrinted, true);
  assert.match(result.url, /^https:\/\/adapter\.test\/v1\/repo\/tree\?/);
  assert.match(result.url, /kmy_cap=/);
  assert.doesNotMatch(result.url, /kmy_cap_op=getTree/);
  assert.equal(readPayload(result.url).v, 2);
  const routedRequest = await validateSignedUrl(new Request(result.url), SIGNING_SECRET);
  const routedUrl = new URL(routedRequest.url);
  assert.equal(routedUrl.pathname, "/v1/repo/tree");
  assert.equal(routedUrl.searchParams.get("path"), "docs");
});

test("commits preset does not add path-prefix scope", async () => {
  const result = await mintDelegatedCapability("commits", {
    baseUrl: "https://adapter.test",
    signingSecret: SIGNING_SECRET,
    ttlSeconds: 300,
    printUrl: true,
    n: 5
  });
  const url = new URL(result.url);
  const token = url.searchParams.get("kmy_cap");

  assert.ok(token);
  assert.equal(url.searchParams.has("kmy_cap_path_prefix"), false);
  const routedRequest = await validateSignedUrl(new Request(result.url), SIGNING_SECRET);
  const routedUrl = new URL(routedRequest.url);
  assert.equal(routedUrl.searchParams.get("n"), "5");
});

test("compact-v1 option produces the previous verbose compact format", async () => {
  const result = await mintDelegatedCapability("readme", {
    baseUrl: "https://adapter.test",
    signingSecret: SIGNING_SECRET,
    ttlSeconds: 300,
    printUrl: true,
    compactVersion: 1,
    label: "readme"
  });
  const payload = readPayload(result.url);

  assert.equal(result.format, "compact-v1");
  assert.equal(payload.v, 1);
  assert.equal(payload.route, "/v1/repo/file");
  assert.equal(payload.capability.operation, "getFile");
  await validateSignedUrl(new Request(result.url), SIGNING_SECRET);
});

test("default compact-v2 URL is shorter than compact-v1 for the same preset", async () => {
  const v2 = await mintDelegatedCapability("readme", {
    baseUrl: "https://adapter.test",
    signingSecret: SIGNING_SECRET,
    ttlSeconds: 300,
    printUrl: true
  });
  const v1 = await mintDelegatedCapability("readme", {
    baseUrl: "https://adapter.test",
    signingSecret: SIGNING_SECRET,
    ttlSeconds: 300,
    printUrl: true,
    compactVersion: 1,
    label: "readme"
  });

  assert.equal(v2.format, "compact-v2");
  assert.ok(v2.url.length < v1.url.length);
});

test("legacy option produces the old exact-query signed URL format", async () => {
  const result = await mintDelegatedCapability("readme", {
    baseUrl: "https://adapter.test",
    signingSecret: SIGNING_SECRET,
    ttlSeconds: 300,
    printUrl: true,
    legacy: true
  });
  const url = new URL(result.url);

  assert.equal(result.format, "legacy");
  assert.equal(url.searchParams.has("kmy_cap"), false);
  assert.equal(url.searchParams.get("kmy_cap_op"), "getFile");
  assert.equal(url.searchParams.get("path"), "README.md");
  await validateSignedUrl(new Request(result.url), SIGNING_SECRET);
});

function readPayload(input) {
  const token = new URL(input).searchParams.get("kmy_cap");
  const [payload] = token.split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}
