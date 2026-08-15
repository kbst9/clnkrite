# clnkrite runbook

Personal box notes. Cloudflare only. The GPU never leaves this machine.

## Node

Use Node 22 (wrangler 4 requires >=22). The repo pins this via package.json engines, volta, and .nvmrc.

```
nvm use
node -v
npm i
npm run typecheck
npm run test
npm run build
```

## Music3 host (H3)

Production Music3 is the MiniMax Local Media API already on **https://h3.clunk.us** (Mediaguy’s tunnel). The Worker talks to it directly. Do not invent a new tunnel.

- `POST /v1/music` → 202 job
- `GET /v1/music/{id}` poll until `completed`
- `GET /v1/music/{id}/content` → stereo MP3
- `DELETE /v1/jobs/{id}`
- Liveness: `GET /v1/health` (not the Python bridge `GET /health`)

`wrangler.jsonc` vars: `H3_BASE_URL=https://h3.clunk.us`. Leave `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` empty. Do not invent a token or put values in git or wrangler vars. When those Worker secrets are set later, they are attached to every H3 fetch (same names Inspire Flow uses). Until then, live generate is 403. That is expected. `/api/engines` stays online on that Access wall so Music3 can still be added.

This host is **not** the clnkrite Python bridge and **not** raw SGLang. Do not send Music3 through `POST /jobs`, `GET /health`, or `POST /v1/audio/speech`. Do not call `/v1/videos*` from this Worker.

ACE-Step and Demucs are not on this tunnel. They stay absent unless a **local** Python bridge is configured separately.

## Optional local bridge (ACE-Step / Demucs)

`BRIDGE_BASE_URL` is optional and only for a future/local Demucs or ACE-Step process. Leave it unset in production. If you set it for local work, use something like `http://127.0.0.1:8300`. Do **not** point it at `example.com` or at `https://h3.clunk.us`.

App-hostname Access on rite.clnkr.dev is a Zero Trust dashboard step, not code.

## Start order on the GPU box

1. MiniMax Local Media API (H3 + Music3) already published at https://h3.clunk.us. Confirm `GET /v1/health` with Access headers.
2. ACE-Step 1.5 optional on a local port. The Add-lane drawer hides ACE-Step if the local bridge does not report it.
3. Demucs optional, pin demucs==4.0.1, model htdemucs. First run downloads weights (~2GB). Not on h3.clunk.us.
4. Optional local bridge only if you need ACE-Step/Demucs: `cd bridge && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && uvicorn app:app --host 127.0.0.1 --port 8300`
5. Build the SPA then deploy with wrangler. Access secrets stay empty until they are set later.

## Access secrets (later)

Leave `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` empty for deploy. When they are set later, they go in as Worker secrets only — not wrangler vars, not git. `/api/engines` is already online without them.

## D1 export

Export clnkrite-db with wrangler d1 export --remote --output backup.sql. Inventory blobs with wrangler r2 object list clnkrite-media. IndexedDB is cache only.

## Cancel

Cancel means stop waiting. Music3 is `DELETE /v1/jobs/{id}` on the H3 host. ACE-Step (local bridge only) has no cancel API. The GPU may finish; the result is discarded.
