#!/usr/bin/env node

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { signUrl } from "../core/services/signed-url.js";

const execFileAsync = promisify(execFile);
const DEFAULT_BASE_URL = "https://kamay-adapter.epix.workers.dev";
const TOOL_VERSION = "0.1.0";

if (isMain()) {
  const exitCode = await main(process.argv.slice(2));
  process.exit(exitCode);
}

export async function main(args, options = {}) {
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

  loadLocalEnv(options.cwd ?? process.cwd());
  const report = await buildDiagnosticsReport({
    baseUrl: parsed.baseUrl,
    includeCloudflare: parsed.includeCloudflare,
    cwd: options.cwd ?? process.cwd(),
    env: options.env ?? process.env,
    fetchImpl: options.fetchImpl ?? globalThis.fetch,
    now: options.now ?? new Date()
  });

  if (parsed.command === "export") {
    if (!parsed.out) {
      console.error("export requires --out <path>");
      return 1;
    }
    writeJsonFile(parsed.out, report);
  }

  if (parsed.json || parsed.command === "export") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatSummary(report));
  }
  return report.status === "FAIL" || report.status === "BLOCKED" ? 1 : 0;
}

export async function buildDiagnosticsReport(options = {}) {
  const env = options.env ?? process.env;
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? env.KAMAY_ADAPTER_BASE_URL ?? DEFAULT_BASE_URL);
  const now = options.now ?? new Date();
  const envPresence = {
    KAMAY_TOKEN: Boolean(env.KAMAY_TOKEN),
    KAMAY_SIGNING_SECRET: Boolean(env.KAMAY_SIGNING_SECRET),
    KAMAY_ADAPTER_BASE_URL: Boolean(env.KAMAY_ADAPTER_BASE_URL)
  };

  const checks = [];
  if (!envPresence.KAMAY_TOKEN || !envPresence.KAMAY_SIGNING_SECRET) {
    return finalizeReport({
      generatedAt: now.toISOString(),
      baseUrl,
      envPresence,
      checks: [{
        name: "localConfig",
        status: "BLOCKED",
        httpStatus: null,
        errorCode: "MISSING_LOCAL_SECRET",
        requestIdLooksValid: false,
        provider: null,
        backend: null,
        rateLimitShape: null,
        classification: "local_config"
      }],
      deployment: nullDeployment(),
      includeCloudflare: false
    });
  }

  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  await runJsonCheck(checks, "unauthenticatedCapabilities", "reachability", `${baseUrl}/v1/repo/capabilities`, {
    fetchImpl,
    expect: ({ status, body }) => status === 401 && body?.error?.code === "UNAUTHORIZED"
  });
  await runJsonCheck(checks, "headerCapabilities", "auth", `${baseUrl}/v1/repo/capabilities`, {
    fetchImpl,
    token: env.KAMAY_TOKEN,
    expect: ({ status, body }) => status === 200
      && body?.data?.provider === "repository"
      && body?.data?.backend === "github"
      && metaLooksComplete(body?.meta)
  });

  const signedReadme = await safeSign({
    input: `${baseUrl}/v1/repo/file?path=README.md&ref=main`,
    signingSecret: env.KAMAY_SIGNING_SECRET,
    capability: { operation: "getFile", pathPrefix: "README.md", ref: "main" }
  });
  checks.push(signedReadme.check);
  if (signedReadme.url) {
    await runJsonCheck(checks, "compactV2Readme", "capability", signedReadme.url, {
      fetchImpl,
      expect: ({ status, body }) => status === 200
        && body?.data?.path === "README.md"
        && metaLooksComplete(body?.meta),
      urlMetadata: signedReadme.metadata
    });
  }

  const signedPost = await safeSign({
    input: `${baseUrl}/v1/repo/files?paths=README.md&ref=main`,
    signingSecret: env.KAMAY_SIGNING_SECRET,
    capability: { operation: "getFiles", pathPrefix: "README.md", ref: "main" }
  });
  checks.push(signedPost.check);
  if (signedPost.url) {
    await runJsonCheck(checks, "signedPostRejected", "capability", signedPost.url, {
      fetchImpl,
      method: "POST",
      body: JSON.stringify({ paths: ["README.md"], ref: "main" }),
      expect: ({ status, body }) => status === 401 && body?.error?.code === "UNAUTHORIZED",
      urlMetadata: signedPost.metadata
    });
  }

  await runJsonCheck(checks, "headerCommits", "backend", `${baseUrl}/v1/repo/commits?ref=main&n=3`, {
    fetchImpl,
    token: env.KAMAY_TOKEN,
    expect: ({ status, body }) => status === 200
      && Array.isArray(body?.data?.commits)
      && metaLooksComplete(body?.meta)
  });
  await runJsonCheck(checks, "headerTree", "backend", `${baseUrl}/v1/repo/tree?ref=main&path=docs`, {
    fetchImpl,
    token: env.KAMAY_TOKEN,
    expect: ({ status, body }) => status === 200
      && Array.isArray(body?.data?.files)
      && metaLooksComplete(body?.meta)
  });

  const deployment = options.includeCloudflare
    ? await readCloudflareDeployment(options.cwd ?? process.cwd())
    : nullDeployment();
  if (options.includeCloudflare) {
    checks.push({
      name: "cloudflareDeploymentVisibility",
      status: deployment.available ? "PASS" : "WARN",
      httpStatus: null,
      errorCode: deployment.available ? null : "DEPLOYMENT_METADATA_UNAVAILABLE",
      requestIdLooksValid: false,
      provider: null,
      backend: null,
      rateLimitShape: null,
      classification: "deployment"
    });
  }

  return finalizeReport({
    generatedAt: now.toISOString(),
    baseUrl,
    envPresence,
    checks,
    deployment,
    includeCloudflare: Boolean(options.includeCloudflare)
  });
}

