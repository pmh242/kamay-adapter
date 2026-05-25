# Deployment Flow

Status: MANUAL OPERATOR FLOW.

## Deploy Worker

Run from the Worker deployment directory:

```powershell
cd C:\dev\sandbox\kamay-adapter\deployments\cloudflare-worker
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put KAMAY_TOKEN
npx wrangler secret put KAMAY_SIGNING_SECRET
npx wrangler deploy
```

The deploy command uploads the current local repo state. It does not prove GitHub token correctness or signed URL usability by itself.

## Verify Header Auth

Use `X-Kamay-Token` for operator or server-to-server checks:

```powershell
Invoke-RestMethod `
  -Headers @{ "X-Kamay-Token" = "<token>" } `
  -Uri "https://<worker-host>/v1/repo/capabilities"
```

## Generate Signed URL

Use signed URLs for clients that cannot send custom headers:

```powershell
cd C:\dev\sandbox\kamay-adapter
node scripts/sign-url.js "https://<worker-host>/v1/repo/file?path=README.md&ref=main" --ttl-seconds 1800
```

The signer can read ignored `.env.local`:

```text
KAMAY_SIGNING_SECRET=<same secret configured in Cloudflare>
```

## Verify Signed URL

```powershell
Invoke-RestMethod "<signed-url>"
```

Expected success is a JSON envelope with `data`. `UNAUTHORIZED` means the URL is expired, malformed, or signed with a different secret. `UPSTREAM_ERROR` means the adapter reached the backend but GitHub rejected or failed the request.
