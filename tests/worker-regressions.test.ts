import { afterEach, describe, expect, it, vi } from "vitest";
import type { Asset, Clip, Job } from "../src/shared/types";
import { createApp } from "../src/worker/app";
import type { Env } from "../src/worker/env";
import { ingestSucceededJob } from "../src/worker/ingest";
import { createMemoryStore } from "../src/worker/store";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function wavBuffer(durationSec = 1, sampleRate = 8_000, channels = 1): ArrayBuffer {
  const bytesPerSample = 2;
  const dataBytes = durationSec * sampleRate * channels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const tag = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
  tag(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  tag(36, "data");
  view.setUint32(40, dataBytes, true);
  return buffer;
}

function mockEnv(): Env {
  return {
    DB: {} as D1Database,
    MEDIA: {
      put: async () => undefined,
      get: async () => null,
    } as unknown as R2Bucket,
    CONFIG: {
      get: async () => null,
      put: async () => undefined,
    } as unknown as KVNamespace,
    BRIDGE_BASE_URL: "http://bridge.invalid",
  };
}

function jobRecord(projectId: string, laneId: string, overrides: Partial<Job> = {}): Job {
  const now = Date.now();
  return {
    id: "job-one",
    projectId,
    laneId,
    kind: "music3_generate",
    params: { lyrics: "", caption: "test", seed: 1, durationSec: 1, playheadBeats: 4 },
    status: "running",
    bridgeJobId: "bridge-one",
    error: null,
    resultAssetIds: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("worker regressions", () => {
  it("concurrent ingest calls create one deterministic asset and clip", async () => {
    const store = createMemoryStore();
    const project = await store.createProject({ title: "Ingest", bpm: 120 });
    const lane = await store.createLane(project.id, { kind: "music3", arm: true });
    const job = await store.createJob(jobRecord(project.id, lane!.id));
    const wav = wavBuffer();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(wav, { status: 200 })));

    await Promise.all([ingestSucceededJob(mockEnv(), store, job), ingestSucceededJob(mockEnv(), store, job)]);
    const doc = await store.getDocument(project.id);
    const storedJob = await store.getJob(job.id);

    expect(doc?.assets).toHaveLength(1);
    expect(doc?.clips).toHaveLength(1);
    expect(doc?.assets[0]?.id).toBe(`job-${job.id}-asset`);
    expect(doc?.clips[0]?.id).toBe(`job-${job.id}-clip`);
    expect(storedJob?.status).toBe("succeeded");
    expect(storedJob?.resultAssetIds).toEqual([`job-${job.id}-asset`]);
  });

  it("reads WAV metadata and derives imported clip length from project BPM", async () => {
    const store = createMemoryStore();
    const app = createApp({ storeFactory: () => store });
    const env = mockEnv();
    const project = await store.createProject({ title: "Import", bpm: 90 });
    const lane = await store.createLane(project.id, { kind: "import" });
    const form = new FormData();
    form.append("file", new File([wavBuffer(2, 8_000, 2)], "take.wav", { type: "audio/wav" }));
    form.append("laneId", lane!.id);
    form.append("startBeats", "7.5");

    const response = await app.request(`/api/projects/${project.id}/assets`, { method: "POST", body: form }, env);
    expect(response.status).toBe(201);
    const body = (await response.json()) as { asset: Asset; clip: Clip; lane: { id: string } };
    expect(body.lane.id).toBe(lane!.id);
    expect(body.asset).toMatchObject({ durationSec: 2, sampleRate: 8_000, channels: 2 });
    expect(body.clip.startBeats).toBe(7.5);
    expect(body.clip.lengthBeats).toBe(3);
    expect((await store.getDocument(project.id))?.lanes).toHaveLength(1);
  });

  it("starts timeout accounting only after queued jobs become running", async () => {
    const store = createMemoryStore();
    const app = createApp({ storeFactory: () => store });
    const env = mockEnv();
    const project = await store.createProject({ title: "Timeout" });
    const lane = await store.createLane(project.id, { kind: "music3", arm: true });
    const old = Date.now() - 10_000_000;
    await store.createJob(
      jobRecord(project.id, lane!.id, { status: "queued", createdAt: old, updatedAt: old }),
    );
    let bridgeStatus = "queued";
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/cancel")) return new Response('{"ok":"cancelled"}', { status: 200 });
      return new Response(JSON.stringify({ status: bridgeStatus, queuePosition: 1 }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const queuedResponse = await app.request("/api/jobs/job-one", {}, env);
    expect((await queuedResponse.json()) as Job).toMatchObject({ status: "queued", error: null });

    await store.updateJob("job-one", { status: "running", updatedAt: Date.now() });
    bridgeStatus = "running";
    const freshResponse = await app.request("/api/jobs/job-one", {}, env);
    expect((await freshResponse.json()) as Job).not.toMatchObject({ error: "timeout" });

    await store.updateJob("job-one", { status: "running", updatedAt: old });
    const timedOutResponse = await app.request("/api/jobs/job-one", {}, env);
    expect((await timedOutResponse.json()) as Job).toMatchObject({ status: "failed", error: "timeout" });
    expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/jobs/bridge-one/cancel"))).toBe(true);
  });

  it("deleting one memory-store project leaves another projects clips intact", async () => {
    const store = createMemoryStore();
    const first = await store.createProject({ title: "First" });
    const second = await store.createProject({ title: "Second" });
    const firstLane = await store.createLane(first.id, { kind: "import" });
    const secondLane = await store.createLane(second.id, { kind: "import" });
    const now = Date.now();
    const asset = (id: string, projectId: string): Asset => ({
      id,
      projectId,
      kind: "audio",
      r2Key: id,
      mime: "audio/wav",
      bytes: 44,
      durationSec: 1,
      sampleRate: 8_000,
      channels: 1,
      source: "import",
      sourceJobId: null,
      peaksR2Key: null,
      createdAt: now,
    });
    const clip = (id: string, laneId: string, assetId: string): Clip => ({
      id,
      laneId,
      assetId,
      startBeats: 0,
      lengthBeats: 2,
      cueInSec: 0,
      fadeInSec: 0,
      fadeOutSec: 0,
      gainDb: 0,
      synthPattern: null,
      label: null,
      createdAt: now,
      updatedAt: now,
    });
    await store.createAsset(asset("asset-first", first.id));
    await store.createAsset(asset("asset-second", second.id));
    await store.createClip(clip("clip-first", firstLane!.id, "asset-first"));
    await store.createClip(clip("clip-second", secondLane!.id, "asset-second"));
    await store.createJob(
      jobRecord(first.id, firstLane!.id, { id: "job-first", status: "queued" }),
    );
    await store.createJob(
      jobRecord(second.id, secondLane!.id, { id: "job-second", status: "queued" }),
    );

    await store.deleteProject(first.id);
    const remaining = await store.getDocument(second.id);
    expect(await store.getJob("job-first")).toBeNull();
    expect(remaining?.lanes.map((item) => item.id)).toEqual([secondLane!.id]);
    expect(remaining?.assets.map((item) => item.id)).toEqual(["asset-second"]);
    expect(remaining?.clips.map((item) => item.id)).toEqual(["clip-second"]);
    expect(remaining?.jobs.map((item) => item.id)).toEqual(["job-second"]);
  });
});

describe("stem explode ingest", () => {
  it("creates four child lanes and mutes the parent", async () => {
    const store = createMemoryStore();
    const project = await store.createProject({ title: "Stems", bpm: 120 });
    const lane = await store.createLane(project.id, { kind: "music3", name: "Guitar Song", arm: true });
    const now = Date.now();
    await store.createAsset({
      id: "mix",
      projectId: project.id,
      kind: "audio",
      r2Key: "mix.wav",
      mime: "audio/wav",
      bytes: 44,
      durationSec: 4,
      sampleRate: 8000,
      channels: 1,
      source: "music3",
      sourceJobId: "gen",
      peaksR2Key: null,
      createdAt: now,
    });
    await store.createClip({
      id: "mix-clip",
      laneId: lane!.id,
      assetId: "mix",
      startBeats: 8,
      lengthBeats: 8,
      cueInSec: 0,
      fadeInSec: 0,
      fadeOutSec: 0,
      gainDb: 0,
      synthPattern: null,
      label: "mix",
      createdAt: now,
      updatedAt: now,
    });
    const job = await store.createJob({
      id: "explode",
      projectId: project.id,
      laneId: lane!.id,
      kind: "demucs_split",
      params: { sourceAssetId: "mix", sourceClipId: "mix-clip", playheadBeats: 8 },
      status: "running",
      bridgeJobId: "bridge-explode",
      error: null,
      resultAssetIds: [],
      createdAt: now,
      updatedAt: now,
    });
    const wav = wavBuffer();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(wav, { status: 200 })));
    await ingestSucceededJob(mockEnv(), store, job);
    const doc = await store.getDocument(project.id);
    const parent = doc?.lanes.find((item) => item.id === lane!.id);
    const kids = doc?.lanes.filter((item) => item.parentLaneId === lane!.id) ?? [];
    expect(parent?.muted).toBe(true);
    expect(kids).toHaveLength(4);
    expect(kids.map((item) => item.stemRole)).toEqual(["vocals", "drums", "bass", "other"]);
    expect(doc?.clips.filter((item) => kids.some((kid) => kid.id === item.laneId))).toHaveLength(4);
    expect((await store.getJob(job.id))?.status).toBe("succeeded");
  });
});
