#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { signUrl, SIGNED_URL_TTL } from "../core/services/signed-url.js";

loadLocalEnv();

const args = process.argv.slice(2);
const url = args.find((arg) => !arg.startsWith("--"));
const ttlSeconds = readOption(args, "--ttl-seconds") ?? String(SIGNED_URL_TTL.DEFAULT_SECONDS);
const method = readOption(args, "--method") ?? "GET";

if (!url) {
  console.error("Usage: node scripts/sign-url.js <url> [--ttl-seconds 900] [--method GET]");
  process.exit(1);
}

try {
  const signed = await signUrl(url, process.env.KAMAY_SIGNING_SECRET, {
    ttlSeconds,
    method
  });
  console.log(signed);
} catch (error) {
  console.error(error instanceof Error ? error.message : "Failed to sign URL");
  process.exit(1);
}

function readOption(values, name) {
  const index = values.indexOf(name);
  return index === -1 ? null : values[index + 1] ?? null;
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
