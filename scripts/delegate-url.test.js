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
  assert.equal(result.urlPrinted, false);
  assert.equal(result.url, undefined);
  assert.equal(result.target.operation, "getFile");
  assert.equal(result.target.pathPrefix, "README.md");
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
  assert.match(result.url, /kmy_cap_op=getTree/);
  await validateSignedUrl(new Request(result.url), SIGNING_SECRET);
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

  assert.equal(url.searchParams.get("kmy_cap_op"), "getCommits");
  assert.equal(url.searchParams.has("kmy_cap_path_prefix"), false);
  assert.equal(url.searchParams.get("n"), "5");
});
