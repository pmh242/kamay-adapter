import { ERROR_CODES, KamayError } from "../../../services/errors.js";
import { healthRoute } from "./health.js";
import { capabilitiesRoute } from "./capabilities.js";
import { fileRoute } from "./file.js";
import { filesRoute } from "./files.js";
import { blobRoute } from "./blob.js";
import { treeRoute } from "./tree.js";
import { commitsRoute } from "./commits.js";
import { diffRoute } from "./diff.js";

export async function routeRepository(url, backend, ctx, request) {
  if (request.method === "GET" && url.pathname === "/v1/repo/health") {
    return healthRoute(url, backend, ctx, request);
  }
  if (request.method === "GET" && url.pathname === "/v1/repo/capabilities") {
    return capabilitiesRoute(url, backend, ctx, request);
  }
  if (request.method === "GET" && url.pathname === "/v1/repo/file") {
    return fileRoute(url, backend, ctx, request);
  }
  if ((request.method === "GET" || request.method === "POST") && url.pathname === "/v1/repo/files") {
    return filesRoute(url, backend, ctx, request);
  }
  if (request.method === "GET" && url.pathname.startsWith("/v1/repo/blob/")) {
    return blobRoute(url, backend, ctx, request);
  }
  if (request.method === "GET" && url.pathname === "/v1/repo/tree") {
    return treeRoute(url, backend, ctx, request);
  }
  if (request.method === "GET" && url.pathname === "/v1/repo/commits") {
    return commitsRoute(url, backend, ctx, request);
  }
  if (request.method === "GET" && url.pathname === "/v1/repo/diff") {
    return diffRoute(url, backend, ctx, request);
  }
  throw new KamayError(ERROR_CODES.NOT_FOUND, "Route not found", {
    method: request.method,
    path: url.pathname
  });
}
