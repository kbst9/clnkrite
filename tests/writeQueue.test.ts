import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectDocument } from "../src/shared/types";
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
});
