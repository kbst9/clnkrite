import type { Env } from "./env";

/** Cloudflare Access service-token headers. Same names Inspire Flow uses. Never log values. */
export function accessHeaders(env: Env): Record<string, string> {
  const headers: Record<string, string> = {};
  if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
    headers["CF-Access-Client-Id"] = env.CF_ACCESS_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = env.CF_ACCESS_CLIENT_SECRET;
  }
  return headers;
}

export function mergeAccessHeaders(env: Env, init?: HeadersInit): Headers {
  const headers = new Headers(init);
  for (const [key, value] of Object.entries(accessHeaders(env))) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return headers;
}
