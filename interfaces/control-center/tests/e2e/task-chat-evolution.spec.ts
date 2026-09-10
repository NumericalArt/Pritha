import { randomUUID } from "node:crypto";
import type { AttachmentView, TurnView } from "../../src/lib/codex-chat/types";
import { expect, test, type Page } from "@playwright/test";

async function mockChat(page: Page, initiallyRestored = false) {
  const now = new Date().toISOString();
  let restored = initiallyRestored;
  let archived = false;
  const control = { rejectSend: false, failUpload: false, deliveryResponse: { runs: [] } as unknown, inputModalities: ["text", "image"], sent: [] as Array<Record<string, unknown>> };
  const uploads = new Map<string, AttachmentView>();
  let sentTurn: TurnView | null = null;
  const runtime = { preferredProvider: "auto", effectiveProvider: "desktop_bundled", availability: "ready", providers: [{ providerId: "desktop_bundled", label: "Test runtime", locationLabel: "Desktop bundled", protocol: "app_server", availability: "ready", capabilities: { fullChat: true, imageInput: true, fileMetadata: true }, stateIdentityHash: "new" }], models: [{ id: "test", inputModalities: control.inputModalities }], selected: { modelId: "test", sandboxMode: "read_only" } };
  const thread = () => ({ chatId: "chat_fixture", title: "Preserved conversation", preview: "An existing message", group: "my_chats", origin: "chat", status: "idle", activeFlags: [], taskLinks: [], archived, historyKind: "native", createdAt: now, updatedAt: now, runtime: { providerId: "desktop_bundled", compatibility: restored ? "bound" : "mismatch" }, continuationState: restored ? "continuation_enabled" : "blocked_runtime_mismatch" });
  await page.route("**/api/codex-chat/v1/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/delivery")) return route.fulfill({ json: { apiVersion: "1", requestId: "delivery-fixture", data: control.deliveryResponse } });
    if (url.pathname.includes("/attachments/")) {
      const id = url.pathname.split("/").at(-1)!;
      if (route.request().method() === "PUT") {
        if (control.failUpload) { control.failUpload = false; return route.fulfill({ status: 503, json: { apiVersion: "1", error: { code: "attachment_upload_interrupted", requestId: "upload-failed", message: "Upload interrupted. Retry this file.", retryable: true } } }); }
        const name = decodeURIComponent(route.request().headers()["x-attachment-name"] || "file");
        const view: AttachmentView = { id, name, size: route.request().postDataBuffer()?.length || 0, kind: name.endsWith(".png") ? "image" : "file", mediaType: name.endsWith(".png") ? "image/png" : "application/octet-stream", href: url.pathname };
        uploads.set(id, view);
        return route.fulfill({ status: 201, json: { apiVersion: "1", requestId: "upload", data: view } });
      }
      return route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2qYIAAAAASUVORK5CYII=", "base64") });
    }
    if (route.request().method() === "POST" && (url.pathname.endsWith("/turns") || url.pathname.endsWith("/threads"))) {
      const body = route.request().postDataJSON();
      const input = body.initialTurn || body;
      control.sent.push(body);
      if (control.rejectSend) return route.fulfill({ status: 409, json: { apiVersion: "1", error: { code: "turn_start_rejected", requestId: "rejected", message: "The request was rejected. Your files were kept.", retryable: true } } });
      restored = true;
      sentTurn = { turnId: "turn_sent", clientMessageId: input.clientMessageId, status: "completed", userMessage: { id: "sent-user", role: "user", markdown: input.input[0].text, status: "completed", createdAt: now, attachments: (input.attachments || []).map((id: string) => uploads.get(id)!) }, items: [{ id: "answer-sent", kind: "assistant_message", status: "completed", startedAt: now, completedAt: now, message: { id: "answer-sent", role: "assistant", markdown: "Files received", status: "completed", createdAt: now } }], pendingRequestIds: [], startedAt: now, completedAt: now, error: null };
      const detail = { thread: thread(), continuationState: thread().continuationState, pendingRequests: [], streamUrl: "/api/codex-chat/v1/threads/chat_fixture/events" };
      const accepted = { turn: sentTurn, streamUrl: detail.streamUrl };
      return route.fulfill({ status: 202, json: { apiVersion: "1", requestId: "sent", data: body.initialTurn ? { detail, accepted } : accepted } });
    }
    if (url.pathname.endsWith("/events")) return route.fulfill({ contentType: "text/event-stream", body: ": ready\n\n" });
    if (url.pathname.endsWith("/restore-access")) restored = true;
    if (url.pathname.endsWith("/archive")) archived = true;
    if (url.pathname.endsWith("/unarchive")) archived = false;
    if (url.pathname.endsWith("/history") && !restored) return route.fulfill({ status: 409, json: { apiVersion: "1", error: { requestId: "fixture-error", code: "history_recovery_available", message: "The original conversation was verified. Restore access to open it.", retryable: false } } });
    const data = url.pathname.endsWith("/runtime") ? runtime
      : url.pathname.endsWith("/threads") ? { data: (url.searchParams.get("archived") === "true") === archived ? [thread()] : [], nextCursor: null }
      : url.pathname.endsWith("/history") ? { data: sentTurn ? [sentTurn] : [{ turnId: "turn_fixture", status: "completed", userMessage: { id: "user", markdown: "Original question" }, items: [{ id: "answer", kind: "assistant_message", status: "completed", message: { id: "answer", markdown: "Original answer", status: "completed" } }], startedAt: now, pendingRequestIds: [] }], olderCursor: null }
      : { thread: thread(), streamUrl: "/api/codex-chat/v1/threads/chat_fixture/events", continuationState: thread().continuationState, pendingRequests: [], history: { state: restored ? "available" : "recovery_available", recoverable: !restored } };
    return route.fulfill({ json: { apiVersion: "1", requestId: "fixture", data } });
  });
  return control;
}

