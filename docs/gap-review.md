# clnkrite v1 — plan vs. implementation gap review

**Scope:** `docs/implementation-plan.md` (locked) vs. the `exec/v1` tree and the live deploy at
https://rite.clnkr.dev (also `clnkrite.gradient.workers.dev`).
**Date:** 2026-08-15. **Method:** full read of Worker (`src/worker/`), client (`src/client/`),
shared (`src/shared/`), bridge (`bridge/app.py`), tests, CI, `wrangler.jsonc`; live probes of
`/`, `/api/projects`, `/api/engines`.

Severity legend: **blocks** = breaks a §1 success-path step (or hard-fails a shipped feature),
**degrades** = works but materially worse than the plan, **polish** = cosmetic / nice-to-have.

Locked constraints are respected throughout: Cloudflare Workers + Hono + D1/R2/KV stay; the
existing `wrangler.jsonc` ids, `routes` custom_domain `rite.clnkr.dev`, and `workers_dev: true`
stay; Music3 / ACE-Step / Demucs stay on the local GPU behind the bridge. Nothing below proposes
changing those.

---

## 1. What the plan promised

**Success path (§1, seven steps):** create project with BPM/key/vibe → Music3 lane + Generate
drawer → clip lands on armed lane at playhead → import vocal, nudge into sync → Synth lane →
mute/solo + play selected lanes together → Picture lane video locked to transport → hard-refresh
reloads from D1.

**The four lane pillars (L1–L4):**
- **L1 Generate lanes (Music3, plus ACE-Step at M7):** generate drawer (§9.6), bridge job queue
  (§5), Worker poll/ingest state machine (§7.3), server-side clip drop (§7.5).
- **L2 Import lane:** upload → R2 → asset → clip, peaks pipeline, canvas waveforms (§9.4, M2).
- **L3 Synth lane:** Tone.js instruments, pattern clips, mini note editor (§9.3, M5).
- **L4 Picture lane (§9.7):** video upload, Range streaming, `<video>` slaved to transport,
  show/hide, thumbnail strip, floating/resizable viewer.

**Milestones M0–M8:** scaffold + CI + deploy loop (M0), project shell + persistence (M1), lanes /
import / transport / **canvas waveforms** (M2), bridge + Music3 + **live contract checklist
recorded in `docs/music3-contract.md`** (M3), timeline editing (M4), synth (M5), picture (M6, tag
`v1.0-successpath`), ACE-Step + stem explode (M7), hardening: offline UX, job resume, cancel,
cache, **Playwright script of the success path**, runbook (M8).

## 2. What actually shipped on exec/v1

Milestone scorecard (details in §3):

| Milestone | Verdict |
|---|---|
| M0 scaffold/CI/deploy | **Partial** — repo, AGPL/NOTICE, bindings, migration all real; CI runs typecheck+vitest only (no build, no e2e, no deploy job); **no Cloudflare Access on the app hostname** |
| M1 project shell + persistence | **Shipped** — CRUD, top bar, list page, optimistic store, 500 ms write queue with `pagehide` flush, full-document load |
| M2 lanes/import/transport | **Partial** — lane CRUD/headers, import upload, Tone engine, zoom/ruler/playhead all real; **waveforms are never rendered** (clips are flat gradient divs) |
| M3 bridge + Music3 | **Partial** — bridge, adapter config object, job routes, poll/ingest, server-side clip drop all real; **contract checklist never run** (all boxes unchecked); **live deploy points at a placeholder bridge URL, so generate is dead on rite.clnkr.dev** |
| M4 timeline editing | **Shipped** — move/crop/slip/nudge/split/copy/paste/delete/fades/overlaps + undo/redo, all persisted; some chrome missing (loop brace, fade ramps) |
| M5 synth | **Shipped** — 4 instrument types, pattern clips, click-to-place grid editor, `Tone.Part` scheduling |
| M6 picture | **Shipped (core)** — upload, Range streaming (tested), 250 ms drift-corrected sync, show/hide; no thumbnail strip, viewer not resizable; `VERSION` says `v1.0-successpath` but the git tag was never created |
| M7 ACE-Step + stems | **Partial** — ACE-Step adapter + gating real; Demucs adapter + child-lane ingest real and tested; **but the bridge source-upload race makes explode fail in practice** (§3.6) |
| M8 hardening | **Partial** — offline banner, job resume, cancel, IndexedDB cache + clear button, runbook: real. Playwright "success path" spec is a mocked desk-smoke-test, not the success path; jobs can wedge in `ingesting` |

