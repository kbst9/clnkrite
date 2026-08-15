import { describe, expect, it } from "vitest";
import { copyClip, cropClip, moveClip, nudgeClip, setFades, slipClip, splitClip } from "../src/shared/clipOps";
import type { Clip } from "../src/shared/types";

function clip(overrides: Partial<Clip> = {}): Clip {
  const t = 1;
  return {
    id: "c1",
    laneId: "l1",
    assetId: "a1",
    startBeats: 4,
    lengthBeats: 8,
    cueInSec: 1,
    fadeInSec: 0,
    fadeOutSec: 0,
    gainDb: 0,
    synthPattern: null,
    label: "vocal",
    createdAt: t,
    updatedAt: t,
    ...overrides,
  };
}

describe("clip ops", () => {
  it("moves and snaps to the grid", () => {
    expect(moveClip(clip(), 4.12, 0.25, false).startBeats).toBe(4);
    expect(moveClip(clip(), 4.2, 0.25, true).startBeats).toBe(4.2);
    expect(moveClip(clip(), -2, 0.25, true).startBeats).toBe(0);
  });

  it("crops the start and advances cue_in_sec", () => {
    const next = cropClip(clip(), "start", 6, 120, 20, 0.25, true);
    expect(next.startBeats).toBe(6);
    expect(next.lengthBeats).toBe(6);
    expect(next.cueInSec).toBe(2);
  });

  it("crops the end without moving cue in", () => {
    const next = cropClip(clip(), "end", 8, 120, 20, 0.25, true);
    expect(next.startBeats).toBe(4);
    expect(next.lengthBeats).toBe(4);
    expect(next.cueInSec).toBe(1);
  });

  it("slips cue in while holding timeline position", () => {
    const next = slipClip(clip(), 2.5, 120, 20);
    expect(next.startBeats).toBe(4);
    expect(next.cueInSec).toBe(2.5);
    expect(next.lengthBeats).toBe(8);
  });

  it("nudges by the grid", () => {
    expect(nudgeClip(clip(), 1, 0.25).startBeats).toBe(4.25);
    expect(nudgeClip(clip({ startBeats: 0 }), -1, 0.25).startBeats).toBe(0);
  });

  it("splits and copies without mutating the asset", () => {
    const split = splitClip(clip(), 6, 120, "c2");
    expect(split).not.toBeNull();
    const [left, right] = split!;
    expect(left.lengthBeats).toBe(2);
    expect(right.startBeats).toBe(6);
    expect(right.lengthBeats).toBe(6);
    expect(right.cueInSec).toBe(2);
    expect(right.assetId).toBe("a1");
    const copied = copyClip(clip(), "c3", 16);
    expect(copied.id).toBe("c3");
    expect(copied.assetId).toBe("a1");
    expect(copied.startBeats).toBe(16);
  });

  it("sets fades and rejects a split outside the clip", () => {
    expect(setFades(clip(), 0.2, 0.4)).toMatchObject({ fadeInSec: 0.2, fadeOutSec: 0.4 });
    expect(splitClip(clip(), 4, 120, "x")).toBeNull();
    expect(splitClip(clip(), 12, 120, "x")).toBeNull();
  });

  it("clamps crop so cue + length stays inside the asset", () => {
    const next = cropClip(clip({ cueInSec: 9, lengthBeats: 8 }), "end", 20, 120, 10, 0, true);
    expect(next.cueInSec + (next.lengthBeats / 120) * 60).toBeLessThanOrEqual(10.001);
  });
});
