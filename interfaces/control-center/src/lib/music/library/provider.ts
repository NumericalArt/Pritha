import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { getMusicRuntimeConfig, type MusicRuntimeConfig } from "../config.ts";
import type { LocalMusicTrack } from "../types";

const AUDIO_FORMATS = new Map([
  [".mp3", "mp3"],
  [".m4a", "m4a"],
  [".aac", "aac"],
  [".wav", "wav"],
  [".flac", "flac"],
  [".ogg", "ogg"],
  [".opus", "opus"],
]);

function trackId(relativePath: string) {
  return `lib_${createHash("sha256").update(relativePath).digest("hex").slice(0, 24)}`;
}

function titleFromFileName(fileName: string) {
  return fileName.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || fileName;
}

function safeRelativePath(root: string, fullPath: string) {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(fullPath);
  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(`${resolvedRoot}${path.sep}`)) return null;
  return path.relative(resolvedRoot, resolvedPath);
}

export class LocalMusicLibraryProvider {
  private config: MusicRuntimeConfig;

  constructor(config = getMusicRuntimeConfig()) {
    this.config = config;
  }

  async ensureRoot() {
    await mkdir(this.config.libraryRoot, { recursive: true });
  }

  private async walk(dir: string, depth = 0): Promise<string[]> {
    if (depth > 6) return [];
    const rows = await readdir(dir, { withFileTypes: true }).catch(() => []);
    const files: string[] = [];
    for (const row of rows) {
      if (row.name.startsWith(".")) continue;
      const fullPath = path.join(dir, row.name);
      if (row.isDirectory()) {
        files.push(...(await this.walk(fullPath, depth + 1)));
      } else if (row.isFile() && AUDIO_FORMATS.has(path.extname(row.name).toLowerCase())) {
        files.push(fullPath);
      }
    }
    return files;
  }

  async listTracks(): Promise<LocalMusicTrack[]> {
    await this.ensureRoot();
    const files = await this.walk(this.config.libraryRoot);
    const tracks = await Promise.all(
      files.map(async (fullPath) => {
        const relativePath = safeRelativePath(this.config.libraryRoot, fullPath);
        if (!relativePath) return null;
        const fileStat = await stat(fullPath).catch(() => null);
        if (!fileStat?.isFile()) return null;
        const fileName = path.basename(fullPath);
        const audioFormat = AUDIO_FORMATS.get(path.extname(fileName).toLowerCase());
        if (!audioFormat) return null;
        const id = trackId(relativePath);
        return {
          id,
          title: titleFromFileName(fileName),
          fileName,
          relativePath,
          url: `/api/music/library/tracks/${encodeURIComponent(id)}`,
          audioFormat,
          sizeBytes: fileStat.size,
          updatedAt: fileStat.mtime.toISOString(),
        };
      }),
    );
    return tracks
      .filter((track): track is LocalMusicTrack => Boolean(track))
      .sort((first, second) => first.relativePath.localeCompare(second.relativePath));
  }

  async getTrack(id: string) {
    const safeId = id.replace(/[^A-Za-z0-9_-]/g, "");
    if (!safeId) return null;
    const tracks = await this.listTracks();
    return tracks.find((track) => track.id === safeId) || null;
  }

  async resolveTrackFile(id: string) {
    const track = await this.getTrack(id);
    if (!track) return null;
    const fullPath = path.resolve(this.config.libraryRoot, track.relativePath);
    const relativePath = safeRelativePath(this.config.libraryRoot, fullPath);
    if (!relativePath || relativePath !== track.relativePath) return null;
    if (!existsSync(fullPath)) return null;
    return { track, path: fullPath };
  }

  contentType(format: string) {
    if (format === "wav") return "audio/wav";
    if (format === "flac") return "audio/flac";
    if (format === "ogg") return "audio/ogg";
    if (format === "opus") return "audio/opus";
    if (format === "aac") return "audio/aac";
    if (format === "m4a") return "audio/mp4";
    return "audio/mpeg";
  }
}
