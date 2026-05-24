import { buildStubCapabilities } from "../contracts/capabilities.js";
import { nullRateLimit } from "../contracts/rate-limit.js";
import { ERROR_CODES, KamayError } from "../../../services/errors.js";

const NOTE = "Local backend not yet implemented. Needs: root directory configuration, safe path resolution, git object access, and file size guards.";

export class LocalBackend {
  constructor() {
    this.source = "local";
    this.lastRateLimit = nullRateLimit("local");
  }

  async capabilities() {
    return buildStubCapabilities("local", NOTE);
  }

  async health() { throw notImplemented("local", "health"); }
  async getFile() { throw notImplemented("local", "getFile"); }
  async getFiles() { throw notImplemented("local", "getFiles"); }
  async getBlob() { throw notImplemented("local", "getBlob"); }
  async getTree() { throw notImplemented("local", "getTree"); }
  async getCommits() { throw notImplemented("local", "getCommits"); }
  async getDiff() { throw notImplemented("local", "getDiff"); }
}

function notImplemented(backend, operation) {
  return new KamayError(
    ERROR_CODES.NOT_IMPLEMENTED,
    `${backend} backend does not implement ${operation}`,
    { backend, operation }
  );
}
