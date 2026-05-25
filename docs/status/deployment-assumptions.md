# Deployment Assumptions

Status: REPO-VISIBLE ASSUMPTIONS AND INFRA-VISIBLE UNKNOWNS.

This document distinguishes deploy-ready repo state from deployed infrastructure state. It does not verify Cloudflare account state, Worker version, secret values, or live endpoint health.

## Repo-Visible Deployment Readiness

- IMPLEMENTED: Cloudflare Worker shim exists at `deployments/cloudflare-worker/src/index.js`.
- IMPLEMENTED: `wrangler.toml` points to `src/index.js`.
- IMPLEMENTED: `wrangler.toml` sets `compatibility_date = "2024-09-23"`.
- IMPLEMENTED: non-secret Worker vars in repo are `KAMAY_SOURCE = "github"` and `KAMAY_REPO = "pmh242/kamay"`.
- IMPLEMENTED: Node server shim exists and defaults to port `8766`.

## Infra-Visible Deployment State

UNKNOWN unless checked outside repo:

- Whether the Worker is currently deployed.
- Which Worker version is active.
- Whether Worker secrets exist.
- Whether secret values match local signing/operator assumptions.
- Whether the configured GitHub token can read the configured private repo.
- Whether a public Worker URL is reachable from a given AI client.

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
- UNKNOWN: Cloudflare account, route, domain, and active deployment metadata.

## Local Artifacts

`.wrangler/` may exist locally from dry runs or `wrangler dev`. It is ignored/cache/build state and is not source truth. Do not infer live deployment state from `.wrangler/` artifacts.

## Deployment Verification Boundary

Repo inspection can verify deploy readiness. It cannot verify deployed state. Deployed state requires an explicit external check such as:

- `npx wrangler deployments list`
- a live `/health` request
- a live signed URL request
- Cloudflare dashboard or connector metadata
