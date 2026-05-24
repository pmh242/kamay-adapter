import { buildStubCapabilities } from "../contracts/capabilities.js";
import { nullRateLimit } from "../contracts/rate-limit.js";
import { ERROR_CODES, KamayError } from "../../../services/errors.js";

const NOTE = "Gitea backend not yet implemented. Needs: base URL configuration, token auth, repository path mapping, contents/tree/commit endpoint adapters.";

export class GiteaBackend {
  constructor() {
    this.source = "gitea";
    this.lastRateLimit = nullRateLimit("gitea");
  }

  async capabilities() {
    return buildStubCapabilities("gitea", NOTE);
  }

  async health() { throw notImplemented("gitea", "health"); }
  async getFile() { throw notImplemented("gitea", "getFile"); }
  async getFiles() { throw notImplemented("gitea", "getFiles"); }
  async getBlob() { throw notImplemented("gitea", "getBlob"); }
  async getTree() { throw notImplemented("gitea", "getTree"); }
  async getCommits() { throw notImplemented("gitea", "getCommits"); }
  async getDiff() { throw notImplemented("gitea", "getDiff"); }
}

function notImplemented(backend, operation) {
  return new KamayError(
    ERROR_CODES.NOT_IMPLEMENTED,
    `${backend} backend does not implement ${operation}`,
    { backend, operation }
  );
}
