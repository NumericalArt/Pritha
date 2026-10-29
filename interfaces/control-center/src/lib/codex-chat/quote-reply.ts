export const DRAFT_TEXT_LIMIT = 64_000;

/** Plain, editable Markdown; never changes a pending delivery snapshot. */
export function appendQuote(draft: string, selection: string): string {
  const text = selection.replace(/\r\n?/g, "\n");
  if (!text.trim()) return draft;
  const quote = `> **Из ответа Pritha:**\n${text.split("\n").map(line => `> ${line}`).join("\n")}\n\n`;
  const result = `${draft}${draft ? (draft.endsWith("\n\n") ? "" : draft.endsWith("\n") ? "\n" : "\n\n") : ""}${quote}`;
  if (result.length > DRAFT_TEXT_LIMIT) throw new Error("The quote would exceed the 64,000 character draft limit. Select a shorter passage.");
  return result;
}