for (const width of [1280, 390]) {
  test(`Task Chat omits agent build controls and discovery at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await mockChat(page, true);
    const requests: string[] = [], errors: string[] = [];
    page.on("request", request => { if (/\/(delivery|operations)(?:[/?]|$)/.test(new URL(request.url()).pathname)) requests.push(request.url()); });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto("/task-chat?chat=chat_fixture&group=my_chats");
    await expect(page.getByText("Original answer", { exact: true })).toBeVisible();
    await expect(page.locator(".codex-delivery-panel")).toHaveCount(0);
    await expect(page.getByText("Сборка агента", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Read original text|Read more text/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Read original text|Read more text/i })).toHaveCount(0);
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
  });
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

for (const width of [1280, 390]) {
  test(`original attachments upload, survive rejection and return in history at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const control = await mockChat(page);
    await page.goto("/task-chat?chat=chat_fixture&group=my_chats");
    await page.getByRole("button", { name: "Restore access", exact: true }).click();
    await page.locator('input[type="file"]').setInputFiles([
      { name: "notes.md", mimeType: "text/markdown", buffer: Buffer.from("# Original") },
      { name: "movie.mp4", mimeType: "video/mp4", buffer: Buffer.from("video-original") },
      { name: "bundle.zip", mimeType: "application/zip", buffer: Buffer.from("PKoriginal") },
    ]);
    const draftFiles = page.getByLabel("Draft attachments");
    await expect(draftFiles.getByText("Ready", { exact: true })).toHaveCount(3);
    control.rejectSend = true;
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByText("The request was rejected. Your files were kept.")).toBeVisible();
    await expect(draftFiles.getByText("Ready", { exact: true })).toHaveCount(3);
    control.rejectSend = false;
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.getByLabel("Message attachments").getByRole("link")).toHaveCount(3);
    expect(control.sent.at(-1)?.attachments).toEqual(control.sent[0].attachments);
    expect((control.sent[0].input as Array<{ text: string }>)[0].text).toBe("");
    await page.screenshot({ path: `/tmp/pritha-chat-attachments-${width}.png`, fullPage: true });
    await page.reload();
    await expect(page.getByLabel("Message attachments").getByRole("link")).toHaveCount(3);
  });
}

