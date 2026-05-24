import { GitHubBackend } from "./github.js";
import { GitLabBackend } from "./gitlab.js";
import { GiteaBackend } from "./gitea.js";
import { LocalBackend } from "./local.js";
import { REQUIRED_OPERATIONS, validateCapabilitiesShape } from "../contracts/capabilities.js";
import { ERROR_CODES, KamayError } from "../../../services/errors.js";

export const REGISTRY = Object.freeze({
  github: GitHubBackend,
  gitlab: GitLabBackend,
  gitea: GiteaBackend,
  local: LocalBackend
});

export function listSupportedSources() {
  return Object.keys(REGISTRY);
}

export function getRepositoryBackend(source, env = {}) {
  const normalized = source ?? "github";
  const Backend = REGISTRY[normalized];
  if (!Backend) {
    throw new KamayError(ERROR_CODES.INVALID_REQUEST, "Unknown repository source", {
      source: normalized,
      supported: listSupportedSources()
    });
  }
  if (normalized === "github") {
    return new Backend({
      repo: env.KAMAY_REPO,
      token: env.GITHUB_TOKEN,
      fetchImpl: env.fetchImpl
    });
  }
  return new Backend();
}

export async function assertBackendValid(backend) {
  const failures = [];
  if (typeof backend.capabilities !== "function") {
    failures.push("capabilities must be a function");
  }
  let capabilities = null;
  if (failures.length === 0) {
    capabilities = await backend.capabilities();
    validateCapabilitiesShape(capabilities);
    for (const operation of REQUIRED_OPERATIONS) {
      if (capabilities.operations[operation].supported && typeof backend[operation] !== "function") {
        failures.push(`${operation} must be a function`);
      }
    }
  }
  if (failures.length > 0) {
    throw new KamayError(ERROR_CODES.INTERNAL_ERROR, "Repository backend failed conformance", {
      failures
    });
  }
  return true;
}

export { GitHubBackend, GitLabBackend, GiteaBackend, LocalBackend };
