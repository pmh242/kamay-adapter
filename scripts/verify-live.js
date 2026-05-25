#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { signUrl } from "../core/services/signed-url.js";

const DEFAULT_BASE_URL = "https://kamay-adapter.epix.workers.dev";

loadLocalEnv();

const envPresence = {
  KAMAY_TOKEN: Boolean(process.env.KAMAY_TOKEN),
  KAMAY_SIGNING_SECRET: Boolean(process.env.KAMAY_SIGNING_SECRET),
  KAMAY_ADAPTER_BASE_URL: Boolean(process.env.KAMAY_ADAPTER_BASE_URL)
};

if (!envPresence.KAMAY_TOKEN || !envPresence.KAMAY_SIGNING_SECRET) {
  printResult({
    status: "BLOCKED",
    reason: "Missing required local verification secrets",
    env: envPresence,
    checks: []
  });
  process.exit(1);
}

const baseUrl = normalizeBaseUrl(process.env.KAMAY_ADAPTER_BASE_URL ?? DEFAULT_BASE_URL);
const checks = [];

await runCheck("optionsCapabilities", checks, async () => {
  const response = await fetch(`${baseUrl}/v1/repo/capabilities`, { method: "OPTIONS" });
  return {
    pass: response.status === 204
      && includesHeaderValue(response.headers.get("access-control-allow-methods"), "GET")
      && includesHeaderValue(response.headers.get("access-control-allow-methods"), "POST")
      && includesHeaderValue(response.headers.get("access-control-allow-methods"), "OPTIONS")
      && includesHeaderValue(response.headers.get("access-control-allow-headers"), "X-Kamay-Token")
      && response.headers.get("access-control-allow-origin") === null,
    response: {
      status: response.status,
      allowMethods: response.headers.get("access-control-allow-methods"),
      allowHeaders: response.headers.get("access-control-allow-headers"),
      allowOriginPresent: response.headers.has("access-control-allow-origin")
    }
  };
});

await runJsonCheck("unauthenticatedHealth", checks, `${baseUrl}/health`, {
  expect: ({ status, body }) => status === 401 && body?.error?.code === "UNAUTHORIZED"
});

await runJsonCheck("headerHealth", checks, `${baseUrl}/health`, {
  token: process.env.KAMAY_TOKEN,
  expect: ({ status, body }) => status === 200 && body?.data?.status === "ok"
});

await runJsonCheck("headerCapabilities", checks, `${baseUrl}/v1/repo/capabilities`, {
  token: process.env.KAMAY_TOKEN,
  expect: ({ status, body }) => status === 200 && Boolean(body?.data?.operations?.getFile)
});

const signedFileUrl = await signUrl(`${baseUrl}/v1/repo/file?path=README.md&ref=main`, process.env.KAMAY_SIGNING_SECRET, {
  ttlSeconds: 300,
  capability: {
    operation: "getFile",
    pathPrefix: "README.md",
    ref: "main",
    label: "verify-readme"
  }
});
await runJsonCheck("signedFileGet", checks, signedFileUrl, {
  expect: ({ status, body }) => status === 200 && body?.data?.path === "README.md"
});

const signedFilesUrl = await signUrl(`${baseUrl}/v1/repo/files?paths=README.md&ref=main`, process.env.KAMAY_SIGNING_SECRET, {
  ttlSeconds: 300,
  capability: {
    operation: "getFiles",
    pathPrefix: "README.md",
    ref: "main",
    label: "verify-post-reject"
  }
});
await runJsonCheck("signedFilesPostRejected", checks, signedFilesUrl, {
  method: "POST",
  body: JSON.stringify({ paths: ["README.md"], ref: "main" }),
  expect: ({ status, body }) => status === 401 && body?.error?.code === "UNAUTHORIZED"
});

await runJsonCheck("headerCommits", checks, `${baseUrl}/v1/repo/commits?ref=main&n=3`, {
  token: process.env.KAMAY_TOKEN,
  expect: ({ status, body }) => status === 200 && Array.isArray(body?.data?.commits)
});

await runJsonCheck("headerTree", checks, `${baseUrl}/v1/repo/tree?ref=main&path=docs`, {
  token: process.env.KAMAY_TOKEN,
  expect: ({ status, body }) => status === 200 && Array.isArray(body?.data?.files)
});

const failed = checks.filter((check) => !check.pass);
printResult({
  status: failed.length === 0 ? "PASS" : "FAIL",
  baseUrl,
  env: envPresence,
  checks
});

process.exit(failed.length === 0 ? 0 : 1);

async function runJsonCheck(name, checks, url, options = {}) {
  await runCheck(name, checks, async () => {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: requestHeaders(options),
      body: options.body
    });
    const body = await readJson(response);
    const summary = summarizeJsonResponse(response.status, body);
    return {
      pass: options.expect({ status: response.status, body }),
      response: summary
    };
  });
}

async function runCheck(name, checks, fn) {
  try {
    const result = await fn();
    checks.push({
      name,
      pass: Boolean(result.pass),
      response: result.response
    });
  } catch (error) {
    checks.push({
      name,
      pass: false,
      error: error instanceof Error ? error.constructor.name : "Unknown verification error"
    });
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

function summarizeJsonResponse(status, body) {
  const data = body?.data;
  return {
    status,
    code: body?.error?.code ?? null,
    hasData: Boolean(data),
    hasError: Boolean(body?.error),
    envelope: {
      hasMeta: Boolean(body?.meta),
      requestIdLooksValid: typeof body?.meta?.requestId === "string" && body.meta.requestId.startsWith("kmy_"),
      apiVersion: body?.meta?.apiVersion ?? null,
      provider: body?.meta?.provider ?? null,
      backend: body?.meta?.backend ?? null,
      rateLimit: summarizeRateLimit(body?.meta?.rateLimit)
    },
    data: summarizeData(data)
  };
}

function summarizeData(data) {
  if (!data || typeof data !== "object") {
    return null;
  }
  return {
    status: data.status ?? null,
    path: data.path ?? null,
    ref: data.ref ?? null,
    count: typeof data.count === "number" ? data.count : null,
    fileCount: Array.isArray(data.files) ? data.files.length : null,
    commitCount: Array.isArray(data.commits) ? data.commits.length : null,
    operationCount: data.operations && typeof data.operations === "object"
      ? Object.keys(data.operations).length
      : null,
    truncated: typeof data.truncated === "boolean" ? data.truncated : null
  };
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

function includesHeaderValue(value, expected) {
  return typeof value === "string"
    && value.split(",").map((part) => part.trim().toUpperCase()).includes(expected.toUpperCase());
}

function normalizeBaseUrl(value) {
  return value.replace(/\/+$/, "");
}

function printResult(result) {
  console.log(JSON.stringify(result, null, 2));
}

function loadLocalEnv() {
  const path = resolve(process.cwd(), ".env.local");
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
