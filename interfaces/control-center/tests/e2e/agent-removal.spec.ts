import { expect, test } from "@playwright/test";
import { installAgentFixture, openAgents } from "./agent-fixture";
import type { ControlCenterStatus } from "../../src/lib/control-center/types";

// Removing an agent is a typed, reviewed decision: the panel says what moves
// to the archive, and Remove stays disabled until the exact phrase is typed.
// A blocked plan explains itself and offers no Remove at all.
test("the action panel removes a factory agent only after the exact phrase and explains a blocked removal", async ({ page }) => {
  const status: ControlCenterStatus = await (await page.request.get("/api/status")).json();
  await installAgentFixture(page, status);
  const name = "Fixture Managed", phrase = `REMOVE ${name}`;
  let removable = true;
  const posted: Array<Record<string, unknown>> = [];
  await page.route("**/api/agents/*/remove", async (route) => {
    if (route.request().method() === "POST") {
      posted.push(route.request().postDataJSON());
      return route.fulfill({ json: { ok: true, name, moved: 6, archive: "archive/agents/fixture-managed-2026" } });
    }
    return route.fulfill({ json: removable
      ? { ok: true, name, removable: true, planHash: "sha256:plan", confirmationPhrase: phrase, blockers: [],
          moves: [{ kind: "project", label: "fixture-managed" }, { kind: "memory", label: "agents/contracts/a.md" }, { kind: "memory", label: "agents/reports/b.md" }, { kind: "factory", label: "agents/voice-factory/fixture-managed" }] }
      : { ok: true, name, removable: false, planHash: "sha256:plan", confirmationPhrase: phrase, moves: [],
          blockers: [{ code: "service_running", message: "The agent's service is running. Stop it from its card first." }] } });
  });
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    removable = viewport.width === 1440;
    await openAgents(page);
    await page.locator("article:visible", { hasText: name }).first().locator(viewport.width === 1440 ? "button.agent-action" : "button.mobile-agent-action").click();
    const section = page.locator(".operator-action-panel", { hasText: name }).getByTestId("agent-removal");
    await section.getByRole("button", { name: "Remove agent…" }).click();
    if (!removable) {
      await expect(section).toContainText("The agent's service is running. Stop it from its card first.");
      await expect(section.getByRole("button", { name: "Remove", exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      continue;
    }
    await expect(section).toContainText("Moves 1 project folder, 2 documents, 1 factory session into Pritha's archive.");
    const remove = section.getByRole("button", { name: "Remove", exact: true });
    await expect(remove).toBeDisabled();
    await section.getByRole("textbox").fill("REMOVE fixture managed");
    await expect(remove).toBeDisabled();
    await section.getByRole("textbox").fill(phrase);
    await remove.click();
    await expect(section).toContainText("Removed. 6 items moved to archive/agents/fixture-managed-2026");
    expect(posted).toEqual([{ planHash: "sha256:plan", confirmation: phrase }]);
    await page.keyboard.press("Escape");
  }
});