export function aggregateStatus(checks) {
  if (checks.some((check) => check.status === "BLOCKED")) {
    return "BLOCKED";
  }
  if (checks.some((check) => check.status === "FAIL")) {
    return "FAIL";
  }
  if (checks.some((check) => check.status === "WARN")) {
    return "WARN";
  }
  return "PASS";
}

export function redactForExport(value) {
  const text = JSON.stringify(value);
  return !text.includes("kmy_sig=")
    && !text.includes("kmy_cap=")
    && !text.includes(".env.local");
}

async function runJsonCheck(checks, name, classification, url, options) {
  try {
    const response = await options.fetchImpl(url, {
      method: options.method ?? "GET",
      headers: requestHeaders(options),
      body: options.body
    });
    const body = await readJson(response);
    const pass = options.expect({ status: response.status, body });
    checks.push({
      name,
      status: pass ? "PASS" : "FAIL",
      httpStatus: response.status,
      errorCode: body?.error?.code ?? null,
      requestIdLooksValid: requestIdLooksValid(body?.meta?.requestId),
      provider: body?.meta?.provider ?? null,
      backend: body?.meta?.backend ?? null,
      rateLimitShape: summarizeRateLimit(body?.meta?.rateLimit),
      classification,
      urlMetadata: options.urlMetadata ?? null
    });
  } catch (error) {
    checks.push({
      name,
      status: "FAIL",
      httpStatus: null,
      errorCode: error instanceof Error ? error.constructor.name : "UNKNOWN_ERROR",
      requestIdLooksValid: false,
      provider: null,
      backend: null,
      rateLimitShape: null,
      classification
    });
  }
}

async function safeSign(options) {
  try {
    const url = await signUrl(options.input, options.signingSecret, {
      compact: true,
      ttlSeconds: 300,
      capability: options.capability
    });
    return {
      url,
      metadata: {
        route: new URL(options.input).pathname,
        format: "compact-v2",
        ttlSeconds: 300,
        urlLength: url.length
      },
      check: {
        name: `mint:${options.capability.operation}`,
        status: "PASS",
        httpStatus: null,
        errorCode: null,
        requestIdLooksValid: false,
        provider: null,
        backend: null,
        rateLimitShape: null,
        classification: "capability"
      }
    };
  } catch (error) {
    return {
      url: null,
      metadata: null,
      check: {
        name: `mint:${options.capability.operation}`,
        status: "FAIL",
        httpStatus: null,
        errorCode: error instanceof Error ? error.constructor.name : "SIGNING_FAILED",
        requestIdLooksValid: false,
        provider: null,
        backend: null,
        rateLimitShape: null,
        classification: "capability"
      }
    };
  }
}

