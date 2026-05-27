# kamay-adapter

Vendor-independent repository context bridge for AI systems.

- Read-only repository context over stable HTTP endpoints.
- Short-lived delegated capability URLs for AI clients that cannot send headers.
- Local diagnostics and evidence packets for operational proof without broad authority.

Status: v0.1.0 implements the GitHub RepositoryProvider backend. GitLab, Gitea,
and local filesystem backends are registered stubs. MCP is deferred.

## What It Is

`kamay-adapter` gives AI chatbots and coding agents controlled remote eyes on
repository state without depending on a single vendor connector. The adapter is
small by design: it exposes bounded repository context and leaves approval,
governance, execution, and product decisions outside the adapter.

It is not Kamay main, an orchestration engine, an autonomous runtime, a plugin
marketplace, or a write gateway.

## Why It Exists

Hosted AI repository connectors are inconsistent. Some cannot read private
repos, send custom headers, survive URL rewriting, pass host allowlists, or show
clear operational status.

Kamay Adapter provides a portable layer instead: a framework-free HTTP read API,
signed read-only delegation, and local verification artifacts an operator can
inspect before handing context to an AI system.

## Quickstart

Run the local test suite:

```powershell
npm test
```

Deploy or run a target runtime, then verify it locally:

```powershell
node scripts/diagnostics.js status
```

Build a redacted diagnostics export and evidence packet:

```powershell
node scripts/diagnostics.js export --out tmp/diagnostics/latest.json
node scripts/evidence.js build --diagnostics tmp/diagnostics/latest.json --out tmp/evidence/latest.json
```

Mint a delegated README capability URL for a human-approved AI handoff:

```powershell
node scripts/delegate-url.js readme --base-url <adapter-url>
```

Add `--print-url` only when you intentionally need to reveal the short-lived
bearer URL. See [Auth Model](docs/security/auth-model.md) and
[Install Contract](docs/infrastructure/install-contract.md) for full setup.

## Architecture Overview

```text
AI client / local agent
  |
  | HTTP, header auth, or signed GET capability URL
  v
kamay-adapter
  |
  | /health
  | /v1/repo/*
  v
RepositoryProvider
  |
  +-- github backend
  +-- gitlab backend (stub)
  +-- gitea backend (stub)
  +-- local backend (stub)
```

The core uses standard `Request`, `Response`, and `fetch` so Cloudflare Worker
and Node shims can adapt runtimes without framework coupling. Provider behavior
is tested through conformance rather than inheritance.

## Current Implementation Status

| Area | Status |
| --- | --- |
| RepositoryProvider HTTP API | Implemented and tested under `/v1/repo/*` |
| GitHub backend | Implemented and tested for health, capabilities, files, blobs, trees, commits, and diffs |
| GitLab, Gitea, local backends | Registered stubs returning `NOT_IMPLEMENTED` |
| Header auth | Implemented for operator and server-to-server requests |
| Signed capability URLs | Implemented, tested, deployed in prior verification, GET-only |
| Diagnostics | Implemented as local operator workflow |
| Evidence context | Implemented as local packet builder, not remote serving |
| Cloudflare Worker | Deployable target; deployed state must be verified separately |
| Node server | Local/simple self-host shim |
| MCP server | Deferred documentation-only target |

## Documentation

Understand:

- [Project Thesis](docs/architecture/thesis.md) - authoritative identity and non-goals.
- [Architecture Overview](docs/architecture/overview.md) - current core shape, request flow, and runtime shims.
- [Boundaries](docs/architecture/boundaries.md) - ownership boundaries and what the adapter must not absorb.

Operate:

- [Install Contract](docs/infrastructure/install-contract.md) - standalone and future Kamay integration lifecycle.
- [Auth Model](docs/security/auth-model.md) - header auth, signed URLs, and secret handling.
- [Diagnostics](docs/infrastructure/diagnostics.md) - local status and redacted bug-export workflow.
- [Evidence Context](docs/infrastructure/evidence-context.md) - portable local evidence packets.

Status and future:

- [Implementation Matrix](docs/status/implementation-matrix.md) - current status by subsystem.
- [Runtime Baseline](docs/status/runtime-baseline.md) - repo-visible runtime truth.
- [MVP Definition](docs/implementation/mvp-definition.md) - implemented, tested, deferred, and out-of-scope behavior.
- [vnext Roadmap](vnext/roadmap/vnext-roadmap.md) - non-authoritative future direction.

## Reference

### Deployment Targets

