# Diagnostics And Bug Export

Status: LOCAL OPERATOR WORKFLOW.

Kamay Adapter diagnostics are local-first and operator-run. They summarize live
readiness, failure classes, compatibility notes, and optional deployment
metadata without printing secrets or full bearer URLs.

## Commands

Status summary:

```powershell
node scripts/diagnostics.js status
```

Machine-readable status:

```powershell
node scripts/diagnostics.js status --json
```

Redacted export bundle:

```powershell
node scripts/diagnostics.js export --out tmp/diagnostics/latest.json
```

Optional inputs:

- `--base-url <url>` overrides `KAMAY_ADAPTER_BASE_URL`.
- `--include-cloudflare` attempts read-only Wrangler deployment metadata.
- `--json` prints the redacted JSON report to stdout.

The script may read ignored `.env.local` for:

- `KAMAY_TOKEN`
- `KAMAY_SIGNING_SECRET`
- `KAMAY_ADAPTER_BASE_URL`

It must not print the values.

## Status Model

| Status | Meaning |
| --- | --- |
| `PASS` | Required checks succeeded. |
| `WARN` | Required checks are usable, but optional metadata or compatibility checks are inconclusive. |
| `FAIL` | One or more required live checks failed. |
| `BLOCKED` | Local prerequisites are missing, such as required local secrets. |

Required checks include:

- Adapter reachability through auth-gated routes.
- Unauthenticated request rejection.
- Header auth success.
- Compact v2 signed capability GET success.
- Signed POST rejection.
- GitHub commits/tree backend reads.
- Envelope metadata shape, including request ID and rate-limit metadata shape.

Optional checks include:

- Read-only Cloudflare deployment/version visibility through Wrangler.
- Legacy signed URL and compact v1 compatibility when added to a future check set.
- Custom domain versus `workers.dev` comparison when both are configured.

## Export Shape

The export is one JSON object with:

- schema and tool version
- generation timestamp
- base URL and local environment presence booleans
- sanitized check results
- optional Cloudflare deployment/version metadata
- provider compatibility notes
- rollback recommendation metadata
- redaction guarantees

The export is intended for local operator inspection and future Kamay UI
display-only status surfaces.

## Redaction Rules

Diagnostics must never print or export:

- `KAMAY_TOKEN` value
- `KAMAY_SIGNING_SECRET` value
- `GITHUB_TOKEN` value
- full signed/delegated URLs
- `kmy_sig` values
- `kmy_cap` token values
- `.env.local` contents

Allowed exported URL metadata:

- base URL
- route or capability name
- token format
- TTL
- final URL length

Recommended storage is ignored `tmp/diagnostics/**`. Do not commit diagnostic
bundles unless a future task explicitly approves a sanitized fixture.

## Failure Classes

| Classification | Meaning |
| --- | --- |
| `local_config` | Missing local secret, missing env, or invalid base URL. |
| `reachability` | DNS, TLS, network, blocked host, or unavailable endpoint. |
| `auth` | Header auth or auth-gated capability failure. |
| `capability` | Signed URL format, method rejection, or scope issue. |
| `backend` | GitHub API, repo access, or backend read failure. |
| `deployment` | Wrangler metadata unavailable or deployed state unknown. |
| `compatibility` | Provider-specific fetch behavior such as Claude web host blocking. |
| `unexpected` | Malformed envelope or non-Kamay error response. |

## Compatibility Notes

Current recorded compatibility:

- Local PowerShell: verified.
- ChatGPT web: verified.
- Claude web: blocked by provider egress policy when host is not allowed.
- Claude Code/local: recommended Claude path.

Compact v2 capability URLs reduce URL length, but they do not bypass provider
allowlists or egress policy.

## Future Kamay UI Hooks

Future Kamay UI may consume an exported diagnostics JSON file as display-only
status. It may show:

- overall status
- last verification timestamp
- base URL
- provider/backend
- compatibility notes
- failure classification
- suggested operator action

Future UI must not run diagnostics, read `.env.local`, mint URLs, upload
bundles, deploy Workers, mutate Cloudflare, or persist bearer URLs unless a
later permission model explicitly approves that behavior.

## Non-Goals

- Automatic uploads.
- Telemetry platform.
- Analytics backend.
- Background daemon.
- Cloud persistence.
- Dashboard system.
- Rollback execution.
- Cloudflare mutation.
