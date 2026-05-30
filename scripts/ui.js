#!/usr/bin/env node

import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, isAbsolute, join, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const CONFIG_FILE = ".kamay-adapter.local.json";
const DEFAULT_CONFIG = Object.freeze({
  baseUrl: "https://kamay-adapter.epix.workers.dev",
  repoSlug: "pmh242/kamay",
  diagnosticsPath: "tmp/diagnostics/latest.json",
  evidencePath: "tmp/evidence/latest.json",
  labPath: "tmp/agent-lab"
});
const ALLOWED_FIELDS = Object.freeze(Object.keys(DEFAULT_CONFIG));
const FORBIDDEN_MARKERS = Object.freeze([
  "KAMAY_TOKEN",
  "KAMAY_SIGNING_SECRET",
  "GITHUB_TOKEN",
  "kmy_cap=",
  "kmy_sig=",
  ".env.local"
]);
const CONTENT_TYPES = Object.freeze({
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
});

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

  try {
    if (parsed.check) {
      const state = buildUiState(options.cwd ?? process.cwd());
      console.log(JSON.stringify({
        ok: true,
        configPath: state.config.path,
        artifacts: state.artifacts
      }, null, 2));
      return 0;
    }

    const server = await startUiServer({
      cwd: options.cwd ?? process.cwd(),
      port: parsed.port ?? 0,
      openBrowser: !parsed.noOpen,
      opener: options.opener ?? openBrowser
    });
    console.log(`Kamay Adapter UI: ${server.url}`);
    console.log("Press Ctrl+C to stop.");
    return await waitForShutdown();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Failed to start UI");
    return 1;
  }
}

export async function startUiServer(options = {}) {
  const cwd = options.cwd ?? process.cwd();
  const staticDir = resolve(cwd, "ui");
  const server = createServer((request, response) => {
    handleRequest({ request, response, cwd, staticDir });
  });
  const host = "127.0.0.1";
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(options.port ?? 0, host, resolveListen);
  });
  const address = server.address();
  const url = `http://${host}:${address.port}/`;
  if (options.openBrowser) {
    options.opener(url);
  }
  return {
    url,
    close: () => new Promise((resolveClose) => server.close(resolveClose))
  };
}

export function buildUiState(cwd = process.cwd()) {
  const config = loadConfig(cwd);
  return {
    project: {
      name: "kamay-adapter",
      repoRoot: resolve(cwd),
      nodeVersion: process.version,
      platform: process.platform
    },
    config: {
      path: resolve(cwd, CONFIG_FILE),
      exists: config.exists,
      values: config.values
    },
    artifacts: {
      diagnostics: readArtifact(cwd, config.values.diagnosticsPath, "diagnostics"),
      evidence: readArtifact(cwd, config.values.evidencePath, "evidence"),
      lab: readLatestLabArtifact(cwd, config.values.labPath)
    },
    commands: {
      diagnostics: "node scripts/diagnostics.js export --out tmp/diagnostics/latest.json",
      evidence: "node scripts/evidence.js build --diagnostics tmp/diagnostics/latest.json --out tmp/evidence/latest.json",
      lab: "npm run lab"
    },
    boundaries: {
      storesSecrets: false,
      readsEnvLocal: false,
      executesCommands: false,
      mintsTokens: false,
      mutatesCloudflare: false
    }
  };
}

export function loadConfig(cwd = process.cwd()) {
  const path = resolve(cwd, CONFIG_FILE);
  if (!existsSync(path)) {
    return {
      exists: false,
      values: { ...DEFAULT_CONFIG }
    };
  }
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return {
    exists: true,
    values: validateConfig({ ...DEFAULT_CONFIG, ...parsed })
  };
}

export function saveConfig(cwd = process.cwd(), input) {
  const values = validateConfig({ ...DEFAULT_CONFIG, ...input });
  const path = resolve(cwd, CONFIG_FILE);
  writeFileSync(path, `${JSON.stringify(values, null, 2)}\n`, "utf8");
  return {
    path,
    values
  };
}

export function validateConfig(input) {
  const values = {};
  for (const field of ALLOWED_FIELDS) {
    const value = input[field] ?? DEFAULT_CONFIG[field];
    if (typeof value !== "string") {
      throw new Error(`Invalid config field: ${field}`);
    }
    const trimmed = value.trim();
    if (!trimmed) {
      throw new Error(`Config field cannot be empty: ${field}`);
    }
    if (!valueLooksSafe(trimmed)) {
      throw new Error(`Config field contains forbidden secret or bearer marker: ${field}`);
    }
    values[field] = trimmed;
  }
  return values;
}

export function valueLooksSafe(value) {
  if (FORBIDDEN_MARKERS.some((marker) => value.includes(marker))) {
    return false;
  }
  if (/https?:\/\/\S+(?:kmy_cap|kmy_sig)=/i.test(value)) {
    return false;
  }
  return true;
}

