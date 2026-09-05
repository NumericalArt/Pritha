import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ request }) => {
  test.skip(process.env.PRITHA_E2E_ISOLATED_STATE !== "1" || !process.env.PRITHA_STATE_ROOT || process.env.PRITHA_CONTROL_CENTER_PORT !== "7342", "Requires the isolated settings test instance.");
  const health = await (await request.get("/api/health")).json();
  expect(health.instance.id).toBe("chat-evolution-test");
});

for (const width of [1280, 390]) {
  test(`numeric settings and explicit transport persist without draft coercion at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const endpoint = "/api/realtime/runtime-settings";
    const original = (await (await page.request.get(endpoint)).json()).settings;
    const keys = ["codexTimeoutMs", "codexPromptTokenBudget", "codexMaxPlanSteps", "codexAppThreadMaxTurns", "codexAppThreadMaxAgeHours", "deepTaskPrimaryTransport"];
    try {
      await page.goto("/settings");
      const input = (label: string) => page.locator(`input[aria-label="${label}"]:visible`);
      const save = page.locator('button:visible', { hasText: "Save Codex Runtime" });
      const timeout = input("Codex task timeout seconds");
      await timeout.fill("");
      await timeout.blur();
      await expect(timeout).toHaveValue("");
      await save.click();
      await expect(page.locator('[role="status"]:visible').filter({ hasText: "Task timeout (seconds): enter" })).toBeVisible();
      expect((await (await page.request.get(endpoint)).json()).settings.codexTimeoutMs).toBe(original.codexTimeoutMs);
      await timeout.fill("15.001");
      await page.locator('select[aria-label="Task timeout unit"]:visible').selectOption("milliseconds");
      await expect(input("Codex task timeout milliseconds")).toHaveValue("15001");
      for (const [label, value] of [["Codex prompt token budget", "4501"], ["Codex maximum plan steps", "8"], ["Codex App thread max turns", "21"], ["Codex App thread max age hours", "25"]]) {
        await input(label).fill("");
        await input(label).blur();
        await expect(input(label)).toHaveValue("");
        await input(label).fill(value);
      }
      const transport = page.locator('select[aria-label="Deep task primary transport"]:visible');
      await transport.selectOption("codex-cli");
      await save.click();
      await expect(page.getByText("Codex runtime settings saved", { exact: true }).filter({ visible: true })).toBeVisible();
      await page.reload();
      await expect(transport).toHaveValue("codex-cli");
      await expect(timeout).toHaveValue("15.001");
      const persisted = (await (await page.request.get(endpoint)).json()).settings;
      expect(keys.map(key => persisted[key])).toEqual([15001, 4501, 8, 21, 25, "codex-cli"]);
      await transport.selectOption("codex-app");
      await timeout.fill("20.002");
      await page.route("**/api/realtime/runtime-settings", route => route.request().method() === "POST" ? route.fulfill({ status: 200, contentType: "text/plain", body: "invalid upstream response" }) : route.continue());
      await save.click();
      await expect(page.getByText("Failed to save Codex runtime settings", { exact: true }).filter({ visible: true })).toBeVisible();
      await expect(timeout).toHaveValue("20.002");
      await expect(transport).toHaveValue("codex-app");
      await page.unroute("**/api/realtime/runtime-settings");
      await save.click();
      await expect(page.getByText("Codex runtime settings saved", { exact: true }).filter({ visible: true })).toBeVisible();
      expect((await (await page.request.get(endpoint)).json()).settings.deepTaskPrimaryTransport).toBe("codex-app");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    } finally {
      const restored = await page.request.post(endpoint, { data: Object.fromEntries(keys.map(key => [key, original[key]])) });
      expect(restored.ok()).toBe(true);
    }
  });
}

test("invalid settings requests fail before any persisted change", async ({ request }) => {
  const endpoint = "/api/realtime/runtime-settings";
  const before = (await (await request.get(endpoint)).json()).settings;
  for (const data of [null, [], { codexTimeoutMs: "15000" }, { codexTimeoutMs: 9999 }, { codexMaxPlanSteps: 11 }, { codexAppThreadMaxTurns: 0 }, { codexAppThreadMaxAgeHours: 1.5 }, { codexPromptTokenBudget: false }, { deepTaskPrimaryTransport: "unknown" }, { codexSandbox: "unknown" }, { codexNetworkAccess: "false" }, { codexWorkdir: [] }]) {
    const result = await request.post(endpoint, { data: JSON.stringify(data), headers: { "content-type": "application/json" } });
    expect(result.status()).toBe(400);
    expect((await result.json()).ok).toBe(false);
  }
  expect((await (await request.get(endpoint)).json()).settings).toEqual(before);
});
