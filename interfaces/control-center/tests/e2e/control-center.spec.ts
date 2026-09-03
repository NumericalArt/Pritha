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
  await expect
    .poll(() => page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".codex-transcript")]
      .filter((element) => element.offsetParent !== null)
      .every((element) => element.scrollWidth <= element.clientWidth + 2)))
    .toBeTruthy();
}

async function expectNoRawSecret(page: Page) {
  const text = (await page.locator("body").textContent()) || "";
  expect(text).not.toMatch(/(?:^|[^A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}/);
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

function realtimePrivateRoot() {
  const stateRoot = process.env.PRITHA_STATE_ROOT?.trim();
  if (stateRoot) return path.join(stateRoot, "private", "interface-lab", "pritha-control-center", "realtime");
  return path.join(findRepoRoot(), ".private", "interface-lab", "pritha-control-center", "realtime");
}

test.describe("Control Center UI regression", () => {
  test("renders all primary tabs without console errors, page overflow, or raw secrets", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    for (const route of ["/agents", "/voice", "/task-chat", "/settings", "/dev"]) {
      await page.goto(route);
      await expect(page.locator("h1:visible").first()).toBeVisible();
      if (route === "/task-chat") await expect(page.locator(".codex-conversation-header:visible")).toContainText("Pritha");
      else await expect(page.locator(".status-strip:visible")).toContainText("Pritha");
      await expectNoPageOverflow(page);
      await expectNoRawSecret(page);
    }

    expect(consoleErrors).toEqual([]);
  });

  test("Codex Chat maps an empty gateway failure to a friendly desktop and mobile stale state", async ({ page }) => {
    await page.route("**/api/codex-chat/v1/**", async (route) => {
      await route.fulfill({ status: 502, contentType: "application/json", body: "" });
    });

    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto("/task-chat");
      await expect(page.locator(".codex-error-banner")).toContainText("Control Center is temporarily unavailable");
      await expect(page.locator("body")).not.toContainText("Unexpected end of JSON input");
      await expect(page.locator("body")).not.toContainText("Failed to execute 'json'");
      await expectNoPageOverflow(page);
    }
  });

  test("Task Chat separates direct chats from Voice tasks and explicitly enables continuation", async ({ page }) => {
    const now = new Date().toISOString();
    let continuationEnabled = false;
    let voiceListRequests = 0;
    let secondVoiceHistoryAttempts = 0;
    let createThreadRequests = 0;
    let existingThreadTurnRequests = 0;
    const newThreadBodies: Array<Record<string, unknown>> = [];
    let delayNextDirectList = false;
    let resolveDelayedDirectListStarted: (() => void) | null = null;
    let releaseDelayedDirectList: () => void = () => undefined;
    let delayedDirectListGate: Promise<void> = Promise.resolve();
    const uiActivity: Array<Record<string, unknown>> = [];
    const runtime = {
      preferredProvider: "auto", effectiveProvider: "desktop_bundled", effectiveProtocol: "app_server", availability: "ready", fallbackEnabled: true,
      providers: [{ providerId: "desktop_bundled", label: "Desktop bundled", availability: "ready", version: "test", protocol: "app_server", locationLabel: "Desktop bundled", stateIdentityHash: "test", capabilities: { fullChat: true, nativeHistory: true, listThreads: true, readThread: true, forkThread: false, archiveThread: false, unarchiveThread: false, renameThread: false, pinThread: false, steerTurn: false, interruptTurn: false, commandApprovals: false, fileChangeApprovals: false, permissionApprovals: false, requestUserInput: false, historyPagination: true, audioInput: false }, warning: null }],
      models: [], selected: { modelId: "gpt-test", effortId: null, serviceTierId: null, sandboxMode: "read_only", approvalMode: "never" }, probedAt: now,
    };
    const base = { preview: "", status: "idle", activeFlags: [], pinned: false, archived: false, historyKind: "native", createdAt: now, updatedAt: now, runtime: { providerId: "desktop_bundled", version: "test", protocol: "app_server", stateIdentityHash: "test", compatibility: "bound" } };
    const direct = { ...base, chatId: "chat-direct", title: "Direct example", group: "my_chats", origin: "chat", taskLinks: [], continuationState: "continuation_enabled" };
    const newDirect = { ...base, chatId: "chat-new", title: "First atomic task", preview: "First atomic task", status: "active", group: "my_chats", origin: "chat", taskLinks: [], continuationState: "continuation_enabled" };
    const newTurn = {
      turnId: "turn-new",
      clientMessageId: "client-message-new",
      status: "in_progress",
      userMessage: { id: "message-new", role: "user", markdown: "First atomic task", status: "completed", createdAt: now },
      items: [], pendingRequestIds: [], startedAt: now, completedAt: null, error: null,
    };
    const newDetail = { thread: newDirect, activeTurnId: "turn-new", pendingRequests: [], streamUrl: "/api/codex-chat/v1/threads/chat-new/events", continuationState: "continuation_enabled" };
    const voice = () => ({ ...base, chatId: "chat-voice", title: "Voice example", group: "voice_work", origin: "voice", taskLinks: [{ taskId: "task-one", shortId: "ONE", label: "Voice task", origin: "voice", mode: continuationEnabled ? "shared_thread" : "result_reference", subjectScope: { kind: "pritha", id: "pritha", label: "Pritha", generation: 1 }, status: "complete", linkedAt: now }], continuationState: continuationEnabled ? "continuation_enabled" : "read_only" });
    const secondVoice = { ...voice(), chatId: "chat-voice-second", title: "Voice pagination example", taskLinks: [{ ...voice().taskLinks[0], taskId: "task-two", shortId: "TWO" }] };
    await page.route("**/api/codex-chat/v1/**", async (route) => {
      const url = new URL(route.request().url());
      if (route.request().method() === "POST" && url.pathname.endsWith("/ui-activity")) {
        uiActivity.push(route.request().postDataJSON() as Record<string, unknown>);
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ apiVersion: "1", requestId: "task-chat-telemetry", data: { recorded: true } }) });
      }
      if (route.request().method() === "POST" && url.pathname.endsWith("/threads")) {
        createThreadRequests += 1;
        newThreadBodies.push(route.request().postDataJSON() as Record<string, unknown>);
        if (createThreadRequests === 1) {
          return route.fulfill({
            status: 409,
            contentType: "application/json",
            body: JSON.stringify({ apiVersion: "1", error: { code: "fallback_confirmation_required", message: "First-message delivery is unknown.", retryable: true, requestId: "new-chat-unknown" } }),
          });
        }
        return route.fulfill({
          status: 202,
          contentType: "application/json",
          body: JSON.stringify({ apiVersion: "1", requestId: "new-chat-accepted", replayed: true, data: { detail: newDetail, accepted: { turn: newTurn, streamUrl: newDetail.streamUrl } } }),
        });
      }
      if (route.request().method() === "POST" && url.pathname.endsWith("/turns")) {
        existingThreadTurnRequests += 1;
        const knownRejection = url.pathname.includes("/chat-direct/");
        return route.fulfill({
          status: 409,
          contentType: "application/json",
          body: JSON.stringify({
            apiVersion: "1",
            error: {
              code: knownRejection ? "turn_start_rejected" : "fallback_confirmation_required",
              message: knownRejection
                ? "The task runtime rejected the message before accepting it. The thread was not changed."
                : "The connection ended before delivery could be confirmed. Check history before retrying the same message.",
              retryable: true,
              requestId: knownRejection ? "task-chat-not-accepted" : "task-chat-delivery-unknown",
            },
          }),
        });
      }
      if (url.pathname.endsWith("/events")) return route.fulfill({ status: 200, contentType: "text/event-stream", body: ": ready\n\n" });
      if (route.request().method() === "POST" && url.pathname.endsWith("/task-links")) continuationEnabled = true;
      let data: unknown;
      if (url.pathname.endsWith("/runtime")) data = runtime;
      else if (url.pathname.endsWith("/threads")) {
        const group = url.searchParams.get("group");
        const cursor = url.searchParams.get("cursor");
        if (group === "voice_work") voiceListRequests += 1;
        if (group === "my_chats" && delayNextDirectList) {
          delayNextDirectList = false;
          resolveDelayedDirectListStarted?.();
          await delayedDirectListGate;
        }
        data = group === "voice_work"
          ? cursor === "voice-page-2"
            ? { data: [secondVoice], nextCursor: null }
            : { data: [voice()], nextCursor: "voice-page-2" }
          : { data: [direct], nextCursor: null };
      }
      else if (url.pathname.endsWith("/turns")) {
        if (url.pathname.includes("/chat-new/")) {
          data = { data: [newTurn], olderCursor: null, newerCursor: null, hasOlder: false, hasNewer: false, snapshotAt: now };
          return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ apiVersion: "1", requestId: "task-chat-new-history", data }) });
        }
        if (url.pathname.includes("/chat-voice-second/")) {
          secondVoiceHistoryAttempts += 1;
          if (secondVoiceHistoryAttempts === 1) {
            await new Promise((resolve) => setTimeout(resolve, 1_500));
            return route.fulfill({ status: 504, contentType: "application/json", body: JSON.stringify({ apiVersion: "1", error: { code: "history_timeout_test", message: "History test timeout.", retryable: true, requestId: "task-chat-history-timeout" } }) });
          }
        }
        data = { data: [], olderCursor: null, newerCursor: null, hasOlder: false, hasNewer: false, snapshotAt: now };
      }
      else if (url.pathname.endsWith("/chat-direct")) data = { thread: direct, activeTurnId: null, pendingRequests: [], streamUrl: "/api/codex-chat/v1/threads/chat-direct/events", continuationState: "continuation_enabled" };
      else if (url.pathname.endsWith("/chat-new")) data = newDetail;
      else if (url.pathname.endsWith("/chat-voice") || url.pathname.endsWith("/task-links")) data = { thread: voice(), activeTurnId: null, pendingRequests: [], streamUrl: "/api/codex-chat/v1/threads/chat-voice/events", continuationState: continuationEnabled ? "continuation_enabled" : "read_only" };
      else if (url.pathname.endsWith("/chat-voice-second")) data = { thread: secondVoice, activeTurnId: null, pendingRequests: [], streamUrl: "/api/codex-chat/v1/threads/chat-voice-second/events", continuationState: "read_only" };
      else return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ apiVersion: "1", requestId: "task-chat-e2e", data }) });
    });

    await page.goto("/task-chat");
    await expect(page.getByRole("button", { name: /Direct example/ })).toBeVisible();
    await expect(page.getByText("Voice example")).toHaveCount(0);
    await page.getByRole("tab", { name: "Voice Tasks" }).click();
    await expect(page.getByRole("button", { name: /Voice example/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Voice pagination example/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue in Task Chat" })).toBeVisible();
    const listRequestsBeforeTap = voiceListRequests;

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Open chat history" }).click();
    await page.locator('[aria-label="Task Chat history drawer"]').getByRole("button", { name: /Voice pagination example/ }).click();
    await expect(page.locator(".codex-title-line h1")).toHaveText("Voice pagination example");
    await expect(page.locator(".codex-history-loading")).toBeVisible();
    await expect(page.locator(".codex-history-failed")).toBeVisible();
    expect(voiceListRequests).toBe(listRequestsBeforeTap);
    await expect.poll(() => uiActivity.find((event) => event.event === "thread_selected" && event.source === "history_row") || null).not.toBeNull();
    const failedInteractionId = uiActivity.find((event) => event.event === "thread_selected" && event.source === "history_row")?.interactionId;
    expect(uiActivity.some((event) => event.interactionId === failedInteractionId && event.event === "navigation_started")).toBe(true);
    await expect.poll(() => uiActivity.some((event) => event.interactionId === failedInteractionId && event.event === "history_failed")).toBe(true);
    await page.getByRole("button", { name: "Retry history" }).click();
    await expect(page.getByRole("button", { name: "Continue in Task Chat" })).toBeVisible();
    await expect.poll(() => uiActivity.some((event) => event.source === "retry" && event.event === "history_loaded")).toBe(true);
    expect(voiceListRequests).toBe(listRequestsBeforeTap);

    await page.getByRole("button", { name: "Open chat history" }).click();
    await page.locator('[aria-label="Task Chat history drawer"]').getByRole("button", { name: /^Voice example/ }).click();
    await expect(page.getByRole("button", { name: "Continue in Task Chat" })).toBeVisible();
    await page.getByRole("button", { name: "Continue in Task Chat" }).click();
    await expect(page.getByText("Message Pritha")).toBeVisible();

    const voiceDraft = "Keep this retry attached only to the Voice thread";
    await page.locator(".codex-composer textarea").fill(voiceDraft);
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator(".codex-delivery-unknown")).toBeVisible();
    await page.getByRole("button", { name: "Open chat history" }).click();
    await page.locator('[aria-label="Task Chat history drawer"]').getByRole("tab", { name: "Direct Chats" }).click();
    await page.locator('[aria-label="Task Chat history drawer"]').getByRole("button", { name: /Direct example/ }).click();
    await expect(page.locator(".codex-title-line h1")).toHaveText("Direct example");
    await expect(page.locator(".codex-delivery-unknown")).toHaveCount(0);
    await expect(page.locator(".codex-error-banner")).toHaveCount(0);
    await expect(page.locator(".codex-composer textarea")).toHaveValue("");
    await page.locator(".codex-composer textarea").fill("This rejection is known not to be delivered");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator(".codex-error-banner")).toContainText("rejected the message before accepting it");
    await expect(page.locator(".codex-delivery-unknown")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();

    await page.getByRole("button", { name: "Open chat history" }).click();
    await page.locator('[aria-label="Task Chat history drawer"]').getByRole("tab", { name: "Voice Tasks" }).click();
    await page.locator('[aria-label="Task Chat history drawer"]').getByRole("button", { name: /^Voice example/ }).click();
    await expect(page.locator(".codex-delivery-unknown")).toBeVisible();
    await expect(page.locator(".codex-composer textarea")).toHaveValue(voiceDraft);
    await page.goto("/codex?group=voice_work&chat=chat-voice");
    await expect(page).toHaveURL(/\/task-chat\?group=voice_work&chat=chat-voice$/);

    await page.goto("/task-chat?group=voice_work&chat=chat-voice");
    await page.getByRole("button", { name: "Open chat history" }).click();
    const mobileHistory = page.locator('[aria-label="Task Chat history drawer"]');
    await expect(mobileHistory.getByRole("tab", { name: "Voice Tasks" })).toHaveAttribute("aria-selected", "true");
    await expect(mobileHistory.getByRole("button", { name: /Voice example/ })).toBeVisible();
    await expectNoPageOverflow(page);
    const delayedDirectListStarted = new Promise<void>((resolve) => { resolveDelayedDirectListStarted = resolve; });
    delayedDirectListGate = new Promise<void>((resolve) => { releaseDelayedDirectList = resolve; });
    delayNextDirectList = true;
    await mobileHistory.getByRole("tab", { name: "Direct Chats" }).click();
    await delayedDirectListStarted;
    await mobileHistory.getByRole("button", { name: "New chat" }).click();
    expect(createThreadRequests).toBe(0);
    const existingTurnRequestsBeforeNewChat = existingThreadTurnRequests;
    await page.locator(".codex-composer textarea").fill("First atomic task");
    releaseDelayedDirectList();
    await expect(page.locator(".codex-title-line h1")).toHaveText("Task Chat");
    await expect(page.locator(".codex-composer textarea")).toHaveValue("First atomic task");
    await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.locator(".codex-delivery-unknown")).toBeVisible();
    expect(createThreadRequests).toBe(1);
    expect(existingThreadTurnRequests).toBe(existingTurnRequestsBeforeNewChat);
    await page.getByRole("button", { name: "Check and retry same message" }).click();
    await expect(page.locator(".codex-title-line h1")).toHaveText("First atomic task");
    expect(createThreadRequests).toBe(2);
    expect(existingThreadTurnRequests).toBe(existingTurnRequestsBeforeNewChat);
    expect(newThreadBodies[1]).toEqual(newThreadBodies[0]);
    expect(newThreadBodies[0]).toMatchObject({
      source: "chat",
      initialTurn: { input: [{ type: "text", text: "First atomic task" }] },
    });
  });

  test("keeps a long Codex transcript scrollable, the composer reachable, and dictation language browser-local", async ({ page }) => {
    await page.addInitScript(() => {
      class TestSpeechRecognition {
        lang = "";
        continuous = false;
        interimResults = false;
        onresult: null = null;
        onend: null = null;
        onerror: null = null;
        start() {}
        stop() {}
      }
      Object.defineProperty(window, "webkitSpeechRecognition", { configurable: true, value: TestSpeechRecognition });
    });

    const now = new Date().toISOString();
    const capabilities = {
      fullChat: true,
      nativeHistory: true,
      listThreads: true,
      readThread: true,
      forkThread: false,
      archiveThread: false,
      unarchiveThread: false,
      renameThread: false,
      pinThread: false,
      steerTurn: false,
      interruptTurn: false,
      commandApprovals: false,
      fileChangeApprovals: false,
      permissionApprovals: false,
      requestUserInput: false,
      historyPagination: true,
      audioInput: false,
    };
    const runtime = {
      preferredProvider: "auto",
      effectiveProvider: "desktop_bundled",
      effectiveProtocol: "app_server",
      availability: "ready",
      fallbackEnabled: true,
      providers: [{
        providerId: "desktop_bundled",
        label: "Desktop bundled",
        availability: "ready",
        version: "test",
        protocol: "app_server",
        locationLabel: "Desktop bundled",
        stateIdentityHash: "test",
        capabilities,
        warning: null,
      }],
      models: [],
      selected: {
        modelId: "gpt-test",
        effortId: null,
        serviceTierId: null,
        sandboxMode: "read_only",
        approvalMode: "never",
      },
      probedAt: now,
    };
    const thread = {
      chatId: "chat-long",
      title: "Long layout verification",
      preview: "Long transcript",
      group: "my_chats",
      origin: "chat",
      status: "idle",
      activeFlags: [],
      pinned: false,
      archived: false,
      historyKind: "native",
      createdAt: now,
      updatedAt: now,
      runtime: {
        providerId: "desktop_bundled",
        version: "test",
        protocol: "app_server",
        stateIdentityHash: "test",
        compatibility: "bound",
      },
      taskLinks: [],
    };
    const turns = Array.from({ length: 18 }, (_, index) => ({
      turnId: `turn-${index}`,
      clientMessageId: `client-${index}`,
      status: "completed",
      userMessage: {
        id: `user-${index}`,
        role: "user",
        markdown: `User message ${index + 1}: verify that a long conversation keeps its input visible.`,
        status: "completed",
        createdAt: now,
      },
      items: [{
        id: `assistant-item-${index}`,
        kind: "assistant_message",
        status: "completed",
        startedAt: now,
        completedAt: now,
        message: {
          id: `assistant-${index}`,
          role: "assistant",
          markdown: `Assistant response ${index + 1}. This intentionally adds enough content to require internal transcript scrolling.`,
          status: "completed",
          createdAt: now,
        },
      }],
      pendingRequestIds: [],
      startedAt: now,
      completedAt: now,
      error: null,
    }));

    await page.route("**/api/codex-chat/v1/**", async (route) => {
      const url = new URL(route.request().url());
      const requestId = `e2e-${url.pathname}`;
      if (url.pathname.endsWith("/events")) {
        await route.fulfill({ status: 200, contentType: "text/event-stream", body: ": ready\n\n" });
        return;
      }
      let data: unknown;
      if (url.pathname.endsWith("/runtime")) data = runtime;
      else if (url.pathname.endsWith("/threads")) data = { data: [thread], nextCursor: null };
      else if (url.pathname.endsWith("/turns")) data = { data: turns, olderCursor: null, newerCursor: null, hasOlder: false, hasNewer: false, snapshotAt: now };
      else if (url.pathname.endsWith("/chat-long")) data = { thread, activeTurnId: null, pendingRequests: [], streamUrl: "/api/codex-chat/v1/threads/chat-long/events" };
      else {
        await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ apiVersion: "1", error: { code: "not_found", message: "Not found", retryable: false, requestId } }) });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ apiVersion: "1", requestId, data }) });
    });

    for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto("/task-chat");
      const transcript = page.locator(".codex-transcript");
      const composer = page.locator(".codex-composer-wrap");
      await expect(page.getByText("Assistant response 18.")).toBeVisible();
      await expect(composer).toBeVisible();
      const layout = await transcript.evaluate((element) => {
        const transcriptRect = element.getBoundingClientRect();
        const composerElement = document.querySelector<HTMLElement>(".codex-composer-wrap");
        const composerRect = composerElement?.getBoundingClientRect();
        return {
          transcriptClientHeight: element.clientHeight,
          transcriptScrollHeight: element.scrollHeight,
          transcriptBottom: transcriptRect.bottom,
          composerTop: composerRect?.top || 0,
          composerBottom: composerRect?.bottom || 0,
          viewportHeight: window.innerHeight,
        };
      });
      expect(layout.transcriptScrollHeight).toBeGreaterThan(layout.transcriptClientHeight);
      expect(layout.transcriptBottom).toBeLessThanOrEqual(layout.composerTop + 1);
      expect(layout.composerBottom).toBeLessThanOrEqual(layout.viewportHeight + 1);
      await transcript.evaluate((element) => { element.scrollTop = 0; });
      await expect(composer).toBeVisible();
      await expectNoPageOverflow(page);
    }

    const language = page.getByLabel("Dictation language");
    await language.selectOption("ru-RU");
    await page.reload();
    await expect(language).toHaveValue("ru-RU");
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
    await expect(page.locator('[aria-label="Open in Task Chat / Create Plan"]')).toBeVisible();

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

  test("selects, saves, and reloads catalog-backed Codex model capabilities without overflow", async ({ page }) => {
    const isolatedStateRoot = process.env.PRITHA_STATE_ROOT?.trim();
    const isolatedPort = process.env.PRITHA_CONTROL_CENTER_PORT?.trim();
    test.skip(
      process.env.PRITHA_E2E_ISOLATED_STATE !== "1" || !isolatedStateRoot || !isolatedPort || isolatedPort === "3420",
      "Codex settings persistence test requires an explicit isolated state root and a non-live port.",
    );
    const privateRoot = realtimePrivateRoot();
    const runtimePath = path.join(privateRoot, "runtime-settings.json");
    const eventsPath = path.join(privateRoot, "events.jsonl");
    const originalRuntime = existsSync(runtimePath) ? readFileSync(runtimePath, "utf8") : null;
    const originalEvents = existsSync(eventsPath) ? readFileSync(eventsPath, "utf8") : null;

    try {
      const beforeResponse = await page.request.get("/api/realtime/runtime-settings");
      expect(beforeResponse.ok()).toBeTruthy();
      const before = await beforeResponse.json();
      const legacyUltraSettings = {
        ...before.settings,
        codexModel: "gpt-5.6-sol",
        codexReasoningEffort: "ultra",
        codexServiceTier: "fast",
        codexExecutionMode: "orchestrator_preferred",
        updatedAt: new Date().toISOString(),
      };
      mkdirSync(privateRoot, { recursive: true });
      writeFileSync(runtimePath, `${JSON.stringify(legacyUltraSettings, null, 2)}\n`);
      const normalizedLegacy = await (await page.request.get("/api/realtime/runtime-settings")).json();
      expect(normalizedLegacy.settings.codexReasoningEffort).toBe("ultra");
      expect(normalizedLegacy.settings.codexExecutionMode).toBe("inline_only");

      const customSettings = {
        ...before.settings,
        codexModel: "private-custom-model",
        codexReasoningEffort: "custom_effort",
        codexServiceTier: "fast",
        updatedAt: new Date().toISOString(),
      };
      writeFileSync(runtimePath, `${JSON.stringify(customSettings, null, 2)}\n`);

      await page.goto("/settings");
      const customModel = page.locator('select[aria-label="Codex model"]:visible');
      const customEffort = page.locator('select[aria-label="Codex reasoning level"]:visible');
      await expect(customModel).toHaveValue("private-custom-model");
      await expect(customModel.locator('option[value="private-custom-model"]')).toContainText("Unavailable/custom");
      await expect(customEffort).toHaveValue("custom_effort");
      await expect(customEffort.locator('option[value="custom_effort"]')).toContainText("Unavailable/custom");
      await expect(page.locator('.settings-segmented-control:visible button', { hasText: "Fast" })).toHaveCount(0);
      await page.locator('button:visible', { hasText: "Save Codex Runtime" }).click();
      await expect(page.getByText("Codex runtime settings saved").filter({ visible: true }).first()).toBeVisible();
      await page.reload();
      await expect(page.locator('select[aria-label="Codex model"]:visible')).toHaveValue("private-custom-model");

      const rejected = await page.request.post("/api/realtime/runtime-settings", {
        data: { codexModel: "gpt-5.6-luna", codexReasoningEffort: "ultra", codexServiceTier: "fast" },
      });
      expect(rejected.status()).toBe(400);
      expect((await rejected.json()).error).toBe("unsupported_codex_reasoning_effort");
      const afterRejected = await (await page.request.get("/api/realtime/runtime-settings")).json();
      expect(afterRejected.settings.codexModel).toBe(customSettings.codexModel);
      expect(afterRejected.settings.codexReasoningEffort).toBe(customSettings.codexReasoningEffort);

      const legacy = await page.request.post("/api/realtime/runtime-settings", {
        data: { codexModel: "gpt-5.5", codexReasoningEffort: "very_high", codexServiceTier: "standard" },
      });
      expect(legacy.ok()).toBeTruthy();
      expect((await legacy.json()).settings.codexReasoningEffort).toBe("xhigh");

      const nestedOrchestration = await page.request.post("/api/realtime/runtime-settings", {
        data: {
          codexModel: "gpt-5.6-sol",
          codexReasoningEffort: "ultra",
          codexServiceTier: "fast",
          codexExecutionMode: "orchestrator_preferred",
        },
      });
      expect(nestedOrchestration.status()).toBe(400);
      expect((await nestedOrchestration.json()).error).toBe("ultra_requires_inline_execution");

      await page.goto("/settings");
      const model = page.locator('select[aria-label="Codex model"]:visible');
      const effort = page.locator('select[aria-label="Codex reasoning level"]:visible');
      const executionMode = page.locator('select[aria-label="Codex execution mode"]:visible');
      await expect(model).toBeVisible();
      await expect(model.locator('option[value="gpt-5.6-sol"]')).toHaveCount(1);

      await model.selectOption("gpt-5.6-sol");
      await expect(effort.locator('option[value="low"]')).toHaveCount(1);
      await expect(effort.locator('option[value="medium"]')).toHaveCount(1);
      await expect(effort.locator('option[value="high"]')).toHaveCount(1);
      await expect(effort.locator('option[value="xhigh"]')).toHaveCount(1);
      await expect(effort.locator('option[value="max"]')).toHaveCount(1);
      await expect(effort.locator('option[value="ultra"]')).toHaveCount(1);

      await executionMode.selectOption("orchestrator_preferred");
      await effort.selectOption("ultra");
      await expect(executionMode).toHaveValue("inline_only");
      await expect(executionMode).toBeDisabled();
      await expect(page.getByText(/Ultra includes automatic task delegation/i).first()).toBeVisible();

      const fast = page.locator('.settings-segmented-control:visible button', { hasText: "Fast" });
      await expect(fast).toBeVisible();
      await fast.click();
      await page.locator('button:visible', { hasText: "Save Codex Runtime" }).click();
      await expect(page.getByText("Codex runtime settings saved").filter({ visible: true }).first()).toBeVisible();

      await page.reload();
      await expect(page.locator('select[aria-label="Codex model"]:visible')).toHaveValue("gpt-5.6-sol");
      await expect(page.locator('select[aria-label="Codex reasoning level"]:visible')).toHaveValue("ultra");
      await expect(page.locator('select[aria-label="Codex execution mode"]:visible')).toHaveValue("inline_only");
      await expect(page.locator('.settings-segmented-control:visible button.active', { hasText: "Fast" })).toBeVisible();
      await expectNoPageOverflow(page);

      await page.setViewportSize({ width: 390, height: 844 });
      await page.reload();
      await expect(page.locator('select[aria-label="Codex model"]:visible')).toHaveValue("gpt-5.6-sol");
      await expect(page.locator('select[aria-label="Codex reasoning level"]:visible')).toHaveValue("ultra");
      await expectNoPageOverflow(page);
    } finally {
      restoreFile(runtimePath, originalRuntime);
      restoreFile(eventsPath, originalEvents);
    }
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