test("upload retry, pasted images and attachment-only new chats", async ({ page }) => {
  const control = await mockChat(page);
  await page.goto("/task-chat?chat=chat_fixture&group=my_chats");
  await page.getByRole("button", { name: "Restore access", exact: true }).click();
  await page.getByRole("button", { name: "New chat", exact: true }).click();
  control.failUpload = true;
  await page.locator('input[type="file"]').setInputFiles({ name: "note.txt", mimeType: "text/plain", buffer: Buffer.from("original") });
  await page.getByRole("button", { name: "Retry upload", exact: true }).click();
  await expect(page.getByLabel("Draft attachments").getByText("Ready", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Remove note.txt", exact: true }).click();
  await page.locator(".codex-composer textarea").evaluate(el => {
    const clipboard = new DataTransfer();
    clipboard.items.add(new File([new Uint8Array([137,80,78,71])], "pasted.png", { type: "image/png" }));
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }));
  });
  await expect(page.getByLabel("Draft attachments").getByRole("img", { name: "pasted.png" })).toBeVisible();
  await page.locator(".codex-composer").evaluate(el => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["audio-original"], "dropped.mp3", { type: "audio/mpeg" }));
    el.dispatchEvent(new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }));
  });
  await expect(page.getByLabel("Draft attachments").getByText("Ready", { exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByLabel("Message attachments").getByRole("link")).toHaveCount(2);
  expect(control.sent[0].initialTurn).toBeTruthy();
});

test("isolated real upload route preserves an original larger than the default proxy limit", async ({ request }) => {
  test.skip(process.env.PRITHA_INSTANCE_ID !== "chat-evolution-test", "Only run against the explicitly isolated test instance.");
  const health = await (await request.get("/api/health")).json();
  expect(health.instance.id).toBe("chat-evolution-test");
  expect(health.instance.role).toBe("developer");
  const id = randomUUID();
  const original = Buffer.alloc(12 * 1024 * 1024, 127);
  const url = `/api/codex-chat/v1/attachments/${id}`;
  const upload = await request.put(url, { headers: { "Content-Type": "application/octet-stream", "X-Attachment-Name": "original.bin" }, data: original });
  expect(upload.status()).toBe(201);
  expect((await upload.json()).data.size).toBe(original.length);
  const download = await request.get(url);
  expect(download.status()).toBe(200);
  expect(download.headers()["x-content-type-options"]).toBe("nosniff");
  expect(await download.body()).toEqual(original);
});