| Target | Status | Use case |
| --- | --- | --- |
| `cloudflare-worker` | Ready | Public stable URL for AI clients using URL fetch |
| `node-server` | Ready | Local smoke testing and simple self-hosting |
| `mcp-server` | Deferred | Future MCP tool surface |

### Cloudflare Deploy

```powershell
cd deployments/cloudflare-worker
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put KAMAY_TOKEN
npx wrangler secret put KAMAY_SIGNING_SECRET
npx wrangler deploy
```

### Configuration

| Name | Location | Required | Description |
| --- | --- | --- | --- |
| `KAMAY_TOKEN` | Secret | Yes | Shared bearer-style token required in `X-Kamay-Token` |
| `KAMAY_SIGNING_SECRET` | Secret | Yes for signed URLs | HMAC secret used to verify short-lived signed GET URLs |
| `GITHUB_TOKEN` | Secret | Yes for GitHub | GitHub token used for upstream API reads |
| `KAMAY_SOURCE` | Env var | No | Backend source. Defaults to `github` |
| `KAMAY_REPO` | Env var | Yes for GitHub | Repository slug such as `owner/name` |
| `PORT` | Node env var | No | Node server port. Defaults to `8766` |

### Signed Capability URLs

Signed capability URLs are secondary auth for AI clients that can fetch URLs but
cannot send custom headers. They are GET-only bearer credentials: anyone with
the URL can use it until it expires.

Compact `kmy_cap` URLs are preferred. Compact v2 is the default helper format;
compact v1 and legacy `kmy_expires` + `kmy_sig` URLs remain backward compatible.

Rules:

- Default TTL is 15 minutes.
- Maximum TTL is 30 minutes.
- Only GET requests can use signed URL auth.
- Capability scope is signature-bound and checked before backend access.
- If a signed URL is pasted into chat or logs, treat it as temporarily exposed.

### API Reference

All successful and error responses use the envelope shape documented below. All examples assume:

```http
X-Kamay-Token: kmy_dev_token
```

#### GET /health

```http
GET /health
```

```json
{
  "data": {
    "status": "ok",
    "provider": null,
    "backend": null,
    "apiVersion": "v1"
  },
  "meta": {
    "requestId": "kmy_l1a2b3c_8f3e4d5a",
    "apiVersion": "v1",
    "provider": null,
    "backend": null,
    "timestamp": "2024-09-23T00:00:00.000Z",
    "rateLimit": null
  }
}
```

#### GET /v1/repo/health

```http
GET /v1/repo/health
```

```json
{
  "data": {
    "status": "ok",
    "provider": "repository",
    "backend": "github",
    "repo": "pmh242/kamay",
    "apiVersion": "v1"
  },
  "meta": {
    "requestId": "kmy_l1a2b3c_8f3e4d5a",
    "apiVersion": "v1",
    "provider": "repository",
    "backend": "github",
    "timestamp": "2024-09-23T00:00:00.000Z",
    "rateLimit": {
      "source": "github",
      "remaining": 4999,
      "limit": 5000,
      "resetAt": "2024-09-23T01:00:00.000Z"
    }
  }
}
```

#### GET /v1/repo/capabilities

```http
GET /v1/repo/capabilities
```

```json
{
  "data": {
    "provider": "repository",
    "backend": "github",
    "apiVersion": "v1",
    "version": "0.1.0",
    "operations": {
      "health": { "supported": true },
      "capabilities": { "supported": true },
      "getFile": { "supported": true, "maxBytes": 1000000 },
      "getFiles": { "supported": true, "maxBatch": 50, "maxTotalBytes": 5000000 },
      "getBlob": { "supported": true, "maxBytes": 1000000 },
      "getTree": { "supported": true, "recursive": true, "maxEntries": 5000 },
      "getCommits": { "supported": true, "maxN": 30 },
      "getDiff": { "supported": true, "maxPatchBytes": 3000 }
    },
    "features": {
      "write": false,
      "search": false,
      "webhooks": false
    }
  },
  "meta": {
    "requestId": "kmy_l1a2b3c_8f3e4d5a",
    "apiVersion": "v1",
    "provider": "repository",
    "backend": "github",
    "timestamp": "2024-09-23T00:00:00.000Z",
    "rateLimit": null
  }
}
```

#### GET /v1/repo/file

```http
GET /v1/repo/file?path=README.md&ref=main
```

