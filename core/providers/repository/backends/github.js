import { buildRepositoryCapabilities } from "../contracts/capabilities.js";
import { LIMITS } from "../contracts/limits.js";
import { parseGitHubRateLimit } from "../contracts/rate-limit.js";
import { ERROR_CODES, KamayError } from "../../../services/errors.js";

const SHA_RE = /^[a-f0-9]{4,40}$/i;

export class GitHubBackend {
  constructor({ repo, token, fetchImpl } = {}) {
    if (!repo) {
      throw new KamayError(ERROR_CODES.INTERNAL_ERROR, "GitHub backend missing repo");
    }
    if (!token) {
      throw new KamayError(ERROR_CODES.INTERNAL_ERROR, "GitHub backend missing token");
    }
    this.source = "github";
    this.repo = repo;
    this.token = token;
    this.fetchImpl = fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
    this.lastRateLimit = null;
  }

  async health() {
    const repo = await this.#request(`/repos/${this.repo}`);
    return {
      status: "ok",
      provider: "repository",
      backend: "github",
      repo: repo.full_name ?? this.repo,
      apiVersion: "v1"
    };
  }

  async capabilities() {
    return buildRepositoryCapabilities("github");
  }

  async getFile(path, ref) {
    validatePath(path);
    const query = ref ? `?ref=${encodeURIComponent(ref)}` : "";
    const file = await this.#request(`/repos/${this.repo}/contents/${encodePath(path)}${query}`);
    if (file.type && file.type !== "file") {
      throw new KamayError(ERROR_CODES.INVALID_REQUEST, "Path is not a file", { path });
    }
    const content = decodeBase64(file.content ?? "");
    const size = file.size ?? byteLength(content);
    enforceLimit(size, LIMITS.MAX_BLOB_BYTES, "MAX_BLOB_BYTES");
    return {
      path: file.path ?? path,
      ref: ref ?? null,
      sha: file.sha,
      size,
      content,
      encoding: "utf-8"
    };
  }

  async getFiles(paths, ref) {
    if (!Array.isArray(paths) || paths.length === 0) {
      throw new KamayError(ERROR_CODES.INVALID_REQUEST, "paths must be a non-empty array");
    }
    if (paths.length > LIMITS.MAX_BATCH_PATHS) {
      throw new KamayError(ERROR_CODES.PAYLOAD_TOO_LARGE, "Too many paths requested", {
        actual: paths.length,
        limit: LIMITS.MAX_BATCH_PATHS
      });
    }
    const files = [];
    let totalBytes = 0;
    for (const path of paths) {
      try {
        const file = await this.getFile(path, ref);
        totalBytes += file.size;
        if (totalBytes > LIMITS.MAX_BATCH_BYTES) {
          throw new KamayError(ERROR_CODES.PAYLOAD_TOO_LARGE, "Batch response too large", {
            actual: totalBytes,
            limit: LIMITS.MAX_BATCH_BYTES
          });
        }
        files.push({ ok: true, ...file });
      } catch (error) {
        if (error instanceof KamayError && error.code === ERROR_CODES.PAYLOAD_TOO_LARGE) {
          throw error;
        }
        files.push({
          path,
          ok: false,
          error: {
            code: error instanceof KamayError ? error.code : ERROR_CODES.INTERNAL_ERROR,
            message: error instanceof Error ? error.message : "Unknown error"
          }
        });
      }
    }
    return {
      ref: ref ?? null,
      files,
      count: files.length,
      totalBytes
    };
  }

  async getBlob(sha) {
    validateSha(sha);
    const blob = await this.#request(`/repos/${this.repo}/git/blobs/${sha}`);
    const content = decodeBase64(blob.content ?? "");
    const size = blob.size ?? byteLength(content);
    enforceLimit(size, LIMITS.MAX_BLOB_BYTES, "MAX_BLOB_BYTES");
    return {
      sha: blob.sha ?? sha,
      size,
      content,
      encoding: "utf-8"
    };
  }

  async getTree(ref, filterPath) {
    const resolved = await this.#resolveRef(ref);
    const tree = await this.#request(`/repos/${this.repo}/git/trees/${resolved.sha}?recursive=1`);
    const entries = Array.isArray(tree.tree) ? tree.tree : [];
    const filtered = filterPath
      ? entries.filter((entry) => entry.path === filterPath || entry.path.startsWith(`${filterPath}/`))
      : entries;
    const totalCount = filtered.filter((entry) => entry.type === "blob").length;
    if (totalCount > LIMITS.MAX_TREE_ENTRIES) {
      throw new KamayError(ERROR_CODES.PAYLOAD_TOO_LARGE, "Tree response has too many entries", {
        actual: totalCount,
        limit: LIMITS.MAX_TREE_ENTRIES
      });
    }
    const files = filtered
      .filter((entry) => entry.type === "blob")
      .slice(0, LIMITS.MAX_TREE_ENTRIES)
      .map((entry) => ({
        path: entry.path,
        sha: entry.sha,
        size: entry.size ?? null,
        mode: entry.mode,
        type: entry.type
      }));
    return {
      ref: ref ?? "HEAD",
      sha: resolved.shortSha,
      fullSha: resolved.sha,
      files,
      count: files.length,
      totalCount,
      truncated: Boolean(tree.truncated) || totalCount > LIMITS.MAX_TREE_ENTRIES,
      pagination: { cursor: null, hasMore: totalCount > files.length }
    };
  }

