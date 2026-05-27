import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  buildEvidenceManifest,
  evidenceLooksSafe,
  main
} from "./evidence.js";

test("buildEvidenceManifest creates portable evidence from diagnostics", () => {
  const manifest = buildEvidenceManifest(makeDiagnostics(), {
    taskId: "KAMAY-ADAPTER-EVIDENCE-001",
    label: "local smoke",
    now: new Date("2026-05-27T00:00:00.000Z")
  });

  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.kind, "kamay-adapter-evidence-context");
  assert.equal(manifest.task.id, "KAMAY-ADAPTER-EVIDENCE-001");
  assert.equal(manifest.source.tool, "kamay-adapter-diagnostics");
  assert.equal(manifest.evidence.status, "PASS");
  assert.equal(manifest.environment.baseUrl, "https://adapter.example.test");
  assert.equal(manifest.environment.provider, "repository");
  assert.equal(manifest.environment.backend, "github");
  assert.equal(manifest.evidence.checks[0].urlMetadata.urlLength, 214);
  assert.equal(manifest.redaction.secretsIncluded, false);
  assert.equal(JSON.stringify(manifest).includes("KAMAY_TOKEN"), false);
});

test("evidence output keeps status classes from diagnostics", () => {
  const diagnostics = makeDiagnostics({
    status: "WARN",
    checks: [
      { ...makeCheck(), status: "PASS" },
      { ...makeCheck(), name: "cloudflareDeploymentVisibility", status: "WARN", classification: "deployment" }
    ]
  });
  const manifest = buildEvidenceManifest(diagnostics);

  assert.equal(manifest.evidence.status, "WARN");
  assert.equal(manifest.evidence.checks[1].status, "WARN");
  assert.equal(manifest.evidence.checks[1].classification, "deployment");
});

test("redaction rejects bearer URLs, signature params, and secret markers", () => {
  assert.equal(evidenceLooksSafe({ url: "https://example.test/file?kmy_cap=abc.def" }), false);
  assert.equal(evidenceLooksSafe({ url: "https://example.test/file?kmy_sig=abc" }), false);
  assert.equal(evidenceLooksSafe({ note: ".env.local contents" }), false);
  assert.equal(evidenceLooksSafe({ note: "KAMAY_SIGNING_SECRET" }), false);
});

test("diagnostics env presence keys are accepted as input but removed from output", () => {
  const diagnostics = makeDiagnostics();
  assert.equal(evidenceLooksSafe(diagnostics, { allowDiagnosticsEnvPresence: true }), true);

  const manifest = buildEvidenceManifest(diagnostics);
  assert.equal(JSON.stringify(manifest).includes("KAMAY_TOKEN"), false);
  assert.equal(JSON.stringify(manifest).includes("KAMAY_SIGNING_SECRET"), false);
});

test("builder rejects diagnostics containing forbidden markers outside env presence", () => {
  const diagnostics = makeDiagnostics({
    checks: [{ ...makeCheck(), errorCode: "kmy_cap=abc.def" }]
  });

  assert.throws(
    () => buildEvidenceManifest(diagnostics),
    /forbidden secret or bearer URL markers/
  );
});

test("builder rejects malformed diagnostics", () => {
  assert.throws(
    () => buildEvidenceManifest({ schemaVersion: 1, status: "PASS", checks: [] }),
    /Unsupported diagnostics export/
  );
  assert.throws(
    () => buildEvidenceManifest(makeDiagnostics({ status: "MAYBE" })),
    /invalid status/
  );
});

test("main writes only with explicit output path", () => {
  const dir = mkdtempSync(join(tmpdir(), "kamay-evidence-"));
  const diagnosticsPath = join(dir, "diagnostics.json");
  const evidencePath = join(dir, "evidence.json");
  writeFileSync(diagnosticsPath, JSON.stringify(makeDiagnostics()), "utf8");

  const missingOut = main(["build", "--diagnostics", diagnosticsPath], {
    now: new Date("2026-05-27T00:00:00.000Z")
  });
  assert.equal(missingOut, 1);

  const exitCode = main([
    "build",
    "--diagnostics",
    diagnosticsPath,
    "--out",
    evidencePath,
    "--task-id",
    "TASK-1"
  ], {
    now: new Date("2026-05-27T00:00:00.000Z")
  });
  assert.equal(exitCode, 0);

  const written = JSON.parse(readFileSync(evidencePath, "utf8"));
  assert.equal(written.task.id, "TASK-1");
  assert.equal(evidenceLooksSafe(written), true);
});

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
      available: true,
      worker: "kamay-adapter",
      deploymentId: "deployment-id",
      versionId: "version-id",
      message: "deployed",
      source: "wrangler-read-only"
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
    rateLimitShape: {
      source: "github",
      remainingType: "number",
      limitType: "number",
      resetAtType: "string"
    },
    urlMetadata: {
      route: "/v1/repo/file",
      format: "compact-v2",
      ttlSeconds: 300,
      urlLength: 214
    }
  };
}
