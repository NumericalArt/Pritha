import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { instancePythonPath, resolvePrithaPython,resolveBootstrapPython } from "../scripts/lib/python-runtime.mjs";

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

test('fresh bootstrap selects an installed modern interpreter and never overrides an explicit incompatible choice',()=>{
  const calls=[];const probe=(command,args,options)=>{calls.push(command);assert.equal(args[0],'-I');assert.equal(options.shell,false);return command==='python3.11'?{status:0,stdout:'3.11\n'}:{status:command==='python3'?0:1,stdout:command==='python3'?'3.9\n':''};};
  assert.equal(resolveBootstrapPython({env:{},probe}),'python3.11');assert.deepEqual(calls,['python3.12','python3.11']);
  calls.length=0;assert.throws(()=>resolveBootstrapPython({env:{PRITHA_PYTHON:'python3'},probe}),{code:'python_bootstrap_unavailable'});assert.deepEqual(calls,['python3']);
  assert.throws(()=>resolveBootstrapPython({env:{},probe:()=>({status:0,stdout:'3.9'})}),{code:'python_bootstrap_unavailable'});
});
