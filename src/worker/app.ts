import { Hono } from "hono";
import { secToBeats } from "../shared/beats";
import { splitClip } from "../shared/clipOps";
import { newId } from "../shared/ids";
import { jobTimedOut, mapBridgeStatus, isTerminalJobStatus } from "../shared/jobs";
import type {
  CreateClipInput,
  CreateJobInput,
  CreateLaneInput,
  CreateProjectInput,
  DemucsJobParams,
  EnginesResponse,
  Job,
  Music3JobParams,
  PatchClipInput,
  PatchLaneInput,
  PatchProjectInput,
  SplitClipInput,
} from "../shared/types";
import {
  AUDIO_MIME_ALLOWLIST,
  MAX_AUDIO_BYTES,
  MAX_VIDEO_BYTES,
  VIDEO_MIME_ALLOWLIST,
} from "../shared/types";
import {
  BridgeOfflineError,
  bridgeCancelJob,
  bridgeCreateJob,
  bridgeGetJob,
  bridgeHealth,
  bridgePutJobSource,
} from "./bridge";
import type { Env } from "./env";
import { ingestSucceededJob } from "./ingest";
import { createD1Store, type Store } from "./store";
import { parseWavHeader } from "./wav";

export type AppEnv = {
  Bindings: Env;
  Variables: { store: Store };
};

const ENGINES_CACHE_MS = 5_000;
type EnginesStatus = 200 | 503;
const enginesCache: {
  env: Env | null;
  body: EnginesResponse | null;
  status: EnginesStatus;
  until: number;
  get(env: Env): { body: EnginesResponse; status: EnginesStatus } | null;
  set(env: Env, body: EnginesResponse, status: EnginesStatus): void;
} = {
  env: null,
  body: null,
  status: 200,
  until: 0,
  get(env) {
    if (this.env !== env || !this.body || Date.now() > this.until) return null;
    return { body: this.body, status: this.status };
  },
  set(env, body, status) {
    this.env = env;
    this.body = body;
    this.status = status;
    this.until = Date.now() + ENGINES_CACHE_MS;
  },
};

export interface AppOptions {
  storeFactory?: (env: Env) => Store;
}

function jsonError(c: { json: (o: unknown, s?: number) => Response }, status: number, error: string) {
  return c.json({ error }, status);
}

function guessExt(mime: string): string {
  if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
  if (mime.includes("flac")) return "flac";
  if (mime.includes("ogg")) return "ogg";
  if (mime === "video/mp4") return "mp4";
  if (mime === "video/webm") return "webm";
  if (mime === "video/quicktime") return "mov";
  if (mime.includes("mp4") || mime.includes("m4a")) return "m4a";
  if (mime.includes("aac")) return "aac";
  return "wav";
}

function byteRange(value: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || size <= 0 || (!match[1] && !match[2])) return null;
  if (!match[1]) {
    const suffix = Number(match[2]);
    if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
    return { start: Math.max(0, size - suffix), end: size - 1 };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start >= size || requestedEnd < start) {
    return null;
  }
  return { start, end: Math.min(requestedEnd, size - 1) };
}

