# clnkrite-bridge

Small FastAPI process that runs on the GPU box. The Cloudflare Worker talks to it — locally at `http://127.0.0.1:8300`, in production through a Cloudflare Tunnel + Access service token.

Music3 (SGLang-Omni), ACE-Step, and Demucs stay on this machine. The bridge never leaves localhost except via `cloudflared`.

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
| `ACESTEP_BASE_URL` | `http://127.0.0.1:8001` | Optional ACE-Step 1.5 (adapter is a stub in M3) |
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

ACE-Step and Demucs adapters report **unavailable** in this M3 skeleton.

## Tunnel notes

On the GPU box, run `cloudflared` as a service with ingress:

```
bridge.<domain> → http://127.0.0.1:8300
```

Create a Cloudflare Access self-hosted app for `bridge.<domain>` with a **service-token** policy. Store the token id/secret as Worker secrets `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`.

Local `wrangler dev` does **not** need the tunnel: `.dev.vars` sets `BRIDGE_BASE_URL=http://127.0.0.1:8300`.

Do not expose SGLang or ACE-Step directly through the tunnel.
