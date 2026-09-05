import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";

const root = "interfaces/control-center/src";
const appServerSource = readFileSync(`${root}/lib/codex-chat/app-server.ts`, "utf8");
const codexBinariesSource = readFileSync(`${root}/lib/settings/codex-binaries.ts`, "utf8");
const gatewaySource = readFileSync(`${root}/lib/codex-chat/gateway.ts`, "utf8");
const nativeThreadErrorsSource = readFileSync(`${root}/lib/codex-chat/native-thread-errors.ts`, "utf8");
const privateStoreSource = readFileSync(`${root}/lib/codex-chat/private-store.ts`, "utf8");
const privateJsonSource = readFileSync(`${root}/lib/private-json.ts`, "utf8");
const requestClientSource = readFileSync(`${root}/lib/control-center-request.ts`, "utf8");
const eventsRouteSource = readFileSync(`${root}/app/api/codex-chat/v1/threads/[chatId]/events/route.ts`, "utf8");
const threadRouteSource = readFileSync(`${root}/app/api/codex-chat/v1/threads/route.ts`, "utf8");
const turnsRouteSource = readFileSync(`${root}/app/api/codex-chat/v1/threads/[chatId]/turns/route.ts`, "utf8");
const taskLinksRouteSource = readFileSync(`${root}/app/api/codex-chat/v1/threads/[chatId]/task-links/route.ts`, "utf8");
const voiceLinksSource = readFileSync(`${root}/lib/codex-chat/voice-links.ts`, "utf8");
const nativeTurnCoordinatorSource = readFileSync(`${root}/lib/codex-chat/native-turn-coordinator.ts`, "utf8");
const chatPageSource = readFileSync(`${root}/components/codex/CodexChatPage.tsx`, "utf8");
const uiActivityClientSource = readFileSync(`${root}/lib/codex-chat/ui-activity-client.ts`, "utf8");
const uiActivitySource = readFileSync(`${root}/lib/codex-chat/ui-activity.ts`, "utf8");
const uiActivityRouteSource = readFileSync(`${root}/app/api/codex-chat/v1/ui-activity/route.ts`, "utf8");
const dictationPreferencesSource = readFileSync(`${root}/lib/codex-chat/dictation-preferences.ts`, "utf8");
const routesSource = readFileSync(`${root}/lib/routes.ts`, "utf8");
const stylesSource = readFileSync(`${root}/styles/globals.css`, "utf8");
const mobileShellSource = readFileSync(`${root}/components/shell/MobileShell.tsx`, "utf8");
const appShellSource = readFileSync(`${root}/components/shell/AppShell.tsx`, "utf8");
const statusProviderSource = readFileSync(`${root}/components/shell/ControlCenterStatusProvider.tsx`, "utf8");

async function loadNormalizeModule() {
  const source = readFileSync(`${root}/lib/codex-chat/normalize.ts`, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
    },
  }).outputText;
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pritha-codex-chat-normalize-"));
  const modulePath = path.join(tmp, "normalize.mjs");
  writeFileSync(modulePath, output, "utf8");
  return {
    module: await import(pathToFileURL(modulePath).href),
    cleanup: () => rmSync(tmp, { recursive: true, force: true }),
  };
}

async function transpileModule(source, prefix) {
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
      isolatedModules: true,
    },
  }).outputText;
  const tmp = mkdtempSync(path.join(os.tmpdir(), prefix));
  const modulePath = path.join(tmp, "module.mjs");
  writeFileSync(modulePath, output, "utf8");
  return {
    module: await import(`${pathToFileURL(modulePath).href}?cache=${Date.now()}-${Math.random()}`),
    directory: tmp,
    cleanup: () => rmSync(tmp, { recursive: true, force: true }),
  };
}

