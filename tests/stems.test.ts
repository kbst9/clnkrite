import { describe, expect, it } from "vitest";
import { planStemExplode, stemLaneName } from "../src/shared/stems";
import type { Clip, Lane } from "../src/shared/types";
import { STEM_ROLES } from "../src/shared/types";

describe("stem explode", () => {
  it("creates four child lanes, mirrored clips, and mutes the parent", () => {
    const parent: Lane = {
      id: "parent",
      projectId: "p1",
      kind: "music3",
      name: "Guitar Song",
      sortOrder: 2,
      muted: false,
      soloed: false,
      volumeDb: 0,
      pan: 0,
      armed: true,
      visible: true,
      parentLaneId: null,
      stemRole: null,
      synthConfig: null,
      createdAt: 1,
      updatedAt: 1,
    };
    const source: Clip = {
      id: "clip",
      laneId: "parent",
      assetId: "mix",
      startBeats: 8,
      lengthBeats: 16,
      cueInSec: 0.5,
      fadeInSec: 0.1,
      fadeOutSec: 0.2,
      gainDb: -1,
      synthPattern: null,
      label: "mix",
      createdAt: 1,
      updatedAt: 1,
    };
    const plan = planStemExplode({
      jobId: "job9",
      projectId: "p1",
      parentLane: parent,
      sourceClip: source,
      artifacts: STEM_ROLES.map((role) => ({
        role,
        assetId: `job-job9-asset-${role}`,
        r2Key: `projects/p1/audio/${role}.wav`,
        bytes: 100,
        durationSec: 8,
        sampleRate: 32000,
        channels: 2,
      })),
      now: 10,
    });
    expect(plan.muteParent).toBe(true);
    expect(plan.lanes).toHaveLength(4);
    expect(plan.clips).toHaveLength(4);
    expect(plan.assets).toHaveLength(4);
    expect(plan.lanes.map((lane) => lane.stemRole)).toEqual(["vocals", "drums", "bass", "other"]);
    expect(plan.lanes[2]?.name).toBe(stemLaneName("Guitar Song", "bass"));
    expect(plan.lanes.every((lane) => lane.parentLaneId === "parent")).toBe(true);
    expect(plan.clips.every((clip) => clip.startBeats === 8 && clip.cueInSec === 0.5)).toBe(true);
    expect(plan.lanes[0]?.id).toBe("job-job9-lane-vocals");
  });
});
