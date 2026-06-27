import { AceStepClient } from "./ace-step-client";
import { GeneratedMusicCache, publicGeneratedTrack } from "./cache";
import { getMusicRuntimeConfig } from "./config";
import { MusicGenerationQueue } from "./queue";
import type { AceStepGenerateRequest, MusicGenerateResponse, MusicStateResponse } from "./types";

const cache = new GeneratedMusicCache();
const client = new AceStepClient();
const queue = new MusicGenerationQueue(async (request) => {
  const remote = await client.generateTrack(request);
  return await cache.saveTrack(request, remote);
});

export async function requestGeneratedMusic(request: AceStepGenerateRequest): Promise<MusicGenerateResponse> {
  const config = getMusicRuntimeConfig();
  const style = String(request.style || config.defaultStyle).trim() || config.defaultStyle;
  const latest = request.forceFresh ? null : await cache.findLatestByStyle(style);
  const job = queue.enqueue({ ...request, style });

  if (latest) {
    return {
      ok: true,
      status: "cached",
      track: publicGeneratedTrack(latest),
      generationId: job.id,
    };
  }

  return {
    ok: true,
    status: job.status === "generating" ? "generating" : "queued",
    generationId: job.id,
  };
}

export async function getMusicState(params: { generationId?: string; style?: string } = {}): Promise<MusicStateResponse> {
  const generation = params.generationId ? queue.getJob(params.generationId) : null;
  const latest = params.style ? await cache.findLatestByStyle(params.style) : null;
  return {
    ok: true,
    generation,
    latestTrack: latest ? publicGeneratedTrack(latest) : null,
    activeJobs: queue.activeJobs(),
  };
}

export async function getMusicHealth() {
  const config = getMusicRuntimeConfig();
  const healthy = await client.health();
  let models: string[] = [];
  if (healthy) {
    models = await client.listModels().catch(() => []);
  }
  return {
    ok: true,
    aceStep: {
      healthy,
      baseUrl: config.aceStepBaseUrl,
      model: config.aceStepModel,
      models,
      apiKeyConfigured: Boolean(config.aceStepApiKey),
    },
    cache: {
      storageRoot: ".private/interface-lab/pritha-control-center/music",
      maxTracks: config.cacheMaxTracks,
      maxBytes: config.cacheMaxBytes,
    },
  };
}

export async function getCachedMusicTrack(id: string) {
  return await cache.resolveTrackFile(id);
}