Local `npm run typecheck` and `npm run test` (11 files, incl. worker regression, stems, write-queue
suites) pass on this checkout. The live Worker serves the SPA and the API on the custom domain;
`/api/engines` returns `{"online":false,"error":"bridge_offline","kv":null}`.

## 3. Gaps, stubs, missing UX, broken paths

### 3.1 Generate / bridge

| # | Severity | Item |
|---|---|---|
| G1 | **blocks** (success-path step 2, live) | **Live bridge URL is a placeholder.** `wrangler.jsonc` `vars.BRIDGE_BASE_URL = "https://bridge.example.com"`; `docs/runbook.md` says REPLACE_AFTER_CREATE but it was deployed as-is. Live `/api/engines` → 503 `bridge_offline`; `AddLaneDrawer.tsx` then disables the Music3 source entirely (`blocked` when `bridgeOnline === false`), so on rite.clnkr.dev you cannot even add a Music3 lane, let alone generate. Fix is deployment config (real tunnel hostname + `CF_ACCESS_CLIENT_ID/SECRET` secrets + cloudflared on the GPU box), **not** a change to the locked bindings/domain. |
| G2 | **degrades** | **M3 contract checklist never ran.** `docs/music3-contract.md` explicitly says "Do not treat these as live results" and every checkbox is unchecked. The plan (§3.1, M3) made this the *first task* of M3. Until it runs against Kevin's SGLang-Omni, the whole Music3 request shape (`/v1/audio/speech`, `input`/`instructions`, `max_new_tokens`) is an educated default. The adapter config object (`bridge/app.py` `MUSIC3_ADAPTER`) is in place as promised, so the risk is contained, but the plan's stated deliverable is missing. |
| G3 | **degrades** | **Bridge/engine status is checked exactly once.** `Editor.tsx` fetches `/api/engines` in a mount effect with no interval and no refetch; if the bridge comes up (or goes down) after page load, the status dot, banner, and Add-lane gating are stale until a manual reload. The status dot also only ever shows "bridge" / "GPU bridge offline" — no model id, no queue depth, though `bridgeHealth` returns them. Plan §7.1 also wanted a 5 s edge cache on `/api/engines`; there is none (`src/worker/app.ts` hits the tunnel on every call and rewrites KV every time). |
| G4 | **degrades** | **Job status UX is a stub relative to §9.6.** The Worker merges `queuePosition` and `progress` into `GET /api/jobs/:id` (`app.ts` line ~398), but the client `Job` type drops them and `JobChip.tsx` renders only `kind + status + cancel`. No queue position, no elapsed running time, no distinct "ingesting" treatment, no job-queue drawer at all (`uiStore.Drawer` is only `"none" | "add-lane" | "generate"`; plan §9.1 listed a Job queue drawer). "Show generation params / Regenerate" (§9.6 "comes free") is absent. |
| G5 | **degrades** | **Jobs can wedge permanently in `ingesting`.** `claimJobForIngest` (`src/worker/store.ts`) only claims from `queued/running`. If the Worker isolate dies mid-ingest (plausible while pulling a 60 MB WAV), the row stays `ingesting`; every later poll takes the `claimed:false` path and returns unchanged, and the §7.3 timeout guard only fires for `running`. No recovery path except manual cancel. |
| G6 | **degrades** | **Ingest and uploads buffer whole files in Worker memory.** Plan §7.3/§7.1 promised *streamed* R2 puts and R2 multipart for >100 MB. Actual: `bridgeGetArtifact` does `res.arrayBuffer()` (`src/worker/bridge.ts`), asset upload does `c.req.arrayBuffer()` / `parseBody()` (`app.ts` POST `/api/projects/:id/assets`). A 240 s Music3 WAV (~61 MB) fits but is risky; the advertised 512 MB video cap (`MAX_VIDEO_BYTES`) is not actually reachable inside a 128 MB isolate. |
| G7 | polish | Generate drawer has no engine selector and no "target lane, switchable" control (§9.6) — the target is implicitly the armed lane; you switch by arming a different lane in the rail. Duration caps are hardcoded (240/600) instead of read from the KV `engines` value. |

