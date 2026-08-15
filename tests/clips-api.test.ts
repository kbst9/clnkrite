import { describe, expect, it } from "vitest";
import type { Clip } from "../src/shared/types";
import { createApp } from "../src/worker/app";
import type { Env } from "../src/worker/env";
import { createMemoryStore } from "../src/worker/store";

function mockEnv(): Env {
  return {
    DB: {} as D1Database,
    MEDIA: { put: async () => undefined, get: async () => null } as unknown as R2Bucket,
    CONFIG: { get: async () => null, put: async () => undefined } as unknown as KVNamespace,
    H3_BASE_URL: "https://h3.clunk.us",
    BRIDGE_BASE_URL: "http://127.0.0.1:8300",
  };
}

describe("clip CRUD routes", () => {
  it("creates, patches, splits, and deletes a clip instead of 501", async () => {
    const store = createMemoryStore();
    const app = createApp({ storeFactory: () => store });
    const env = mockEnv();
    const project = await store.createProject({ title: "Edit" });
    const lane = await store.createLane(project.id, { kind: "import" });

    const createdRes = await app.request(
      `/api/lanes/${lane!.id}/clips`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startBeats: 0, lengthBeats: 8, label: "vocal" }),
      },
      env,
    );
    expect(createdRes.status).toBe(201);
    const created = (await createdRes.json()) as Clip;
    expect(created.label).toBe("vocal");

    const patchRes = await app.request(
      `/api/clips/${created.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startBeats: 2, fadeInSec: 0.1 }),
      },
      env,
    );
    expect(patchRes.status).toBe(200);
    expect(((await patchRes.json()) as Clip).startBeats).toBe(2);

    const splitRes = await app.request(
      `/api/clips/${created.id}/split`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ atBeats: 4 }),
      },
      env,
    );
    expect(splitRes.status).toBe(200);
    const split = (await splitRes.json()) as { left: Clip; right: Clip };
    expect(split.left.lengthBeats).toBe(2);
    expect(split.right.startBeats).toBe(4);

    const del = await app.request(`/api/clips/${split.right.id}`, { method: "DELETE" }, env);
    expect(del.status).toBe(200);
    const doc = await store.getDocument(project.id);
    expect(doc?.clips).toHaveLength(1);
  });
});
