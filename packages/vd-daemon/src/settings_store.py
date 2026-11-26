"""Persistent Global Settings, Project Settings & Sanitized Diagnostic Bundle store (loopback only)."""

from __future__ import annotations

import copy
import json
import os
import pathlib
import platform
import re
import sqlite3
import tempfile
import time
import urllib.parse
from typing import Any, Dict, List, Optional

try:
    from .kicad_routes import _ensure_active_workspace, _ACTIVE_STATE, _BRIDGE
    from .kicad_bridge import sha256_text, sync_kicad_pcb_to_hwir, sync_kicad_sch_to_hwir
    from .polish_engine import probe_tool_manager_status
except ImportError:
    from kicad_routes import _ensure_active_workspace, _ACTIVE_STATE, _BRIDGE
    from kicad_bridge import sha256_text, sync_kicad_pcb_to_hwir, sync_kicad_sch_to_hwir
    from polish_engine import probe_tool_manager_status


SECRET_PATTERNS = [
    re.compile(r"sk-[a-zA-Z0-9]{16,}"),
    re.compile(r"ghp_[a-zA-Z0-9]{16,}"),
    re.compile(r"github_pat_[a-zA-Z0-9_]{16,}"),
    re.compile(r"AIza[0-9A-Za-z_-]{20,}"),
    re.compile(r"(?i)(api[_-]?key|token|secret|password)\s*[:=]\s*['\"]?[^\s'\"]{8,}"),
]

DEFAULT_GLOBAL_SETTINGS: Dict[str, Any] = {
    "version": 1,
    "general": {
        "defaultProjectsDir": str(pathlib.Path.home() / "VajraDhirProjects"),
        "startupBehavior": "workbench",  # 'home' | 'workbench' | 'reopen_last'
        "confirmBeforeDelete": True,
        "confirmUnsavedClose": True,
        "telemetryDisabled": True,
        "recentProjects": [],
    },
    "appearance": {
        "theme": "matte_charcoal",  # 'matte_charcoal' | 'high_contrast_dark' | 'neutral_matte_light'
        "density": "standard",  # 'compact' | 'standard' | 'comfortable'
        "uiFontSizePx": 11.5,
        "monoFontSizePx": 11.5,
        "showStatusBar": True,
        "showHotkeyHints": True,
        "reduceMotion": False,
    },
    "navigation": {
        "mousePreset": "blender",  # 'blender' | 'kicad' | 'unity' | 'trackpad'
        "invertScrollZoom": False,
        "zoomToCursor": True,
        "fovDeg": 45,
        "unit": "mm",  # 'mm' | 'mil' | 'nm'
        "gridMm": 0.5,
        "snapRadiusPx": 10,
    },
    "keymap": {
        "preset": "vajra",  # 'vajra' | 'kicad' | 'blender' | 'altium'
        "bindings": {},
    },
    "autosave": {
        "enabled": True,
        "intervalSec": 60,
        "rollingBackupCount": 10,
        "crashRecovery": True,
        "undoCap": 100,
    },
    "performance": {
        "memoryProfile": "laptop_8gb",  # 'laptop_8gb' | 'workstation_16gb'
        "duckdbLimitMb": 256,
        "wasmIdleSec": 5,
        "onDemand3d": True,
        "maxPixelRatio": 1.25,
        "maxWebglContexts": 2,
        "solverRecalc": "debounced",  # 'debounced' | 'manual'
    },
    "eda": {
        "fabProfile": "jlcpcb_4l",
        "stackup": "4l_jlc04161h",
        "bomCurrency": "USD",  # 'INR' | 'USD' | 'EUR'
        "warnNrndEol": True,
    },
    "tools": {
        "kicadCli": "",
        "ngspice": "",
        "renode": "",
        "typst": "",
        "autorouter": "",
        "padne": "",
        "docker": "",
        "ollama": "",
        "pythonVenv": "",
    },
    "agent": {
        "dlpMode": "NDA_AIRGAPPED",  # 'PUBLIC_OPEN' | 'PRIVATE_CLOUD_OK' | 'NDA_AIRGAPPED'
        "agentMode": "copilot",  # 'off' | 'copilot' | 'autonomous'
        "ollamaEndpoint": "http://127.0.0.1:11434",
        "sessionCostCapUsd": 5.0,
        "budgetWarnPct": 80,
        "mcpUrl": "http://127.0.0.1:41900/mcp",
        "pluginDir": ".vd-plugins",
        "pluginPolicy": "ask_first",  # 'ask_first' | 'strict_sandbox'
    },
}