### 3.2 Mixer

Substantially shipped and matching §9.3: per-lane `Tone.Channel(volume, pan)`, mute/solo,
selected-lanes-together as transient solo (`toneEngine.applyMixer`), covered by
`tests/mixer.test.ts`.

| # | Severity | Item |
|---|---|---|
| X1 | polish | No master bus: channels go straight `toDestination()` instead of §9.3's per-lane Channel → master `Tone.Gain` → destination. No master level control or headroom trim point. |
| X2 | polish | `src/shared/mixer.ts` (`isLaneAudible`) is a test-only mirror of the audibility rules; the engine implements the same rules independently in `applyMixer`. Drift between the two would be invisible to the unit tests. |
| X3 | polish | Volume/pan are raw `<input type="range">` sliders with no dB readout, no 0 dB detent, no meters (`LaneHeader.tsx`). |

### 3.3 Clip editing / timeline

The §9.4 interaction set is genuinely implemented: move (multi-select), crop both edges with
`cue_in_sec` math, Alt-drag slip, fade handles, `,`/`.` nudge, `S` split at playhead, ⌘C/⌘V at
playhead, delete, undo/redo (`⌘Z`/`⇧⌘Z`), snap toggle + Alt bypass, ctrl+wheel zoom — all in
`Timeline.tsx` + `src/shared/clipOps.ts` (unit-tested), persisted through the write queue.

| # | Severity | Item |
|---|---|---|
| T1 | **degrades** (hurts success-path step 3) | **No waveforms, ever.** Plan M2/§9.4: "canvas timeline… canvas-rendered waveforms from peaks". Actual: `ClipBlock` in `Timeline.tsx` is a flat gradient `<div>` with a text label — no canvas, no peaks. The peaks pipeline is **write-only**: `Editor.tsx` decodes and `uploadPeaks()` to R2, but nothing ever reads them back — there is no `GET` peaks route at all (`app.ts` has only `PUT /api/assets/:id/peaks`) and no client fetch. "Nudge/move the clip until it sits in sync" (step 3) without seeing transients is trial-and-error by ear. |
| T2 | degrades | Peaks are recomputed and re-uploaded on **every** schedule-rebuild cache miss, even when `asset.peaksR2Key` is already set, with a throwaway `new AudioContext()` per asset (`Editor.tsx` rebuild callback). Wasted decode + PUT on every fresh browser. |
| T3 | degrades | Editing while playing pauses and restarts the transport (`toneEngine.rebuildSchedule` pauses, clears everything, reschedules, resumes) instead of §9.3's "incrementally for the edited clip while playing" — an audible hiccup on every drag-release during playback. |
| T4 | degrades | No loop brace on the ruler (§9.1 "loop brace"). Loop in/out are two bare number inputs in the top bar (`TopBar.tsx`), invisible on the timeline itself. |
| T5 | polish | No playhead-follow scroll while playing (§9.4). No fade ramps drawn on clips (handles exist, the fade itself is invisible). Overlapping clips get a uniform `opacity-90`, not translucent stacking. Ruler shows bar numbers only, no beat ticks. No marquee/rubber-band selection. |
| T6 | polish | Worker does not re-validate clip invariants on write (§6.1 said "re-validated by the Worker on write"): `PATCH /api/clips/:id` accepts any `cueInSec`/`lengthBeats`; only the client (`constrainAudioClip`) enforces `cue_in + length ≤ asset duration`. |
| T7 | polish | No lane-reorder UI (the API honors `sortOrder`, nothing in the rail lets you drag lanes). No drag-and-drop file import onto the timeline (§9.5 "file picker or drag-drop") — file picker only. All audio imports are funneled onto a single reused Import lane (`AddLaneDrawer.tsx` `importLane ?? addLane(...)`) rather than one lane per import. |

### 3.4 Synth

