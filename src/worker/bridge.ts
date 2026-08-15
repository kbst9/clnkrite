import type { BridgeHealth, BridgeJobView, JobKind, JobParams } from "../shared/types";
import { mergeAccessHeaders } from "./access";
import { isBridgeConfigured, type Env } from "./env";

export class BridgeOfflineError extends Error {
  readonly code = "bridge_offline" as const;
  constructor(message = "bridge_offline") {
    super(message);
    this.name = "BridgeOfflineError";
  }
}

function bridgeUrl(env: Env, path: string): string {
  if (!isBridgeConfigured(env)) throw new BridgeOfflineError();
  const base = (env.BRIDGE_BASE_URL ?? "").replace(/\/$/, "");
  return `${base}${path}`;
}

async function bridgeFetch(env: Env, path: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers = mergeAccessHeaders(env, init.headers);
    if (!headers.has("Accept")) headers.set("Accept", "application/json");
    return await fetch(bridgeUrl(env, path), { ...init, headers, signal: ctrl.signal });
  } catch (err) {
    if (err instanceof BridgeOfflineError) throw err;
    throw new BridgeOfflineError();
  } finally {
    clearTimeout(timer);
  }
}

export async function bridgeHealth(env: Env): Promise<BridgeHealth> {
  if (!isBridgeConfigured(env)) throw new BridgeOfflineError();
  const res = await bridgeFetch(env, "/health");
  if (!res.ok) throw new BridgeOfflineError();
  return (await res.json()) as BridgeHealth;
}

export async function bridgeCreateJob(
  env: Env,
  body: { kind: JobKind; params: JobParams },
): Promise<{ jobId: string }> {
  const res = await bridgeFetch(env, "/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new BridgeOfflineError();
  return (await res.json()) as { jobId: string };
}

export async function bridgeGetJob(env: Env, bridgeJobId: string): Promise<BridgeJobView> {
  const res = await bridgeFetch(env, `/jobs/${bridgeJobId}`);
  if (!res.ok) throw new BridgeOfflineError();
  return (await res.json()) as BridgeJobView;
}

export async function bridgeCancelJob(env: Env, bridgeJobId: string): Promise<void> {
  const res = await bridgeFetch(env, `/jobs/${bridgeJobId}/cancel`, { method: "POST" });
  if (!res.ok) throw new BridgeOfflineError();
}

export async function bridgeGetArtifact(env: Env, bridgeJobId: string, name: string): Promise<ArrayBuffer> {
  const res = await bridgeFetch(env, `/jobs/${bridgeJobId}/artifacts/${encodeURIComponent(name)}`, {}, 60_000);
  if (!res.ok) throw new BridgeOfflineError();
  return res.arrayBuffer();
}

export async function bridgePutJobSource(env: Env, bridgeJobId: string, bytes: BodyInit): Promise<void> {
  const res = await bridgeFetch(
    env,
    `/jobs/${bridgeJobId}/source`,
    { method: "POST", headers: { "Content-Type": "audio/wav" }, body: bytes },
    300_000,
  );
  if (!res.ok) throw new BridgeOfflineError();
}
