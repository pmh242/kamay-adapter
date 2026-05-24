import test from "node:test";
import assert from "node:assert/strict";
import { GitHubBackend } from "./github.js";
import { assertBackendValid } from "./index.js";
import { runRepositoryContract } from "../contracts/contract.test.js";
import { ERROR_CODES, KamayError } from "../../../services/errors.js";
import { LIMITS } from "../contracts/limits.js";

const FULL_SHA = "abc1234567890abcdef1234567890abcdef1234";
const BLOB_SHA = "def4567890abcdef1234567890abcdef1234567";
const REF = "main";

const fixtures = {
  backend: "github",
  filePath: "README.md",
  ref: REF,
  args: {
    health: [],
    getFile: ["README.md", REF],
    getFiles: [["README.md"], REF],
    getBlob: [BLOB_SHA],
    getTree: [REF],
    getCommits: [REF, 2],
    getDiff: [FULL_SHA]
  }
};

runRepositoryContract(makeBackend(), {
  label: "GitHubBackend",
  fixtures,
  expectImplemented: [
    "health",
    "capabilities",
    "getFile",
    "getFiles",
    "getBlob",
    "getTree",
    "getCommits",
    "getDiff"
  ]
});

test("GitHubBackend passes explicit backend conformance assertion", async () => {
  assert.equal(await assertBackendValid(makeBackend()), true);
});

test("GitHubBackend constructor rejects missing repo", () => {
  assert.throws(
    () => new GitHubBackend({ token: "token", fetchImpl: makeMockFetch([]) }),
    (error) => error instanceof KamayError && error.code === ERROR_CODES.INTERNAL_ERROR
  );
});

test("GitHubBackend constructor rejects missing token", () => {
  assert.throws(
    () => new GitHubBackend({ repo: "pmh242/kamay", fetchImpl: makeMockFetch([]) }),
    (error) => error instanceof KamayError && error.code === ERROR_CODES.INTERNAL_ERROR
  );
});

test("getFile decodes base64 content correctly", async () => {
  const result = await makeBackend().getFile("README.md", REF);
  assert.equal(result.content, "# Kamay\n");
});

test("getFile returns NOT_FOUND on missing path", async () => {
  await assert.rejects(
    () => makeBackend().getFile("missing.md", REF),
    (error) => error instanceof KamayError && error.code === ERROR_CODES.NOT_FOUND
  );
});

test("getFiles isolates per-path errors", async () => {
  const result = await makeBackend().getFiles(["README.md", "missing.md"], REF);
  assert.equal(result.count, 2);
  assert.equal(result.files[0].ok, true);
  assert.equal(result.files[1].ok, false);
  assert.equal(result.files[1].error.code, ERROR_CODES.NOT_FOUND);
});

test("getFiles rejects empty paths array", async () => {
  await assert.rejects(
    () => makeBackend().getFiles([], REF),
    (error) => error instanceof KamayError && error.code === ERROR_CODES.INVALID_REQUEST
  );
});

test("getFiles rejects more than 50 paths", async () => {
  const paths = Array.from({ length: LIMITS.MAX_BATCH_PATHS + 1 }, (_, index) => `${index}.md`);
  await assert.rejects(
    () => makeBackend().getFiles(paths, REF),
    (error) => error instanceof KamayError && error.code === ERROR_CODES.PAYLOAD_TOO_LARGE
  );
});

test("getBlob rejects invalid SHA", async () => {
  await assert.rejects(
    () => makeBackend().getBlob("nope"),
    (error) => error instanceof KamayError && error.code === ERROR_CODES.INVALID_REQUEST
  );
});

test("getCommits rejects more than 30 commits", async () => {
  await assert.rejects(
    () => makeBackend().getCommits(REF, LIMITS.MAX_COMMITS + 1),
    (error) => error instanceof KamayError && error.code === ERROR_CODES.PAYLOAD_TOO_LARGE
  );
});