Shipped per the deliberately-minimal §9.3/M5 spec: `PolySynth`/`MonoSynth`/`FMSynth`/
`MembraneSynth` selectable per lane (`LaneHeader.tsx`), pattern clips as JSON note lists,
`Tone.Part` scheduling, click-to-place grid (`SynthNoteEditor.tsx`, C3–C5 × 1/16 steps).

| # | Severity | Item |
|---|---|---|
| S1 | polish | Notes are fixed at `durBeats 0.25`, `vel 0.85`; no duration/velocity editing, no audible preview on placement, 15-semitone-ish range (diatonic list, no sharps). Acceptable for v1's "deliberately minimal", listed for completeness. |
| S2 | polish | The note editor claims the bottom of the screen whenever a synth clip is selected; there is no way to collapse it. |

### 3.5 Picture

Core §9.7 behavior shipped: upload → R2 → `picture` lane with one draggable clip; server replaces
any existing picture lane on create (one per project); Range streaming with suffix/416 handling
(`app.ts` `byteRange`, tested in `tests/worker-regressions.test.ts`); floating viewer slaved to the
transport with the exact 250 ms / 60 ms drift re-seek from the plan (`PictureViewer.tsx`); muted by
default; `visible` show/hide.

| # | Severity | Item |
|---|---|---|
| P1 | polish | No thumbnail strip on the picture lane (§9.1/§9.7) — the lane shows the same flat clip block as audio. |
| P2 | polish | Viewer is fixed at 360 px bottom-right; plan said "floating, **resizable**". |

### 3.6 Stems (Demucs explode)

The Worker-side ingest is real and well-tested (`planStemExplode`, 4 child lanes with
`parent_lane_id`/`stem_role`, clip mirroring, parent auto-mute, idempotent re-explode —
`tests/stems.test.ts`, `tests/worker-regressions.test.ts`). The lane-header `stems` badge toggles
parent vs. children as specified. But:

| # | Severity | Item |
|---|---|---|
| D1 | **blocks** (the explode feature; not on the §1 path) | **Source-upload race: explode fails whenever the GPU queue is idle — i.e. almost always.** The plan (§5, §7.2) had the Worker pass a presigned R2 GET URL *inside job creation*, so the bridge fetches the source itself when the job runs. The implementation deviated: `app.ts` first `bridgeCreateJob(...)` (which `queue.put`s the job immediately — `bridge/app.py` `create_job`), *then* streams the WAV to `POST /jobs/{id}/source`. The bridge's serial `worker_loop` picks the job up within the same event-loop tick; `run_demucs` checks `input.wav` / `params.sourceUrl` synchronously before any await, finds neither (the Worker never sends `sourceUrl`), and fails the job with `missing_source` before the upload arrives. Nothing retries. Fix stays inside the locked architecture: either send a presigned URL as planned, or upload the source **before** creating the job, or make `run_demucs` wait for the source. |
| D2 | degrades | Explode has no confirmation drawer: §8 required a warning about the ~2 GB first-run Demucs download and the 0.5–2 min runtime; `ClipMenu.tsx` fires the job instantly on click with no dialog. |
| D3 | polish | Demucs progress is never parsed (plan §5: parse stderr percent when available); bridge always reports `progress: None`, and the client wouldn't show it anyway (G4). |

### 3.7 Persistence

The strongest area. D1 is genuinely the source of truth (full-document `GET /api/projects/:id`),
IndexedDB caches only asset bytes (`cache.ts`, with the promised "Clear cache" button), the
optimistic store + 500 ms `WriteQueue` + `visibilitychange`/`pagehide` keepalive flush matches
§7.1, `loadProject` flushes pending writes before reloading, non-terminal jobs ride along in the
project document and resume polling after refresh (`jobStore.hydrate`). Success-path step 7 works.

| # | Severity | Item |
|---|---|---|
| R1 | degrades | See G5 — the one persistence state machine hole (`ingesting` wedge). |
| R2 | polish | KV is underused vs. §4.3: only `engines` is ever written (by `/api/engines`); `defaults` and `settings:kevin` (zoom, last project) are specified, documented in the README table, and never read or written — new-project defaults are hardcoded in `store.ts`, zoom/snap reset on every reload. |
| R3 | polish | `deleteProject`/`deleteLane` remove D1 rows but never delete the R2 objects; blobs orphan silently in `clnkrite-media`. |
| R4 | polish | Ids are `crypto.randomUUID()` (`src/shared/ids.ts`) while the schema comment (and plan §6.1) says ulid — harmless (nothing sorts by id), just a drifted comment. |

