import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {prepareDistributionInstance} from '../scripts/lib/distribution-instance.mjs';

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

test('direct Python resolves the private distribution pointer without reading credentials or importing ML',t=>{
  const base=realpathSync(mkdtempSync(path.join(os.tmpdir(),'pritha-python-pointer-'))),root=path.join(base,'code');mkdirSync(root);t.after(()=>rmSync(base,{recursive:true,force:true}));
  const config=prepareDistributionInstance(root,{env:{},providerProfile:'neuraldeep'});
  const script=`import sys,json,os\nsys.path.insert(0,${JSON.stringify(path.resolve('scripts'))})\nfrom pritha_python_compat import load_pritha_runtime_env\nroots=load_pritha_runtime_env(${JSON.stringify(root)})\nprint(json.dumps({'state':str(roots[1]),'ml':'torch' in sys.modules}))`;
  const env=Object.fromEntries(['PATH','HOME','LANG'].filter(key=>process.env[key]).map(key=>[key,process.env[key]]));
  const run=spawnSync('python3',['-c',script],{env,encoding:'utf8'});assert.equal(run.status,0,run.stderr);assert.deepEqual(JSON.parse(run.stdout),{state:config.stateRoot,ml:false});
  writeFileSync(path.join(root,'.pritha-instance.json'),JSON.stringify({...config,codeRoot:base}),{mode:0o600});const rejected=spawnSync('python3',['-c',script],{env,encoding:'utf8'});assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/instance_configuration_invalid/);
});
