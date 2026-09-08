import { realpathSync } from "node:fs";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { asObject, itemIdFor, normalizeNativeItem, normalizeNativeTurn } from "./normalize";
import type { ChatBinding } from "./private-store";
import type { ChatItemView, HistoryContentPage, HistoryItemsPage, TurnPage, TurnView } from "./types";

export const HISTORY_PAGE_BYTES = 256 * 1024;
export const HISTORY_CONTENT_BYTES = 64 * 1024;
export const HISTORY_READ_MS = 25_000;
const CACHE_BYTES = 64 * 1024 * 1024;
const PREVIEW_BYTES = 4096;
const TTL_MS = 30_000;
export class HistoryError extends Error {
  constructor(readonly code: string, message: string, readonly status = 409, readonly retryable = false) { super(message); }
}
export type HistoryContext = {
  binding: ChatBinding;
  root: string;
  version: string;
  pagination: boolean;
  read(method: string, params: Record<string, unknown>, deadline: number): Promise<unknown>;
};
type Row = Record<string, unknown>;
type Mode = "native" | "compatibility";
type Token = { scope: string; kind: "page" | "items" | "content"; mode: Mode; turn?: string; item?: string;
  cursor?: string | null; offset?: number; contentOffset?: number; snapshot?: string; field?: string; hash?: string; sort?: "asc" | "desc" };
type Snapshot = { scope: string; chatId: string; id: string; at: number; bytes: number; turns: Row[] };
const digest = (text: string) => createHash("sha256").update(text).digest("hex");
const rows = (value: unknown): Row[] => Array.isArray(value) ? value.map(asObject).filter((x): x is Row => Boolean(x)) : [];
function sameRoot(a: unknown, b: string) {
  if (a === b) return true;
  try { return typeof a === "string" && realpathSync(a) === realpathSync(b); } catch { return false; }
}
const expired = () => new HistoryError("history_cursor_expired", "This history position has expired. Reload recent messages; displayed text is preserved.", 409, true);
function unsupported(error: unknown) {
  const e = error as { rpcCode?: number; message?: string };
  return e.rpcCode === -32601 || /(?:does not support|unsupported|not supported|unavailable for|requires).*?(?:paginat|thread\/turns\/list|thread\/items\/list)|(?:paginat).*?(?:not supported|unsupported)|unknown method/i.test(e.message || "");
}
export function utf8Prefix(text: string, max: number) {
  const buffer = Buffer.from(text.slice(0, max + 2), "utf8");
  if (buffer.length <= max) return buffer.toString("utf8");
  let end = max;
  while (end > 0 && (buffer[end] & 0xc0) === 0x80) end--;
  return buffer.subarray(0, end).toString("utf8");
}
function boundedPage<T>(page: T): T {
  // Include room for the API envelope. No page is silently truncated.
  if (Buffer.byteLength(JSON.stringify(page)) > HISTORY_PAGE_BYTES - 1024) throw new HistoryError("history_page_too_large", "This history page is too large. Request fewer entries.", 413, true);
  return page;
}
function nextCursor(value: Row) {
  if (value.nextCursor != null && typeof value.nextCursor !== "string") throw new HistoryError("history_format_unsupported", "Unsupported history cursor format.", 422);
  return typeof value.nextCursor === "string" ? value.nextCursor : null;
}

