# vnext Roadmap

Status: NON-AUTHORITATIVE FUTURE DIRECTION.

`vnext/` is not current operational truth. Use `docs/` for current behavior and constraints.

## Candidate Directions

- PLANNED: observe real Claude/ChatGPT/Codex review workflows using signed URLs.
- PLANNED: keep docs aligned with operational usage.
- DEFERRED: review bundle endpoint for bounded multi-file reviewer packets.
- DEFERRED: multi-repo allowlist if one deployment per repo becomes painful.
- DEFERRED: local filesystem backend for trusted local environments.
- DEFERRED: GitLab and Gitea backend implementations.
- DEFERRED: MCP server runtime when a concrete client workflow needs tools instead of HTTP.
- EXPERIMENTAL: one-time signed URLs using KV or Durable Objects.

## Guardrails

- Do not add write operations without a separate permission model.
- Do not add provider families before real usage justifies them.
- Do not make the adapter depend on Kamay runtime state.
- Do not add frameworks or runtime dependencies for convenience.
- Do not treat vnext ideas as approved implementation scope.

## Possible Review Bundle Shape

If repeated reviewer handoffs need many files, consider a read-only endpoint that returns a bounded tree plus selected files. It should be signed-url compatible, size-limited, and explicit about included paths.

This remains deferred until manual signed URLs prove too noisy.