function handleRequest(context) {
  const method = context.request.method ?? "GET";
  const url = new URL(context.request.url, "http://127.0.0.1");
  if (method === "GET" && url.pathname === "/api/state") {
    return writeJson(context.response, 200, buildUiState(context.cwd));
  }
  if (method === "POST" && url.pathname === "/api/config") {
    return readBody(context.request)
      .then((body) => {
        const saved = saveConfig(context.cwd, JSON.parse(body || "{}"));
        writeJson(context.response, 200, { ok: true, config: saved.values });
      })
      .catch((error) => writeJson(context.response, 400, {
        ok: false,
        error: error instanceof Error ? error.message : "Invalid config"
      }));
  }
  if (method !== "GET") {
    return writeJson(context.response, 405, { ok: false, error: "Method not allowed" });
  }
  return serveStatic(context.response, context.staticDir, url.pathname);
}

function serveStatic(response, staticDir, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const target = resolve(staticDir, `.${requested}`);
  if (!target.startsWith(staticDir) || !existsSync(target) || statSync(target).isDirectory()) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  response.writeHead(200, {
    "Content-Type": CONTENT_TYPES[extname(target)] ?? "application/octet-stream",
    "Cache-Control": "no-store"
  });
  response.end(readFileSync(target));
}

function readArtifact(cwd, path, kind) {
  const target = resolve(cwd, path);
  if (!isAllowedArtifactPath(cwd, path, kind)) {
    return { kind, path, status: "blocked", summary: null };
  }
  if (!existsSync(target)) {
    return { kind, path, status: "missing", summary: null };
  }
  try {
    const parsed = JSON.parse(readFileSync(target, "utf8"));
    return {
      kind,
      path,
      status: "available",
      summary: summarizeArtifact(kind, parsed)
    };
  } catch {
    return { kind, path, status: "invalid", summary: null };
  }
}

function readLatestLabArtifact(cwd, path) {
  const base = resolve(cwd, path);
  if (!isAllowedArtifactPath(cwd, path, "lab")) {
    return { kind: "lab", path, status: "blocked", summary: null };
  }
  if (existsSync(base) && !statSync(base).isDirectory()) {
    return readArtifact(cwd, path, "lab");
  }
  const summaryPath = resolve(base, "summary.json");
  if (existsSync(summaryPath)) {
    return readArtifact(cwd, join(path, "summary.json"), "lab");
  }
  if (existsSync(base)) {
    const latest = findLatestLabSummary(base);
    if (latest) {
      return readArtifact(cwd, join(path, latest, "summary.json"), "lab");
    }
  }
  return { kind: "lab", path, status: existsSync(base) ? "missing-summary" : "missing", summary: null };
}

function isAllowedArtifactPath(cwd, path, kind) {
  const roots = {
    diagnostics: resolve(cwd, "tmp/diagnostics"),
    evidence: resolve(cwd, "tmp/evidence"),
    lab: resolve(cwd, "tmp/agent-lab")
  };
  const root = roots[kind];
  if (!root) {
    return false;
  }
  const target = resolve(cwd, path);
  const child = relative(root, target);
  return child === "" || (!child.startsWith("..") && !isAbsolute(child));
}

function findLatestLabSummary(base) {
  return readdirSync(base, { withFileTypes: true })
    .filter((entry) => entry.isDirectory()
      && isTimestampedLabRun(entry.name)
      && existsSync(resolve(base, entry.name, "summary.json")))
    .map((entry) => entry.name)
    .sort()
    .at(-1) ?? null;
}

function isTimestampedLabRun(name) {
  return /^\d{4}-\d{2}-\d{2}T\d{6}-\d{3}Z$/.test(name);
}

function summarizeArtifact(kind, parsed) {
  if (kind === "diagnostics") {
    return {
      status: parsed.status ?? null,
      generatedAt: parsed.generatedAt ?? null,
      baseUrl: parsed.environment?.baseUrl ?? null,
      checks: Array.isArray(parsed.checks) ? parsed.checks.length : null
    };
  }
  if (kind === "evidence") {
    return {
      status: parsed.evidence?.status ?? parsed.status ?? null,
      generatedAt: parsed.generatedAt ?? null,
      source: parsed.source?.type ?? null,
      checks: Array.isArray(parsed.evidence?.checks) ? parsed.evidence.checks.length : null
    };
  }
  return {
    status: parsed.status ?? null,
    generatedAt: parsed.generatedAt ?? null,
    mode: parsed.mode ?? null,
    checks: Array.isArray(parsed.checks) ? parsed.checks.length : null
  };
}

function writeJson(response, status, value) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 10000) {
      throw new Error("Request body too large");
    }
  }
  return body;
}

function openBrowser(url) {
  const command = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32"
    ? ["/c", "start", "", "msedge", `--app=${url}`]
    : [url];
  const child = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
}

function waitForShutdown() {
  return new Promise(() => {});
}

function parseArgs(args) {
  if (args.includes("--help") || args.includes("-h")) {
    return { ok: true, help: true };
  }
  const portValue = readOption(args, "--port");
  const port = portValue ? Number(portValue) : null;
  if (portValue && (!Number.isInteger(port) || port < 0 || port > 65535)) {
    return { ok: false, error: "Invalid --port value" };
  }
  return {
    ok: true,
    noOpen: args.includes("--no-open"),
    check: args.includes("--check"),
    port
  };
}

function readOption(values, name) {
  const index = values.indexOf(name);
  return index === -1 ? null : values[index + 1] ?? null;
}

function printUsage() {
  console.error("Usage: node scripts/ui.js [--no-open] [--check] [--port 0]");
}

function isMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
}
