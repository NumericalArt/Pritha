import test from "node:test";
import assert from "node:assert/strict";
import { TIMEOUT_POLICIES, timeoutPolicy, releaseTimeouts } from "../scripts/lib/timeout-policy.mjs";

test("release timeout overrides are bounded integers and reject invalid values without echoing input", () => {
  for (const [name, policy] of Object.entries(TIMEOUT_POLICIES)) {
    assert.equal(timeoutPolicy(name, { env: {} }), policy.defaultMs);
    assert.equal(timeoutPolicy(name, { env: { [policy.env]: String(policy.minMs) } }), policy.minMs);
    assert.equal(timeoutPolicy(name, { value: policy.maxMs }), policy.maxMs);
    for (const value of ["", " ", "Infinity", "NaN", "-1", "0", "1e4", "250.5", "private-input", Number.MAX_SAFE_INTEGER, policy.maxMs + 1, policy.minMs - 1]) {
      assert.throws(() => timeoutPolicy(name, { value }), (error) => error.message.startsWith(`${policy.env} must be`) && !error.message.includes("private-input"));
    }
  }
  assert.throws(() => timeoutPolicy("unknown"), /Unknown timeout policy/);
  assert.equal(releaseTimeouts({}).releaseStrict, 180_000);
});
