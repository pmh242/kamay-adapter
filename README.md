# kamay-adapter

Provider-agnostic repository cognition substrate for AI systems.

## What this is

`kamay-adapter` is a small read layer that exposes repository context through stable HTTP endpoints. It exists so AI systems can fetch files, trees, commits, blobs, diffs, and capabilities without depending on one vendor's repository connector. v0.1.0 implements the RepositoryProvider taxonomy only. The core is framework-free and deployment-portable by design.

## Status

v0.1.0 is read-only. The GitHub backend implements all RepositoryProvider read operations. GitLab, Gitea, and local filesystem backends are registered but intentionally stubbed with `NOT_IMPLEMENTED` behavior. MCP is documented as a deferred deployment target.

## Documentation

- [Architecture overview](docs/architecture/overview.md) - current core shape, request flow, and runtime shims.
- [Boundaries](docs/architecture/boundaries.md) - what each layer owns and must not own.
- [MVP definition](docs/implementation/mvp-definition.md) - implemented, tested, deferred, and out-of-scope behavior.
- [Implementation matrix](docs/status/implementation-matrix.md) - current status by subsystem.
- [Install contract](docs/infrastructure/install-contract.md) - minimal standalone and future Kamay integration contract.
- [Diagnostics](docs/infrastructure/diagnostics.md) - local status and redacted bug-export workflow.
- [Auth model](docs/security/auth-model.md) - header auth, signed URLs, and secret handling.
- [vnext roadmap](vnext/roadmap/vnext-roadmap.md) - non-authoritative future direction.

## Architecture diagram

