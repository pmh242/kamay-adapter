# Architecture Overview

Status: IMPLEMENTED in repo. Runtime deployment state must be verified separately from repo state.

`kamay-adapter` is a provider-agnostic, read-only repository cognition adapter. It exposes a stable HTTP API that AI clients can call without depending on a vendor-specific repository connector.

```text
Claude / ChatGPT / Codex
        |
        v
Kamay Adapter HTTP endpoint
        |
        v
RepositoryProvider
        |
        +-- GitHub backend
        +-- GitLab backend (stub)
        +-- Gitea backend (stub)
        +-- local backend (stub)
```

## Current Repo Shape

- IMPLEMENTED: `core/` contains framework-free request handling, auth, envelopes, errors, request IDs, routes, contracts, and backends.
- IMPLEMENTED: `deployments/cloudflare-worker/` is the intended/ready Worker deployment target.
- IMPLEMENTED: `deployments/node-server/` is a small local/simple Node shim.
- DEFERRED: `deployments/mcp-server/` is documentation-only.

## Request Flow

1. Runtime shim receives a standard `Request`.
2. `core/index.js` creates a request ID and validates auth.
3. `core/router.js` routes `/health` or `/v1/repo/*`.
4. Repository routes call a backend selected by `KAMAY_SOURCE`.
5. Responses are wrapped in the shared envelope with metadata and rate-limit shape.

## Current Provider Scope

- IMPLEMENTED: RepositoryProvider taxonomy.
- IMPLEMENTED: GitHub backend read operations.
- IMPLEMENTED: GitLab, Gitea, and local backends as explicit `NOT_IMPLEMENTED` stubs.
- DEFERRED: task, memory, execution, environment, write, search, webhook, queue, and embedding provider families.

## Deployment Reality

The repository contains deployable Worker code and manual deployment instructions. It does not prove that any public Worker URL is currently deployed, healthy, or configured with valid secrets. Deployed Worker state must be verified separately with operator commands or live HTTP checks.
