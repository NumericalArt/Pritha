import { createHash } from "node:crypto";
import type { TaskChatBackendDriver, TaskChatBackend } from "./driver-types";
import type { ThreadPage, ThreadSummary } from "./types";
import { CodexChatGatewayError } from "./native-gateway";
type Query = NonNullable<Parameters<TaskChatBackend["listThreads"]>[0]>;
type Position = { cursor?: string; offset: number; done: boolean };
function invalid(): never { throw new CodexChatGatewayError("invalid_cursor", "Reload the thread list after changing its provider or filters.", 400); }
function order(a: ThreadSummary, b: ThreadSummary) {
  return Number(b.pinned) - Number(a.pinned) || Date.parse(b.updatedAt) - Date.parse(a.updatedAt) || a.chatId.localeCompare(b.chatId);
}

/** A cursor stores only opaque backend positions, never message text or titles. */
export async function providerThreadPage(drivers: TaskChatBackendDriver[], query: Query = {}): Promise<ThreadPage> {
  const { cursor, limit: requestedLimit, ...filters } = query;
  const limit = Math.max(1, Math.min(requestedLimit || 30, 50));
  const identity = createHash("sha256").update(JSON.stringify([drivers.map(driver => driver.connectorId).sort(), filters])).digest("hex").slice(0, 24);
  let positions: Record<string, Position> = Object.fromEntries(drivers.map(driver => [driver.connectorId, { offset: 0, done: false }]));
  if (cursor) {
    if (!cursor.startsWith("providers:") || cursor.length > 12_000) invalid();
    try {
      const value = JSON.parse(Buffer.from(cursor.slice(10), "base64url").toString("utf8"));
      if (value.version !== 1 || value.identity !== identity || !value.positions || typeof value.positions !== "object") invalid();
      if (Object.keys(value.positions).sort().join(",") !== Object.keys(positions).sort().join(",")) invalid();
      for (const position of Object.values(value.positions) as Position[]) {
        if (!position || !Number.isSafeInteger(position.offset) || position.offset < 0 || position.offset > 50 || typeof position.done !== "boolean" || (position.cursor !== undefined && (typeof position.cursor !== "string" || position.cursor.length > 2_000))) invalid();
      }
      positions = value.positions;
    } catch { invalid(); }
  }
  const pages = new Map<string, ThreadPage>();
  const fill = async (driver: TaskChatBackendDriver) => {
    const position = positions[driver.connectorId];
    if (position.done) return;
    const page = await driver.listThreads({ ...filters, cursor: position.cursor, limit: 50 });
    if (position.offset > page.data.length) invalid();
    pages.set(driver.connectorId, page);
    if (!page.data.length) {
      // Backends must not offer empty continuation pages: fail before spinning.
      if (page.nextCursor) invalid();
      position.done = true;
    }
  };
  await Promise.all(drivers.map(fill));
  const data: ThreadSummary[] = [];
  while (data.length < limit) {
    const candidates = drivers.filter(driver => !positions[driver.connectorId].done).map(driver => ({ driver, row: pages.get(driver.connectorId)!.data[positions[driver.connectorId].offset] }));
    if (!candidates.length) break;
    if (candidates.some(item => !item.row)) invalid();
    candidates.sort((a, b) => order(a.row, b.row));
    const { driver, row } = candidates[0], position = positions[driver.connectorId], page = pages.get(driver.connectorId)!;
    data.push(row); position.offset++;
    if (position.offset === page.data.length) {
      position.offset = 0;
      if (page.nextCursor) { position.cursor = page.nextCursor; await fill(driver); }
      else position.done = true;
    }
  }
  const nextCursor = Object.values(positions).every(position => position.done) ? null : `providers:${Buffer.from(JSON.stringify({ version: 1, identity, positions })).toString("base64url")}`;
  return { data, nextCursor };
}
