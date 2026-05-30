import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  buildUiState,
  loadConfig,
  saveConfig,
  startUiServer,
  validateConfig,
  valueLooksSafe
} from "./ui.js";

test("loadConfig returns defaults without creating local config", () => {
  const cwd = mkdtempSync(join(tmpdir(), "kamay-ui-"));
  const config = loadConfig(cwd);

  assert.equal(config.exists, false);
  assert.equal(config.values.baseUrl, "https://kamay-adapter.epix.workers.dev");
  assert.equal(existsSync(join(cwd, ".kamay-adapter.local.json")), false);
});

test("saveConfig stores non-secret local settings only when explicit", () => {
  const cwd = mkdtempSync(join(tmpdir(), "kamay-ui-"));
  const saved = saveConfig(cwd, {
    baseUrl: "https://adapter.example.test",
    repoSlug: "owner/name",
    diagnosticsPath: "tmp/diagnostics/latest.json",
    evidencePath: "tmp/evidence/latest.json",
    labPath: "tmp/agent-lab"
  });

  assert.equal(existsSync(saved.path), true);
  const config = loadConfig(cwd);
  assert.equal(config.exists, true);
  assert.equal(config.values.repoSlug, "owner/name");
});

test("validateConfig rejects secrets and full signed URL-like values", () => {
  assert.equal(valueLooksSafe("https://example.test/path"), true);
  assert.equal(valueLooksSafe("https://example.test/path?kmy_cap=abc.def"), false);
  assert.throws(
    () => validateConfig({ ...validConfig(), repoSlug: "GITHUB_TOKEN" }),
    /forbidden secret or bearer marker/
  );
});

test("buildUiState reports missing artifacts without failing", () => {
  const cwd = mkdtempSync(join(tmpdir(), "kamay-ui-"));
  const state = buildUiState(cwd);

  assert.equal(state.artifacts.diagnostics.status, "missing");
  assert.equal(state.artifacts.evidence.status, "missing");
  assert.equal(state.artifacts.lab.status, "missing");
  assert.equal(state.boundaries.readsEnvLocal, false);
});

test("buildUiState summarizes valid and invalid artifact JSON", () => {
  const cwd = mkdtempSync(join(tmpdir(), "kamay-ui-"));
  mkdirSync(join(cwd, "tmp/diagnostics"), { recursive: true });
  mkdirSync(join(cwd, "tmp/evidence"), { recursive: true });
  mkdirSync(join(cwd, "tmp/agent-lab"), { recursive: true });
  writeFileSync(join(cwd, "tmp/diagnostics/latest.json"), JSON.stringify({
    status: "PASS",
    generatedAt: "2026-05-29T00:00:00.000Z",
    environment: { baseUrl: "https://adapter.example.test" },
    checks: [{ name: "headerCapabilities" }]
  }));
  writeFileSync(join(cwd, "tmp/evidence/latest.json"), "{ not-json");
  writeFileSync(join(cwd, "tmp/agent-lab/summary.json"), JSON.stringify({
    status: "PASS",
    mode: "smoke",
    generatedAt: "2026-05-29T00:00:00.000Z",
    checks: []
  }));

  const state = buildUiState(cwd);
  assert.equal(state.artifacts.diagnostics.status, "available");
  assert.equal(state.artifacts.diagnostics.summary.checks, 1);
  assert.equal(state.artifacts.evidence.status, "invalid");
  assert.equal(state.artifacts.lab.status, "available");
});

test("buildUiState blocks artifact paths that resolve outside approved roots", () => {
  const cwd = mkdtempSync(join(tmpdir(), "kamay-ui-"));
  saveConfig(cwd, {
    ...validConfig(),
    diagnosticsPath: "tmp/diagnostics/../../README.md"
  });

  const state = buildUiState(cwd);

  assert.equal(state.artifacts.diagnostics.status, "blocked");
});

test("buildUiState surfaces newest timestamped lab summary", () => {
  const cwd = mkdtempSync(join(tmpdir(), "kamay-ui-"));
  mkdirSync(join(cwd, "tmp/agent-lab/2026-05-29T100000-000Z"), { recursive: true });
  mkdirSync(join(cwd, "tmp/agent-lab/2026-05-29T110000-000Z"), { recursive: true });
  mkdirSync(join(cwd, "tmp/agent-lab/smoke-test"), { recursive: true });
  writeFileSync(join(cwd, "tmp/agent-lab/2026-05-29T100000-000Z/summary.json"), JSON.stringify({
    status: "WARN",
    mode: "smoke",
    generatedAt: "2026-05-29T10:00:00.000Z",
    checks: []
  }));
  writeFileSync(join(cwd, "tmp/agent-lab/2026-05-29T110000-000Z/summary.json"), JSON.stringify({
    status: "PASS",
    mode: "qa",
    generatedAt: "2026-05-29T11:00:00.000Z",
    checks: [{ name: "qa" }]
  }));
  writeFileSync(join(cwd, "tmp/agent-lab/smoke-test/summary.json"), JSON.stringify({
    status: "WARN",
    mode: "smoke",
    generatedAt: "2026-05-29T12:00:00.000Z",
    checks: []
  }));

  const state = buildUiState(cwd);

  assert.equal(state.artifacts.lab.status, "available");
  assert.equal(state.artifacts.lab.summary.mode, "qa");
  assert.equal(state.artifacts.lab.summary.checks, 1);
});

test("local server exposes state and saves config", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "kamay-ui-"));
  const server = await startUiServer({
    cwd,
    port: 0,
    openBrowser: false,
    opener: () => {}
  });
  try {
    const stateResponse = await fetch(`${server.url}api/state`);
    const state = await stateResponse.json();
    assert.equal(state.config.exists, false);

    const saveResponse = await fetch(`${server.url}api/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validConfig(), repoSlug: "owner/name" })
    });
    assert.equal(saveResponse.status, 200);
    const configText = readFileSync(join(cwd, ".kamay-adapter.local.json"), "utf8");
    assert.equal(configText.includes("owner/name"), true);
  } finally {
    await server.close();
  }
});

test("local server rejects secret-looking config", async () => {
  const cwd = mkdtempSync(join(tmpdir(), "kamay-ui-"));
  const server = await startUiServer({
    cwd,
    port: 0,
    openBrowser: false,
    opener: () => {}
  });
  try {
    const response = await fetch(`${server.url}api/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validConfig(), baseUrl: "https://example.test/?kmy_sig=abc" })
    });
    assert.equal(response.status, 400);
  } finally {
    await server.close();
  }
});

function validConfig() {
  return {
    baseUrl: "https://adapter.example.test",
    repoSlug: "owner/name",
    diagnosticsPath: "tmp/diagnostics/latest.json",
    evidencePath: "tmp/evidence/latest.json",
    labPath: "tmp/agent-lab"
  };
}
