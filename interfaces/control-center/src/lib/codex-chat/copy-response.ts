import type { TurnView } from "./types";

export function responseMarkdown(turn: TurnView) {
  return turn.items.flatMap(item => item.kind === "assistant_message" ? [item.message.markdown] : []).join("\n\n");
}

export function responseComplete(turn: TurnView) {
  return ["completed", "interrupted", "failed"].includes(turn.status);
}
