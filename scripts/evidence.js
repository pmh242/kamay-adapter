#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TOOL_VERSION = "0.1.0";
const KIND = "kamay-adapter-evidence-context";
const FORBIDDEN_MARKERS = Object.freeze([
  "kmy_cap=",
  "kmy_sig=",
  ".env.local",
  "KAMAY_TOKEN",
  "KAMAY_SIGNING_SECRET",
  "GITHUB_TOKEN"
]);

if (isMain()) {
  const exitCode = main(process.argv.slice(2));
  process.exit(exitCode);
}

export function main(args, options = {}) {
  const parsed = parseArgs(args);
  if (!parsed.ok) {
    console.error(parsed.error);
    printUsage();
    return 1;
  }
  if (parsed.help) {
    printUsage();
    return 0;
  }

  try {
    const diagnostics = readDiagnostics(parsed.diagnostics, options);
    const manifest = buildEvidenceManifest(diagnostics, {
      taskId: parsed.taskId,
      label: parsed.label,
      now: options.now ?? new Date()
    });

    if (!parsed.out) {
      throw new Error("build requires --out <path>");
    }
    writeEvidenceFile(parsed.out, manifest);

    if (parsed.json) {
      console.log(JSON.stringify(manifest, null, 2));
    } else {
      console.log(formatSummary(manifest, parsed.out));
    }
    return manifest.evidence.status === "FAIL" || manifest.evidence.status === "BLOCKED" ? 1 : 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Failed to build evidence manifest");
    return 1;
  }
}

export function buildEvidenceManifest(diagnostics, options = {}) {
  assertSafeDiagnosticsInput(diagnostics);
  assertDiagnosticsShape(diagnostics);

  const checks = summarizeChecks(diagnostics.checks);
  const manifest = {
    schemaVersion: 1,
    kind: KIND,
    generatedAt: (options.now ?? new Date()).toISOString(),
    task: {
      id: options.taskId ?? null,
      label: options.label ?? null
    },
    source: {
      type: "diagnostics-export",
      tool: diagnostics.tool?.name ?? null,
      diagnosticsGeneratedAt: diagnostics.generatedAt ?? null,
      diagnosticsStatus: diagnostics.status ?? null
    },
    environment: {
      baseUrl: diagnostics.environment?.baseUrl ?? null,
      provider: firstNonNull(checks.map((check) => check.provider)),
      backend: firstNonNull(checks.map((check) => check.backend))
    },
    evidence: {
      status: diagnostics.status,
      checks,
      compatibility: diagnostics.compatibility ?? {},
      deployment: summarizeDeployment(diagnostics.deployment)
    },
    redaction: {
      secretsIncluded: false,
      fullBearerUrlsIncluded: false,
      signaturesIncluded: false
    }
  };

  assertSafeEvidenceOutput(manifest);
  return manifest;
}

export function evidenceLooksSafe(value, options = {}) {
  let text = JSON.stringify(value);
  if (options.allowDiagnosticsEnvPresence === true) {
    text = text
      .replaceAll('"KAMAY_TOKEN":true', "")
      .replaceAll('"KAMAY_TOKEN":false', "")
      .replaceAll('"KAMAY_SIGNING_SECRET":true', "")
      .replaceAll('"KAMAY_SIGNING_SECRET":false', "");
  }
  return FORBIDDEN_MARKERS.every((marker) => !text.includes(marker));
}

export function summarizeChecks(checks) {
  if (!Array.isArray(checks)) {
    return [];
  }
  return checks.map((check) => ({
    name: check.name ?? null,
    status: check.status ?? null,
    httpStatus: check.httpStatus ?? null,
    errorCode: check.errorCode ?? null,
    requestIdLooksValid: Boolean(check.requestIdLooksValid),
    provider: check.provider ?? null,
    backend: check.backend ?? null,
    classification: check.classification ?? null,
    rateLimitShape: check.rateLimitShape ?? null,
    urlMetadata: summarizeUrlMetadata(check.urlMetadata)
  }));
}

