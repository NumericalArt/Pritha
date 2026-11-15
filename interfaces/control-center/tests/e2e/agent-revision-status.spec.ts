import { expect, test } from "@playwright/test";
import type { ControlCenterStatus } from "../../src/lib/control-center/types";

// What the operator sees on a card: a service that is simply not running is
// "Stopped", not a failure, and an agent whose revision is being built keeps
// showing its applied, verified version together with the pending build.
test("a stopped agent under revision shows its applied version, the pending build and no failure wording", async ({ page }, testInfo) => {
  const status: ControlCenterStatus = await (await page.request.get("/api/status")).json();
  const agent = status.childAgents.find((item) => item.name === "Fixture Managed")!;
  const head = "0123456789abcdef0123456789abcdef01234567";
  agent.ui = { ...agent.ui, state: "alive", activity: "inactive", issueText: undefined, actionEnabled: true };
  agent.health = { status: "failed", checkedUrl: "http://127.0.0.1:9/health", detail: "Local endpoint did not respond" };
  // A managed local service, as the factory builds it; the isolated fixture agent itself declares no runtime.
  agent.readiness = { ...agent.readiness, status: "stopped", summary: "The agent is not running. Start it from its card or send a request from Try this agent.", blockers: [],
    runtime: { manager: "detached-node-process", status: "unknown", detail: "Runtime manager detached-node-process is declared; readiness depends on the health probe." } };
  agent.agentKind = { kind: "service" } as ControlCenterStatus["childAgents"][number]["agentKind"];
  agent.resultReadiness = {
    schema: "pritha-result-readiness-v1", agentId: "fixture-managed", observedAt: new Date().toISOString(),
    verification: { status: "verified", scope: "canonical-project", reason: "current", counts: { automated: 2, passed: 2, failed: 0, operator: 0, status: "verified" }, head },
    candidate: { status: "verified", reason: "current", head },
    acceptance: { status: "not_accepted", at: null },
    run: { id: "voice-fixture-managed-applied1", status: "verified", updatedAt: new Date().toISOString() },
    pending: { run: { id: "voice-fixture-managed-revised2", status: "building", updatedAt: new Date().toISOString() }, status: "unverified", reason: "no-current-evidence" },
    evidenceIssues: 0, truncated: false,
  };
  await page.route("**/api/status", (route) => route.fulfill({ json: status }));
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/agents");
    await page.evaluate(() => window.dispatchEvent(new Event("pritha:status-refresh")));
    const card = page.locator("article:visible", { hasText: "Fixture Managed" }).first();
    await expect(card.locator(".activity-label")).toHaveText("Stopped");
    await expect(card).not.toContainText("No response");
    await expect(card).not.toContainText("Healthcheck endpoint unavailable");
    const result = card.getByTestId("agent-result-readiness");
    await expect(result.locator("summary")).toHaveText("Result: Verified");
    await result.locator("summary").click();
    await expect(result).toContainText("ProcessStopped");
    await expect(result).toContainText("New versionBuild voice-fixture-managed-revised2 · building");
    await expect(result).toContainText("This card shows and serves the applied version until the revision is checked.");
    expect(await page.locator("body").evaluate((element) => element.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`agent-revision-${viewport.width}.png`), fullPage: true });
  }
});
