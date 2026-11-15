import { test, expect } from "@playwright/test";

// With all task slots busy a new chat used to fail with "The connection ended
// before the first message could be confirmed" and leave an empty chat
// (2026-11-15). The message now waits for a free slot in its chat.
for (const width of [1440, 390]) test(`a message sent while every slot is busy waits in its chat at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const now = new Date().toISOString(), chat = "chat_claude_waiting", providerId = "claude_runtime", modelId = "claude-sonnet-5-5";
  let created = false;
  const thread = () => ({ chatId: chat, title: "Write a story while slots are busy", preview: "Write a story while slots are busy", group: "my_chats", origin: "chat", status: "idle", activeFlags: [], taskLinks: [], pinned: false, archived: false,
    historyKind: "mirrored", createdAt: now, updatedAt: now, runtime: { connectorId: "claude", modelId, providerId, protocol: "exec_resume", compatibility: "bound" }, continuationState: "continuation_enabled" });
  const queued = [{ id: "q1", revision: 1, state: "queued", text: "Write a story while slots are busy", clientMessageId: "m1", createdAt: now, reason: "waiting_for_capacity", attachments: [], attachmentsUnavailable: false }];
  const detail = () => ({ thread: thread(), activeTurnId: null, controls: null, pendingRequests: [], queued, streamUrl: `/api/codex-chat/v1/threads/${chat}/events`, continuationState: "continuation_enabled", history: { state: "available" } });
  await page.route("**/api/codex-chat/v1/**", async (route) => {
    const url = new URL(route.request().url()), method = route.request().method();
    if (url.pathname.endsWith("/events")) return route.fulfill({ contentType: "text/event-stream", body: ": ready\n\n" });
    if (method === "POST" && url.pathname.endsWith("/v1/threads")) {
      created = true;
      return route.fulfill({ status: 202, json: { apiVersion: "1", requestId: "create", data: { detail: detail(), accepted: { turn: null, queued: "waiting_for_capacity", streamUrl: `/api/codex-chat/v1/threads/${chat}/events` } } } });
    }
    const data = url.pathname.endsWith("/runtime") ? { connectorId: "claude", preferredProvider: providerId, effectiveProvider: providerId, availability: "ready",
        providers: [{ providerId, availability: "ready", locationLabel: "Claude Code CLI", capabilities: { fullChat: true, steerTurn: false, interruptTurn: true, commandApprovals: true, fileChangeApprovals: true } }],
        models: [{ id: modelId }], selected: { modelId, sandboxMode: "read_only", approvalMode: "on_request" } }
      : url.pathname.endsWith("/v1/threads") ? { data: created ? [thread()] : [], nextCursor: null }
      : url.pathname.endsWith("/activity") ? { cursor: 0, changed: [], admissionEnabled: true, capacity: 3, counts: { active: 3, queued: created ? 1 : 0, waitingForOperator: 0, unknown: 0 } }
      : url.pathname.endsWith("/history") ? { data: [], hasOlder: false, olderCursor: null }
      : url.pathname.endsWith("/delivery") ? { runs: [] }
      : detail();
    await route.fulfill({ json: { apiVersion: "1", requestId: "fixture", data } });
  });
  await page.goto("/task-chat?group=my_chats");
  await page.getByRole("button", { name: /New chat/ }).first().click();
  await page.locator(".codex-composer textarea").fill("Write a story while slots are busy");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(chat));
  await expect(page.getByText("Waiting for a free task slot · Write a story while slots are busy")).toBeVisible();
  await expect(page.getByText(/connection ended before the first message/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Queue", exact: true })).toBeVisible();
  await expect(page.getByLabel("Task capacity")).toContainText("3/3 task slots in use");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
