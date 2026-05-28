#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildEvidenceManifest, evidenceLooksSafe } from "./evidence.js";

const TOOL_VERSION = "0.1.0";
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
    const run = runLab({
      mode: parsed.mode,
      out: parsed.out,
      cwd: options.cwd ?? process.cwd(),
      now: options.now ?? new Date(),
      runCommand: options.runCommand ?? runCommand
    });
    if (parsed.json) {
      console.log(JSON.stringify(run.summary, null, 2));
    } else {
      console.log(formatSummary(run.summary));
    }
    return run.summary.status === "PASS" || run.summary.status === "WARN" ? 0 : 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Lab run failed");
    return 1;
  }
}

export function runLab(options = {}) {
  const mode = options.mode ?? "smoke";
  if (!["smoke", "qa"].includes(mode)) {
    throw new Error(`Unsupported lab mode: ${mode}`);
  }
  const cwd = options.cwd ?? process.cwd();
  const now = options.now ?? new Date();
  const runId = safeRunId(now);
  const outDir = resolve(cwd, options.out ?? `tmp/agent-lab/${runId}`);
  mkdirSync(outDir, { recursive: true });

  const checks = [];
  const artifacts = [];
  const skipped = [];
  const runner = options.runCommand ?? runCommand;

  const smokeLog = join(outDir, "smoke.log");
  const smokeCommands = [
    ["node", ["--check", "scripts/lab.js"], "syntax:lab"],
    ["node", ["--check", "scripts/evidence.js"], "syntax:evidence"],
    ["node", ["--check", "scripts/diagnostics.js"], "syntax:diagnostics"],
    ["node", ["--check", "scripts/delegate-url.js"], "syntax:delegate-url"],
    ["npm", ["test"], "core:npm-test"]
  ];
  runCommandSet(smokeCommands, { cwd, logPath: smokeLog, checks, runner });
  artifacts.push(artifact("smokeLog", smokeLog, cwd));

  if (mode === "qa") {
    const qaLog = join(outDir, "qa.log");
    const qaCommands = [
      ["node", ["--test", "scripts/diagnostics.test.js"], "test:diagnostics"],
      ["node", ["--test", "scripts/evidence.test.js"], "test:evidence"],
      ["node", ["--test", "scripts/delegate-url.test.js"], "test:delegate-url"],
      ["node", ["--test", "scripts/lab.test.js"], "test:lab"]
    ];
    runCommandSet(qaCommands, { cwd, logPath: qaLog, checks, runner });
    artifacts.push(artifact("qaLog", qaLog, cwd));
  }

  const diagnosticsResult = buildDiagnosticsArtifact({ cwd, outDir, checks, artifacts, skipped, runner });
  if (diagnosticsResult?.diagnostics) {
    try {
      const evidence = buildEvidenceManifest(diagnosticsResult.diagnostics, {
        label: `agent-lab-${mode}`,
        now
      });
      const evidencePath = join(outDir, "evidence.json");
      writeJsonFile(evidencePath, evidence);
      artifacts.push(artifact("evidence", evidencePath, cwd));
      checks.push(check("evidence:build", "PASS", "evidence", null));
    } catch (error) {
      checks.push(check(
        "evidence:build",
        "FAIL",
        "evidence",
        error instanceof Error ? error.message : "EVIDENCE_FAILED"
      ));
    }
  }

  const summary = buildSummary({ mode, now, checks, artifacts, skipped });
  const summaryPath = join(outDir, "summary.json");
  writeJsonFile(summaryPath, summary);
  artifacts.push(artifact("summary", summaryPath, cwd));

  if (mode === "qa") {
    const redaction = scanArtifacts(outDir);
    summary.redaction = redaction;
    summary.status = aggregateStatus([
      ...checks,
      redaction.safe ? check("redaction:artifacts", "PASS", "redaction", null) : check("redaction:artifacts", "FAIL", "redaction", "FORBIDDEN_MARKER")
    ]);
    writeJsonFile(summaryPath, summary);
  }

  return {
    outDir,
    summary
  };
}

export function buildSummary(input) {
  return {
    schemaVersion: 1,
    tool: {
      name: "kamay-adapter-agent-lab",
      version: TOOL_VERSION
    },
    mode: input.mode,
    status: aggregateStatus(input.checks),
    generatedAt: input.now.toISOString(),
    checks: input.checks,
    artifacts: input.artifacts,
    deferredOrSkipped: input.skipped,
    redaction: {
      safe: true,
      forbiddenMarkersFound: []
    }
  };
}

export function aggregateStatus(checks) {
  if (checks.some((item) => item.status === "BLOCKED")) {
    return "BLOCKED";
  }
  if (checks.some((item) => item.status === "FAIL")) {
    return "FAIL";
  }
  if (checks.some((item) => item.status === "WARN")) {
    return "WARN";
  }
  return "PASS";
}

export function scanTextForForbiddenMarkers(text) {
  return FORBIDDEN_MARKERS.filter((marker) => text.includes(marker));
}

