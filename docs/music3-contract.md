# Music3 contract (H3)

Production Music3 is the MiniMax Local Media API on **https://h3.clunk.us** (existing Mediaguy tunnel). The Worker talks to it directly. This is **not** SGLang `POST /v1/audio/speech` and **not** the clnkrite Python bridge `POST /jobs`.

## Live host

| Call | Contract |
|---|---|
| `GET /v1/health` | Engine liveness. Mapped into `/api/engines`. |
| `POST /v1/music` | 202 JobResponse. Body: `caption` (required), `lyrics` (default `[Instrumental]`), `max_duration` 1–300 default 60, optional `seed`, `steps`, `tiled_decode`. |
| `GET /v1/music/{id}` | Poll until `status=completed`. |
| `GET /v1/music/{id}/content` | Stereo **MP3** (not WAV). Task string: `text-to-music`. |
| `DELETE /v1/jobs/{id}` | Cancel / stop waiting. |

Every request sends Cloudflare Access headers `CF-Access-Client-Id` and `CF-Access-Client-Secret` when those Worker secrets are set. Unauthenticated GET is 403 HTML.

Also on the host (do not call except health): `/v1/models`, `/v1/videos*`, `/v1/assets`. GPU3 = Music3, GPU2 = H3. Independent queues.

**Not on this tunnel:** ACE-Step, clnkrite bridge routes (`GET /health`, `POST /jobs`), SGLang `POST /v1/audio/speech`.

## Worker mapping

- Create is async 202. The Worker stores the remote id and returns. The client polls `GET /api/jobs/:id`; each poll does one `GET /v1/music/{id}`. Do not block a generate inside one Worker request.
- `completed` → D1 `ingesting` → fetch `/content` → R2 as `audio/mpeg`. Duration comes from job params / H3 metadata / optional MP3 Xing parse. A WAV header is not required.
- `/api/engines` is online when `GET /v1/health` succeeds so a Music3 lane can be added. ACE-Step stays absent unless a local Python bridge reports it.

Supported lyric section tags: `[Intro] [Verse] [Pre-Chorus] [Chorus] [Post-Chorus] [Bridge] [Instrumental] [Solo] [Outro]`.

Caption structure (best-results guidance from the model card): Global Metadata, Vocal Details, Arrangement. The generate drawer "Draft from project" button is a string template, not an LLM.
