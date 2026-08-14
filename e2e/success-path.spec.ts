import { expect, test } from "@playwright/test";

const project = { id: "p-success", title: "Success Path", bpm: 100, keySig: "A minor", timeSig: "4/4", vibe: "late neon", lengthBeats: 128, loopStartBeats: null, loopEndBeats: null, createdAt: 1, updatedAt: 1 };

test("desk and new project", async ({ page }) => {
  await page.route("**/api/**", async (route) => {
    const url = route.request().url();
    const method = route.request().method();
    if (url.endsWith("/api/projects") && method === "GET") { await route.fulfill({ json: [] }); return; }
    if (url.endsWith("/api/projects") && method === "POST") { await route.fulfill({ status: 201, json: project }); return; }
    if (url.includes("/api/projects/p-success") && method === "GET") { await route.fulfill({ json: { project, lanes: [], clips: [], assets: [], jobs: [] } }); return; }
    if (url.endsWith("/api/engines")) { await route.fulfill({ json: { online: true, health: { music3: { up: true, model: "m" }, acestep: { up: true }, demucs: { available: true }, queue: { depth: 0, running: false } }, kv: {} } }); return; }
    await route.fulfill({ status: 200, json: {} });
  });
  await page.goto("/");
  await expect(page.getByText("The desk")).toBeVisible();
  await page.getByPlaceholder("New project title").fill("Success Path");
  await page.getByRole("button", { name: "New reel" }).click();
  await expect(page.getByText("+ Add lane")).toBeVisible();
});
