# MVP Definition

Status: IMPLEMENTED in repo unless marked otherwise. Deployed Worker state must be verified separately.

## MVP Purpose

The MVP is a read-only repository cognition adapter that lets AI clients fetch repository context through stable URLs.

## Implemented

- IMPLEMENTED: URL-versioned repository API under `/v1/repo/*`.
- IMPLEMENTED: unversioned adapter `/health`.
- IMPLEMENTED: stable JSON success/error envelopes.
- IMPLEMENTED: stable v1 error code catalog.
- IMPLEMENTED: request ID generation.
- IMPLEMENTED: header auth with `X-Kamay-Token`.
- IMPLEMENTED: GET-only signed URL auth for clients that cannot send headers.
- IMPLEMENTED: GitHub backend read operations.
- IMPLEMENTED: rate-limit metadata shape.
- IMPLEMENTED: Cloudflare Worker and Node server shims.
- IMPLEMENTED: MCP server placeholder README.

## Tested

- TESTED: GitHub backend conformance with mocked fetch.
- TESTED: header auth and signed URL auth through `core/index.js`.
- TESTED: size and count limit behavior covered by current tests where implemented.

## Deferred

- DEFERRED: GitLab backend implementation.
- DEFERRED: Gitea backend implementation.
- DEFERRED: local filesystem backend implementation.
- DEFERRED: MCP runtime.
- DEFERRED: multi-repo orchestration.
- DEFERRED: caching, search, write operations, webhooks, queues, embeddings, auth roles, and websockets.

## Out of Scope

The MVP does not execute agents, mutate repositories, manage Cloudflare secrets, create GitHub repositories, or interpret Kamay project state.