test("earlier history remains readable after a failed page and a refresh", async ({ page }) => {
  await mockChat(page, true);
  const now = "2026-09-05T00:00:00Z";
  let failOlder = true;
  const turn = (id: string) => ({ turnId: id, status: "completed", startedAt: id === "old" ? "2026-09-01T00:00:00Z" : now, userMessage: { markdown: `${id} question` }, items: [{ id, kind: "assistant_message", status: "completed", message: { markdown: `${id} answer`, status: "completed" } }] });
  await page.route("**/api/codex-chat/v1/threads/chat_fixture/history?**", async route => {
    const earlier = new URL(route.request().url()).searchParams.has("cursor");
    if (earlier && failOlder) { failOlder = false; return route.fulfill({ status: 503, json: { apiVersion: "1", error: { code: "history_unavailable", requestId: "earlier", message: "Earlier history is temporarily unavailable.", retryable: true } } }); }
    await route.fulfill({ json: { apiVersion: "1", requestId: "page", data: { data: [turn(earlier ? "old" : "recent")], olderCursor: earlier ? null : "older-fixture" } } });
  });
  await page.goto("/task-chat?chat=chat_fixture");
  await expect(page.getByText("recent answer", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Load earlier messages" }).click();
  await expect(page.getByText("Earlier history is temporarily unavailable.", { exact: true })).toBeVisible();
  await expect(page.getByText("recent answer", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Load earlier messages" }).click();
  await expect(page.getByText("old answer", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Load earlier messages" })).toHaveCount(0);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByText("old answer", { exact: true })).toBeVisible();
  await expect(page.getByText("recent answer", { exact: true })).toBeVisible();
});

for (const width of [1280, 390]) {
  test(`local report links stay safe without agent controls at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 850 });
    await mockChat(page, true);
    await page.route("**/api/codex-chat/v1/threads/chat_fixture/history?**", route => route.fulfill({ json: { apiVersion: "1", requestId: "fixture", data: { data: [{ turnId: "links", status: "completed", userMessage: { markdown: "Show the report" }, items: [{ id: "links", kind: "assistant_message", status: "completed", message: { markdown: "[Handoff](/Users/<user>/Pritha-state/agents/reports/handoff.md) and [README](./README.md)", status: "completed" } }], pendingRequestIds: [] }], olderCursor: null } } }));
    await page.goto("/task-chat?chat=chat_fixture&group=my_chats");
    await expect(page.locator(".codex-markdown code[title='Handoff']")).toBeVisible();
    await expect(page.locator('a[href*="/Users/"]')).toHaveCount(0);
    await expect(page.locator(".codex-delivery-panel, .codex-operation-decisions")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBeTruthy();
  });
}

for (const width of [390, 1280]) test(`bounded history reveals details and copies complete Unicode at ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 850 });
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text: string) => { (window as unknown as { copiedText: string }).copiedText = text; } } }));
  await mockChat(page, true);
  const chunks = Array.from({ length: 4 }, (_, i) => `Part ${i}\n\n${"Complete 🙂 answer\n\n".repeat(500)}`), original = chunks.join("");
  let itemReads = 0, failContent = true;
  const row = { turnId: "bounded", status: "completed", userMessage: { id: "u", markdown: "Question" }, items: [{ id: "a", kind: "assistant_message", message: { id: "a", markdown: "Short preview", contentRef: "part0" } }], history: { itemsRef: "items", itemsState: "not_loaded", sourceMode: "native" }, pendingRequestIds: [] };
  await page.route("**/api/codex-chat/v1/threads/chat_fixture/history**", async route => {
    const url = new URL(route.request().url());
    let data: unknown;
    if (url.pathname.endsWith("/content")) {
      if (failContent) { failContent = false; return route.fulfill({ status: 503, json: { apiVersion: "1", error: { requestId: "failed", code: "history_unavailable", message: "Details temporarily unavailable.", retryable: true } } }); }
      const index = Number(url.searchParams.get("cursor")!.slice(4));
      const complete = index === chunks.length - 1;
      data = { text: chunks[index], nextCursor: complete ? null : `part${index + 1}`, complete };
    } else if (url.pathname.endsWith("/items")) { itemReads++; data = { data: row.items, nextCursor: null }; }
    else data = { data: [row], olderCursor: null };
    return route.fulfill({ json: { apiVersion: "1", requestId: "bounded", data } });
  });
  await page.goto("/task-chat?chat=chat_fixture&group=my_chats");
  await expect(page.getByText("Short preview", { exact: true })).toBeVisible();
  expect(itemReads).toBe(0);
  await expect(page.getByRole("button", { name: /Read original text|Read more text/i })).toHaveCount(0);
  await expect(page.getByText("Details temporarily unavailable.", { exact: false })).toBeVisible();
  await expect(page.getByText("Short preview", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Copy response", exact: true }).click();
  await expect(page.getByText("Copied", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { copiedText: string }).copiedText)).toBe(original);
  expect(itemReads).toBe(1);
  await page.getByRole("button", { name: "Retry loading text", exact: true }).click();
  await expect(page.getByText("Short preview", { exact: true })).toHaveCount(0);
  await expect(page.locator(".codex-history-text").filter({ hasText: "Part 0" })).toBeVisible();
  // Newly appended text must not pull the composer outside the viewport.
  const composer = await page.locator(".codex-composer").boundingBox();
  expect(composer).not.toBeNull();
  expect(composer!.y + composer!.height).toBeLessThanOrEqual(852);
  await page.locator('.codex-activity > summary').filter({ hasText: "Activity" }).click();
  expect(itemReads).toBeGreaterThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("history arriving after the former 12 second timeout remains usable", async ({ page }) => {
  test.setTimeout(25000);
  const control = await mockChat(page, true);
  await page.route("**/api/codex-chat/v1/threads/chat_fixture/history?**", async route => {
    await new Promise(resolve => setTimeout(resolve, 13000));
    await route.fulfill({ json: { apiVersion: "1", requestId: "slow", data: { data: [{ turnId: "slow", status: "completed", userMessage: { markdown: "Slow question" }, items: [{ id: "a", kind: "assistant_message", message: { markdown: "Arrived safely" } }], pendingRequestIds: [] }], olderCursor: null } } });
  });
  await page.goto("/task-chat?chat=chat_fixture&group=my_chats");
  await expect(page.getByText("Still loading history…", { exact: false })).toBeVisible({ timeout: 6000 });
  await expect(page.getByText("Arrived safely", { exact: true })).toBeVisible({ timeout: 16000 });
  expect(control.sent).toHaveLength(0);
});

test("mobile recent page fits five seconds with modeled 1 Mbps and 300 ms latency", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 850 });
  await mockChat(page, true);
  const rows = Array.from({ length: 20 }, (_, i) => ({ turnId: `mobile${i}`, status: "completed", userMessage: { markdown: `Question ${i} ${"text ".repeat(750)}` }, items: [{ id: `a${i}`, kind: "assistant_message", message: { markdown: `Answer ${i} ${"text ".repeat(750)}` } }], history: { itemsRef: `items${i}`, itemsState: "not_loaded", sourceMode: "native" }, pendingRequestIds: [] }));
  const body = JSON.stringify({ apiVersion: "1", requestId: "mobile", data: { data: rows, olderCursor: "older" } });
  expect(Buffer.byteLength(body)).toBeLessThan(256 * 1024);
  let started = 0;
  await page.route("**/api/codex-chat/v1/threads/chat_fixture/history?**", async route => {
    started = Date.now();
    await new Promise(resolve => setTimeout(resolve, 300 + Math.ceil(Buffer.byteLength(body) * 8 / 1000)));
    await route.fulfill({ contentType: "application/json", body });
  });
  await page.goto("/task-chat?chat=chat_fixture&group=my_chats");
  await expect(page.getByText(/^Answer 19 /)).toBeVisible();
  expect(started).toBeGreaterThan(0);
  expect(Date.now() - started).toBeLessThan(5000);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("isolated candidate serves health, Task Chat, Codex alias and every referenced JS chunk", async ({ request }) => {
  const health = await request.get("/api/health");
  expect(health.ok()).toBe(true);
  expect(await health.json()).toMatchObject({ schema: "pritha-control-center-health-v2", service: "pritha-control-center", status: "ready", ok: true });
  const chunks = new Set<string>();
  for (const route of ["/task-chat", "/codex"]) {
    const response = await request.get(route);
    expect(response.ok()).toBe(true);
    const html = await response.text();
    for (const match of html.matchAll(/src="([^" ]*\/_next\/static\/[^" ]+\.js[^" ]*)"/g)) chunks.add(match[1].replaceAll("&amp;", "&"));
  }
  expect(chunks.size).toBeGreaterThan(0);
  for (const chunk of chunks) {
    const response = await request.get(chunk);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toMatch(/javascript/);
    expect((await response.body()).length).toBeGreaterThan(20);
  }
});
