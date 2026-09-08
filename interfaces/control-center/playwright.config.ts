import { defineConfig, devices } from "@playwright/test";

if (process.env.PRITHA_E2E_ISOLATED_STATE !== "1") throw new Error("Use npm run test:e2e for isolated browser tests");
const baseURL = process.env.PLAYWRIGHT_BASE_URL!;

export default defineConfig({
  testDir: "./tests/e2e",
  workers: 1,
  reporter: [["line"], ["json", { outputFile: process.env.PRITHA_E2E_REPORT }]],
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node scripts/e2e-server.mjs",
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 10000 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
