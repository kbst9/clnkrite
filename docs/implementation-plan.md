# clnkrite — v1 Implementation Plan

**Status:** approved plan, no code yet.
**Product:** a local-first generative music studio that feels like a small DAW. Music3 and ACE-Step are engines behind lanes, not the product. Personal use, single user (Kevin). License: AGPL-3.0-or-later.
**Host (hard requirement):** Cloudflare. Specifically: **Cloudflare Workers** (app runtime + static assets), **D1** (source of truth for projects/lanes/clips), **R2** (audio/video blobs), **KV** (runtime config/settings), **wrangler** (deploy), **Cloudflare Tunnel + Access** (Worker → Kevin's local GPU APIs). Cloudflare **Queues are intentionally not used in v1** — rationale in §7.4. No Fly, Railway, Vercel, or VPS.

The GPU never leaves Kevin's machine. Music3 (served by SGLang-Omni), ACE-Step 1.5, and Demucs all run locally behind a small local **bridge** process; the Worker reaches the bridge through a Cloudflare Tunnel.

---

## 1. Success path (acceptance test for v1)

Every milestone in §10 is ordered to make this pass as early as possible:

1. Create a new project; set BPM, key, vibe. Time signature defaults to 4/4.
2. Add a Music3 lane; open the Generate drawer; enter tagged lyrics + caption; generate via the already-running local API; the result lands as a clip on the armed lane at the playhead.
3. Import a vocal recording as an Import lane; overlay it; nudge/move the clip until it sits in sync.
4. Add a Synth lane (Tone.js, no LLM) and play a part.
5. Mute/solo lanes; select a set of lanes and play them together through one transport.
6. Drop a video onto the Picture lane; its playhead is locked to the transport.
7. Hard-refresh the browser: the project is still there, loaded from **D1** (IndexedDB is only a cache).

---

## 2. Derive decision: new app that copies patterns, not a fork

### 2.1 What was studied

| Repo | License | What it gives us | Verdict |
|---|---|---|---|
| [ACE-Step-DAW](https://github.com/ace-step/ACE-Step-DAW) | AGPL-3.0-or-later | Closest existing product: React 19 + TS 5.7 + Vite 6 + Tailwind v4 + Zustand 5 + Tone.js 15. Timeline/track-lane components, transport hooks, generation panels, ACE-Step service layer, Vitest + Playwright setup. WIP; storage is IndexedDB (`idb-keyval`); no server component at all; no Music3; no picture lane. | **Primary pattern source.** Do not fork (below). |
| [waveform-playlist](https://github.com/naomiaro/waveform-playlist) (incl. `@waveform-playlist/engine`, dawcore) | MIT | Framework-agnostic timeline engine: clip move/trim/split with collision detection, fade in/out rendering, `cuein`/`cueout` non-destructive crop model, canvas peak rendering (`webaudio-peaks`), zoom via samples-per-pixel. | Copy the **clip model and interaction patterns** (MIT — may copy code verbatim where useful). |
| Tone.js 15 | MIT | `Tone.Transport` (BPM, loop region, bars:beats scheduling), `Tone.Player`/`GrainPlayer` for clips, `Channel` (volume/pan/mute/solo), instruments for the Synth lane. | Runtime dependency. |
| [ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5) | MIT | The second local generation API. Async REST contract confirmed (§3.2). We do **not** install or host the model — Kevin's box already runs it (or the lane hides). | Engine behind a lane. |
| Demucs | MIT (archived) | Stem separation for "explode Music3 full mix into stems." Runs on Kevin's GPU box inside the bridge (§5). Pin `demucs==4.0.1`, model `htdemucs` (4 stems). | Engine behind stem explode. |
| OpenCut Classic | — | Pattern reference only for video-under-transport. v1 Picture lane is a `<video>` element slaved to `Tone.Transport` (§9.6); we do not need an NLE codebase. | Reference only. |
| Ardour, Zrythm, LMMS, Remotion, Riffusion, AudioCraft | — | Ignored per brief. | — |

### 2.2 Why not fork ACE-Step-DAW

1. **It is pivoting away from the web.** The maintainers' active epic ([#1519](https://github.com/ace-step/ACE-Step-DAW/issues/1519)) wraps the app in Tauri 2.0 with a Rust/CPAL audio engine, native VST3 hosting, and "complete Tone.js removal." Tracking upstream would drag clnkrite toward a desktop app — the opposite of a Cloudflare-hosted web app.
2. **No server layer to build on.** It is a pure client with IndexedDB as the source of truth. Our hard requirement inverts that (D1 is truth, IndexedDB is cache). Retrofitting a Worker API, D1 persistence, and R2 blob flow into a foreign 60+-component codebase costs more than building a lean app and copying the parts that map.
3. **Feature surface mismatch.** Piano roll, step sequencer, Strudel live coding, effect chains, automation — none of it is in v1. Forking means carrying or amputating all of it.
4. **License is not the blocker.** AGPL is fine for clnkrite; we may copy AGPL code fragments (timeline components, transport hooks, generation drawer layout) as long as clnkrite ships as AGPL-3.0-or-later — which it will.

### 2.3 Decision

**New repository: Vite + React SPA served by a Cloudflare Worker (static assets) with an API in the same Worker.** Copy, with attribution, from ACE-Step-DAW: the `store/ engine/ services/ components/{timeline,transport,generation}` layering, Zustand store shapes, transport hook, and generation-drawer UX. Copy from waveform-playlist/dawcore: the non-destructive clip model (`cuein`/`cueout` + timeline offset), move/trim/split interaction math, and peak rendering. clnkrite is licensed **AGPL-3.0-or-later** (required anyway once ACE-Step-DAW code is copied).

Stack, pinned at project start: React 19, TypeScript 5.x, Vite 6, Tailwind CSS v4, Zustand 5, Tone.js 15, Hono (Worker router), Vitest + Playwright, wrangler 4.x.

---

## 3. Confirmed external API contracts

### 3.1 Music3 (MiniMax Music 3 served by SGLang-Omni) — **confirmed from public docs**

Source: [MiniMaxAI/MiniMax-Music3 model card](https://huggingface.co/MiniMaxAI/MiniMax-Music3) and [SGLang-Omni docs](https://sgl-project.github.io/sglang-omni/). Kevin serves it with `sgl-omni serve --model-path MiniMaxAI/MiniMax-Music3 --port 8000`.

- **Endpoint:** `POST {MUSIC3_BASE_URL}/v1/audio/speech` (OpenAI-compatible speech API, synchronous; body returns the audio bytes).
- **Request (JSON):**
  - `model`: `"MiniMaxAI/MiniMax-Music3"`
  - `input`: **lyrics**, newline-separated, with section tags on their own lines. Supported tags: `[Intro] [Verse] [Pre-Chorus] [Chorus] [Post-Chorus] [Bridge] [Instrumental] [Solo] [Outro]`.
  - `instructions`: **caption** / music description. Best results with a structured caption in three sections: *Global Metadata* (genre, BPM, key, emotional arc, production profile), *Vocal Details* (gender, timbre, performance, harmonies, FX), *Arrangement* (instruments, groove, bass, percussion, textures, spatial FX).
  - `response_format`: `"wav"`
  - `seed`: integer (reproducibility)
  - `max_new_tokens`: max audio frames at **25 frames/second** → duration control: `max_new_tokens = ceil(duration_seconds * 25)`. Generation may end earlier on end-of-audio token.
  - `stream`: `false` (streaming decode is out of v1).
- **Response:** 32 kHz, 16-bit, stereo WAV bytes. **Full mix only** — Music3 cannot emit an isolated stem ("just the bass" is impossible; hence stem explode, §8).
- **No job API:** the HTTP request blocks for the whole generation. The bridge (§5) wraps this in its own async job queue so nothing upstream holds a connection for minutes.

**Confirm-against-running-server checklist** (first task of milestone M3; the adapter defaults to the shape above and each item is a config/adapter switch, not a rewrite):
- [ ] `GET {MUSIC3_BASE_URL}/v1/models` — confirm served model id string (adapter sends whatever this returns; do not hardcode).
- [ ] Send a 10-second smoke request; confirm: HTTP 200, `Content-Type` (`audio/wav` expected), body is RIFF/WAV, 32 kHz stereo.
- [ ] Confirm `seed` and `max_new_tokens` are accepted (not 422-rejected); if `max_new_tokens` is ignored, fall back to trimming client-side to requested duration.
- [ ] Confirm behavior on concurrent requests (expected: serialized or 429/503) — informs bridge queue settings.
- [ ] Confirm whether an API key header is required; if so store it as a Worker secret passed through the bridge config.
- [ ] Note actual wall-clock time for 30 s / 60 s / 120 s generations on Kevin's GPU → set job timeout defaults (§7.3).

### 3.2 ACE-Step 1.5 — **confirmed from official API docs** ([docs/en/API.md](https://github.com/ace-step/ACE-Step-1.5/blob/main/docs/en/API.md))

Local FastAPI server, default `http://localhost:8001` (`uv run acestep-api`), optional `--api-key`. Already asynchronous:

- `POST /release_task` → `{ task_id }`. Body (JSON): `prompt` (alias `caption`), `lyrics` (with structure tags), `audio_duration` (10–600 s), `bpm`, `task_type: "text2music"` (cover/repaint exist but are **out of v1**), `inference_steps` (turbo default 8), `seed`, `audio_format: "wav"`.
- `POST /query_result` with `[task_id]` → status `0` pending / `1` succeeded / `2` failed, plus relative audio path(s) on success.
- `GET /v1/audio?path=...` → audio bytes.
- `GET /health` → liveness; the Add-lane drawer uses this (via the bridge) to decide whether the ACE-Step source is offered ("if present").

### 3.3 Demucs (stem explode)

Runs inside the bridge on the GPU box. `demucs==4.0.1` (MIT, archived — pin it), model `htdemucs`, 4 stems: **vocals, drums, bass, other**. Input: WAV path; output: 4 WAV files. Invoked as a Python subprocess by the bridge; ~2 GB model weights download on first run (bridge README documents this; it is Kevin's box, acceptable).

---

## 4. System architecture

```
Browser (SPA: React 19 + Tone.js audio engine)
   │  HTTPS (Cloudflare Access protects the hostname; Kevin's email allowed)
   ▼
Cloudflare Worker  ────────  serves static assets (Vite build) + JSON API (Hono)
   │            │
   │            ├── D1  (source of truth: projects, lanes, clips, assets, jobs)
   │            ├── R2  (blobs: generated WAVs, imported audio, stems, video, peaks)
   │            └── KV  (runtime config: engine base URLs, defaults, UI settings)
   │
   │  HTTPS fetch to https://bridge.<kevins-domain>  with Cloudflare Access
   │  service-token headers (CF-Access-Client-Id / CF-Access-Client-Secret)
   ▼
cloudflared Tunnel  (outbound-only connector on Kevin's GPU box; no open ports)
   ▼
clnkrite-bridge  (small local FastAPI process, localhost only)
   ├── MUSIC3_BASE_URL   → SGLang-Omni  http://127.0.0.1:8000   (POST /v1/audio/speech)
   ├── ACESTEP_BASE_URL  → ACE-Step 1.5 http://127.0.0.1:8001   (/release_task, /query_result)
   └── demucs subprocess (stem explode)
```

### 4.1 Cloudflare resources (exact list; all provisioned via wrangler)

| Resource | Name | Purpose |
|---|---|---|
| Worker | `clnkrite` | SPA static assets + `/api/*` routes. One Worker; no Pages project. |
| D1 database | `clnkrite-db` | All project/lane/clip/asset/job state. Migrations in `migrations/` via `wrangler d1 migrations`. |
| R2 bucket | `clnkrite-media` | Audio/video blobs + waveform peak sidecars. Never public; all access through the Worker. |
| KV namespace | `clnkrite-config` | Engine URLs and defaults readable at runtime without redeploy (§4.3). |
| Queues | — | **Not used in v1** (§7.4). |
| Cloudflare Tunnel | `clnkrite-bridge` | Publishes the local bridge at `bridge.<domain>`. |
| Cloudflare Access | 2 apps | (a) app hostname → allow Kevin's email (session cookie); (b) `bridge.<domain>` → service-token-only policy. Token id/secret stored as Worker secrets. |

`wrangler.jsonc` sketch (spec, not code):

```jsonc
{
  "name": "clnkrite",
  "main": "src/worker/index.ts",
  "compatibility_date": "2026-08-01",
  "assets": { "directory": "./dist/client", "not_found_handling": "single-page-application" },
  "d1_databases": [{ "binding": "DB", "database_name": "clnkrite-db" }],
  "r2_buckets":   [{ "binding": "MEDIA", "bucket_name": "clnkrite-media" }],
  "kv_namespaces":[{ "binding": "CONFIG" }],
  "vars": { "BRIDGE_BASE_URL": "https://bridge.<domain>" }
  // secrets via `wrangler secret put`: CF_ACCESS_CLIENT_ID, CF_ACCESS_CLIENT_SECRET
}
```

### 4.2 How the Worker reaches Kevin's GPU (the load-bearing decision)

A deployed Worker cannot reach `localhost`. **Chosen mechanism: Cloudflare Tunnel + Access service token.**

1. On the GPU box, run `cloudflared tunnel` as a service with an ingress rule mapping `bridge.<domain>` → `http://127.0.0.1:8300` (the bridge). Outbound-only; no ports opened on Kevin's router.
2. Create a Cloudflare Access **self-hosted app** for `bridge.<domain>` with a **service-token** policy. Nobody without the token — including random internet scanners — gets past Cloudflare's edge.
3. The Worker attaches `CF-Access-Client-Id` / `CF-Access-Client-Secret` headers (Worker secrets) to every bridge fetch.
4. **Local dev:** `wrangler dev` runs the Worker on Kevin's machine, so `BRIDGE_BASE_URL` is simply `http://127.0.0.1:8300` in `.dev.vars` — no tunnel needed for development.
5. **Bridge offline behavior:** every bridge call has a 10 s connect timeout; on failure the Worker returns `503 {"error":"bridge_offline"}` and the UI shows a persistent "GPU bridge offline" banner. Editing, playback, and persistence keep working — only generation/explode is disabled.

Rejected alternatives: exposing SGLang directly through the tunnel (no job queue, no cancel, no Demucs, two tunnels); WebSocket reverse-connection from bridge to Worker (needs Durable Objects, more moving parts than v1 warrants).

### 4.3 KV keys (`CONFIG` namespace)

| Key | Value (JSON) | Notes |
|---|---|---|
| `engines` | `{ "music3": {"model": "<from /v1/models>", "maxDurationSec": 240}, "acestep": {"present": true, "defaultSteps": 8} }` | Refreshed by a Worker call to bridge `/health`; lets the Add-lane drawer hide absent engines. |
| `defaults` | `{ "bpm": 120, "key": "C major", "timeSig": "4/4", "durationSec": 60 }` | New-project + generate-drawer defaults. |
| `settings:kevin` | UI prefs (zoom level, last project id). | Single user; no session machinery beyond Cloudflare Access. |

---

## 5. clnkrite-bridge specification (runs on Kevin's box; part of this repo, `bridge/`)

Small Python FastAPI app (~300 lines). It exists because (a) Music3's endpoint is synchronous and can block for minutes, (b) the GPU is serial, (c) Demucs needs a place to run, (d) one tunnel hostname is simpler than three.

- **Config (env):** `MUSIC3_BASE_URL` (default `http://127.0.0.1:8000`), `MUSIC3_MODEL`, `MUSIC3_API_KEY` (optional), `ACESTEP_BASE_URL` (default `http://127.0.0.1:8001`, optional), `ACESTEP_API_KEY` (optional), `PORT` (default 8300).
- **Job queue:** in-process, **strictly serial** (`maxConcurrency = 1`) across all job kinds — one GPU. FIFO with job kinds `music3_generate`, `acestep_generate`, `demucs_split`. Jobs and finished artifacts persist to a local scratch dir (`~/.clnkrite-bridge/`) so a bridge restart doesn't lose a finished WAV; scratch is pruned after upload confirmation or 24 h.
- **Endpoints (all JSON; bearer-less — Access token gates the hostname):**
  - `GET /health` → `{ music3: {up, model}, acestep: {up}|null, demucs: {available}, queue: {depth, running} }` (probes `GET /v1/models` on SGLang and `GET /health` on ACE-Step, 2 s timeout each).
  - `POST /jobs` → `{ jobId }`. Body: `{ kind, params }` where params are engine-native (§3). For `demucs_split`, params include a presigned R2 GET URL for the source WAV (bridge downloads it; the Worker generates the presigned URL).
  - `GET /jobs/{id}` → `{ status: queued|running|succeeded|failed|cancelled, queuePosition, progress?, error?, artifacts?: [{name, bytes, durationSec}] }`. `progress` is coarse: ACE-Step exposes none beyond status; Music3 none; Demucs stderr is parsed for percent when available. UI treats progress as indeterminate-with-elapsed-time when absent.
  - `GET /jobs/{id}/artifacts/{name}` → audio bytes (streamed). The Worker pulls artifacts through the tunnel and streams them into R2.
  - `POST /jobs/{id}/cancel` → best-effort: dequeues if queued; if running: ACE-Step has no cancel API and SGLang requests can only be aborted by dropping the connection — the bridge aborts its downstream HTTP request and marks the job `cancelled`; GPU may finish the work and the result is discarded. Documented as "cancel = stop waiting," which is honest for v1.
- **Music3 adapter:** thin translation from `{lyrics, caption, seed, durationSec}` to §3.1's request. Every field name it sends lives in one config object so the M3 confirmation checklist can adjust without code churn.
- **ACE-Step adapter:** `release_task` → poll `query_result` every 2 s → download via `/v1/audio` into scratch.
- **Demucs adapter:** subprocess `demucs -n htdemucs -o <scratch> <input.wav>`; artifacts named `vocals.wav`, `drums.wav`, `bass.wav`, `other.wav`.

---

## 6. Data model

### 6.1 D1 schema (migration `0001_init.sql`) — D1 is the **only** source of truth

```sql
CREATE TABLE projects (
  id            TEXT PRIMARY KEY,            -- ulid
  title         TEXT NOT NULL DEFAULT 'Untitled',
  bpm           REAL NOT NULL DEFAULT 120,
  key_sig       TEXT NOT NULL DEFAULT 'C major',
  time_sig      TEXT NOT NULL DEFAULT '4/4',
  vibe          TEXT NOT NULL DEFAULT '',    -- free text; seeds caption drafting
  length_beats  REAL NOT NULL DEFAULT 128,   -- project length
  loop_start_beats REAL,                     -- NULL = loop off
  loop_end_beats   REAL,
  created_at    INTEGER NOT NULL,            -- unix ms
  updated_at    INTEGER NOT NULL
);

CREATE TABLE lanes (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('music3','acestep','synth','import','picture')),
  name        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL,              -- lanes are infinite; ordered list
  muted       INTEGER NOT NULL DEFAULT 0,
  soloed      INTEGER NOT NULL DEFAULT 0,
  volume_db   REAL NOT NULL DEFAULT 0,       -- -60..+6
  pan         REAL NOT NULL DEFAULT 0,       -- -1..1
  armed       INTEGER NOT NULL DEFAULT 0,    -- generate target; max one armed per project (enforced in Worker)
  visible     INTEGER NOT NULL DEFAULT 1,    -- picture lane show/hide
  parent_lane_id TEXT REFERENCES lanes(id),  -- set on stem child lanes
  stem_role   TEXT,                          -- vocals|drums|bass|other for stem children
  synth_config TEXT,                         -- JSON: Tone.js instrument type + params (synth lanes)
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX lanes_project ON lanes(project_id, sort_order);

CREATE TABLE assets (                        -- one row per blob in R2
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('audio','video')),
  r2_key      TEXT NOT NULL,
  mime        TEXT NOT NULL,
  bytes       INTEGER NOT NULL,
  duration_sec REAL,
  sample_rate INTEGER,                       -- audio only
  channels    INTEGER,
  source      TEXT NOT NULL,                 -- 'music3' | 'acestep' | 'import' | 'demucs' | 'video'
  source_job_id TEXT,                        -- provenance
  peaks_r2_key TEXT,                         -- waveform peaks sidecar, §6.2
  created_at  INTEGER NOT NULL
);

CREATE TABLE clips (
  id          TEXT PRIMARY KEY,
  lane_id     TEXT NOT NULL REFERENCES lanes(id) ON DELETE CASCADE,
  asset_id    TEXT REFERENCES assets(id),    -- NULL for synth-pattern clips
  start_beats REAL NOT NULL,                 -- timeline position, BPM grid
  length_beats REAL NOT NULL,
  cue_in_sec  REAL NOT NULL DEFAULT 0,       -- non-destructive crop into source audio
  fade_in_sec REAL NOT NULL DEFAULT 0,
  fade_out_sec REAL NOT NULL DEFAULT 0,
  gain_db     REAL NOT NULL DEFAULT 0,
  synth_pattern TEXT,                        -- JSON note list for synth clips
  label       TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX clips_lane ON clips(lane_id, start_beats);

CREATE TABLE jobs (                          -- generate / explode lifecycle, §7
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  lane_id     TEXT,                          -- armed lane at submit time
  kind        TEXT NOT NULL CHECK (kind IN ('music3_generate','acestep_generate','demucs_split')),
  params      TEXT NOT NULL,                 -- JSON: lyrics, caption, seed, durationSec, model / source asset id
  status      TEXT NOT NULL DEFAULT 'queued'
              CHECK (status IN ('queued','running','ingesting','succeeded','failed','cancelled')),
  bridge_job_id TEXT,
  error       TEXT,
  result_asset_ids TEXT,                     -- JSON array
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
```

Clip editing invariants (enforced in the client store and re-validated by the Worker on write):
- All positions/lengths are in **beats** (floats), converted to seconds at the project BPM for playback. Grid snap is a UI concern (default 1/4 beat, toggleable), not a storage constraint.
- `cue_in_sec + beatsToSec(length_beats) <= asset.duration_sec` for audio clips.
- Overlaps **within a lane are allowed** (the brief requires overlay); the mixer just sums them.
- Cut/split = replace one clip row with two (second gets adjusted `cue_in_sec`); copy = new row, same `asset_id`; crop = adjust `cue_in_sec`/`length_beats`; slip = change `cue_in_sec` holding position; nudge = ±grid on `start_beats`. All non-destructive; assets are immutable.

### 6.2 R2 key layout (`clnkrite-media`)

```
projects/{projectId}/audio/{assetId}.wav        generated + imported + stems
projects/{projectId}/peaks/{assetId}.peaks.bin  min/max int8 peak pairs @ 50 px/s, header: version, samplesPerPixel
projects/{projectId}/video/{assetId}.{ext}      picture lane uploads (mp4/webm, ≤ 512 MB)
```

Peaks are computed **client-side** after first decode (Web Audio `decodeAudioData` → min/max downsample) and PUT to R2 via the Worker, so waveforms render instantly on later loads without decoding full audio. If a peaks sidecar is missing, the client decodes and regenerates it.

### 6.3 IndexedDB (cache only — never authoritative)

Store name `clnkrite-cache`: decoded-audio-adjacent artifacts only — fetched WAV `ArrayBuffer`s keyed by `assetId`, and peaks. On project load: fetch project JSON from D1 (always), then hydrate audio from cache with a `HEAD`-style etag check against the Worker; miss → stream from R2 via Worker and backfill cache. A "Clear local cache" button must lose nothing but re-download time.

---

## 7. Worker API and the generate-job lifecycle

### 7.1 Routes (Hono, all under `/api`, all behind Cloudflare Access)

| Route | Purpose |
|---|---|
| `GET/POST /projects`, `GET/PATCH/DELETE /projects/:id` | CRUD. `GET /projects/:id` returns the full document (project + lanes + clips + asset metadata) in one round trip. |
| `POST /projects/:id/lanes`, `PATCH/DELETE /lanes/:id` | Lane CRUD incl. mute/solo/volume/pan/arm/visible/reorder. Arming a lane un-arms others (single UPDATE). |
| `POST /lanes/:id/clips`, `PATCH/DELETE /clips/:id`, `POST /clips/:id/split` | Clip CRUD + split. PATCH accepts batched field updates (drag end sends one PATCH, not per-frame). |
| `POST /projects/:id/assets` | Import upload: client streams file → Worker validates (mime allowlist, audio ≤ 128 MB, video ≤ 512 MB) → R2 put → asset row. Multipart for >100 MB via R2 multipart API. |
| `GET /assets/:id/blob` | Streams from R2 with `Range` support (video seeking needs it) + strong etag. |
| `PUT /assets/:id/peaks` | Client uploads computed peaks sidecar. |
| `POST /projects/:id/jobs` | Create generate/explode job (§7.2). |
| `GET /jobs/:id` | Poll: proxies bridge status, advances the D1 state machine, performs ingest on completion (§7.3). |
| `POST /jobs/:id/cancel` | Forwards to bridge; marks D1 row. |
| `GET /engines` | KV `engines` + live bridge `/health` (5 s edge cache) → drives Add-lane drawer availability. |

Persistence strategy: the client is optimistic (Zustand mutates instantly), a write queue debounces mutations ~500 ms and PATCHes the Worker; the Worker response carries `updated_at` which the client stores. Single user — no conflict resolution beyond last-write-wins. Refresh-safety comes from flushing the write queue on `visibilitychange`/`pagehide` plus the debounce being short.

### 7.2 Job creation

`POST /projects/:id/jobs` with `{kind, laneId, params}`:
1. Validate: lane exists and is armed (generate kinds); for `demucs_split`, source asset exists and came from a generate.
2. Insert D1 `jobs` row (`queued`).
3. `POST {BRIDGE_BASE_URL}/jobs` with engine-native params (for Demucs: include a presigned R2 URL for the source WAV, 1 h expiry). Store `bridge_job_id`.
4. Return the job row. If the bridge POST fails → job `failed`, `error: "bridge_offline"`.

### 7.3 Job progression — poll-driven, no long-held connections

The **client polls** `GET /api/jobs/:id` every 2 s while a job is non-terminal (whether the drawer is open or the job only shows as a top-bar badge). Each poll, the Worker:
1. Reads D1 row; if terminal, returns it (no bridge call).
2. Otherwise `GET bridge /jobs/{bridgeJobId}`; maps `queued/running` (+ queuePosition/elapsed) straight through.
3. On bridge `succeeded`: sets `ingesting`, then for each artifact: stream `GET bridge /jobs/{id}/artifacts/{name}` → `R2 put` (streamed; a 240 s WAV at 32 kHz stereo ≈ 60 MB — fine for a Worker since streaming bodies don't count against CPU time) → insert `assets` row (parse WAV header for duration/rate/channels) → then create clip/lanes rows (§7.5, §8) → `succeeded`. Ingest is idempotent (keyed on `jobId`) in case two polls race; a `job:{id}:ingest` KV lock (60 s TTL) makes the race harmless.
4. On bridge `failed/cancelled`: copy status + error.
5. Timeout guard: a job `running` longer than `params.durationSec * 20 + 600` seconds is marked `failed: "timeout"` (tuned after the M3 checklist measurements).

If the browser closes mid-generation, the job continues on the GPU; the next time the project opens, any non-terminal jobs resume polling (job list is in the project document).

### 7.4 Why not Cloudflare Queues in v1 (explicit decision)

The async-ness already lives in the **bridge's serial FIFO** (mandatory anyway — one GPU, one job at a time), and progression is client-poll-driven. Adding Queues would insert a second queue that can't increase GPU throughput, and a queue consumer would still have to poll the bridge. Cost: more infra, harder local dev; benefit for a single user: ingest completes even if no client polls — recovered anyway on next project open. **Decision: no Queues in v1.** Documented upgrade path: if unattended ingest ever matters, move §7.3 step 3 into a Queues consumer triggered at job submit; the state machine is already shaped for it (that is why `ingesting` is a distinct status).

### 7.5 Result → clip drop

On generate success the Worker creates the clip **server-side** (survives client disconnect): on the job's armed lane, `start_beats` = playhead position captured at submit time (in `params`), `length_beats` = `secToBeats(asset.duration_sec)`, label = first `[Section]` tag or caption prefix. The client's next poll response includes the new clip + asset and the UI drops it in with a highlight.

---

## 8. Stem explode (Music3 full-mix constraint)

Music3 emits only a full mix. UX (copy on the Music3 lane + generate drawer must say this): *"Music3 writes the whole band. Want parts? Explode into stems."*

1. A Music3 (or ACE-Step) clip's context menu offers **"Explode into stems."**
2. Creates a `demucs_split` job on the clip's asset (§7.2). Drawer warns: first run downloads ~2 GB of Demucs weights on the GPU box; separation of a 60 s track takes roughly 0.5–2 min on GPU.
3. On success, the Worker (in the ingest step) creates **4 child lanes** under the source lane — `parent_lane_id` set, `stem_role` ∈ vocals/drums/bass/other, names like "Guitar Song — bass" — each with one clip mirroring the source clip's `start_beats`/`length_beats`/`cue_in_sec` (Demucs output is time-aligned 1:1 with input).
4. The source lane's clip stays; the UI auto-mutes the parent lane when stem children exist (a lane-header "stems" badge toggles between parent and children) so the mix isn't doubled. Child lanes are ordinary lanes: mutable, movable, deletable.

---

## 9. Client specification

### 9.1 Layout (single screen, DAW-shaped)

```
┌────────────────────────────────────────────────────────────┐
│ Top bar: project title · BPM · key · time-sig · vibe ·     │
│          transport (play/stop · playhead time · loop) ·    │
│          bridge status dot · Generate button               │
├───────────┬────────────────────────────────────────────────┤
│ Lane      │  Timeline: bars/beats ruler · loop brace ·     │
│ headers   │  playhead · clips (canvas waveforms) ·         │
│ (name,    │  picture lane thumbnail strip · video viewer   │
│  M/S/vol/ │  (floating, resizable, show/hide)              │
│  pan/arm) │                                                │
├───────────┴────────────────────────────────────────────────┤
│ Drawers (slide-over): Add lane · Generate · Job queue      │
└────────────────────────────────────────────────────────────┘
```

### 9.2 Stores (Zustand, mirroring ACE-Step-DAW's split)

`projectStore` (project + lanes + clips + assets; all mutations funnel through actions that also enqueue Worker PATCHes), `transportStore` (playing, playheadBeats, loop, selectedLaneIds), `jobStore` (active jobs, polling), `uiStore` (drawers, zoom px-per-beat, snap setting, selected clips).

### 9.3 Audio engine (`engine/`, Tone.js 15)

- `Tone.Transport` owns time: `bpm` from project; loop from `loop_*_beats`; playhead UI reads `Transport.position` on rAF.
- Per lane: `Tone.Channel(volume_db, pan)` → master `Tone.Gain` → destination. Mute/solo map to `channel.mute` / `channel.solo` (Tone's solo bus handles "play selected lanes together": selecting lanes for playback = transient solo of the selection; empty selection = play all unmuted).
- Per audio clip: a `Tone.Player` (buffer from asset cache) scheduled via `Transport.schedule` at `start_beats`, offset `cue_in_sec`, duration `length_beats→sec`; fades map to `player.fadeIn/fadeOut`. Scheduling is rebuilt (cheap, idempotent `rebuildSchedule()`) whenever clips/loop/BPM change while stopped, and incrementally for the edited clip while playing.
- Synth lanes: one Tone instrument per lane from `synth_config` (v1 instrument set: `PolySynth`, `MonoSynth`, `FMSynth`, `MembraneSynth`); clips carry a JSON note pattern (`[{timeBeats, note, durBeats, vel}]`) scheduled through `Tone.Part`. Input: click-to-place on a mini piano-roll strip inside the clip inspector — deliberately minimal, not ACE-Step-DAW's full piano roll.
- BPM changes retime clip *positions* (beats are truth) but audio content is **not** time-stretched in v1; UI notes this ("audio recorded at the old tempo won't stretch").

### 9.4 Timeline editing (patterns from waveform-playlist/dawcore)

- Canvas-rendered waveforms from peaks; zoom = px-per-beat (ctrl+wheel), horizontal scroll follows playhead when playing.
- Pointer model: click select · drag body = move (snap to grid, hold Alt to bypass) · drag edges = crop · Alt+drag inside = slip (`cue_in_sec`) · comma/period = nudge ±grid · `S` or scissors = split at playhead · drag fade handles at clip corners · standard copy/paste (`⌘C/⌘V` pastes at playhead on same lane) · delete.
- Multi-clip drag allowed; overlaps render translucently stacked.
- Undo/redo (`⌘Z`): client-side command stack over store actions (persisted state follows via the write queue; the stack itself is not persisted).

### 9.5 Add-lane drawer

Lists the four sources with availability from `GET /api/engines`: **Music3** (hidden/disabled with reason if bridge or SGLang down), **ACE-Step** (only if bridge reports it present), **Synth** (always), **Import audio** (always — file picker or drag-drop, mp3/wav/flac/m4a/ogg), plus **Picture** (one per project; adding replaces). Creating a Music3/ACE-Step lane arms it and opens the Generate drawer.

### 9.6 Generate drawer

Fields: engine selector (Music3 / ACE-Step, filtered by lane kind) · **lyrics** textarea with a section-tag toolbar (`[Intro] [Verse] [Pre-Chorus] [Chorus] [Post-Chorus] [Bridge] [Instrumental] [Solo] [Outro]` insert buttons) · **caption** textarea with a "Draft from project" button that assembles a structured caption skeleton (Global Metadata from BPM/key/time-sig/vibe + empty Vocal Details / Arrangement stubs — pure string templating, no LLM) · **seed** (int, randomize die) · **duration** seconds (10–240 Music3 / 10–600 ACE-Step) · engine extras (ACE-Step: `inference_steps`, `bpm` passthrough) · target = armed lane (shown, switchable). Submit → job chip with state (queue position → elapsed running time → ingesting) and a Cancel button (§5 semantics). Params of past jobs are stored on the job row, so a clip inspector "Show generation params / Regenerate" comes free.

### 9.7 Picture lane (L4)

Upload video → R2 asset → lane `kind='picture'` with one clip (`start_beats` offset draggable like audio clips). Rendering: a floating/resizable `<video>` panel + a thumbnail strip on the lane. Sync: on transport start/seek/loop-wrap, set `video.currentTime = beatsToSec(playhead - clip.start_beats) `and play/pause with the transport; a 250 ms interval check re-seeks if drift > 60 ms. Muted by default (audio lanes are the sound). Show/hide = lane `visible` flag. No trimming, no effects, not an NLE.

---

## 10. Implementation order (each milestone ends runnable + deployed via `wrangler deploy`)

**M0 — Scaffold & pipeline (½ day):** repo (AGPL-3.0-or-later LICENSE, NOTICE crediting ACE-Step-DAW + waveform-playlist), Vite React SPA + Hono Worker in one workspace, wrangler bindings (D1/R2/KV) created, migration 0001 applied, CI = typecheck + vitest + `wrangler deploy` (manual trigger), Cloudflare Access on the app hostname. *Proves: deploy loop.*

**M1 — Project shell + persistence (1–2 days):** project CRUD, top bar (title/BPM/key/time-sig/vibe/length/loop), project list page, optimistic store + write queue, full-document load. *Proves: success-path step 1 and the refresh half of step 7.*

**M2 — Lanes, import audio, transport (2–3 days):** lane CRUD + headers (M/S/vol/pan/arm), import-audio upload → R2 → asset → clip, peaks pipeline, canvas timeline (ruler, playhead, zoom, static clips), Tone engine v1 (play/stop/loop, per-lane channels, clip scheduling, selected-lanes-together). *Proves: steps 3(import)+5.*

**M3 — Bridge + Music3 generate (2–3 days):** bridge app (health + music3 jobs + serial queue), **run the §3.1 confirmation checklist against Kevin's running SGLang-Omni and record results in `docs/music3-contract.md`**, cloudflared tunnel + Access service token, Worker job routes + poll/ingest state machine, Generate drawer (Music3 only), server-side clip drop. *Proves: step 2 — the core of the product. Success path steps 1/2/3/5/7 now pass end-to-end.*

**M4 — Timeline editing (2–3 days):** move/crop/slip/nudge/split/copy/paste/delete/fades/overlay + undo/redo + live re-scheduling. *Proves: step 3 (move until sync).*

**M5 — Synth lane (1–2 days):** instrument configs, pattern clips, mini note editor, `Tone.Part` scheduling. *Proves: step 4.*

**M6 — Picture lane (1 day):** video upload, Range streaming, synced viewer, show/hide. *Proves: step 6 — full success path green. Tag `v1.0-successpath`.*

**M7 — ACE-Step lane + stem explode (2 days):** ACE-Step adapter in bridge + engine availability gating; Demucs adapter, explode UX, child stem lanes, parent auto-mute.

**M8 — Hardening (1–2 days):** bridge-offline UX everywhere, job resume after refresh, cancel paths, IndexedDB cache + clear button, empty/error states, Playwright script of the success path, `docs/runbook.md` (start SGLang, ACE-Step, bridge, tunnel; rotate Access token; R2/D1 backup via `wrangler d1 export`).

Dependencies: M3 needs M2's timeline to land clips; M4–M7 are independent of each other after M3 (parallelizable if ever multi-person).

---

## 11. Risks and mitigations

| # | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| 1 | **Music3 API mismatch** — Kevin's running server predates/postdates the documented SGLang-Omni shape (field names, model id, formats). | Medium / high | Contract confirmed from official docs (§3.1) **and** adapter isolates every field in one config object; M3 starts with the live checklist; findings recorded in `docs/music3-contract.md`. Worst case is edits to one adapter file in the bridge — nothing upstream changes. |
| 2 | **Worker → local GPU networking** — tunnel down, DNS, Access misconfig, Kevin's box asleep. | Medium / medium | Tunnel is outbound-only (NAT-proof); `cloudflared` runs as a system service; Worker treats the bridge as optional (503 → banner; editing/playback unaffected); `GET /api/engines` gives one-glance diagnostics; runbook covers token rotation and tunnel restart. Local dev never needs the tunnel. |
| 3 | **AGPL obligations** — deriving from ACE-Step-DAW (AGPL) while hosting as a network service triggers §13 source-offer. | Certain / low (user accepts AGPL) | clnkrite is AGPL-3.0-or-later from commit 1; public repo link in the app footer satisfies the network-interaction source offer; NOTICE file attributes copied code. MIT deps (waveform-playlist, Tone.js, ACE-Step 1.5, Demucs) are compatible inbound. |
| 4 | **Demucs size/UX** — ~2 GB weights, archived project, minutes-long separations. | Medium / low | Pin `demucs==4.0.1` + `htdemucs` in bridge requirements (archived = stable, and it runs only on Kevin's box); first-run download warning in the explode dialog; explode is a job with queue position + cancel, never blocking the UI; stems cached as assets so re-explode is never needed. |
| 5 | **Serial GPU** — one Music3 job at a time; a 4-minute song can occupy the GPU for many minutes; ACE-Step/Demucs jobs contend too. | Certain / medium | Bridge enforces `maxConcurrency=1` and reports `queuePosition`; UI shows the queue in the job drawer and allows cancel of queued jobs; generate drawer defaults to 60 s durations to keep iteration fast; timeout guard (§7.3) reaps hung jobs. |
| 6 | Large WAV ingest through the Worker (60 MB+ artifacts). | Low / medium | Streamed R2 puts (no buffering in Worker memory); artifacts stay on bridge scratch 24 h so a failed ingest is retryable by the next poll. |
| 7 | Client/D1 divergence (optimistic UI, debounced writes). | Low / low | Single user, last-write-wins; write queue flush on `pagehide`; full-document reload on every project open makes D1 truth self-healing. |

---

## 12. Explicitly out of v1

Realtime/streaming decode (`stream:false` everywhere) · voice clone · Music3/ACE-Step cover, repaint, inpaint task types · cloud accounts, credits, billing · mobile layouts · multiplayer/collaboration · audio time-stretch on BPM change · full NLE for the picture lane · VST/plugin hosting · MIDI hardware I/O.

---

## 13. Engineer's checklist of external prerequisites (everything else is in-repo)

1. Cloudflare account with Workers paid plan (D1 + R2 + Access included at this scale), a zone for `clnkrite.<domain>` and `bridge.<domain>`.
2. Kevin's GPU box running: SGLang-Omni serving MiniMax-Music3 on `:8000` (already running — do not install), optionally ACE-Step 1.5 API on `:8001`, Python 3.11+ for the bridge, `cloudflared` installed.
3. Nothing else. All schemas, contracts, flows, and order-of-work are specified above; open questions were closed by decisions in §2.3, §4.2, and §7.4, and the only "confirm at runtime" item is the M3 Music3 checklist, which has a default answer built in.
