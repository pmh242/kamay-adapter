#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { signUrl, SIGNED_URL_TTL } from "../core/services/signed-url.js";

const DEFAULT_BASE_URL = "https://kamay-adapter.epix.workers.dev";

const PRESETS = Object.freeze({
  readme: Object.freeze({
    path: "/v1/repo/file",
    query: ({ ref }) => ({ path: "README.md", ref }),
    capability: ({ ref, label }) => ({
      operation: "getFile",
      pathPrefix: "README.md",
      ref,
      label
    })
  }),
  "docs-tree": Object.freeze({
    path: "/v1/repo/tree",
    query: ({ ref }) => ({ ref, path: "docs" }),
    capability: ({ ref, label }) => ({
      operation: "getTree",
      pathPrefix: "docs",
      ref,
      label
    })
  }),
  commits: Object.freeze({
    path: "/v1/repo/commits",
    query: ({ ref, n }) => ({ ref, n: String(n) }),
    capability: ({ ref, label }) => ({
      operation: "getCommits",
      ref,
      label
    })
  })
});

if (isMain()) {
  loadLocalEnv();
  const args = process.argv.slice(2);
  const preset = args.find((arg) => !arg.startsWith("--"));
  if (!preset || hasFlag(args, "--help")) {
    printUsage(preset ? 0 : 1);
  }

  try {
    const result = await mintDelegatedCapability(preset, {
      baseUrl: readOption(args, "--base-url") ?? process.env.KAMAY_ADAPTER_BASE_URL ?? DEFAULT_BASE_URL,
      signingSecret: process.env.KAMAY_SIGNING_SECRET,
      ttlSeconds: readOption(args, "--ttl-seconds") ?? String(SIGNED_URL_TTL.DEFAULT_SECONDS),
      ref: readOption(args, "--ref") ?? "main",
      n: readOption(args, "--n") ?? "10",
      label: readOption(args, "--label") ?? preset,
      printUrl: hasFlag(args, "--print-url")
    });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Failed to mint delegated capability URL");
    process.exit(1);
  }
}

export async function mintDelegatedCapability(presetName, options = {}) {
  const preset = PRESETS[presetName];
  if (!preset) {
    throw new Error(`Unknown preset: ${presetName}`);
  }

  const env = {
    KAMAY_SIGNING_SECRET: Boolean(options.signingSecret),
    KAMAY_ADAPTER_BASE_URL: Boolean(options.baseUrl)
  };
  if (!options.signingSecret) {
    return {
      status: "BLOCKED",
      reason: "Missing KAMAY_SIGNING_SECRET",
      env,
      presets: Object.keys(PRESETS)
    };
  }

  const ref = String(options.ref ?? "main");
  const n = Number.parseInt(String(options.n ?? "10"), 10);
  const ttlSeconds = Number.parseInt(
    String(options.ttlSeconds ?? SIGNED_URL_TTL.DEFAULT_SECONDS),
    10
  );
  const label = String(options.label ?? presetName);
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
  const query = preset.query({ ref, n });
  const url = new URL(preset.path, baseUrl);
  for (const [key, value] of Object.entries(query)) {
    url.searchParams.set(key, value);
  }

  const signedUrl = await signUrl(url.toString(), options.signingSecret, {
    ttlSeconds,
    capability: preset.capability({ ref, label })
  });

  const target = {
    route: preset.path,
    ref,
    ttlSeconds,
    label,
    ...preset.capability({ ref, label })
  };
  if (query.path) {
    target.path = query.path;
  }
  if (query.n) {
    target.n = Number.parseInt(query.n, 10);
  }

  const result = {
    status: "PASS",
    preset: presetName,
    urlPrinted: Boolean(options.printUrl),
    target,
    message: options.printUrl
      ? "Bearer capability URL printed because --print-url was supplied."
      : "URL hidden. Re-run with --print-url to print the bearer capability URL."
  };
  if (options.printUrl) {
    result.url = signedUrl;
  }
  return result;
}

function readOption(values, name) {
  const index = values.indexOf(name);
  return index === -1 ? null : values[index + 1] ?? null;
}

function hasFlag(values, name) {
  return values.includes(name);
}

function normalizeBaseUrl(value) {
  return String(value).replace(/\/+$/, "");
}

function isMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
}

function printUsage(exitCode) {
  console.error("Usage: node scripts/delegate-url.js <readme|docs-tree|commits> [--print-url] [--ttl-seconds 900] [--ref main] [--n 10] [--label label] [--base-url URL]");
  process.exit(exitCode);
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
