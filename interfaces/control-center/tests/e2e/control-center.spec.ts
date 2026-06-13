import { expect, test, type Page } from "@playwright/test";

type ControlCenterStatus = {
  app: {
    version: string;
  };
  selfTest: {
    ageLabel: string;
  };
  counts: {
    childAgents: number;
  };
  childAgents: Array<{
    id: string;
    name: string;
    credentials?: {
      definitions: unknown[];
    };
  }>;
};

async function getStatus(page: Page) {
  const response = await page.request.get("/api/status");
  expect(response.ok()).toBeTruthy();
  return (await response.json()) as ControlCenterStatus;
}

async function expectNoPageOverflow(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2))
    .toBeTruthy();
}

async function expectNoRawSecret(page: Page) {
  const text = (await page.locator("body").textContent()) || "";
  expect(text).not.toMatch(/sk-[A-Za-z0-9_-]{20,}/);
  expect(text).not.toMatch(/OPENAI_API_KEY\s*=\s*[^*\s]{8,}/);
}

test.describe("Control Center UI regression", () => {
  test("renders all primary tabs without console errors, page overflow, or raw secrets", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    for (const route of ["/agents", "/voice", "/settings", "/dev"]) {
      await page.goto(route);
      await expect(page.locator("h1:visible")).toBeVisible();
      await expect(page.locator(".status-strip:visible")).toContainText("Pritha");
      await expectNoPageOverflow(page);
      await expectNoRawSecret(page);
    }

    expect(consoleErrors).toEqual([]);
  });

  test("keeps agents filters, credentials drawer, create-plan drawer, and voice-link modal interactive", async ({ page }) => {
    const status = await getStatus(page);
    await page.goto("/agents");

    await page.getByRole("button", { name: "All" }).click();
    await expect(page.getByTestId("agent-filter-toolbar")).toContainText(`${status.counts.childAgents} shown`);

    const credentialAgent = status.childAgents.find((agent) => agent.credentials?.definitions.length);
    if (!credentialAgent) {
      test.skip(true, "No credential-enabled child agent in current registry.");
      return;
    }

    await page.locator(`[data-testid="agent-credentials-button"][data-agent-id="${credentialAgent.id}"]:visible`).click();
    await expect(page.getByTestId("credentials-panel")).toBeVisible();
    await expect(page.getByTestId("credentials-panel")).toHaveAttribute("data-agent-id", credentialAgent.id);
    await expectNoRawSecret(page);

    await page.getByRole("button", { name: "Close credentials panel" }).click();
    await page.getByTestId("create-agent-plan-button").click();
    await expect(page.locator('[aria-label="Open in Codex / Create Plan"]')).toBeVisible();

    await page.getByRole("button", { name: "Close create plan panel" }).click();
    await page.locator(".access-card button").click();
    await expect(page.locator(".access-modal")).toBeVisible();
    await expect(page.locator(".access-modal")).toContainText("Voice Link");
  });

  test("shows backend-driven Settings and Dev status instead of stale mock labels", async ({ page }) => {
    const status = await getStatus(page);

    await page.goto("/settings");
    await expect(page.locator(".summary-card").first()).toContainText(status.app.version);
    await expect(page.locator(".summary-card").first()).toContainText(status.selfTest.ageLabel);
    await expect(page.locator(".summary-card").first()).not.toContainText("2h 13m");
    await expect(page.locator(".summary-card").first()).not.toContainText("2 hours ago");

    await page.goto("/dev");
    await expect(page.locator(".readiness-panel").first()).toContainText(`Last self-test: ${status.selfTest.ageLabel}`);
    await expect(page.locator(".readiness-panel").first()).not.toContainText("Last self-test: 2h ago");
  });

  test("keeps mobile primary tabs within the viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    for (const route of ["/agents", "/voice", "/settings", "/dev"]) {
      await page.goto(route);
      await expect(page.locator(".mobile-shell")).toBeVisible();
      await expect(page.locator("h1:visible")).toBeVisible();
      await expectNoPageOverflow(page);
      await expectNoRawSecret(page);
    }
  });
});