DEFAULT_PROJECT_SETTINGS: Dict[str, Any] = {
    "name": "golden-buck-mcu",
    "revision": "Rev A",
    "author": "Hardware Engineer",
    "organization": "Vajra-Dhir Lab",
    "description": "4-layer USB-C PD 12V to 3.3V synchronous buck converter reference design",
    "license": "CERN-OHL-P-2.0",
    "fabProfileOverride": "",
    "dlpLock": True,
    "dlpClass": "NDA_AIRGAPPED",
    "boardThicknessMm": 1.6,
    "copperWeightOz": "1 oz",
    "surfaceFinish": "ENIG",
    "solderMaskColor": "Matte Black",
}


def _cache_dir() -> pathlib.Path:
    if os.environ.get("VD_CACHE_DIR"):
        return pathlib.Path(os.environ["VD_CACHE_DIR"])
    if os.environ.get("VD_DB_DIR"):
        return pathlib.Path(os.environ["VD_DB_DIR"]) / ".vd-cache"
    return pathlib.Path(".vd-cache")


def _settings_path() -> pathlib.Path:
    return _cache_dir() / "user-settings.json"


def _project_settings_path(project_dir: Optional[pathlib.Path] = None) -> pathlib.Path:
    ws = pathlib.Path(project_dir) if project_dir else _ensure_active_workspace()
    return ws / "project.vd.json"


