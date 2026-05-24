import { buildStubCapabilities } from "../contracts/capabilities.js";
import { nullRateLimit } from "../contracts/rate-limit.js";
import { ERROR_CODES, KamayError } from "../../../services/errors.js";

const NOTE = "GitLab backend not yet implemented. Needs: project ID resolution, PAT or OAuth, /projects/:id/repository/* endpoints, base64 content decode.";

export class GitLabBackend {
  constructor() {
    this.source = "gitlab";
    this.lastRateLimit = nullRateLimit("gitlab");
  }

  async capabilities() {
    return buildStubCapabilities("gitlab", NOTE);
  }

  async health() { throw notImplemented("gitlab", "health"); }
  async getFile() { throw notImplemented("gitlab", "getFile"); }
  async getFiles() { throw notImplemented("gitlab", "getFiles"); }
  async getBlob() { throw notImplemented("gitlab", "getBlob"); }
  async getTree() { throw notImplemented("gitlab", "getTree"); }
  async getCommits() { throw notImplemented("gitlab", "getCommits"); }
  async getDiff() { throw notImplemented("gitlab", "getDiff"); }
}

function notImplemented(backend, operation) {
  return new KamayError(
    ERROR_CODES.NOT_IMPLEMENTED,
    `${backend} backend does not implement ${operation}`,
    { backend, operation }
  );
}
