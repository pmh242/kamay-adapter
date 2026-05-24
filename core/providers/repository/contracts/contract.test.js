import test from "node:test";
import assert from "node:assert/strict";
import { REQUIRED_OPERATIONS } from "./capabilities.js";
import { ERROR_CODES, KamayError } from "../../../services/errors.js";

export function runRepositoryContract(backend, { label, fixtures, expectImplemented }) {
  const implemented = new Set(expectImplemented);

  test(`${label}: declares every required operation`, async () => {
    const capabilities = await backend.capabilities();
    for (const operation of REQUIRED_OPERATIONS) {
      assert.ok(capabilities.operations[operation], `missing ${operation}`);
      assert.equal(typeof capabilities.operations[operation].supported, "boolean");
    }
  });

  test(`${label}: declared-supported operations are functions`, async () => {
    const capabilities = await backend.capabilities();
    for (const operation of REQUIRED_OPERATIONS) {
      if (capabilities.operations[operation].supported) {
        assert.equal(typeof backend[operation], "function", operation);
      }
    }
  });

  test(`${label}: capability identity is v1 repository`, async () => {
    const capabilities = await backend.capabilities();
    assert.equal(capabilities.apiVersion, "v1");
    assert.equal(capabilities.provider, "repository");
  });

  test(`${label}: unsupported operations throw NOT_IMPLEMENTED`, async () => {
    const capabilities = await backend.capabilities();
    for (const operation of REQUIRED_OPERATIONS) {
      if (!implemented.has(operation) && !capabilities.operations[operation].supported) {
        await assert.rejects(
          () => backend[operation](...(fixtures.args?.[operation] ?? [])),
          (error) => error instanceof KamayError && error.code === ERROR_CODES.NOT_IMPLEMENTED
        );
      }
    }
  });

  if (implemented.has("health")) {
    test(`${label}: health returns expected shape`, async () => {
      const result = await backend.health();
      assert.equal(result.status, "ok");
      assert.equal(result.provider, "repository");
      assert.equal(result.backend, fixtures.backend);
      assert.equal(result.apiVersion, "v1");
    });
  }

  if (implemented.has("getFile")) {
    test(`${label}: getFile returns expected shape`, async () => {
      const result = await backend.getFile(fixtures.filePath, fixtures.ref);
      assert.equal(result.path, fixtures.filePath);
      assert.equal(typeof result.sha, "string");
      assert.equal(typeof result.content, "string");
      assert.equal(typeof result.size, "number");
      assert.equal(result.encoding, "utf-8");
    });
  }

  if (implemented.has("getCommits")) {
    test(`${label}: getCommits returns expected shape`, async () => {
      const result = await backend.getCommits(fixtures.ref, 2);
      assert.ok(Array.isArray(result.commits));
      assert.equal(typeof result.pagination.hasMore, "boolean");
    });
  }

  if (implemented.has("getTree")) {
    test(`${label}: getTree returns expected shape`, async () => {
      const result = await backend.getTree(fixtures.ref);
      assert.ok(Array.isArray(result.files));
      assert.equal(typeof result.truncated, "boolean");
      assert.equal(typeof result.pagination.hasMore, "boolean");
    });
  }
}
