import { describe, expect, it } from "vitest";
import { createApp } from "../src/worker/app";
import type { Env } from "../src/worker/env";
import { createMemoryStore } from "../src/worker/store";

function mockEnv(): Env {
  return {
    DB: {} as D1Database,
    MEDIA: {
      put: async () => undefined,
      get: async () => null,
    } as unknown as R2Bucket,
    CONFIG: {
      get: async () => null,
      put: async () => undefined,
    } as unknown as KVNamespace,
    H3_BASE_URL: "https://h3.clunk.us",
    BRIDGE_BASE_URL: "http://127.0.0.1:8300",
  };
}

describe("project create/get", () => {
  it("creates a project with 4/4 defaults and returns the full document", async () => {
    const store = createMemoryStore();
    const app = createApp({ storeFactory: () => store });
    const env = mockEnv();

    const createdRes = await app.request(
      "/api/projects",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "Night Bus" }) },
      env,
    );
    expect(createdRes.status).toBe(201);
    const created = (await createdRes.json()) as { id: string; title: string; timeSig: string; bpm: number };
    expect(created.title).toBe("Night Bus");
    expect(created.timeSig).toBe("4/4");
    expect(created.bpm).toBe(120);

    const getRes = await app.request(`/api/projects/${created.id}`, {}, env);
    expect(getRes.status).toBe(200);
    const doc = (await getRes.json()) as {
      project: { title: string; timeSig: string };
      lanes: unknown[];
      clips: unknown[];
      assets: unknown[];
      jobs: unknown[];
    };
    expect(doc.project.title).toBe("Night Bus");
    expect(doc.project.timeSig).toBe("4/4");
    expect(doc.lanes).toEqual([]);
    expect(doc.clips).toEqual([]);
    expect(doc.assets).toEqual([]);
    expect(doc.jobs).toEqual([]);
  });

  it("lists the created project and 404s an unknown id", async () => {
    const store = createMemoryStore();
    const app = createApp({ storeFactory: () => store });
    const env = mockEnv();

    await app.request(
      "/api/projects",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "A" }) },
      env,
    );
    const listRes = await app.request("/api/projects", {}, env);
    const list = (await listRes.json()) as Array<{ title: string }>;
    expect(list).toHaveLength(1);
    expect(list[0]?.title).toBe("A");

    const missing = await app.request("/api/projects/does-not-exist", {}, env);
    expect(missing.status).toBe(404);
  });
});
