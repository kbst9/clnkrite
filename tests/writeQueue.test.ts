import { afterEach, describe, expect, it, vi } from "vitest";
import type { Clip, ProjectDocument } from "../src/shared/types";
import { WriteQueue } from "../src/client/lib/writeQueue";
import { useProjectStore } from "../src/client/stores/projectStore";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function projectDocument(): ProjectDocument {
  const now = Date.now();
  return {
    project: {
      id: "project-queue",
      title: "Queue",
      bpm: 120,
      keySig: "C major",
      timeSig: "4/4",
      vibe: "",
      lengthBeats: 128,
      loopStartBeats: null,
      loopEndBeats: null,
      createdAt: now,
      updatedAt: now,
    },
    lanes: [
      {
        id: "lane-queue",
        projectId: "project-queue",
        kind: "music3",
        name: "Music3",
        sortOrder: 0,
        muted: false,
        soloed: false,
        volumeDb: 0,
        pan: 0,
        armed: true,
        visible: true,
        parentLaneId: null,
        stemRole: null,
        synthConfig: null,
        createdAt: now,
        updatedAt: now,
      },
    ],
    clips: [],
    assets: [],
    jobs: [],
  };
}

function clipRecord(id: string): Clip {
  const now = Date.now();
  return {
    id,
    laneId: "lane-queue",
    assetId: "asset-queue",
    startBeats: 0,
    lengthBeats: 8,
    cueInSec: 0,
    fadeInSec: 0,
    fadeOutSec: 0,
    gainDb: 0,
    synthPattern: null,
    label: "take",
    createdAt: now,
    updatedAt: now,
  };
}

describe("write persistence queue", () => {
  it("merges project and lane field edits into one PATCH per entity", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    useProjectStore.getState().replaceDoc(projectDocument());

    useProjectStore.getState().patchProject({ bpm: 132 });
    useProjectStore.getState().patchProject({ keySig: "D minor" });
    useProjectStore.getState().patchProject({ vibe: "dusty" });
    useProjectStore.getState().patchLane("lane-queue", { volumeDb: -3 });
    useProjectStore.getState().patchLane("lane-queue", { pan: 0.25 });
    await useProjectStore.getState().flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const projectCall = calls.find(([url]) => url === "/api/projects/project-queue");
    const laneCall = calls.find(([url]) => url === "/api/lanes/lane-queue");
    expect(JSON.parse(String(projectCall?.[1].body))).toEqual({
      bpm: 132,
      keySig: "D minor",
      vibe: "dusty",
    });
    expect(JSON.parse(String(laneCall?.[1].body))).toEqual({ volumeDb: -3, pan: 0.25 });
  });

  it("drains an item enqueued while another item is flushing", async () => {
    const queue = new WriteQueue(10_000);
    const calls: string[] = [];
    let release!: () => void;
    let markStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    queue.enqueue({
      id: "first",
      run: async () => {
        calls.push("first");
        markStarted();
        await gate;
      },
    });

    const flushing = queue.flush();
    await started;
    queue.enqueue({ id: "second", run: async () => void calls.push("second") });
    release();
    await flushing;

    expect(calls).toEqual(["first", "second"]);
    expect(queue.pending).toBe(0);
  });

  it("keeps a failed write queued for a later retry", async () => {
    const queue = new WriteQueue(10_000);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    let attempts = 0;
    queue.enqueue({
      id: "retry",
      run: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error("temporary");
      },
    });

    await queue.flush();
    expect(queue.pending).toBe(1);
    await queue.flush();
    expect(queue.pending).toBe(0);
    expect(attempts).toBe(2);
    expect(error).toHaveBeenCalledOnce();
  });

  it("merges crop and move deltas into one clip PATCH", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const doc = projectDocument();
    doc.clips = [clipRecord("clip-merge")];
    useProjectStore.getState().replaceDoc(doc);

    useProjectStore.getState().patchClip("clip-merge", {
      startBeats: 1,
      lengthBeats: 7,
      cueInSec: 0.5,
    }, false);
    useProjectStore.getState().moveClips(["clip-merge"], 2, 0.25, false, false);
    await useProjectStore.getState().flush();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      startBeats: 3,
      lengthBeats: 7,
      cueInSec: 0.5,
    });
  });

  it("coalesces an optimistic add immediately undone before POST", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    useProjectStore.getState().replaceDoc(projectDocument());
    const clip = clipRecord("clip-never-posted");

    useProjectStore.getState().addClip(clip, false);
    useProjectStore.getState().removeClips([clip.id], false);
    await useProjectStore.getState().flush();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("flushes optimistic clip edits before reloading the project document", async () => {
    const serverDoc = projectDocument();
    serverDoc.clips = [clipRecord("clip-before-reload")];
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url}`);
      if (init?.method === "PATCH") {
        const patch = JSON.parse(String(init.body)) as Partial<Clip>;
        serverDoc.clips[0] = { ...serverDoc.clips[0]!, ...patch };
        return new Response(JSON.stringify(serverDoc.clips[0]), { status: 200 });
      }
      return new Response(JSON.stringify(serverDoc), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    useProjectStore.getState().replaceDoc(structuredClone(serverDoc));

    useProjectStore.getState().patchClip("clip-before-reload", { startBeats: 6 }, false);
    await useProjectStore.getState().loadProject("project-queue");

    expect(calls).toEqual([
      "PATCH /api/clips/clip-before-reload",
      "GET /api/projects/project-queue",
    ]);
    expect(useProjectStore.getState().doc?.clips[0]?.startBeats).toBe(6);
  });
});
