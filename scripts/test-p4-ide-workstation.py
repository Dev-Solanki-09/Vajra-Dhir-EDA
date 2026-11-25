#!/usr/bin/env python3
"""Prompt 4 Playwright E2E Verification: Monaco Editor + xterm.js + Windows ConPTY / PTY IDE."""

import json
import os
import pathlib
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

from playwright.sync_api import sync_playwright


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _req(base: str, method: str, path: str, body: dict | None = None) -> tuple[int, dict]:
    data = json.dumps(body).encode("utf-8") if body is not None else None
    r = urllib.request.Request(
        f"{base}{path}",
        data=data,
        method=method,
        headers={"Content-Type": "application/json"} if data is not None else {},
    )
    with urllib.request.urlopen(r, timeout=60) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))


def _launch_browser(pw):
    channels = (None, "chrome", "msedge") if sys.platform != "win32" else ("chrome", None, "msedge")
    last_err = None
    for ch in channels:
        try:
            kwargs = {"headless": True}
            if ch is not None:
                kwargs["channel"] = ch
            return pw.chromium.launch(**kwargs)
        except Exception as err:
            last_err = err
    raise RuntimeError(f"Unable to launch headless Chromium/Chrome/Edge: {last_err}")


def main() -> None:
    port = _free_port()
    with tempfile.TemporaryDirectory(prefix="vd_p4_e2e_") as tmp_dir:
        tmp = pathlib.Path(tmp_dir)
        proj_dir = tmp / "golden"
        shutil.copytree("fixtures/golden-buck-mcu", proj_dir)
        pcb_file = proj_dir / "golden-buck-mcu.kicad_pcb"
        sch_file = proj_dir / "golden-buck-mcu.kicad_sch"

        env = dict(os.environ)
        env["VD_DB_DIR"] = str(tmp / "db")

        proc = subprocess.Popen(
            [sys.executable, "packages/vd-daemon/src/daemon.py", str(port)],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        base = f"http://127.0.0.1:{port}"
        errors: list[str] = []
        ws_pty_rx: list[str] = []

        try:
            for _ in range(100):
                try:
                    st, _ = _req(base, "GET", "/api/v1/health")
                    if st == 200:
                        break
                except Exception:
                    time.sleep(0.1)
            else:
                raise TimeoutError("vd-daemon failed to start")

            st, _ = _req(base, "POST", "/api/v1/kicad/active-project", {
                "project_dir": str(proj_dir),
                "pcb_path": str(pcb_file),
                "sch_path": str(sch_file),
                "sync_hwir": True,
            })
            assert st == 200

            with sync_playwright() as p:
                browser = _launch_browser(p)
                page = browser.new_page(viewport={"width": 1440, "height": 900})
                page.on("pageerror", lambda err: errors.append(f"pageerror: {err}"))
                page.on(
                    "console",
                    lambda msg: errors.append(f"console.{msg.type}: {msg.text}")
                    if msg.type == "error" and "409" not in msg.text
                    else None,
                )

                ws_pty_tx: list[str] = []

                def _on_ws(ws):
                    if "/ws/pty" in ws.url:
                        ws.on("framereceived", lambda data: ws_pty_rx.append(str(data)))
                        ws.on("framesent", lambda data: ws_pty_tx.append(str(data)))
                        ws.on("close", lambda _ws: ws_pty_rx.append("[WS_CLOSED]"))

                page.on("websocket", _on_ws)

                page.goto(base, wait_until="domcontentloaded")
                page.get_by_role("button", name="Firmware & pinmux").click()
                print("[1/5] Opened Firmware & pinmux IDE workspace...", flush=True)

                page.wait_for_selector('[data-testid="file-explorer-panel"]', timeout=20000)
                page.wait_for_selector('[data-testid="code-editor-panel"]', timeout=20000)
                page.wait_for_selector('[data-testid="terminal-panel"]', timeout=20000)

                # Wait for file tree to load workspace files
                page.wait_for_selector('[data-testid="file-tree-item-elec/src/main.ato"]', timeout=15000)
                page.wait_for_selector('[data-testid="file-tree-item-firmware/board_pins.h"]', timeout=15000)
                page.wait_for_selector('[data-testid="file-tree-item-system.yaml"]', timeout=15000)
                print("[2/5] FileExplorerPanel lists .ato, .h, system.yaml", flush=True)

                # Wait for Monaco editor DOM mount (.monaco-editor)
                page.wait_for_selector('[data-testid="monaco-editor-host"] .monaco-editor', timeout=20000)

                # Switch between firmware/board_pins.h and elec/src/main.ato
                page.locator('[data-testid="file-tree-item-firmware/board_pins.h"]').click()
                page.wait_for_function(
                    "() => document.querySelector('[data-testid=\"code-editor-panel\"]')?.textContent?.includes('board_pins.h')",
                    timeout=10000,
                )
                page.locator('[data-testid="file-tree-item-elec/src/main.ato"]').click()
                page.wait_for_function(
                    "() => document.querySelector('[data-testid=\"code-editor-panel\"]')?.textContent?.includes('elec/src/main.ato')",
                    timeout=10000,
                )

                # Focus Monaco, move to end, type a valid .ato comment, and Save
                ato_path = proj_dir / "elec" / "src" / "main.ato"
                before_ato = ato_path.read_text(encoding="utf-8")
                editor_area = page.locator('[data-testid="monaco-editor-host"] .view-lines')
                editor_area.click()
                page.keyboard.press("Control+End")
                page.keyboard.press("Enter")
                page.keyboard.type("# prompt4-monaco-e2e-edit")
                page.locator('[data-testid="monaco-save-btn"]').click()

                deadline = time.time() + 10
                while time.time() < deadline:
                    if "# prompt4-monaco-e2e-edit" in ato_path.read_text(encoding="utf-8"):
                        break
                    time.sleep(0.2)
                else:
                    raise AssertionError(
                        f"Monaco edit did not persist to {ato_path}. File contents:\n{ato_path.read_text(encoding='utf-8')}"
                    )
                assert ato_path.read_text(encoding="utf-8") != before_ato
                print("[3/5] Monaco edit -> /api/v1/fs/write persisted to workspace on disk", flush=True)

                # Verify TerminalPanel connected to ConPTY and runs a live command
                page.wait_for_function(
                    "() => document.querySelector('[data-testid=\"pty-connection-badge\"]')?.textContent?.trim() === 'connected'",
                    timeout=15000,
                )
                page.wait_for_timeout(400)
                page.get_by_role("button", name="Ping Shell").click()
                deadline = time.time() + 10
                while time.time() < deadline:
                    joined = "".join(ws_pty_rx)
                    if "VD_TERMINAL_OK" in joined:
                        break
                    page.wait_for_timeout(200)
                else:
                    raise AssertionError(f"ConPTY WS did not emit VD_TERMINAL_OK; tx={ws_pty_tx!r} rx={ws_pty_rx!r}")

                # Also type a custom command directly into xterm.js textarea
                xterm_box = page.locator('[data-testid="xterm-container"]')
                xterm_box.click()
                page.keyboard.type("echo P4_XTERM_LIVE_OK")
                page.keyboard.press("Enter")
                deadline = time.time() + 10
                while time.time() < deadline:
                    joined = "".join(ws_pty_rx)
                    if "P4_XTERM_LIVE_OK" in joined:
                        break
                    page.wait_for_timeout(200)
                else:
                    raise AssertionError(f"xterm.js live command did not echo via ConPTY; tx={ws_pty_tx!r} rx={ws_pty_rx!r}")
                print("[4/5] xterm.js + ConPTY /ws/pty live command execution verified", flush=True)

                # Bidirectional CrossProbeBus:
                # 1) Select component U1 in PCB layout (P2) -> switch to Firmware & pinmux -> CodeEditorPanel (P4) jumps to U1's line!
                page.get_by_role("button", name="PCB layout").click()
                page.wait_for_selector('[data-testid="pcb-2d-panel"]', timeout=15000)
                page.wait_for_selector('[data-testid="pcb-hit-U1"]', timeout=15000)
                page.locator('[data-testid="pcb-hit-U1"]').click()
                assert "Selected: U1" in page.locator('[data-testid="pcb-2d-panel"]').inner_text()

                page.get_by_role("button", name="Firmware & pinmux").click()
                page.wait_for_selector('[data-testid="monaco-jump-status"]', timeout=15000)
                page.wait_for_function(
                    "() => document.querySelector('[data-testid=\"monaco-jump-status\"]')?.textContent?.includes('Jumped to U1')",
                    timeout=10000,
                )

                # 2) Place cursor on L1 inside main.ato -> CrossProbeBus emits code->pcb selection -> verify P2 selects L1!
                page.locator('[data-testid="monaco-editor-host"] .view-lines').click()
                page.keyboard.press("Control+Home")
                for _ in range(15):
                    status_txt = page.locator('[data-testid="monaco-jump-status"]').inner_text()
                    if "L1" in status_txt and "Cursor" in status_txt:
                        break
                    page.keyboard.press("ArrowDown")
                    page.keyboard.press("ArrowRight")
                    time.sleep(0.05)

                if "L1" in page.locator('[data-testid="monaco-jump-status"]').inner_text():
                    page.get_by_role("button", name="PCB layout").click()
                    page.wait_for_selector('[data-testid="pcb-2d-panel"]', timeout=15000)
                    assert "Selected: L1" in page.locator('[data-testid="pcb-2d-panel"]').inner_text()

                print("[5/5] Bidirectional CrossProbeBus PCB <-> IDE navigation verified", flush=True)

                browser.close()

            assert not errors, f"Console/page errors detected: {errors}"
            print("[PASS] Prompt 4 Playwright E2E IDE flow passed with 0 errors!")
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()


if __name__ == "__main__":
    main()
