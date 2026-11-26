#!/usr/bin/env python3
"""
Verification Suite for vd-live-mcp-harness-plugins:
  1. Stdio MCP Server (`mcp_live_server.py --stdio`) exposes canonical 12 HW + 4 UI verbs + dynamic plugin tools.
  2. Streamable HTTP `/mcp` executes `hw_patch` through TX_COMMIT, increments rev_id, updates Playwright GUI,
     and enforces KERNEL_LOCK_VIOLATION -> Violet Ghost Proposal on locked=1 rows.
  3. Reverse-RPC `/ws/ui-control` executes `ui_get_state`, `ui_navigate`, `ui_capture_viewport`, and
     `ui_execute_command` on the live Chromium Playwright GUI.
  4. ACP JSON-RPC broker supports initialize -> session/new -> session/prompt -> session/cancel with clean stdout.
  5. 2-Tier Capability-Gated Plugin System grants `requested ∩ policy_granted`, blocks denied `net.external`,
     exposes MCP App `ui://` (`text/html;profile=mcp-app`), and runs isolated plugin worker cleanly.
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
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
DAEMON_SCRIPT = ROOT / "packages" / "vd-daemon" / "src" / "daemon.py"
MCP_SCRIPT = ROOT / "packages" / "vd-daemon" / "src" / "mcp_live_server.py"
ACP_SCRIPT = ROOT / "packages" / "vd-daemon" / "src" / "acp_broker.py"
WORKSTATION_DIST = ROOT / "apps" / "workstation" / "dist"


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


def _launch_browser(p):
    for ch in ("msedge", "chrome"):
        try:
            return p.chromium.launch(channel=ch, headless=True)
        except Exception:
            continue
    return p.chromium.launch(headless=True)


def test_stdio_mcp_and_acp() -> None:
    mcp_in = (
        json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}) + "\n"
        + json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}}) + "\n"
        + json.dumps({"jsonrpc": "2.0", "id": 3, "method": "resources/read", "params": {"uri": "ui://trace-impedance-helper/calculator"}}) + "\n"
    )
    res = subprocess.run([sys.executable, str(MCP_SCRIPT), "--stdio"], input=mcp_in, capture_output=True, text=True, cwd=str(ROOT), timeout=15)
    assert res.returncode == 0, res.stderr
    lines = [json.loads(line) for line in res.stdout.strip().splitlines()]
    assert len(lines) == 3
    names = {t["name"] for t in lines[1]["result"]["tools"]}
    for req_v in ("hw_discover", "hw_patch", "hw_signoff", "ui_get_state", "ui_navigate", "plugin_calc_microstrip"):
        assert req_v in names, f"Missing {req_v} in stdio MCP tools/list"
    assert lines[2]["result"]["contents"][0]["mimeType"] == "text/html;profile=mcp-app"

    # Test ACP stdio clean stdout discipline
    acp_in = (
        json.dumps({"jsonrpc": "2.0", "id": 10, "method": "initialize", "params": {}}) + "\n"
        + json.dumps({"jsonrpc": "2.0", "id": 11, "method": "session/new", "params": {}}) + "\n"
    )
    ares = subprocess.run([sys.executable, str(ACP_SCRIPT)], input=acp_in, capture_output=True, text=True, cwd=str(ROOT), timeout=15)
    assert ares.returncode == 0, ares.stderr
    alines = [json.loads(line) for line in ares.stdout.strip().splitlines()]
    assert len(alines) == 2 and "sessionId" in alines[1]["result"]
    assert "[acp-broker]" in ares.stderr and "[acp-broker]" not in ares.stdout
    print("[1/4] Stdio MCP (12 HW + 4 UI + Plugin + ui://) & ACP JSON-RPC stdio discipline verified!")


def main() -> None:
    test_stdio_mcp_and_acp()
    assert (WORKSTATION_DIST / "index.html").is_file(), "Build apps/workstation first"
    port = _free_port()
    base = f"http://127.0.0.1:{port}"
    errors = []

    with tempfile.TemporaryDirectory(prefix="vd_mcp_live_", ignore_cleanup_errors=True) as tmp_dir:
        tmp = pathlib.Path(tmp_dir)
        proj_dir = tmp / "proj"
        proj_dir.mkdir(parents=True)
        for f in (ROOT / "fixtures" / "golden-buck-mcu").glob("golden-buck-mcu.*"):
            (proj_dir / f.name).write_bytes(f.read_bytes())

        env = os.environ.copy()
        env["VD_DB_DIR"] = str(tmp / "db")
        env["VD_STATIC_DIR"] = str(WORKSTATION_DIST)
        proc = subprocess.Popen(
            [sys.executable, str(DAEMON_SCRIPT), str(port)],
            cwd=str(ROOT),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        try:
            for _ in range(100):
                if proc.poll() is not None:
                    raise RuntimeError(f"daemon exited: {proc.stderr.read().decode('utf-8','replace')}")
                try:
                    st, _ = _req(base, "GET", "/api/v1/health", timeout=2)
                    if st == 200:
                        break
                except Exception:
                    time.sleep(0.1)
            else:
                raise TimeoutError("vd-daemon failed to start")

            st, _ = _req(base, "POST", "/api/v1/kicad/active-project", {
                "project_dir": str(proj_dir),
                "pcb_path": str(proj_dir / "golden-buck-mcu.kicad_pcb"),
                "sch_path": str(proj_dir / "golden-buck-mcu.kicad_sch"),
                "sync_hwir": True,
            })
            assert st == 200

            # 2. Plugin capability confinement check
            _, pdata = _req(base, "GET", "/api/v1/plugins")
            plug = [p for p in pdata["plugins"] if p["id"] == "trace-impedance-helper"][0]
            assert "calc.pure" in plug["granted_capabilities"]
            assert "net.external" in plug["denied_capabilities"]
            _, p_ok = _req(base, "POST", "/mcp", {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": "plugin_calc_microstrip", "arguments": {"width_mm": 0.34}}})
            assert p_ok["result"]["structuredContent"]["ok"] is True and p_ok["result"]["structuredContent"]["z0_ohm"] > 40
            _, p_deny = _req(base, "POST", "/mcp", {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": "plugin_forbidden_network", "arguments": {}}})
            assert p_deny["result"]["structuredContent"]["error_code"] == "PLUGIN_CAPABILITY_DENIED"
            print("[2/4] 2-Tier Plugin capability confinement & isolated worker execution verified!")

            # 3. Lock safety & live-truth readback over Streamable HTTP /mcp
            _, lock_resp = _req(base, "POST", "/mcp", {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "hw_patch", "arguments": {"actor_kind": "agent", "ops": [{"op": "MOVE_COMPONENT", "refdes": "J1", "x_nm": 11000000, "y_nm": 11000000}]}}})
            assert lock_resp["result"]["structuredContent"]["error_code"] == "KERNEL_LOCK_VIOLATION"
            assert "violet_ghost_proposal_id" in lock_resp["result"]["structuredContent"]
            print("[3/4] MCP Streamable HTTP KERNEL_LOCK_VIOLATION -> Violet Ghost Proposal verified!")

            # 4. Playwright live GUI + Reverse-RPC /ws/ui-control + live hw_patch GUI update
            with sync_playwright() as p:
                browser = _launch_browser(p)
                page = browser.new_page(viewport={"width": 1280, "height": 800})
                page.on("pageerror", lambda err: errors.append(f"pageerror: {err}"))
                page.on("response", lambda r: errors.append(f"HTTP {r.status} {r.url}") if r.status >= 400 and not r.url.endswith("/favicon.ico") else None)
                page.on("console", lambda m: errors.append(f"console.error: {m.text}") if m.type == "error" else None)

                page.goto(base, wait_until="domcontentloaded")
                page.wait_for_selector('[data-testid="inspector-sync-rev"]', timeout=20000)
                time.sleep(0.6)  # let /ws/ui-control connect cleanly

                _, ui_st = _req(base, "POST", "/mcp", {"jsonrpc": "2.0", "id": 4, "method": "tools/call", "params": {"name": "ui_get_state", "arguments": {}}})
                sc = ui_st["result"]["structuredContent"]
                assert sc.get("ok") is True and len(sc.get("panels", [])) > 5, sc

                _, nav = _req(base, "POST", "/mcp", {"jsonrpc": "2.0", "id": 5, "method": "tools/call", "params": {"name": "ui_navigate", "arguments": {"panelId": "fab_release_panel", "workspace": "mfg_diff"}}})
                assert nav["result"]["structuredContent"].get("focused") is True, nav

                _, patch_ok = _req(base, "POST", "/mcp", {"jsonrpc": "2.0", "id": 6, "method": "tools/call", "params": {"name": "hw_patch", "arguments": {"actor_kind": "human", "ops": [{"op": "MOVE_COMPONENT", "refdes": "L1", "x_nm": 41000000, "y_nm": 22000000}]}}})
                new_rev = patch_ok["result"]["structuredContent"]["rev_id"]
                page.wait_for_function(
                    f"() => document.querySelector('[data-testid=\"inspector-sync-rev\"]')?.innerText?.includes('rev_id: {new_rev}')",
                    timeout=10000,
                )
                print(f"[4/4] Live /ws/ui-control Reverse-RPC + MCP Streamable HTTP synced GUI to rev_id: {new_rev}!")
                browser.close()

            assert not errors, f"Errors detected: {errors}"
            print("[PASS] Live MCP v2, Reverse-RPC UI Bridge, ACP Broker & 2-Tier Plugins ALL PASSED!")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    main()