```json
{
  "data": {
    "path": "README.md",
    "ref": "main",
    "sha": "def4567890abcdef1234567890abcdef1234567",
    "size": 1024,
    "content": "# Kamay\n",
    "encoding": "utf-8"
  },
  "meta": {
    "requestId": "kmy_l1a2b3c_8f3e4d5a",
    "apiVersion": "v1",
    "provider": "repository",
    "backend": "github",
    "timestamp": "2024-09-23T00:00:00.000Z",
    "rateLimit": {
      "source": "github",
      "remaining": 4998,
      "limit": 5000,
      "resetAt": "2024-09-23T01:00:00.000Z"
    }
  }
}
```

#### GET /v1/repo/files

```http
GET /v1/repo/files?paths=README.md,AGENTS.md&ref=main
```

```json
{
  "data": {
    "ref": "main",
    "files": [
      {
        "ok": true,
        "path": "README.md",
        "ref": "main",
        "sha": "def4567890abcdef1234567890abcdef1234567",
        "size": 1024,
        "content": "# Kamay\n",
        "encoding": "utf-8"
      }
    ],
    "count": 1,
    "totalBytes": 1024
  },
  "meta": {
    "requestId": "kmy_l1a2b3c_8f3e4d5a",
    "apiVersion": "v1",
    "provider": "repository",
    "backend": "github",
    "timestamp": "2024-09-23T00:00:00.000Z",
    "rateLimit": {
      "source": "github",
      "remaining": 4997,
      "limit": 5000,
      "resetAt": "2024-09-23T01:00:00.000Z"
    }
  }
}
```

#### POST /v1/repo/files

```http
POST /v1/repo/files
Content-Type: application/json

{ "paths": ["README.md", "AGENTS.md"], "ref": "main" }
```

The response shape is the same as `GET /v1/repo/files`.

#### GET /v1/repo/blob/:sha

```http
GET /v1/repo/blob/def4567890abcdef1234567890abcdef1234567
```

```json
{
  "data": {
    "sha": "def4567890abcdef1234567890abcdef1234567",
    "size": 1024,
    "content": "# Kamay\n",
    "encoding": "utf-8"
  },
  "meta": {
    "requestId": "kmy_l1a2b3c_8f3e4d5a",
    "apiVersion": "v1",
    "provider": "repository",
    "backend": "github",
    "timestamp": "2024-09-23T00:00:00.000Z",
    "rateLimit": {
      "source": "github",
      "remaining": 4996,
      "limit": 5000,
      "resetAt": "2024-09-23T01:00:00.000Z"
    }
  }
}
```

#### GET /v1/repo/tree

```http
GET /v1/repo/tree?ref=main&path=core
```

```json
{
  "data": {
    "ref": "main",
    "sha": "abc1234",
    "fullSha": "abc1234567890abcdef1234567890abcdef1234",
    "files": [
      {
        "path": "core/index.js",
        "sha": "def4567890abcdef1234567890abcdef1234567",
        "size": 1200,
        "mode": "100644",
        "type": "blob"
      }
    ],
    "count": 1,
    "totalCount": 1,
    "truncated": false,
    "pagination": {
      "cursor": null,
      "hasMore": false
    }
  },
  "meta": {
    "requestId": "kmy_l1a2b3c_8f3e4d5a",
    "apiVersion": "v1",
    "provider": "repository",
    "backend": "github",
    "timestamp": "2024-09-23T00:00:00.000Z",
    "rateLimit": {
      "source": "github",
      "remaining": 4995,
      "limit": 5000,
      "resetAt": "2024-09-23T01:00:00.000Z"
    }
  }
}
```

#### GET /v1/repo/commits

```http
GET /v1/repo/commits?ref=main&n=10
```

```json
{
  "data": {
    "ref": "main",
    "commits": [
      {
        "sha": "abc1234567890abcdef1234567890abcdef1234",
        "message": "Initial",
        "date": "2024-09-23T00:00:00.000Z",
        "author": "Pat"
      }
    ],
    "count": 1,
    "pagination": {
      "cursor": null,
      "hasMore": false
    }
  },
  "meta": {
    "requestId": "kmy_l1a2b3c_8f3e4d5a",
    "apiVersion": "v1",
    "provider": "repository",
    "backend": "github",
    "timestamp": "2024-09-23T00:00:00.000Z",
    "rateLimit": {
      "source": "github",
      "remaining": 4994,
      "limit": 5000,
      "resetAt": "2024-09-23T01:00:00.000Z"
    }
  }
}
```

#### GET /v1/repo/diff

```http
GET /v1/repo/diff?sha=abc1234567890abcdef1234567890abcdef1234
```

