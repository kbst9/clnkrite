import { describe, expect, it } from "vitest";
import { audibleLaneIds, isLaneAudible } from "../src/shared/mixer";

const lanes = [
  { id: "a", muted: false, soloed: false },
  { id: "b", muted: true, soloed: false },
  { id: "c", muted: false, soloed: true },
];

describe("mixer audibility", () => {
  it("plays all unmuted lanes when nothing is selected or soloed", () => {
    const plain = [
      { id: "a", muted: false, soloed: false },
      { id: "b", muted: false, soloed: false },
    ];
    expect(audibleLaneIds(plain, [])).toEqual(["a", "b"]);
  });

  it("mutes a muted lane even if selected", () => {
    expect(isLaneAudible(lanes[1]!, lanes, ["b"])).toBe(false);
  });

  it("uses persistent solo when the selection is empty", () => {
    expect(audibleLaneIds(lanes, [])).toEqual(["c"]);
  });

  it("treats a non-empty selection as a transient solo", () => {
    expect(audibleLaneIds(lanes, ["a"])).toEqual(["a"]);
    expect(audibleLaneIds(lanes, ["a", "c"])).toEqual(["a", "c"]);
    expect(audibleLaneIds(lanes, ["b"])).toEqual([]);
  });
});
