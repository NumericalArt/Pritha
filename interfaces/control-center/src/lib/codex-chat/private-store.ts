import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolvePrithaStateRoot, resolveTechscopeRoot } from "@/lib/pritha-paths";
import { appendPrivateAuditEvent, atomicWritePrivateJson } from "@/lib/private-json";
import { ExecutionCoordinator } from "../../../../../scripts/lib/execution-coordinator.mjs";
import type { TaskWorkspace } from "../../../../../scripts/lib/task-workspace.mjs";
import type { AttachmentMessage, RuntimeProviderId, TaskLinkView, ThreadGroup, ThreadOrigin, ThreadStatus } from "./types";
import type { GoalBudgetReceipt } from "./goal-control";
import type { DeliveryBudgetReceipt } from "./delivery-types";

export type MessageReceipt = {
  clientMessageId: string;
  requestHash: string;
  turnId: string;
  nativeTurnId: string;
  startedAt: string;
};

export type ChatBinding = {
  chatId: string;
  clientThreadId: string;
  createHash: string;
  nativeThreadId: string;
  providerId: RuntimeProviderId;
  workspace?: TaskWorkspace;
  sandbox?: string;
  stateIdentityHash: string | null;
  group: ThreadGroup;
  origin: ThreadOrigin;
  continuationEnabled: boolean;
  continuationEnabledAt: string | null;
  title: string;
  preview: string;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  archived: boolean;
  lastStatus: ThreadStatus;
  messageReceipts: Record<string, MessageReceipt>;
  attachmentMessages?: Record<string, AttachmentMessage>;
  goalBudgetRequests?: Record<string, GoalBudgetReceipt>;
  deliveryBudgetRequests?: Record<string, DeliveryBudgetReceipt>;
  hasDeliveryBinding?: boolean;
  taskLinks: TaskLinkView[];
};

type RegistryFile = {
  version: 1;
  chats: Record<string, ChatBinding>;
};

export function logicalChatKey(binding: ChatBinding) {
  return binding.stateIdentityHash?.startsWith("storage-v2:")
    ? `${binding.group}:${binding.stateIdentityHash}:${binding.nativeThreadId}`
    : binding.chatId;
}

function privateChatLocations() {
  const root = resolveTechscopeRoot();
  const stateRoot = resolvePrithaStateRoot(root);
  return {
    stateRoot,
    chatRoot: stateRoot === root ? path.join(root, ".private", "codex-chat") : path.join(stateRoot, "codex-chat"),
  };
}

function emptyRegistry(): RegistryFile {
  return { version: 1, chats: {} };
}

function normalizeBinding(value: unknown): ChatBinding | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<ChatBinding>;
  if (!String(row.chatId || "").startsWith("chat_")) return null;
  if (!String(row.nativeThreadId || "")) return null;
  if (row.providerId !== "desktop_bundled" && row.providerId !== "standalone_cli") return null;
  if (row.goalBudgetRequests !== undefined && (!row.goalBudgetRequests || typeof row.goalBudgetRequests !== "object" || Array.isArray(row.goalBudgetRequests))) return null;
  if (row.deliveryBudgetRequests !== undefined && (!row.deliveryBudgetRequests || typeof row.deliveryBudgetRequests !== "object" || Array.isArray(row.deliveryBudgetRequests))) return null;
  const createdAt = String(row.createdAt || new Date(0).toISOString());
  return {
    chatId: String(row.chatId),
    clientThreadId: String(row.clientThreadId || ""),
    createHash: String(row.createHash || ""),
    nativeThreadId: String(row.nativeThreadId),
    providerId: row.providerId,
    ...(row.workspace && typeof row.workspace === "object" ? {workspace:row.workspace} : {}),
    ...(typeof row.sandbox === "string" ? {sandbox:row.sandbox} : {}),
    stateIdentityHash: typeof row.stateIdentityHash === "string" ? row.stateIdentityHash : null,
    group: row.group === "voice_work" || row.group === "other_sessions" ? row.group : "my_chats",
    origin: row.origin === "voice" || row.origin === "external" || row.origin === "exec_fallback" ? row.origin : "chat",
    continuationEnabled: row.continuationEnabled === true || (row.group == null && row.origin == null),
    continuationEnabledAt: typeof row.continuationEnabledAt === "string" ? row.continuationEnabledAt : null,
    title: String(row.title || "New task chat").slice(0, 120),
    preview: String(row.preview || "").slice(0, 500),
    createdAt,
    updatedAt: String(row.updatedAt || createdAt),
    pinned: row.pinned === true,
    archived: row.archived === true,
    lastStatus: ["not_loaded", "idle", "active", "system_error", "archived"].includes(String(row.lastStatus))
      ? (row.lastStatus as ThreadStatus)
      : "not_loaded",
    messageReceipts: row.messageReceipts && typeof row.messageReceipts === "object" ? row.messageReceipts : {},
    ...(row.attachmentMessages && typeof row.attachmentMessages === "object" ? { attachmentMessages: row.attachmentMessages } : {}),
    ...(row.goalBudgetRequests ? { goalBudgetRequests: row.goalBudgetRequests } : {}),
    ...(row.deliveryBudgetRequests ? { deliveryBudgetRequests: row.deliveryBudgetRequests } : {}),
    ...(row.hasDeliveryBinding ? { hasDeliveryBinding: true } : {}),
    taskLinks: Array.isArray(row.taskLinks) ? row.taskLinks : [],
  };
}

