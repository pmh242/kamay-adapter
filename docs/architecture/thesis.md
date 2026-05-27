# Project Thesis

Status: CURRENT THESIS.

Kamay Adapter is a vendor-independent repository context bridge for AI chatbots
and coding agents.

It gives AI systems controlled remote eyes on repository state without relying
on a single vendor connector, granting master secrets to chat sessions, or
turning repository access into an orchestration platform.

## Core Claim

AI clients need stable, bounded, auditable access to repository context.
Vendor-hosted repository connectors and AI web fetch tools are inconsistent:
they differ in private repo support, header support, host allowlists, URL
handling, and operational visibility.

Kamay Adapter makes repository context available through a small, read-oriented
HTTP surface that can be called by different AI clients and runtimes.

## What It Is

- IMPLEMENTED: a framework-free HTTP read layer over a RepositoryProvider.
- IMPLEMENTED: a GitHub-backed repository reader for files, batches, blobs,
  trees, commits, diffs, health, and capabilities.
- IMPLEMENTED: stable JSON envelopes, request IDs, error codes, response size
  limits, and rate-limit metadata shape.
- IMPLEMENTED: header auth for operator and server-to-server use.
- IMPLEMENTED: signed capability URLs for short-lived delegated GET access.
- IMPLEMENTED: local verification, diagnostics, and redacted bug-export
  workflows for operational evidence.

The project is intentionally small. Its job is to expose bounded repository
context, not to decide what work should happen next.

## Why It Exists

Kamay Adapter exists because repository cognition should not depend on one
AI-vendor integration working correctly.

When a hosted connector cannot read a private repo, cannot send custom headers,
rewrites URLs, blocks a host, or hides operational details, the operator still
needs a portable way to hand scoped repository context to the AI system they
are using.

The adapter provides that portable layer:

- stable URLs
- read-only operations
- bounded delegation
- explicit verification
- diagnostics output that can be inspected locally

## How It Works

- IMPLEMENTED: `/health` reports adapter health.
- IMPLEMENTED: `/v1/repo/*` exposes the repository read API.
- IMPLEMENTED: `KAMAY_SOURCE` selects the backend, with `github` as the current
  implemented backend.
- IMPLEMENTED: `X-Kamay-Token` protects normal authenticated requests.
- IMPLEMENTED: `kmy_cap` signed capability URLs let clients without header
  support fetch bounded GET resources.
- IMPLEMENTED: local scripts verify live behavior and export redacted
  diagnostics without uploading data.

Cloudflare Worker and Node shims adapt runtimes to the same core. The core
remains standard `Request`, `Response`, and `fetch`.

## Operational Stance

- VERIFIED: local PowerShell and ChatGPT web have consumed delegated
  capability URLs.
- VERIFIED: live Worker behavior has been checked through sanitized local
  verification.
- VERIFIED: diagnostics can report live status without printing secrets or full
  bearer URLs.
- CURRENT: Claude web may be blocked by provider egress policy; this is not an
  adapter auth failure.

Operator-owned secrets remain outside chats and committed docs. Delegated URLs
are bearer credentials and should be short-lived, scoped, and regenerated when
needed.

## What It Is Not

- NOT A GOAL: a write gateway.
- NOT A GOAL: an autonomous agent runner.
- NOT A GOAL: a plugin marketplace.
- NOT A GOAL: an orchestration framework.
- NOT A GOAL: a telemetry or analytics platform.
- NOT A GOAL: a replacement for Kamay main.
- NOT A GOAL: Kamay's MCP kernel, memory, governance, contract engine, or local
  workspace authority.

Adapter output can inform a human, ChatGPT, Claude Code, Codex, or another AI
client. It does not approve work, mutate repositories, run commands, deploy
infrastructure, or decide product direction.

## Deferred

- DEFERRED: GitLab, Gitea, and local filesystem backend implementations.
- DEFERRED: MCP server runtime.
- DEFERRED: one-time signed capability URLs with stateful nonce storage.
- DEFERRED: review bundle endpoint for repeated multi-file handoffs.
- DEFERRED: multi-repo orchestration.

Deferred work remains future direction until a separate task contract approves
it.
