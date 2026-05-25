# Deployment Assumptions

Status: REPO-VISIBLE ASSUMPTIONS WITH LIVE VERIFICATION NOTES.

This document distinguishes deploy-ready repo state from deployed infrastructure state. Live verification was performed with sanitized output; secret values are not recorded here.

## Repo-Visible Deployment Readiness

- IMPLEMENTED: Cloudflare Worker shim exists at `deployments/cloudflare-worker/src/index.js`.
- IMPLEMENTED: `wrangler.toml` points to `src/index.js`.
- IMPLEMENTED: `wrangler.toml` sets `compatibility_date = "2024-09-23"`.
- IMPLEMENTED: non-secret Worker vars in repo are `KAMAY_SOURCE = "github"` and `KAMAY_REPO = "pmh242/kamay"`.
- IMPLEMENTED: Node server shim exists and defaults to port `8766`.

## Infra-Visible Deployment State

VERIFIED by operator-run `node scripts/verify-live.js` after synchronizing ignored local `.env.local` with rotated Cloudflare Worker secrets:

- Live base URL: `https://kamay-adapter.epix.workers.dev`
- Verification status: PASS.
- Worker reachability: VERIFIED.
- Auth gate: VERIFIED.
- Header auth: VERIFIED.
- Signed GET auth: VERIFIED.
- Signed POST rejection: VERIFIED.
- GitHub backend read path: VERIFIED for commits/tree.
- Rate-limit metadata shape: VERIFIED.
- Secret values: not recorded.
- `.env.local`: local-only ignored operator file.

Still UNVERIFIED:

- Custom domain/route if any.
- Long-term monitoring.
- Rollback execution.
- Non-GitHub backend runtime behavior.
- MCP runtime.

## Runtime Env And Secret Usage

Repo-observed env inputs:

| Name | Source | Used by | Status |
| --- | --- | --- | --- |
| `KAMAY_TOKEN` | secret/env | header auth | REQUIRED for header auth |
| `KAMAY_SIGNING_SECRET` | secret/env | signed URL auth | REQUIRED for signed URL auth |
| `KAMAY_SOURCE` | var/env | backend selection | optional, defaults to `github` |
| `KAMAY_REPO` | var/env | GitHub backend | REQUIRED for GitHub backend |
| `GITHUB_TOKEN` | secret/env | GitHub backend | REQUIRED for GitHub backend |
| `PORT` | Node env | Node server | optional, defaults to `8766` |
| `fetchImpl` | injected test env | backend fetch override | TEST-ONLY / INTERNAL |

## Cloudflare Assumptions

- ASSUMED: Cloudflare Worker runtime provides standard `Request`, `Response`, `fetch`, `URL`, `TextEncoder`, and Web Crypto APIs.
- ASSUMED: Worker secrets are configured out-of-band with `wrangler secret put`.
- ASSUMED: deploying the Worker uses the current local repo state at deploy time.
- UNKNOWN: Cloudflare custom route/domain metadata, if any.

## Local Artifacts

`.wrangler/` may exist locally from dry runs or `wrangler dev`. It is ignored/cache/build state and is not source truth. Do not infer live deployment state from `.wrangler/` artifacts.

## Deployment Verification Boundary

Repo inspection can verify deploy readiness. Deployed state requires explicit external checks. The current live verification evidence is the sanitized PASS from:

- `node scripts/verify-live.js`

Other checks remain useful for release operations:

- `npx wrangler deployments list`
- Cloudflare dashboard or connector metadata
- rollback dry-run planning without executing rollback