test("Codex Chat runtime uses a persistent App Server handshake for both installed runtime families", () => {
  assert.match(appServerSource, /DESKTOP_CODEX_BIN_CANDIDATES/);
  assert.match(codexBinariesSource, /ChatGPT\.app\/Contents\/Resources\/codex/);
  assert.match(codexBinariesSource, /Codex\.app\/Contents\/Resources\/codex/);
  assert.match(appServerSource, /\["app-server", "--listen", "stdio:\/\/"\]/);
  assert.match(appServerSource, /\["app-server", "generate-json-schema", "--out", schemaRoot\]/);

  const initializeIndex = appServerSource.indexOf('"initialize"');
  const initializedIndex = appServerSource.indexOf('this.notify("initialized", {})');
  assert.ok(initializeIndex > 0, "the App Server connection must initialize");
  assert.ok(initializedIndex > initializeIndex, "initialized must follow the initialize response");
  assert.match(appServerSource, /private connections = new Map<RuntimeProviderId, AppServerConnection>\(\)/);
  assert.match(appServerSource, /\["desktop_bundled", "standalone_cli"\]/);
  assert.match(appServerSource, /\["standalone_cli", "desktop_bundled"\]/);
  assert.match(appServerSource, /async start\(\) \{\s+if \(this\.startPromise\) return this\.startPromise;\s+if \(this\.isRunning\(\)\) return;/);
  assert.match(appServerSource, /for \(let attempt = 0; attempt < 2; attempt \+= 1\)/);
  assert.match(appServerSource, /transportFailure\(lastError\)\) this\.discardConnection\(providerId, connection, lastError\)/);
  assert.match(appServerSource, /retryableReadFailure\(lastError\)/);
});