test("getDiff rejects invalid SHA", async () => {
  await assert.rejects(
    () => makeBackend().getDiff("nope"),
    (error) => error instanceof KamayError && error.code === ERROR_CODES.INVALID_REQUEST
  );
});

test("getDiff truncates large patches", async () => {
  const result = await makeBackend().getDiff(FULL_SHA);
  assert.equal(result.files[0].patch.length, LIMITS.MAX_DIFF_PATCH_BYTES);
  assert.equal(result.files[0].patchTruncated, true);
});

test("rate limit headers are parsed into lastRateLimit", async () => {
  const backend = makeBackend();
  await backend.health();
  assert.deepEqual(backend.lastRateLimit, {
    source: "github",
    remaining: 4999,
    limit: 5000,
    resetAt: "2024-09-23T00:00:00.000Z"
  });
});

function makeBackend() {
  return new GitHubBackend({
    repo: "pmh242/kamay",
    token: "ghp_mock",
    fetchImpl: makeMockFetch(defaultRouteMap())
  });
}

function makeMockFetch(routeMap) {
  return async (url) => {
    const pathname = new URL(url).pathname + new URL(url).search;
    for (const [pattern, handler] of routeMap) {
      if (new RegExp(pattern).test(pathname)) {
        const { status = 200, body } = handler(pathname);
        return jsonResponse(status, body);
      }
    }
    return jsonResponse(404, { message: `No mock for ${pathname}` });
  };
}

function defaultRouteMap() {
  return [
    ["^/repos/pmh242/kamay$", () => ({
      body: { full_name: "pmh242/kamay" }
    })],
    ["^/repos/pmh242/kamay/contents/README\\.md\\?ref=main$", () => ({
      body: {
        type: "file",
        path: "README.md",
        sha: BLOB_SHA,
        size: 8,
        content: btoa("# Kamay\n")
      }
    })],
    ["^/repos/pmh242/kamay/contents/missing\\.md\\?ref=main$", () => ({
      status: 404,
      body: { message: "Not Found" }
    })],
    ["^/repos/pmh242/kamay/git/ref/heads/main$", () => ({
      body: { object: { sha: FULL_SHA } }
    })],
    [`^/repos/pmh242/kamay/git/trees/${FULL_SHA}\\?recursive=1$`, () => ({
      body: {
        sha: FULL_SHA,
        truncated: false,
        tree: [
          { path: "README.md", mode: "100644", type: "blob", sha: BLOB_SHA, size: 8 }
        ]
      }
    })],
    ["^/repos/pmh242/kamay/commits\\?per_page=2&sha=main$", () => ({
      body: [
        {
          sha: FULL_SHA,
          commit: {
            message: "Initial",
            author: { name: "Pat", date: "2024-09-23T00:00:00.000Z" },
            committer: { date: "2024-09-23T00:00:00.000Z" }
          }
        }
      ]
    })],
    [`^/repos/pmh242/kamay/git/blobs/${BLOB_SHA}$`, () => ({
      body: {
        sha: BLOB_SHA,
        size: 8,
        content: btoa("# Kamay\n")
      }
    })],
    [`^/repos/pmh242/kamay/commits/${FULL_SHA}$`, () => ({
      body: {
        sha: FULL_SHA,
        commit: {
          message: "Expand adapter",
          author: { name: "Pat", date: "2024-09-23T00:00:00.000Z" },
          committer: { date: "2024-09-23T00:00:00.000Z" }
        },
        author: { login: "pmh242" },
        stats: { total: 4, additions: 3, deletions: 1 },
        files: [
          {
            filename: "README.md",
            status: "modified",
            additions: 3,
            deletions: 1,
            changes: 4,
            patch: "x".repeat(LIMITS.MAX_DIFF_PATCH_BYTES + 10)
          }
        ]
      }
    })]
  ];
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "x-ratelimit-remaining": "4999",
      "x-ratelimit-limit": "5000",
      "x-ratelimit-reset": "1727049600"
    }
  });
}
