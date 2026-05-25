# ADR 0001: Provider-Agnostic Core

Status: ACCEPTED

## Context

AI clients need a reliable way to read repository state even when vendor repository connectors fail or cannot access private repositories. The adapter must be usable by Claude, ChatGPT, Codex, and local tooling without coupling to one AI provider or one project.

## Decision

Keep the core provider-agnostic, framework-free, and based on standard web primitives:

- `Request`
- `Response`
- `fetch`
- URL-versioned routes
- stable JSON envelopes
- stable error codes

Repository access is modeled as a `RepositoryProvider` with backend implementations. GitHub is implemented first. GitLab, Gitea, and local filesystem are registered stubs.

## Consequences

- IMPLEMENTED: the same core can run behind Cloudflare Worker and Node shims.
- IMPLEMENTED: tests enforce behavior through conformance, not inheritance.
- IMPLEMENTED: auth and envelopes are adapter-wide services, not repository-specific code.
- DEFERRED: richer provider families wait until real usage proves the need.

## Non-Goals

- No framework adoption.
- No runtime dependencies.
- No provider taxonomy beyond RepositoryProvider in the current repo state.
- No Kamay-specific runtime assumptions.
