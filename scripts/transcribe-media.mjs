#!/usr/bin/env node

import { copyFileSync, existsSync } from "node:fs";
import path from "node:path";
import { resolveTechscopeRoot } from "./lib/paths.mjs";
import { parseSource } from "./media/core/source.mjs";
import { resolveAdapter } from "./media/core/adapter-registry.mjs";
import { createMediaId } from "./media/core/media-id.mjs";
import { createArtifactPaths } from "./media/core/artifacts.mjs";
import { extractAudio } from "./media/core/ffmpeg.mjs";
import { ensureMediaTooling, run } from "./media/core/tooling.mjs";
import { transcribeAudio } from "./media/core/transcription.mjs";
import { writeReadableTranscript, writeSourceJson } from "./media/core/transcript-writer.mjs";
import { relPath } from "./media/core/paths.mjs";

const ROOT = resolveTechscopeRoot();
const DEFAULT_MODEL = "mlx-community/whisper-small-mlx";
const DEFAULT_LANGUAGE = "ru";

function usage() {
  console.log(`Usage:
  node scripts/transcribe-media.mjs <source> [--language ru] [--model mlx-community/whisper-small-mlx] [--force] [--json]

Outputs:
  01_sources/raw/media/<media-id>/source.json
  01_sources/raw/media/<media-id>/original.<ext>
  01_sources/raw/media/<media-id>/audio.wav
  01_sources/raw/media/<media-id>/transcript.json
  01_sources/raw/media/<media-id>/transcript.txt
  01_sources/raw/media/<media-id>/transcript.md`);
}

function parseArgs(argv) {
  const args = {
    source: "",
    language: DEFAULT_LANGUAGE,
    model: DEFAULT_MODEL,
    force: false,
    json: false,
    help: false,
    mock: process.env.PRITHA_TRANSCRIBE_MEDIA_MOCK === "1",
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--language") args.language = argv[++i];
    else if (arg === "--model") args.model = argv[++i];
    else if (arg === "--force") args.force = true;
    else if (arg === "--json") args.json = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (!args.source) args.source = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.help && !args.source) throw new Error("Missing media source.");
  return args;
}

async function transcribeMedia(args) {
  const source = parseSource(args.source, { root: ROOT });
  const adaptersDir = path.join(ROOT, "scripts", "media", "adapters");
  const adapter = await resolveAdapter(source, { adaptersDir });
  const commandRunner = (command, commandArgs, options = {}) => run(command, commandArgs, {
    ...options,
    capture: args.json || options.capture,
  });
  const sourceInfo = await adapter.prepareSource(source, {
    root: ROOT,
    run: commandRunner,
    force: args.force,
  });
  const id = createMediaId({ title: sourceInfo.title, input: source.input });
  const artifacts = createArtifactPaths(ROOT, id, sourceInfo.originalExtension);

  if (!existsSync(artifacts.original) || args.force) {
    copyFileSync(sourceInfo.originalMediaPath, artifacts.original);
  }

  const tooling = ensureMediaTooling(ROOT, { mock: args.mock });
  extractAudio({
    inputPath: artifacts.original,
    outputPath: artifacts.audio,
    tooling,
    run: commandRunner,
    root: ROOT,
    force: args.force,
    mock: args.mock,
  });
  transcribeAudio({
    audioPath: artifacts.audio,
    transcriptJsonPath: artifacts.transcriptJson,
    artifactDir: artifacts.dir,
    model: args.model,
    language: args.language,
    tooling,
    run: commandRunner,
    root: ROOT,
    force: args.force,
    mock: args.mock,
  });

  const createdAt = new Date().toISOString();
  writeReadableTranscript({
    transcriptJsonPath: artifacts.transcriptJson,
    transcriptTxtPath: artifacts.transcriptTxt,
    transcriptMdPath: artifacts.transcriptMd,
    sourceInfo: { ...sourceInfo, input: source.input },
    model: args.model,
    language: args.language,
    createdAt,
  });
  const sourcePayload = writeSourceJson({
    root: ROOT,
    sourceJsonPath: artifacts.sourceJson,
    id,
    source,
    sourceInfo,
    artifacts,
    model: args.model,
    language: args.language,
    retrievedAt: createdAt,
  });

  return {
    id,
    source: source.input,
    source_json: relPath(ROOT, artifacts.sourceJson),
    transcript_json: relPath(ROOT, artifacts.transcriptJson),
    transcript_txt: relPath(ROOT, artifacts.transcriptTxt),
    transcript_md: relPath(ROOT, artifacts.transcriptMd),
    artifact_dir: relPath(ROOT, artifacts.dir),
    source_payload: sourcePayload,
  };
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }
  const result = await transcribeMedia(args);
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log("Media processed.");
    console.log(`Source: ${result.source}`);
    console.log(`JSON: ${result.transcript_json}`);
    console.log(`TXT:  ${result.transcript_txt}`);
    console.log(`MD:   ${result.transcript_md}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  usage();
  process.exit(1);
}
