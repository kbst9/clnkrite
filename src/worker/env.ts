export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  CONFIG: KVNamespace;
  /** MiniMax Local Media API (H3 + Music3). Production: https://h3.clunk.us */
  H3_BASE_URL: string;
  /**
   * Optional local Python bridge for ACE-Step / Demucs only.
   * Must not be example.com and must not be the H3 host.
   */
  BRIDGE_BASE_URL?: string;
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
}

const DEFAULT_H3_BASE_URL = "https://h3.clunk.us";

export function h3BaseUrl(env: Env): string {
  const raw = (env.H3_BASE_URL || DEFAULT_H3_BASE_URL).trim();
  return raw.replace(/\/$/, "") || DEFAULT_H3_BASE_URL;
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** True when a real local Demucs/ACE-Step bridge is configured — never H3, never example.com. */
export function isBridgeConfigured(env: Env): boolean {
  const raw = env.BRIDGE_BASE_URL?.trim();
  if (!raw) return false;
  const host = hostnameOf(raw);
  if (!host) return false;
  if (host === "h3.clunk.us" || host.endsWith(".example.com") || host === "example.com") return false;
  return true;
}
