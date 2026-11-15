import { test, expect } from "@playwright/test";

// Provider chats used to stay "New task chat", the stale creation phase sat
// above the live build state, and the build decision was a list nobody could
// act on. A chat is now named by its first message, the live state stands
// alone, and a decision fills the message box for the user to finish and send.
for (const width of [1440, 390]) test(`a factory chat shows its name, the live build state and choices that fill the message box at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const now = new Date().toISOString(), chat = "chat_neuraldeep_choices", providerId = "neuraldeep_runtime", modelId = "kimi-k3.1-pro";
  const thread = { chatId: chat, title: "New task chat", preview: "Create Berth Call: a cargo announcement agent", group: "my_chats", origin: "chat", status: "idle", activeFlags: [], taskLinks: [], pinned: false, archived: false,
    historyKind: "mirrored", createdAt: now, updatedAt: now, runtime: { connectorId: "neuraldeep", modelId, providerId, protocol: "exec_resume", compatibility: "bound" },
    continuationState: "continuation_enabled", subject: { kind: "child-agent", slug: "berth-call", phase: "interview" } };
  const factoryControl = { available: true, slug: "berth-call", phase: "delivery-blocked", running: false, documentsApproved: true,
    milestone: { kind: "decision", label: "Decision needed", summary: "" }, builder: { provider: "neuraldeep", modelId, effort: "none" },
    delivery: { status: "blocked", phase: "token_budget_exhausted", version: 281, iteration: 7, acceptance: "pending", lastFailureKind: "trial",
      budget: { tokensUsed: 1363821, maxTokens: 1600000, maxIterations: 24, usageStatus: "complete", overrun: 0 },
      blockers: [{ code: "token_budget_exhausted", title: "Build budget exhausted", question: "Review the work so far or allocate more budget?", explanation: "The remaining budget is insufficient for another builder call.", nextStep: "Pritha saved the work and paused new calls.",
        options: [{ id: "extend-budget", label: "Increase the limit", effect: "The increase requires separate approval." }, { id: "verify-only", label: "Verify current files", effect: "The approved checks will run without a new build." }] }] } };
  await page.route("**/api/codex-chat/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/events")) return route.fulfill({ contentType: "text/event-stream", body: ": ready\n\n" });
    const data = url.pathname.endsWith("/runtime") ? { connectorId: "neuraldeep", preferredProvider: providerId, effectiveProvider: providerId, availability: "ready",
        providers: [{ providerId, availability: "ready", locationLabel: "Neuraldeep", capabilities: { fullChat: true, steerTurn: false, interruptTurn: true, commandApprovals: true, fileChangeApprovals: true } }],
        models: [{ id: modelId }], selected: { modelId, sandboxMode: "read_only", approvalMode: "on_request" } }
      : url.pathname.endsWith("/threads") ? { data: [thread], nextCursor: null }
      : url.pathname.endsWith("/activity") ? { cursor: 0, changed: [] }
      : url.pathname.endsWith("/history") ? { data: [], hasOlder: false, olderCursor: null }
      : url.pathname.endsWith("/delivery") ? { runs: [] }
      : { thread, factoryControl, activeTurnId: null, controls: null, pendingRequests: [], queued: [], streamUrl: `/api/codex-chat/v1/threads/${chat}/events`, continuationState: "continuation_enabled", history: { state: "available" } };
    await route.fulfill({ json: { apiVersion: "1", requestId: "fixture_response", data } });
  });
  await page.goto("/task-chat?group=my_chats&chat=" + chat);
  await expect(page.locator(".codex-conversation-heading h1")).toHaveText("Create Berth Call: a cargo announcement agent");
  await expect(page.locator(".codex-conversation-heading p")).not.toContainText("Neuraldeep");
  if (width === 1440) await expect(page.locator(".codex-thread-row", { hasText: "Create Berth Call" })).toContainText("NeuralDeep");
  const progress = page.getByLabel("Building agent");
  await expect(progress).toContainText("Build: 1,363,821 / 1,600,000 tokens");
  await expect(page.getByLabel("Factory task context")).toHaveCount(0);
  await progress.getByRole("button", { name: "Increase the limit" }).click();
  await expect(page.locator(".codex-composer textarea")).toHaveValue("Increase the limit: ");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
