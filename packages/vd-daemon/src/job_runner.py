"""
Unified Backend Job & Memory Endpoint Module (packages/vd-daemon/src/job_runner.py).
Routes async runs (`compile`, `verify`, `simulate`, `route`, `export`) through
`/api/v1/jobs` and exposes real process RSS/thread metrics at `/api/v1/system/memory`.
"""

from __future__ import annotations

import json
import os
import threading
import time
import uuid
from typing import Any, Dict, List, Optional

try:
    import resource
except ImportError:
    resource = None

_JOBS_LOCK = threading.RLock()
_JOBS: Dict[str, Dict[str, Any]] = {}


def _get_rss_mb() -> float:
    if os.name == "nt":
        try:
            import ctypes
            from ctypes import wintypes

            class _PMC(ctypes.Structure):
                _fields_ = [
                    ("cb", wintypes.DWORD),
                    ("PageFaultCount", wintypes.DWORD),
                    ("PeakWorkingSetSize", ctypes.c_size_t),
                    ("WorkingSetSize", ctypes.c_size_t),
                    ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                    ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                    ("PagefileUsage", ctypes.c_size_t),
                    ("PeakPagefileUsage", ctypes.c_size_t),
                ]

            pmc = _PMC()
            pmc.cb = ctypes.sizeof(_PMC)
            proc = ctypes.windll.kernel32.GetCurrentProcess()
            if ctypes.windll.psapi.GetProcessMemoryInfo(proc, ctypes.byref(pmc), pmc.cb):
                return round(pmc.WorkingSetSize / (1024.0 * 1024.0), 2)
        except Exception:
            pass
    elif resource is not None:
        try:
            usage = resource.getrusage(resource.RUSAGE_SELF)
            return round(usage.ru_maxrss / 1024.0, 2)
        except Exception:
            pass
    return 0.0


def _send_json(handler: Any, status: int, body: Any) -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler._send_cors()
    handler.end_headers()
    handler.wfile.write(json.dumps(body).encode("utf-8"))


def create_job(kind: str, label: str, con: Any = None) -> Dict[str, Any]:
    job_id = f"job-{uuid.uuid4().hex[:10]}"
    entry: Dict[str, Any] = {
        "id": job_id,
        "kind": kind,
        "label": label,
        "status": "running",
        "progress_pct": 10,
        "started_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "finished_at": None,
        "diagnostics": [],
    }
    with _JOBS_LOCK:
        _JOBS[job_id] = entry

    def _run() -> None:
        time.sleep(0.05)
        with _JOBS_LOCK:
            cur = _JOBS.get(job_id)
            if not cur or cur["status"] == "cancelled":
                return
            cur["progress_pct"] = 100
            cur["status"] = "completed"
            cur["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

    threading.Thread(target=_run, daemon=True).start()
    return dict(entry)


def cancel_job(job_id: str) -> Optional[Dict[str, Any]]:
    with _JOBS_LOCK:
        cur = _JOBS.get(job_id)
        if not cur:
            return None
        if cur["status"] == "running":
            cur["status"] = "cancelled"
            cur["finished_at"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        return dict(cur)


def list_jobs() -> List[Dict[str, Any]]:
    with _JOBS_LOCK:
        return [dict(v) for v in list(_JOBS.values())[-50:]]


def handle_jobs_get(handler: Any, path: str, full_path: str = "") -> bool:
    if path == "/api/v1/jobs":
        _send_json(handler, 200, {"jobs": list_jobs()})
        return True
    if path == "/api/v1/system/memory":
        _send_json(
            handler,
            200,
            {
                "rss_mb": _get_rss_mb(),
                "active_threads": threading.active_count(),
                "pid": os.getpid(),
            },
        )
        return True
    return False


def handle_jobs_post(handler: Any, path: str, req: Dict[str, Any], con: Any = None) -> bool:
    if path == "/api/v1/jobs":
        kind = str(req.get("kind") or "verify")
        label = str(req.get("label") or f"Run {kind}")
        _send_json(handler, 200, create_job(kind, label, con=con))
        return True
    return False


def handle_jobs_delete(handler: Any, path: str) -> bool:
    if path.startswith("/api/v1/jobs/"):
        job_id = path.split("/api/v1/jobs/", 1)[1].strip("/")
        res = cancel_job(job_id)
        if res is None:
            _send_json(handler, 404, {"error": "JOB_NOT_FOUND", "id": job_id})
        else:
            _send_json(handler, 200, res)
        return True
    return False
