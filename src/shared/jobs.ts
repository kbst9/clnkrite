import type { BridgeJobStatus, JobKind, JobStatus } from "./types";

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

/** Stale ingesting window — claim again if the isolate died mid-ingest. Matches the plan's 60 s lock TTL. */
export const INGEST_STALE_MS = 60_000;

export function ingestClaimStale(updatedAtMs: number, nowMs = Date.now()): boolean {
  return nowMs - updatedAtMs >= INGEST_STALE_MS;
}

export function jobKindLabel(kind: JobKind): string {
  switch (kind) {
    case "music3_generate":
      return "MUSIC3";
    case "acestep_generate":
      return "ACESTEP";
    case "demucs_split":
      return "DEMUCS";
  }
}

export function jobStateLabel(status: JobStatus): string {
  switch (status) {
    case "queued":
      return "QUEUED";
    case "running":
      return "RUN";
    case "ingesting":
      return "INGEST";
    case "succeeded":
      return "OK";
    case "failed":
      return "FAIL";
    case "cancelled":
      return "DROP";
  }
}

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
