import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

test("direct Python memory entrypoints respect instance roots without loading unrelated secrets or ML", () => {
  const base = realpathSync(mkdtempSync(path.join(os.tmpdir(), "pritha-python-env-")));
  const root = path.join(base, "code");
  const state = path.join(base, "state");
  const override = path.join(base, "explicit");
  try {
    mkdirSync(root, { recursive: true });
    mkdirSync(path.join(state, "config"), { recursive: true });
    writeFileSync(path.join(root, ".env.local"), `PRITHA_STATE_ROOT="${state}"\nUNRELATED_TEST_SECRET=should-not-load\n`);
    writeFileSync(path.join(state, "config", "runtime.env"), `TECHSCOPE_ROOT="${root}"\nUNRELATED_TEST_SECRET=should-not-load\n`);
    const script = `import sys,os,json\nsys.path.insert(0,${JSON.stringify(path.resolve("scripts"))})\nfrom pritha_python_compat import load_pritha_runtime_env\nroots=load_pritha_runtime_env(${JSON.stringify(root)})\nprint(json.dumps({"roots":[str(p) for p in roots],"secret":os.environ.get("UNRELATED_TEST_SECRET"),"ml":any(m in sys.modules for m in ['torch','sentence_transformers','urllib3'])}))`;
    for (const explicit of [false, true]) {
      const env = { ...process.env };
      delete env.TECHSCOPE_ROOT;
      delete env.PRITHA_STATE_ROOT;
      delete env.UNRELATED_TEST_SECRET;
      if (explicit) env.PRITHA_STATE_ROOT = override;
      const result = spawnSync("python3", ["-c", script], { env, encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), { roots: [root, explicit ? override : state], secret: null, ml: false });
    }
  } finally { rmSync(base, { recursive: true, force: true }); }
});