function summarizeUrlMetadata(metadata) {
  if (!metadata) {
    return null;
  }
  return {
    route: metadata.route ?? null,
    format: metadata.format ?? null,
    ttlSeconds: metadata.ttlSeconds ?? null,
    urlLength: metadata.urlLength ?? null
  };
}

function summarizeDeployment(deployment) {
  if (!deployment) {
    return {};
  }
  return {
    available: Boolean(deployment.available),
    worker: deployment.worker ?? null,
    deploymentId: deployment.deploymentId ?? null,
    versionId: deployment.versionId ?? null,
    message: deployment.message ?? null,
    source: deployment.source ?? null
  };
}

function assertDiagnosticsShape(diagnostics) {
  if (!diagnostics || typeof diagnostics !== "object" || Array.isArray(diagnostics)) {
    throw new Error("Diagnostics export must be a JSON object");
  }
  if (diagnostics.schemaVersion !== 1 || diagnostics.tool?.name !== "kamay-adapter-diagnostics") {
    throw new Error("Unsupported diagnostics export");
  }
  if (!["PASS", "WARN", "FAIL", "BLOCKED"].includes(diagnostics.status)) {
    throw new Error("Diagnostics export has an invalid status");
  }
  if (!Array.isArray(diagnostics.checks)) {
    throw new Error("Diagnostics export must contain checks");
  }
}

function assertSafeDiagnosticsInput(diagnostics) {
  if (!evidenceLooksSafe(diagnostics, { allowDiagnosticsEnvPresence: true })) {
    throw new Error("Refusing to build evidence from diagnostics containing forbidden secret or bearer URL markers");
  }
}

function assertSafeEvidenceOutput(manifest) {
  if (!evidenceLooksSafe(manifest)) {
    throw new Error("Refusing to write evidence manifest containing forbidden secret or bearer URL markers");
  }
}

function readDiagnostics(path, options) {
  if (!path) {
    throw new Error("build requires --diagnostics <path>");
  }
  const target = resolve(options.cwd ?? process.cwd(), path);
  if (!existsSync(target)) {
    throw new Error(`Diagnostics export not found: ${path}`);
  }
  return JSON.parse(readFileSync(target, "utf8"));
}

function writeEvidenceFile(path, manifest) {
  assertSafeEvidenceOutput(manifest);
  const target = resolve(path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function firstNonNull(values) {
  return values.find((value) => value !== null && value !== undefined) ?? null;
}

function parseArgs(args) {
  const command = args[0];
  if (!command || command === "--help" || command === "-h") {
    return { ok: true, help: true };
  }
  if (command !== "build") {
    return { ok: false, error: `Unknown command: ${command}` };
  }
  return {
    ok: true,
    command,
    diagnostics: readOption(args, "--diagnostics"),
    out: readOption(args, "--out"),
    taskId: readOption(args, "--task-id"),
    label: readOption(args, "--label"),
    json: args.includes("--json")
  };
}

function readOption(values, name) {
  const index = values.indexOf(name);
  return index === -1 ? null : values[index + 1] ?? null;
}

function formatSummary(manifest, outPath) {
  const failed = manifest.evidence.checks.filter((check) => check.status === "FAIL").length;
  const warned = manifest.evidence.checks.filter((check) => check.status === "WARN").length;
  const blocked = manifest.evidence.checks.filter((check) => check.status === "BLOCKED").length;
  return [
    `status: ${manifest.evidence.status}`,
    `out: ${outPath}`,
    `generatedAt: ${manifest.generatedAt}`,
    `checks: ${manifest.evidence.checks.length} total, ${failed} fail, ${warned} warn, ${blocked} blocked`,
    "redaction: secrets=false fullBearerUrls=false signatures=false"
  ].join("\n");
}

function printUsage() {
  console.error("Usage: node scripts/evidence.js build --diagnostics <path> --out <path> [--task-id id] [--label text] [--json]");
}

function isMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
}
