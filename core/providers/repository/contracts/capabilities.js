import { ERROR_CODES, KamayError } from "../../../services/errors.js";
import { LIMITS } from "./limits.js";

export const REQUIRED_OPERATIONS = Object.freeze([
  "health",
  "capabilities",
  "getFile",
  "getFiles",
  "getBlob",
  "getTree",
  "getCommits",
  "getDiff"
]);

export function buildRepositoryCapabilities(backend, overrides = {}) {
  const operations = {
    health: { supported: true },
    capabilities: { supported: true },
    getFile: { supported: true, maxBytes: LIMITS.MAX_BLOB_BYTES },
    getFiles: {
      supported: true,
      maxBatch: LIMITS.MAX_BATCH_PATHS,
      maxTotalBytes: LIMITS.MAX_BATCH_BYTES
    },
    getBlob: { supported: true, maxBytes: LIMITS.MAX_BLOB_BYTES },
    getTree: {
      supported: true,
      recursive: true,
      maxEntries: LIMITS.MAX_TREE_ENTRIES
    },
    getCommits: { supported: true, maxN: LIMITS.MAX_COMMITS },
    getDiff: {
      supported: true,
      maxPatchBytes: LIMITS.MAX_DIFF_PATCH_BYTES
    }
  };

  return {
    provider: "repository",
    backend,
    apiVersion: "v1",
    version: "0.1.0",
    operations: {
      ...operations,
      ...overrides.operations
    },
    features: {
      write: false,
      search: false,
      webhooks: false
    },
    ...overrides.extra
  };
}

export function buildStubCapabilities(backend, note) {
  return buildRepositoryCapabilities(backend, {
    operations: {
      health: { supported: false },
      capabilities: { supported: true },
      getFile: { supported: false },
      getFiles: { supported: false },
      getBlob: { supported: false },
      getTree: { supported: false },
      getCommits: { supported: false },
      getDiff: { supported: false }
    },
    extra: { note }
  });
}

export function validateCapabilitiesShape(capabilities) {
  const failures = [];
  if (!capabilities || typeof capabilities !== "object") {
    throw new KamayError(
      ERROR_CODES.INTERNAL_ERROR,
      "Invalid repository backend capabilities",
      { failures: ["capabilities must be an object"] }
    );
  }
  if (capabilities.provider !== "repository") {
    failures.push("provider must be repository");
  }
  if (capabilities.apiVersion !== "v1") {
    failures.push("apiVersion must be v1");
  }
  if (!capabilities.operations || typeof capabilities.operations !== "object") {
    failures.push("operations must be an object");
  } else {
    for (const operation of REQUIRED_OPERATIONS) {
      if (!capabilities.operations[operation]) {
        failures.push(`missing operation ${operation}`);
      } else if (typeof capabilities.operations[operation].supported !== "boolean") {
        failures.push(`operation ${operation} must declare supported boolean`);
      }
    }
  }
  if (failures.length > 0) {
    throw new KamayError(
      ERROR_CODES.INTERNAL_ERROR,
      "Invalid repository backend capabilities",
      { failures }
    );
  }
}
