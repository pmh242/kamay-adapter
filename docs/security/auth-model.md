# Auth Model

Status: IMPLEMENTED / TESTED in repo. Secret values and live Worker config are operator-managed.

## Goals

- Protect private repository reads.
- Support clients that can send headers.
- Support clients that can only fetch URLs.
- Keep signing and GitHub secrets out of chats, docs, and commits.

## Header Auth

Status: IMPLEMENTED / TESTED.

Header auth uses:

```http
X-Kamay-Token: <token>
```

The runtime injects `KAMAY_TOKEN`. Missing config returns `INTERNAL_ERROR`. Missing or invalid client token returns `UNAUTHORIZED`.

## Signed URL Auth

Status: IMPLEMENTED / TESTED.

Signed URL auth is secondary and GET-only. It uses:

- `kmy_expires`: Unix timestamp in seconds.
- `kmy_sig`: HMAC-SHA-256 signature over method, path, and sorted query string excluding `kmy_sig`.

Default TTL is 15 minutes. Maximum TTL is 30 minutes. Signed URLs are exact-request bearer URLs: anyone holding the URL can use it until expiry.

## Secrets

Operator-managed secrets:

- `KAMAY_TOKEN`: header auth shared secret.
- `KAMAY_SIGNING_SECRET`: HMAC secret for signed URL verification and local URL generation.
- `GITHUB_TOKEN`: backend credential for GitHub API reads.

Rules:

- Never commit `.env.local`.
- Never paste `KAMAY_SIGNING_SECRET` or `GITHUB_TOKEN` into reviewer chats.
- Paste signed URLs only when needed and regenerate them when expired.
- Rotate secrets if they are exposed.

## Known Risks

- Signed URLs may appear in chat logs or browser history.
- Signed URLs are replayable until expiry.
- GitHub PAT permissions are outside repo control.
- Deployed Worker state can drift from repo state if not verified after deploy.

## Deferred Hardening

- DEFERRED: one-time signed URL nonce storage.
- DEFERRED: route/path allowlists for generated review sessions.
- DEFERRED: Cloudflare Access or WAF-layer policies.
