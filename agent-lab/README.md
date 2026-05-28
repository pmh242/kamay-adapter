# Agent Test Lab

Status: LOCAL OPERATOR WORKFLOW.

The Agent Test Lab is a small local validation and evidence workflow for Kamay
Adapter. Its rule is:

> Nothing graduates from the lab until it proves itself.

The lab is not an agent runtime. It does not schedule work, run background
loops, deploy Cloudflare, upload telemetry, mutate DNS, or manage persistent
agent state.

## Commands

Smoke:

```powershell
npm run lab
```

Explicit smoke output:

```powershell
node scripts/lab.js smoke --out tmp/agent-lab/smoke
```

QA:

```powershell
node scripts/lab.js qa --out tmp/agent-lab/qa
```

Use `--json` when a machine-readable summary should also be printed to stdout.

## Workflow

Smoke is fast, shallow critical-path verification:

- syntax checks for local lab, diagnostics, evidence, and URL helper scripts
- core test suite through `npm test`
- optional diagnostics export when local secrets are available
- optional evidence manifest built from sanitized diagnostics

QA is broader and more adversarial:

- all smoke checks
- script-level tests for diagnostics, evidence, delegated URL helper, and lab
- redaction scan over generated lab artifacts

Both modes are single-shot commands. They run once and exit.

## Artifacts

Default output lives under ignored `tmp/agent-lab/<timestamp>/`.

Typical files:

- `summary.json`
- `smoke.log`
- `qa.log` in QA mode
- `diagnostics.json` when diagnostics can run
- `evidence.json` when evidence can be built

Artifacts are temporary by default. Promoting evidence into committed docs
requires a separate approved task.

## Redaction

Lab artifacts must not contain:

- secret values
- full bearer URLs
- `kmy_cap` token values
- `kmy_sig` signature values
- `.env.local` contents
- `KAMAY_TOKEN`, `KAMAY_SIGNING_SECRET`, or `GITHUB_TOKEN` names

Diagnostics secret-presence booleans are sanitized into generic local config
presence fields before they are copied into lab artifacts.

## Boundaries

The lab is:

- local-first
- operator-mediated
- evidence-oriented
- bounded
- reversible

The lab is not:

- orchestration
- autonomous execution
- CI replacement
- workflow engine
- telemetry platform
- browser farm
- deployment system

Playwright or screenshot evidence is deferred until a future task defines one
specific local browser check and artifact convention.