function parseRegistry(text: string): RegistryFile {
  const raw = JSON.parse(text) as Partial<RegistryFile>;
  if (raw.version !== 1 || !raw.chats || typeof raw.chats !== "object" || Array.isArray(raw.chats)) {
    throw new Error("registry_schema_invalid");
  }
  const chats: Record<string, ChatBinding> = {};
  for (const value of Object.values(raw.chats)) {
    const binding = normalizeBinding(value);
    if (!binding) throw new Error("registry_binding_invalid");
    chats[binding.chatId] = binding;
  }
  return { version: 1, chats };
}

async function readOptional(filePath: string) {
  try { return await readFile(filePath, "utf8"); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export class CodexChatRegistryError extends Error {
  readonly code = "codex_chat_registry_corrupt";
  constructor() {
    super("Task Chat history bindings are temporarily read-only because the private registry is damaged.");
  }
}

export class CodexChatPrivateStore {
  private readonly locations = privateChatLocations();
  readonly stateRoot = this.locations.stateRoot;
  readonly root = this.locations.chatRoot;
  readonly registryPath = path.join(this.root, "registry.json");
  readonly backupPath = path.join(this.root, "registry.last-known-good.json");
  readonly auditPath = path.join(this.root, "registry.audit.jsonl");
  readonly capabilitiesRoot = path.join(this.root, "runtime-capabilities");
  private readOnlyError: CodexChatRegistryError | null = null;
  private mutationQueue: Promise<void> = Promise.resolve();
  private coordinator: ExecutionCoordinator | null = null;

  get execution() {
    return this.coordinator ||= new ExecutionCoordinator({ stateRoot: this.stateRoot, directory: path.join(this.root, "execution") });
  }

  close() { this.coordinator?.close(); this.coordinator = null; }

  async all() {
    const registry = await this.load();
    return Object.values(registry.chats);
  }

  async get(chatId: string) {
    const registry = await this.load();
    return registry.chats[chatId] || null;
  }

  async findByNative(providerId: RuntimeProviderId, nativeThreadId: string) {
    const rows = await this.all();
    return rows.find((row) => row.providerId === providerId && row.nativeThreadId === nativeThreadId) || null;
  }

  async findByClientThreadId(clientThreadId: string) {
    const rows = await this.all();
    return rows.find((row) => row.clientThreadId === clientThreadId) || null;
  }

  async findByTaskId(taskId: string) {
    const rows = await this.all();
    return rows.find((row) => row.taskLinks.some((link) => link.taskId === taskId)) || null;
  }

  async recordRuntimeEvent(event: string, detail: Record<string, unknown>) {
    await this.audit(event, detail);
  }

  async put(binding: ChatBinding) {
    return this.enqueueMutation(async () => {
      if (this.readOnlyError) throw this.readOnlyError;
      const registry = await this.load(true);
      registry.chats[binding.chatId] = normalizeBinding(binding) || binding;
      await this.persist(registry);
      return registry.chats[binding.chatId];
    });
  }

  async putCreatedBinding(binding: ChatBinding) {
    return this.enqueueMutation(async () => {
      const registry = await this.load(true);
      const current = Object.values(registry.chats).find(row => row.clientThreadId === binding.clientThreadId);
      if (current) {
        if (current.createHash !== binding.createHash) throw new Error("idempotency_conflict");
        return current;
      }
      registry.chats[binding.chatId] = normalizeBinding(binding) || binding;
      await this.persist(registry);
      return registry.chats[binding.chatId];
    });
  }

  async patch(chatId: string, patch: Partial<ChatBinding>) {
    return this.enqueueMutation(async () => {
      if (this.readOnlyError) throw this.readOnlyError;
      const registry = await this.load(true);
      const current = registry.chats[chatId];
      if (!current) return null;
      const next = normalizeBinding({ ...current, ...patch, chatId,
        messageReceipts: { ...current.messageReceipts, ...patch.messageReceipts },
        attachmentMessages: { ...current.attachmentMessages, ...patch.attachmentMessages },
        goalBudgetRequests: { ...current.goalBudgetRequests, ...patch.goalBudgetRequests },
        deliveryBudgetRequests: { ...current.deliveryBudgetRequests, ...patch.deliveryBudgetRequests },
      }) || current;
      registry.chats[chatId] = next;
      await this.persist(registry);
      return next;
    });
  }

  async mergeVoiceBinding(proposed: ChatBinding, link: TaskLinkView) {
    return this.enqueueMutation(async () => {
      const registry = await this.load(true);
      const current = Object.values(registry.chats).find(row => row.providerId === proposed.providerId && row.nativeThreadId === proposed.nativeThreadId);
      const priorLink = current?.taskLinks.find(row => row.taskId === link.taskId);
      const nextLink = { ...link, mode: priorLink?.mode || link.mode };
      const next = current ? {
        ...current,
        stateIdentityHash: current.stateIdentityHash || proposed.stateIdentityHash,
        updatedAt: Date.parse(current.updatedAt) > Date.parse(proposed.updatedAt) ? current.updatedAt : proposed.updatedAt,
        lastStatus: proposed.lastStatus === "active" ? "active" as const : current.lastStatus,
        taskLinks: [...current.taskLinks.filter(row => row.taskId !== link.taskId), nextLink],
      } : { ...proposed, taskLinks: [nextLink] };
      registry.chats[next.chatId] = next;
      await this.persist(registry);
      return next;
    });
  }

  async migrateIdentity(chatId: string, expected: string | null, replacement: string) {
    return this.enqueueMutation(async () => {
      if (this.readOnlyError) throw this.readOnlyError;
      const registry = await this.load(true);
      const current = registry.chats[chatId];
      if (!current) throw new Error("chat_not_found");
      if (current.stateIdentityHash === replacement) return current;
      if (current.stateIdentityHash !== expected) throw new Error("identity_changed_during_recovery");
      const key = createHash("sha256").update(`${chatId}:${expected}`).digest("hex");
      const backup = path.join(this.root, "identity-migrations", `${key}.json`);
      if (await readOptional(backup) == null) await this.writeRegistry(backup, registry);
      const next = { ...current, stateIdentityHash: replacement };
      registry.chats[chatId] = next;
      try { await this.persist(registry); } catch (error) { registry.chats[chatId] = current; throw error; }
      await this.audit("identity-converted-v2", { chatRef: key.slice(0, 16), sourcePreserved: true });
      return next;
    });
  }

  async setArchived(chatId: string, archived: boolean) {
    return this.enqueueMutation(async () => {
      if (this.readOnlyError) throw this.readOnlyError;
      const registry = await this.load(true);
      const selected = registry.chats[chatId];
      if (!selected) return null;
      const key = logicalChatKey(selected);
      const original = registry.chats;
      registry.chats = Object.fromEntries(Object.entries(original).map(([id, row]) =>
        [id, logicalChatKey(row) === key ? { ...row, archived } : row]));
      try { await this.persist(registry); } catch (error) { registry.chats = original; throw error; }
      return registry.chats[chatId];
    });
  }

  async prepareAttachmentMessage(chatId: string, messageId: string, message: AttachmentMessage) {
    return this.enqueueMutation(async () => {
      if (this.readOnlyError) throw this.readOnlyError;
      const registry = await this.load(true);
      const current = registry.chats[chatId];
      if (!current) throw new Error("chat_not_found");
      const prior = current.attachmentMessages?.[messageId];
      if (prior) return prior.requestHash === message.requestHash;
      registry.chats[chatId] = { ...current, attachmentMessages: { ...current.attachmentMessages, [messageId]: message } };
      try { await this.persist(registry); } catch (error) { registry.chats[chatId] = current; throw error; }
      return true;
    });
  }

  async removeEmptyDirectChat(chatId: string, nativeThreadId: string) {
    return this.enqueueMutation(async () => {
      if (this.readOnlyError) throw this.readOnlyError;
      const registry = await this.load(true);
      const current = registry.chats[chatId];
      const removable = current
        && current.nativeThreadId === nativeThreadId
        && current.origin === "chat"
        && current.group === "my_chats"
        && current.preview === ""
        && Object.keys(current.messageReceipts).length === 0
        && current.taskLinks.length === 0;
      if (!removable) return false;
      delete registry.chats[chatId];
      await this.persist(registry);
      await this.audit("empty-direct-chat-removed", {
        chatRef: createHash("sha256").update(chatId).digest("hex").slice(0, 16),
      });
      return true;
    });
  }

  private enqueueMutation<T>(operation: () => Promise<T>) {
    const result = this.mutationQueue.catch(() => undefined).then(() =>
      this.execution.withMutation("codex-chat-registry", async () => {
        const registry=await this.load(true);
        this.migrateLegacyReceiptGuards(registry);
        return operation();
      }));
    this.mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private migrateLegacyReceiptGuards(registry:RegistryFile) {
    const key="migration:registry-execution-v1",current=this.execution.getIntent(key);
    if(current?.state==="completed")return;
    const sourceHash=createHash("sha256").update(JSON.stringify(registry)).digest("hex");
    const {intent}=this.execution.reserveIntent(key,sourceHash,{kind:"migration",sourceSchema:1,targetExecutionSchema:1,sourceHash});
    let imported=0;
    for(const binding of Object.values(registry.chats))for(const [clientMessageId,receipt] of Object.entries(binding.messageReceipts)) {
      if(!receipt.requestHash || !receipt.nativeTurnId || !receipt.turnId)throw new CodexChatRegistryError();
      const turnKey=`turn:${binding.chatId}:${clientMessageId}`;
      const prior=this.execution.getIntent(turnKey);
      if(prior && prior.hash!==receipt.requestHash)throw new CodexChatRegistryError();
      if(!prior) {
        const {intent:guard}=this.execution.reserveIntent(turnKey,receipt.requestHash,{kind:"turn",chatId:binding.chatId,clientMessageId,nativeThreadId:binding.nativeThreadId,stateIdentityHash:binding.stateIdentityHash,receipt});
        this.execution.updateIntent(turnKey,{state:"legacy_receipt"},guard.revision);
      }
      imported++;
    }
    this.execution.updateIntent(key,{state:"completed",importedReceipts:imported,registryRetained:true},intent.revision);
  }

  private async load(locked = false): Promise<RegistryFile> {
    const primaryText = await readOptional(this.registryPath);
    if (primaryText == null) {
      const backupText = await readOptional(this.backupPath);
      if (backupText == null) {
        return emptyRegistry();
      }
      try {
        if (!locked) return this.execution.withMutation("codex-chat-registry", () => this.load(true));
        const registry = parseRegistry(backupText);
        await this.writeRegistry(this.registryPath, registry);
        await this.audit("registry-restored", { reason: "primary_missing" });
        return registry;
      } catch {
        this.readOnlyError = new CodexChatRegistryError();
        throw this.readOnlyError;
      }
    }
    try {
      return parseRegistry(primaryText);
    } catch {
      const backupText = await readOptional(this.backupPath);
      try {
        if (backupText == null) throw new Error("backup_missing");
        if (!locked) return this.execution.withMutation("codex-chat-registry", () => this.load(true));
        const registry = parseRegistry(backupText);
        const raw = await readFile(this.registryPath);
        const sha256 = createHash("sha256").update(raw).digest("hex");
        await atomicWritePrivateJson({stateRoot:this.stateRoot,filePath:path.join(this.root,"quarantine",`${sha256}.json`),value:{schema:"pritha-corrupt-registry-v1",sha256,encoding:"base64",bytes:raw.toString("base64")}});
        await this.writeRegistry(this.registryPath, registry);
        await this.audit("registry-restored", { reason: "primary_corrupt" });
        return registry;
      } catch {
        this.readOnlyError = new CodexChatRegistryError();
        await this.audit("registry-read-only", { reason: "primary_and_backup_invalid" });
        throw this.readOnlyError;
      }
    }
  }

  private async audit(event: string, detail: Record<string, unknown>) {
    await appendPrivateAuditEvent({
      stateRoot: this.stateRoot,
      filePath: this.auditPath,
      event: {
        schema: "pritha-codex-chat-registry-audit-v1",
        timestamp: new Date().toISOString(),
        event,
        ...detail,
      },
    });
  }

  private writeRegistry(filePath: string, registry: RegistryFile) {
    return atomicWritePrivateJson({
      stateRoot: this.stateRoot,
      filePath,
      resourceKey: "codex-chat-registry",
      value: registry,
    });
  }

  private async validPrimarySnapshot() {
    const primary = await readOptional(this.registryPath);
    if (primary == null) return null;
    try { return parseRegistry(primary); } catch { return null; }
  }

  private async persist(registry: RegistryFile) {
    if (this.readOnlyError) throw this.readOnlyError;
    const previous = await this.validPrimarySnapshot();
    if (previous) await this.writeRegistry(this.backupPath, previous);
    await this.writeRegistry(this.registryPath, registry);
    if (!previous) {
      // Seed a recoverable last-known-good copy on the first successful write.
      await this.writeRegistry(this.backupPath, registry);
    }
  }
}
