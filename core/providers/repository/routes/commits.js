import { jsonSuccess } from "../../../services/envelope.js";

export async function commitsRoute(url, backend, ctx) {
  const data = await backend.getCommits(
    url.searchParams.get("ref"),
    url.searchParams.get("n")
  );
  ctx.rateLimit = backend.lastRateLimit ?? ctx.rateLimit ?? null;
  return jsonSuccess(data, ctx);
}
