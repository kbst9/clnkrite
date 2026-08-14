import type { BridgeJobStatus, JobStatus } from "./types";

/** Map a live bridge status onto the D1 job state machine (pre-ingest). */
export function mapBridgeStatus(status: BridgeJobStatus): JobStatus {
  switch (status) {
    case "queued":
      return "queued";
    case "running":
      return "running";
    case "succeeded":
      return "ingesting";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
  }
}

export function isTerminalJobStatus(status: JobStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

/** Timeout guard from the plan: durationSec * 20 + 600. */
export function jobTimeoutSec(durationSec: number): number {
  return durationSec * 20 + 600;
}

export function jobTimedOut(startedAtMs: number, durationSec: number, nowMs = Date.now()): boolean {
  return nowMs - startedAtMs > jobTimeoutSec(durationSec) * 1000;
}
