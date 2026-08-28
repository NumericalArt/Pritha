import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import ts from "../interfaces/control-center/node_modules/typescript/lib/typescript.js";

const root = "interfaces/control-center/src";
const appServerSource = readFileSync(`${root}/lib/codex-chat/app-server.ts`, "utf8");
const gatewaySource = readFileSync(`${root}/lib/codex-chat/gateway.ts`, "utf8");
const privateStoreSource = readFileSync(`${root}/lib/codex-chat/private-store.ts`, "utf8");
const privateJsonSource = readFileSync(`${root}/lib/private-json.ts`, "utf8");
const requestClientSource = readFileSync(`${root}/lib/control-center-request.ts`, "utf8");
const eventsRouteSource = readFileSync(`${root}/app/api/codex-chat/v1/threads/[chatId]/events/route.ts`, "utf8");
const threadRouteSource = readFileSync(`${root}/app/api/codex-chat/v1/threads/route.ts`, "utf8");
const turnsRouteSource = readFileSync(`${root}/app/api/codex-chat/v1/threads/[chatId]/turns/route.ts`, "utf8");
const chatPageSource = readFileSync(`${root}/components/codex/CodexChatPage.tsx`, "utf8");
const routesSource = readFileSync(`${root}/lib/routes.ts`, "utf8");
const stylesSource = readFileSync(`${root}/styles/globals.css`, "utf8");

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
  assert.match(appServerSource, /ChatGPT\.app\/Contents\/Resources\/codex/);
  assert.match(appServerSource, /Codex\.app\/Contents\/Resources\/codex/);
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
  assert.match(gatewaySource, /connection\.request\("thread\/start"/);
  assert.match(gatewaySource, /this\.runtime\.readThread\(binding\.providerId, binding\.nativeThreadId, includeTurns\)/);
  assert.match(gatewaySource, /connection\.request\("turn\/start"/);
  assert.match(gatewaySource, /ephemeral: false/);
  assert.doesNotMatch(gatewaySource, /--ephemeral/);
  assert.match(gatewaySource, /if \(this\.activeTurns\.has\(chatId\)\)/);
  assert.match(gatewaySource, /fallback_confirmation_required/);
  assert.match(gatewaySource, /messageReceipts/);
  assert.match(gatewaySource, /idempotency_conflict/);
  assert.match(gatewaySource, /recoveredNativeTurn/);
  assert.match(gatewaySource, /candidate\?\.clientMessageId === input\.clientMessageId/);
  assert.match(gatewaySource, /MAX_EVENTS_PER_CHAT = 10_000/);
  assert.match(gatewaySource, /this\.activeTurns\.delete\(chatId\)/);
  assert.match(gatewaySource, /reconciledStatus !== binding\.lastStatus/);
});

test("Codex Chat private linkage remains outside tracked knowledge and uses atomic private writes", () => {
  assert.match(privateStoreSource, /path\.join\(stateRoot, "codex-chat"\)/);
  assert.match(privateStoreSource, /path\.join\(root, "\.private", "codex-chat"\)/);
  assert.match(privateJsonSource, /mode: 0o700/);
  assert.match(privateJsonSource, /0o600/);
  assert.match(privateStoreSource, /registry\.last-known-good\.json/);
  assert.match(privateStoreSource, /registry-read-only/);
  assert.match(privateStoreSource, /registry-restored/);
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
      invoke(new Response(JSON.stringify({ apiVersion: "1", error: { code: "runtime_unavailable", message: "Runtime unavailable.", retryable: true, requestId: "request-2" } }), {
        status: 503,
        headers: { "content-type": "application/json" },
      })),
      (error) => error.kind === "api" && error.code === "runtime_unavailable" && error.requestId === "request-2",
    );
    assert.equal(loaded.module.deliveryMayBeUnknown(new loaded.module.ControlCenterRequestError(
      "api",
      "turn_active",
      "Turn already active.",
      false,
      409,
      "request-3",
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
  assert.match(turnsRouteSource, /requireIdempotencyKey\(request\)/);
  assert.match(turnsRouteSource, /status: 202/);
  assert.match(eventsRouteSource, /request\.headers\.get\("last-event-id"\)/);
  assert.match(eventsRouteSource, /url\.searchParams\.get\("afterEventId"\)/);
  assert.match(eventsRouteSource, /"Content-Type": "text\/event-stream; charset=utf-8"/);
  assert.match(eventsRouteSource, /"X-Accel-Buffering": "no"/);
  assert.match(eventsRouteSource, /15_000/);
});

test("Codex Chat navigation, editable dictation and 320px-safe layout are present", () => {
  assert.match(routesSource, /href: "\/codex"/);
  assert.match(chatPageSource, /SpeechRecognition/);
  assert.match(chatPageSource, /setDraft\(\(current\) =>/);
  assert.doesNotMatch(chatPageSource, /recognition\.onresult[\s\S]{0,700}sendMessage\(/);
  assert.match(chatPageSource, /new EventSource\(streamUrl\)/);
  assert.match(stylesSource, /grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(stylesSource, /@media \(max-width: 390px\)/);
  assert.match(stylesSource, /\.codex-history-overlay/);
});

test("Codex Chat reconciles missed completion events and exposes explicit recovery", () => {
  assert.match(chatPageSource, /\[1_000, 2_000, 5_000, 10_000, 30_000\]/);
  assert.doesNotMatch(chatPageSource, /window\.setInterval/);
  assert.match(chatPageSource, /window\.addEventListener\("focus", onFocus\)/);
  assert.match(chatPageSource, /window\.addEventListener\("online", onOnline\)/);
  assert.match(chatPageSource, /document\.addEventListener\("visibilitychange", onVisibility\)/);
  assert.match(chatPageSource, /await checkControlCenterHealth\(\)/);
  assert.match(chatPageSource, /await synchronize\(selectedChatIdRef\.current, true\)/);
  assert.match(chatPageSource, /recovering \? "Retrying…" : "Retry"/);
  assert.match(chatPageSource, /delivery_unknown/);
  assert.match(chatPageSource, /clientMessageId: delivery\.clientMessageId/);
  assert.doesNotMatch(chatPageSource, /localStorage|indexedDB/i);
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
