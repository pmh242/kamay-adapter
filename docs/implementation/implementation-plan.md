# Implementation Plan

Status: CURRENT OPERATIONAL PLAN. This is not a task queue.

## Completed Foundation

- IMPLEMENTED: repository skeleton and zero-dependency ES module package.
- IMPLEMENTED: core services for errors, envelopes, auth, signed URL verification, and request IDs.
- IMPLEMENTED: RepositoryProvider contracts and route dispatcher.
- IMPLEMENTED: GitHub backend and stub backends.
- IMPLEMENTED: Cloudflare Worker, Node server, and MCP placeholder deployments.
- IMPLEMENTED: native `node:test` coverage for backend conformance and auth behavior.

## Near-Term Useful Work

- PLANNED: use signed URLs in real Claude review loops and capture friction.
- PLANNED: keep docs aligned when operations or security posture changes.
- PLANNED: improve upstream diagnostic clarity only if operator debugging needs it.

## Work That Should Wait

- DEFERRED: review bundle endpoint until repeated multi-file Claude handoffs prove it is needed.
- DEFERRED: multi-repo support until one deployment per repo becomes painful.
- DEFERRED: one-time signed URL nonce storage until replay risk is real.
- DEFERRED: local FS, GitLab, and Gitea backends until there is a concrete consumer.

## Implementation Rules

- Keep runtime code framework-free.
- Keep package runtime dependencies at zero.
- Keep provider behavior in provider backends and routes.
- Keep docs concise and current.
- Verify deployed Worker state separately from repo state.
