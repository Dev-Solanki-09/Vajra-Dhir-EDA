#!/usr/bin/env python3
"""
Phase 6 Suite 4: Hermes Core, Progressive SKILL.md, Deferred Plugin MCP Discovery & ACP E2E Verification.
"""

from __future__ import annotations

import json
import os
import pathlib
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
DAEMON_SCRIPT = ROOT / "packages" / "vd-daemon" / "src" / "daemon.py"
MCP_SCRIPT = ROOT / "packages" / "vd-daemon" / "src" / "mcp_live_server.py"
ACP_SCRIPT = ROOT / "packages" / "vd-daemon" / "src" / "acp_broker.py"


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _req(base: str, method: str, path: str, body=None, timeout: int = 30):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"Content-Type": "application/json"} if body is not None else {}
    req = urllib.request.Request(f"{base}{path}", data=data, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.status, json.loads(r.read().decode("utf-8"))


def main() -> None:
    # 1. MCP stdio server & Deferred plugin discovery
    mcp_in = (
        json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}) + "\n"
        + json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}) + "\n"
        + json.dumps({"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "hw_discover", "arguments": {"query": "buck"}}}) + "\n"
    )
    res = subprocess.run([sys.executable, str(MCP_SCRIPT), "--stdio"], input=mcp_in, capture_output=True, text=True, cwd=str(ROOT), timeout=15)
    assert res.returncode == 0, res.stderr
    lines = [json.loads(line) for line in res.stdout.strip().splitlines()]
    tools = lines[1]["result"]["tools"]
    plugin_tools = [t for t in tools if t.get("defer_loading") is True]
    assert len(plugin_tools) >= 1, f"Expected deferred plugin tools from .vd-plugins/Vajra-Dhir-Packs, got {tools}"
    discover_sc = lines[2]["result"]["structuredContent"]
    assert len(discover_sc.get("plugin_tools") or []) >= 1
    print(f"[1/3] MCP stdio + {len(plugin_tools)} defer_loading plugin tool(s) verified!")

    # 2. ACP JSON-RPC clean stdout
    acp_in = (
        json.dumps({"jsonrpc": "2.0", "id": 10, "method": "initialize", "params": {}}) + "\n"
        + json.dumps({"jsonrpc": "2.0", "id": 11, "method": "session/new", "params": {}}) + "\n"
    )
    ares = subprocess.run([sys.executable, str(ACP_SCRIPT)], input=acp_in, capture_output=True, text=True, cwd=str(ROOT), timeout=15)
    assert ares.returncode == 0 and "[acp-broker]" not in ares.stdout
    print("[2/3] ACP JSON-RPC broker stdio discipline verified!")

    # 3. Live daemon Hermes progressive skills + OWASP defaults + Dual-Context Auditor
    port = _free_port()
    base = f"http://127.0.0.1:{port}"
    with tempfile.TemporaryDirectory(prefix="vd_agent_mcp_e2e_", ignore_cleanup_errors=True) as tmp_dir:
        tmp = pathlib.Path(tmp_dir)
        proj_dir = tmp / "proj"
        proj_dir.mkdir(parents=True)
        for f in (ROOT / "fixtures" / "golden-buck-mcu").glob("golden-buck-mcu.*"):
            (proj_dir / f.name).write_bytes(f.read_bytes())

        env = os.environ.copy()
        env["VD_DB_DIR"] = str(tmp / "db")
        env["VD_DATA_DIR"] = str(tmp / "runtime")
        env["VD_OFFLINE"] = "1"
        proc = subprocess.Popen(
            [sys.executable, str(DAEMON_SCRIPT), "--port", str(port), "--project-dir", str(proj_dir)],
            cwd=str(ROOT),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        try:
            for _ in range(40):
                try:
                    c, _ = _req(base, "GET", "/api/health", timeout=2)
                    if c == 200:
                        break
                except Exception:
                    time.sleep(0.25)

            c, sk = _req(base, "GET", "/api/v1/agent/skills")
            assert c == 200 and sk.get("skills_write_approval") is True and len(sk.get("skills") or []) >= 6
            c, prov = _req(base, "GET", "/api/v1/agent/providers")
            assert c == 200 and prov["settings"]["memory_write_approval"] is True
            c, plug = _req(base, "GET", "/api/v1/plugins")
            assert c == 200 and len(plug.get("plugins") or []) >= 1
            print(f"[3/3] Live daemon OWASP defaults, {len(sk['skills'])} skills & {len(plug['plugins'])} plugins verified!")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()

    print("PASSED: test-agent-mcp-plugins-e2e.py")


if __name__ == "__main__":
    main()