function finalizeReport(input) {
  const status = aggregateStatus(input.checks);
  return {
    schemaVersion: 1,
    generatedAt: input.generatedAt,
    tool: {
      name: "kamay-adapter-diagnostics",
      version: TOOL_VERSION
    },
    status,
    environment: {
      baseUrl: input.baseUrl,
      nodeVersion: process.version,
      platform: process.platform,
      envPresence: input.envPresence
    },
    checks: input.checks,
    deployment: input.deployment,
    compatibility: {
      chatgptWeb: "verified",
      localPowerShell: "verified",
      claudeWeb: "blocked_by_provider_egress_policy",
      claudeLocal: "recommended"
    },
    rollback: {
      needed: status === "FAIL",
      recommendedAction: status === "FAIL" ? "Review failed checks before considering rollback." : null,
      lastKnownTargetVersionId: input.deployment?.versionId ?? null
    },
    redaction: {
      secretsIncluded: false,
      fullBearerUrlsIncluded: false,
      signaturesIncluded: false
    }
  };
}

async function readCloudflareDeployment(cwd) {
  try {
    const workerDir = resolve(cwd, "deployments/cloudflare-worker");
    const { stdout } = await execFileAsync(
      "npx",
      ["wrangler", "deployments", "status", "--json"],
      { cwd: workerDir, timeout: 15000, windowsHide: true }
    );
    const parsed = JSON.parse(stdout);
    return {
      available: true,
      worker: "kamay-adapter",
      deploymentId: parsed.id ?? null,
      versionId: parsed.versions?.[0]?.version_id ?? null,
      message: parsed.annotations?.["workers/message"] ?? null,
      source: "wrangler-read-only"
    };
  } catch {
    return {
      available: false,
      worker: "kamay-adapter",
      deploymentId: null,
      versionId: null,
      message: null,
      source: "wrangler-read-only"
    };
  }
}

function requestHeaders(options) {
  const headers = {};
  if (options.token) {
    headers["X-Kamay-Token"] = options.token;
  }
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

async function readJson(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function metaLooksComplete(meta) {
  return Boolean(meta)
    && requestIdLooksValid(meta.requestId)
    && typeof meta.apiVersion === "string"
    && typeof meta.timestamp === "string";
}

function requestIdLooksValid(value) {
  return typeof value === "string" && /^kmy_[a-z0-9]+_[a-f0-9]{8}$/i.test(value);
}

function summarizeRateLimit(rateLimit) {
  if (rateLimit === null || rateLimit === undefined) {
    return null;
  }
  return {
    source: rateLimit.source ?? null,
    remainingType: typeof rateLimit.remaining,
    limitType: typeof rateLimit.limit,
    resetAtType: typeof rateLimit.resetAt
  };
}

function nullDeployment() {
  return {
    available: false,
    worker: "kamay-adapter",
    deploymentId: null,
    versionId: null,
    message: null,
    source: null
  };
}

function parseArgs(args) {
  const command = args[0];
  if (!command || command === "--help" || command === "-h") {
    return { ok: true, help: true };
  }
  if (!["status", "export"].includes(command)) {
    return { ok: false, error: `Unknown command: ${command}` };
  }
  return {
    ok: true,
    command,
    json: args.includes("--json"),
    includeCloudflare: args.includes("--include-cloudflare"),
    baseUrl: readOption(args, "--base-url"),
    out: readOption(args, "--out")
  };
}

function readOption(values, name) {
  const index = values.indexOf(name);
  return index === -1 ? null : values[index + 1] ?? null;
}

function formatSummary(report) {
  const failed = report.checks.filter((check) => check.status === "FAIL").length;
  const warned = report.checks.filter((check) => check.status === "WARN").length;
  const blocked = report.checks.filter((check) => check.status === "BLOCKED").length;
  return [
    `status: ${report.status}`,
    `baseUrl: ${report.environment.baseUrl}`,
    `generatedAt: ${report.generatedAt}`,
    `checks: ${report.checks.length} total, ${failed} fail, ${warned} warn, ${blocked} blocked`,
    "redaction: secrets=false fullBearerUrls=false signatures=false"
  ].join("\n");
}

function writeJsonFile(path, report) {
  if (!redactForExport(report)) {
    throw new Error("Refusing to write diagnostics export because redaction checks failed");
  }
  const target = resolve(path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function normalizeBaseUrl(value) {
  return String(value).replace(/\/+$/, "");
}

function printUsage() {
  console.error("Usage: node scripts/diagnostics.js <status|export> [--json] [--base-url URL] [--include-cloudflare] [--out PATH]");
}

function loadLocalEnv(cwd) {
  const path = resolve(cwd, ".env.local");
  if (!existsSync(path)) {
    return;
  }
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = unquote(trimmed.slice(equalsIndex + 1).trim());
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function isMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
}
