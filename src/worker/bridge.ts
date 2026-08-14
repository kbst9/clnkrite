import type { BridgeHealth, BridgeJobView, JobKind, JobParams } from "@shared/types";
import type { Env } from "./env";

export class BridgeOfflineError extends Error {
  readonly code = "bridge_offline" as const;
  constructor(message = "bridge_offline") {
    super(message);
    this.name = "BridgeOfflineError";
  }
}

function accessHeaders(env: Env): HeadersInit {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
    headers["CF-Access-Client-Id"] = env.CF_ACCESS_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = env.CF_ACCESS_CLIENT_SECRET;
  }
  return headers;
}

function bridgeUrl(env: Env, path: string): string {
  const base = (env.BRIDGE_BASE_URL || "http://127.0.0.1:8300").replace(/\/$/, "");
  return `${base}${path}`;
}

async function bridgeFetch(env: Env, path: string, init: RequestInit = {}, timeoutMs = 10_000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const headers = new Headers(init.headers);
    const extra = accessHeaders(env);
    for (const [k, v] of Object.entries(extra)) {
      if (!headers.has(k)) headers.set(k, v);
    }
    return await fetch(bridgeUrl(env, path), { ...init, headers, signal: ctrl.signal });
  } catch {
    throw new BridgeOfflineError();
  } finally {
    clearTimeout(timer);
  }
}

export async function bridgeHealth(env: Env): Promise<BridgeHealth> {
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
