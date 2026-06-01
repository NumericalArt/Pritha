import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  auditProjectSkills,
  discoverLocalSkills,
  selectSkillsForContract,
} from "../scripts/agents-mother/skills.mjs";
import { contractData } from "../scripts/agents-mother/contract.mjs";

test("Pritha local skill catalog is discoverable and valid", () => {
  const skills = discoverLocalSkills();
  assert.ok(skills.length >= 3);
  assert.ok(skills.some((skill) => skill.name === "telegram-intake-triage"));
  assert.ok(skills.every((skill) => skill.hash.startsWith("sha256:")));
});

test("skill selector keeps default scaffold recommendation-only", () => {
  const data = contractData("tests/fixtures/contracts/valid-agent-contract.md");
  const selection = selectSkillsForContract(data);
  assert.equal(selection.policy.skillInstallMode, "recommend");
  assert.equal(selection.installed.length, 0);
  assert.ok(selection.candidates.length >= 1);
});

test("skills CLI reports status", () => {
  const result = spawnSync("node", ["scripts/pritha.mjs", "skills", "status"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Local skill catalog/);
  assert.match(result.stdout, /telegram-intake-triage/);
});

test("project skill audit catches missing installed skill files", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "techscope-skills-audit-"));
  mkdirSync(path.join(root, "skills"), { recursive: true });
  writeFileSync(path.join(root, "skills", "manifest.json"), JSON.stringify({
    version: 1,
    installed: [{ name: "missing-skill", hash: "sha256:missing" }],
    candidates: [],
  }, null, 2));
  writeFileSync(path.join(root, "skills", "candidates.json"), JSON.stringify({ candidates: [] }, null, 2));
  const result = auditProjectSkills(root, { silent: true });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((issue) => issue.includes("missing installed skill file")));
});
