#!/usr/bin/env node

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { resolveTechscopeRoot } from "./lib/paths.mjs";

const ROOT = resolveTechscopeRoot();
const DEFAULT_MODEL = "mlx-community/whisper-small-mlx";
const DEFAULT_LANGUAGE = "ru";
const PYTHON = "python3";
const TOOL_BIN = path.join(ROOT, ".tools", "bin");
const TOOL_FFMPEG = path.join(TOOL_BIN, "ffmpeg");

function usage() {
  console.log(`Usage:
  node scripts/transcribe-youtube.mjs <youtube-url> [--language ru] [--model mlx-community/whisper-small-mlx] [--force]

Outputs:
  01_sources/raw/youtube-<video-id>/<video-id>.mp4
  01_sources/raw/youtube-<video-id>/<video-id>.wav
  01_sources/raw/youtube-<video-id>/<video-id>-whisper-small.json
  01_sources/raw/youtube-<video-id>/<video-id>-whisper-small.txt
  01_sources/raw/youtube-<video-id>/<video-id>-whisper-small.md`);
}

function parseArgs(argv) {
  const args = { url: "", language: DEFAULT_LANGUAGE, model: DEFAULT_MODEL, force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--language") {
      args.language = argv[++i];
    } else if (arg === "--model") {
      args.model = argv[++i];
    } else if (arg === "--force") {
      args.force = true;
    } else if (!args.url) {
      args.url = arg;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!args.url) throw new Error("Missing YouTube URL.");
  return args;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    env: options.env || process.env,
  });
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
    throw new Error(`${command} ${args.join(" ")} failed${detail ? `:\n${detail}` : ""}`);
  }
  return result.stdout || "";
}

