import { describe, expect, it } from "vitest";
import {
  formatElapsed,
  ingestClaimStale,
  INGEST_STALE_MS,
  isTerminalJobStatus,
  jobKindLabel,
  jobStateLabel,
  jobTimedOut,
  jobTimeoutSec,
  mapBridgeStatus,
} from "../src/shared/jobs";
import { accessHeaders } from "../src/worker/access";
import type { Env } from "../src/worker/env";
import { mapH3Status, music3RequestBody } from "../src/worker/h3";

describe("job state mapping", () => {
  it("maps bridge statuses onto the D1 machine", () => {
    expect(mapBridgeStatus("queued")).toBe("queued");
    expect(mapBridgeStatus("running")).toBe("running");
    expect(mapBridgeStatus("succeeded")).toBe("ingesting");
    expect(mapBridgeStatus("failed")).toBe("failed");
    expect(mapBridgeStatus("cancelled")).toBe("cancelled");
  });

  it("maps H3 completed onto ingesting and clamps Music3 max_duration", () => {
    expect(mapH3Status("queued")).toBe("queued");
    expect(mapH3Status("running")).toBe("running");
    expect(mapH3Status("completed")).toBe("ingesting");
    expect(mapH3Status("failed")).toBe("failed");
    expect(mapH3Status("cancelled")).toBe("cancelled");
    expect(music3RequestBody({ lyrics: "", caption: "  ", seed: 7, durationSec: 400, playheadBeats: 0 })).toEqual({
      caption: "instrumental",
      lyrics: "[Instrumental]",
      max_duration: 300,
      seed: 7,
    });
    expect(accessHeaders({} as Env)).toEqual({});
  });

  it("treats succeeded/failed/cancelled as terminal", () => {
    expect(isTerminalJobStatus("queued")).toBe(false);
    expect(isTerminalJobStatus("ingesting")).toBe(false);
    expect(isTerminalJobStatus("succeeded")).toBe(true);
    expect(isTerminalJobStatus("failed")).toBe(true);
    expect(isTerminalJobStatus("cancelled")).toBe(true);
  });

  it("uses durationSec * 20 + 600 for the timeout guard", () => {
    expect(jobTimeoutSec(60)).toBe(1800);
    expect(jobTimeoutSec(10)).toBe(800);
  });

  it("flags a job that has been running past the guard", () => {
    const start = 1_000_000;
    expect(jobTimedOut(start, 10, start + 799_000)).toBe(false);
    expect(jobTimedOut(start, 10, start + 800_001)).toBe(true);
  });

  it("treats ingesting as stale after the 60 s window", () => {
    const start = 5_000_000;
    expect(ingestClaimStale(start, start + INGEST_STALE_MS - 1)).toBe(false);
    expect(ingestClaimStale(start, start + INGEST_STALE_MS)).toBe(true);
  });

  it("labels job kind, state, and elapsed for the status strip", () => {
    expect(jobKindLabel("music3_generate")).toBe("MUSIC3");
    expect(jobKindLabel("demucs_split")).toBe("DEMUCS");
    expect(jobStateLabel("ingesting")).toBe("INGEST");
    expect(jobStateLabel("running")).toBe("RUN");
    expect(formatElapsed(102_000)).toBe("01:42");
  });
});
