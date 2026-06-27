import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const agentsOperatorSource = readFileSync("interfaces/control-center/src/components/agents/AgentsOperatorExperience.tsx", "utf8");
const mobileAgentsSource = readFileSync("interfaces/control-center/src/components/agents/MobileAgents.tsx", "utf8");
const agentCardSource = readFileSync("interfaces/control-center/src/components/agents/AgentCard.tsx", "utf8");
const globalCssSource = readFileSync("interfaces/control-center/src/styles/globals.css", "utf8");
const serverSource = readFileSync("interfaces/control-center/src/lib/control-center/server.ts", "utf8");

test("Agents runtime actions use a confirm dialog instead of exact phrase input", () => {
  assert.match(agentsOperatorSource, /window\.confirm/);
  assert.match(agentsOperatorSource, /body: JSON\.stringify\(\{ confirmation: requiredPhrase \}\)/);
  assert.match(agentsOperatorSource, /runtimeActionEnabled = Boolean\(runtimeAction && panel\.plan\?\.actionEnabled && requiredPhrase && !panel\.running\)/);
  assert.doesNotMatch(agentsOperatorSource, /Manual Confirmation/);
  assert.doesNotMatch(agentsOperatorSource, /Type exact phrase/);
  assert.doesNotMatch(agentsOperatorSource, /panel\.confirmation/);
});

test("Agents runtime backend still requires the exact confirmation phrase", () => {
  assert.match(serverSource, /confirmation\.trim\(\) !== requiredPhrase/);
  assert.match(serverSource, /Confirmation phrase mismatch/);
});

test("Mobile Agents mirrors desktop filtering and uses readable fleet audit summary", () => {
  assert.match(agentsOperatorSource, /agents=\{visibleAgents\}/);
  assert.match(agentsOperatorSource, /agentView=\{agentView\}/);
  assert.match(agentsOperatorSource, /onAgentViewChange=\{setAgentView\}/);
  assert.match(mobileAgentsSource, /type AgentView = "active" \| "drafts" \| "all"/);
  assert.match(mobileAgentsSource, /Fleet: \$\{result\.summary\.passed\} ok · \$\{result\.summary\.warnings\} warn · \$\{result\.summary\.failed\} failed/);
  assert.match(mobileAgentsSource, /Active\s*<\/button>/);
  assert.match(mobileAgentsSource, /Drafts\s*<\/button>/);
  assert.match(mobileAgentsSource, /All\s*<\/button>/);
  assert.match(globalCssSource, /\.mobile-agent-view-toggle/);
});

test("Mobile agent cards do not render unused menu dots", () => {
  assert.doesNotMatch(agentCardSource, /agent-menu-button/);
  assert.doesNotMatch(agentCardSource, /Open menu for/);
  assert.doesNotMatch(globalCssSource, /\.agent-menu-button/);
});
