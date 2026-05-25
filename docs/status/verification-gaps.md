# Verification Gaps

Status: CURRENT KNOWN GAPS.

This document lists what is tested, what is assumed, and what remains unverified. It is intentionally conservative.

## Tested In Repo

- TESTED: `node --test "core/**/*.test.js"` passes in the current local environment.
- TESTED: header auth behavior through `core/index.js`.
- TESTED: signed GET URL auth behavior through `core/index.js`.
- TESTED: signed URL rejection for expired, over-max-TTL, tampered path/query, and POST requests.
- TESTED: GitHub backend conformance with mocked fetch responses.
- TESTED: GitHub base64 decode, missing path, batch path isolation, invalid SHA rejection, commit limit, patch truncation, and rate-limit parsing with mocks.

## Not Verified By Current Tests

- UNVERIFIED: live Cloudflare Worker deployment state.
- UNVERIFIED: active Worker version.
- UNVERIFIED: actual Worker bindings and secret values.
- UNVERIFIED: real GitHub PAT permissions.
- UNVERIFIED: live GitHub API success against `KAMAY_REPO`.
- UNVERIFIED: signed URL behavior against a live Worker in this baseline task.
- UNVERIFIED: current Node server smoke startup in this baseline task.
- UNVERIFIED: Cloudflare runtime compatibility beyond prior local development evidence.
- UNVERIFIED: behavior of GitLab, Gitea, and local backends beyond registered stub shape.
- UNVERIFIED: MCP runtime because it is deferred and README-only.

## Assumed From Code

- ASSUMED: `globalThis.fetch` works in Worker and Node runtimes where GitHub backend is used.
- ASSUMED: Web Crypto HMAC behavior is compatible across Node 20+ and Cloudflare Workers.
- ASSUMED: GitHub API response shapes match the mocked fixtures for the implemented read operations.
- ASSUMED: `KAMAY_REPO` identifies a repo accessible to the configured `GITHUB_TOKEN`.

## Operational Unknowns

- UNKNOWN: whether one deployment per repo remains sufficient.
- UNKNOWN: whether Claude/ChatGPT/Codex workflows need a review bundle endpoint.
- UNKNOWN: whether signed URL replay risk justifies nonce storage.
- UNKNOWN: whether Cloudflare Access, WAF, or additional rate limiting is required.

## Verification To Add When Needed

- PLANNED WHEN NEEDED: live Worker smoke checklist.
- PLANNED WHEN NEEDED: real GitHub API permission check.
- PLANNED WHEN NEEDED: Node server smoke command in routine release validation.
- DEFERRED: integration tests for GitLab, Gitea, local filesystem, and MCP runtime.
