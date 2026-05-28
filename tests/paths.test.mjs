import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { resolveSiblingAgentPath, resolveTechscopeRoot } from "../scripts/lib/paths.mjs";

test("resolveTechscopeRoot honors TECHSCOPE_ROOT", () => {
  const oldRoot = process.env.TECHSCOPE_ROOT;
  process.env.TECHSCOPE_ROOT = "/tmp/techscope-fixture";
  try {
    assert.equal(resolveTechscopeRoot(), "/tmp/techscope-fixture");
  } finally {
    if (oldRoot === undefined) delete process.env.TECHSCOPE_ROOT;
    else process.env.TECHSCOPE_ROOT = oldRoot;
  }
});

test("resolveSiblingAgentPath places agents beside root by default", () => {
  assert.equal(
    resolveSiblingAgentPath("ChildAgent", { root: "/tmp/example/Techscope" }),
    path.join("/tmp/example", "ChildAgent"),
  );
});

test("resolveSiblingAgentPath supports explicit override", () => {
  assert.equal(
    resolveSiblingAgentPath("Ignored", { overridePath: "/tmp/custom-agent" }),
    "/tmp/custom-agent",
  );
});
