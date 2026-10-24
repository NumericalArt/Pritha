import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

for (const name of ["scope_and_privacy", "ranking_and_validation", "readonly_and_missing_database", "cli_instance_resolution", "frozen_corpus", "embedding_validation_and_retry", "content_relevance", "scoped_statistics_and_language", "acceptance_fixture_integrity"]) {
  test("curated memory retrieval: " + name, () => {
    const result = spawnSync("python3", ["tests/fixtures/memory/check-curated-retrieval.py", "CuratedRetrievalTests.test_" + name], {
      encoding: "utf8", timeout: 20000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  });
}
