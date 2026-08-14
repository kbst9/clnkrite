"""clnkrite-bridge — serial GPU job queue in front of Music3 / ACE-Step / Demucs."""

from __future__ import annotations

import asyncio
import json
import os
import time
import uuid
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse

# Every Music3 field name lives here so the M3 checklist is a config switch, not a rewrite.
MUSIC3_ADAPTER: dict[str, Any] = {
    "endpoint_path": "/v1/audio/speech",
    "models_path": "/v1/models",
    "model_field": "model",
    "input_field": "input",  # lyrics
    "instructions_field": "instructions",  # caption
    "response_format_field": "response_format",
    "response_format": "wav",
    "seed_field": "seed",
    "max_new_tokens_field": "max_new_tokens",
    "frames_per_second": 25,
    "stream_field": "stream",
    "stream": False,
    "auth_header": "Authorization",
    "auth_prefix": "Bearer ",
    "default_model": "MiniMaxAI/MiniMax-Music3",
}

MUSIC3_BASE_URL = os.environ.get("MUSIC3_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
MUSIC3_MODEL = os.environ.get("MUSIC3_MODEL", "")
MUSIC3_API_KEY = os.environ.get("MUSIC3_API_KEY", "")
ACESTEP_BASE_URL = os.environ.get("ACESTEP_BASE_URL", "http://127.0.0.1:8001").rstrip("/")
ACESTEP_API_KEY = os.environ.get("ACESTEP_API_KEY", "")
SCRATCH = Path(os.environ.get("CLNKRITE_SCRATCH", Path.home() / ".clnkrite-bridge"))
SCRATCH.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="clnkrite-bridge")
jobs: dict[str, dict[str, Any]] = {}
queue: asyncio.Queue[str] = asyncio.Queue()
running_id: str | None = None
worker_started = False


def _now() -> float:
    return time.time()


def _music3_headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if MUSIC3_API_KEY:
        headers[MUSIC3_ADAPTER["auth_header"]] = f"{MUSIC3_ADAPTER['auth_prefix']}{MUSIC3_API_KEY}"
    return headers


async def _probe_music3() -> dict[str, Any]:
    url = f"{MUSIC3_BASE_URL}{MUSIC3_ADAPTER['models_path']}"
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            res = await client.get(url, headers=_music3_headers())
            if res.status_code >= 400:
                return {"up": False, "model": None}
            data = res.json()
            model = None
            if isinstance(data, dict):
                items = data.get("data") or data.get("models") or []
                if items:
                    first = items[0]
                    model = first.get("id") if isinstance(first, dict) else str(first)
            return {"up": True, "model": model or MUSIC3_MODEL or MUSIC3_ADAPTER["default_model"]}
    except Exception:
        return {"up": False, "model": None}


async def _probe_acestep() -> dict[str, Any] | None:
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            headers = {}
            if ACESTEP_API_KEY:
                headers["Authorization"] = f"Bearer {ACESTEP_API_KEY}"
            res = await client.get(f"{ACESTEP_BASE_URL}/health", headers=headers)
            return {"up": res.status_code < 400}
    except Exception:
        return {"up": False}


async def resolve_music3_model() -> str:
    probed = await _probe_music3()
    if probed.get("model"):
        return str(probed["model"])
    return MUSIC3_MODEL or str(MUSIC3_ADAPTER["default_model"])


