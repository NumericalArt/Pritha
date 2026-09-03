import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { atomicWritePrivateJson } from "@/lib/private-json";
import { resolvePrithaStatePath, resolvePrithaStateRoot, resolveTechscopeRoot } from "@/lib/pritha-paths";
import { isDesktopCodexBinary, resolveCodexAppBinary } from "@/lib/settings/codex-binaries";
import type { CodexRuntimeManager } from "./app-server";
import { CodexChatPrivateStore, type ChatBinding } from "./private-store";
import type { RuntimeProviderId, TaskLinkView } from "./types";

type ProgressEvent = Record<string, unknown>;

type ResolvedVoiceThread = {
  taskId: string;
  shortId: string | null;
  label: string;
  status: string;
  threadId: string;
  providerId: RuntimeProviderId | null;
  threadName: string;
  scope: TaskLinkView["subjectScope"];
  routingMode: string;
  turnIds: string[];
  resolvedAt: string;
  updatedAt: string;
};

let lastReconcileSignature = "";
let reconcilePromise: Promise<void> | null = null;

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readJson(filePath: string) {
  try { return asObject(JSON.parse(readFileSync(filePath, "utf8"))); } catch { return null; }
}

function readEvents(filePath: string) {
  try {
    return readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean).flatMap((line) => {
      try { return [JSON.parse(line) as ProgressEvent]; } catch { return []; }
    });
  } catch { return [] as ProgressEvent[]; }
}

function taskRoot() {
  return resolvePrithaStatePath("private", "interface-lab", "pritha-control-center", "realtime", "codex-tasks");
}

function configuredVoiceProvider(): RuntimeProviderId {
  return isDesktopCodexBinary(resolveCodexAppBinary()) ? "desktop_bundled" : "standalone_cli";
}

function scopeFrom(value: unknown): TaskLinkView["subjectScope"] {
  const scope = asObject(value);
  const kind = String(scope?.kind || "");
  if (!scope || !["agent", "pritha", "task", "control"].includes(kind) || !String(scope.id || "")) return null;
  return {
    kind: kind as NonNullable<TaskLinkView["subjectScope"]>["kind"],
    id: String(scope.id),
    label: String(scope.label || scope.id).slice(0, 120),
    generation: Math.max(1, Number(scope.generation || 1)),
  };
}

function resolvedThreads(taskId: string): ResolvedVoiceThread[] {
  const directory = path.join(taskRoot(), taskId);
  const request = readJson(path.join(directory, "request.json"));
  const status = readJson(path.join(directory, "status.json"));
  const events = readEvents(path.join(directory, "progress.jsonl"));
  const byThread = new Map<string, ResolvedVoiceThread>();
  let currentThreadId = "";
  for (const event of events) {
    const phase = String(event.phase || "");
    const timestamp = String(event.timestamp || request?.created_at || new Date(0).toISOString());
    if (phase.endsWith("thread_resolved") && String(event.thread_id || "")) {
      currentThreadId = String(event.thread_id);
      const prior = byThread.get(currentThreadId);
      byThread.set(currentThreadId, {
        taskId,
        shortId: String(request?.short_id || status?.short_id || "") || null,
        label: String(request?.task || event.thread_name || taskId).replace(/\s+/g, " ").trim().slice(0, 240),
        status: String(status?.status || request?.status || event.status || "unknown"),
        threadId: currentThreadId,
        providerId: event.provider_id === "desktop_bundled" || event.provider_id === "standalone_cli" ? event.provider_id : prior?.providerId || configuredVoiceProvider(),
        threadName: String(event.thread_name || prior?.threadName || "Voice task").slice(0, 120),
        scope: scopeFrom(event.thread_scope || request?.thread_scope),
        routingMode: String(event.routing_mode || request?.codex_app_thread_routing_mode || ""),
        turnIds: prior?.turnIds || [],
        resolvedAt: prior?.resolvedAt || timestamp,
        updatedAt: timestamp,
      });
      continue;
    }
    if (phase.endsWith("turn_started") && currentThreadId && String(event.turn_id || "")) {
      const row = byThread.get(currentThreadId);
      const turnId = String(event.turn_id);
      if (row && !row.turnIds.includes(turnId)) row.turnIds.push(turnId);
      if (row) row.updatedAt = timestamp;
    }
  }
  return [...byThread.values()];
}

function stableChatId(stateRoot: string, providerId: RuntimeProviderId, nativeThreadId: string) {
  const digest = createHash("sha256").update(`${stateRoot}:${providerId}:${nativeThreadId}`).digest("hex").slice(0, 24);
  return `chat_${digest}`;
}

