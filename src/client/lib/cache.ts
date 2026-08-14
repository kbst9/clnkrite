/** IndexedDB is cache only — never authoritative. D1 remains source of truth. */
export const CACHE_DB_NAME = "clnkrite-cache";

export async function cacheGet(_assetId: string): Promise<ArrayBuffer | null> {
  return null;
}

export async function cachePut(_assetId: string, _buf: ArrayBuffer): Promise<void> {
  // M8: decode-adjacent WAV / peaks backfill.
}

export async function clearLocalCache(): Promise<void> {
  // M8: wipe clnkrite-cache. Loses nothing but re-download time.
}
