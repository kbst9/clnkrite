export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  CONFIG: KVNamespace;
  BRIDGE_BASE_URL: string;
  CF_ACCESS_CLIENT_ID?: string;
  CF_ACCESS_CLIENT_SECRET?: string;
}
