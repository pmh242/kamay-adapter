# Runtime Baseline

Status: CURRENT REPO-OBSERVED RUNTIME TRUTH.

This document describes code reality in the repository. It does not assert live Cloudflare deployment state, secret configuration, or real GitHub API reachability.

## Entry Points

- IMPLEMENTED: `core/index.js` exports `handle(request, env = {})`.
- IMPLEMENTED: `deployments/cloudflare-worker/src/index.js` passes Worker `(request, env)` into `handle`.
- IMPLEMENTED: `deployments/node-server/server.js` converts Node HTTP requests into standard `Request` objects and passes `process.env` into `handle`.
- DEFERRED: `deployments/mcp-server/` is README-only and has no runtime entrypoint.

## Request Flow

Repo-observed flow:

```text
runtime shim
  -> handle(request, env)
  -> request ID context
  -> auth decision
  -> router(request, env, ctx)
  -> repository route dispatcher
  -> backend method
  -> JSON envelope
```

`handle` catches thrown errors and returns a JSON error envelope. Non-`KamayError` exceptions are converted to `INTERNAL_ERROR`.

## Route Surface

IMPLEMENTED in code:

- `OPTIONS *`
- `GET /health`
- `GET /v1/repo/health`
- `GET /v1/repo/capabilities`
- `GET /v1/repo/file?path=<path>&ref=<ref>`
- `GET /v1/repo/files?paths=<csv>&ref=<ref>`
- `POST /v1/repo/files`
- `GET /v1/repo/blob/<sha>`
- `GET /v1/repo/tree?ref=<ref>&path=<filter>`
- `GET /v1/repo/commits?ref=<ref>&n=<count>`
- `GET /v1/repo/diff?sha=<sha>`

Any other route is expected to return `NOT_FOUND` through the envelope.

## Auth Flow

- IMPLEMENTED / TESTED: if `X-Kamay-Token` is present, header auth is attempted against `env.KAMAY_TOKEN`.
- IMPLEMENTED / TESTED: if signed URL params are present and no header token is present, signed URL auth is attempted against `env.KAMAY_SIGNING_SECRET`.
- IMPLEMENTED / TESTED: signed URL auth is GET-only.
- IMPLEMENTED / TESTED: missing auth returns `UNAUTHORIZED` when `KAMAY_TOKEN` is configured.
- ASSUMED: runtime environments provide Web Crypto APIs used by signed URL validation.

## Provider Backend State

- IMPLEMENTED / TESTED: `github` backend implements the RepositoryProvider read contract with mocked upstream tests.
- IMPLEMENTED: `gitlab`, `gitea`, and `local` backends are registered.
- DEFERRED: `gitlab`, `gitea`, and `local` backend operations throw `NOT_IMPLEMENTED`.
- IMPLEMENTED: `getRepositoryBackend(source, env)` selects the backend using `env.KAMAY_SOURCE`, defaulting to `github`.

## Envelope And Metadata

- IMPLEMENTED: all core responses use JSON envelopes.
- IMPLEMENTED: response metadata includes request ID, API version, provider, backend, timestamp, and rate-limit metadata.
- IMPLEMENTED / TESTED: GitHub rate-limit headers are parsed in mocked tests.
- ASSUMED: live GitHub responses include rate-limit headers compatible with current parser.
