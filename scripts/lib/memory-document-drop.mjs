import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Removing an agent moves its memory documents into the archive on purpose
// (agents-mother/agent-removal.mjs). The first self-test after a cleanup must
// not report those as lost; on 2026-11-15 archiving 30 test agents moved 178
// documents and self-test failed with a "critical" document-count drop.

/** Memory documents moved to the agent archive by removals after `since`. */
export function archivedMemoryDocumentsSince(stateRoot, since) {
  const after = Date.parse(since || "");
  if (!Number.isFinite(after)) return 0;
  let entries = [];
  try { entries = readdirSync(path.join(stateRoot, "archive", "agents"), { withFileTypes: true }).filter((entry) => entry.isDirectory()); } catch { return 0; }
  let count = 0;
  for (const entry of entries) {
    try {
      const manifest = JSON.parse(readFileSync(path.join(stateRoot, "archive", "agents", entry.name, "manifest.json"), "utf8"));
      if (manifest.status !== "removed" || !(Date.parse(manifest.removedAt) > after)) continue;
      count += (manifest.moves || []).filter((move) => move.kind === "memory" && String(move.from).endsWith(".md")).length;
    } catch { /* an unreadable manifest explains nothing */ }
  }
  return count;
}

/** A warning when archived removals explain the drop, otherwise a critical regression. */
export function documentDropFinding(previousDocuments, currentDocuments, archived) {
  if (!(currentDocuments < previousDocuments)) return null;
  const drop = previousDocuments - currentDocuments;
  if (drop <= archived) {
    return { kind: "warning", id: "document-count-drop-archived", severity: "warning",
      message: `document count dropped from ${previousDocuments} to ${currentDocuments}; ${archived} documents were moved to the agent archive since the previous self-test` };
  }
  return { kind: "regression", id: "document-count-drop", severity: "critical",
    message: `document count dropped from ${previousDocuments} to ${currentDocuments}${archived ? `; only ${archived} were moved to the agent archive` : ""}` };
}
