# clnkrite-bridge

Small FastAPI process that runs on the GPU box for **ACE-Step and Demucs only**. Production Music3 does **not** go through this process — the Worker calls `POST /v1/music` on https://h3.clunk.us directly.

Leave `BRIDGE_BASE_URL` unset in production. For local ACE-Step/Demucs, point it at `http://127.0.0.1:8300`. Do not point it at h3.clunk.us.

## Run on :8300

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# SGLang-Omni already serving MiniMax-Music3 on :8000 — do not install models here
export MUSIC3_BASE_URL=http://127.0.0.1:8000
uvicorn app:app --host 127.0.0.1 --port 8300
```

Bind to localhost only. The tunnel is the public door.

## Env vars

| Name | Default | Purpose |
|---|---|---|
| `MUSIC3_BASE_URL` | `http://127.0.0.1:8000` | SGLang-Omni origin |
| `MUSIC3_MODEL` | empty | Fallback model id if `GET /v1/models` is empty |
| `MUSIC3_API_KEY` | empty | Optional `Authorization: Bearer` |
| `ACESTEP_BASE_URL` | `http://127.0.0.1:8001` | Optional ACE-Step 1.5 |
| `ACESTEP_API_KEY` | empty | Optional |
| `PORT` | `8300` | Listen port |
| `CLNKRITE_SCRATCH` | `~/.clnkrite-bridge` | Job artifacts; pruned after 24 h |

## Endpoints

- `GET /health` — probes Music3 `/v1/models` and ACE-Step `/health` (2 s each)
- `POST /jobs` — `{ kind, params }` → `{ jobId }`
- `GET /jobs/{id}` — status / queue position / artifacts
- `GET /jobs/{id}/artifacts/{name}` — audio bytes
- `POST /jobs/{id}/cancel` — dequeue or abort the downstream HTTP request ("cancel = stop waiting")

Queue is strictly serial (`maxConcurrency = 1`). One GPU.

If `MUSIC3_BASE_URL` is unreachable, the job **fails immediately** with a clear error. It does not hang.

ACE-Step adapter: release_task, poll query_result, download /v1/audio. Demucs adapter: demucs -n htdemucs, artifacts vocals/drums/bass/other.wav. POST /jobs/{id}/source accepts the source WAV from the Worker.

## Tunnel notes

On the GPU box, run `cloudflared` as a service with ingress:

```
bridge.<domain> → http://127.0.0.1:8300
```

Create a Cloudflare Access self-hosted app for `bridge.<domain>` with a **service-token** policy. Store the token id/secret as Worker secrets `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`.

Local ACE-Step/Demucs: set `BRIDGE_BASE_URL=http://127.0.0.1:8300` in `.dev.vars`. Production Music3 uses `H3_BASE_URL=https://h3.clunk.us` and Access secrets.

Do not send Music3 generate through this bridge’s `/jobs` API when H3 is configured.
