import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateStatus,
  buildDiagnosticsReport,
  redactForExport
} from "./diagnostics.js";

const ENV = Object.freeze({
  KAMAY_TOKEN: "header-secret",
  KAMAY_SIGNING_SECRET: "signing-secret",
  KAMAY_ADAPTER_BASE_URL: "https://adapter.example.test"
});

test("aggregateStatus orders BLOCKED, FAIL, WARN, PASS", () => {
  assert.equal(aggregateStatus([{ status: "PASS" }]), "PASS");
  assert.equal(aggregateStatus([{ status: "WARN" }, { status: "PASS" }]), "WARN");
  assert.equal(aggregateStatus([{ status: "FAIL" }, { status: "WARN" }]), "FAIL");
  assert.equal(aggregateStatus([{ status: "BLOCKED" }, { status: "FAIL" }]), "BLOCKED");
});

test("missing local secrets returns BLOCKED with presence booleans only", async () => {
  const report = await buildDiagnosticsReport({
    env: {},
    now: new Date("2026-05-26T00:00:00.000Z")
  });

  assert.equal(report.status, "BLOCKED");
  assert.equal(report.environment.envPresence.KAMAY_TOKEN, false);
  assert.equal(report.environment.envPresence.KAMAY_SIGNING_SECRET, false);
  assert.equal(report.checks[0].classification, "local_config");
  assert.equal(report.redaction.secretsIncluded, false);
  assert.equal(redactForExport(report), true);
});

test("passing diagnostics report is redacted and shaped for export", async () => {
  const report = await buildDiagnosticsReport({
    env: ENV,
    now: new Date("2026-05-26T00:00:00.000Z"),
    fetchImpl: makeFetch()
  });

  assert.equal(report.schemaVersion, 1);
  assert.equal(report.status, "PASS");
  assert.equal(report.environment.baseUrl, "https://adapter.example.test");
  assert.equal(report.compatibility.claudeWeb, "blocked_by_provider_egress_policy");
  assert.equal(report.redaction.fullBearerUrlsIncluded, false);
  assert.equal(report.checks.some((check) => check.urlMetadata?.format === "compact-v2"), true);
  assert.equal(redactForExport(report), true);

  const text = JSON.stringify(report);
  assert.equal(text.includes("header-secret"), false);
  assert.equal(text.includes("signing-secret"), false);
  assert.equal(text.includes("kmy_cap="), false);
  assert.equal(text.includes("kmy_sig="), false);
});

test("redaction rejects full bearer URL and signature values", () => {
  assert.equal(redactForExport({ url: "https://example.test/file?kmy_cap=abc.def" }), false);
  assert.equal(redactForExport({ url: "https://example.test/file?kmy_sig=abc" }), false);
});

function makeFetch() {
  return async (input, options = {}) => {
    const url = new URL(String(input));
    const method = options.method ?? "GET";
    if (url.pathname === "/v1/repo/capabilities" && !options.headers?.["X-Kamay-Token"]) {
      return jsonResponse(401, errorBody("UNAUTHORIZED"));
    }
    if (url.pathname === "/v1/repo/capabilities") {
      return jsonResponse(200, successBody({ provider: "repository", backend: "github" }));
    }
    if (url.pathname === "/v1/repo/file") {
      return jsonResponse(200, successBody({ path: "README.md", ref: "main" }));
    }
    if (url.pathname === "/v1/repo/files" && method === "POST") {
      return jsonResponse(401, errorBody("UNAUTHORIZED"));
    }
    if (url.pathname === "/v1/repo/commits") {
      return jsonResponse(200, successBody({ ref: "main", commits: [{ sha: "abc123" }] }));
    }
    if (url.pathname === "/v1/repo/tree") {
      return jsonResponse(200, successBody({ ref: "main", files: [{ path: "docs/README.md" }] }));
    }
    return jsonResponse(404, errorBody("NOT_FOUND"));
  };
}

function successBody(data) {
  return {
    data,
    meta: meta()
  };
}

function errorBody(code) {
  return {
    error: { code, message: code },
    meta: meta()
  };
}

function meta() {
  return {
    requestId: "kmy_test_abcdef12",
    apiVersion: "v1",
    provider: "repository",
    backend: "github",
    timestamp: "2026-05-26T00:00:00.000Z",
    rateLimit: {
      source: "github",
      remaining: 4999,
      limit: 5000,
      resetAt: "2026-05-26T01:00:00.000Z"
    }
  };
}

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
