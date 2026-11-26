"""
2-Tier Capability-Gated Plugin Host for Vajra-Dhīr EDA.
Discovers plugins under .vd-plugins/<plugin-id>/vd-plugin.json (or project workspace/.vd-plugins).
Enforces granted = requested ∩ policy_granted, dynamically exposes plugin MCP tools,
CommandBus commands, and ui:// panel definitions, and emits notifications/tools/list_changed.
"""

from __future__ import annotations

import json
import os
import pathlib
import subprocess
import sys
import threading
import time
from typing import Any, Callable, Dict, List, Optional

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[3]
_POLICY_ALLOWED_CAPS = frozenset({
    "hw.inspect",
    "hw.verify",
    "ui.panel",
    "command.register",
    "calc.pure",
})

_PLUGIN_LOCK = threading.RLock()
_PLUGINS: Dict[str, Dict[str, Any]] = {}
_LIST_CHANGED_LISTENERS: List[Callable[[], None]] = []


def register_tools_changed_listener(cb: Callable[[], None]) -> None:
    with _PLUGIN_LOCK:
        if cb not in _LIST_CHANGED_LISTENERS:
            _LIST_CHANGED_LISTENERS.append(cb)


def _emit_tools_list_changed() -> None:
    with _PLUGIN_LOCK:
        listeners = list(_LIST_CHANGED_LISTENERS)
    for cb in listeners:
        try:
            cb()
        except Exception:
            pass


def validate_plugin_manifest(manifest: Dict[str, Any], policy_allowed: Optional[frozenset] = None) -> Dict[str, Any]:
    allowed = policy_allowed if policy_allowed is not None else _POLICY_ALLOWED_CAPS
    pid = str(manifest.get("id") or "").strip()
    runtime = str(manifest.get("runtime") or "").strip()
    if not pid or runtime not in ("wasm", "python-worker", "ui-app"):
        raise ValueError(f"Invalid vd-plugin.json id='{pid}' runtime='{runtime}'")
    requested = [str(c) for c in (manifest.get("capabilities") or [])]
    granted = [c for c in requested if c in allowed]
    denied = [c for c in requested if c not in allowed]
    limits = dict(manifest.get("limits") or {})
    mem_mb = min(int(limits.get("max_memory_mb", 64)), 256)
    timeout_ms = min(int(limits.get("timeout_ms", 5000)), 30000)
    contrib = dict(manifest.get("contributions") or {})
    return {
        "id": pid,
        "version": str(manifest.get("version") or "0.1.0"),
        "runtime": runtime,
        "requested_capabilities": requested,
        "granted_capabilities": granted,
        "denied_capabilities": denied,
        "limits": {"max_memory_mb": mem_mb, "timeout_ms": timeout_ms},
        "contributions": {
            "commands": list(contrib.get("commands") or []),
            "tools": list(contrib.get("tools") or []),
            "panels": list(contrib.get("panels") or []),
        },
        "entrypoint": manifest.get("entrypoint"),
    }


def load_plugin_dir(plugin_dir: pathlib.Path, policy_allowed: Optional[frozenset] = None) -> Dict[str, Any]:
    manifest_path = pathlib.Path(plugin_dir) / "vd-plugin.json"
    if not manifest_path.is_file():
        raise FileNotFoundError(f"Missing vd-plugin.json in {plugin_dir}")
    raw = json.loads(manifest_path.read_text(encoding="utf-8"))
    record = validate_plugin_manifest(raw, policy_allowed=policy_allowed)
    record["plugin_dir"] = str(pathlib.Path(plugin_dir).resolve())
    with _PLUGIN_LOCK:
        _PLUGINS[record["id"]] = record
    _emit_tools_list_changed()
    return record


def scan_plugins(extra_dirs: Optional[List[pathlib.Path]] = None) -> List[Dict[str, Any]]:
    dirs = [_REPO_ROOT / ".vd-plugins"]
    if extra_dirs:
        dirs.extend(extra_dirs)
    loaded: List[Dict[str, Any]] = []
    for root in dirs:
        if not root.is_dir():
            continue
        for sub in sorted(root.iterdir()):
            if sub.is_dir() and (sub / "vd-plugin.json").is_file():
                try:
                    loaded.append(load_plugin_dir(sub))
                except Exception:
                    pass
    return loaded


def list_loaded_plugins() -> List[Dict[str, Any]]:
    with _PLUGIN_LOCK:
        return list(_PLUGINS.values())


