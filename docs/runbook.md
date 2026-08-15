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

## BRIDGE_BASE_URL

Stays in Worker vars. Do not bake the tunnel hostname into source.

- Local wrangler dev: copy .dev.vars.example to .dev.vars. Value is http://127.0.0.1:8300
- Production: wrangler.jsonc vars.BRIDGE_BASE_URL. Placeholder is https://bridge.example.com — REPLACE_AFTER_CREATE with the real tunnel hostname (do not invent one). Also `wrangler secret put CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET`. App-hostname Access is a Zero Trust dashboard step, not code.

Local dev never needs the tunnel. Production secrets CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET are set with wrangler secret put.

## Start order on the GPU box

1. SGLang-Omni / Music3 on port 8000 (already running). Confirm GET /v1/models.
2. ACE-Step 1.5 optional on port 8001. Confirm GET /health. The Add-lane drawer hides ACE-Step if down.
3. Demucs optional, pin demucs==4.0.1, model htdemucs. First run downloads weights (~2GB).
4. Bridge: cd bridge && python -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && uvicorn app:app --host 127.0.0.1 --port 8300
5. Tunnel (production only): map bridge.<domain> to localhost:8300. Outbound-only connector.
6. Build the SPA then deploy with wrangler. Locally run the worker and the Vite app together.

## Rotate the Access service token

Create a new service token in Zero Trust. Point the bridge hostname policy at it. Store the new id and secret as Worker secrets. Confirm GET /api/engines is online.

## D1 export

Export clnkrite-db with wrangler d1 export --remote --output backup.sql. Inventory blobs with wrangler r2 object list clnkrite-media. IndexedDB is cache only.

## Cancel

Cancel means stop waiting. ACE-Step has no cancel API. Music3 is aborted by dropping the HTTP request. The GPU may finish; the result is discarded.