function commandPath(command) {
  const result = spawnSync("command", ["-v", command], {
    shell: true,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? result.stdout.trim() : "";
}

function pythonScriptPath(command) {
  const script = `
import os
import site
import sysconfig
command = ${JSON.stringify(command)}
candidates = []
value = sysconfig.get_path("scripts")
if value:
    candidates.append(os.path.join(value, command))
try:
    candidates.append(os.path.join(site.USER_BASE, "bin", command))
except Exception:
    pass
for candidate in candidates:
    if os.path.exists(candidate):
        print(candidate)
        raise SystemExit(0)
raise SystemExit(1)
`;
  const result = spawnSync(PYTHON, ["-c", script], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  return result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : "";
}

function imageioFfmpegPath() {
  if (process.env.IMAGEIO_FFMPEG_BIN) return process.env.IMAGEIO_FFMPEG_BIN;
  const output = run(PYTHON, ["-c", "import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())"], { capture: true });
  return output.trim();
}

function ensureTooling() {
  run(PYTHON, ["-m", "yt_dlp", "--version"], { capture: true });
  const mlxWhisper = process.env.MLX_WHISPER_BIN || commandPath("mlx_whisper") || pythonScriptPath("mlx_whisper");
  if (!mlxWhisper) {
    throw new Error("mlx_whisper not found. Install with: python3 -m pip install --user mlx-whisper");
  }
  const ffmpeg = imageioFfmpegPath();
  if (!existsSync(ffmpeg)) {
    throw new Error(`imageio ffmpeg binary not found. Install with: python3 -m pip install --user imageio-ffmpeg`);
  }
  mkdirSync(TOOL_BIN, { recursive: true });
  if (!existsSync(TOOL_FFMPEG)) {
    execFileSync("ln", ["-sf", ffmpeg, TOOL_FFMPEG]);
  }
  return { mlxWhisper, ffmpeg };
}

function getMetadata(url) {
  const output = run(PYTHON, [
    "-m",
    "yt_dlp",
    "--print",
    "%(id)s\n%(title)s\n%(channel)s\n%(duration_string)s\n%(webpage_url)s",
    url,
  ], { capture: true });
  const clean = output
    .split(/\r?\n/)
    .filter((line) => line.trim() && !line.startsWith("WARNING:") && !line.startsWith("Deprecated Feature:"));
  const [id, title, channel, duration, webpageUrl] = clean.slice(-5);
  if (!id) throw new Error("Could not read video id from yt-dlp metadata.");
  return { id, title, channel, duration, webpageUrl };
}

function modelSlug(model) {
  if (model.includes("whisper-small")) return "whisper-small";
  return model.split("/").pop().replace(/-mlx$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-");
}

function writeReadableOutputs(jsonPath, txtPath, mdPath, meta, args) {
  const data = JSON.parse(readFileSync(jsonPath, "utf8"));
  const text = String(data.text || "").trim();
  const segments = Array.isArray(data.segments) ? data.segments : [];

  writeFileSync(txtPath, `${text}\n`);

  const segmentLines = segments.map((segment) => {
    const start = Number(segment.start || 0);
    const minutes = Math.floor(start / 60).toString().padStart(2, "0");
    const seconds = Math.floor(start % 60).toString().padStart(2, "0");
    return `- [${minutes}:${seconds}] ${String(segment.text || "").trim()}`;
  });

  writeFileSync(mdPath, `# YouTube Transcript: ${meta.title}

Source: ${meta.webpageUrl}
Channel: ${meta.channel}
Duration: ${meta.duration}
Model: ${args.model}
Language: ${args.language}

## Transcript

${text}

## Segments

${segmentLines.join("\n")}
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const tooling = ensureTooling();

  const meta = getMetadata(args.url);
  const outDir = path.join(ROOT, "01_sources", "raw", `youtube-${meta.id}`);
  mkdirSync(outDir, { recursive: true });

  const videoPath = path.join(outDir, `${meta.id}.mp4`);
  const wavPath = path.join(outDir, `${meta.id}.wav`);
  const outputBase = `${meta.id}-${modelSlug(args.model)}`;
  const jsonPath = path.join(outDir, `${outputBase}.json`);
  const txtPath = path.join(outDir, `${outputBase}.txt`);
  const mdPath = path.join(outDir, `${outputBase}.md`);

  console.log(`Video: ${meta.title}`);
  console.log(`Channel: ${meta.channel}`);
  console.log(`Duration: ${meta.duration}`);
  console.log(`Output: ${path.relative(ROOT, outDir)}`);

  if (!existsSync(videoPath) || args.force) {
    run(PYTHON, [
      "-m",
      "yt_dlp",
      "--extractor-args",
      "youtube:player_client=android",
      "-f",
      "18",
      "-o",
      path.join(outDir, "%(id)s.%(ext)s"),
      args.url,
    ]);
  } else {
    console.log(`Skip download: ${path.relative(ROOT, videoPath)}`);
  }

  if (!existsSync(wavPath) || args.force) {
    run(tooling.ffmpeg, [
      "-y",
      "-i",
      videoPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      wavPath,
    ]);
  } else {
    console.log(`Skip audio extraction: ${path.relative(ROOT, wavPath)}`);
  }

  if (!existsSync(jsonPath) || args.force) {
    run(tooling.mlxWhisper, [
      "--model",
      args.model,
      "--language",
      args.language,
      "--output-dir",
      outDir,
      "--output-name",
      outputBase,
      "--output-format",
      "json",
      "--verbose",
      "False",
      wavPath,
    ], {
      env: {
        ...process.env,
        PATH: `${TOOL_BIN}:${process.env.PATH}`,
      },
    });
  } else {
    console.log(`Skip ASR: ${path.relative(ROOT, jsonPath)}`);
  }

  writeReadableOutputs(jsonPath, txtPath, mdPath, meta, args);

  console.log("Done.");
  console.log(`JSON: ${path.relative(ROOT, jsonPath)}`);
  console.log(`TXT:  ${path.relative(ROOT, txtPath)}`);
  console.log(`MD:   ${path.relative(ROOT, mdPath)}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  usage();
  process.exit(1);
}
