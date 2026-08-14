"""clnkrite-bridge — serial GPU job queue in front of Music3 / ACE-Step / Demucs."""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import time
import uuid
from pathlib import Path
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException, Request
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
JOB_METADATA = "job.json"
SCRATCH_MAX_AGE_SEC = 24 * 60 * 60


def _now() -> float:
    return time.time()


def _persist_job(job: dict[str, Any]) -> None:
    dest = SCRATCH / str(job["id"])
    dest.mkdir(parents=True, exist_ok=True)
    metadata = {key: value for key, value in job.items() if key not in {"_http", "task"}}
    temp = dest / f"{JOB_METADATA}.tmp"
    temp.write_text(json.dumps(metadata, separators=(",", ":")), encoding="utf-8")
    temp.replace(dest / JOB_METADATA)


def _artifact_record(path: Path, duration_sec: Any = None) -> dict[str, Any]:
    artifact: dict[str, Any] = {"name": path.name, "bytes": path.stat().st_size}
    if duration_sec is not None:
        artifact["durationSec"] = duration_sec
    return artifact


def _load_scratch_jobs() -> list[str]:
    queued: list[str] = []
    for dest in SCRATCH.iterdir():
        if not dest.is_dir():
            continue
        metadata_path = dest / JOB_METADATA
        output = dest / "output.wav"
        job: dict[str, Any] | None = None
        if metadata_path.is_file():
            try:
                loaded = json.loads(metadata_path.read_text(encoding="utf-8"))
                if isinstance(loaded, dict):
                    job = loaded
            except (OSError, json.JSONDecodeError):
                job = None
        if job is None and output.is_file():
            stamp = output.stat().st_mtime
            job = {
                "id": dest.name,
                "kind": "music3_generate",
                "params": {},
                "status": "succeeded",
                "error": None,
                "artifacts": [_artifact_record(output)],
                "createdAt": stamp,
                "updatedAt": stamp,
            }
        if job is None:
            continue

        job["id"] = dest.name
        job.setdefault("params", {})
        job.setdefault("artifacts", [])
        job.setdefault("error", None)
        job.setdefault("createdAt", dest.stat().st_mtime)
        job.setdefault("updatedAt", job["createdAt"])
        stems = [dest / f"{role}.wav" for role in ("vocals", "drums", "bass", "other")]
        if output.is_file() and job.get("status") in {"running", "succeeded"}:
            job["status"] = "succeeded"
            job["error"] = None
            job["artifacts"] = [
                _artifact_record(output, job.get("params", {}).get("durationSec"))
            ]
        elif all(path.is_file() for path in stems) and job.get("status") in {"running", "succeeded", "queued"}:
            job["status"] = "succeeded"
            job["error"] = None
            job["artifacts"] = [_artifact_record(path) for path in stems]
        elif job.get("status") == "running":
            job["status"] = "queued"
            job["error"] = "bridge_restarted"
        job["task"] = None
        jobs[dest.name] = job
        _persist_job(job)
        if job.get("status") == "queued":
            queued.append(dest.name)
    return queued


