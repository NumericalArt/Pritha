import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";

const accessModeSource = readFileSync("interfaces/control-center/src/lib/access-mode.ts", "utf8");
const agentCardSource = readFileSync("interfaces/control-center/src/components/agents/AgentCard.tsx", "utf8");
const agentsPageSource = readFileSync("interfaces/control-center/src/app/agents/page.tsx", "utf8");
const controlCenterServerSource = readFileSync("interfaces/control-center/src/lib/control-center/server.ts", "utf8");

async function loadAccessModeModule() {
  const output = ts.transpileModule(accessModeSource, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
    },
  }).outputText;
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pritha-access-mode-test-"));
  const modulePath = path.join(tmp, "access-mode.mjs");
  writeFileSync(modulePath, output, "utf8");
  return {
    module: await import(pathToFileURL(modulePath).href),
    cleanup: () => rmSync(tmp, { recursive: true, force: true }),
  };
}

test("Agent cards render URLs through the selected Control Center access mode", () => {
  assert.match(agentCardSource, /agentUrlForAccessMode\(agent\.url,\s*access,\s*accessMode,\s*agent\.tailscaleUrl\)/);
  assert.match(agentCardSource, /data-testid="agent-url-link"/);
  assert.match(agentCardSource, /data-url=\{displayUrl\}/);
});

test("Managed active web agents keep plan control as the primary action", () => {
  assert.doesNotMatch(agentCardSource, /const usePrimaryOpen/);
  assert.doesNotMatch(agentCardSource, /data-testid="agent-primary-open-link"/);
  assert.doesNotMatch(agentCardSource, /data-testid="agent-manage-button"/);
  assert.match(agentCardSource, /className=\{`\$\{mobile \? "mobile-agent-action" : "agent-action"\} \$\{actionTone\}`\}/);
  assert.match(agentCardSource, /onClick=\{canOpenPlan \? \(\) => onAction\?\.\(agent\) : undefined\}/);
  assert.match(agentCardSource, /data-testid="agent-url-link"/);
});

test("Access mode URL rewrite keeps LAN ports but requires explicit child-agent Tailscale links", async () => {
  const loaded = await loadAccessModeModule();
  try {
    const access = {
      localhost: "http://127.0.0.1:3420",
      lan: "ready",
      lanUrl: "http://192.0.2.10:3420",
      tailscale: "ready",
      tailscaleUrl: "https://example.tail000000.ts.net",
      qr: "ready",
    };

    assert.equal(loaded.module.agentUrlForAccessMode("http://127.0.0.1:8787", access, "localhost"), "http://127.0.0.1:8787");
    assert.equal(loaded.module.agentUrlForAccessMode("http://127.0.0.1:8787", access, "lan"), "http://192.0.2.10:8787");
    assert.equal(loaded.module.agentUrlForAccessMode("http://127.0.0.1:8787", access, "tailscale"), undefined);
    assert.equal(
      loaded.module.agentUrlForAccessMode("http://127.0.0.1:8787", access, "tailscale", "https://agent.tail000000.ts.net:8787"),
      "https://agent.tail000000.ts.net:8787",
    );
  } finally {
    loaded.cleanup();
  }

  assert.match(accessModeSource, /agentUrlForAccessMode\(rawUrl: string \| undefined, access: ControlCenterStatus\["access"\], mode: AccessMode, agentTailscaleUrl\?: string\)/);
  assert.match(accessModeSource, /if \(mode === "tailscale"\) return agentTailscaleUrl/);
  assert.match(accessModeSource, /if \(mode === "localhost"\) return rawUrl/);
  assert.match(accessModeSource, /const target = new URL\(targetBase\)/);
  assert.match(accessModeSource, /next\.protocol = target\.protocol/);
  assert.match(accessModeSource, /next\.hostname = target\.hostname/);
  assert.match(accessModeSource, /next\.port = source\.port \|\| target\.port/);
});

test("Control Center carries served agent Tailscale links into agent cards", () => {
  assert.match(controlCenterServerSource, /tailscale_public_url\?: string/);
  assert.match(controlCenterServerSource, /function validTailscalePublicUrl/);
  assert.match(controlCenterServerSource, /function tailscaleServeStatusJson/);
  assert.match(controlCenterServerSource, /function servedTailscaleUrlForLocalUrl/);
  assert.match(controlCenterServerSource, /function agentTailscaleUrl/);
  assert.match(controlCenterServerSource, /if \(url\.username \|\| url\.password\) return undefined/);
  assert.match(controlCenterServerSource, /url\.protocol !== "https:" \|\| !url\.hostname\.endsWith\("\.ts\.net"\)/);
  assert.match(controlCenterServerSource, /const tailscaleUrl = agentTailscaleUrl\(manifest,\s*localUrl,\s*access\)/);
  assert.match(controlCenterServerSource, /tailscale: tailscaleUrl/);
  assert.match(agentsPageSource, /tailscaleUrl: agent\.url\.tailscale/);
});
