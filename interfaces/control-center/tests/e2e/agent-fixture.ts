import { expect, type Page } from "@playwright/test";
import type { ControlCenterStatus, ControlCenterOperatorActionPlan } from "../../src/lib/control-center/types";

export const agentFixtures = new WeakMap<Page, { status: ControlCenterStatus; requests: Array<{ action: string; confirmation: string }> }>();

export async function installAgentFixture(page: Page, source: ControlCenterStatus) {
  const existing = agentFixtures.get(page);
  if (existing) return existing.status;
  const status = structuredClone(source);
  expect(status.childAgents.map(agent => agent.name).sort()).toEqual(["Fixture Managed", "PictureBoom", "StupidJoke"]);
  for (const agent of status.childAgents) {
    const managed = agent.name === "Fixture Managed", blocked = agent.name === "PictureBoom";
    delete agent.resultReadiness; delete agent.agentKind;
    agent.ui = { state: blocked ? "needs-check" : "alive", activity: blocked ? "inactive" : "active", primaryAction: managed ? "stop" : "start", actionEnabled: true, actionDisabledReason: "", updateStatus: "none" };
    agent.control = { runtimeKind: "web_service", ownership: managed ? "managed" : "adoptable", primaryCardAction: managed ? "stop_plan" : "start_plan", planAction: managed ? "stop" : "start", executionMode: "executable", label: managed ? "Stop Plan" : "Start Plan", reason: "Synthetic browser fixture", confirmationRequired: true, commandReadiness: { start: "structured_executable", stop: "structured_executable" } };
    agent.url = { status: "available", local: `http://127.0.0.1:9/${agent.id}`, ...(managed ? { tailscale: "https://example.invalid/fixture-agent" } : {}) };
    agent.health = { status: "ok" };
    if (blocked) agent.credentials = { ...agent.credentials, status: "pending_auth", required: 1, configuredRequired: 0, missingRequired: 1, definitions: [{ name: "FIXTURE_CREDENTIAL", label: "Fixture credential", provider: "generic", required: true, validation: "manual", storageTarget: ".env.local", browserExposure: "never", source: "operations_manifest", status: "missing", configured: false, canWrite: false, canRemove: false }] };
  }
  status.access = { ...status.access, tailscale: "ready", tailscaleUrl: "https://example.invalid/control-center" };
  const fixture = { status, requests: [] as Array<{ action: string; confirmation: string }> };
  agentFixtures.set(page, fixture);
  await page.route("**/api/status", route => route.fulfill({ json: status }));
  await page.route("**/api/agents/**", async route => {
    const url = new URL(route.request().url());
    const agent = status.childAgents.find(item => item.id === url.pathname.split("/")[3]);
    if (!agent) return route.fallback();
    const action = url.pathname.includes("/stop") ? "stop" : "start";
    if (url.pathname.endsWith("/credentials")) return route.fulfill({ json: { ok: true, generatedAt: new Date().toISOString(), agent: { id: agent.id, name: agent.name }, credentials: agent.credentials } });
    if (url.pathname.endsWith("/plan")) {
      const enabled = agent.name !== "PictureBoom";
      const plan: ControlCenterOperatorActionPlan = { ok: true, generatedAt: new Date().toISOString(), agent: { id: agent.id, name: agent.name, folderStatus: "present" }, action, status: enabled ? "needs_confirmation" : "blocked", actionEnabled: enabled, requiresConfirmation: true, confirmation: { requiredPhrase: `${action} ${agent.id}`, accepted: false }, target: { kind: "process", commandAvailable: true, willStartProcess: action === "start", willStopProcess: action === "stop", willCreateFolder: false, willOverwriteExistingFolder: false }, control: agent.control, checks: [], steps: ["Synthetic operation, no process execution"], blockers: enabled ? [] : ["Fixture credential missing"], risks: [], warnings: [] };
      return route.fulfill({ json: plan });
    }
    if (route.request().method() === "POST" && /\/actions\/(start|stop)$/.test(url.pathname)) {
      fixture.requests.push({ action, confirmation: route.request().postDataJSON().confirmation });
      return route.fulfill({ json: { ok: true, status: action === "start" ? "running" : "stopped", summary: { passed: 1, warnings: 0, failed: 0 }, checks: [], warnings: [], errors: [], execution: { status: action === "start" ? "running" : "stopped", target: "process", exitCode: 0 } } });
    }
    return route.fallback();
  });
  return status;
}

export async function openAgents(page: Page) {
  await page.goto("/agents");
  if (!agentFixtures.has(page)) return;
  let refreshed = false;
  const observe = (response: import("@playwright/test").Response) => {
    if (new URL(response.url()).pathname === "/api/status") refreshed = true;
  };
  page.on("response", observe);
  try {
    await expect.poll(async () => {
      await page.evaluate(() => window.dispatchEvent(new Event("pritha:status-refresh")));
      return refreshed;
    }, { intervals: [100, 200, 500] }).toBe(true);
  } finally { page.off("response", observe); }
  await expect(page.locator('[data-testid="agent-url-link"]:visible').first()).toBeVisible();
}