export function createApp(options: AppOptions = {}): Hono<AppEnv> {
  const app = new Hono<AppEnv>();
  const factory = options.storeFactory ?? ((env: Env) => createD1Store(env.DB));

  app.use("/api/*", async (c, next) => {
    c.set("store", factory(c.env));
    await next();
  });

  app.get("/api/projects", async (c) => {
    const list = await c.get("store").listProjects();
    return c.json(list);
  });

  app.post("/api/projects", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as CreateProjectInput;
    const project = await c.get("store").createProject(body);
    return c.json(project, 201);
  });

  app.get("/api/projects/:id", async (c) => {
    const doc = await c.get("store").getDocument(c.req.param("id"));
    if (!doc) return jsonError(c, 404, "not_found");
    return c.json(doc);
  });

  app.patch("/api/projects/:id", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as PatchProjectInput;
    const project = await c.get("store").updateProject(c.req.param("id"), body);
    if (!project) return jsonError(c, 404, "not_found");
    return c.json(project);
  });

  app.delete("/api/projects/:id", async (c) => {
    const ok = await c.get("store").deleteProject(c.req.param("id"));
    if (!ok) return jsonError(c, 404, "not_found");
    return c.json({ ok: true });
  });

  app.post("/api/projects/:id/lanes", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as CreateLaneInput;
    if (!body.kind) return jsonError(c, 400, "kind_required");
    const lane = await c.get("store").createLane(c.req.param("id"), body);
    if (!lane) return jsonError(c, 404, "not_found");
    return c.json(lane, 201);
  });

  app.patch("/api/lanes/:id", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as PatchLaneInput;
    const lane = await c.get("store").updateLane(c.req.param("id"), body);
    if (!lane) return jsonError(c, 404, "not_found");
    return c.json(lane);
  });

  app.delete("/api/lanes/:id", async (c) => {
    const ok = await c.get("store").deleteLane(c.req.param("id"));
    if (!ok) return jsonError(c, 404, "not_found");
    return c.json({ ok: true });
  });

  app.post("/api/projects/:id/assets", async (c) => {
    const store = c.get("store");
    const projectId = c.req.param("id");
    const project = await store.getProject(projectId);
    if (!project) return jsonError(c, 404, "not_found");

    const contentType = c.req.header("content-type") ?? "";
    let bytes: ArrayBuffer;
    let mime = "application/octet-stream";
    let laneId: string | undefined;
    let startBeats = 0;
    let suppliedDurationSec: number | null = null;
    let filename = "import";

    if (contentType.includes("multipart/form-data")) {
      const form = await c.req.parseBody();
      const file = form.file;
      if (!(file instanceof File)) return jsonError(c, 400, "file_required");
      bytes = await file.arrayBuffer();
      mime = file.type || "application/octet-stream";
      filename = file.name || filename;
      if (typeof form.laneId === "string") laneId = form.laneId;
      if (typeof form.startBeats === "string") startBeats = Number(form.startBeats) || 0;
      if (typeof form.durationSec === "string") {
        const value = Number(form.durationSec);
        if (Number.isFinite(value) && value > 0) suppliedDurationSec = value;
      }
    } else {
      bytes = await c.req.arrayBuffer();
      mime = contentType.split(";")[0]?.trim() || mime;
      laneId = c.req.query("laneId") ?? undefined;
      startBeats = Number(c.req.query("startBeats") ?? 0) || 0;
      const value = Number(c.req.query("durationSec"));
      if (Number.isFinite(value) && value > 0) suppliedDurationSec = value;
    }

    const isVideo = (VIDEO_MIME_ALLOWLIST as readonly string[]).includes(mime);
    const isAudio = (AUDIO_MIME_ALLOWLIST as readonly string[]).includes(mime);
    if (!isVideo && !isAudio) return jsonError(c, 415, "mime_not_allowed");
    if (isAudio && bytes.byteLength > MAX_AUDIO_BYTES) return jsonError(c, 413, "too_large");
    if (isVideo && bytes.byteLength > MAX_VIDEO_BYTES) return jsonError(c, 413, "too_large");

    let lane = laneId ? await store.getLane(laneId) : null;
    if (lane && lane.projectId !== projectId) return jsonError(c, 400, "lane_mismatch");
    if (!lane) {
      lane = await store.createLane(projectId, {
        kind: isVideo ? "picture" : "import",
        name: isVideo ? "Picture" : "Import",
      });
    }
    if (!lane) return jsonError(c, 500, "lane_create_failed");

    const assetId = newId();
    const ext = guessExt(mime);
    const r2Key = isVideo
      ? `projects/${projectId}/video/${assetId}.${ext}`
      : `projects/${projectId}/audio/${assetId}.${ext}`;
    await c.env.MEDIA.put(r2Key, bytes, { httpMetadata: { contentType: mime } });
    const wav = isAudio ? parseWavHeader(bytes) : null;
    const durationSec = wav?.durationSec ?? suppliedDurationSec;
    const t = Date.now();
    const asset = await store.createAsset({
      id: assetId,
      projectId,
      kind: isVideo ? "video" : "audio",
      r2Key,
      mime,
      bytes: bytes.byteLength,
      durationSec,
      sampleRate: wav?.sampleRate ?? null,
      channels: wav?.channels ?? null,
      source: isVideo ? "video" : "import",
      sourceJobId: null,
      peaksR2Key: null,
      createdAt: t,
    });
    const clip = await store.createClip({
      id: newId(),
      laneId: lane.id,
      assetId: asset.id,
      startBeats,
      lengthBeats: durationSec != null ? secToBeats(durationSec, project.bpm) : 16,
      cueInSec: 0,
      fadeInSec: 0,
      fadeOutSec: 0,
      gainDb: 0,
      synthPattern: null,
      label: filename,
      createdAt: t,
      updatedAt: t,
    });
    return c.json({ asset, clip, lane }, 201);
  });

  app.get("/api/assets/:id/blob", async (c) => {
    const asset = await c.get("store").getAsset(c.req.param("id"));
    if (!asset) return jsonError(c, 404, "not_found");
    const obj = await c.env.MEDIA.get(asset.r2Key);
    if (!obj) return jsonError(c, 404, "blob_missing");

    const etag = obj.httpEtag ?? obj.etag;
    const range = c.req.header("Range");
    const headers = new Headers();
    headers.set("Content-Type", asset.mime);
    headers.set("Accept-Ranges", "bytes");
    if (etag) headers.set("ETag", etag);

    if (range) {
      const parsed = byteRange(range, asset.bytes);
      if (!parsed) {
        headers.set("Content-Range", `bytes */${asset.bytes}`);
        return new Response(null, { status: 416, headers });
      }
      const { start, end } = parsed;
      const sliced = await c.env.MEDIA.get(asset.r2Key, { range: { offset: start, length: end - start + 1 } });
      if (!sliced) return jsonError(c, 404, "blob_missing");
      headers.set("Content-Range", `bytes ${start}-${end}/${asset.bytes}`);
      headers.set("Content-Length", String(end - start + 1));
      return new Response(sliced.body, { status: 206, headers });
    }
    headers.set("Content-Length", String(asset.bytes));
    return new Response(obj.body, { status: 200, headers });
  });

  app.put("/api/assets/:id/peaks", async (c) => {
    const store = c.get("store");
    const asset = await store.getAsset(c.req.param("id"));
    if (!asset) return jsonError(c, 404, "not_found");
    const body = await c.req.arrayBuffer();
    const peaksKey = `projects/${asset.projectId}/peaks/${asset.id}.peaks.bin`;
    await c.env.MEDIA.put(peaksKey, body, { httpMetadata: { contentType: "application/octet-stream" } });
    const updated = await store.updateAssetPeaks(asset.id, peaksKey);
    return c.json(updated);
  });

  app.get("/api/assets/:id/peaks", async (c) => {
    const asset = await c.get("store").getAsset(c.req.param("id"));
    if (!asset) return jsonError(c, 404, "not_found");
    if (!asset.peaksR2Key) return jsonError(c, 404, "peaks_missing");
    const obj = await c.env.MEDIA.get(asset.peaksR2Key);
    if (!obj) return jsonError(c, 404, "peaks_missing");
    const headers = new Headers();
    headers.set("Content-Type", "application/octet-stream");
    headers.set("Cache-Control", "public, max-age=31536000, immutable");
    const etag = obj.httpEtag ?? obj.etag;
    if (etag) headers.set("ETag", etag);
    return new Response(obj.body, { status: 200, headers });
  });

  app.post("/api/projects/:id/jobs", async (c) => {
    const store = c.get("store");
    const projectId = c.req.param("id");
    const project = await store.getProject(projectId);
    if (!project) return jsonError(c, 404, "not_found");
    const body = (await c.req.json().catch(() => ({}))) as CreateJobInput;
    if (!body.kind) return jsonError(c, 400, "kind_required");

    if (body.kind === "music3_generate" || body.kind === "acestep_generate") {
      if (!body.laneId) return jsonError(c, 400, "lane_required");
      const lane = await store.getLane(body.laneId);
      if (!lane || lane.projectId !== projectId) return jsonError(c, 400, "lane_not_found");
      if (!lane.armed) return jsonError(c, 400, "lane_not_armed");
      if (body.kind === "music3_generate" && lane.kind !== "music3") return jsonError(c, 400, "lane_kind_mismatch");
      if (body.kind === "acestep_generate" && lane.kind !== "acestep") return jsonError(c, 400, "lane_kind_mismatch");
    }

    if (body.kind === "demucs_split") {
      const params = (body.params ?? {}) as DemucsJobParams;
      if (!params.sourceAssetId) return jsonError(c, 400, "source_asset_required");
      const asset = await store.getAsset(params.sourceAssetId);
      if (!asset || asset.projectId !== projectId) return jsonError(c, 400, "source_asset_not_found");
      if (asset.source !== "music3" && asset.source !== "acestep") {
        return jsonError(c, 400, "source_not_generated");
      }
      const clips = await store.listClipsByAssetId(asset.id);
      const sourceClip = params.sourceClipId
        ? clips.find((clip) => clip.id === params.sourceClipId)
        : clips[0];
      if (!sourceClip) return jsonError(c, 400, "source_clip_not_found");
      const sourceLane = await store.getLane(sourceClip.laneId);
      if (!sourceLane || sourceLane.projectId !== projectId) return jsonError(c, 400, "source_clip_not_found");
      body.laneId = sourceClip.laneId;
      body.params = { ...params, sourceClipId: sourceClip.id };
    }

    const t = Date.now();
    let job: Job = {
      id: newId(),
      projectId,
      laneId: body.laneId ?? null,
      kind: body.kind,
      params: body.params ?? {},
      status: "queued",
      bridgeJobId: null,
      error: null,
      resultAssetIds: [],
      createdAt: t,
      updatedAt: t,
    };
    job = await store.createJob(job);

    try {
      const created = await bridgeCreateJob(c.env, { kind: job.kind, params: job.params });
      job =
        (await store.updateJob(job.id, {
          bridgeJobId: created.jobId,
          status: "queued",
        })) ?? job;
      if (job.kind === "demucs_split" && job.bridgeJobId) {
        const params = job.params as DemucsJobParams;
        const source = await store.getAsset(params.sourceAssetId);
        if (!source) throw new Error("source_asset_missing");
        const obj = await c.env.MEDIA.get(source.r2Key);
        if (!obj) throw new Error("source_blob_missing");
        await bridgePutJobSource(c.env, job.bridgeJobId, obj.body);
      }
    } catch (err) {
      if (job.bridgeJobId) {
        try {
          await bridgeCancelJob(c.env, job.bridgeJobId);
        } catch {
          // The D1 failure is authoritative even if the orphaned bridge job cannot be cancelled.
        }
      }
      const offline = err instanceof BridgeOfflineError;
      job =
        (await store.updateJob(job.id, {
          status: "failed",
          error: offline ? "bridge_offline" : err instanceof Error ? err.message : "bridge_error",
        })) ?? job;
    }
    return c.json(job, 201);
  });

  app.get("/api/jobs/:id", async (c) => {
    const store = c.get("store");
    let job = await store.getJob(c.req.param("id"));
    if (!job) return jsonError(c, 404, "not_found");
    if (isTerminalJobStatus(job.status)) return c.json(job);

    if (job.status === "ingesting") {
      job = await ingestSucceededJob(c.env, store, job);
      if (isTerminalJobStatus(job.status)) return c.json(job);
    }

    if (!job.bridgeJobId) return c.json(job);

    try {
      const view = await bridgeGetJob(c.env, job.bridgeJobId);
      const mapped = mapBridgeStatus(view.status);
      if (mapped === "running") {
        if (job.status !== "running") {
          // This update is the queued-to-running timestamp used by the timeout guard.
          job = (await store.updateJob(job.id, { status: "running" })) ?? job;
        } else {
          const params = job.params as Music3JobParams & { audioDuration?: number };
          const durationSec = Number(params.durationSec ?? params.audioDuration ?? 60);
          if (jobTimedOut(job.updatedAt, durationSec)) {
            try {
              await bridgeCancelJob(c.env, job.bridgeJobId);
            } catch {
              // The local timeout remains authoritative if cancellation cannot be confirmed.
            }
            job = (await store.updateJob(job.id, { status: "failed", error: "timeout" })) ?? job;
          }
        }
      } else if (mapped === "ingesting") {
        job = await ingestSucceededJob(c.env, store, job);
      } else if (mapped === "failed" || mapped === "cancelled") {
        job =
          (await store.updateJob(job.id, {
            status: mapped,
            error: view.error ?? mapped,
          })) ?? job;
      } else if (mapped !== job.status) {
        job = (await store.updateJob(job.id, { status: mapped })) ?? job;
      }
      return c.json({ ...job, queuePosition: view.queuePosition, progress: view.progress });
    } catch (err) {
      if (err instanceof BridgeOfflineError) {
        return c.json({ error: "bridge_offline", job }, 503);
      }
      throw err;
    }
  });

  app.post("/api/jobs/:id/cancel", async (c) => {
    const store = c.get("store");
    const job = await store.getJob(c.req.param("id"));
    if (!job) return jsonError(c, 404, "not_found");
    if (job.bridgeJobId) {
      try {
        await bridgeCancelJob(c.env, job.bridgeJobId);
      } catch (err) {
        if (err instanceof BridgeOfflineError) {
          return c.json({ error: "bridge_offline" }, 503);
        }
      }
    }
    const updated = await store.updateJob(job.id, { status: "cancelled", error: "cancelled" });
    return c.json(updated);
  });

  app.get("/api/engines", async (c) => {
    const cached = enginesCache.get(c.env);
    if (cached) return c.json(cached.body, cached.status);
    const kvRaw = await c.env.CONFIG.get("engines", "json");
    try {
      const health = await bridgeHealth(c.env);
      const kvValue = {
        music3: {
          model: health.music3.model,
          maxDurationSec: 240,
        },
        acestep: {
          present: Boolean(health.acestep?.up),
          defaultSteps: 8,
        },
      };
      await c.env.CONFIG.put("engines", JSON.stringify(kvValue));
      const body: EnginesResponse = { online: true, health, kv: kvValue };
      enginesCache.set(c.env, body, 200);
      return c.json(body);
    } catch {
      const body: EnginesResponse = {
        online: false,
        error: "bridge_offline",
        health: null,
        kv: kvRaw,
      };
      enginesCache.set(c.env, body, 503);
      return c.json(body, 503);
    }
  });

  app.post("/api/lanes/:id/clips", async (c) => {
    const store = c.get("store");
    const lane = await store.getLane(c.req.param("id"));
    if (!lane) return jsonError(c, 404, "not_found");
    const body = (await c.req.json().catch(() => ({}))) as CreateClipInput;
    const t = Date.now();
    const clip = await store.createClip({
      id: body.id ?? newId(),
      laneId: lane.id,
      assetId: body.assetId ?? null,
      startBeats: body.startBeats ?? 0,
      lengthBeats: body.lengthBeats ?? 4,
      cueInSec: body.cueInSec ?? 0,
      fadeInSec: body.fadeInSec ?? 0,
      fadeOutSec: body.fadeOutSec ?? 0,
      gainDb: body.gainDb ?? 0,
      synthPattern: body.synthPattern ?? null,
      label: body.label ?? null,
      createdAt: t,
      updatedAt: t,
    });
    return c.json(clip, 201);
  });

  app.patch("/api/clips/:id", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as PatchClipInput;
    const clip = await c.get("store").updateClip(c.req.param("id"), body);
    if (!clip) return jsonError(c, 404, "not_found");
    return c.json(clip);
  });

  app.delete("/api/clips/:id", async (c) => {
    const ok = await c.get("store").deleteClip(c.req.param("id"));
    if (!ok) return jsonError(c, 404, "not_found");
    return c.json({ ok: true });
  });

  app.post("/api/clips/:id/split", async (c) => {
    const store = c.get("store");
    const clip = await store.getClip(c.req.param("id"));
    if (!clip) return jsonError(c, 404, "not_found");
    const body = (await c.req.json().catch(() => ({}))) as SplitClipInput;
    const lane = await store.getLane(clip.laneId);
    const project = lane ? await store.getProject(lane.projectId) : null;
    const split = splitClip(clip, body.atBeats, project?.bpm ?? 120, newId());
    if (!split) return jsonError(c, 400, "invalid_split");
    const [left, right] = split;
    await store.updateClip(left.id, left);
    await store.createClip(right);
    return c.json({ left, right });
  });

  return app;
}
