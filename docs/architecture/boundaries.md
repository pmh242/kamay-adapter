# Architecture Boundaries

Status: IMPLEMENTED as repo rules. This document describes intended ownership boundaries.

## Core

`core/` owns provider-agnostic behavior:

- IMPLEMENTED: standard `Request`/`Response` handling.
- IMPLEMENTED: auth decisions.
- IMPLEMENTED: stable error codes.
- IMPLEMENTED: response envelopes.
- IMPLEMENTED: repository provider routing.

Core must not read process or Worker globals for configuration directly. Runtime shims inject env-like objects.

## Deployments

`deployments/` owns runtime adaptation only:

- Cloudflare Worker shim passes `(request, env)` into `handle`.
- Node server converts Node HTTP requests into standard `Request`.
- MCP server remains deferred documentation.

Deployment shims must stay thin. They must not implement provider behavior, auth policy, or route business logic.

## Repository Provider

`core/providers/repository/` owns the v1 repository read contract:

- routes map URLs to backend operations.
- contracts describe capabilities, limits, rate-limit metadata, and conformance.
- backends adapt external systems to the same return shapes.

GitHub is the only implemented backend. Stub backends must remain explicit and boring until a task contract asks to implement them.

## Adapter vs Kamay

Status: CURRENT DESIGN INTENT.

The adapter is not coupled to Kamay runtime state, `.kamay` folders, or Kamay being installed. `KAMAY_REPO=pmh242/kamay` is configuration, not a hard dependency.

The [Project Thesis](thesis.md) defines Adapter identity. It does not expand Adapter into Kamay main, orchestration, marketplace, autonomous execution, or write authority.

In the Kamay ecosystem, Kamay main owns local OS/kernel responsibilities: local workspace authority, governance, memory, contract interpretation, and MCP/kernel orchestration. Kamay Adapter owns remote repository context exposure: a safe, read-only driver/delegation layer that lets AI systems ask for repository files, trees, commits, blobs, and diffs through protocol boundaries.

Kamay Adapter must not absorb Kamay's MCP kernel, memory system, governance model, contract engine, or local workspace authority. Kamay must not depend on adapter internals. Integration should happen through stable HTTP/API contracts and explicit configuration, not shared mutable runtime state.

Kamay-X projects should remain isolated capabilities, apps, drivers, or integrations. They may depend on explicit contracts, but they should not blur the boundary between Kamay main, Kamay Adapter, and external provider-specific capabilities.

## Documentation

`docs/` is current operational truth. `vnext/` is non-authoritative future direction. If they conflict, prefer `docs/` and update `vnext/` later.
