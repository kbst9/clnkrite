import { describe, expect, it } from "vitest";
import { isTerminalJobStatus, jobTimedOut, jobTimeoutSec, mapBridgeStatus } from "../src/shared/jobs";

describe("job state mapping", () => {
  it("maps bridge statuses onto the D1 machine", () => {
    expect(mapBridgeStatus("queued")).toBe("queued");
    expect(mapBridgeStatus("running")).toBe("running");
    expect(mapBridgeStatus("succeeded")).toBe("ingesting");
    expect(mapBridgeStatus("failed")).toBe("failed");
    expect(mapBridgeStatus("cancelled")).toBe("cancelled");
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
});