async function resolveProvider(runtime: CodexRuntimeManager, root: string, threadId: string, expectedProvider: RuntimeProviderId | null) {
  const matches: Array<{ providerId: RuntimeProviderId; stateIdentityHash: string; native: Record<string, unknown> }> = [];
  for (const providerId of ["desktop_bundled", "standalone_cli"] as const) {
    if (expectedProvider && providerId !== expectedProvider) continue;
    const view = (await runtime.provider(providerId)).view;
    if (view.availability !== "ready" || !view.stateIdentityHash) continue;
    try {
      const result = asObject(await runtime.readThread(providerId, threadId, false));
      const native = asObject(result?.thread);
      if (!native) continue;
      const cwd = path.resolve(String(native.cwd || root));
      if (cwd !== path.resolve(root)) continue;
      matches.push({ providerId, stateIdentityHash: view.stateIdentityHash, native });
    } catch {
      // A thread id is never rebound by guessing across providers.
    }
  }
  return matches.length === 1 ? matches[0] : null;
}

async function reconcile(store: CodexChatPrivateStore, runtime: CodexRuntimeManager) {
  const tasksDirectory = taskRoot();
  if (!existsSync(tasksDirectory)) return;
  const root = resolveTechscopeRoot();
  const stateRoot = resolvePrithaStateRoot(root);
  const taskIds = readdirSync(tasksDirectory)
    .filter((entry) => existsSync(path.join(tasksDirectory, entry, "request.json")))
    .sort((left, right) => statSync(path.join(tasksDirectory, right)).mtimeMs - statSync(path.join(tasksDirectory, left)).mtimeMs)
    .slice(0, 200);
  const signature = createHash("sha256").update(taskIds.map((taskId) => {
    const directory = path.join(tasksDirectory, taskId);
    const progress = path.join(directory, "progress.jsonl");
    const status = path.join(directory, "status.json");
    return `${taskId}:${existsSync(progress) ? statSync(progress).mtimeMs : 0}:${existsSync(status) ? statSync(status).mtimeMs : 0}`;
  }).join("|")).digest("hex");
  if (signature === lastReconcileSignature) return;

  for (const taskId of taskIds) {
    const rows = resolvedThreads(taskId);
    if (!rows.length) continue;
    const ledger: Array<Record<string, unknown>> = [];
    for (const row of rows) {
      const resolved = await resolveProvider(runtime, root, row.threadId, row.providerId);
      if (!resolved) continue;
      const chatId = stableChatId(stateRoot, resolved.providerId, row.threadId);
      const existing = await store.findByNative(resolved.providerId, row.threadId);
      const link: TaskLinkView = {
        taskId: row.taskId,
        shortId: row.shortId,
        label: row.label,
        origin: "voice",
        mode: existing?.taskLinks.find((candidate) => candidate.taskId === row.taskId)?.mode || "result_reference",
        subjectScope: row.scope,
        status: row.status,
        linkedAt: row.resolvedAt,
      };
      const links = [...(existing?.taskLinks || []).filter((candidate) => candidate.taskId !== row.taskId), link];
      const now = row.updatedAt || new Date().toISOString();
      const binding: ChatBinding = existing ? {
        ...existing,
        stateIdentityHash: existing.stateIdentityHash || resolved.stateIdentityHash,
        taskLinks: links,
        updatedAt: now,
        lastStatus: String(asObject(resolved.native.status)?.type || resolved.native.status) === "active" ? "active" : existing.lastStatus,
      } : {
        chatId,
        clientThreadId: `voice-${chatId.slice(5)}`,
        createHash: createHash("sha256").update(`voice:${row.threadId}`).digest("hex"),
        nativeThreadId: row.threadId,
        providerId: resolved.providerId,
        stateIdentityHash: resolved.stateIdentityHash,
        group: "voice_work",
        origin: "voice",
        continuationEnabled: false,
        continuationEnabledAt: null,
        title: row.threadName || row.scope?.label || "Voice task",
        preview: row.label,
        createdAt: row.resolvedAt,
        updatedAt: now,
        pinned: false,
        archived: false,
        lastStatus: String(asObject(resolved.native.status)?.type || resolved.native.status) === "active" ? "active" : "idle",
        messageReceipts: {},
        taskLinks: links,
      };
      await store.put(binding);
      ledger.push({
        chat_id: binding.chatId,
        native_thread_id: row.threadId,
        provider_id: resolved.providerId,
        state_identity_hash: resolved.stateIdentityHash,
        native_turn_ids: row.turnIds,
        thread_name: row.threadName,
        thread_scope: row.scope,
        routing_mode: row.routingMode,
        linked_at: row.resolvedAt,
        updated_at: now,
      });
    }
    if (ledger.length) {
      await atomicWritePrivateJson({
        stateRoot,
        filePath: path.join(tasksDirectory, taskId, "thread-links.json"),
        resourceKey: `voice-task-thread-links:${taskId}`,
        value: { schema: "pritha-voice-task-thread-links-v1", task_id: taskId, links: ledger },
      });
    }
  }
  lastReconcileSignature = signature;
}

export async function reconcileVoiceTaskChatLinks(store: CodexChatPrivateStore, runtime: CodexRuntimeManager) {
  if (reconcilePromise) return reconcilePromise;
  reconcilePromise = reconcile(store, runtime).finally(() => { reconcilePromise = null; });
  return reconcilePromise;
}