def _atomic_write_json(path: pathlib.Path, data: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(prefix=".vd_cfg_", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
            json.dump(data, f, indent=2)
            f.write("\n")
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_name, path)
    except Exception:
        if os.path.exists(tmp_name):
            os.remove(tmp_name)
        raise


def _deep_merge(base: Dict[str, Any], patch: Dict[str, Any]) -> Dict[str, Any]:
    out = copy.deepcopy(base)
    for k, v in patch.items():
        if isinstance(v, dict) and isinstance(out.get(k), dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = copy.deepcopy(v)
    return out


def _repo_root() -> pathlib.Path:
    return pathlib.Path(__file__).resolve().parents[3]


def _discover_repo_projects() -> List[Dict[str, Any]]:
    """Discovers built-in hardware designs & fixtures included in the repository."""
    root = _repo_root()
    found: List[Dict[str, Any]] = []
    candidates: List[tuple[str, pathlib.Path, str]] = [
        ("golden-buck-mcu", root / "fixtures" / "golden-buck-mcu", "Reference PCB + SCH"),
    ]
    designs_dir = root / "designs"
    if designs_dir.is_dir():
        for d in sorted(designs_dir.iterdir()):
            if d.is_dir() and (list(d.glob("*.kicad_pcb")) or (d / "README.md").is_file()):
                candidates.append((d.name, d, "Built-in Design"))
    for name, p, kind in candidates:
        if p.is_dir():
            found.append({
                "name": name,
                "kind": kind,
                "path": str(p.relative_to(root)).replace("\\", "/"),
                "lastOpenedUtc": "Included",
            })
    return found


def build_projects_catalog() -> Dict[str, Any]:
    root = _repo_root()
    boards = _discover_repo_projects()
    integrated: List[Dict[str, Any]] = []
    manifest = root / "vendor" / "MANIFEST.json"
    if manifest.is_file():
        try:
            data = json.loads(manifest.read_text(encoding="utf-8"))
            for item in data.get("entries", []):
                nm = str(item.get("name") or "")
                folder_guess = nm.lower()
                in_vendor = any(
                    p.name.lower().startswith(folder_guess.split("-")[0])
                    for p in ((root / "vendor" / "ring1-refs").glob("*") if (root / "vendor" / "ring1-refs").is_dir() else [])
                )
                in_packages = (root / "packages" / folder_guess).is_dir() or (
                    folder_guess == "tracespace" and (root / "packages" / "tracespace-vendor").is_dir()
                )
                integrated.append({
                    "name": nm,
                    "license": item.get("license", "MIT/Apache-2.0"),
                    "class": item.get("class", "ring1-dep"),
                    "purpose": item.get("purpose", ""),
                    "present": bool(in_vendor or in_packages),
                    "location": "packages/" if in_packages else ("vendor/ring1-refs/" if in_vendor else "sync via `pnpm setup:projects`"),
                })
        except Exception:
            pass
    return {
        "boards": boards,
        "integrated_projects": integrated,
        "synced_count": sum(1 for x in integrated if x["present"]),
        "total_manifest_count": len(integrated),
    }


def open_project_on_disk(req: Dict[str, Any], con: Optional[sqlite3.Connection] = None) -> Dict[str, Any]:
    raw_path = str(req.get("path") or "").strip()
    root = _repo_root()
    target = pathlib.Path(raw_path)
    if not target.is_absolute():
        target = (root / raw_path).resolve()
    if not target.is_dir():
        return {"opened": False, "error": "PROJECT_DIR_NOT_FOUND", "path": str(target)}
    pcbs = sorted(target.glob("*.kicad_pcb"))
    schs = sorted(target.glob("*.kicad_sch"))
    pcb_p = pcbs[0] if pcbs else (target / f"{target.name}.kicad_pcb")
    sch_p = schs[0] if schs else (target / f"{target.name}.kicad_sch")

    _ACTIVE_STATE["project_dir"] = str(target)
    _ACTIVE_STATE["pcb_path"] = str(pcb_p)
    _ACTIVE_STATE["sch_path"] = str(sch_p)
    _ACTIVE_STATE["last_pcb_sha256"] = sha256_text(pcb_p.read_text(encoding="utf-8")) if pcb_p.is_file() else ""
    _ACTIVE_STATE["last_sch_sha256"] = sha256_text(sch_p.read_text(encoding="utf-8")) if sch_p.is_file() else ""
    _ACTIVE_STATE["revision"] = int(_ACTIVE_STATE.get("revision") or 1) + 1

    if con is not None:
        if sch_p.is_file():
            try:
                sync_kicad_sch_to_hwir(con, sch_p, actor_kind="human", echo_ring=_BRIDGE.echo_ring)
            except Exception:
                pass
        if pcb_p.is_file():
            try:
                sync_kicad_pcb_to_hwir(con, pcb_p, actor_kind="human", echo_ring=_BRIDGE.echo_ring)
            except Exception:
                pass

    cfg = load_global_settings()
    rel_or_abs = str(req.get("path") or target)
    recents = [r for r in (cfg["general"].get("recentProjects") or []) if isinstance(r, dict) and r.get("path") != rel_or_abs]
    recents.insert(0, {
        "name": target.name,
        "kind": str(req.get("kind") or "KiCad / HW-IR"),
        "path": rel_or_abs,
        "lastOpenedUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })
    save_global_settings({"general": {"recentProjects": recents[:12], "recentSeeded": True}})
    return {"opened": True, "name": target.name, "path": str(target), "pcb": str(pcb_p) if pcb_p.is_file() else ""}


def load_global_settings() -> Dict[str, Any]:
    p = _settings_path()
    if p.is_file():
        try:
            raw = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                merged = _deep_merge(DEFAULT_GLOBAL_SETTINGS, raw)
                if not merged["general"].get("recentProjects") and not merged["general"].get("recentSeeded"):
                    merged["general"]["recentProjects"] = _discover_repo_projects()
                return merged
        except Exception:
            pass
    fresh = copy.deepcopy(DEFAULT_GLOBAL_SETTINGS)
    fresh["general"]["recentProjects"] = _discover_repo_projects()
    return fresh


def save_global_settings(patch: Dict[str, Any], replace: bool = False) -> Dict[str, Any]:
    current = copy.deepcopy(DEFAULT_GLOBAL_SETTINGS) if replace else load_global_settings()
    merged = _deep_merge(current, patch)
    _atomic_write_json(_settings_path(), merged)
    return merged


def reset_global_settings() -> Dict[str, Any]:
    fresh = copy.deepcopy(DEFAULT_GLOBAL_SETTINGS)
    _atomic_write_json(_settings_path(), fresh)
    return fresh


def load_project_settings() -> Dict[str, Any]:
    p = _project_settings_path()
    if p.is_file():
        try:
            raw = json.loads(p.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                return _deep_merge(DEFAULT_PROJECT_SETTINGS, raw)
        except Exception:
            pass
    return copy.deepcopy(DEFAULT_PROJECT_SETTINGS)


def save_project_settings(patch: Dict[str, Any]) -> Dict[str, Any]:
    current = load_project_settings()
    merged = _deep_merge(current, patch)
    _atomic_write_json(_project_settings_path(), merged)
    return merged


def create_project_on_disk(req: Dict[str, Any]) -> Dict[str, Any]:
    name = re.sub(r"[^a-zA-Z0-9._-]+", "-", str(req.get("name") or "untitled-board")).strip("-") or "untitled-board"
    loc_raw = str(req.get("location") or "").strip()
    base_dir = pathlib.Path(loc_raw) if loc_raw else pathlib.Path(load_global_settings()["general"]["defaultProjectsDir"])
    project_dir = (base_dir / name).resolve()
    project_dir.mkdir(parents=True, exist_ok=True)

    starter_kind = str(req.get("starter") or "blank")
    fab_preset = str(req.get("fab_preset") or "jlcpcb_4l")
    dlp_class = str(req.get("dlp_class") or "NDA_AIRGAPPED")

    proj_meta = _deep_merge(
        DEFAULT_PROJECT_SETTINGS,
        {
            "name": name,
            "fabProfileOverride": fab_preset,
            "dlpClass": dlp_class,
            "starterKind": starter_kind,
            "createdAtUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        },
    )
    _atomic_write_json(project_dir / "project.vd.json", proj_meta)

    sys_yaml = project_dir / "system.yaml"
    if not sys_yaml.exists():
        sys_yaml.write_text(
            f'project: "{name}"\nversion: "0.0.2"\npurpose: "{starter_kind} hardware design"\nblocks: []\nbuses: []\n',
            encoding="utf-8",
        )

    if starter_kind in ("blank_2l", "blank_4l", "buck_pd", "stm32_can", "esp32_sensor", "rpi_hat"):
        layers = 2 if starter_kind == "blank_2l" else 4
        pcb_file = project_dir / f"{name}.kicad_pcb"
        if not pcb_file.exists():
            pcb_file.write_text(
                f'(kicad_pcb (version 20261030) (generator "vajra-dhir-eda") (generator_version "0.0.2")\n'
                f'  (general (thickness 1.6) (copper_layers {layers}))\n'
                f'  (gr_rect (start 0 0) (end 80 50) (stroke (width 0.15)) (layer "Edge.Cuts"))\n)\n',
                encoding="utf-8",
            )

    # Record in recentProjects atomically
    cfg = load_global_settings()
    recents: List[Dict[str, Any]] = [
        r for r in (cfg["general"].get("recentProjects") or [])
        if isinstance(r, dict) and r.get("path") != str(project_dir)
    ]
    recents.insert(0, {
        "name": name,
        "kind": starter_kind,
        "path": str(project_dir),
        "lastOpenedUtc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    })
    save_global_settings({"general": {"recentProjects": recents[:12]}})

    return {"created": True, "name": name, "path": str(project_dir), "project": proj_meta}


def _scrub_secrets(obj: Any) -> Any:
    if isinstance(obj, dict):
        out: Dict[str, Any] = {}
        for k, v in obj.items():
            if any(tok in k.lower() for tok in ("secret", "token", "password", "api_key", "apikey", "credential")):
                out[k] = "[REDACTED]"
            else:
                out[k] = _scrub_secrets(v)
        return out
    if isinstance(obj, list):
        return [_scrub_secrets(i) for i in obj]
    if isinstance(obj, str):
        txt = obj
        for pat in SECRET_PATTERNS:
            txt = pat.sub("[REDACTED]", txt)
        return txt
    return obj


def build_diagnostic_bundle(con: Optional[sqlite3.Connection] = None) -> Dict[str, Any]:
    tools = probe_tool_manager_status()
    settings = load_global_settings()
    proj = load_project_settings()
    rev = 0
    if con is not None:
        try:
            row = con.execute("SELECT rev_lamport FROM projects LIMIT 1").fetchone()
            if row:
                rev = int(row[0])
        except Exception:
            pass
    bundle = {
        "app": "Vajra-Dhir EDA",
        "version": "0.0.3",
        "generated_at_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "platform": {
            "system": platform.system(),
            "release": platform.release(),
            "python": platform.python_version(),
        },
        "hw_ir_rev_lamport": rev,
        "tools": tools,
        "settings": settings,
        "project_settings": proj,
    }
    return _scrub_secrets(bundle)


def _send_json(handler: Any, status: int, body: Any) -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler._send_cors()
    handler.end_headers()
    handler.wfile.write(json.dumps(body).encode("utf-8"))


def handle_settings_get(handler: Any, path: str, full_path: str = "", con: Optional[sqlite3.Connection] = None) -> bool:
    if path == "/api/v1/settings":
        _send_json(handler, 200, load_global_settings())
        return True
    if path == "/api/v1/settings/export":
        _send_json(handler, 200, _scrub_secrets(load_global_settings()))
        return True
    if path == "/api/v1/project/settings":
        _send_json(handler, 200, load_project_settings())
        return True
    if path == "/api/v1/system/diagnostics-bundle":
        _send_json(handler, 200, build_diagnostic_bundle(con))
        return True
    if path == "/api/v1/projects/catalog":
        _send_json(handler, 200, build_projects_catalog())
        return True
    return False


def handle_settings_put(handler: Any, path: str, req: Dict[str, Any], con: Optional[sqlite3.Connection] = None) -> bool:
    if path == "/api/v1/settings":
        saved = save_global_settings(req if isinstance(req, dict) else {})
        _send_json(handler, 200, saved)
        return True
    if path == "/api/v1/project/settings":
        saved = save_project_settings(req if isinstance(req, dict) else {})
        _send_json(handler, 200, saved)
        return True
    return False


def handle_settings_post(handler: Any, path: str, req: Dict[str, Any], con: Optional[sqlite3.Connection] = None) -> bool:
    if path == "/api/v1/settings/reset":
        _send_json(handler, 200, reset_global_settings())
        return True
    if path == "/api/v1/settings/import":
        if not isinstance(req, dict):
            _send_json(handler, 400, {"error": "INVALID_SETTINGS_PAYLOAD"})
            return True
        saved = save_global_settings(req, replace=True)
        _send_json(handler, 200, saved)
        return True
    if path == "/api/v1/project/create":
        res = create_project_on_disk(req if isinstance(req, dict) else {})
        _send_json(handler, 200, res)
        return True
    if path == "/api/v1/projects/open":
        res = open_project_on_disk(req if isinstance(req, dict) else {}, con=con)
        _send_json(handler, 200 if res.get("opened") else 404, res)
        return True
    return False
