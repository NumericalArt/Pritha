import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const script = fileURLToPath(new URL("../memory-retrieve.py", import.meta.url));
const domains = new Set(["agent-building-knowledge", "pritha-self", "governance"]);

/** Public, read-only research candidates. No private or legacy fallback. */
export function searchCuratedMemory(query, { domain = "agent-building-knowledge", limit = 8, root, json = true } = {}) {
  if (typeof query !== "string" || !query.trim() || query.length > 2000 || !domains.has(domain)
      || !Number.isInteger(limit) || limit < 1 || limit > 20 || !root || !path.isAbsolute(root)) {
    throw new Error("Invalid curated memory request");
  }
  const env = { ...process.env, TECHSCOPE_ROOT: root };
  const output = execFileSync(process.env.PRITHA_PYTHON || "python3", [script, query, "--domain", domain, "--limit", String(limit), ...(json ? ["--json"] : [])], {
    cwd: root, env, encoding: "utf8", timeout: 15000, maxBuffer: 4 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
  });
  if (!json) return output;
  const data = JSON.parse(output);
  if (data.evidence_kind !== "retrieval-candidates" || data.domain !== domain || !Array.isArray(data.results)) {
    throw new Error("Unexpected curated memory response");
  }
  return data;
}
