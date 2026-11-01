import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, symlinkSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  isPrithaCodeCheckout,
  prithaInstanceConfig,
  resolvePrithaAgentMemoryRoot,
  resolvePrithaAgentParent,
  resolvePrithaStateRoot,
  resolvePrithaStatePath,
  resolvePrithaStatePathFrom,
  resolveSiblingAgentPath,
} from "../scripts/lib/paths.mjs";

test("Pritha sibling checkouts are distinguishable from child-agent projects", () => {
  const base = mkdtempSync(path.join(os.tmpdir(), "pritha-checkout-kind-"));
  const pritha = path.join(base, "Pritha Local");
  const agent = path.join(base, "FunnyTeacher");
  try {
    mkdirSync(path.join(pritha, "11_agents"), { recursive: true });
    mkdirSync(path.join(pritha, "scripts"), { recursive: true });
    mkdirSync(path.join(pritha, "interfaces", "control-center"), { recursive: true });
    writeFileSync(path.join(pritha, "scripts", "pritha.mjs"), "// fixture\n");
    mkdirSync(agent, { recursive: true });
    writeFileSync(path.join(agent, "AGENTS.md"), "# Agent\n");
    assert.equal(isPrithaCodeCheckout(pritha), true);
    assert.equal(isPrithaCodeCheckout(agent), false);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

function withEnv(values, callback) {
  const previous = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  try {
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return callback();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("state falls back locally while live agent memory stays outside tracked 11_agents", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "pritha-code-"));
  try {
    mkdirSync(path.join(root, ".git"));
    withEnv({ TECHSCOPE_ROOT: root, PRITHA_STATE_ROOT: undefined, PRITHA_AGENT_PARENT: undefined }, () => {
      assert.equal(resolvePrithaStateRoot({ root }), root);
      assert.equal(resolvePrithaAgentParent({ root }), path.dirname(root));
      assert.equal(resolvePrithaAgentMemoryRoot({ root }), path.join(root, ".private", "agents"));
      assert.equal(resolvePrithaStatePath("memory", "techscope.sqlite"), path.join(root, ".memory", "techscope.sqlite"));
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("explicit instance roots take precedence and isolate live state", () => {
  const base = mkdtempSync(path.join(os.tmpdir(), "pritha-instance-"));
  const root = path.join(base, "Pritha");
  const state = path.join(base, "state", "dasha");
  const parent = path.join(base, "Pritha_Dasha");
  mkdirSync(root, { recursive: true });
  mkdirSync(state, { recursive: true });
  mkdirSync(parent, { recursive: true });
  try {
    withEnv({
      PRITHA_STATE_ROOT: state,
      PRITHA_AGENT_PARENT: parent,
      TECHSCOPE_ROOT: root,
      PRITHA_INSTANCE_ID: "dasha",
      PRITHA_INSTANCE_ROLE: "replica",
      PRITHA_CONTROL_CENTER_PORT: "4420",
    }, () => {
      assert.equal(resolvePrithaStateRoot({ root }), state);
      assert.equal(resolvePrithaAgentMemoryRoot({ root }), path.join(state, "agents"));
      assert.equal(resolvePrithaStatePath("memory", "techscope.sqlite"), path.join(state, "memory", "techscope.sqlite"));
      assert.equal(resolveSiblingAgentPath("FAS", { root }), path.join(parent, "FAS"));
      assert.deepEqual(prithaInstanceConfig({ root }), {
        codeRoot: root,
        stateRoot: state,
        agentParent: parent,
        instanceId: "dasha",
        instanceRole: "replica",
        controlCenterPort: 4420,
      });
    });
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("Git checkout, linked worktree and ZIP distribution share the same private agent layout", t => {
  const base=mkdtempSync(path.join(os.tmpdir(),'pritha-distribution-memory-'));
  t.after(()=>rmSync(base,{recursive:true,force:true}));
  for(const kind of ['git','worktree','zip']){
    const root=path.join(base,kind);mkdirSync(path.join(root,'11_agents'),{recursive:true});
    if(kind==='git')mkdirSync(path.join(root,'.git'));
    if(kind==='worktree')writeFileSync(path.join(root,'.git'),'gitdir: ../git/.git/worktrees/fixture\n');
    const options={root,env:{}};
    assert.equal(resolvePrithaAgentMemoryRoot(options),path.join(root,'.private','agents'));
    assert.equal(resolvePrithaAgentMemoryRoot(options),resolvePrithaStatePathFrom(options,'agents'));
    const stateRoot=path.join(base,kind+'-state');mkdirSync(stateRoot);
    assert.equal(resolvePrithaAgentMemoryRoot({...options,stateRoot}),path.join(stateRoot,'agents'));
  }
});

test("a state alias to a non-Git root preserves private layout and cannot select tracked agent history",t=>{
  const base=mkdtempSync(path.join(os.tmpdir(),'pritha-memory-alias-')),root=path.join(base,'source'),alias=path.join(base,'alias');
  t.after(()=>rmSync(base,{recursive:true,force:true}));
  mkdirSync(path.join(root,'11_agents'),{recursive:true});symlinkSync(root,alias);
  assert.equal(resolvePrithaAgentMemoryRoot({root,stateRoot:alias,env:{}}),path.join(root,'.private','agents'));
});
