import { mkdirSync } from "node:fs";
import path from "node:path";

export function createArtifactPaths(root, id, originalExtension = ".bin") {
  const safeExt = originalExtension && originalExtension.startsWith(".") ? originalExtension : `.${originalExtension || "bin"}`;
  const dir = path.join(root, "01_sources", "raw", "media", id);
  mkdirSync(dir, { recursive: true });
  return {
    dir,
    sourceJson: path.join(dir, "source.json"),
    original: path.join(dir, `original${safeExt}`),
    audio: path.join(dir, "audio.wav"),
    transcriptJson: path.join(dir, "transcript.json"),
    transcriptTxt: path.join(dir, "transcript.txt"),
    transcriptMd: path.join(dir, "transcript.md"),
  };
}
