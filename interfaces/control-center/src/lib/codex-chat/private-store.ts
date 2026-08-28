import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolvePrithaStateRoot, resolveTechscopeRoot } from "@/lib/pritha-paths";
import { appendPrivateAuditEvent, atomicWritePrivateJson } from "@/lib/private-json";
import type { RuntimeProviderId, TaskLinkView, ThreadStatus } from "./types";

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
  title: string;
  preview: string;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  archived: boolean;
  lastStatus: ThreadStatus;
  messageReceipts: Record<string, MessageReceipt>;
  taskLinks: TaskLinkView[];
};

type RegistryFile = {
  version: 1;
  chats: Record<string, ChatBinding>;
};

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
  const createdAt = String(row.createdAt || new Date(0).toISOString());
  return {
    chatId: String(row.chatId),
    clientThreadId: String(row.clientThreadId || ""),
    createHash: String(row.createHash || ""),
    nativeThreadId: String(row.nativeThreadId),
    providerId: row.providerId,
    title: String(row.title || "New Codex chat").slice(0, 120),
    preview: String(row.preview || "").slice(0, 500),
    createdAt,
    updatedAt: String(row.updatedAt || createdAt),
    pinned: row.pinned === true,
    archived: row.archived === true,
    lastStatus: ["not_loaded", "idle", "active", "system_error", "archived"].includes(String(row.lastStatus))
      ? (row.lastStatus as ThreadStatus)
      : "not_loaded",
    messageReceipts: row.messageReceipts && typeof row.messageReceipts === "object" ? row.messageReceipts : {},
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
    super("Codex Chat history bindings are temporarily read-only because the private registry is damaged.");
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
  private registry: RegistryFile | null = null;
  private readOnlyError: CodexChatRegistryError | null = null;
  private mutationQueue: Promise<void> = Promise.resolve();

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

  async recordRuntimeEvent(event: string, detail: Record<string, unknown>) {
    await this.audit(event, detail);
  }

  async put(binding: ChatBinding) {
    return this.enqueueMutation(async () => {
      if (this.readOnlyError) throw this.readOnlyError;
      const registry = await this.load();
      registry.chats[binding.chatId] = normalizeBinding(binding) || binding;
      await this.persist();
      return registry.chats[binding.chatId];
    });
  }

  async patch(chatId: string, patch: Partial<ChatBinding>) {
    return this.enqueueMutation(async () => {
      if (this.readOnlyError) throw this.readOnlyError;
      const registry = await this.load();
      const current = registry.chats[chatId];
      if (!current) return null;
      const next = normalizeBinding({ ...current, ...patch, chatId }) || current;
      registry.chats[chatId] = next;
      await this.persist();
      return next;
    });
  }

  private enqueueMutation<T>(operation: () => Promise<T>) {
    const result = this.mutationQueue.catch(() => undefined).then(operation);
    this.mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async load() {
    if (this.registry) return this.registry;
    const primaryText = await readOptional(this.registryPath);
    if (primaryText == null) {
      const backupText = await readOptional(this.backupPath);
      if (backupText == null) {
        this.registry = emptyRegistry();
        return this.registry;
      }
      try {
        this.registry = parseRegistry(backupText);
        await this.writeRegistry(this.registryPath, this.registry);
        await this.audit("registry-restored", { reason: "primary_missing" });
        return this.registry;
      } catch {
        this.readOnlyError = new CodexChatRegistryError();
        throw this.readOnlyError;
      }
    }
    try {
      this.registry = parseRegistry(primaryText);
      return this.registry;
    } catch {
      const backupText = await readOptional(this.backupPath);
      try {
        if (backupText == null) throw new Error("backup_missing");
        this.registry = parseRegistry(backupText);
        await this.writeRegistry(this.registryPath, this.registry);
        await this.audit("registry-restored", { reason: "primary_corrupt" });
        return this.registry;
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

  private async persist() {
    if (this.readOnlyError) throw this.readOnlyError;
    const registry = this.registry || emptyRegistry();
    const previous = await this.validPrimarySnapshot();
    if (previous) await this.writeRegistry(this.backupPath, previous);
    await this.writeRegistry(this.registryPath, registry);
    if (!previous) {
      // Seed a recoverable last-known-good copy on the first successful write.
      await this.writeRegistry(this.backupPath, registry);
    }
  }
}
