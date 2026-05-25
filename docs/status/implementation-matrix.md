# Implementation Matrix

Status: CURRENT REPO STATE WITH TARGETED LIVE VERIFICATION.

Live verification was recorded from operator-run `node scripts/verify-live.js` and KAMAY-ADAPTER-DEPLOY-001-RUN against `https://kamay-adapter.epix.workers.dev`. Secret values and full signed URLs are not recorded.

Current verified Worker deployment:

- Commit: `22172acd0b44a0aba13cd1debd092b4ce29311e5`
- Version: `b7932924-12f0-46b5-bd8d-cfa5f24b6e7e`
- Deployment ID: `f37f499f-1646-4870-aa27-c74af3843a3f`
- Rollback needed: NO.

| Area | Status | Notes |
| --- | --- | --- |
| Core request handling | IMPLEMENTED / TESTED | `handle(request, env)` creates context, auths, routes, wraps errors. |
| JSON envelope | IMPLEMENTED | Shared success/error shape with request ID and metadata. |
| Error catalog | IMPLEMENTED | Stable v1 codes live in `core/services/errors.js`. |
| Header auth | IMPLEMENTED / TESTED / LIVE VERIFIED | `X-Kamay-Token`; runtime provides `KAMAY_TOKEN`. |
| Signed capability URL auth | IMPLEMENTED / TESTED / DEPLOYED / LIVE VERIFIED | GET-only, `kmy_expires` + `kmy_sig`, 30 minute max TTL. Optional operation, path-prefix, ref, and label capability params are signature-bound. Signed GET verified; signed POST rejection and mismatch rejections verified. |
| Request IDs | IMPLEMENTED | Generated at edge entrypoint. |
| Repository routes | IMPLEMENTED | `/v1/repo/*` dispatcher and route handlers. |
| GitHub backend | IMPLEMENTED / TESTED / LIVE VERIFIED | Read operations covered by mocked conformance tests. Live commits/tree reads verified. |
| GitLab backend | DEFERRED | Registered stub returning `NOT_IMPLEMENTED`. |
| Gitea backend | DEFERRED | Registered stub returning `NOT_IMPLEMENTED`. |
| Local backend | DEFERRED | Registered stub returning `NOT_IMPLEMENTED`. |
| Cloudflare Worker shim | IMPLEMENTED / DEPLOYED / LIVE VERIFIED | Worker reachable at `https://kamay-adapter.epix.workers.dev`; custom domain/route remains unverified. |
| Node server shim | IMPLEMENTED | Local/simple HTTP shim. |
| MCP server | DEFERRED | README-only placeholder. |
| Runtime dependencies | VERIFIED | `package.json` has zero runtime dependencies. |
| Framework usage | VERIFIED | Core uses standard web primitives, no Express/Fastify/etc. |
| Live verification runner | IMPLEMENTED / LIVE VERIFIED | `node scripts/verify-live.js` returned PASS with sanitized output. |
| Multi-repo support | DEFERRED | Current model is one configured repo per deployment. |
