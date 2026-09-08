import type { ChatEventRecord } from "./types";
/** Preserve small live deltas; fetch authoritative content through bounded history routes. */
export function compactHistoryEvent(record: ChatEventRecord): ChatEventRecord {
  if (["item.started", "item.completed", "message.completed"].includes(record.event)) {
    return { event: "history.changed", data: { ...record.data, payload: {} } };
  }
  if (["turn.started", "turn.completed", "turn.failed", "turn.interrupted"].includes(record.event)) {
    return { ...record, data: { ...record.data, payload: {} } };
  }
  if (record.event === "message.delta" && JSON.stringify(record.data.payload).length > 16_384) {
    return { event: "history.changed", data: { ...record.data, payload: {} } };
  }
  return record;
}
