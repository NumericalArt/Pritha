import { expect, test, type Page, type Route } from "@playwright/test";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

test("isolated candidate passes strict page and JavaScript chunk health", async ({ baseURL }) => {
  const { stdout } = await promisify(execFile)(process.execPath, [path.resolve("../../scripts/control-center-health.mjs"), "--base-url", baseURL!, "--strict", "--json"], { timeout: 25_000, maxBuffer: 2 * 1024 * 1024 });
  const result = JSON.parse(stdout);
  expect(result.status).toBe("pass");
  expect(result.pages.map((page: any) => page.path || new URL(page.url).pathname)).toEqual(expect.arrayContaining(["/voice", "/agents", "/task-chat", "/codex", "/settings"]));
  expect(result.chunks.length).toBeGreaterThan(0);
  expect(result.chunks.every((chunk: any) => chunk.status === "pass")).toBe(true);
});

async function fixture(page: Page, history = false) {
  // WebKit does not expose Blob upload bytes through request.postDataBuffer().
  // Capture the actual synthetic Blob before fetch; never substitute made-up bytes.
  await page.addInitScript(() => {
    const original = window.fetch.bind(window);
    const uploads: Record<string, number[]> = {};
    (window as any).__composerFixtureUploads = uploads;
    window.fetch = async (input, init) => {
      if (typeof input === "string" && init?.method === "PUT" && init.body instanceof Blob && /\/api\/codex-chat\/v1\/attachments\//.test(input)) uploads[input] = [...new Uint8Array(await init.body.arrayBuffer())];
      return original(input, init);
    };
  });
  const now = new Date().toISOString();
  const control = { editMode: "success", sent: [] as any[], puts: [] as { id: string; body: Buffer; name: string }[], held: [] as { route: Route; view: any }[], missingOriginal: false, rejectSend: false, unknownSend: false, active: false, modelImages: true, holdQueue: false, queueRoutes: [] as Route[] };
  const files = new Map<string, { body: Buffer; view: any }>();
  const row = (id: string) => ({ chatId: id, title: id === "chat_A" ? "Chat A" : "Chat B", group: "my_chats", origin: "chat", status: "idle", activeFlags: [], taskLinks: [], archived: false, historyKind: "native", createdAt: now, updatedAt: now, runtime: { providerId: "desktop_bundled", compatibility: "bound" }, continuationState: "continuation_enabled" });
  const answer = { id: "answer_original", kind: "assistant_message", status: "completed", message: { id: "answer_original", role: "assistant", markdown: "Первая строка 🪷\n\nВторая строка ответа", status: "completed" } };
  const turn = { turnId: "turn_original", status: "completed", userMessage: { id: "user_original", markdown: "Original question" }, items: [answer], startedAt: now, pendingRequestIds: [], ...(history ? { history: { itemsRef: null } } : {}) };
  await page.route("**/api/codex-chat/v1/**", async route => {
    const request = route.request(), url = new URL(request.url()), pathname = url.pathname;
    const chatId = pathname.split("/")[5] || "chat_A";
    if (pathname.includes("/attachments/")) {
      const id = pathname.split("/").at(-1)!;
      if (request.method() === "PUT") {
        const captured = request.postDataBuffer() || await page.evaluate(path => (window as any).__composerFixtureUploads[path], pathname);
        if (!captured) throw new Error("The fixture could not capture the actual upload bytes.");
        const body = Buffer.from(captured), name = decodeURIComponent(request.headers()["x-attachment-name"]);
        control.puts.push({ id, body, name });
        const view = { id, name, size: body.length, kind: name.endsWith(".txt") ? "file" : "image", mediaType: name.endsWith(".txt") ? "application/octet-stream" : name.endsWith(".jpg") ? "image/jpeg" : name.endsWith(".gif") ? "image/gif" : "image/png", href: pathname };
        const prior = files.get(id);
        if (prior && !prior.body.equals(body)) return route.fulfill({ status: 409, json: { apiVersion: "1", error: { code: "attachment_conflict", requestId: "fixture", retryable: false, message: "Conflicting bytes" } } });
        files.set(id, { body, view });
        if (name.endsWith(".annotated.png")) {
          if (control.editMode === "fail") { control.editMode = "success"; return route.fulfill({ status: 503, json: { apiVersion: "1", error: { code: "attachment_upload_interrupted", requestId: "fixture", message: "Synthetic upload failure", retryable: true } } }); }
          if (control.editMode === "hold") { control.held.push({ route, view }); return; }
        }
        return route.fulfill({ status: 201, json: { apiVersion: "1", requestId: "fixture", data: view } });
      }
      const file = files.get(id);
      if (!file || (control.missingOriginal && !file.view.name.endsWith(".annotated.png"))) return route.fulfill({ status: 404, body: "Unavailable" });
      return route.fulfill({ contentType: file.view.mediaType, body: file.body });
    }
    if (request.method() === "POST" && (pathname.endsWith("/turns") || pathname.endsWith("/threads") || pathname.endsWith("/queue"))) {
      const body = request.postDataJSON(); control.sent.push(body);
      if (pathname.endsWith("/queue") && control.holdQueue) { control.queueRoutes.push(route); return; }
      if (control.unknownSend) { control.unknownSend = false; return route.abort("failed"); }
      if (control.rejectSend) return route.fulfill({ status: 409, json: { apiVersion: "1", error: { code: "turn_start_rejected", requestId: "fixture", message: "Synthetic send rejection", retryable: true } } });
      if (pathname.endsWith("/queue")) return route.fulfill({ json: { apiVersion: "1", requestId: "fixture", data: { queued: true } } });
      const input = body.initialTurn || body;
      const sentTurn = { ...turn, turnId: "turn_sent", clientMessageId: input.clientMessageId, userMessage: { id: "sent_user", markdown: input.input[0].text, attachments: (input.attachments || []).map((id: string) => files.get(id)!.view) }, items: [] };
      return route.fulfill({ status: 202, json: { apiVersion: "1", requestId: "fixture", data: body.initialTurn ? { detail: { thread: row("chat_A"), continuationState: "continuation_enabled", pendingRequests: [] }, accepted: { turn: sentTurn } } : { turn: sentTurn } } });
    }
    if (pathname.endsWith("/events") || pathname.endsWith("/activity/stream")) return route.fulfill({ contentType: "text/event-stream", body: ": ready\n\n" });
    const data = pathname.endsWith("/runtime") ? { availability: "ready", preferredProvider: "auto", effectiveProvider: "desktop_bundled", providers: [{ providerId: "desktop_bundled", availability: "ready", capabilities: { fullChat: true, imageInput: true, fileMetadata: true } }], models: [{ id: "test", inputModalities: control.modelImages ? ["text", "image"] : ["text"] }], selected: { modelId: "test", sandboxMode: "read_only" } }
      : pathname.endsWith("/activity") ? { cursor: 0, changed: [] }
      : pathname.endsWith("/threads") ? { data: [row("chat_A"), row("chat_B")], nextCursor: null }
      : pathname.endsWith("/delivery") ? { runs: [] }
      : pathname.endsWith("/history") ? { data: chatId === "chat_A" ? [turn] : [], olderCursor: null }
      : { streamUrl: `/api/codex-chat/v1/threads/${chatId}/events`, thread: row(chatId), continuationState: "continuation_enabled", pendingRequests: [], history: { state: "available" }, ...(control.active ? { activeTurnId: "turn_working", controls: { turnId: "turn_working", steer: true, interrupt: true } } : {}) };
    return route.fulfill({ json: { apiVersion: "1", requestId: "composer-fixture", data } });
  });
  return { control, files };
}
async function ready(page: Page, chat = "Chat A") {
  await expect(page.locator(".codex-conversation-header")).toContainText(chat);
  await expect(page.getByRole("textbox", { name: "Message Pritha" })).toBeEnabled();
}
async function picture(page: Page) {
  await ready(page);
  return Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement("canvas"); canvas.width = 160; canvas.height = 100;
    const context = canvas.getContext("2d")!; context.fillStyle = "#ffffff"; context.fillRect(0, 0, 160, 100); context.clearRect(0, 0, 10, 10);
    return canvas.toDataURL("image/png").split(",")[1];
  }), "base64");
}
async function attach(page: Page, name = "screenshot.png") {
  await ready(page);
  const buffer = await picture(page);
  await page.locator('input[type="file"]').setInputFiles({ name, mimeType: "image/png", buffer });
  await expect(page.getByLabel("Draft attachments").getByText("Ready", { exact: true })).toBeVisible();
  return buffer;
}
async function draw(page: Page, diagonal = false) {
  const canvas = page.getByLabel("Холст разметки"); await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * .2, box.y + box.height * .5);
  await page.mouse.down(); await page.mouse.move(box.x + box.width * .8, box.y + box.height * (diagonal ? .8 : .5), { steps: 5 }); await page.mouse.up();
}
async function selectAnswer(page: Page, text?: string) {
  await page.locator("[data-quote-body] .codex-markdown").first().evaluate((element, value) => {
    const range = document.createRange();
    if (value) { range.setStart(element.firstChild!.firstChild!, 0); range.setEnd(element.firstChild!.firstChild!, value.length); }
    else range.selectNodeContents(element);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range); document.dispatchEvent(new Event("selectionchange"));
  }, text);
}