/** Process-local projections only. Native logs and private bindings are never modified. */
export class HistoryReader {
  private secret = randomBytes(32);
  private snapshots = new Map<string, Snapshot>();
  private latest = new Map<string, string>();
  private bodies = new Map<string, { text: string; at: number; bytes: number }>();
  private generation = 0;
  private fullReads = new Map<string, Promise<Snapshot>>();
  private operations = new Map<string, Promise<unknown>>();
  private compatibility = new Set<string>();
  private scope(c: HistoryContext) { return digest(JSON.stringify([c.root, c.binding.chatId, c.binding.nativeThreadId, c.binding.stateIdentityHash, c.binding.providerId, c.version])); }
  private sign(t: Token) {
    const data = Buffer.from(JSON.stringify(t)).toString("base64url");
    return `${data}.${createHmac("sha256", this.secret).update(data).digest("base64url")}`;
  }
  private parse(c: HistoryContext, value: string, kind: Token["kind"]) {
    if (value.length > 8192) throw expired();
    const [data, mac, extra] = value.split(".");
    const expected = createHmac("sha256", this.secret).update(data || "").digest();
    const actual = Buffer.from(mac || "", "base64url");
    if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw expired();
    let t: Token;
    try { t = JSON.parse(Buffer.from(data, "base64url").toString("utf8")); } catch { throw expired(); }
    if (t.scope !== this.scope(c) || t.kind !== kind) throw expired();
    return t;
  }
  private token(c: HistoryContext, mode: Mode, values: Omit<Token, "scope" | "mode">) { return this.sign({ scope: this.scope(c), mode, ...values }); }
  private purge() {
    for (const [key, value] of this.bodies) if (Date.now() - value.at > TTL_MS) this.bodies.delete(key);
    for (const [key, value] of this.snapshots) if (Date.now() - value.at > TTL_MS) this.snapshots.delete(key);
    for (const [key, id] of this.latest) if (!this.snapshots.has(id)) this.latest.delete(key);
  }
  private reserve(bytes: number) {
    let total = [...this.snapshots.values(), ...this.bodies.values()].reduce((sum, row) => sum + row.bytes, 0);
    for (const [key, row] of this.snapshots) { if (total + bytes <= CACHE_BYTES) break; this.snapshots.delete(key); total -= row.bytes; }
    for (const [key, row] of this.bodies) { if (total + bytes <= CACHE_BYTES) break; this.bodies.delete(key); total -= row.bytes; }
  }
  private async snapshot(c: HistoryContext, deadline: number, required?: string) {
    this.purge();
    const key = this.scope(c), existing = this.snapshots.get(required || this.latest.get(key) || "");
    if (existing && existing.scope === key && (!required || existing.id === required)) {
      this.snapshots.delete(existing.id); this.snapshots.set(existing.id, existing); return existing;
    }
    if (required) throw expired();
    const pending = this.fullReads.get(key);
    if (pending) return pending;
    const generation = this.generation;
    const promise = (async () => {
      const response = asObject(await c.read("thread/read", { threadId: c.binding.nativeThreadId, includeTurns: true }, deadline));
      const thread = asObject(response?.thread);
      if (!thread || !Array.isArray(thread.turns)) throw new HistoryError("history_format_unsupported", "The runtime did not return complete history.", 422);
      if (thread.id !== c.binding.nativeThreadId || !sameRoot(thread.cwd, c.root)) throw new HistoryError("history_identity_mismatch", "History does not belong to the selected workspace.", 409);
      const bytes = Buffer.byteLength(JSON.stringify(thread));
      if (bytes > CACHE_BYTES) throw new HistoryError("history_response_too_large", "This history requires a Codex runtime with pagination. Update the selected runtime.", 413);
      const value: Snapshot = { scope: key, chatId: c.binding.chatId, id: randomBytes(16).toString("hex"), at: Date.now(), bytes, turns: rows(thread.turns) };
      this.reserve(bytes);
      this.snapshots.set(value.id, value);
      if (generation === this.generation) this.latest.set(key, value.id);
      return value;
    })();
    this.fullReads.set(key, promise);
    try { return await promise; } finally { this.fullReads.delete(key); }
  }
  invalidate(c: HistoryContext) { this.latest.delete(this.scope(c)); this.generation++; }
  invalidateChat(chatId: string) {
    this.generation++;
    for (const [key, id] of this.latest) if (this.snapshots.get(id)?.chatId === chatId) this.latest.delete(key);
  }
  clear() { this.bodies.clear(); this.snapshots.clear(); this.latest.clear(); this.compatibility.clear(); this.secret = randomBytes(32); }
  async singleFlight<T>(key: string, read: () => Promise<T>): Promise<T> {
    const existing = this.operations.get(key); if (existing) return existing as Promise<T>;
    const promise = read(); this.operations.set(key, promise);
    try { return await promise; } finally { this.operations.delete(key); }
  }
  private contentRef(c: HistoryContext, mode: Mode, turn: string, item: string, field: string, extra: Partial<Token> = {}) {
    return this.token(c, mode, { kind: "content", turn, item, field, ...extra });
  }
  private compact(c: HistoryContext, raw: Row, mode: Mode): TurnView {
    const originals = rows(raw.items);
    const userItem = originals.find(item => item.type === "userMessage");
    const lastAnswer = [...originals].reverse().find(item => item.type === "agentMessage");
    const turn = normalizeNativeTurn(c.binding, { ...raw, items: [userItem, lastAnswer].filter(Boolean) }, c.root);
    if (!turn) throw new HistoryError("history_format_unsupported", "A history turn has no identity.", 422);
    const rawItems = rows(raw.items), nativeTurn = String(raw.id);
    const user = rawItems.find(x => x.type === "userMessage");
    const assistant = [...turn.items].reverse().find(x => x.kind === "assistant_message");
    const sourceAssistant = assistant && rawItems.find(x => itemIdFor(c.binding.chatId, String(x.id || "")) === assistant.id);
    turn.userMessage = { ...turn.userMessage, markdown: utf8Prefix(turn.userMessage.markdown, PREVIEW_BYTES) };
    // Summary items can themselves be incomplete: always offer the verified original body.
    if (user) turn.userMessage.contentRef = this.contentRef(c, mode, nativeTurn, String(user.id), "user", { sort: "asc" });
    if (!user) turn.userMessage.markdown = "Request details are available in Activity.";
    turn.items = assistant ? [assistant] : [];
    if (assistant?.kind === "assistant_message" && sourceAssistant) {
      assistant.message = { ...assistant.message, markdown: utf8Prefix(assistant.message.markdown, PREVIEW_BYTES),
        contentRef: this.contentRef(c, mode, nativeTurn, String(sourceAssistant.id), "message", { sort: "desc" }) };
    }
    turn.history = { itemsState: "not_loaded", itemsRef: this.token(c, mode, { kind: "items", turn: nativeTurn }), sourceMode: mode };
    return turn;
  }
  async page(c: HistoryContext, cursor?: string, limit = 20, deadline = Date.now() + HISTORY_READ_MS): Promise<TurnPage> {
    const t = cursor ? this.parse(c, cursor, "page") : null;
    let mode: Mode = t?.mode || (!c.pagination || this.compatibility.has(this.scope(c)) ? "compatibility" : "native");
    const data: TurnView[] = [];
    let older: string | null = null;
    if (mode === "native") {
      let next = t?.cursor || null;
      // A one-turn boundary gives an exact continuation even when the byte cap wins.
      for (let i = 0; i < Math.min(20, limit); i++) {
        let response: Row | null;
        try { response = asObject(await c.read("thread/turns/list", { threadId: c.binding.nativeThreadId, cursor: next, limit: 1, sortDirection: "desc", itemsView: "summary" }, deadline)); }
        catch (error) {
          if (!cursor && !data.length && unsupported(error)) {
            this.compatibility.add(this.scope(c)); return this.page(c, undefined, limit, deadline);
          }
          throw error;
        }
        if (!response || !Array.isArray(response.data)) throw new HistoryError("history_format_unsupported", "Unsupported paginated history response.", 422);
        const batch = rows(response.data);
        if (batch.length > 1) throw new HistoryError("history_format_unsupported", "The runtime ignored the history page limit.", 422);
        const following = nextCursor(response);
        if (following && following === next) throw new HistoryError("history_format_unsupported", "The runtime returned a repeated history cursor.", 422);
        if (batch.length) {
          const compact = this.compact(c, batch[0], mode);
          if (data.length && Buffer.byteLength(JSON.stringify([...data, compact])) > HISTORY_PAGE_BYTES - 10_240) { older = this.token(c, mode, { kind: "page", cursor: next }); break; }
          data.push(compact);
        }
        next = following; older = next ? this.token(c, mode, { kind: "page", cursor: next }) : null;
        if (!next) break;
      }
    } else {
      const snapshot = await this.snapshot(c, deadline, t?.snapshot);
      let offset = t?.offset ?? snapshot.turns.length;
      for (let i = 0; i < Math.min(20, limit) && offset > 0; i++) {
        const compact = this.compact(c, snapshot.turns[offset - 1], mode);
        if (data.length && Buffer.byteLength(JSON.stringify([...data, compact])) > HISTORY_PAGE_BYTES - 10_240) break;
        data.push(compact); offset--;
      }
      older = offset ? this.token(c, mode, { kind: "page", offset, snapshot: snapshot.id }) : null;
    }
    return boundedPage({ data: data.reverse(), olderCursor: older, newerCursor: null, hasOlder: Boolean(older), hasNewer: false,
      snapshotAt: new Date().toISOString(), sourceMode: mode, imageInputsState: "unknown" });
  }
  private async itemBatch(c: HistoryContext, t: Token, deadline: number, limit = 40): Promise<{ data: Row[]; next: string | null; mode: Mode }> {
    if (t.mode === "native") {
      try {
        const response = asObject(await c.read("thread/items/list", { threadId: c.binding.nativeThreadId, turnId: t.turn, cursor: t.cursor || null, limit, sortDirection: t.sort || "asc" }, deadline));
        if (!response || !Array.isArray(response.data)) throw new HistoryError("history_format_unsupported", "Unsupported history item response.", 422);
        const next = nextCursor(response);
        if (next && next === t.cursor) throw new HistoryError("history_format_unsupported", "The runtime repeated a history position.", 422);
        const entries = rows(response.data);
        if (entries.length > limit) throw new HistoryError("history_format_unsupported", "The runtime ignored the item page limit.", 422);
        if (entries.some(row => row.turnId !== t.turn || !asObject(row.item))) throw new HistoryError("history_format_unsupported", "History items belong to an unexpected turn.", 422);
        return { data: entries.map(row => asObject(row.item)!), next, mode: "native" };
      } catch (error) {
        if (!unsupported(error)) throw error;
        // Do not use a native cursor as a compatibility offset.
        if (t.cursor) throw expired();
      }
    }
    const snapshot = await this.snapshot(c, deadline, t.snapshot);
    const turn = snapshot.turns.find(x => x.id === t.turn);
    if (!turn) throw expired();
    const all = rows(turn.items); if (t.sort === "desc") all.reverse();
    const offset = t.offset || 0;
    const data = all.slice(offset, offset + limit);
    const next = offset + data.length < all.length ? this.token(c, "compatibility", { kind: "items", turn: t.turn, offset: offset + data.length, snapshot: snapshot.id, sort: t.sort }) : null;
    return { data, next, mode: "compatibility" };
  }
  private itemText(c: HistoryContext, t: Token, item: Row): string {
    if (t.field === "user") return normalizeNativeTurn(c.binding, { id: t.turn, items: [item] }, c.root)?.userMessage.markdown || "";
    if (t.field === "message") return String(item.text || "");
    if (t.field === "output") return `${String(item.command || "")}\n\n${String(item.aggregatedOutput || "")}`;
    if (t.field === "diff") return rows(item.changes).map(x => `${String(x.path || "")}\n${String(x.diff || "")}`).join("\n");
    if (t.field === "plan") return String(item.text || "");
    if (t.field === "search") return String(item.query || "");
    if (t.field === "tool") return JSON.stringify({ tool: item.tool, arguments: item.arguments, result: item.result, error: item.error }, null, 2);
    if (t.field === "reasoning") return Array.isArray(item.summary) ? item.summary.map(String).join("\n\n") : "";
    return "";
  }
  async items(c: HistoryContext, turnId: string, ref: string, deadline = Date.now() + HISTORY_READ_MS): Promise<HistoryItemsPage> {
    let t = this.parse(c, ref, "items");
    const identity = normalizeNativeTurn(c.binding, { id: t.turn, items: [] }, c.root)?.turnId;
    if (identity !== turnId) throw expired();
    const data: ChatItemView[] = [];
    let next: string | null = null;
    // One item at a time prevents an oversized activity from losing its neighbours.
    for (let i = 0; i < 40; i++) {
      const batch = await this.itemBatch(c, t, deadline, 1);
      for (const raw of batch.data) {
        const item: ChatItemView | null = raw.type === "userMessage"
          ? { id: itemIdFor(c.binding.chatId, String(raw.id)), kind: "notice", tone: "info", text: "Original user request", status: "completed", startedAt: null, completedAt: null }
          : normalizeNativeItem(c.binding.chatId, raw, c.root, new Date(0).toISOString());
        if (!item) continue;
        const field = item.kind === "assistant_message" ? "message" : item.kind === "command" ? "output" : item.kind === "file_change" ? "diff" : item.kind === "reasoning_summary" ? "reasoning" : raw.type === "userMessage" ? "user" : item.kind === "tool" ? "tool" : item.kind === "plan" ? "plan" : item.kind === "web_search" ? "search" : null;
        if (field) {
          const contentRef = this.contentRef(c, batch.mode, String(t.turn), String(raw.id), field, { cursor: batch.mode === "native" ? t.cursor : undefined, offset: batch.mode === "compatibility" ? t.offset : undefined, snapshot: t.snapshot, sort: t.sort });
          if (item.kind === "assistant_message") item.message = { ...item.message, markdown: utf8Prefix(String(raw.text || ""), 2048), contentRef };
          else item.contentRef = contentRef;
        }
        if (item.kind === "command") { item.commandPreview = utf8Prefix(item.commandPreview, 256); item.cwdLabel = item.cwdLabel ? utf8Prefix(item.cwdLabel, 512) : null; item.outputPreview = null; }
        if (item.kind === "file_change") { item.diffPreview = null; item.changes = item.changes.slice(0, 10).map(change => ({ ...change, path: utf8Prefix(change.path, 512) })); }
        if (item.kind === "reasoning_summary") item.markdown = utf8Prefix(item.markdown, 2048);
        if (data.length && Buffer.byteLength(JSON.stringify([...data, item])) > HISTORY_PAGE_BYTES - 10_240) return boundedPage({ data, nextCursor: this.sign(t) });
        data.push(item);
      }
      next = batch.next ? batch.mode === "native" ? this.token(c, "native", { kind: "items", turn: t.turn, cursor: batch.next }) : batch.next : null;
      if (!next) break;
      t = this.parse(c, next, "items");
      if (Buffer.byteLength(JSON.stringify(data)) > HISTORY_PAGE_BYTES - 16_384) break;
    }
    return boundedPage({ data, nextCursor: next });
  }
  async content(c: HistoryContext, itemId: string, ref: string, deadline = Date.now() + HISTORY_READ_MS): Promise<HistoryContentPage> {
    const original = this.parse(c, ref, "content");
    if (itemIdFor(c.binding.chatId, String(original.item)) !== itemId && itemId !== "user") throw expired();
    this.purge();
    const cached = original.hash ? this.bodies.get(`${this.scope(c)}:${original.hash}`) : undefined;
    let t = { ...original }, raw: Row | undefined;
    const seen = new Set<string>();
    while (!cached && !raw) {
      if (Date.now() >= deadline) throw new HistoryError("history_timeout", "Reading this history detail timed out. Retry without restarting the task.", 504, true);
      const batch = await this.itemBatch(c, t, deadline);
      raw = batch.data.find(x => String(x.id) === original.item);
      if (raw || !batch.next) break;
      if (seen.has(batch.next)) throw expired(); seen.add(batch.next);
      t = batch.mode === "native" ? { ...t, cursor: batch.next } : { ...this.parse(c, batch.next, "items"), field: original.field, item: original.item };
    }
    if (!cached && !raw) throw expired();
    const text = cached?.text ?? this.itemText(c, original, raw!), hash = cached ? original.hash! : digest(text);
    if (!cached) {
      const bytes = Buffer.byteLength(text);
      if (bytes <= CACHE_BYTES) { this.reserve(bytes); this.bodies.set(`${this.scope(c)}:${hash}`, { text, bytes, at: Date.now() }); }
    }
    if (original.hash && original.hash !== hash) throw new HistoryError("history_content_changed", "This message changed. Reload its details to read a consistent version.", 409, true);
    const offset = original.contentOffset || 0;
    // Content position uses UTF-16 character offsets, always advanced at codepoint boundaries.
    let chunk = utf8Prefix(text.slice(offset, offset + HISTORY_CONTENT_BYTES), HISTORY_CONTENT_BYTES - 12_288);
    while (Buffer.byteLength(JSON.stringify(chunk)) > HISTORY_CONTENT_BYTES - 12_288) chunk = utf8Prefix(chunk, Math.floor(Buffer.byteLength(chunk) * 0.8));
    const end = offset + chunk.length;
    const nextCursor = end < text.length ? this.sign({ ...original, hash, contentOffset: end }) : null;
    return { text: chunk, nextCursor, complete: !nextCursor };
  }
}
