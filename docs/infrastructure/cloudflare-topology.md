# Cloudflare Topology

Status: REPO READY. Deployed Worker state must be verified separately from repo state.

## Intended Topology

```text
AI client or operator
        |
        v
Cloudflare Worker
        |
        v
core/index.js
        |
        v
GitHub API or future backend
```

## Repo Components

- IMPLEMENTED: `deployments/cloudflare-worker/src/index.js` imports `handle` and passes `(request, env)`.
- IMPLEMENTED: `deployments/cloudflare-worker/wrangler.toml` declares Worker name, main file, compatibility date, and non-secret vars.
- IMPLEMENTED: core uses env passed by the Worker shim.

## Bindings

Non-secret vars in repo:

- `KAMAY_SOURCE`
- `KAMAY_REPO`

Secrets expected outside repo:

- `KAMAY_TOKEN`
- `GITHUB_TOKEN`
- `KAMAY_SIGNING_SECRET`

## Deployment Verification

Do not infer live deployment state from repo contents. Verify separately with:

- `npx wrangler deployments list`
- live `/health` or signed URL requests
- Cloudflare dashboard or connector metadata when available

## Not Managed Here

- Cloudflare account ownership.
- Secret values.
- GitHub PAT creation.
- Domain routing beyond the Worker target.
- Production monitoring.
