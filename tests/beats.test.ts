import { describe, expect, it } from "vitest";
import { beatsPerBar, beatsToSec, formatPlayhead, secToBeats } from "../src/shared/beats";

describe("beats conversion", () => {
  it("converts beats to seconds at 120 BPM", () => {
    expect(beatsToSec(120, 120)).toBe(60);
    expect(beatsToSec(4, 120)).toBe(2);
  });

  it("converts seconds to beats at 90 BPM", () => {
    expect(secToBeats(60, 90)).toBe(90);
    expect(secToBeats(2, 120)).toBe(4);
  });

  it("is invertible", () => {
    const bpm = 128;
    const beats = 17.5;
    expect(secToBeats(beatsToSec(beats, bpm), bpm)).toBeCloseTo(beats);
  });

  it("treats non-positive BPM as zero", () => {
    expect(beatsToSec(8, 0)).toBe(0);
    expect(secToBeats(2, -12)).toBe(0);
  });

  it("reads beats per bar from time signature", () => {
    expect(beatsPerBar("4/4")).toBe(4);
    expect(beatsPerBar("3/4")).toBe(3);
    expect(beatsPerBar("bad")).toBe(4);
  });

  it("formats a playhead as bar.beat.ticks", () => {
    expect(formatPlayhead(0, "4/4")).toBe("1.1.00");
    expect(formatPlayhead(4, "4/4")).toBe("2.1.00");
    expect(formatPlayhead(5.5, "4/4")).toBe("2.2.50");
  });
});
