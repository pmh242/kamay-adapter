# Local Status UI

Status: LOCAL OPERATOR WORKFLOW.

The Kamay Adapter local UI is a foreground-only status window for operator
visibility. It starts a local HTTP server bound to `127.0.0.1`, opens a browser
window, and displays non-secret connection settings plus existing
diagnostics/evidence/lab artifacts.

```powershell
npm run ui
```

Validation mode:

```powershell
node scripts/ui.js --no-open --check
```

## What It Shows

- repo root
- local config path
- adapter base URL
- repository slug
- diagnostics, evidence, and lab artifact paths
- parsed summaries for existing sanitized artifacts
- copyable commands for diagnostics, evidence, and lab workflows

## Local Config

The UI stores non-secret settings in ignored local file:

```text
.kamay-adapter.local.json
```

Allowed fields:

- `baseUrl`
- `repoSlug`
- `diagnosticsPath`
- `evidencePath`
- `labPath`

The UI must not store secrets, bearer URLs, signing tokens, or `.env.local`
contents.

## Boundaries

The UI does not:

- read `.env.local`
- mint delegated URLs
- execute diagnostics, lab, shell, git, wrangler, or deploy commands
- mutate Cloudflare
- change runtime auth
- run as a daemon or background service
- upload telemetry

Command snippets are copy-only. Any future button that executes commands needs
a separate task and approval model.
