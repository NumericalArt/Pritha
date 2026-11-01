import { existsSync, lstatSync, readdirSync, realpathSync } from "node:fs";
import path from "node:path";

// Execution worktrees, generated evidence, dependencies and logs are not authored
// agent memory. Adding a collection is an explicit schema change, not recursion
// over everything a builder happened to place below state/agents.
const COLLECTIONS = ["contracts", "reports", "profiles", "research"];
const EXCLUDED = new Set(["worktrees", "builds", "node_modules", "vendor", "coverage", "test-results"]);

/** Keep links resolvable within private authored memory even in temporary state.
 * Only an existing exact artifact can bypass prose path redaction. */
export function privateAgentArtifactReference(reference,{root,memoryRoot}={}) {
  if(!root || !memoryRoot || typeof reference!=='string' || path.isAbsolute(reference))return null;
  try{
    const base=realpathSync(memoryRoot),file=path.resolve(root,reference),info=lstatSync(file);
    if(!info.isFile() || info.nlink!==1 || file!==realpathSync(file) || !file.startsWith(base+path.sep)
        || !COLLECTIONS.includes(path.relative(base,file).split(path.sep)[0]) || !file.endsWith('.md'))return null;
    return reference;
  }catch{return null;}
}

export function listAuthoredAgentMemoryFiles(root) {
  if (!existsSync(root) || !lstatSync(root).isDirectory() || lstatSync(root).isSymbolicLink()) return [];
  const files = [];
  function visit(directory) {
    if (!existsSync(directory)) return;
    const st = lstatSync(directory);
    if (!st.isDirectory() || st.isSymbolicLink()) return;
    // A nested checkout is execution state even if it was placed in a collection.
    if (existsSync(path.join(directory, ".git"))) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || EXCLUDED.has(entry.name) || entry.isSymbolicLink()) continue;
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && entry.name.endsWith(".md")) files.push(file);
    }
  }
  for (const collection of COLLECTIONS) visit(path.join(root, collection));
  const registry = path.join(root, "registry.md");
  if (existsSync(registry) && lstatSync(registry).isFile() && !lstatSync(registry).isSymbolicLink()) files.push(registry);
  return files.sort();
}