```text
AI clients
  |
  | web_fetch / HTTP
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

## Design philosophy

### Provider vs Service vs Subsystem

A provider is an external capability family with a stable consumer contract. In v0.1.0, the only provider is RepositoryProvider. A service is internal adapter machinery such as auth, envelope creation, error mapping, and request ID generation. A subsystem is an application-specific domain inside a consuming project; `kamay-adapter` does not model those.

### Why no abstract classes

The project tests behavior rather than inheritance. Backends prove compatibility by declaring capabilities and passing the conformance suite. This keeps the contract portable across plain JavaScript objects, runtime shims, and future transport layers.

### Why URL versioning

Consumers stick to URLs. The v1 contract lives under `/v1/repo/*` so clients can keep stable fetch targets while internal files and deployment targets evolve.

### Why pure functions, no framework

The core uses standard `Request`, `Response`, and `fetch` so it can run in Cloudflare Workers, Node, and future MCP shims with minimal glue. No framework means fewer runtime assumptions and no dependency surface in the adapter core.

## Deployment matrix

| Target | Status | Use case |
| --- | --- | --- |
| `cloudflare-worker` | Ready | Public stable URL for AI clients using `web_fetch` |
| `node-server` | Ready | Local smoke testing and simple self-hosting |
| `mcp-server` | Deferred | Phase 7 MCP tool surface for Claude Desktop and remote clients |

## Deploy guide

```powershell
cd deployments/cloudflare-worker
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put KAMAY_TOKEN
npx wrangler secret put KAMAY_SIGNING_SECRET
npx wrangler deploy
```

## Configuration reference

| Name | Location | Required | Description |
| --- | --- | --- | --- |
| `KAMAY_TOKEN` | Secret | Yes | Shared bearer-style token required in `X-Kamay-Token` |
| `KAMAY_SIGNING_SECRET` | Secret | Yes for signed URLs | HMAC secret used to verify short-lived signed GET URLs |
| `GITHUB_TOKEN` | Secret | Yes for GitHub | GitHub token used for upstream API reads |
| `KAMAY_SOURCE` | Env var | No | Backend source. Defaults to `github` |
| `KAMAY_REPO` | Env var | Yes for GitHub | Repository slug such as `pmh242/kamay` |
| `PORT` | Node env var | No | Node server port. Defaults to `8766` |

Generate a token:

```powershell
node -e "console.log(crypto.randomUUID() + crypto.randomUUID())"
```

Send it on every non-OPTIONS request:

```http
X-Kamay-Token: <token>
```

### Signed capability URL auth for Claude/web_fetch

Some AI clients can fetch URLs but cannot send custom headers. For those clients, generate a short-lived signed capability URL locally and paste the full URL into the client. Signed capability URLs are GET-only bearer credentials: anyone with the URL can use it until it expires.

Compact capability URLs are preferred for AI web clients because they keep the delegated request inside one opaque `kmy_cap` token. The default compact payload is v2, which uses short route, query, and scope keys to reduce URL length. The adapter still supports compact v1 and the legacy exact-query format for backward compatibility.

Compact URL parameter:

| Name | Description |
| --- | --- |
| `kmy_cap` | Base64url JSON payload plus HMAC signature. v2 payloads use short keys; v1 payloads use verbose JSON keys. |

Legacy signed URL parameters:

| Name | Description |
| --- | --- |
| `kmy_expires` | Unix timestamp in seconds. The adapter rejects expired URLs and URLs more than 30 minutes in the future. |
| `kmy_sig` | Base64url HMAC-SHA-256 signature over the method, path, and sorted query string. |
| `kmy_cap_op` | Optional operation restriction, such as `getFile` or `getTree`. |
| `kmy_cap_path_prefix` | Optional path prefix restriction for file, files, and tree reads. |
| `kmy_cap_ref` | Optional ref restriction. |
| `kmy_cap_label` | Optional operator label. Not an identity or authorization source. |

Generate a signed URL:

```powershell
cd C:\dev\sandbox\kamay-adapter
$env:KAMAY_SIGNING_SECRET = "<same secret configured in Cloudflare>"
node scripts/sign-url.js "https://adapter.pedroh.dev/v1/repo/file?path=README.md&ref=main" --compact --operation getFile --path-prefix README.md --ref main
```

For common ChatGPT/Claude handoffs, use the delegated URL preset helper. By default it prints only sanitized metadata; add `--print-url` when you are ready to paste the bearer URL into the AI client.

```powershell
node scripts/delegate-url.js readme --base-url https://adapter.pedroh.dev --print-url
node scripts/delegate-url.js docs-tree --base-url https://adapter.pedroh.dev --print-url
node scripts/delegate-url.js commits --base-url https://adapter.pedroh.dev --n 10 --print-url
```

Add `--label <value>` only when you want optional audit metadata in the signed payload. Add `--compact-v1` to mint the previous verbose compact format, or `--legacy` to mint the older exact-query signed URL format.

For repeated local use, create ignored file `.env.local` in the repo root:

```text
KAMAY_SIGNING_SECRET=<same secret configured in Cloudflare>
```

Then run the signer without setting the environment variable each time:

```powershell
node scripts/sign-url.js "https://adapter.pedroh.dev/v1/repo/file?path=README.md&ref=main" --compact --ttl-seconds 1800
```

Optional TTL:

```powershell
node scripts/sign-url.js "https://adapter.pedroh.dev/v1/repo/commits?ref=main&n=10" --compact --ttl-seconds 1800
```

Rules:

- Default TTL is 15 minutes.
- Maximum TTL is 30 minutes.
- Only GET requests can use signed URL auth.
- Compact URLs bind the signature to the token payload: route, query, expiry, and optional scope.
- Compact v2 is shorter than compact v1 and is the default for local helper scripts.
- Legacy signed URLs bind the signature to the exact path and query parameters.
- Optional capability scope is signature-bound and checked before backend access.
- If a signed URL is pasted into chat or logs, treat it as temporarily exposed.

## API reference

All successful and error responses use the envelope shape documented below. All examples assume:

```http
X-Kamay-Token: kmy_dev_token
```

### GET /health

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

### GET /v1/repo/health

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

### GET /v1/repo/capabilities

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

### GET /v1/repo/file

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

### GET /v1/repo/files

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

### POST /v1/repo/files

```http
POST /v1/repo/files
Content-Type: application/json

{ "paths": ["README.md", "AGENTS.md"], "ref": "main" }
```

The response shape is the same as `GET /v1/repo/files`.

### GET /v1/repo/blob/:sha

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

### GET /v1/repo/tree

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

### GET /v1/repo/commits

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

### GET /v1/repo/diff

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

## Envelope shape

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

## Error code catalog

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

## Response size limits

| Limit | Value | Applies to |
| --- | ---: | --- |
| `MAX_BLOB_BYTES` | 1000000 | Single file/blob read |
| `MAX_BATCH_PATHS` | 50 | `/files` batch path count |
| `MAX_BATCH_BYTES` | 5000000 | `/files` total bytes |
| `MAX_DIFF_PATCH_BYTES` | 3000 | Per-file diff patch |
| `MAX_TREE_ENTRIES` | 5000 | `/tree` file results |
| `MAX_COMMITS` | 30 | `/commits` per request |

## Versioning policy

The public API is URL-versioned. Repository routes live under `/v1/repo/*`; the top-level adapter health check is `/health`. Error codes and response envelope fields are part of the v1 contract. Messages, docs, and internal file organization may change without changing the URL version.

## Testing

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
