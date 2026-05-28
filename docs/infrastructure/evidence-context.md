# Evidence Context

Status: LOCAL OPERATOR WORKFLOW.

Evidence context is a portable, redacted summary of adapter readiness that an
operator can hand to an AI system without granting broader repository,
Cloudflare, or secret authority.

The first evidence source is the diagnostics export:

```powershell
node scripts/diagnostics.js export --out tmp/diagnostics/latest.json
node scripts/evidence.js build --diagnostics tmp/diagnostics/latest.json --out tmp/evidence/latest.json
```

Optional task metadata:

```powershell
node scripts/evidence.js build --diagnostics tmp/diagnostics/latest.json --out tmp/evidence/latest.json --task-id KAMAY-ADAPTER-EVIDENCE-001 --label "local smoke"
```

Use `--json` when a machine-readable copy should also be printed to stdout.

## Manifest Ownership

The evidence manifest records:

- diagnostics status and timestamp
- adapter base URL
- provider/backend observed from sanitized checks
- summarized checks and classifications
- compatibility notes
- deployment metadata already present in diagnostics
- redaction guarantees

It does not run live checks. It does not read `.env.local`. It does not mint
capability URLs. It only transforms an existing diagnostics export.

## Redaction Rules

Evidence must never include:

- secret values
- full delegated or signed URLs
- `kmy_cap` token values
- `kmy_sig` signature values
- `.env.local` contents
- `KAMAY_TOKEN`, `KAMAY_SIGNING_SECRET`, or `GITHUB_TOKEN` names in the output

The builder accepts diagnostics secret-presence booleans as input metadata but
does not copy those key names into the evidence manifest.

Recommended storage is ignored `tmp/evidence/**`. Do not commit evidence
bundles unless a future task explicitly approves a sanitized fixture.

The [Agent Test Lab](../../agent-lab/README.md) can generate temporary
diagnostics and evidence artifacts under ignored `tmp/agent-lab/**`.

## Route Decision

No `/v1/evidence/*` route exists in this slice.

The Worker cannot read local `tmp/` evidence without adding upload, storage, or
a persistent service. Evidence remains local and operator-mediated until a
separate task chooses an explicit source and storage model.

## AI Handoff

AI systems consume evidence by operator handoff:

- paste the JSON packet into a task
- attach/upload the JSON packet where the tool supports local files
- use it locally with Claude Code, Codex, or another local agent

Evidence packets are summaries, not authority. They do not replace signed
capability URLs for repository reads.

## Non-Goals

- Worker evidence route.
- Evidence upload.
- Telemetry or analytics.
- Database, KV, Durable Object, or cloud persistence.
- Background monitoring.
- Agent execution.
- Write APIs.
