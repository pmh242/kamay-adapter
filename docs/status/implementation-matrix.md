# Implementation Matrix

Status: CURRENT REPO STATE. Live deployment state must be verified separately.

| Area | Status | Notes |
| --- | --- | --- |
| Core request handling | IMPLEMENTED / TESTED | `handle(request, env)` creates context, auths, routes, wraps errors. |
| JSON envelope | IMPLEMENTED | Shared success/error shape with request ID and metadata. |
| Error catalog | IMPLEMENTED | Stable v1 codes live in `core/services/errors.js`. |
| Header auth | IMPLEMENTED / TESTED | `X-Kamay-Token`; runtime provides `KAMAY_TOKEN`. |
| Signed URL auth | IMPLEMENTED / TESTED | GET-only, `kmy_expires` + `kmy_sig`, 30 minute max TTL. |
| Request IDs | IMPLEMENTED | Generated at edge entrypoint. |
| Repository routes | IMPLEMENTED | `/v1/repo/*` dispatcher and route handlers. |
| GitHub backend | IMPLEMENTED / TESTED | Read operations covered by mocked conformance tests. |
| GitLab backend | DEFERRED | Registered stub returning `NOT_IMPLEMENTED`. |
| Gitea backend | DEFERRED | Registered stub returning `NOT_IMPLEMENTED`. |
| Local backend | DEFERRED | Registered stub returning `NOT_IMPLEMENTED`. |
| Cloudflare Worker shim | IMPLEMENTED | Intended/ready deployment target; live state not asserted here. |
| Node server shim | IMPLEMENTED | Local/simple HTTP shim. |
| MCP server | DEFERRED | README-only placeholder. |
| Runtime dependencies | VERIFIED | `package.json` has zero runtime dependencies. |
| Framework usage | VERIFIED | Core uses standard web primitives, no Express/Fastify/etc. |
| Multi-repo support | DEFERRED | Current model is one configured repo per deployment. |
