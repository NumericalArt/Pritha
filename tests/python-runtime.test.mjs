import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { instancePythonPath, resolvePrithaPython } from "../scripts/lib/python-runtime.mjs";

test("Python resolution preserves overrides and selects only this instance's venv", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-python-"));
  try {
    const env = { PRITHA_STATE_ROOT: path.join(root, "состояние с пробелами") };
    assert.equal(resolvePrithaPython({ root, env }), "python3");
    const python = instancePythonPath({ root, env });
    mkdirSync(path.dirname(python), { recursive: true });
    assert.throws(() => resolvePrithaPython({ root, env }), { code: "python_environment_incomplete" });
    writeFileSync(python, "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    assert.equal(resolvePrithaPython({ root, env }), python);
    assert.equal(resolvePrithaPython({ root, env: { ...env, PRITHA_PYTHON: "python3.13" } }), "python3.13");
    assert.equal(resolvePrithaPython({ root, env: { PRITHA_PYTHON: python } }), python);
    chmodSync(python, 0o600);
    assert.throws(() => resolvePrithaPython({ root, env }), { code: "python_environment_incomplete" });
    for (const invalid of ["", "python3 -c secret", "./missing", "/missing/interpreter", "x\0y"]) {
      assert.throws(() => resolvePrithaPython({ root, env: { PRITHA_PYTHON: invalid } }), error => error.code === "python_interpreter_unavailable" && !error.message.includes(invalid || "sentinel"));
    }
    assert.equal(resolvePrithaPython({ root, env: { PRITHA_STATE_ROOT: path.join(root, "other") } }), "python3");
    assert.equal(instancePythonPath({ root, env: {}, platform: "win32" }), path.join(root, ".private/venv/Scripts/python.exe"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