for (const historical of [false, true]) test(`quote ${historical ? "paged history" : "current response"} appends without sending and stays in its chat`, async ({ page }) => {
  await fixture(page, historical); await page.goto("/codex?chat=chat_A&group=my_chats");
  await expect(page).toHaveURL(/\/task-chat\?.*chat=chat_A/);
  const composer = page.getByRole("textbox", { name: "Message Pritha" });
  await ready(page);
  await composer.fill("Keep my draft"); await selectAnswer(page);
  await page.getByRole("button", { name: "Цитировать", exact: true }).click();
  await expect(composer).toHaveValue(/Keep my draft\n\n> \*\*Из ответа Pritha:\*\*\n> Первая строка 🪷/);
  await expect(composer).toBeFocused();
  const saved = await composer.inputValue();
  await page.getByRole("button", { name: /Chat B/ }).click(); await expect(composer).toHaveValue("");
  await page.getByRole("button", { name: /Chat A/ }).click(); await expect(composer).toHaveValue(saved);
  await page.reload(); await expect(composer).toHaveValue(saved);
});
test("quotes reject user text, cross-message selection and an oversized draft", async ({ page }) => {
  await fixture(page); await page.goto("/task-chat?chat=chat_A");
  const button = page.getByRole("button", { name: "Цитировать", exact: true });
  await expect(button).toBeDisabled();
  await page.locator(".codex-user-message .codex-markdown").evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); window.getSelection()!.addRange(range); document.dispatchEvent(new Event("selectionchange")); });
  await expect(button).toBeDisabled();
  await page.evaluate(() => {
    const range = document.createRange(); range.setStartBefore(document.querySelector(".codex-user-message .codex-markdown")!); range.setEndAfter(document.querySelector("[data-quote-body] .codex-markdown")!);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range); document.dispatchEvent(new Event("selectionchange"));
  });
  await expect(button).toBeDisabled();
  const input = page.getByRole("textbox", { name: "Message Pritha" }); await input.fill("x".repeat(63_990));
  await selectAnswer(page); await button.click();
  await expect(page.getByRole("status").filter({ hasText: "draft limit" })).toBeVisible(); await expect(input).toHaveValue("x".repeat(63_990));
});

