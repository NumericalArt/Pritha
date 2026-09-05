import { expect, test, type Page } from "@playwright/test";

async function mockChat(page: Page) {
  const now = new Date().toISOString();
  let restored = false;
  let archived = false;
  const runtime = { preferredProvider: "auto", effectiveProvider: "desktop_bundled", availability: "ready", providers: [{ providerId: "desktop_bundled", label: "Test runtime", locationLabel: "Desktop bundled", protocol: "app_server", availability: "ready", capabilities: { fullChat: true }, stateIdentityHash: "new" }], models: [], selected: { modelId: "test", sandboxMode: "read_only" } };
  const thread = () => ({ chatId: "chat_fixture", title: "Preserved conversation", preview: "An existing message", group: "my_chats", origin: "chat", status: "idle", activeFlags: [], taskLinks: [], archived, historyKind: "native", createdAt: now, updatedAt: now, runtime: { providerId: "desktop_bundled", compatibility: restored ? "bound" : "mismatch" }, continuationState: restored ? "continuation_enabled" : "blocked_runtime_mismatch" });
  await page.route("**/api/codex-chat/v1/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/events")) return route.fulfill({ contentType: "text/event-stream", body: ": ready\n\n" });
    if (url.pathname.endsWith("/restore-access")) restored = true;
    if (url.pathname.endsWith("/archive")) archived = true;
    if (url.pathname.endsWith("/unarchive")) archived = false;
    if (url.pathname.endsWith("/turns") && !restored) return route.fulfill({ status: 409, json: { apiVersion: "1", error: { requestId: "fixture-error", code: "history_recovery_available", message: "The original conversation was verified. Restore access to open it.", retryable: false } } });
    const data = url.pathname.endsWith("/runtime") ? runtime
      : url.pathname.endsWith("/threads") ? { data: (url.searchParams.get("archived") === "true") === archived ? [thread()] : [], nextCursor: null }
      : url.pathname.endsWith("/turns") ? { data: [{ turnId: "turn_fixture", status: "completed", userMessage: { id: "user", markdown: "Original question" }, items: [{ id: "answer", kind: "assistant_message", status: "completed", message: { id: "answer", markdown: "Original answer", status: "completed" } }], startedAt: now, pendingRequestIds: [] }], olderCursor: null }
      : { thread: thread(), continuationState: thread().continuationState, pendingRequests: [], history: { state: restored ? "available" : "recovery_available", recoverable: !restored } };
    return route.fulfill({ json: { apiVersion: "1", requestId: "fixture", data } });
  });
}

for (const width of [1280, 390]) {
  test(`history recovery explains a blocked chat and opens its original at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await mockChat(page);
    await page.goto("/task-chat?chat=chat_fixture&group=my_chats");
    await expect(page.getByRole("button", { name: "Restore access", exact: true })).toBeVisible();
    await expect(page.getByText("What should Pritha do?")).toHaveCount(0);
    await expect(page.getByPlaceholder("Retry history before sending…")).toBeDisabled();
    await page.getByRole("button", { name: "Restore access", exact: true }).click();
    await expect(page.getByText("Original answer", { exact: true })).toBeVisible();
    await expect(page.getByText("Original question", { exact: true })).toBeVisible();
  });
}

for (const width of [1280, 390]) {
  test(`archive, restore and copy response at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { (window as unknown as { copiedText: string }).copiedText = text; } } }));
    await mockChat(page);
    await page.goto("/task-chat?chat=chat_fixture&group=my_chats");
    await page.getByRole("button", { name: "Restore access", exact: true }).click();
    await page.getByRole("button", { name: "Copy response", exact: true }).click();
    await expect(page.getByText("Copied", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { copiedText: string }).copiedText)).toBe("Original answer");
    if (width < 700) await page.getByRole("button", { name: "Open chat history", exact: true }).click();
    const history = page.locator('.codex-history:visible, .codex-history-drawer:visible');
    await expect(history.getByRole("button", { name: "Legacy", exact: true })).toHaveCount(0);
    await history.getByRole("button", { name: "Archive", exact: true }).click();
    await expect(history.getByRole("button", { name: /Preserved conversation/ })).toHaveCount(0);
    await history.getByRole("button", { name: "Show archived", exact: true }).click();
    await expect(history.getByRole("button", { name: /Preserved conversation/ })).toBeVisible();
    await history.getByRole("button", { name: "Restore from archive", exact: true }).click();
    await history.getByRole("button", { name: "Show active", exact: true }).click();
    await expect(history.getByRole("button", { name: /Preserved conversation/ })).toBeVisible();
  });
}

test("copy reports denied clipboard permission", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => { throw new Error("denied"); } } }));
  await mockChat(page);
  await page.goto("/task-chat?chat=chat_fixture&group=my_chats");
  await page.getByRole("button", { name: "Restore access", exact: true }).click();
  await page.getByRole("button", { name: "Copy response", exact: true }).click();
  await expect(page.getByText("Clipboard access was denied.", { exact: false })).toBeVisible();
});
