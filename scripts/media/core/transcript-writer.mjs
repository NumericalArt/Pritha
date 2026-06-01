import { readFileSync, writeFileSync } from "node:fs";
import { relPath } from "./paths.mjs";

function timestamp(secondsValue) {
  const seconds = Math.max(0, Number(secondsValue || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
  const rest = Math.floor(seconds % 60).toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${minutes}:${rest}` : `${minutes}:${rest}`;
}

export function writeReadableTranscript({ transcriptJsonPath, transcriptTxtPath, transcriptMdPath, sourceInfo, model, language, createdAt }) {
  const data = JSON.parse(readFileSync(transcriptJsonPath, "utf8"));
  const text = String(data.text || "").trim();
  const segments = Array.isArray(data.segments) ? data.segments : [];

  writeFileSync(transcriptTxtPath, `${text}\n`);
  const segmentLines = segments.map((segment) => `- [${timestamp(segment.start)}] ${String(segment.text || "").trim()}`);
  writeFileSync(transcriptMdPath, `# Media Transcript: ${sourceInfo.title || "Untitled media"}

Source: ${sourceInfo.sourceUrl || sourceInfo.sourcePath || sourceInfo.input}
Creator: ${sourceInfo.creator || "unknown"}
Duration: ${sourceInfo.duration || "unknown"}
Model: ${model}
Language: ${language}
Created: ${createdAt}

## Transcript

${text}

## Segments

${segmentLines.join("\n")}
`);
}

export function writeSourceJson({ root, sourceJsonPath, id, source, sourceInfo, artifacts, model, language, retrievedAt }) {
  const sourceKind = source.kind === "local-file" ? "local-file" : "remote-media";
  const payload = {
    schema: "pritha-media-source-v1",
    id,
    input: source.input,
    source_kind: sourceKind,
    source_url: sourceInfo.sourceUrl || source.url || "",
    source_path: sourceInfo.sourcePath || "",
    title: sourceInfo.title || "",
    creator: sourceInfo.creator || "unknown",
    duration: sourceInfo.duration || "unknown",
    retrieved_at: retrievedAt,
    artifacts: {
      original: relPath(root, artifacts.original),
      audio: relPath(root, artifacts.audio),
      transcript_json: relPath(root, artifacts.transcriptJson),
      transcript_txt: relPath(root, artifacts.transcriptTxt),
      transcript_md: relPath(root, artifacts.transcriptMd),
    },
    transcription: {
      model,
      language,
    },
  };
  if (!payload.source_url) delete payload.source_url;
  if (!payload.source_path) delete payload.source_path;
  writeFileSync(sourceJsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}
