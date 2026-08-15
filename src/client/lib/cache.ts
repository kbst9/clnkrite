/** IndexedDB is cache only — never authoritative. D1 remains source of truth. */
export const CACHE_DB_NAME = "clnkrite-cache";
const STORE = "assets";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(CACHE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("idb_open_failed"));
  });
}

export async function cacheGet(assetId: string): Promise<ArrayBuffer | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(assetId);
      req.onsuccess = () => resolve((req.result as ArrayBuffer | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function cachePut(assetId: string, buf: ArrayBuffer): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const req = db.transaction(STORE, "readwrite").objectStore(STORE).put(buf, assetId);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function clearLocalCache(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(CACHE_DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

export async function loadAssetBytes(assetId: string): Promise<ArrayBuffer> {
  const cached = await cacheGet(assetId);
  if (cached) return cached;
  const res = await fetch(`/api/assets/${assetId}/blob`);
  if (!res.ok) throw new Error(`blob_${res.status}`);
  const buf = await res.arrayBuffer();
  await cachePut(assetId, buf);
  return buf;
}
