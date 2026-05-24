#!/usr/bin/env node

import { signUrl, SIGNED_URL_TTL } from "../core/services/signed-url.js";

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
