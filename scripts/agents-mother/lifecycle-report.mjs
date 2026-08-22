import os from "node:os";
import { redactFilesystemPaths } from "../lib/redaction.mjs";
import { writeUniqueArtifact } from "./artifact-selection.mjs";

export function lifecycleRedactionContext(options = {}) {
  return {
    projectRoot: options.projectRoot,
    stateRoot: options.stateRoot,
    root: options.root,
    homeDir: options.homeDir || os.homedir(),
  };
}

export function writeLifecycleReport(filePath, render, options = {}) {
  const context = lifecycleRedactionContext(options);
  return writeUniqueArtifact(filePath, (artifact) => {
    const markdown = typeof render === "function" ? render(artifact) : render;
    return redactFilesystemPaths(markdown, context);
  });
}
