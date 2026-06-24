import { expect, test, type Page } from "@playwright/test";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

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
  access: {
    localhost: string;
    tailscale: string;
    tailscaleUrl?: string;
  };
  childAgents: Array<{
    id: string;
    name: string;
    url?: {
      status: "available" | "unavailable";
      local?: string;
      tailscale?: string;
    };
    ui?: {
      state?: string;
    };
    control?: {
      planAction?: "start" | "stop" | "check" | "restore";
    };
    credentials?: {
      definitions: unknown[];
    };
  }>;
};

type OperatorActionPlan = {
  actionEnabled: boolean;
  blockers: string[];
  confirmation?: {
    requiredPhrase?: string;
  };
};

type OperatorActionResult = {
  ok: boolean;
  status: string;
  errors: string[];
  execution?: {
    status: string;
  };
};

type ChildAgent = ControlCenterStatus["childAgents"][number];

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

function findRepoRoot() {
  let cursor = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(path.join(cursor, "AGENTS.md")) && existsSync(path.join(cursor, "interfaces", "control-center"))) return cursor;
    const next = path.dirname(cursor);
    if (next === cursor) break;
    cursor = next;
  }
  return path.resolve(process.cwd(), "../..");
}

function writeFakeCodexTask(status: string) {
  const root = findRepoRoot();
  const taskId = `test-${status}-${Date.now()}`;
  const taskDir = path.join(root, ".private", "interface-lab", "pritha-control-center", "realtime", "codex-tasks", taskId);
  const startedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const completedAt = new Date().toISOString();
  mkdirSync(taskDir, { recursive: true });
  writeFileSync(
    path.join(taskDir, "request.json"),
    `${JSON.stringify(
      {
        id: taskId,
        created_at: startedAt,
        status,
        task: "Synthetic Codex timeout regression task",
        task_type: "analysis",
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    path.join(taskDir, "status.json"),
    `${JSON.stringify(
      {
        status,
        phase: "stale_repaired",
        started_at: startedAt,
        completed_at: completedAt,
        updated_at: completedAt,
        timeout_ms: 1_000,
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(path.join(taskDir, "result.md"), "");
  writeFileSync(
    path.join(taskDir, "progress.jsonl"),
    `${JSON.stringify({ timestamp: startedAt, phase: "runner_started", level: "info", status: "running", message: "Synthetic task started." })}\n${JSON.stringify({ timestamp: completedAt, phase: "stale_repaired", level: "error", status, message: "Synthetic task timed out." })}\n`,
  );
  return { taskId, taskDir };
}

function writeStaleCodexTask() {
  const root = findRepoRoot();
  const taskId = `test-stale-running-${Date.now()}`;
  const taskDir = path.join(root, ".private", "interface-lab", "pritha-control-center", "realtime", "codex-tasks", taskId);
  const startedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  mkdirSync(taskDir, { recursive: true });
  writeFileSync(
    path.join(taskDir, "request.json"),
    `${JSON.stringify(
      {
        id: taskId,
        created_at: startedAt,
        status: "running",
        task: "Synthetic stale Codex runner regression task",
        task_type: "analysis",
        effective_transport: "codex-cli",
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    path.join(taskDir, "status.json"),
    `${JSON.stringify(
      {
        status: "running",
        phase: "runner_started",
        transport: "codex-cli",
        pid: 999999,
        started_at: startedAt,
        timeout_ms: 1_000,
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(path.join(taskDir, "result.md"), "");
  writeFileSync(
    path.join(taskDir, "progress.jsonl"),
    `${JSON.stringify({ timestamp: startedAt, phase: "runner_started", level: "info", status: "running", transport: "codex-cli", message: "Synthetic stale task started." })}\n`,
  );
  return { taskId, taskDir };
}

async function setAccessMode(page: Page, mode: "localhost" | "lan" | "tailscale") {
  await page.addInitScript((value) => {
    window.localStorage.setItem("pritha.defaultAccessMode", value);
    document.cookie = `pritha.defaultAccessMode=${encodeURIComponent(value)}; Path=/; SameSite=Lax; Max-Age=31536000`;
  }, mode);
}

function restoreFile(pathname: string, content: string | null) {
  if (content === null) {
    rmSync(pathname, { force: true });
    return;
  }
  writeFileSync(pathname, content);
}

test.describe("Control Center UI regression", () => {
  test("renders all primary tabs without console errors, page overflow, or raw secrets", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    for (const route of ["/agents", "/voice", "/settings", "/dev"]) {
      await page.goto(route);
      await expect(page.locator("h1:visible").first()).toBeVisible();
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
    await expect(page.getByTestId("agent-filter-toolbar")).toContainText(/\d+ shown/);
    expect(status.counts.childAgents).toBeGreaterThanOrEqual(0);

    const credentialAgent = status.childAgents.find((agent) => agent.credentials?.definitions.length);
    if (!credentialAgent) {
      test.skip(true, "No credential-enabled child agent in current registry.");
      return;
    }

    const desktopAgents = page.locator(".agents-desktop-content");
    await desktopAgents.locator(`[data-testid="agent-credentials-button"][data-agent-id="${credentialAgent.id}"]`).first().click();
    await expect(page.getByTestId("credentials-panel")).toBeVisible();
    await expect(page.getByTestId("credentials-panel")).toHaveAttribute("data-agent-id", credentialAgent.id);
    await expectNoRawSecret(page);

    await page.getByRole("button", { name: "Close credentials panel" }).click();
    await desktopAgents.getByTestId("create-agent-plan-button").click();
    await expect(page.locator('[aria-label="Open in Codex / Create Plan"]')).toBeVisible();

    await page.getByRole("button", { name: "Close create plan panel" }).click();
    await page.locator(".access-card button").click();
    await expect(page.locator(".access-modal")).toBeVisible();
    await expect(page.locator(".access-modal")).toContainText("Voice Link");
  });

  test("keeps agent card URLs aligned with localhost access mode", async ({ page }) => {
    const status = await getStatus(page);
    const agent = status.childAgents.find((item) => item.url?.local && item.ui?.state === "alive");
    if (!agent?.url?.local) {
      test.skip(true, "No alive child agent with a local URL in current registry.");
      return;
    }

    await setAccessMode(page, "localhost");
    await page.goto("/agents");
    const allButton = page.getByRole("button", { name: "All" });
    if (await allButton.isEnabled().catch(() => false)) await allButton.click();
    const localLink = page.locator(`[data-testid="agent-url-link"][data-agent-id="${agent.id}"]`).first();
    await expect(localLink).toHaveAttribute("data-url", agent.url.local);
  });

  test("uses served child-agent URLs for Tailscale access mode without inventing unserved links", async ({ page }) => {
    const status = await getStatus(page);
    const agent = status.childAgents.find((item) => item.url?.local && item.url?.tailscale && item.ui?.state === "alive");
    if (!agent?.url?.local || !agent.url.tailscale) {
      test.skip(true, "No alive child agent with a served Tailscale URL in current registry.");
      return;
    }

    if (status.access.tailscale !== "ready" || !status.access.tailscaleUrl) {
      test.skip(true, "Tailscale access is not ready in current Control Center status.");
      return;
    }

    await setAccessMode(page, "tailscale");
    await page.goto("/agents");
    const allButton = page.getByRole("button", { name: "All" });
    if (await allButton.isEnabled().catch(() => false)) await allButton.click();
    const localLink = page.locator(`[data-testid="agent-url-link"][data-agent-id="${agent.id}"]`).first();
    await expect(localLink).toHaveAttribute("data-url", agent.url.tailscale);

    const unservedAgent = status.childAgents.find((item) => item.url?.local && !item.url?.tailscale && item.ui?.state === "alive");
    if (unservedAgent) {
      await expect(page.locator(`[data-testid="agent-url-link"][data-agent-id="${unservedAgent.id}"]`)).toHaveCount(0);
    }
  });

  test("keeps active managed agents on Stop Plan while URL opening stays secondary", async ({ page }) => {
    const status = await getStatus(page);
    const agent = status.childAgents.find((item) => item.url?.local && item.ui?.state === "alive" && item.control?.planAction === "stop");
    if (!agent?.url?.local) {
      test.skip(true, "No active managed child agent with a local URL in current registry.");
      return;
    }

    await setAccessMode(page, "localhost");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/agents");

    const card = page.locator(".mobile-agent-card", { hasText: agent.name }).first();
    await expect(card.locator("button.mobile-agent-action")).toContainText("Stop Plan");
    await expect(card.locator('[data-testid="agent-primary-open-link"]')).toHaveCount(0);
    await expect(card.locator(`[data-testid="agent-url-link"][data-agent-id="${agent.id}"]`)).toHaveAttribute("data-url", agent.url.local);
  });

  test("keeps manual confirmation phrase input editable even when start execution is blocked", async ({ page }) => {
    const status = await getStatus(page);
    const pictureBoom = status.childAgents.find((item) => item.id === "picture-boom");
    const stupidJoke = status.childAgents.find((item) => item.id === "stupid-joke");
    if (!pictureBoom || !stupidJoke) {
      test.skip(true, "PictureBoom and StupidJoke must both be registered for this comparison.");
      return;
    }

    async function openStartPlan(agent: ChildAgent) {
      await page.goto("/agents");
      await page.getByRole("button", { name: "All" }).click();
      const card = page.locator(".agents-desktop-content .agent-card", { hasText: agent.name }).first();
      await expect(card).toBeVisible();

      const planResponse = page.waitForResponse((response) =>
        response.url().includes(`/api/agents/${agent.id}/actions/start/plan`) && response.ok(),
      );
      await card.locator("button.agent-action").click();
      const plan = (await (await planResponse).json()) as OperatorActionPlan;
      const requiredPhrase = plan.confirmation?.requiredPhrase || "";
      expect(requiredPhrase).toBeTruthy();

      const panel = page.locator(".operator-action-panel", { hasText: agent.name });
      await expect(panel).toBeVisible();
      await expect(panel.locator(".operator-confirmation-copy strong")).toHaveText(requiredPhrase);

      const input = panel.locator(".operator-confirmation-input input");
      await expect(input).toBeEditable();
      await input.fill(requiredPhrase);
      await expect(input).toHaveValue(requiredPhrase);

      return {
        actionEnabled: plan.actionEnabled,
        startButton: panel.getByRole("button", { name: "Start" }),
      };
    }

    const blockedPlan = await openStartPlan(pictureBoom);
    expect(blockedPlan.actionEnabled).toBe(false);
    await expect(blockedPlan.startButton).toBeDisabled();

    const executablePlan = await openStartPlan(stupidJoke);
    expect(executablePlan.actionEnabled).toBe(true);
    await expect(executablePlan.startButton).toBeEnabled();
  });

  test("guards start and stop actions behind blockers or exact confirmation", async ({ page }) => {
    const status = await getStatus(page);
    const agent = status.childAgents[0];
    if (!agent) {
      test.skip(true, "No child agents in current registry.");
      return;
    }
    const auditPath = path.join(findRepoRoot(), ".snapshots", "audit", "child-agent-operator-actions.jsonl");
    const originalAudit = existsSync(auditPath) ? readFileSync(auditPath, "utf8") : null;

    try {
      const planResponse = await page.request.get(`/api/agents/${encodeURIComponent(agent.id)}/actions/start/plan`);
      expect(planResponse.ok()).toBeTruthy();
      const plan = (await planResponse.json()) as OperatorActionPlan;

      const resultResponse = await page.request.post(`/api/agents/${encodeURIComponent(agent.id)}/actions/start`, {
        data: { confirmation: "wrong-confirmation-phrase" },
      });
      expect(resultResponse.ok()).toBeTruthy();
      const result = (await resultResponse.json()) as OperatorActionResult;

      expect(["blocked", "pending_confirmation"]).toContain(result.status);
      expect(result.execution?.status).toBe(plan.actionEnabled ? "pending_confirmation" : "blocked");
      expect(result.errors.length).toBeGreaterThan(0);
    } finally {
      restoreFile(auditPath, originalAudit);
    }

    const runtimeAgent = status.childAgents.find((item) => item.control?.planAction === "start" || item.control?.planAction === "stop");
    if (!runtimeAgent) return;

    await page.goto("/agents");
    await page.getByRole("button", { name: "All" }).click();
    await page.locator(".agents-desktop-content .agent-card", { hasText: runtimeAgent.name }).first().locator("button.agent-action").click();
    await expect(page.locator('[aria-label*="for"]').filter({ hasText: runtimeAgent.name })).toBeVisible();
    await expect(page.getByText("Manual Confirmation")).toBeVisible();
    await expect(page.getByText("Required phrase")).toBeVisible();
    await expectNoPageOverflow(page);
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

  test("guards voice context reset behind an explicit confirmation", async ({ page }) => {
    await page.goto("/voice");

    await expect(page.getByLabel("Voice input level")).toBeVisible();
    await expect(page.getByText("Voice input level").first()).toBeVisible();
    const resetButton = page.locator('button:visible').filter({ hasText: "Reset Voice Context" }).first();
    await expect(resetButton).toBeVisible();
    await expect(resetButton).toBeEnabled();
    await resetButton.click();

    await expect(page.getByText("Reset current voice context for this session?")).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirm" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
    await expectNoPageOverflow(page);

    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("Reset current voice context for this session?")).toHaveCount(0);
  });

  test("reports terminal Codex timeout with a voice-safe operator brief", async ({ page }) => {
    const { taskId, taskDir } = writeFakeCodexTask("failed_timeout");
    try {
      const response = await page.request.get(`/api/realtime/codex-task/${encodeURIComponent(taskId)}`);
      expect(response.ok()).toBeTruthy();
      const detail = await response.json();
      expect(detail.ok).toBe(true);
      expect(detail.status).toBe("failed_timeout");
      expect(detail.complete).toBe(true);
      expect(detail.operator_brief).toContain("timed out");
      expect(detail.voice_handoff_required).toBe(true);
      expect(detail.progress_timeline.length).toBeGreaterThan(0);

      const briefResponse = await page.request.post("/api/realtime/tool", {
        data: {
          name: "inspect_codex_task",
          arguments: { operation: "brief", task_id: taskId },
        },
      });
      expect(briefResponse.ok()).toBeTruthy();
      const brief = await briefResponse.json();
      expect(brief.ok).toBe(true);
      expect(brief.status).toBe("failed_timeout");
      expect(brief.operator_brief).toContain("timed out");

      const diagnoseResponse = await page.request.post("/api/realtime/tool", {
        data: {
          name: "inspect_codex_task",
          arguments: { operation: "diagnose", task_id: taskId },
        },
      });
      expect(diagnoseResponse.ok()).toBeTruthy();
      const diagnosis = await diagnoseResponse.json();
      expect(diagnosis.ok).toBe(true);
      expect(diagnosis.diagnosis).toBe("timeout");

      await page.goto("/voice");
      await expect(page.getByText("failed_timeout").first()).toBeVisible();
      await expect(page.getByText(/timed out/i).first()).toBeVisible();
    } finally {
      rmSync(taskDir, { recursive: true, force: true });
    }
  });

  test("adds voice-safe feedback when repairing a stale Codex runner", async ({ page }) => {
    const { taskId, taskDir } = writeStaleCodexTask();
    try {
      const response = await page.request.get(`/api/realtime/codex-task/${encodeURIComponent(taskId)}`);
      expect(response.ok()).toBeTruthy();
      const detail = await response.json();
      expect(detail.ok).toBe(true);
      expect(detail.status).toBe("failed_timeout");
      expect(detail.complete).toBe(true);
      expect(detail.latest_voice_feedback?.phase).toBe("stale_repaired");
      expect(detail.latest_voice_feedback?.speakable).toBe(true);
      expect(detail.latest_voice_feedback?.voice_text).toContain("Codex");
      expect(detail.voice_handoff_required).toBe(true);
    } finally {
      rmSync(taskDir, { recursive: true, force: true });
    }
  });

  test("keeps mobile primary tabs within the viewport", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });

    for (const route of ["/agents", "/voice", "/settings", "/dev"]) {
      await page.goto(route);
      await expect(page.locator(".mobile-shell")).toBeVisible();
      await expect(page.locator("h1:visible").first()).toBeVisible();
      await expectNoPageOverflow(page);
      await expectNoRawSecret(page);
    }
  });
});
