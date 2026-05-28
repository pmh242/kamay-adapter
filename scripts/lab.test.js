import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  aggregateStatus,
  buildSummary,
  runLab,
  sanitizeDiagnostics,
  scanTextForForbiddenMarkers
} from "./lab.js";

test("aggregateStatus orders BLOCKED, FAIL, WARN, PASS", () => {
  assert.equal(aggregateStatus([{ status: "PASS" }]), "PASS");
  assert.equal(aggregateStatus([{ status: "WARN" }, { status: "PASS" }]), "WARN");
  assert.equal(aggregateStatus([{ status: "FAIL" }, { status: "WARN" }]), "FAIL");
  assert.equal(aggregateStatus([{ status: "BLOCKED" }, { status: "FAIL" }]), "BLOCKED");
});

test("buildSummary creates the lab artifact shape", () => {
  const summary = buildSummary({
    mode: "smoke",
    now: new Date("2026-05-27T00:00:00.000Z"),
    checks: [{ name: "core:npm-test", status: "PASS", classification: "validation", errorCode: null }],
    artifacts: [{ name: "smokeLog", path: "tmp/agent-lab/run/smoke.log" }],
    skipped: []
  });

  assert.equal(summary.schemaVersion, 1);
  assert.equal(summary.tool.name, "kamay-adapter-agent-lab");
  assert.equal(summary.mode, "smoke");
  assert.equal(summary.status, "PASS");
  assert.equal(summary.redaction.safe, true);
});

test("sanitizeDiagnostics removes env key names and remains evidence-safe", () => {
  const sanitized = sanitizeDiagnostics(makeDiagnostics());
  const text = JSON.stringify(sanitized);

  assert.equal(text.includes("KAMAY_TOKEN"), false);
  assert.equal(text.includes("KAMAY_SIGNING_SECRET"), false);
  assert.equal(sanitized.environment.localConfigPresence.headerAuthSecret, true);
  assert.equal(sanitized.environment.localConfigPresence.signingSecret, true);
});

test("sanitizeDiagnostics rejects forbidden bearer markers", () => {
  const diagnostics = makeDiagnostics({
    checks: [{ ...makeCheck(), errorCode: "kmy_cap=abc.def" }]
  });

  assert.throws(
    () => sanitizeDiagnostics(diagnostics),
    /forbidden secret or bearer URL markers/
  );
});

test("scanTextForForbiddenMarkers detects sensitive markers", () => {
  assert.deepEqual(scanTextForForbiddenMarkers("safe text"), []);
  assert.deepEqual(scanTextForForbiddenMarkers("bad kmy_sig=value"), ["kmy_sig="]);
});

test("runLab smoke writes summary, sanitized diagnostics, and evidence", () => {
  const cwd = mkdtempSync(join(tmpdir(), "kamay-lab-"));
  const out = join(cwd, "tmp/agent-lab/smoke");
  const result = runLab({
    mode: "smoke",
    out,
    cwd,
    now: new Date("2026-05-27T00:00:00.000Z"),
    runCommand: makeRunner(cwd)
  });

  assert.equal(result.summary.status, "PASS");
  assert.equal(existsSync(join(out, "summary.json")), true);
  assert.equal(existsSync(join(out, "diagnostics.json")), true);
  assert.equal(existsSync(join(out, "evidence.json")), true);

  const diagnosticsText = readFileSync(join(out, "diagnostics.json"), "utf8");
  assert.equal(diagnosticsText.includes("KAMAY_TOKEN"), false);
  assert.equal(diagnosticsText.includes("kmy_cap="), false);
});

test("runLab qa records redaction failure when generated artifact contains a forbidden marker", () => {
  const cwd = mkdtempSync(join(tmpdir(), "kamay-lab-"));
  const out = join(cwd, "tmp/agent-lab/qa");
  const result = runLab({
    mode: "qa",
    out,
    cwd,
    now: new Date("2026-05-27T00:00:00.000Z"),
    runCommand: makeRunner(cwd, { qaStdout: "leaked kmy_sig=value" })
  });

  assert.equal(result.summary.status, "FAIL");
  assert.equal(result.summary.redaction.safe, false);
  assert.equal(result.summary.redaction.forbiddenMarkersFound[0].artifact, "qa.log");
  assert.equal(result.summary.redaction.forbiddenMarkersFound[0].marker, "SIGNATURE_URL_PARAM");
});

function makeRunner(cwd, options = {}) {
  return (command, args) => {
    if (command === "node" && args[0] === "scripts/diagnostics.js") {
      const outIndex = args.indexOf("--out");
      writeFileSync(args[outIndex + 1], JSON.stringify(makeDiagnostics()), "utf8");
      return { status: 0, stdout: "", stderr: "" };
    }
    const stdout = args.includes("scripts/lab.test.js") ? options.qaStdout ?? "" : "";
    return { status: 0, stdout, stderr: "" };
  };
}

function makeDiagnostics(overrides = {}) {
  return {
    schemaVersion: 1,
    generatedAt: "2026-05-27T00:00:00.000Z",
    tool: {
      name: "kamay-adapter-diagnostics",
      version: "0.1.0"
    },
    status: "PASS",
    environment: {
      baseUrl: "https://adapter.example.test",
      envPresence: {
        KAMAY_TOKEN: true,
        KAMAY_SIGNING_SECRET: true,
        KAMAY_ADAPTER_BASE_URL: true
      }
    },
    checks: [makeCheck()],
    deployment: {
      available: false,
      worker: "kamay-adapter",
      deploymentId: null,
      versionId: null,
      message: null,
      source: null
    },
    compatibility: {
      chatgptWeb: "verified",
      localPowerShell: "verified",
      claudeWeb: "blocked_by_provider_egress_policy",
      claudeLocal: "recommended"
    },
    redaction: {
      secretsIncluded: false,
      fullBearerUrlsIncluded: false,
      signaturesIncluded: false
    },
    ...overrides
  };
}

function makeCheck() {
  return {
    name: "headerCapabilities",
    status: "PASS",
    httpStatus: 200,
    errorCode: null,
    requestIdLooksValid: true,
    provider: "repository",
    backend: "github",
    classification: "auth",
    rateLimitShape: null,
    urlMetadata: null
  };
}