  async getCommits(ref, n) {
    const count = Number.parseInt(n ?? LIMITS.MAX_COMMITS, 10);
    if (Number.isNaN(count) || count < 1) {
      throw new KamayError(ERROR_CODES.INVALID_REQUEST, "n must be a positive integer");
    }
    if (count > LIMITS.MAX_COMMITS) {
      throw new KamayError(ERROR_CODES.PAYLOAD_TOO_LARGE, "Too many commits requested", {
        actual: count,
        limit: LIMITS.MAX_COMMITS
      });
    }
    const perPage = count;
    const query = new URLSearchParams({ per_page: String(perPage) });
    if (ref) {
      query.set("sha", ref);
    }
    const commits = await this.#request(`/repos/${this.repo}/commits?${query}`);
    const list = Array.isArray(commits) ? commits : [];
    return {
      ref: ref ?? null,
      commits: list.map((item) => ({
        sha: item.sha,
        message: item.commit?.message ?? "",
        date: item.commit?.committer?.date ?? item.commit?.author?.date ?? null,
        author: item.commit?.author?.name ?? item.author?.login ?? null
      })),
      count: list.length,
      pagination: { cursor: null, hasMore: list.length === perPage && count > perPage }
    };
  }

  async getDiff(sha) {
    validateSha(sha);
    const commit = await this.#request(`/repos/${this.repo}/commits/${sha}`);
    const files = (commit.files ?? []).map((file) => {
      const patch = file.patch ?? "";
      const truncated = patch.length > LIMITS.MAX_DIFF_PATCH_BYTES;
      return {
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        changes: file.changes,
        patch: truncated ? patch.slice(0, LIMITS.MAX_DIFF_PATCH_BYTES) : patch,
        patchTruncated: truncated
      };
    });
    return {
      sha,
      fullSha: commit.sha ?? sha,
      message: commit.commit?.message ?? "",
      date: commit.commit?.committer?.date ?? commit.commit?.author?.date ?? null,
      author: commit.commit?.author?.name ?? commit.author?.login ?? null,
      files,
      stats: commit.stats ?? { total: 0, additions: 0, deletions: 0 }
    };
  }

  async #resolveRef(ref) {
    if (!ref || SHA_RE.test(ref)) {
      const sha = ref ?? "HEAD";
      return { sha, shortSha: sha.slice(0, 7) };
    }
    const refData = await this.#request(`/repos/${this.repo}/git/ref/heads/${encodeURIComponent(ref)}`);
    const sha = refData.object?.sha;
    if (!sha) {
      throw new KamayError(ERROR_CODES.NOT_FOUND, "Ref not found", { ref });
    }
    return { sha, shortSha: sha.slice(0, 7) };
  }

  async #request(path) {
    const response = await this.fetchImpl(`https://api.github.com${path}`, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${this.token}`,
        "User-Agent": "kamay-adapter/0.1.0"
      }
    });
    this.lastRateLimit = parseGitHubRateLimit(response.headers);
    if (response.status === 404) {
      throw new KamayError(ERROR_CODES.NOT_FOUND, "GitHub resource not found", { path });
    }
    if (response.status === 403 || response.status === 429) {
      throw new KamayError(ERROR_CODES.UPSTREAM_RATE_LIMITED, "GitHub rate limit hit", { path });
    }
    if (!response.ok) {
      throw new KamayError(ERROR_CODES.UPSTREAM_ERROR, "GitHub upstream error", {
        status: response.status,
        path
      });
    }
    return response.json();
  }
}

function decodeBase64(value) {
  return atob(String(value).replace(/\s+/g, ""));
}

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

function encodePath(path) {
  return String(path).split("/").map(encodeURIComponent).join("/");
}

function enforceLimit(actual, limit, name) {
  if (actual > limit) {
    throw new KamayError(ERROR_CODES.PAYLOAD_TOO_LARGE, "Response exceeds configured size limit", {
      actual,
      limit,
      limitName: name
    });
  }
}

function validatePath(path) {
  if (!path || typeof path !== "string") {
    throw new KamayError(ERROR_CODES.INVALID_REQUEST, "path is required");
  }
  if (path.includes("..")) {
    throw new KamayError(ERROR_CODES.INVALID_REQUEST, "path must not contain ..", { path });
  }
}

function validateSha(sha) {
  if (!SHA_RE.test(String(sha ?? ""))) {
    throw new KamayError(ERROR_CODES.INVALID_REQUEST, "Invalid SHA", { sha });
  }
}
