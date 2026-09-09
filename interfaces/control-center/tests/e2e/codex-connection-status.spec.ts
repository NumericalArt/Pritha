import { expect, test } from "@playwright/test";

for (const width of [1280, 390]) {
  test(`Codex connection distinguishes pending, ready, unavailable and unknown at ${width}px`, async ({ page }) => {
    expect(process.env.PRITHA_E2E_ISOLATED_STATE).toBe("1");
    await page.setViewportSize({ width, height: 900 });
    const health = await (await page.request.get("/api/health")).json();
    expect(health.instance.id).toBe("chat-evolution-test");
    const authResponse = await page.request.get("/api/settings/codex-auth");
    expect(authResponse.ok()).toBe(true);
    const auth = await authResponse.json();
    // Exercise the real route before replacing its response for UI edge cases.
    expect(typeof auth.codex.appServer.available).toBe("boolean");
    const runtime = await (await page.request.get("/api/realtime/runtime-settings")).json();
    expect(auth.codex.appServer.available).toBe(runtime.transports.codex_app.available);
    const originalTransport = runtime.settings.deepTaskPrimaryTransport;
    let appServer: { available?: boolean } = { available: true };
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/settings/codex-auth", async route => {
      await pending;
      await route.fulfill({ json: { ...auth, codex: { ...auth.codex, appServer } } });
    });
    await page.route("**/api/realtime/runtime-settings", route => route.fulfill({
      json: { ...runtime, transports: { ...runtime.transports, codex_app: { available: true } } },
    }));
    await page.goto("/settings");
    const card = page.locator("section.settings-section:visible").filter({ has: page.getByRole("heading", { name: "Codex Connection", exact: true }) });
    const row = card.locator(".settings-rowline").filter({ has: page.getByText("Codex App Server", { exact: true }) });
    try {
      await expect(row.locator(".settings-status-chip")).toHaveText("Loading");
    } finally { release(); }
    await expect(row.locator(".settings-status-chip")).toHaveText("Ready");
    await expect(page.getByText("Codex App ready", { exact: true }).filter({ visible: true })).toBeVisible();
    appServer = { available: false };
    await card.getByRole("button", { name: "Check Status" }).click();
    await expect(row.locator(".settings-status-chip")).toHaveText("Unavailable");
    appServer = {};
    await card.getByRole("button", { name: "Check Status" }).click();
    await expect(row.locator(".settings-status-chip")).toHaveText("Unknown");
    await expect(row.locator(".settings-status-chip")).not.toHaveClass(/missing/);
    const after = await (await page.request.get("/api/realtime/runtime-settings")).json();
    expect(after.settings.deepTaskPrimaryTransport).toBe(originalTransport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
