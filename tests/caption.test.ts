import { describe, expect, it } from "vitest";
import { captionPrefix, draftCaptionFromProject, firstSectionTag } from "../src/shared/caption";

describe("caption draft helper", () => {
  it("assembles Global Metadata from the project and empty vocal/arrangement stubs", () => {
    const draft = draftCaptionFromProject({
      bpm: 96,
      keySig: "F# minor",
      timeSig: "4/4",
      vibe: "humid night-bus soul",
    });
    expect(draft).toContain("Global Metadata");
    expect(draft).toContain("Genre / vibe: humid night-bus soul");
    expect(draft).toContain("BPM: 96");
    expect(draft).toContain("Key: F# minor");
    expect(draft).toContain("Time signature: 4/4");
    expect(draft).toContain("Vocal Details");
    expect(draft).toContain("Arrangement");
    expect(draft).toContain("Gender:");
    expect(draft).toContain("Spatial FX:");
  });

  it("uses a placeholder when vibe is empty", () => {
    const draft = draftCaptionFromProject({ bpm: 120, keySig: "C major", timeSig: "4/4", vibe: "  " });
    expect(draft).toContain("(describe genre, mood, emotional arc)");
  });

  it("picks the first section tag from lyrics", () => {
    expect(firstSectionTag("[Chorus]\nhey now")).toBe("[Chorus]");
    expect(firstSectionTag("no tags here")).toBeNull();
  });

  it("prefixes a caption for clip labels", () => {
    expect(captionPrefix("Genre / vibe: humid night-bus soul\nBPM: 96")).toBe(
      "Genre / vibe: humid night-bus so…",
    );
  });
});
