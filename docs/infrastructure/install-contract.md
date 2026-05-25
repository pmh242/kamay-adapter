# Install / Integration Contract

Status: CURRENT DESIGN CONTRACT.

This document defines how Kamay Adapter should be installed and integrated without collapsing Adapter, Kamay main, or Kamay-X boundaries.

## Adapter Identity

- Name: `kamay-adapter`.
- Type: `remote-repository-read-driver`.
- Capability surface: read-only repository context over HTTP.
- Authority model: operator-owned secrets and short-lived delegated capability URLs.
- Compatibility stance: standalone first; Kamay integration later through explicit config and verification commands.

Kamay Adapter must work without Kamay being installed. `KAMAY_REPO=pmh242/kamay` is configuration, not a runtime dependency on Kamay main.

## Install Modes

| Mode | Status | Purpose |
| --- | --- | --- |
| `standalone-cloudflare` | IMPLEMENTED / PRIMARY | Operator deploys the Worker, configures secrets, and verifies the live endpoint. |
| `standalone-node` | IMPLEMENTED | Local smoke testing or simple private-network self-hosting. |
| `kamay-managed-remote` | PLANNED | Kamay UI records endpoint/config metadata and runs verification without depending on Adapter internals. |
| `mcp` | DEFERRED | Future MCP runtime should mirror the same read-only capability semantics. |

## Lifecycle

- `install`: clone or use the repo, choose a runtime target, configure required secrets, then deploy or start the runtime.
- `verify`: run repo tests and live verification against the configured base URL.
- `enable`: mark a verified Adapter endpoint as usable by the operator or Kamay.
- `disable`: stop minting or using delegated URLs for the endpoint without deleting secrets or deployment.
- `remove`: delete the Worker/custom-domain trigger or stop the local service, then remove local non-secret config.
- `rollback`: restore a previous Worker version or previous known-good endpoint config.

Disabling should not require secret rotation unless a secret or bearer URL was exposed.

## Configuration

Runtime inputs:

| Name | Required | Purpose |
| --- | --- | --- |
| `KAMAY_TOKEN` | Yes | Header auth shared secret. |
| `KAMAY_SIGNING_SECRET` | Yes for delegated URLs | HMAC secret for signed capability URL verification and local minting. |
| `KAMAY_REPO` | Yes for GitHub | Backend repository identifier. |
| `GITHUB_TOKEN` | Yes for GitHub | GitHub API read token. |
| `KAMAY_SOURCE` | No | Backend selector; defaults to `github`. |

Local operator config:

- `.env.local` remains ignored and local-only.
- `.env.local` may contain `KAMAY_TOKEN`, `KAMAY_SIGNING_SECRET`, and `KAMAY_ADAPTER_BASE_URL` for verification and URL minting.
- Secret values must never be written into docs, manifests, commits, chats, or Kamay project state.

## Future Manifest Shape

If Kamay or another operator tool needs an install record, keep it non-secret:

```json
{
  "id": "kamay-adapter",
  "kind": "remote-repository-read-driver",
  "version": "0.1.0",
  "baseUrl": "https://adapter.example.com",
  "provider": "repository",
  "backend": "github",
  "repo": "owner/name",
  "auth": {
    "header": "X-Kamay-Token",
    "delegation": "kmy_cap"
  },
  "capabilities": {
    "read": true,
    "write": false,
    "delegatedUrls": true
  },
  "verification": {
    "command": "node scripts/verify-live.js",
    "lastStatus": "PASS|FAIL|UNKNOWN"
  }
}
```

The manifest stores identity, endpoint, capability, and verification metadata only. It must not contain `KAMAY_TOKEN`, `KAMAY_SIGNING_SECRET`, `GITHUB_TOKEN`, delegated bearer URLs, or provider tokens.

## Verification And Operations

Standalone verification:

```powershell
npm test
node scripts/verify-live.js
node scripts/delegate-url.js readme --base-url <adapter-url>
```

Use `--print-url` only when the operator intentionally needs a bearer capability URL:

```powershell
node scripts/delegate-url.js readme --base-url <adapter-url> --print-url
```

Cloudflare expectations:

- Worker deploy remains an explicit operator action.
- Secrets are configured with Wrangler or Cloudflare UI outside repo state.
- Custom domains are optional compatibility infrastructure, not required by Adapter core.
- Deployed state must be verified separately from repo state.

## Kamay Boundary

Kamay main may own UI, governance, install orchestration, and local policy decisions. Kamay Adapter owns remote repo-read protocol behavior and delegated URL validation.

Integration should happen through:

- base URL
- capability discovery
- verification output
- explicit non-secret configuration

Kamay must not depend on Adapter internals. Adapter must not import, inspect, or mutate Kamay runtime state, `.kamay` folders, memory, governance, contract engine, MCP kernel, or local workspace authority.

## Removal And Rollback

- Remove the custom-domain trigger if one was created.
- Delete or disable the Worker deployment if the Adapter is no longer needed.
- Stop the Node server if running in `standalone-node` mode.
- Remove local `.env.local` and any Kamay-side non-secret endpoint record.
- Roll back Cloudflare Worker by previous version ID when deployment behavior regresses.
- Rotate `KAMAY_TOKEN`, `KAMAY_SIGNING_SECRET`, or `GITHUB_TOKEN` only if exposed or no longer trusted.

## Deferred

- Plugin marketplace.
- OAuth or browser sessions.
- Database, KV, Durable Object, or registry-backed install state.
- One-click secret provisioning.
- Multi-repo orchestration.
- Write operations.
- Provider-specific AI client SDK logic.
- MCP runtime implementation.
- Kamay UI implementation details.
