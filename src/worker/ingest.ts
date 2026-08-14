import { secToBeats } from "@shared/beats";
import { captionPrefix, firstSectionTag } from "@shared/caption";
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

function assetIdForJob(jobId: string): string {
  return `job-${jobId}-asset`;
}

function clipIdForJob(jobId: string): string {
  return `job-${jobId}-clip`;
}

async function finishFromAsset(store: Store, job: Job, asset: Asset): Promise<Job> {
  const params = asMusic3Params(job.params);
  const project = await store.getProject(job.projectId);
  const durationSec = asset.durationSec ?? params.durationSec;
  if (job.laneId) {
    const t = Date.now();
    const clip: Clip = {
      id: clipIdForJob(job.id),
      laneId: job.laneId,
      assetId: asset.id,
      startBeats: params.playheadBeats,
      lengthBeats: secToBeats(durationSec, project?.bpm ?? 120),
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
}

/** Idempotent ingest: the store claim is atomic; KV is not part of correctness. */
export async function ingestSucceededJob(env: Env, store: Store, job: Job): Promise<Job> {
  const claim = await store.claimJobForIngest(job.id);
  const current = claim.job ?? job;
  if (current.status === "succeeded" && current.resultAssetIds.length > 0) return current;

  const existingAsset = await store.getAssetBySourceJobId(job.id);
  if (existingAsset) return finishFromAsset(store, current, existingAsset);
  if (!claim.claimed) return current;

  if (!current.bridgeJobId) {
    return (
      (await store.updateJob(current.id, {
        status: "failed",
        error: "missing_bridge_job_id",
      })) ?? current
    );
  }

  try {
    const params = asMusic3Params(current.params);
    const bytes = await bridgeGetArtifact(env, current.bridgeJobId, "output.wav");
    const wav = parseWavHeader(bytes);
    const durationSec = wav?.durationSec ?? params.durationSec;
    const assetId = assetIdForJob(current.id);
    const r2Key = `projects/${current.projectId}/audio/${assetId}.wav`;
    await env.MEDIA.put(r2Key, bytes, { httpMetadata: { contentType: "audio/wav" } });

    const t = Date.now();
    const asset: Asset = {
      id: assetId,
      projectId: current.projectId,
      kind: "audio",
      r2Key,
      mime: "audio/wav",
      bytes: bytes.byteLength,
      durationSec,
      sampleRate: wav?.sampleRate ?? 32000,
      channels: wav?.channels ?? 2,
      source: current.kind === "acestep_generate" ? "acestep" : "music3",
      sourceJobId: current.id,
      peaksR2Key: null,
      createdAt: t,
    };
    const storedAsset = await store.createAsset(asset);
    return finishFromAsset(store, current, storedAsset);
  } catch (err) {
    const message = err instanceof Error ? err.message : "ingest_failed";
    return (
      (await store.updateJob(current.id, {
        status: "failed",
        error: message === "bridge_offline" ? "bridge_offline" : message,
      })) ?? current
    );
  }
}