def build_music3_body(params: dict[str, Any], model: str) -> dict[str, Any]:
    duration = float(params.get("durationSec") or 60)
    tokens = int(-(-duration * MUSIC3_ADAPTER["frames_per_second"] // 1))  # ceil
    return {
        MUSIC3_ADAPTER["model_field"]: model,
        MUSIC3_ADAPTER["input_field"]: params.get("lyrics") or "",
        MUSIC3_ADAPTER["instructions_field"]: params.get("caption") or "",
        MUSIC3_ADAPTER["response_format_field"]: MUSIC3_ADAPTER["response_format"],
        MUSIC3_ADAPTER["seed_field"]: int(params.get("seed") or 0),
        MUSIC3_ADAPTER["max_new_tokens_field"]: tokens,
        MUSIC3_ADAPTER["stream_field"]: MUSIC3_ADAPTER["stream"],
    }


async def run_music3(job: dict[str, Any]) -> None:
    job_id = job["id"]
    dest = SCRATCH / job_id
    dest.mkdir(parents=True, exist_ok=True)
    out = dest / "output.wav"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(connect=5.0, read=5.0, write=5.0, pool=5.0)) as probe:
            try:
                await probe.get(f"{MUSIC3_BASE_URL}{MUSIC3_ADAPTER['models_path']}", headers=_music3_headers())
            except Exception as exc:
                job["status"] = "failed"
                job["error"] = f"MUSIC3_BASE_URL unreachable: {exc}"
                return
        model = await resolve_music3_model()
        body = build_music3_body(job["params"], model)
        job["_http"] = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=10.0, read=600.0, write=30.0, pool=10.0)
        )
        res = await job["_http"].post(
            f"{MUSIC3_BASE_URL}{MUSIC3_ADAPTER['endpoint_path']}",
            headers=_music3_headers(),
            json=body,
        )
        if res.status_code >= 400:
            job["status"] = "failed"
            job["error"] = f"music3_http_{res.status_code}: {res.text[:400]}"
            return
        out.write_bytes(res.content)
        job["artifacts"] = [{"name": "output.wav", "bytes": out.stat().st_size, "durationSec": job["params"].get("durationSec")}]
        job["status"] = "succeeded"
    except httpx.RequestError as exc:
        if job.get("status") != "cancelled":
            job["status"] = "failed"
            job["error"] = f"MUSIC3_BASE_URL unreachable: {exc}"
    except asyncio.CancelledError:
        job["status"] = "cancelled"
        job["error"] = "cancelled"
        raise
    except Exception as exc:
        if job.get("status") != "cancelled":
            job["status"] = "failed"
            job["error"] = str(exc)
    finally:
        client = job.pop("_http", None)
        if client:
            await client.aclose()


async def run_unavailable(job: dict[str, Any], name: str) -> None:
    job["status"] = "failed"
    job["error"] = f"{name} adapter unavailable"


async def worker_loop() -> None:
    global running_id
    while True:
        job_id = await queue.get()
        job = jobs.get(job_id)
        if not job or job["status"] == "cancelled":
            queue.task_done()
            continue
        job["status"] = "running"
        job["startedAt"] = _now()
        running_id = job_id
        kind = job["kind"]
        try:
            if kind == "music3_generate":
                await run_music3(job)
            elif kind == "acestep_generate":
                await run_unavailable(job, "ACE-Step")
            elif kind == "demucs_split":
                await run_unavailable(job, "Demucs")
            else:
                job["status"] = "failed"
                job["error"] = f"unknown_kind:{kind}"
        finally:
            running_id = None
            job["updatedAt"] = _now()
            queue.task_done()


@app.on_event("startup")
async def _startup() -> None:
    global worker_started
    if not worker_started:
        worker_started = True
        asyncio.create_task(worker_loop())


@app.get("/health")
async def health() -> dict[str, Any]:
    music3, acestep = await asyncio.gather(_probe_music3(), _probe_acestep())
    depth = queue.qsize()
    return {
        "music3": music3,
        "acestep": acestep,
        "demucs": {"available": False},
        "queue": {"depth": depth, "running": running_id is not None},
    }


@app.post("/jobs")
async def create_job(body: dict[str, Any]) -> dict[str, str]:
    kind = body.get("kind")
    if kind not in {"music3_generate", "acestep_generate", "demucs_split"}:
        raise HTTPException(400, "kind_required")
    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        "id": job_id,
        "kind": kind,
        "params": body.get("params") or {},
        "status": "queued",
        "error": None,
        "artifacts": [],
        "createdAt": _now(),
        "updatedAt": _now(),
        "task": None,
    }
    await queue.put(job_id)
    return {"jobId": job_id}


@app.get("/jobs/{job_id}")
async def get_job(job_id: str) -> dict[str, Any]:
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "not_found")
    queued_ids = [jid for jid in list(jobs) if jobs[jid]["status"] == "queued"]
    try:
        position = queued_ids.index(job_id) + (1 if running_id else 0)
    except ValueError:
        position = 0
    return {
        "status": job["status"],
        "queuePosition": position,
        "progress": None,
        "error": job.get("error"),
        "artifacts": job.get("artifacts") or None,
    }


@app.get("/jobs/{job_id}/artifacts/{name}")
async def get_artifact(job_id: str, name: str) -> FileResponse:
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "not_found")
    path = SCRATCH / job_id / name
    if not path.is_file():
        raise HTTPException(404, "artifact_missing")
    return FileResponse(path, media_type="audio/wav", filename=name)


@app.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str) -> dict[str, str]:
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "not_found")
    job["status"] = "cancelled"
    job["error"] = "cancelled"
    client = job.get("_http")
    if client:
        await client.aclose()
    return {"ok": "cancelled"}


@app.get("/")
async def root() -> JSONResponse:
    return JSONResponse({"service": "clnkrite-bridge", "docs": "/docs"})
