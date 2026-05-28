import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function listFiles(root) {
  const out = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else {
        out.push(path.relative(root, fullPath).split(path.sep).join("/"));
      }
    }
  }
  walk(root);
  return out.sort();
}

test("Agents Mother scaffold output matches the frozen file-list snapshot", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "techscope-scaffold-test-"));
  const contractDir = path.join(root, "11_agents", "contracts");
  execFileSync("mkdir", ["-p", contractDir]);
  const contractPath = path.join(contractDir, "valid-agent-contract.md");
  cpSync("tests/fixtures/contracts/valid-agent-contract.md", contractPath);
  const outputDir = path.join(root, "out");

  const output = execFileSync("node", [
    path.resolve("scripts/agents-mother.mjs"),
    "scaffold",
    contractPath,
    "--output",
    outputDir,
  ], {
    encoding: "utf8",
    env: { ...process.env, TECHSCOPE_ROOT: root },
  });

  assert.match(output, /Smoke test: pass/);
  const actual = `${listFiles(outputDir).join("\n")}\n`;
  const expected = readFileSync("tests/snapshots/scaffold-basic-file-list.txt", "utf8");
  assert.equal(actual, expected);

  const smoke = execFileSync("node", ["scripts/smoke-test.mjs"], {
    cwd: outputDir,
    encoding: "utf8",
  });
  assert.match(smoke, /Smoke test passed/);
});