def get_plugin_mcp_tools() -> List[Dict[str, Any]]:
    tools: List[Dict[str, Any]] = []
    with _PLUGIN_LOCK:
        plugins = list(_PLUGINS.values())
    for p in plugins:
        for t in p["contributions"]["tools"]:
            tname = str(t.get("name") or "")
            if not tname:
                continue
            tools.append({
                "name": tname,
                "description": str(t.get("description") or f"Plugin tool from {p['id']}"),
                "inputSchema": t.get("inputSchema") or {"type": "object", "properties": {}},
                "_plugin_id": p["id"],
            })
    return tools


def get_plugin_ui_resources() -> List[Dict[str, Any]]:
    resources: List[Dict[str, Any]] = []
    with _PLUGIN_LOCK:
        plugins = list(_PLUGINS.values())
    for p in plugins:
        for panel in p["contributions"]["panels"]:
            panel_id = str(panel.get("id") or "main")
            resources.append({
                "uri": f"ui://{p['id']}/{panel_id}",
                "name": str(panel.get("title") or p["id"]),
                "mimeType": "text/html;profile=mcp-app",
                "html": f"<!doctype html><html><body style='background:#141416;color:#E2E8F0;font-family:sans-serif'><h3>{panel.get('title', p['id'])}</h3><p>Plugin {p['id']} v{p['version']} ({p['runtime']}) · Granted: {', '.join(p['granted_capabilities'])}</p></body></html>",
            })
    return resources


def invoke_plugin_tool(tool_name: str, args: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    target_plugin: Optional[Dict[str, Any]] = None
    target_tool: Optional[Dict[str, Any]] = None
    with _PLUGIN_LOCK:
        for p in _PLUGINS.values():
            for t in p["contributions"]["tools"]:
                if t.get("name") == tool_name:
                    target_plugin = p
                    target_tool = t
                    break
            if target_plugin:
                break
    if not target_plugin or not target_tool:
        return None

    required_cap = str(target_tool.get("required_capability") or "calc.pure")
    if required_cap not in target_plugin["granted_capabilities"]:
        return {
            "ok": False,
            "error_code": "PLUGIN_CAPABILITY_DENIED",
            "message": f"Plugin '{target_plugin['id']}' lacks granted capability '{required_cap}'.",
            "granted": target_plugin["granted_capabilities"],
            "denied": target_plugin["denied_capabilities"],
        }

    entry = target_plugin.get("entrypoint")
    if target_plugin["runtime"] == "python-worker" and entry:
        script = pathlib.Path(target_plugin["plugin_dir"]) / str(entry)
        if script.is_file():
            timeout_s = max(0.5, target_plugin["limits"]["timeout_ms"] / 1000.0)
            proc = subprocess.run(
                [sys.executable, str(script)],
                input=json.dumps({"tool": tool_name, "arguments": args}),
                capture_output=True,
                text=True,
                timeout=timeout_s,
                cwd=target_plugin["plugin_dir"],
            )
            if proc.returncode == 0 and proc.stdout.strip():
                try:
                    return json.loads(proc.stdout.strip())
                except Exception:
                    return {"ok": True, "output": proc.stdout.strip()}
            return {"ok": False, "error": proc.stderr.strip() or "Plugin worker failed"}

    return {
        "ok": True,
        "plugin_id": target_plugin["id"],
        "tool": tool_name,
        "granted_capabilities": target_plugin["granted_capabilities"],
        "result": {"echo_args": args, "evidence_source": f"plugin:{target_plugin['id']}"},
    }


def handle_plugin_get(handler: Any, path: str) -> bool:
    if path == "/api/v1/plugins":
        plugins = list_loaded_plugins()
        if not plugins:
            plugins = scan_plugins()
        handler.send_response(200)
        handler.send_header("Content-Type", "application/json")
        handler._send_cors()
        handler.end_headers()
        handler.wfile.write(json.dumps({"plugins": plugins, "resources": get_plugin_ui_resources()}).encode("utf-8"))
        return True
    return False


def handle_plugin_post(handler: Any, path: str, req: Dict[str, Any]) -> bool:
    if path == "/api/v1/plugins/load":
        pdir = pathlib.Path(str(req.get("plugin_dir") or ""))
        try:
            rec = load_plugin_dir(pdir)
            handler.send_response(200)
            body = {"success": True, "plugin": rec, "notification": "notifications/tools/list_changed"}
        except Exception as exc:
            handler.send_response(400)
            body = {"success": False, "error": str(exc)}
        handler.send_header("Content-Type", "application/json")
        handler._send_cors()
        handler.end_headers()
        handler.wfile.write(json.dumps(body).encode("utf-8"))
        return True
    return False
