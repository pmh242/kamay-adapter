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

## Signed Capability URL Auth

Status: IMPLEMENTED / TESTED.

Signed capability URL auth is secondary and GET-only. The preferred AI-web-client format uses:

- `kmy_cap`: compact bearer token containing a signed payload with route, query, expiry, and optional capability scope. Compact payload v2 uses short keys to reduce URL length; compact payload v1 remains accepted for backward compatibility.

The legacy exact-query format remains supported for backward compatibility:

- `kmy_expires`: Unix timestamp in seconds.
- `kmy_sig`: HMAC-SHA-256 signature over method, path, and sorted query string excluding `kmy_sig`.
- `kmy_cap_op`: optional delegated operation, such as `getFile` or `getTree`.
- `kmy_cap_path_prefix`: optional path prefix restriction for file, files, and tree reads.
- `kmy_cap_ref`: optional ref restriction.
- `kmy_cap_label`: optional local/operator label for audit context, not authorization identity.

Default TTL is 15 minutes. Maximum TTL is 30 minutes. Signed capability URLs are bearer URLs: anyone holding the URL can use it until expiry. Compact URLs reduce query-canonicalization risk for AI web fetch tools by keeping the delegated request inside the signed token. v2 compact URLs also reduce length by using route, query, and operation codes. Capability scope is covered by the signature and is validated before repository backend access.

Compatibility note:

- Local PowerShell and ChatGPT web have successfully consumed delegated capability URLs.
- Claude web sandbox has blocked the custom domain with `host_not_allowed`; this is provider egress policy, not adapter auth failure.
- Claude Code/local remains the recommended Claude path.
- Compact v2 reduces URL length but does not bypass provider allowlists.

Authority model:

- Operator authority: holds `KAMAY_TOKEN` and `KAMAY_SIGNING_SECRET`.
- Delegated capability: one short-lived signed GET URL.
- AI client capability: fetch only the exact delegated URL it receives.
- Adapter runtime authority: validate signature, expiry, method, route, and optional scope.
- Repository backend authority: bounded by the configured backend token, currently GitHub.

## Secrets

Operator-managed secrets:

- `KAMAY_TOKEN`: header auth shared secret.
- `KAMAY_SIGNING_SECRET`: HMAC secret for signed URL verification and local URL generation.
- `GITHUB_TOKEN`: backend credential for GitHub API reads.

Rules:

- Never commit `.env.local`.
- Never paste `KAMAY_SIGNING_SECRET` or `GITHUB_TOKEN` into reviewer chats.
- Paste signed capability URLs only when needed and regenerate them when expired.
- Rotate secrets if they are exposed.

## Known Risks

- Signed capability URLs may appear in chat logs or browser history.
- Signed capability URLs are replayable until expiry.
- GitHub PAT permissions are outside repo control.
- Deployed Worker state can drift from repo state if not verified after deploy.

## Deferred Hardening

- DEFERRED: one-time signed URL nonce storage.
- DEFERRED: Cloudflare Access or WAF-layer policies.