### 3.8 CI / testing / release hygiene

| # | Severity | Item |
|---|---|---|
| C1 | degrades | **CI never builds the client.** `.github/workflows/ci.yml` runs `npm run typecheck` + `npm run test` only. `vite build` is exercised nowhere, so an asset-pipeline break (Tailwind, import graph, `index.html`) merges green. M0 also promised a manually-triggered `wrangler deploy` job; there is no deploy workflow at all (deploys are done by hand). |
| C2 | degrades | **The "success path" e2e is a stub.** `e2e/success-path.spec.ts` mocks *every* `/api/**` route and asserts only desk-page render → create project → "+ Add lane" visible. M8 promised "Playwright script of the success path" (7 steps). It also is not wired into CI, and `playwright.config.ts` has no `webServer`, so `npm run test:e2e` fails unless you hand-start a server on :4173. |
| C3 | polish | `VERSION` contains `v1.0-successpath` and `CHANGELOG.md` announces it, but the M6 git tag was never created (`git tag -l` is empty), and given G1 the claim is only true for a correctly-configured deployment, not the live one. |

### 3.9 Platform / security (flagged, not "fixed")

These are deployment-configuration findings. Per the task constraints they are recorded here and
deliberately **not** addressed by changing `wrangler.jsonc`, the custom domain, or the bridge
architecture.

| # | Severity | Item |
|---|---|---|
| A1 | **degrades** (security-critical) | **No Cloudflare Access on the app hostname.** Plan M0/§4.1: Access app on the hostname, allow Kevin's email. Live check (2026-08-15): `GET https://rite.clnkr.dev/api/projects` answers `200` with project JSON to an anonymous request; every write route (create/delete project, upload assets, submit jobs) is world-callable. Fix is a Zero Trust Access app in the dashboard covering `rite.clnkr.dev` — zero code change, does not touch the locked wrangler config. |
| A2 | polish | `workers_dev: true` (locked — keep it) exposes a second unauthenticated hostname `clnkrite.gradient.workers.dev`. When A1's Access app is created it should either cover both hostnames or Kevin accepts the workers.dev exposure knowingly. Recorded per instructions; no config change proposed. |
| A3 | polish | Bridge job routes trust the Access service token entirely (as designed, §5 "bearer-less"), which is fine **only after** the `bridge.<domain>` Access service-token app from §4.2 exists. That is part of the same G1 deployment work (tunnel + Access), still to be done. |

## 4. Conflicts with locked constraints

None found that require breaking them. Cloudflare hosting, the D1/R2/KV bindings and ids, the
`rite.clnkr.dev` custom domain, `workers_dev`, and Music3-on-local-GPU-behind-the-bridge are all
intact in the tree and on live. The two items that *look* like constraint problems — G1
(placeholder `BRIDGE_BASE_URL`) and A1 (no Access) — are unfinished deployment steps the plan
itself prescribes, resolvable without touching any locked value: G1 by setting the real tunnel
hostname in `vars` plus the two Access secrets, A1/A2 in the Zero Trust dashboard.

## 5. Suggested order of attack (config first, then code)

1. **G1 + A1/A3** — stand up cloudflared tunnel, Access apps, real `BRIDGE_BASE_URL`, secrets.
   Zero product code. Turns the live deploy from a shell into the actual product.
2. **D1** — fix the demucs source race (presigned URL as planned, or upload-then-enqueue).
3. **T1/T2** — render waveforms from peaks (add `GET /api/assets/:id/peaks`, draw min/max pairs
   on a canvas in `ClipBlock`); read peaks before recomputing.
4. **G5** — make `ingesting` claimable again after a staleness window.
5. **G3/G4** — poll `/api/engines`, surface queue position/elapsed, add the jobs panel (dovetails
   with the status strip in `docs/ux-anduril.md`).
6. **C1/C2** — add `vite build` to CI; write the real success-path Playwright script.

The UX direction requested by Kevin (Anduril-style control board) is specified separately in
[`docs/ux-anduril.md`](./ux-anduril.md).
