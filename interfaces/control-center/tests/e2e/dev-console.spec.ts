import { expect, test } from "@playwright/test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

// The Developer page reads saved evidence: the installed release, the latest
// factory runs with the reason a run stopped and the first line of a failed
// check, and a link back to the run's chat. Times are Central European.
test("the developer page shows the release, a stuck build with its failed check and no dead controls", async ({ page }) => {
  const state = process.env.PRITHA_STATE_ROOT!;
  const release = path.join(state, "releases", "e2e-main-2026-11-15");
  const run = path.join(state, "builds", "dev-demo", "voice-dev-demo-0001");
  const session = path.join(state, "agents", "voice-factory", "dev-demo");
  try {
    mkdirSync(release, { recursive: true });
    writeFileSync(path.join(release, "release.json"), JSON.stringify({ status: "deployed-verified", commit: "dc4bd33e9a6bafcf", build: "buildE2E", previousBuild: "buildOld",
      strictHealth: "pass", operationalHealth: "pass", desktopMobileUi: "pass", postInstallSelfTest: "pass", rollbackRetained: true, updatedAt: "2026-11-15T17:30:00.000Z" }));
    mkdirSync(path.join(run, "trial-results"), { recursive: true });
    writeFileSync(path.join(run, "build-state.json"), JSON.stringify({ run_id: "voice-dev-demo-0001", agent_slug: "dev-demo", status: "blocked", phase: "token_budget_exhausted", iteration: 7,
      created_at: "2026-11-15T12:38:29.000Z", updated_at: "2026-11-15T16:17:49.000Z",
      budget: { max_iterations: 24, max_tokens: 1600000, tokens_used: 1363821, max_elapsed_ms: 3600000, accounted_turns: [{ model_observed: "kimi-k3.1-pro" }] },
      blockers: [{ code: "token_budget_exhausted", summary: "The remaining authorized tokens cannot cover the next provider request reservation." }] }));
    writeFileSync(path.join(run, "trial-results", "verification-013.json"), JSON.stringify({ trials: [
      { id: "product-http-cli", status: "passed", execution: { stderr: "" } },
      { id: "managed-stop", status: "failed", execution: { stderr: "node:internal/modules/run_main:107\n    triggerUncaughtException(\nAssertionError [ERR_ASSERTION]: Owned Stop failed: Stop rejected: ownership verification failed\n" } },
    ] }));
    mkdirSync(session, { recursive: true });
    writeFileSync(path.join(session, "session.json"), JSON.stringify({ runId: "voice-dev-demo-0001", chatId: "chat_neuraldeep_devdemo" }));
    for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto("/dev");
      const releasePanel = page.locator('[data-testid="dev-release"]:visible');
      await expect(releasePanel).toContainText("dc4bd33e9a6b");
      await expect(releasePanel).toContainText("buildE2E");
      await expect(releasePanel).toContainText("Strict health");
      await expect(releasePanel).toContainText(/Installed\s*15 Nov, 18:30 CET/);
      const build = page.locator('[data-testid="dev-builds"]:visible article', { hasText: "dev-demo" });
      await expect(build).toContainText("1,363,821 / 1,600,000");
      await expect(build).toContainText("kimi-k3.1-pro");
      await expect(build).toContainText("token_budget_exhausted");
      await expect(build).toContainText("managed-stop AssertionError [ERR_ASSERTION]: Owned Stop failed: Stop rejected: ownership verification failed");
      await expect(build).toContainText(/Time window\s*ended 15 Nov, 14:38 CET/);
      await expect(build.getByRole("link", { name: "Chat" })).toHaveAttribute("href", "/task-chat?group=all&chat=chat_neuraldeep_devdemo");
      for (const dead of ["View All Reports →", "Open Folder", "View Raw", "Recent Logs"]) await expect(page.getByText(dead, { exact: false })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  } finally {
    for (const dir of [release, path.dirname(run), session]) rmSync(dir, { recursive: true, force: true });
  }
});
