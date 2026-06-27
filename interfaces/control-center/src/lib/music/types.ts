export type MusicMode = "off" | "auto" | "on";

export type MusicGenerationStatus = "queued" | "generating" | "complete" | "failed";

export type AceStepGenerateRequest = {
  style: string;
  prompt?: string;
  durationSec?: number;
  bpm?: number;
  keyScale?: string;
  seed?: number;
  forceFresh?: boolean;
};

export type AceStepRemoteTrack = {
  taskId: string;
  fileUrl: string;
  prompt: string;
  durationSec: number;
  audioBytes: Uint8Array;
  contentType: string;
  metadata?: Record<string, unknown>;
};

export type CachedGeneratedTrack = {
  id: string;
  style: string;
  normalizedStyle: string;
  prompt: string;
  localPath: string;
  localUrl: string;
  durationSec: number;
  createdAt: string;
  aceTaskId: string;
  aceFileUrl: string;
  audioFormat: string;
  sizeBytes: number;
  seed?: number;
  metadata?: Record<string, unknown>;
};

export type PublicGeneratedTrack = Omit<CachedGeneratedTrack, "localPath">;

export type MusicGenerationJob = {
  id: string;
  status: MusicGenerationStatus;
  request: AceStepGenerateRequest & {
    normalizedStyle: string;
    durationSec: number;
  };
  createdAt: string;
  updatedAt: string;
  trackId?: string;
  track?: PublicGeneratedTrack;
  error?: string;
};

export type MusicGenerateResponse = {
  ok: boolean;
  status: "cached" | "queued" | "generating" | "failed";
  track?: PublicGeneratedTrack;
  generationId?: string;
  error?: string;
};

export type MusicStateResponse = {
  ok: boolean;
  generation?: MusicGenerationJob | null;
  latestTrack?: PublicGeneratedTrack | null;
  activeJobs: MusicGenerationJob[];
  error?: string;
};
