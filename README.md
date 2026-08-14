# clnkrite

A local-first generative music studio that feels like a small DAW. Music3 and ACE-Step are engines behind lanes, not the product. Personal use, single user.

License: **AGPL-3.0-or-later**. See `LICENSE` and `NOTICE` (credits ACE-Step-DAW and waveform-playlist).

This is a **new** Vite + React 19 + Hono Worker app. It copies patterns; it is not a fork of ACE-Step-DAW.

## Host (Cloudflare only)

The app runs on **Cloudflare Workers** (SPA assets + Hono `/api`). **D1** is the source of truth. **R2** holds audio/video blobs. **KV** holds runtime engine config. Deploy with **wrangler**.

Music3 / ACE-Step / Demucs stay on the GPU box. The Worker reaches them through **Cloudflare Tunnel + Access + `clnkrite-bridge`** (`bridge/` in this repo). Do not run Music3 on a Worker. Do not install models here.

IndexedDB is **cache only** — never authoritative.

No Fal. No cloud generation APIs. No Fly / Railway / Vercel / VPS / Pages project.

## Provision Cloudflare resources

Do this once in an account you control. Placeholders in `wrangler.jsonc` (`REPLACE_AFTER_CREATE`) must be pasted after create.

```bash
# D1
npx wrangler d1 create clnkrite-db
# paste the returned database_id into wrangler.jsonc → d1_databases[0].database_id

# R2
npx wrangler r2 bucket create clnkrite-media

# KV
npx wrangler kv namespace create CONFIG
# paste the returned id into wrangler.jsonc → kv_namespaces[0].id
```

Apply the schema:

```bash
npx wrangler d1 migrations apply clnkrite-db --remote
# or, for local wrangler dev:
npx wrangler d1 migrations apply clnkrite-db --local
```

Optional production secrets (Worker → tunneled bridge):

```bash
npx wrangler secret put CF_ACCESS_CLIENT_ID
npx wrangler secret put CF_ACCESS_CLIENT_SECRET
```

Set `vars.BRIDGE_BASE_URL` in `wrangler.jsonc` to `https://bridge.<your-domain>` for production.

## Deploy

```bash
npm install
npm run build          # Vite → dist/client
npx wrangler deploy    # Worker + SPA assets
```

An engineer can provision D1/R2/KV, paste ids, apply migrations, deploy, and get the project list, editor shell, generate drawer, and job plumbing.

## Local development

Two processes: Vite (UI) and the Worker. The Vite dev server proxies `/api` to `wrangler dev` on `:8787`.

```bash
cp .dev.vars.example .dev.vars
# .dev.vars already has BRIDGE_BASE_URL=http://127.0.0.1:8300

npm install
npm run worker:dev     # wrangler dev — apply local D1 migrations first
npm run dev            # Vite on :5173
```

Bridge (GPU box or same machine):

```bash
cd bridge
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# MUSIC3_BASE_URL defaults to http://127.0.0.1:8000
uvicorn app:app --host 127.0.0.1 --port 8300
```

See `bridge/README.md` for env vars and tunnel notes. Local `wrangler dev` talks to `http://127.0.0.1:8300` — no tunnel required.

## Env / secrets

| Name | Where | Purpose |
|---|---|---|
| `BRIDGE_BASE_URL` | Worker `vars` / `.dev.vars` | Bridge origin. Local: `http://127.0.0.1:8300`. Prod: tunnel hostname. |
| `CF_ACCESS_CLIENT_ID` | Worker secret (optional) | Access service-token id. Attached to every bridge fetch when set. |
| `CF_ACCESS_CLIENT_SECRET` | Worker secret (optional) | Access service-token secret. |
| `DB` | D1 binding | Source of truth. |
| `MEDIA` | R2 binding | Audio/video/peaks blobs. Never public. |
| `CONFIG` | KV binding | `engines`, `defaults`, `settings:kevin`. |
| `MUSIC3_BASE_URL` | Bridge env | SGLang-Omni, default `http://127.0.0.1:8000`. |
| `MUSIC3_MODEL` | Bridge env | Fallback model id if `/v1/models` is empty. |
| `MUSIC3_API_KEY` | Bridge env | Optional. |
| `ACESTEP_BASE_URL` | Bridge env | Optional ACE-Step 1.5, default `http://127.0.0.1:8001`. |
| `ACESTEP_API_KEY` | Bridge env | Optional. |
| `PORT` | Bridge env | Default `8300`. |

## Scripts

| Script | What |
|---|---|
| `npm run dev` | Vite client |
| `npm run build` | Vite build → `dist/client` |
| `npm run typecheck` | `tsc -b --noEmit` |
| `npm run test` | Vitest |
| `npm run worker:dev` | `wrangler dev` |

## Milestone status

M0–M3 skeleton is in this repo (scaffold, project persistence, lanes + transport shell, bridge + Music3 generate plumbing).

M4–M8 (timeline editing, synth lane UI, picture viewer, ACE-Step/Demucs explode, Playwright hardening) are stubbed so types compile. Do not treat those as shipped.
