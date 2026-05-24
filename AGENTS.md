# AGENTS.md - kamay-adapter

## Project

`kamay-adapter` is a provider-agnostic repository cognition substrate for AI
systems. v0.1.0 exposes a read-only RepositoryProvider over stable HTTP
endpoints so any AI client can fetch repository context without relying on a
single vendor connector. The adapter is agnostic by design: it does not know or
care what application lives at `KAMAY_REPO`. This repo has its own release
cadence, secret surface, and deployment target.

## Stack

- Runtime: Node 20+, Cloudflare Workers
- Language: JavaScript (ES modules)
- Tests: native node:test, no framework
- Deps: zero runtime dependencies
- Lint/format: none enforced in v0.1.0

## Layout

```text
core/
  index.js                         Edge entrypoint: request ID, auth, errors.
  router.js                        Top-level HTTP routing.
  services/                        Auth, envelopes, errors, request IDs.
  providers/repository/contracts/  Provider limits, capabilities, tests.
  providers/repository/backends/   GitHub backend, stubs, registry.
  providers/repository/routes/     Pure route handlers for /v1/repo/*.
deployments/
  cloudflare-worker/               Worker shim and wrangler config.
  node-server/                     Small Node HTTP shim.
  mcp-server/                      Deferred MCP deployment notes.
```

## Test commands

- `node --test "core/**/*.test.js"` - full suite
- `node --test core/providers/repository/backends/github.test.js` - github only
- `node --check <file>` - syntax check single file

## Rules

Durable rules override only with an explicit task contract.

- No framework. Pure Request/Response/fetch only.
- No runtime dependencies in package.json.
- Core never reads env directly. Env is injected from runtime shims.
- Routes are pure functions.
- No abstract classes. Conformance is via contract.test.js.
- URL versioning uses `/v1/repo/*`.
- Versioning is at the URL, not the filesystem.
- Stable error codes are part of the v1 contract.
- Error messages may change; error codes should not.
- ISO 8601 UTC timestamps only.
- Request IDs are generated at the edge in `core/index.js`.
- Request IDs must be propagated through `ctx`.
- Rate limit metadata belongs in every response meta.
- GitHub rate-limit headers are parsed by the backend.
- Stub backend rate limit metadata uses the null shape.
- `X-Kamay-Token` auth is validated before route dispatch.
- Signed URL auth is secondary, GET-only, short-lived, and exact-request.
- Signed URLs use `kmy_expires` and `kmy_sig`.
- Signed URL TTL defaults to 15 minutes and must not exceed 30 minutes.
- Signed URL helpers must not add runtime dependencies.
- Do not add a public signing endpoint unless explicitly requested.
- Runtime shims read `KAMAY_TOKEN`; core receives it through env.
- Runtime shims read `KAMAY_SIGNING_SECRET`; core receives it through env.
- Provider taxonomy is RepositoryProvider only.
- Do not add task, memory, execution, or environment provider folders.
- Stub backends do not get implemented unless a task contract explicitly asks.
- GitLab, Gitea, and local backends remain NOT_IMPLEMENTED in v0.1.0.
- Do not add TypeScript or transpilation.
- Do not add ESLint, Prettier, or tooling config unless explicitly requested.
- Do not add GitHub Actions or CI config unless explicitly requested.
- Do not deploy Cloudflare from routine code tasks.
- Do not configure secrets from routine code tasks.

## Out of scope

Until explicitly requested, do not add:

- Caching
- Write operations
- Search
- Embeddings
- Webhooks
- Queues
- Auth roles
- Websockets
- Multi-repo orchestration

## Relation to Kamay

This is a separate repo by design. It has a different release cadence, a
different secrets surface, and a different deployment target. The adapter is
agnostic of what is at `KAMAY_REPO`; `pmh242/kamay` is just the default
Cloudflare Worker configuration for v0.1.0.