test("Codex Chat core keeps native history, stable browser ids and safe turn replay boundaries", () => {
  const startTurnSource = gatewaySource.slice(gatewaySource.indexOf("async startTurn"), gatewaySource.indexOf("async assertChat"));
  assert.match(gatewaySource, /connection\.request\("thread\/start"/);
  assert.match(gatewaySource, /this\.runtime\.readThread\(binding\.providerId, binding\.nativeThreadId, includeTurns\)/);
  assert.match(gatewaySource, /connection\.request\("turn\/start"/);
  assert.match(gatewaySource, /ephemeral: false/);
  assert.doesNotMatch(gatewaySource, /--ephemeral/);
  assert.match(gatewaySource, /if \(this\.activeTurns\.has\(chatId\)\)/);
  assert.match(gatewaySource, /fallback_confirmation_required/);
  assert.match(gatewaySource, /createThreadWithFirstTurn/);
  assert.match(gatewaySource, /created\.replayed && started\.replayed/);
  assert.match(gatewaySource, /messageReceipts/);
  assert.match(gatewaySource, /idempotency_conflict/);
  assert.match(gatewaySource, /recoveredNativeTurn/);
  assert.match(gatewaySource, /candidate\?\.clientMessageId === input\.clientMessageId/);
  assert.match(gatewaySource, /MAX_EVENTS_PER_CHAT = 10_000/);
  assert.match(gatewaySource, /this\.activeTurns\.delete\(chatId\)/);
  assert.match(gatewaySource, /reconciledStatus !== binding\.lastStatus/);
  assert.doesNotMatch(startTurnSource, /const defaults = this\.runtime\.turnDefaults\(\)/);
  assert.doesNotMatch(startTurnSource, /input\.settings\?\.modelId \|\| defaults\.model/);
  assert.match(startTurnSource, /input\.settings\?\.modelId \? \{ model: input\.settings\.modelId \} : \{\}/);
  assert.match(gatewaySource, /active\?\.acknowledged && !turns\.some/);
  assert.match(gatewaySource, /UNCERTAIN_TURN_LEASE_MS = 30_000/);
  assert.match(gatewaySource, /event\("turn-start-failed"|recordRuntimeEvent\("turn-start-failed"/);
  assert.doesNotMatch(gatewaySource, /recordRuntimeEvent\("turn-start-failed"[\s\S]{0,500}(?:userText|nativeThreadId|clientMessageId|\btext\b)/);
});

test("Codex Chat private linkage remains outside tracked knowledge and uses atomic private writes", () => {
  assert.match(privateStoreSource, /path\.join\(stateRoot, "codex-chat"\)/);
  assert.match(privateStoreSource, /path\.join\(root, "\.private", "codex-chat"\)/);
  assert.match(privateJsonSource, /mode: 0o700/);
  assert.match(privateJsonSource, /0o600/);
  assert.match(privateStoreSource, /registry\.last-known-good\.json/);
  assert.match(privateStoreSource, /registry-read-only/);
  assert.match(privateStoreSource, /registry-restored/);
  assert.match(privateStoreSource, /removeEmptyDirectChat/);
  assert.match(privateStoreSource, /Object\.keys\(current\.messageReceipts\)\.length === 0/);
  assert.match(privateJsonSource, /randomUUID\(\)/);
  assert.match(privateJsonSource, /await handle\.sync\(\)/);
  assert.match(privateJsonSource, /await rename\(temporary, target\)/);
});

test("Codex Chat HTTP client normalizes gateways, malformed JSON and API envelopes", async () => {
  const loaded = await transpileModule(requestClientSource, "pritha-control-request-");
  const request = loaded.module.controlCenterRequest;
  try {
    const invoke = (response) => request("/api/test", {}, { fetchImpl: async () => response, timeoutMs: 500 });
    for (const status of [502, 503, 504]) {
      await assert.rejects(
        invoke(new Response("", { status, headers: { "content-type": "application/json" } })),
        (error) => error.code === "control_center_unavailable" && error.kind === "gateway" && !/JSON|Unexpected/i.test(error.message),
      );
    }
    await assert.rejects(
      invoke(new Response("<html>proxy error</html>", { status: 502, headers: { "content-type": "text/html" } })),
      (error) => error.code === "control_center_unavailable" && !error.message.includes("proxy error"),
    );
    await assert.rejects(
      invoke(new Response('{"apiVersion":"1"', { status: 200, headers: { "content-type": "application/json" } })),
      (error) => error.code === "invalid_server_response" && !/Unexpected end|JSON/i.test(error.message),
    );
    const success = await invoke(new Response(JSON.stringify({ apiVersion: "1", requestId: "request-1", data: { ok: true } }), {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    }));
    assert.deepEqual(success.data, { ok: true });
    await assert.rejects(
      invoke(new Response(JSON.stringify({ apiVersion: "1", error: { code: "runtime_unavailable", message: "Runtime unavailable.", retryable: true, requestId: "request-2", details: { replacementAllowed: false } } }), {
        status: 503,
        headers: { "content-type": "application/json" },
      })),
      (error) => error.kind === "api" && error.code === "runtime_unavailable" && error.requestId === "request-2" && error.details.replacementAllowed === false,
    );
    await assert.rejects(
      request("/api/test", {}, {
        timeoutMs: 10,
        fetchImpl: async (_url, init) => await new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        }),
      }),
      (error) => error.kind === "network" && error.code === "request_timeout" && error.retryable === true,
    );
    assert.equal(loaded.module.deliveryMayBeUnknown(new loaded.module.ControlCenterRequestError(
      "api",
      "turn_active",
      "Turn already active.",
      false,
      409,
      "request-3",
    )), true);
    assert.equal(loaded.module.deliveryMayBeUnknown(new loaded.module.ControlCenterRequestError(
      "api",
      "fallback_confirmation_required",
      "Delivery is unknown.",
      true,
      409,
      "request-4",
    )), true);
    assert.equal(loaded.module.deliveryMayBeUnknown(new loaded.module.ControlCenterRequestError(
      "api",
      "runtime_incompatible",
      "Runtime rejected the request before delivery.",
      true,
      503,
      "request-5",
    )), false);
    assert.equal(loaded.module.deliveryMayBeUnknown(new loaded.module.ControlCenterRequestError(
      "api",
      "turn_start_rejected",
      "Message was not accepted.",
      true,
      409,
      "request-6",
    )), false);
    assert.equal(loaded.module.deliveryMayBeUnknown(new loaded.module.ControlCenterRequestError(
      "network",
      "request_timeout",
      "Timed out.",
      true,
      null,
      null,
    )), true);
  } finally {
    loaded.cleanup();
  }
});

test("atomic private JSON serializes one hundred concurrent writes without temp collisions", async () => {
  const loaded = await transpileModule(privateJsonSource, "pritha-private-json-");
  const stateRoot = mkdtempSync(path.join(os.tmpdir(), "pritha-private-state-"));
  const target = path.join(stateRoot, "private", "rolling-summary", "current.json");
  try {
    await Promise.all(Array.from({ length: 100 }, (_, index) => loaded.module.atomicWritePrivateJson({
      stateRoot,
      filePath: target,
      resourceKey: "rolling-summary:current",
      value: { index, valid: true },
    })));
    const saved = JSON.parse(readFileSync(target, "utf8"));
    assert.equal(saved.valid, true);
    assert.ok(Number.isInteger(saved.index));
    assert.equal(loaded.module.pendingPrivateJsonWrites(), 0);
    await assert.rejects(loaded.module.atomicWritePrivateJson({
      stateRoot,
      filePath: path.join(stateRoot, "..", "escape.json"),
      value: {},
    }), /outside_state_root/);
  } finally {
    loaded.cleanup();
    rmSync(stateRoot, { recursive: true, force: true });
  }
});

test("corrupt Codex Chat registry restores a valid backup and otherwise stays read-only", async () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), "pritha-registry-recovery-"));
  const checkout = path.join(tmp, "checkout");
  const stateRoot = path.join(tmp, "state");
  const chatRoot = path.join(stateRoot, "codex-chat");
  mkdirSync(chatRoot, { recursive: true });
  const compilerOptions = { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, isolatedModules: true };
  const helperOutput = ts.transpileModule(privateJsonSource, { compilerOptions }).outputText;
  const storeOutput = ts.transpileModule(privateStoreSource, { compilerOptions }).outputText
    .replace('"@/lib/pritha-paths"', '"./pritha-paths.mjs"')
    .replace('"@/lib/private-json"', '"./private-json.mjs"');
  writeFileSync(path.join(tmp, "private-json.mjs"), helperOutput);
  writeFileSync(path.join(tmp, "pritha-paths.mjs"), `
export const resolveTechscopeRoot = () => ${JSON.stringify(checkout)};
export const resolvePrithaStateRoot = () => ${JSON.stringify(stateRoot)};
`);
  writeFileSync(path.join(tmp, "private-store.mjs"), storeOutput);
  const binding = {
    chatId: "chat_recovered",
    clientThreadId: "client-thread-recovered",
    createHash: "hash",
    nativeThreadId: "native-thread-recovered",
    providerId: "desktop_bundled",
    stateIdentityHash: null,
    group: "my_chats",
    origin: "chat",
    continuationEnabled: true,
    continuationEnabledAt: null,
    title: "Recovered",
    preview: "History survives",
    createdAt: "2026-08-27T00:00:00.000Z",
    updatedAt: "2026-08-27T00:00:00.000Z",
    pinned: false,
    archived: false,
    lastStatus: "idle",
    messageReceipts: {},
    taskLinks: [],
  };
  const valid = { version: 1, chats: { [binding.chatId]: binding } };
  try {
    writeFileSync(path.join(chatRoot, "registry.json"), "{broken-primary", "utf8");
    writeFileSync(path.join(chatRoot, "registry.last-known-good.json"), `${JSON.stringify(valid)}\n`, "utf8");
    const recoveredModule = await import(`${pathToFileURL(path.join(tmp, "private-store.mjs")).href}?recovered`);
    const recovered = new recoveredModule.CodexChatPrivateStore();
    assert.deepEqual((await recovered.all()).map((row) => row.chatId), ["chat_recovered"]);
    assert.deepEqual(JSON.parse(readFileSync(path.join(chatRoot, "registry.json"), "utf8")), valid);
    assert.match(readFileSync(path.join(chatRoot, "registry.audit.jsonl"), "utf8"), /registry-restored/);

    const emptyBinding = {
      ...binding,
      chatId: "chat_empty_direct",
      clientThreadId: "client-empty-direct",
      nativeThreadId: "native-empty-direct",
      title: "New task chat",
      preview: "",
    };
    await recovered.put(emptyBinding);
    assert.equal(await recovered.removeEmptyDirectChat(emptyBinding.chatId, "wrong-native-thread"), false);
    assert.equal(await recovered.removeEmptyDirectChat(emptyBinding.chatId, emptyBinding.nativeThreadId), true);
    assert.equal(await recovered.get(emptyBinding.chatId), null);
    const removalAudit = readFileSync(path.join(chatRoot, "registry.audit.jsonl"), "utf8");
    assert.match(removalAudit, /empty-direct-chat-removed/);
    assert.doesNotMatch(removalAudit, /chat_empty_direct|native-empty-direct/);

    writeFileSync(path.join(chatRoot, "registry.json"), "{broken-primary", "utf8");
    writeFileSync(path.join(chatRoot, "registry.last-known-good.json"), "{broken-backup", "utf8");
    const failedModule = await import(`${pathToFileURL(path.join(tmp, "private-store.mjs")).href}?failed`);
    const failed = new failedModule.CodexChatPrivateStore();
    await assert.rejects(failed.all(), (error) => error.code === "codex_chat_registry_corrupt");
    assert.equal(readFileSync(path.join(chatRoot, "registry.json"), "utf8"), "{broken-primary");
    assert.equal(readFileSync(path.join(chatRoot, "registry.last-known-good.json"), "utf8"), "{broken-backup");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("Codex Chat routes enforce bounded input, idempotent mutations and resumable SSE", () => {
  assert.match(threadRouteSource, /requireIdempotencyKey\(request\)/);
  assert.match(threadRouteSource, /Thread title exceeds 120 characters/);
  assert.match(threadRouteSource, /body\.initialTurn/);
  assert.match(threadRouteSource, /createThreadWithFirstTurn/);
  assert.match(threadRouteSource, /status: result\.replayed \? 200 : 202/);
  assert.match(turnsRouteSource, /requireIdempotencyKey\(request\)/);
  assert.match(turnsRouteSource, /status: 202/);
  assert.match(eventsRouteSource, /request\.headers\.get\("last-event-id"\)/);
  assert.match(eventsRouteSource, /url\.searchParams\.get\("afterEventId"\)/);
  assert.match(eventsRouteSource, /"Content-Type": "text\/event-stream; charset=utf-8"/);
  assert.match(eventsRouteSource, /"X-Accel-Buffering": "no"/);
  assert.match(eventsRouteSource, /15_000/);
  assert.match(taskLinksRouteSource, /requireIdempotencyKey\(request\)/);
  assert.match(taskLinksRouteSource, /createTaskLink\(chatId, body\)/);
});

test("Codex Chat navigation, editable dictation and 320px-safe layout are present", () => {
  assert.match(routesSource, /href: "\/task-chat"/);
  assert.match(routesSource, /label: "Task Chat"/);
  assert.match(chatPageSource, /SpeechRecognition/);
  assert.match(chatPageSource, /setDraft\(\(current\) =>/);
  assert.doesNotMatch(chatPageSource, /recognition\.onresult[\s\S]{0,700}sendMessage\(/);
  assert.doesNotMatch(chatPageSource, /navigator\.language/);
  assert.match(chatPageSource, /if \(languageTag\) recognition\.lang = languageTag/);
  assert.match(chatPageSource, /aria-label="Dictation language"/);
  assert.match(chatPageSource, /new EventSource\(streamUrl\)/);
  assert.match(stylesSource, /grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(stylesSource, /\.codex-conversation \{[\s\S]{0,180}display: flex;[\s\S]{0,80}flex-direction: column;/);
  assert.match(stylesSource, /\.codex-transcript \{[\s\S]{0,80}flex: 1 1 auto;[\s\S]{0,120}overflow-y: auto;/);
  assert.match(stylesSource, /\.codex-composer-wrap \{[\s\S]{0,80}flex: 0 0 auto;/);
  assert.match(stylesSource, /\.content-shell:has\(\.codex-page\) \{[\s\S]{0,100}height: 100dvh;[\s\S]{0,100}overflow: hidden;/);
  assert.match(stylesSource, /@media \(max-width: 390px\)/);
  assert.match(stylesSource, /\.codex-history-overlay/);
});

test("Voice task threads are privately reconciled and require explicit continuation", () => {
  assert.match(voiceLinksSource, /thread_resolved/);
  assert.match(voiceLinksSource, /thread-links\.json/);
  assert.match(voiceLinksSource, /group: "voice_work"/);
  assert.match(voiceLinksSource, /continuationEnabled: false/);
  assert.match(gatewaySource, /continuation_confirmation_required/);
  assert.match(gatewaySource, /providerView\.stateIdentityHash !== binding\.stateIdentityHash/);
  assert.match(chatPageSource, /Direct Chats/);
  assert.match(chatPageSource, /Voice Tasks/);
  assert.match(chatPageSource, /Continue in Task Chat/);
  assert.match(nativeTurnCoordinatorSource, /if \(leases\.has\(key\)\) return null/);
  assert.match(gatewaySource, /tryAcquireNativeThreadTurn/);
  assert.match(appServerSource + readFileSync(`${root}/lib/realtime/codex-task/codex-app-server-client.ts`, "utf8"), /nativeThreadLeaseKey/);
});

test("Voice task lists are incremental, indexed and preserve legacy bindings", () => {
  const listSource = gatewaySource.slice(gatewaySource.indexOf("async listThreads"), gatewaySource.indexOf("async createThread"));
  assert.doesNotMatch(listSource, /await reconcileVoiceTaskChatLinks/);
  assert.match(listSource, /queueVoiceTaskChatIndexRefresh/);
  assert.match(listSource, /view === "legacy"/);
  assert.match(threadRouteSource, /view !== "current" && view !== "legacy"/);
  assert.match(voiceLinksSource, /pritha-voice-task-chat-index-v1/);
  assert.match(voiceLinksSource, /previous\?\.signatures\?\.\[taskId\] === signature/);
  assert.match(voiceLinksSource, /if \(await reconcileTask\(store, runtime, taskId\)\) signatures\[taskId\] = signature/);
  assert.match(voiceLinksSource, /reconcileVoiceTaskChatLink/);
  assert.match(chatPageSource, /loadThreadPage/);
  assert.match(chatPageSource, /IntersectionObserver/);
  assert.match(chatPageSource, /Load more/);
  assert.doesNotMatch(chatPageSource, /> Legacy/);
  assert.match(chatPageSource, /Show archived/);
  assert.doesNotMatch(chatPageSource, /for \(let page = 0; page < 20/);
});

test("missing native history is explicit and replacement preserves a draft", async () => {
  const loaded = await transpileModule(nativeThreadErrorsSource, "pritha-native-thread-errors-");
  try {
    assert.equal(loaded.module.classifyNativeThreadReadFailure(new Error("thread not loaded: test")), "native_thread_missing");
    assert.equal(loaded.module.classifyNativeThreadReadFailure(new Error("no rollout found for thread id test")), "native_thread_missing");
    assert.equal(loaded.module.classifyNativeThreadReadFailure(new Error("request timed out")), "history_timeout");
    assert.equal(loaded.module.classifyNativeThreadReadFailure(new Error("connection closed")), "runtime_unavailable");
  } finally {
    loaded.cleanup();
  }
  assert.match(gatewaySource, /"native_thread_missing"/);
  assert.match(gatewaySource, /replacementAllowed: replaceable/);
  assert.match(gatewaySource, /"history_timeout"/);
  assert.match(gatewaySource, /"history_unavailable"/);
  assert.match(chatPageSource, /Start replacement draft/);
  assert.match(chatPageSource, /onClick=\{startReplacementDraft\}/);
  assert.match(chatPageSource, /updateDraftForChat\(null, replacementText\)/);
  assert.doesNotMatch(chatPageSource, /onClick=\{\(\) => void createChat\(\)\}/);
});

test("a new Direct Chat sends its first turn through one idempotent request", () => {
  assert.match(chatPageSource, /api<CreatedThreadTurn>\("\/api\/codex-chat\/v1\/threads"/);
  assert.match(chatPageSource, /"Idempotency-Key": delivery\.clientThreadId/);
  assert.match(chatPageSource, /initialTurn: \{\s+clientMessageId: delivery\.clientMessageId/);
  assert.match(chatPageSource, /pendingNewChatDelivery/);
  assert.match(chatPageSource, /newChatDraftActiveRef\.current \|\| pendingNewChatDeliveryRef\.current/);
  assert.match(chatPageSource, /newChatDraftActiveRef\.current = true/);
  assert.match(chatPageSource, /First-message delivery is unknown/);
  assert.match(chatPageSource, /await deliverNewChatMessage\(delivery\)/);
  assert.doesNotMatch(chatPageSource, /if \(!chatId\) \{[\s\S]{0,300}createChat/);
  assert.match(gatewaySource, /for \(let attempt = 0; attempt < 2; attempt \+= 1\)/);
  assert.match(gatewaySource, /replaceEmptyDirectThread/);
  assert.match(gatewaySource, /firstTurnDeliveryIsUncertain/);
});

test("mobile navigation reuses one status snapshot and exposes immediate progress", () => {
  assert.match(appShellSource, /ControlCenterStatusProvider initialStatus=\{initialStatus\}/);
  assert.match(statusProviderSource, /if \(inFlight\.current\) return inFlight\.current/);
  assert.match(statusProviderSource, /window\.addEventListener\("focus"/);
  assert.match(mobileShellSource, /useLinkStatus/);
  assert.match(mobileShellSource, /primary_navigation_started/);
  assert.match(mobileShellSource, /primary_navigation_completed/);
  assert.match(mobileShellSource, /primary_navigation_timeout/);
  assert.match(mobileShellSource, /15_000/);
});

test("Task Chat confines horizontal overflow to code and tables", () => {
  assert.match(stylesSource, /\.codex-transcript \{[\s\S]{0,180}overflow-x: hidden;/);
  assert.match(stylesSource, /\.codex-turn \{[\s\S]{0,80}min-width: 0;[\s\S]{0,80}max-width: 100%;/);
  assert.match(stylesSource, /overflow-wrap: anywhere/);
  assert.match(stylesSource, /\.codex-message pre,[\s\S]{0,180}overflow-x: auto/);
});

test("Codex Chat dictation keeps browser auto mode and explicit language choices separate from transcripts", async () => {
  const loaded = await transpileModule(dictationPreferencesSource, "pritha-codex-chat-dictation-");
  try {
    assert.equal(loaded.module.recognitionLanguageTag("browser"), null);
    for (const language of ["en-US", "de-DE", "ru-RU", "fr-FR", "it-IT", "es-ES"]) {
      assert.equal(loaded.module.isDictationLanguage(language), true);
      assert.equal(loaded.module.recognitionLanguageTag(language), language);
    }
    assert.equal(loaded.module.isDictationLanguage("all"), false);
    assert.match(dictationPreferencesSource, /pritha\.codexDictationLanguage/);
    assert.doesNotMatch(dictationPreferencesSource, /transcript|draft|message/i);
  } finally {
    loaded.cleanup();
  }
});

test("Codex Chat loads selected history independently and exposes explicit bounded recovery", () => {
  assert.match(chatPageSource, /\[1_000, 2_000, 5_000, 10_000, 30_000\]/);
  assert.doesNotMatch(chatPageSource, /window\.setInterval/);
  assert.match(chatPageSource, /window\.addEventListener\("focus", onFocus\)/);
  assert.match(chatPageSource, /window\.addEventListener\("online", onOnline\)/);
  assert.match(chatPageSource, /document\.addEventListener\("visibilitychange", onVisibility\)/);
  assert.match(chatPageSource, /await checkControlCenterHealth\(\)/);
  assert.match(chatPageSource, /const loadThreadDetail = useCallback/);
  assert.match(chatPageSource, /const loadThreadHistory = useCallback/);
  assert.match(chatPageSource, /Promise\.allSettled\(\[refreshRuntime\(\), refreshThreads\(\)\]\)/);
  assert.match(chatPageSource, /HISTORY_SLOW_MS = 2_500/);
  assert.match(chatPageSource, /HISTORY_TIMEOUT_MS = 12_000/);
  assert.match(chatPageSource, /VOICE_LIST_REFRESH_MS = 30_000/);
  assert.match(chatPageSource, /TURN_START_TIMEOUT_MS = 30_000/);
  assert.match(chatPageSource, /draftsByChat/);
  assert.match(chatPageSource, /pendingDeliveries/);
  assert.match(chatPageSource, /pendingDeliveries\[selectedChatId\]/);
  assert.match(chatPageSource, /error\.chatId === selectedChatId/);
  assert.match(chatPageSource, /selectedChatIdRef\.current === delivery\.chatId/);
  assert.match(chatPageSource, /Still loading history…/);
  assert.match(chatPageSource, /Retry history/);
  assert.doesNotMatch(chatPageSource, /synchronize\(/);
  assert.match(chatPageSource, /recovering \? "Retrying…" : "Retry"/);
  assert.match(chatPageSource, /delivery_unknown/);
  assert.match(chatPageSource, /clientMessageId: delivery\.clientMessageId/);
  assert.doesNotMatch(chatPageSource, /localStorage|indexedDB/i);
});

test("Task Chat interaction telemetry is private, bounded and content-free", async () => {
  assert.match(uiActivityRouteSource, /readJsonBody<TaskChatUiActivityInput>\(request\)/);
  assert.match(uiActivitySource, /task-chat-ui-actions\.jsonl/);
  assert.match(uiActivitySource, /createHash\("sha256"\)\.update\(input\.chatId\)/);
  assert.match(uiActivitySource, /new CodexChatPrivateStore\(\)/);
  assert.match(uiActivitySource, /duration > 120_000/);
  assert.match(uiActivityClientSource, /keepalive: true/);
  assert.match(uiActivityClientSource, /sessionStorage\.removeItem\(HANDOFF_KEY\)/);
  assert.match(chatPageSource, /"thread_selected"/);
  assert.match(chatPageSource, /"navigation_started"/);
  assert.match(chatPageSource, /"history_loaded"/);
  assert.match(chatPageSource, /"history_failed"/);
  assert.doesNotMatch(uiActivitySource, /task_text|message_text|native_thread|href|url:/i);
  assert.doesNotMatch(uiActivitySource, /chat_id\s*:/i);

  const tmp = mkdtempSync(path.join(os.tmpdir(), "pritha-task-chat-ui-activity-"));
  const output = ts.transpileModule(uiActivitySource, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022, isolatedModules: true },
  }).outputText
    .replace('"@/lib/private-json"', '"./private-json.mjs"')
    .replace('"@/lib/pritha-paths"', '"./pritha-paths.mjs"')
    .replace('"./gateway"', '"./gateway.mjs"')
    .replace('"./private-store"', '"./private-store.mjs"');
  writeFileSync(path.join(tmp, "ui-activity.mjs"), output);
  writeFileSync(path.join(tmp, "private-json.mjs"), "export async function appendPrivateAuditEvent(value) { globalThis.__taskChatUiActivity = value; }\n");
  writeFileSync(path.join(tmp, "pritha-paths.mjs"), `
export const resolveTechscopeRoot = () => ${JSON.stringify(tmp)};
export const resolvePrithaStateRoot = () => ${JSON.stringify(tmp)};
export const resolvePrithaStatePath = (...segments) => segments.join("/");
`);
  writeFileSync(path.join(tmp, "gateway.mjs"), `
export class CodexChatGatewayError extends Error {
  constructor(code, message, httpStatus) { super(message); this.code = code; this.httpStatus = httpStatus; }
}
`);
  writeFileSync(path.join(tmp, "private-store.mjs"), `
export class CodexChatPrivateStore {
  async get(chatId) { return chatId === "chat_valid_123" ? { group: "voice_work", origin: "voice" } : null; }
}
`);
  try {
    const loaded = await import(`${pathToFileURL(path.join(tmp, "ui-activity.mjs")).href}?functional`);
    const result = await loaded.recordTaskChatUiActivity({
      event: "history_loaded",
      chatId: "chat_valid_123",
      interactionId: "interaction-valid-123",
      source: "voice_task_card",
      stage: "history",
      durationMs: 2310.4,
      clientClass: "mobile",
    });
    assert.deepEqual(result, { recorded: true });
    const saved = globalThis.__taskChatUiActivity;
    assert.equal(saved.event.chat_ref, createHash("sha256").update("chat_valid_123").digest("hex").slice(0, 24));
    assert.equal(saved.event.duration_ms, 2310);
    assert.equal(saved.event.group, "voice_work");
    assert.doesNotMatch(JSON.stringify(saved.event), /chat_valid_123/);
    await assert.rejects(
      loaded.recordTaskChatUiActivity({
        event: "history_loaded",
        chatId: "chat_valid_123",
        interactionId: "interaction-valid-123",
        source: "voice_task_card",
        durationMs: 120_001,
      }),
      (error) => error.code === "invalid_request" && error.httpStatus === 400,
    );
  } finally {
    delete globalThis.__taskChatUiActivity;
    rmSync(tmp, { recursive: true, force: true });
  }
});

test("Codex Chat item normalization bounds output and hides private absolute paths and raw reasoning", async () => {
  const loaded = await loadNormalizeModule();
  try {
    const projectRoot = path.resolve("/workspace/pritha");
    const timestamp = "2026-08-26T12:00:00.000Z";
    const inside = loaded.module.normalizeNativeItem("chat_test", {
      id: "command-inside",
      type: "commandExecution",
      status: "completed",
      command: "npm test",
      cwd: path.join(projectRoot, "interfaces/control-center"),
      aggregatedOutput: "x".repeat(20_000),
      exitCode: 0,
    }, projectRoot, timestamp);
    assert.equal(inside.cwdLabel, "interfaces/control-center");
    assert.equal(inside.outputPreview.length, 16_384);

    const outside = loaded.module.normalizeNativeItem("chat_test", {
      id: "command-outside",
      type: "commandExecution",
      status: "completed",
      command: "pwd",
      cwd: "/private/operator/secrets",
    }, projectRoot, timestamp);
    assert.equal(outside.cwdLabel, "secrets");
    assert.doesNotMatch(JSON.stringify(outside), /private\/operator/);

    const reasoning = loaded.module.normalizeNativeItem("chat_test", {
      id: "reasoning",
      type: "reasoning",
      summary: ["Safe progress summary"],
      text: "raw hidden reasoning must not escape",
    }, projectRoot, timestamp);
    assert.equal(reasoning.markdown, "Safe progress summary");
    assert.doesNotMatch(JSON.stringify(reasoning), /raw hidden reasoning/);

    const unsupported = loaded.module.normalizeNativeItem("chat_test", {
      id: "future-item",
      type: "futureExperimentalThing",
    }, projectRoot, timestamp);
    assert.equal(unsupported.kind, "unsupported");
    assert.equal(loaded.module.normalizeNativeItem("chat_test", { id: "user", type: "userMessage" }, projectRoot, timestamp), null);

    const nativeTurn = loaded.module.normalizeNativeTurn({
      chatId: "chat_test",
      nativeThreadId: "native-thread",
      providerId: "desktop_bundled",
      title: "Test",
      preview: "",
      createdAt: timestamp,
      updatedAt: timestamp,
      pinned: false,
      archived: false,
      lastStatus: "idle",
      messageReceipts: {},
      taskLinks: [],
    }, {
      id: "native-turn",
      status: "completed",
      startedAt: timestamp,
      items: [{
        id: "native-user",
        type: "userMessage",
        clientId: "client_message_recovered_123",
        content: [{ type: "text", text: "Accepted once" }],
      }],
    }, projectRoot, null);
    assert.equal(nativeTurn.clientMessageId, "client_message_recovered_123");
    assert.equal(nativeTurn.userMessage.markdown, "Accepted once");
  } finally {
    loaded.cleanup();
  }
});