def _prune_scratch() -> None:
    if running_id is not None:
        return
    cutoff = _now() - SCRATCH_MAX_AGE_SEC
    for dest in SCRATCH.iterdir():
        if not dest.is_dir():
            continue
        job = jobs.get(dest.name)
        if job and job.get("status") in {"queued", "running"}:
            continue
        updated_at = float(job.get("updatedAt", 0)) if job else dest.stat().st_mtime
        if updated_at < cutoff:
            shutil.rmtree(dest, ignore_errors=True)
            jobs.pop(dest.name, None)


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
        duration = float(job["params"].get("durationSec") or 60)
        read_timeout = max(600.0, duration * 20.0 + 600.0)
        job["_http"] = httpx.AsyncClient(
            timeout=httpx.Timeout(connect=10.0, read=read_timeout, write=30.0, pool=10.0)
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


def _acestep_headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if ACESTEP_API_KEY:
        headers["Authorization"] = f"Bearer {ACESTEP_API_KEY}"
    return headers


def _demucs_available() -> bool:
    return shutil.which("demucs") is not None


async def run_acestep(job: dict[str, Any]) -> None:
    dest = SCRATCH / job["id"]
    dest.mkdir(parents=True, exist_ok=True)
    params = job.get("params") or {}
    body = {
        "prompt": params.get("prompt") or params.get("caption") or "",
        "lyrics": params.get("lyrics") or "",
        "audio_duration": float(params.get("audioDuration") or params.get("durationSec") or 60),
        "bpm": int(params.get("bpm") or 120),
        "task_type": "text2music",
        "inference_steps": int(params.get("inferenceSteps") or 8),
        "seed": int(params.get("seed") or 0),
        "audio_format": "wav",
    }
    try:
        job["_http"] = httpx.AsyncClient(timeout=httpx.Timeout(connect=10.0, read=30.0, write=30.0, pool=10.0))
        res = await job["_http"].post(f"{ACESTEP_BASE_URL}/release_task", headers=_acestep_headers(), json=body)
        if res.status_code >= 400:
            job["status"] = "failed"
            job["error"] = f"acestep_http_{res.status_code}: {res.text[:400]}"
            return
        data = res.json()
        task_id = data.get("task_id") if isinstance(data, dict) else None
        if not task_id:
            job["status"] = "failed"
            job["error"] = "acestep_missing_task_id"
            return
        while True:
            if job.get("status") == "cancelled":
                return
            query = await job["_http"].post(
                f"{ACESTEP_BASE_URL}/query_result",
                headers=_acestep_headers(),
                json=[task_id],
            )
            payload = query.json()
            item = payload[0] if isinstance(payload, list) and payload else payload
            status = item.get("status") if isinstance(item, dict) else None
            if status == 1:
                paths = item.get("audio_paths") or item.get("paths") or []
                path = item.get("audio_path") or item.get("path") or (paths[0] if paths else None)
                if not path:
                    job["status"] = "failed"
                    job["error"] = "acestep_missing_audio_path"
                    return
                audio = await job["_http"].get(
                    f"{ACESTEP_BASE_URL}/v1/audio",
                    headers=_acestep_headers(),
                    params={"path": path},
                )
                if audio.status_code >= 400:
                    job["status"] = "failed"
                    job["error"] = f"acestep_audio_{audio.status_code}"
                    return
                out = dest / "output.wav"
                out.write_bytes(audio.content)
                job["artifacts"] = [_artifact_record(out, body["audio_duration"])]
                job["status"] = "succeeded"
                return
            if status == 2:
                job["status"] = "failed"
                job["error"] = str(item.get("error") or "acestep_failed")
                return
            await asyncio.sleep(2)
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


async def run_demucs(job: dict[str, Any]) -> None:
    dest = SCRATCH / job["id"]
    dest.mkdir(parents=True, exist_ok=True)
    src = dest / "input.wav"
    if not src.is_file():
        url = (job.get("params") or {}).get("sourceUrl")
        if not url:
            job["status"] = "failed"
            job["error"] = "missing_source"
            return
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                res = await client.get(str(url))
                if res.status_code >= 400:
                    job["status"] = "failed"
                    job["error"] = f"source_http_{res.status_code}"
                    return
                src.write_bytes(res.content)
        except Exception as exc:
            job["status"] = "failed"
            job["error"] = f"source_download: {exc}"
            return
    if not _demucs_available():
        job["status"] = "failed"
        job["error"] = "demucs_unavailable"
        return
    outdir = dest / "stems"
    outdir.mkdir(parents=True, exist_ok=True)
    proc = await asyncio.create_subprocess_exec(
        "demucs",
        "-n",
        "htdemucs",
        "-o",
        str(outdir),
        str(src),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    job["_proc"] = proc
    _stdout, stderr = await proc.communicate()
    job.pop("_proc", None)
    if job.get("status") == "cancelled":
        return
    if proc.returncode != 0:
        job["status"] = "failed"
        job["error"] = (stderr.decode("utf-8", errors="replace") or "demucs_failed")[:400]
        return
    found = list(outdir.rglob("*.wav"))
    artifacts = []
    for role in ("vocals", "drums", "bass", "other"):
        match = next((path for path in found if path.stem == role), None)
        if not match:
            job["status"] = "failed"
            job["error"] = "demucs_missing_stems"
            return
        target = dest / f"{role}.wav"
        shutil.copy2(match, target)
        artifacts.append(_artifact_record(target))
    job["artifacts"] = artifacts
    job["status"] = "succeeded"


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
        job["updatedAt"] = _now()
        _persist_job(job)
        running_id = job_id
        kind = job["kind"]
        try:
            if kind == "music3_generate":
                await run_music3(job)
            elif kind == "acestep_generate":
                await run_acestep(job)
            elif kind == "demucs_split":
                await run_demucs(job)
            else:
                job["status"] = "failed"
                job["error"] = f"unknown_kind:{kind}"
        finally:
            running_id = None
            job["updatedAt"] = _now()
            _persist_job(job)
            queue.task_done()
            _prune_scratch()


@app.on_event("startup")
async def _startup() -> None:
    global worker_started
    if not worker_started:
        worker_started = True
        for job_id in _load_scratch_jobs():
            await queue.put(job_id)
        _prune_scratch()
        asyncio.create_task(worker_loop())


@app.get("/health")
async def health() -> dict[str, Any]:
    music3, acestep = await asyncio.gather(_probe_music3(), _probe_acestep())
    depth = queue.qsize()
    return {
        "music3": music3,
        "acestep": acestep,
        "demucs": {"available": _demucs_available()},
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
    _persist_job(jobs[job_id])
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
    job["updatedAt"] = _now()
    client = job.get("_http")
    if client:
        await client.aclose()
    proc = job.get("_proc")
    if proc and proc.returncode is None:
        proc.kill()
    _persist_job(job)
    return {"ok": "cancelled"}


@app.post("/jobs/{job_id}/source")
async def put_source(job_id: str, request: Request) -> dict[str, str]:
    job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "not_found")
    dest = SCRATCH / job_id
    dest.mkdir(parents=True, exist_ok=True)
    body = await request.body()
    if not body:
        raise HTTPException(400, "empty_source")
    (dest / "input.wav").write_bytes(body)
    job["updatedAt"] = _now()
    _persist_job(job)
    return {"ok": "stored"}


@app.get("/")
async def root() -> JSONResponse:
    return JSONResponse({"service": "clnkrite-bridge", "docs": "/docs"})
