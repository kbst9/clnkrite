import { secToBeats } from "@shared/beats";
import { captionPrefix, firstSectionTag } from "@shared/caption";
import { planStemExplode, type StemArtifact } from "@shared/stems";
import { STEM_ROLES } from "@shared/types";
import type { Asset, Clip, Job, Music3JobParams, StemRole } from "@shared/types";
import { bridgeGetArtifact } from "./bridge";
import type { Env } from "./env";
import type { Store } from "./store";
import { parseWavHeader } from "./wav";

function asRecord(params: Job["params"]): Record<string, unknown> {
  return (params ?? {}) as Record<string, unknown>;
}

function playheadFromParams(params: Job["params"]): number {
  return Number(asRecord(params).playheadBeats ?? 0) || 0;
}

function durationFromParams(job: Job, asset: Asset): number {
  if (asset.durationSec != null) return asset.durationSec;
  const p = asRecord(job.params);
  return Number(p.durationSec ?? p.audioDuration ?? 60) || 60;
}

function clipLabel(job: Job): string {
  const p = asRecord(job.params);
  const lyrics = String(p.lyrics ?? "");
  const caption = String(p.caption ?? p.prompt ?? "");
  return firstSectionTag(lyrics) ?? captionPrefix(caption);
}

function assetIdForJob(jobId: string, role?: string): string {
  return role ? `job-${jobId}-asset-${role}` : `job-${jobId}-asset`;
}

function clipIdForJob(jobId: string, role?: string): string {
  return role ? `job-${jobId}-clip-${role}` : `job-${jobId}-clip`;
}

async function finishGenerateFromAsset(store: Store, job: Job, asset: Asset): Promise<Job> {
  const project = await store.getProject(job.projectId);
  const durationSec = durationFromParams(job, asset);
  if (job.laneId) {
    const t = Date.now();
    const clip: Clip = {
      id: clipIdForJob(job.id),
      laneId: job.laneId,
      assetId: asset.id,
      startBeats: playheadFromParams(job.params),
      lengthBeats: secToBeats(durationSec, project?.bpm ?? 120),
      cueInSec: 0,
      fadeInSec: 0,
      fadeOutSec: 0,
      gainDb: 0,
      synthPattern: null,
      label: clipLabel(job),
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

async function finishDemucs(store: Store, job: Job, assets: Asset[]): Promise<Job> {
  const p = asRecord(job.params);
  const sourceAssetId = String(p.sourceAssetId ?? "");
  const sourceClipId = typeof p.sourceClipId === "string" ? p.sourceClipId : null;
  const parentLane = job.laneId ? await store.getLane(job.laneId) : null;
  const sourceClip =
    (sourceClipId ? await store.getClip(sourceClipId) : null) ??
    (sourceAssetId ? (await store.listClipsByAssetId(sourceAssetId))[0] : undefined);

  if (parentLane && sourceClip) {
    const artifacts: StemArtifact[] = STEM_ROLES.map((role) => {
      const asset = assets.find((item) => item.id === assetIdForJob(job.id, role)) ?? assets.find((item) => item.r2Key.endsWith(`/${role}.wav`));
      return {
        role,
        assetId: asset?.id ?? assetIdForJob(job.id, role),
        r2Key: asset?.r2Key ?? `projects/${job.projectId}/audio/${assetIdForJob(job.id, role)}.wav`,
        bytes: asset?.bytes ?? 0,
        durationSec: asset?.durationSec ?? null,
        sampleRate: asset?.sampleRate ?? null,
        channels: asset?.channels ?? null,
      };
    });
    const plan = planStemExplode({
      jobId: job.id,
      projectId: job.projectId,
      parentLane,
      sourceClip,
      artifacts,
    });
    for (const lane of plan.lanes) {
      await store.createLane(job.projectId, {
        id: lane.id,
        kind: lane.kind,
        name: lane.name,
        arm: false,
        parentLaneId: lane.parentLaneId,
        stemRole: lane.stemRole,
        muted: lane.muted,
        sortOrder: lane.sortOrder,
      });
    }
    for (const clip of plan.clips) await store.createClip(clip);
    if (plan.muteParent) await store.updateLane(parentLane.id, { muted: true });
  }

  return (
    (await store.updateJob(job.id, {
      status: "succeeded",
      resultAssetIds: assets.map((asset) => asset.id),
      error: null,
    })) ?? job
  );
}

async function putWavAsset(
  env: Env,
  store: Store,
  job: Job,
  name: string,
  role?: StemRole,
): Promise<Asset> {
  if (!job.bridgeJobId) throw new Error("missing_bridge_job_id");
  const bytes = await bridgeGetArtifact(env, job.bridgeJobId, name);
  const wav = parseWavHeader(bytes);
  const assetId = assetIdForJob(job.id, role);
  const r2Key = `projects/${job.projectId}/audio/${assetId}.wav`;
  await env.MEDIA.put(r2Key, bytes, { httpMetadata: { contentType: "audio/wav" } });
  const t = Date.now();
  const source = job.kind === "demucs_split" ? "demucs" : job.kind === "acestep_generate" ? "acestep" : "music3";
  const params = job.params as Music3JobParams;
  return store.createAsset({
    id: assetId,
    projectId: job.projectId,
    kind: "audio",
    r2Key,
    mime: "audio/wav",
    bytes: bytes.byteLength,
    durationSec: wav?.durationSec ?? (typeof params.durationSec === "number" ? params.durationSec : null),
    sampleRate: wav?.sampleRate ?? 32000,
    channels: wav?.channels ?? 2,
    source,
    sourceJobId: job.id,
    peaksR2Key: null,
    createdAt: t,
  });
}

/** Idempotent ingest: the store claim is atomic; KV is not part of correctness. */
export async function ingestSucceededJob(env: Env, store: Store, job: Job): Promise<Job> {
  const claim = await store.claimJobForIngest(job.id);
  const current = claim.job ?? job;
  if (current.status === "succeeded" && current.resultAssetIds.length > 0) return current;

  if (current.kind === "demucs_split") {
    const existing = await store.listAssetsBySourceJobId(job.id);
    if (existing.length >= 4) return finishDemucs(store, current, existing);
    if (!claim.claimed) return current;
    if (!current.bridgeJobId) {
      return (await store.updateJob(current.id, { status: "failed", error: "missing_bridge_job_id" })) ?? current;
    }
    try {
      const assets: Asset[] = [];
      for (const role of STEM_ROLES) {
        assets.push(await putWavAsset(env, store, current, `${role}.wav`, role));
      }
      return finishDemucs(store, current, assets);
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

  const existingAsset = await store.getAssetBySourceJobId(job.id);
  if (existingAsset) return finishGenerateFromAsset(store, current, existingAsset);
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
    const storedAsset = await putWavAsset(env, store, current, "output.wav");
    return finishGenerateFromAsset(store, current, storedAsset);
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