for (const width of [1280, 390]) test(`annotation exports real pixels, preserves original and survives reload at ${width}px`, async ({ page }, info) => {
  await page.setViewportSize({ width, height: 900 });
  const f = await fixture(page); await page.goto("/task-chat?chat=chat_A");
  const original = await attach(page); const originalId = f.control.puts[0].id;
  await page.getByRole("button", { name: "Разметить", exact: true }).click(); await draw(page);
  await page.getByRole("button", { name: "Отменить действие", exact: true }).click(); await expect(page.getByRole("button", { name: "Применить", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Повторить действие", exact: true }).click();
  await page.screenshot({ path: info.outputPath(`editor-open-${width}.png`), fullPage: true });
  await page.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Разметка изображения" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Разметить", exact: true })).toBeFocused();
  const edited = f.control.puts.at(-1)!; expect(edited.id).not.toBe(originalId); expect(f.files.get(originalId)!.body.equals(original)).toBe(true);
  expect(edited.body.readUInt32BE(16)).toBe(160); expect(edited.body.readUInt32BE(20)).toBe(100);
  const pixels = await page.evaluate(async href => {
    const image = new Image(); image.src = href; await image.decode(); const canvas = document.createElement("canvas"); canvas.width = 160; canvas.height = 100; const context = canvas.getContext("2d")!; context.drawImage(image, 0, 0);
    return { middle: [...context.getImageData(80, 50, 1, 1).data], transparent: [...context.getImageData(2, 2, 1, 1).data] };
  }, `/api/codex-chat/v1/attachments/${edited.id}`);
  expect(pixels.middle[0]).toBeGreaterThan(200); expect(pixels.middle[1]).toBeLessThan(100); expect(pixels.transparent[3]).toBe(0);
  await page.reload(); await expect(page.getByRole("button", { name: "Вернуть оригинал", exact: true })).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("pritha.task-chat.attachments.v1"))).not.toContain("base64");
  await page.screenshot({ path: info.outputPath(`annotation-${width}.png`), fullPage: true });
  await page.getByRole("button", { name: "Send", exact: true }).click(); await expect.poll(() => f.control.sent.length).toBe(1);
  expect(f.control.sent[0].attachments).toEqual([edited.id]);
});
test("cancel, dirty confirmation and return original do not rewrite source bytes", async ({ page }) => {
  const f = await fixture(page); await page.goto("/task-chat?chat=chat_A"); await attach(page);
  const source = f.control.puts[0];
  await page.getByRole("button", { name: "Разметить", exact: true }).click(); await draw(page);
  await page.getByRole("button", { name: "Отмена", exact: true }).click(); await expect(page.getByText("Закрыть без сохранения разметки?")).toBeVisible();
  await page.getByRole("button", { name: "Продолжить редактирование" }).click();
  await page.getByRole("dialog").press("Escape"); await page.getByRole("button", { name: "Закрыть без сохранения", exact: true }).click();
  expect(f.control.puts).toHaveLength(1); await expect(page.getByRole("button", { name: "Разметить", exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Разметить", exact: true }).click(); await draw(page); await page.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(page.getByRole("button", { name: "Вернуть оригинал", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Вернуть оригинал", exact: true }).click(); await expect(page.getByRole("button", { name: "Вернуть оригинал", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Send", exact: true }).click(); await expect.poll(() => f.control.sent.length).toBe(1); expect(f.control.sent[0].attachments).toEqual([source.id]);
});
test("failed copy retries exact bytes and UUID, rejected send preserves the copy", async ({ page }) => {
  const f = await fixture(page); await page.goto("/task-chat?chat=chat_A"); await attach(page); f.control.editMode = "fail";
  await page.getByRole("button", { name: "Разметить", exact: true }).click(); await draw(page); await page.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(page.getByText("Synthetic upload failure", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Применить", exact: true }).click(); await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(f.control.puts[1].id).toBe(f.control.puts[2].id); expect(f.control.puts[1].body.equals(f.control.puts[2].body)).toBe(true);
  f.control.rejectSend = true; await page.getByRole("button", { name: "Send", exact: true }).click(); await expect(page.getByText("Synthetic send rejection")).toBeVisible();
  await expect(page.getByRole("button", { name: "Вернуть оригинал", exact: true })).toBeVisible();
  f.control.rejectSend = false; await page.getByRole("button", { name: "Send", exact: true }).click(); await expect.poll(() => f.control.sent.length).toBe(2);
  expect(f.control.sent[1].attachments).toEqual(f.control.sent[0].attachments);
});
test("reload during upload restores confirmed original, and missing original preserves edited copy", async ({ page }) => {
  const f = await fixture(page); await page.goto("/task-chat?chat=chat_A"); await attach(page); f.control.editMode = "hold";
  await page.getByRole("button", { name: "Разметить", exact: true }).click(); await draw(page); await page.getByRole("button", { name: "Применить", exact: true }).click(); await expect.poll(() => f.control.held.length).toBe(1);
  await page.reload(); await expect(page.getByRole("button", { name: "Разметить", exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "Вернуть оригинал", exact: true })).toHaveCount(0);
  f.control.editMode = "success"; await page.getByRole("button", { name: "Разметить", exact: true }).click(); await draw(page); await page.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0); f.control.missingOriginal = true;
  await page.getByRole("button", { name: "Вернуть оригинал", exact: true }).click(); await expect(page.getByText(/original is no longer available/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Вернуть оригинал", exact: true })).toBeEnabled();
});
test("editor Enter never sends, text supports Unicode, queue sends only after editor closes", async ({ page }) => {
  const f = await fixture(page); f.control.active = true; await page.goto("/task-chat?chat=chat_A"); await attach(page);
  await page.getByRole("button", { name: "Разметить", exact: true }).click(); await draw(page);
  await page.getByRole("dialog").press("Enter"); expect(f.control.sent).toHaveLength(0);
  await expect(page.getByRole("button", { name: "Send after completion" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Stop this turn", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Текст", exact: true }).click(); await page.getByLabel("Холст разметки").click({ position: { x: 20, y: 20 } });
  await page.getByRole("textbox", { name: "Текст пометки" }).fill("Пометка 🪷"); await page.getByRole("textbox", { name: "Текст пометки" }).press("Enter"); expect(f.control.sent).toHaveLength(0);
  await page.getByRole("button", { name: "Добавить текст", exact: true }).click(); await page.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0); await page.getByRole("button", { name: "Send after completion" }).click();
  await expect.poll(() => f.control.sent.length).toBe(1); expect(f.control.sent[0].attachments).toEqual([f.control.puts.at(-1)!.id]);
});

test("replacement at ten attachments preserves count and ordering", async ({ page }) => {
  const f = await fixture(page); await page.goto("/task-chat?chat=chat_A");
  const buffer = await picture(page);
  await page.locator('input[type="file"]').setInputFiles(Array.from({ length: 10 }, (_, i) => ({ name: `image-${i}.png`, mimeType: "image/png", buffer })));
  const draft = page.getByLabel("Draft attachments"); await expect(draft.getByText("Ready", { exact: true })).toHaveCount(10);
  const original = [...f.control.puts];
  await draft.getByRole("button", { name: "Разметить", exact: true }).nth(4).click(); await draw(page); await page.getByRole("button", { name: "Применить", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0); await expect(draft.getByText("Ready", { exact: true })).toHaveCount(10);
  await page.getByRole("button", { name: "Send", exact: true }).click(); await expect.poll(() => f.control.sent.length).toBe(1);
  // Upload completion order need not be the input order; match by source name.
  expect(f.control.sent[0].attachments).toEqual(Array.from({ length: 10 }, (_, i) => i === 4 ? f.control.puts.at(-1)!.id : original.find(entry => entry.name === `image-${i}.png`)!.id));
});

test("reediting starts from the flattened copy and restores the first original", async ({ page }) => {
  const f = await fixture(page); await page.goto("/task-chat?chat=chat_A"); await attach(page);
  const original = f.control.puts[0];
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Разметить", exact: true }).click(); await draw(page);
    await page.getByRole("button", { name: "Применить", exact: true }).click(); await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  expect(new Set(f.control.puts.map(file => file.id)).size).toBe(3);
  await page.reload(); await page.getByRole("button", { name: "Вернуть оригинал", exact: true }).click(); await expect(page.getByRole("button", { name: "Вернуть оригинал", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Send", exact: true }).click(); await expect.poll(() => f.control.sent.length).toBe(1); expect(f.control.sent[0].attachments).toEqual([original.id]);
});

test("unknown delivery freezes the edited attachment ID through exact replay", async ({ page }) => {
  const f = await fixture(page); await page.goto("/task-chat?chat=chat_A"); await attach(page);
  await page.getByRole("button", { name: "Разметить", exact: true }).click(); await draw(page); await page.getByRole("button", { name: "Применить", exact: true }).click(); await expect(page.getByRole("dialog")).toHaveCount(0);
  f.control.unknownSend = true; await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("button", { name: "Check and retry same message", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Разметить", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Check and retry same message", exact: true }).click(); await expect.poll(() => f.control.sent.length).toBe(2);
  expect(f.control.sent[1]).toEqual(f.control.sent[0]);
});

test("pending queue locks its image and rejection unlocks editing", async ({ page }) => {
  const f = await fixture(page); f.control.active = true; f.control.holdQueue = true;
  await page.goto("/task-chat?chat=chat_A"); await attach(page);
  await page.getByRole("button", { name: "Send after completion", exact: true }).click(); await expect.poll(() => f.control.queueRoutes.length).toBe(1);
  await expect(page.getByRole("button", { name: "Разметить", exact: true })).toBeDisabled();
  await f.control.queueRoutes[0].fulfill({ status: 409, json: { apiVersion: "1", error: { code: "queue_target_ended", requestId: "fixture", message: "Queue rejected", retryable: false } } });
  await expect(page.getByRole("button", { name: "Разметить", exact: true })).toBeEnabled();
});

test("navigation cancels an in-flight edit and cannot replace a neighboring draft", async ({ page }) => {
  const f = await fixture(page); await page.goto("/task-chat?chat=chat_B");
  await ready(page, "Chat B");
  await page.getByRole("textbox", { name: "Message Pritha" }).fill("Keep B");
  await page.getByRole("button", { name: /Chat A/ }).click(); await attach(page); f.control.editMode = "hold";
  const original = f.control.puts[0];
  await page.getByRole("button", { name: "Разметить", exact: true }).click(); await draw(page); await page.getByRole("button", { name: "Применить", exact: true }).click(); await expect.poll(() => f.control.held.length).toBe(1);
  // Force a programmatic navigation while the modal blocks ordinary pointer input.
  // This exercises the ownership guard rather than relying on the modal for safety.
  await page.getByRole("button", { name: /Chat B/ }).evaluate(button => (button as HTMLButtonElement).click());
  await expect(page).toHaveURL(/chat=chat_B/); await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Message Pritha" })).toHaveValue("Keep B");
  await f.control.held[0].route.fulfill({ status: 201, json: { apiVersion: "1", requestId: "late", data: f.control.held[0].view } });
  await page.getByRole("button", { name: /Chat A/ }).click();
  await expect(page.getByRole("button", { name: "Вернуть оригинал", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Send", exact: true }).click(); await expect.poll(() => f.control.sent.length).toBe(1); expect(f.control.sent[0].attachments).toEqual([original.id]);
});

test("unsupported images and decoding failure preserve normal attachments", async ({ page }) => {
  await fixture(page); await page.goto("/task-chat?chat=chat_A");
  await ready(page);
  await page.locator('input[type="file"]').setInputFiles([{ name: "movie.gif", mimeType: "image/gif", buffer: Buffer.from("GIF89a") }, { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("notes") }]);
  await expect(page.getByLabel("Draft attachments").getByText("Ready", { exact: true })).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Разметить", exact: true })).toHaveCount(0);
  await page.locator('input[type="file"]').setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("broken PNG") });
  await page.getByRole("button", { name: "Разметить", exact: true }).click(); await expect(page.getByRole("dialog").getByRole("status")).toContainText("static PNG");
  await page.getByRole("button", { name: "Отмена", exact: true }).click(); await expect(page.getByLabel("Draft attachments").getByText("Ready", { exact: true })).toHaveCount(3);
});

test("annotation cannot bypass a text-only model capability gate", async ({ page }) => {
  const f = await fixture(page); f.control.modelImages = false; await page.goto("/task-chat?chat=chat_A"); await attach(page);
  await page.getByRole("button", { name: "Разметить", exact: true }).click(); await draw(page); await page.getByRole("button", { name: "Применить", exact: true }).click(); await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await page.getByRole("textbox", { name: "Message Pritha" }).press("Enter"); expect(f.control.sent).toHaveLength(0);
});

test("JPEG EXIF orientation is baked into exported PNG dimensions", async ({ page }) => {
  const f = await fixture(page); await page.goto("/task-chat?chat=chat_A");
  await ready(page);
  const jpeg = Buffer.from(await page.evaluate(() => { const c = document.createElement("canvas"); c.width = 30; c.height = 20; c.getContext("2d")!.fillRect(0, 0, 30, 20); return c.toDataURL("image/jpeg").split(",")[1]; }), "base64");
  const exif = Buffer.from("45786966000049492a0008000000010012010300010000000600000000000000", "hex");
  const header = Buffer.alloc(4); header[0] = 255; header[1] = 225; header.writeUInt16BE(exif.length + 2, 2);
  const oriented = Buffer.concat([jpeg.subarray(0, 2), header, exif, jpeg.subarray(2)]);
  await page.locator('input[type="file"]').setInputFiles({ name: "rotated.jpg", mimeType: "image/jpeg", buffer: oriented });
  await page.getByRole("button", { name: "Разметить", exact: true }).click(); await draw(page); await page.getByRole("button", { name: "Применить", exact: true }).click(); await expect(page.getByRole("dialog")).toHaveCount(0);
  const png = f.control.puts.at(-1)!.body; expect(png.readUInt32BE(16)).toBe(20); expect(png.readUInt32BE(20)).toBe(30);
});

test("rectangle and pen export visible marks with no viewport overflow in either theme", async ({ page }) => {
  const f = await fixture(page); await page.goto("/task-chat?chat=chat_A"); await attach(page);
  for (const [tool, theme] of [["Прямоугольник", "light"], ["Перо", "dark"]]) {
    await page.evaluate(value => { document.documentElement.dataset.theme = value; }, theme);
    await page.getByRole("button", { name: "Разметить", exact: true }).click();
    await page.getByRole("button", { name: tool, exact: true }).click();
    await page.getByRole("combobox", { name: "Толщина", exact: true }).selectOption("3");
    await draw(page, tool === "Прямоугольник");
    expect(await page.getByRole("dialog").evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    expect(await page.getByRole("dialog").evaluate(element => getComputedStyle(element).backgroundColor)).toMatch(/^rgb\(/);
    await page.getByRole("button", { name: "Применить", exact: true }).click(); await expect(page.getByRole("dialog")).toHaveCount(0);
    const redPixels = await page.evaluate(async href => {
      const image = new Image(); image.src = href; await image.decode(); const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext("2d")!; ctx.drawImage(image, 0, 0); const bytes = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let red = 0; for (let i = 0; i < bytes.length; i += 4) if (bytes[i] > 200 && bytes[i + 1] < 100 && bytes[i + 3] > 0) red++;
      return red;
    }, `/api/codex-chat/v1/attachments/${f.control.puts.at(-1)!.id}`);
    expect(redPixels).toBeGreaterThan(10);
  }
});

test.describe("touch annotation", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test("touch pointer draws a pen dot and the modal contains keyboard focus", async ({ page }) => {
    const f = await fixture(page); await page.goto("/task-chat?chat=chat_A"); await attach(page);
    await page.getByRole("button", { name: "Разметить", exact: true }).click(); await page.getByRole("button", { name: "Перо", exact: true }).click();
    const canvas = page.getByLabel("Холст разметки"); await expect(canvas).toBeVisible(); const box = (await canvas.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.getByRole("button", { name: "Применить", exact: true })).toBeEnabled();
    await page.keyboard.press("Tab");
    expect(await page.getByRole("dialog").evaluate(element => element.contains(document.activeElement))).toBe(true);
    await page.getByRole("button", { name: "Применить", exact: true }).click(); await expect(page.getByRole("dialog")).toHaveCount(0); expect(f.control.puts).toHaveLength(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
