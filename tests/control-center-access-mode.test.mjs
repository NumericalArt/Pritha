import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const accessModeSource = readFileSync("interfaces/control-center/src/lib/access-mode.ts", "utf8");
const agentCardSource = readFileSync("interfaces/control-center/src/components/agents/AgentCard.tsx", "utf8");

test("Agent cards render URLs through the selected Control Center access mode", () => {
  assert.match(agentCardSource, /agentUrlForAccessMode\(agent\.url,\s*access,\s*accessMode\)/);
  assert.match(agentCardSource, /data-testid="agent-url-link"/);
  assert.match(agentCardSource, /data-url=\{displayUrl\}/);
});

test("Access mode URL rewrite keeps child-agent ports for LAN and Tailscale links", () => {
  assert.match(accessModeSource, /if \(mode === "localhost"\) return rawUrl/);
  assert.match(accessModeSource, /const target = new URL\(targetBase\)/);
  assert.match(accessModeSource, /next\.protocol = target\.protocol/);
  assert.match(accessModeSource, /next\.hostname = target\.hostname/);
  assert.match(accessModeSource, /next\.port = source\.port \|\| target\.port/);
});
