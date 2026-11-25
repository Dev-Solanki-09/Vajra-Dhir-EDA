"""
G6D Behavioral Verification: 5 Golden E2E Browser Journeys against cold-booted
vd-daemon serving compiled apps/workstation/dist on 127.0.0.1.

Runs sequentially with a single Chromium/Chrome instance for low-spec hosts.
"""

from __future__ import annotations

import os
import pathlib
import socket
import subprocess
import sys
import time
import urllib.request

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def launch_browser(pw):
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


def run() -> None:
    dist_index = ROOT / "apps" / "workstation" / "dist" / "index.html"
    assert dist_index.exists(), f"Workstation dist missing: {dist_index} (build apps/workstation first)"

    port = find_free_port()
    base = f"http://127.0.0.1:{port}"
    env = dict(os.environ)
    env["VD_LLM_PROVIDER"] = "deterministic_offline"
    env["PYTHONUTF8"] = "1"

    proc = subprocess.Popen(
        [sys.executable, str(ROOT / "packages" / "vd-daemon" / "src" / "daemon.py"), str(port)],
        cwd=str(ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    try:
        ready = False
        for _ in range(40):
            try:
                with urllib.request.urlopen(f"{base}/api/v1/health", timeout=2) as resp:
                    if resp.status == 200:
                        ready = True
                        break
            except Exception:
                time.sleep(0.15)
        assert ready, "vd-daemon failed to reach healthy state"

        with sync_playwright() as pw:
            browser = launch_browser(pw)
            context = browser.new_context(viewport={"width": 1366, "height": 840})
            page = context.new_page()

            page_errors: list[str] = []
            console_errors: list[str] = []
            unexpected_http_5xx: list[str] = []

            page.on("pageerror", lambda exc: page_errors.append(str(exc)))
            page.on(
                "console",
                lambda msg: console_errors.append(msg.text)
                if msg.type == "error" and "409" not in msg.text
                else None,
            )
            page.on(
                "response",
                lambda res: unexpected_http_5xx.append(f"{res.status} {res.url}")
                if (res.status >= 500 or (res.status >= 400 and res.status != 409))
                else None,
            )

            page.goto(base, wait_until="networkidle")
            page.wait_for_selector('[data-testid="workstation-viewport"]')

            # Journey 1: Templates, Command Palette (Ctrl+Shift+P), Shortcut Overlay (F1 + Escape)
            page.get_by_role("button", name="New template").click()
            page.get_by_role("dialog", name="New project from template").wait_for(state="visible")
            page.get_by_role("button", name="Buck PD Reference").click()
            page.get_by_role("dialog", name="New project from template").wait_for(state="hidden")

            page.keyboard.press("Control+Shift+P")
            palette_dialog = page.get_by_role("dialog", name="Command palette")
            palette_dialog.wait_for(state="visible")
            palette_dialog.get_by_label("Filter hardware commands").fill("DRC")
            assert palette_dialog.locator("button", has_text="DRC").count() >= 1
            page.keyboard.press("Escape")
            palette_dialog.wait_for(state="hidden")

            page.keyboard.press("F1")
            shortcut_dialog = page.get_by_role("dialog", name="Keyboard shortcuts")
            shortcut_dialog.wait_for(state="visible")
            assert "18 commands" in shortcut_dialog.inner_text()
            page.keyboard.press("Escape")
            shortcut_dialog.wait_for(state="hidden")

            # Journey 2: All 7 workspaces + 4 explicit states + real canvas/SVG/uPlot renders
            canvas_box = page.locator('[data-testid="pcb-engine-canvas"]').bounding_box()
            assert canvas_box and canvas_box["width"] > 100 and canvas_box["height"] > 100, f"Invalid PCB canvas: {canvas_box}"

            for state_name in ("loading", "empty", "error", "full"):
                page.get_by_role("button", name=state_name, exact=True).click()
                page.locator(f'[data-testid="workspace-state-{state_name}"]').wait_for(state="visible")

            # Check schematic (elkjs SVG)
            page.get_by_role("button", name="Schematic capture").click()
            svg_el = page.locator('[data-testid="schematic-elk-svg"]')
            svg_el.wait_for(state="visible")
            svg_el.locator("rect").first.wait_for(state="visible")
            assert svg_el.locator("polyline").count() >= 3, "Expected >=3 laid-out elkjs orthogonal edges"

            # Check sim_lab (uPlot scope)
            page.get_by_role("button", name="Simulation & physics lab").click()
            page.locator('[data-testid="uplot-scope"] canvas').first.wait_for(state="visible")

            # Check remaining workspaces render cleanly
            for ws_label in ("Library & BOM", "Manufacturing & diff", "3D STEP & Gerbers", "Firmware & pinmux"):
                page.get_by_role("button", name=ws_label).click()
                page.locator('[data-testid="workspace-state-full"]').wait_for(state="visible")

            page.get_by_role("button", name="PCB layout").click()

            # Journey 3: CrossProbe sync & live lock truth (U2 locked vs L1 unlocked)
            page.locator("button", has_text="U2 (").first.click()
            assert "U2 human-locked" in page.locator('[data-testid="workstation-viewport"]').inner_text()
            page.locator("button", has_text="L1 (").first.click()
            assert "L1 unlocked" in page.locator('[data-testid="workstation-viewport"]').inner_text()
            footer_text = page.locator("footer.vd-statusbar").inner_text()
            assert "Measured FPS:" in footer_text and "CrossProbe:" in footer_text

            # Journey 4: Agent SSE stream + unlocked accept + fail-closed locked U2 409 conflict
            agent_input = page.get_by_label("Ask AI Agent")
            agent_input.fill("Move L1 +1.00mm X")
            page.locator("form button[type='submit']").click()
            card_l1 = page.locator('[data-testid="proposal-card-L1"]').first
            card_l1.wait_for(state="visible")
            card_l1.get_by_role("button", name="Accept").click()
            card_l1.locator("button", has_text="Applied").wait_for(state="visible")

            agent_input.fill("Move U2 +1.00mm X")
            page.locator("form button[type='submit']").click()
            card_u2 = page.locator('[data-testid="proposal-card-U2"]').first
            card_u2.wait_for(state="visible")
            card_u2.get_by_role("button", name="Accept").click()
            alert_text = card_u2.get_by_role("alert").inner_text()
            assert "KERNEL_LOCK_VIOLATION" in alert_text, f"Expected KERNEL_LOCK_VIOLATION banner, got: {alert_text}"

            # Journey 5: Built-in Calculators Drawer + WCAG label & overflow checks
            page.get_by_role("button", name="Calculators").click()
            drawer = page.locator('[data-testid="calculator-drawer"]')
            drawer.wait_for(state="visible")
            unlabeled = drawer.evaluate(
                """(root) => {
                  const bad = [];
                  for (const inp of root.querySelectorAll('input')) {
                    const aria = inp.getAttribute('aria-label');
                    const id = inp.getAttribute('id');
                    const hasFor = id ? !!root.querySelector(`label[for="${id}"]`) : false;
                    const wrapped = !!inp.closest('label');
                    if (!aria && !hasFor && !wrapped) bad.push(inp.outerHTML);
                  }
                  return bad;
                }"""
            )
            assert not unlabeled, f"Unlabeled calculator inputs found: {unlabeled}"

            has_h_overflow = page.evaluate("document.documentElement.scrollWidth > window.innerWidth")
            assert not has_h_overflow, "Horizontal scroll overflow detected in workstation shell"

            drawer.get_by_role("button", name="Close").click()
            drawer.wait_for(state="hidden")

            assert not unexpected_http_5xx, f"Unexpected HTTP error responses: {unexpected_http_5xx}"
            assert not page_errors, f"Uncaught page errors: {page_errors}"
            assert not console_errors, f"Console errors: {console_errors}"

            context.close()
            browser.close()
    finally:
        proc.terminate()
        proc.wait(timeout=5)

    print("G6D_E2E_5_JOURNEYS_OK")


if __name__ == "__main__":
    run()