function buildDiagnosticsArtifact(input) {
  const rawPath = join(input.outDir, "diagnostics.raw.json");
  const result = input.runner("node", ["scripts/diagnostics.js", "export", "--out", rawPath], { cwd: input.cwd });
  if (!existsSync(rawPath)) {
    input.skipped.push({
      name: "diagnostics",
      reason: "diagnostics export unavailable; local secrets may be missing"
    });
    input.checks.push(check("diagnostics:export", "WARN", "diagnostics", "UNAVAILABLE"));
    return null;
  }

  const diagnostics = sanitizeDiagnostics(JSON.parse(readFileSync(rawPath, "utf8")));
  unlinkSync(rawPath);
  const diagnosticsPath = join(input.outDir, "diagnostics.json");
  writeJsonFile(diagnosticsPath, diagnostics);
  input.artifacts.push(artifact("diagnostics", diagnosticsPath, input.cwd));
  input.checks.push(check(
    "diagnostics:export",
    result.status === 0 ? "PASS" : "WARN",
    "diagnostics",
    result.status === 0 ? null : "DIAGNOSTICS_NONZERO"
  ));
  return { diagnostics };
}

export function sanitizeDiagnostics(diagnostics) {
  const clone = JSON.parse(JSON.stringify(diagnostics));
  if (clone.environment?.envPresence) {
    clone.environment.localConfigPresence = {
      headerAuthSecret: Boolean(clone.environment.envPresence.KAMAY_TOKEN),
      signingSecret: Boolean(clone.environment.envPresence.KAMAY_SIGNING_SECRET),
      baseUrl: Boolean(clone.environment.envPresence.KAMAY_ADAPTER_BASE_URL)
    };
    delete clone.environment.envPresence;
  }
  if (!evidenceLooksSafe(clone)) {
    throw new Error("Diagnostics artifact contains forbidden secret or bearer URL markers");
  }
  return clone;
}

function runCommandSet(commands, options) {
  const lines = [];
  for (const [command, args, name] of commands) {
    const result = options.runner(command, args, { cwd: options.cwd });
    lines.push(`$ ${command} ${args.join(" ")}`);
    if (result.stdout) {
      lines.push(result.stdout.trimEnd());
    }
    if (result.stderr) {
      lines.push(result.stderr.trimEnd());
    }
    options.checks.push(check(name, result.status === 0 ? "PASS" : "FAIL", "validation", result.status === 0 ? null : `EXIT_${result.status}`));
  }
  writeTextFile(options.logPath, `${lines.join("\n")}\n`);
}

function runCommand(command, args, options) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    shell: process.platform === "win32",
    windowsHide: true
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? ""
  };
}

function scanArtifacts(outDir) {
  const found = [];
  for (const name of ["summary.json", "smoke.log", "qa.log", "diagnostics.json", "evidence.json"]) {
    const path = join(outDir, name);
    if (!existsSync(path)) {
      continue;
    }
    const markers = scanTextForForbiddenMarkers(readFileSync(path, "utf8"));
    for (const marker of markers) {
      found.push({ artifact: name, marker: markerCode(marker) });
    }
  }
  return {
    safe: found.length === 0,
    forbiddenMarkersFound: found
  };
}

function markerCode(marker) {
  const codes = {
    "kmy_cap=": "CAPABILITY_URL_PARAM",
    "kmy_sig=": "SIGNATURE_URL_PARAM",
    ".env.local": "LOCAL_ENV_FILE",
    KAMAY_TOKEN: "HEADER_AUTH_SECRET_NAME",
    KAMAY_SIGNING_SECRET: "SIGNING_SECRET_NAME",
    GITHUB_TOKEN: "GITHUB_TOKEN_NAME"
  };
  return codes[marker] ?? "FORBIDDEN_MARKER";
}

function check(name, status, classification, errorCode) {
  return {
    name,
    status,
    classification,
    errorCode
  };
}

function artifact(name, path, cwd) {
  return {
    name,
    path: relativePath(path, cwd)
  };
}

function relativePath(path, cwd) {
  return resolve(path).replace(`${resolve(cwd)}\\`, "").replaceAll("\\", "/");
}

function writeJsonFile(path, value) {
  const text = `${JSON.stringify(value, null, 2)}\n`;
  const markers = scanTextForForbiddenMarkers(text);
  if (markers.length > 0) {
    throw new Error(`Refusing to write artifact with forbidden markers: ${markers.join(", ")}`);
  }
  writeTextFile(path, text);
}

function writeTextFile(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, "utf8");
}

function safeRunId(now) {
  return now.toISOString().replaceAll(":", "").replaceAll(".", "-");
}

function parseArgs(args) {
  const mode = args[0];
  if (!mode || mode === "--help" || mode === "-h") {
    return { ok: true, help: true };
  }
  if (!["smoke", "qa"].includes(mode)) {
    return { ok: false, error: `Unknown lab mode: ${mode}` };
  }
  return {
    ok: true,
    mode,
    out: readOption(args, "--out"),
    json: args.includes("--json")
  };
}

function readOption(values, name) {
  const index = values.indexOf(name);
  return index === -1 ? null : values[index + 1] ?? null;
}

function formatSummary(summary) {
  const failed = summary.checks.filter((item) => item.status === "FAIL").length;
  const warned = summary.checks.filter((item) => item.status === "WARN").length;
  const blocked = summary.checks.filter((item) => item.status === "BLOCKED").length;
  return [
    `status: ${summary.status}`,
    `mode: ${summary.mode}`,
    `generatedAt: ${summary.generatedAt}`,
    `checks: ${summary.checks.length} total, ${failed} fail, ${warned} warn, ${blocked} blocked`,
    `artifacts: ${summary.artifacts.map((item) => item.path).join(", ")}`,
    `redaction: safe=${summary.redaction.safe}`
  ].join("\n");
}

function printUsage() {
  console.error("Usage: node scripts/lab.js <smoke|qa> [--out tmp/agent-lab/run-id] [--json]");
}

function isMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
}
