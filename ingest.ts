import { secToBeats } from "@shared/beats";
import { captionPrefix, firstSectionTag } from "@shared/caption";
import { newId } from "@shared/ids";
import type { Asset, Clip, Job, Music3JobParams } from "@shared/types";
import { bridgeGetArtifact } from "./bridge";
import type { Env } from "./env";
import type { Store } from "./store";
import { parseWavHeader } from "./wav";

function asMusic3Params(params: Job["params"]): Music3JobParams {
  const p = params as Music3JobParams;
  return {
    lyrics: p.lyrics ?? "",
    caption: p.caption ?? "",
    seed: p.seed ?? 0,
    durationSec: p.durationSec ?? 60,
    playheadBeats: p.playheadBeats ?? 0,
    model: p.model,
  };
}

function clipLabel(params: Music3JobParams): string {
  return firstSectionTag(params.lyrics) ?? captionPrefix(params.caption);
}

/** Idempotent ingest: keyed on job id. KV lock makes a poll race harmless. */
export async function ingestSucceededJob(env: Env, store: Store, job: Job): Promise<Job> {
  if (job.status === "succeeded" && job.resultAssetIds.length > 0) return job;
  if (!job.bridgeJobId) {
    return (
      (await store.updateJob(job.id, {
        status: "failed",
        error: "missing_bridge_job_id",
      })) ?? job
    );
  }

  const lockKey = `job:${job.id}:ingest`;
  const locked = await env.CONFIG.get(lockKey);
  if (locked) {
    const latest = await store.getJob(job.id);
    return latest ?? job;
  }
  await env.CONFIG.put(lockKey, "1", { expirationTtl: 60 });

  try {
    await store.updateJob(job.id, { status: "ingesting" });
    const params = asMusic3Params(job.params);
    const bytes = await bridgeGetArtifact(env, job.bridgeJobId, "output.wav");
    const wav = parseWavHeader(bytes);
    const durationSec = wav?.durationSec ?? params.durationSec;
    const assetId = newId();
    const r2Key = `projects/${job.projectId}/audio/${assetId}.wav`;
    await env.MEDIA.put(r2Key, bytes, { httpMetadata: { contentType: "audio/wav" } });

    const t = Date.now();
    const asset: Asset = {
      id: assetId,
      projectId: job.projectId,
      kind: "audio",
      r2Key,
      mime: "audio/wav",
      bytes: bytes.byteLength,
      durationSec,
      sampleRate: wav?.sampleRate ?? 32000,
      channels: wav?.channels ?? 2,
      source: job.kind === "acestep_generate" ? "acestep" : "music3",
      sourceJobId: job.id,
      peaksR2Key: null,
      createdAt: t,
    };
    await store.createAsset(asset);

    const project = await store.getProject(job.projectId);
    const bpm = project?.bpm ?? 120;
    if (job.laneId) {
      const clip: Clip = {
        id: newId(),
        laneId: job.laneId,
        assetId: asset.id,
        startBeats: params.playheadBeats,
        lengthBeats: secToBeats(durationSec, bpm),
        cueInSec: 0,
        fadeInSec: 0,
        fadeOutSec: 0,
        gainDb: 0,
        synthPattern: null,
        label: clipLabel(params),
        createdAt: t,
        updatedAt: t,
      };
      await store.createClip(clip);
    }

    return (
      (await store.updateJob(job.id, {
        status: "succeeded",
        resultAssetIds: [asset.id],
        error: null,
      })) ?? job
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "ingest_failed";
    return (
      (await store.updateJob(job.id, {
        status: "failed",
        error: message === "bridge_offline" ? "bridge_offline" : message,
      })) ?? job
    );
  }
}
