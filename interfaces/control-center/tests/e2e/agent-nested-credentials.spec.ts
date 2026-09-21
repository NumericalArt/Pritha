import { test, expect } from "@playwright/test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

test("saves and removes a nested provider key through the real card API on desktop and mobile", async ({ page }) => {
  test.setTimeout(120000);
  expect(process.env.PRITHA_E2E_ISOLATED_STATE).toBe("1");
  const root = path.join(process.env.PRITHA_AGENT_PARENT!, "fixture-managed");
  mkdirSync(path.join(root, "operations"), { recursive: true });
  mkdirSync(path.join(root, "mvp"), { recursive: true });
  const manifest = path.join(root, "operations/manifest.json");
  const env = path.join(root, "mvp/.env.local");
  const canary = "synthetic-browser-fixture-7139";
  writeFileSync(manifest, JSON.stringify({ local_upstream_url: "http://127.0.0.1:9", credentials: [{ name: "NEURALDEEP_API_KEY", label: "NeuralDeep API key", provider: "generic", required: true, validation: "none", storage_target: "mvp/.env.local", browser_exposure: "server_only" }] }));
  writeFileSync(env, "DATABASE_URL=synthetic-database-fixture\nASSISTANT_ENABLED=false\n", { mode: 0o600 });
  try {
    for (const viewport of [{ width: 1440, height: 1080 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto("/agents");
      const response = await page.request.get("/api/status");
      const agent = (await response.json()).childAgents.find((item: { name: string }) => item.name === "Fixture Managed");
      expect(agent).toBeTruthy();
      const all = page.getByRole("button", { name: "All", exact: true }).filter({ visible: true });
      if (await all.count()) await all.first().click();
      await page.locator(`[data-testid="agent-credentials-button"][data-agent-id="${agent.id}"]:visible`).click();
      const panel = page.getByTestId("credentials-panel");
      await expect(panel).toContainText("mvp/.env.local");
      const input = panel.locator('input[type="password"]');
      await expect(input).toBeEnabled();
      await input.fill(canary);
      const savedResponse = page.waitForResponse(r => r.request().method() === "PUT" && r.url().includes("/credentials/NEURALDEEP_API_KEY"));
      await panel.getByRole("button", { name: "Save", exact: true }).click();
      const saved = await savedResponse;
      expect(saved.ok()).toBeTruthy();
      expect(await saved.text()).not.toContain(canary);
      await expect(input).toHaveValue("");
      await expect(panel).toContainText("••••7139");
      expect(readFileSync(env, "utf8")).toContain(`NEURALDEEP_API_KEY=${canary}`);
      expect(readFileSync(env, "utf8")).toContain("ASSISTANT_ENABLED=false");
      await expect(panel).not.toContainText("synthetic-database-fixture");
      page.once("dialog", dialog => dialog.accept());
      await panel.getByRole("button", { name: "Remove", exact: true }).click();
      await expect(panel).toContainText("Not configured");
      expect(readFileSync(env, "utf8")).not.toContain("NEURALDEEP_API_KEY=");
      await panel.getByRole("button", { name: "Close credentials panel" }).click();
    }
  } finally {
    rmSync(manifest, { force: true }); rmSync(path.join(root, "mvp"), { force: true, recursive: true });
  }
});
