import type { JobStatus, Music3JobParams } from "../shared/types";
import { mergeAccessHeaders } from "./access";
import { h3BaseUrl, type Env } from "./env";

export class H3OfflineError extends Error {
  readonly code = "h3_offline" as const;
  constructor(message = "h3_offline") {
    super(message);
    this.name = "H3OfflineError";
  }
}

export interface H3JobView {
  id: string;
  status: JobStatus;
  queuePosition: number;
  progress?: number;
  error?: string;
  durationSec?: number | null;
}

export interface H3Health {
  up: boolean;
  model: string | null;
}

function h3Url(env: Env, path: string): string {
  return `${h3BaseUrl(env)}${path}`;
}

async function h3Fetch(env: Env, path: string, init: RequestInit = {}, timeoutMs = 15_000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers = mergeAccessHeaders(env, init.headers);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    return await fetch(h3Url(env, path), { ...init, headers, signal: ctrl.signal });
  } catch {
    throw new H3OfflineError();
  } finally {
    clearTimeout(timer);
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function firstString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function firstNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

export function parseH3JobId(body: unknown): string | null {
  const record = asRecord(body);
  return firstString(record, ["id", "job_id", "jobId", "task_id", "taskId"]);
}

/** Map MiniMax Local Media job status onto the D1 machine (completed → ingesting). */
export function mapH3Status(raw: string | null | undefined): JobStatus {
  const status = (raw ?? "").toLowerCase().replace(/-/g, "_");
  switch (status) {
    case "queued":
    case "pending":
    case "accepted":
      return "queued";
    case "running":
    case "processing":
    case "in_progress":
    case "started":
      return "running";
    case "completed":
    case "complete":
    case "succeeded":
    case "success":
    case "done":
      return "ingesting";
    case "failed":
    case "error":
    case "errored":
      return "failed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    default:
      return "queued";
  }
}

function durationFromH3(record: Record<string, unknown>): number | null {
  const extra = asRecord(record.extra_info ?? record.extraInfo ?? record.result);
  const direct = firstNumber({ ...extra, ...record }, [
    "duration_sec",
    "durationSec",
    "max_duration",
    "maxDuration",
    "duration",
    "music_duration",
  ]);
  if (direct == null || direct <= 0) return null;
  return direct > 1000 ? direct / 1000 : direct;
}

function viewFromBody(body: unknown, fallbackId: string): H3JobView {
  const record = asRecord(body);
  const rawStatus = firstString(record, ["status", "state", "job_status", "jobStatus"]);
  const error = firstString(record, ["error", "error_message", "message"]);
  const queuePosition = firstNumber(record, ["queue_position", "queuePosition", "position"]) ?? 0;
  const progress = firstNumber(record, ["progress"]) ?? undefined;
  return {
    id: parseH3JobId(record) ?? fallbackId,
    status: mapH3Status(rawStatus),
    queuePosition: Math.max(0, queuePosition),
    progress,
    error: error ?? undefined,
    durationSec: durationFromH3(record),
  };
}

function clampMaxDuration(sec: number | undefined): number {
  const value = Number(sec);
  if (!Number.isFinite(value)) return 60;
  return Math.min(300, Math.max(1, Math.round(value)));
}

export function music3RequestBody(params: Music3JobParams): Record<string, unknown> {
  const caption = String(params.caption ?? "").trim() || "instrumental";
  const lyrics = String(params.lyrics ?? "").trim() || "[Instrumental]";
  const body: Record<string, unknown> = {
    caption,
    lyrics,
    max_duration: clampMaxDuration(params.durationSec),
  };
  if (typeof params.seed === "number" && Number.isFinite(params.seed)) body.seed = params.seed;
  const extra = params as Music3JobParams & { steps?: number; tiled_decode?: boolean };
  if (typeof extra.steps === "number" && Number.isFinite(extra.steps)) body.steps = extra.steps;
  if (typeof extra.tiled_decode === "boolean") body.tiled_decode = extra.tiled_decode;
  return body;
}

export async function h3Health(env: Env): Promise<H3Health> {
  const res = await h3Fetch(env, "/v1/health", {}, 8_000);
  if (!res.ok) throw new H3OfflineError();
  const body = asRecord(await res.json().catch(() => ({})));
  const model =
    firstString(body, ["model", "music3_model"]) ??
    firstString(asRecord(body.music3), ["model", "id"]) ??
    "Music3";
  return { up: true, model };
}

export async function h3CreateMusic(env: Env, params: Music3JobParams): Promise<{ jobId: string }> {
  const res = await h3Fetch(env, "/v1/music", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(music3RequestBody(params)),
  });
  if (res.status === 401 || res.status === 403) throw new H3OfflineError("h3_access_denied");
  if (!res.ok) throw new H3OfflineError(`h3_http_${res.status}`);
  const jobId = parseH3JobId(await res.json().catch(() => ({})));
  if (!jobId) throw new H3OfflineError("h3_missing_job_id");
  return { jobId };
}

export async function h3GetMusic(env: Env, jobId: string): Promise<H3JobView> {
  const res = await h3Fetch(env, `/v1/music/${encodeURIComponent(jobId)}`);
  if (res.status === 401 || res.status === 403) throw new H3OfflineError("h3_access_denied");
  if (!res.ok) throw new H3OfflineError(`h3_http_${res.status}`);
  return viewFromBody(await res.json().catch(() => ({})), jobId);
}

export async function h3GetContent(env: Env, jobId: string): Promise<ArrayBuffer> {
  const res = await h3Fetch(
    env,
    `/v1/music/${encodeURIComponent(jobId)}/content`,
    { headers: { Accept: "audio/mpeg, application/octet-stream, */*" } },
    120_000,
  );
  if (res.status === 401 || res.status === 403) throw new H3OfflineError("h3_access_denied");
  if (!res.ok) throw new H3OfflineError(`h3_http_${res.status}`);
  return res.arrayBuffer();
}

export async function h3CancelJob(env: Env, jobId: string): Promise<void> {
  const res = await h3Fetch(env, `/v1/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" });
  if (res.status === 401 || res.status === 403) throw new H3OfflineError("h3_access_denied");
  if (!res.ok && res.status !== 404) throw new H3OfflineError(`h3_http_${res.status}`);
}
