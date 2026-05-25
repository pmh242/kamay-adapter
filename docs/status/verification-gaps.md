# Verification Gaps

Status: CURRENT KNOWN GAPS WITH LIVE VERIFICATION RESULT.

This document lists what is tested, what is live verified, what is assumed, and what remains unverified. It is intentionally conservative.

## Tested In Repo

- TESTED: `node --test "core/**/*.test.js"` passes in the current local environment.
- TESTED: header auth behavior through `core/index.js`.
- TESTED: signed GET URL auth behavior through `core/index.js`.
- TESTED: signed URL rejection for expired, over-max-TTL, tampered path/query, and POST requests.
- TESTED: GitHub backend conformance with mocked fetch responses.
- TESTED: GitHub base64 decode, missing path, batch path isolation, invalid SHA rejection, commit limit, patch truncation, and rate-limit parsing with mocks.

## Live Verified

Operator ran `node scripts/verify-live.js` after synchronizing ignored local `.env.local` with rotated Cloudflare Worker secrets.

- VERIFIED: live base URL `https://kamay-adapter.epix.workers.dev`.
- VERIFIED: verification runner status PASS.
- VERIFIED: Worker reachable.
- VERIFIED: unauthenticated requests are rejected.
- VERIFIED: header auth works.
- VERIFIED: signed GET works.
- VERIFIED: signed POST is rejected.
- VERIFIED: commit `22172acd0b44a0aba13cd1debd092b4ce29311e5` deployed to Worker version `b7932924-12f0-46b5-bd8d-cfa5f24b6e7e`.
- VERIFIED: backward-compatible signed GET works after deployment.
- VERIFIED: scoped signed capability GET works after deployment.
- VERIFIED: path-prefix mismatch rejects with `401 UNAUTHORIZED`.
- VERIFIED: operation mismatch rejects with `401 UNAUTHORIZED`.
- VERIFIED: ref mismatch rejects with `401 UNAUTHORIZED`.
- VERIFIED: GitHub backend read path works for commits/tree.
- VERIFIED: response envelope metadata is present.
- VERIFIED: request IDs are valid.
- VERIFIED: GitHub rate-limit metadata shape is present.
- VERIFIED: sanitized verification output only.
- VERIFIED: rollback was not needed for deployment `f37f499f-1646-4870-aa27-c74af3843a3f`.
- NOT RECORDED: secret values.
- LOCAL ONLY: `.env.local` is an ignored operator file.

## Still Not Verified

- UNVERIFIED: current Node server smoke startup in this baseline task.
- UNVERIFIED: Cloudflare runtime compatibility beyond prior local development evidence.
- UNVERIFIED: behavior of GitLab, Gitea, and local backends beyond registered stub shape.
- UNVERIFIED: MCP runtime because it is deferred and README-only.
- UNVERIFIED: custom domain/route if any.
- UNVERIFIED: long-term monitoring.
- UNVERIFIED: rollback execution; rollback target is recorded as `72818c9a-4b0a-4dd0-afab-851409982aab`.

## Assumed From Code

- ASSUMED: `globalThis.fetch` works in Worker and Node runtimes where GitHub backend is used.
- ASSUMED: Web Crypto HMAC behavior is compatible across Node 20+ and Cloudflare Workers.
- ASSUMED: GitHub API response shapes match the mocked fixtures for the implemented read operations.
- VERIFIED FOR LIVE RUNNER: `KAMAY_REPO` identifies a repo accessible to the configured `GITHUB_TOKEN` for commits/tree reads.

## Operational Unknowns

- UNKNOWN: whether one deployment per repo remains sufficient.
- UNKNOWN: whether Claude/ChatGPT/Codex workflows need a review bundle endpoint.
- UNKNOWN: whether signed capability URL replay risk justifies nonce storage.
- UNKNOWN: whether Cloudflare Access, WAF, or additional rate limiting is required.

## Verification To Add When Needed

- IMPLEMENTED / VERIFIED: live Worker smoke checklist via `node scripts/verify-live.js`.
- VERIFIED FOR COMMITS/TREE: real GitHub API permission check.
- PLANNED WHEN NEEDED: Node server smoke command in routine release validation.
- DEFERRED: integration tests for GitLab, Gitea, local filesystem, and MCP runtime.