```json
{
  "data": {
    "sha": "abc1234567890abcdef1234567890abcdef1234",
    "fullSha": "abc1234567890abcdef1234567890abcdef1234",
    "message": "Initial",
    "date": "2024-09-23T00:00:00.000Z",
    "author": "Pat",
    "files": [
      {
        "filename": "README.md",
        "status": "modified",
        "additions": 3,
        "deletions": 1,
        "changes": 4,
        "patch": "@@ -1 +1 @@\n",
        "patchTruncated": false
      }
    ],
    "stats": {
      "total": 4,
      "additions": 3,
      "deletions": 1
    }
  },
  "meta": {
    "requestId": "kmy_l1a2b3c_8f3e4d5a",
    "apiVersion": "v1",
    "provider": "repository",
    "backend": "github",
    "timestamp": "2024-09-23T00:00:00.000Z",
    "rateLimit": {
      "source": "github",
      "remaining": 4993,
      "limit": 5000,
      "resetAt": "2024-09-23T01:00:00.000Z"
    }
  }
}
```

### Envelope Shape

Success:

```json
{
  "data": {
    "status": "ok"
  },
  "meta": {
    "requestId": "kmy_l1a2b3c_8f3e4d5a",
    "apiVersion": "v1",
    "provider": "repository",
    "backend": "github",
    "timestamp": "2024-09-23T00:00:00.000Z",
    "rateLimit": {
      "source": "github",
      "remaining": 4999,
      "limit": 5000,
      "resetAt": "2024-09-23T01:00:00.000Z"
    }
  }
}
```

Error:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "path query parameter is required",
    "details": {
      "path": "/v1/repo/file"
    }
  },
  "meta": {
    "requestId": "kmy_l1a2b3c_8f3e4d5a",
    "apiVersion": "v1",
    "provider": "repository",
    "backend": "github",
    "timestamp": "2024-09-23T00:00:00.000Z",
    "rateLimit": null
  }
}
```

All JSON responses include:

```http
Content-Type: application/json; charset=utf-8
Cache-Control: no-store
```

### Error Code Catalog

| Code | HTTP | Meaning |
| --- | ---: | --- |
| `UNAUTHORIZED` | 401 | Missing or invalid `X-Kamay-Token`, or invalid signed URL |
| `FORBIDDEN` | 403 | Token valid but operation forbidden |
| `NOT_FOUND` | 404 | Path, ref, or SHA does not exist |
| `INVALID_REQUEST` | 400 | Malformed input |
| `NOT_IMPLEMENTED` | 501 | Backend does not support this operation |
| `UPSTREAM_ERROR` | 502 | Backend returned an error |
| `UPSTREAM_RATE_LIMITED` | 429 | Backend rate limit hit |
| `INTERNAL_ERROR` | 500 | Adapter itself failed |
| `TIMEOUT` | 504 | Backend took too long |
| `PAYLOAD_TOO_LARGE` | 413 | Response would exceed configured limits |

### Response Size Limits

| Limit | Value | Applies to |
| --- | ---: | --- |
| `MAX_BLOB_BYTES` | 1000000 | Single file/blob read |
| `MAX_BATCH_PATHS` | 50 | `/files` batch path count |
| `MAX_BATCH_BYTES` | 5000000 | `/files` total bytes |
| `MAX_DIFF_PATCH_BYTES` | 3000 | Per-file diff patch |
| `MAX_TREE_ENTRIES` | 5000 | `/tree` file results |
| `MAX_COMMITS` | 30 | `/commits` per request |

### Versioning Policy

The public API is URL-versioned. Repository routes live under `/v1/repo/*`; the top-level adapter health check is `/health`. Error codes and response envelope fields are part of the v1 contract. Messages, docs, and internal file organization may change without changing the URL version.

### Testing

```powershell
node --test "core/**/*.test.js"
```

The conformance suite enforces the RepositoryProvider operation catalog, capabilities identity, declared-supported methods, NOT_IMPLEMENTED behavior for unsupported operations, core behavior for health, file, commits, and tree reads, and both header and signed URL auth paths.

## Roadmap

Intentionally not in v0.1.0:

- Caching
- Write operations
- Search
- Embeddings
- Webhooks
- Queues
- Auth roles
- Websockets
- Multi-repo orchestration
- Implemented GitLab backend
- Implemented Gitea backend
- Implemented local filesystem backend
- MCP server runtime

## Relation to Kamay

`kamay-adapter` is separate from Kamay by design. It has a different release cadence, a different secrets surface, and a different deployment target. The adapter is agnostic of what is at `KAMAY_REPO`; `pmh242/kamay` is only the default Worker configuration for the first deployment.

## License

MIT, per `package.json`.
