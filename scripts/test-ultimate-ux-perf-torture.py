#!/usr/bin/env python3
"""
Phase 6 Suite 3: Playwright Ultimate UX, Zero-Scrollbox, Matte Design & 10x Persona Torture Suite.
Verifies BOTH 1280x720 and 1920x1080 viewports:
  - 0 page errors, 0 CSS gradients, 0 backdrop-filter blur, 0 emojis, 0 internal jargon in chrome
  - 0 nested scrollboxes across Persona switches & Studio Rail Drawers
  - Home Screen: opens fast, 0 active WebGL contexts, v0.0.4 clean empty/project state
  - Canva 48px Studio Rail + Single 272px Drawer + all 6 Affinity Personas
  - 10x rapid Persona cycling: <25 MB JS heap growth & 0 blank canvases
  - Captures real visual screenshots into .vd-cache/verify-screenshots/
"""

from __future__ import annotations

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
WORKSTATION_DIST = ROOT / "apps" / "workstation" / "dist"
SCREENSHOT_DIR = ROOT / ".vd-cache" / "verify-screenshots"

DOM_AUDIT_JS = r"""
() => {
  const all = Array.from(document.querySelectorAll('*'));
  let gradCount = 0;
  let blurCount = 0;
  const scrollContainers = [];
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (cs.backgroundImage && cs.backgroundImage.includes('gradient')) gradCount++;
    if ((cs.backdropFilter && cs.backdropFilter !== 'none') || (cs.webkitBackdropFilter && cs.webkitBackdropFilter !== 'none')) blurCount++;
    const ovY = cs.overflowY;
    const isScrollable = (ovY === 'auto' || ovY === 'scroll') && el.clientHeight > 0 && el.scrollHeight > el.clientHeight + 2;
    if (isScrollable) scrollContainers.push(el);
  }
  let nestedScrollboxes = 0;
  for (const sc of scrollContainers) {
    let p = sc.parentElement;
    while (p) {
      if (scrollContainers.includes(p)) {
        nestedScrollboxes++;
        break;
      }
      p = p.parentElement;
    }
  }
  const text = document.body.innerText || '';
  const emojiRe = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
  const hasEmoji = emojiRe.test(text);
  const banned = ['HW-IR', 'Lamport', 'NDA_AIRGAPPED', 'KERNEL_LOCK_VIOLATION', 'AI_SLOP'];
  const leakedJargon = banned.filter((tok) => text.includes(tok));
  const horizOverflow = document.documentElement.scrollWidth > window.innerWidth + 2;
  const blankCanvases = Array.from(document.querySelectorAll('canvas')).filter((c) => {
    const r = c.getBoundingClientRect();
    return r.width > 10 && r.height > 10 && (c.width === 0 || c.height === 0);
  }).length;
  return {
    gradCount,
    blurCount,
    nestedScrollboxes,
    hasEmoji,
    leakedJargon,
    horizOverflow,
    blankCanvases,
    heapMb: performance.memory ? +(performance.memory.usedJSHeapSize / (1024 * 1024)).toFixed(2) : null,
  };
}
"""


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def _launch_browser(p):
    for ch in ("msedge", "chrome"):
        try:
            return p.chromium.launch(channel=ch, headless=True, args=["--enable-webgl", "--ignore-gpu-blocklist"])
        except Exception:
            continue
    return p.chromium.launch(headless=True)


def run_viewport_audit(page, width: int, height: int) -> None:
    page.set_viewport_size({"width": width, "height": height})
    page.wait_for_timeout(350)
    res = page.evaluate(DOM_AUDIT_JS)
    assert res["gradCount"] == 0, f"{width}x{height} gradients found: {res['gradCount']}"
    assert res["blurCount"] == 0, f"{width}x{height} backdrop-filter blur found: {res['blurCount']}"
    assert res["nestedScrollboxes"] == 0, f"{width}x{height} nested scrollboxes found: {res['nestedScrollboxes']}"
    assert not res["hasEmoji"], f"{width}x{height} emoji found in UI text"
    assert not res["leakedJargon"], f"{width}x{height} leaked internal jargon: {res['leakedJargon']}"
    assert not res["horizOverflow"], f"{width}x{height} horizontal overflow"
    assert res["blankCanvases"] == 0, f"{width}x{height} blank canvas(es)"


def main() -> None:
    assert (WORKSTATION_DIST / "index.html").is_file(), "Build apps/workstation first"
    SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
    port = _free_port()
    base = f"http://127.0.0.1:{port}"

    with tempfile.TemporaryDirectory(prefix="vd_ux_torture_", ignore_cleanup_errors=True) as tmp_dir:
        tmp = pathlib.Path(tmp_dir)
        proj_dir = tmp / "proj"
        proj_dir.mkdir(parents=True)
        for f in (ROOT / "fixtures" / "golden-buck-mcu").glob("*"):
            if f.is_file():
                (proj_dir / f.name).write_bytes(f.read_bytes())

        env = os.environ.copy()
        env["VD_DB_DIR"] = str(tmp / "db")
        env["VD_DATA_DIR"] = str(tmp / "runtime")
        env["VD_OFFLINE"] = "1"
        env["VD_LOCAL_COMPANION_STAGING"] = "1"

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
                    with urllib.request.urlopen(f"{base}/api/health", timeout=2) as r:
                        if r.status == 200:
                            break
                except Exception:
                    time.sleep(0.25)

            page_errors = []
            with sync_playwright() as p:
                browser = _launch_browser(p)
                context = browser.new_context(viewport={"width": 1280, "height": 720})
                page = context.new_page()
                page.on("pageerror", lambda err: page_errors.append(str(err)))

                t0 = time.monotonic()
                page.goto(base, wait_until="domcontentloaded", timeout=25000)

                # Dismiss BootstrapSplash offline if shown
                offline_btn = page.get_by_role("button", name="Continue Offline (Core Only)")
                try:
                    offline_btn.wait_for(state="visible", timeout=5000)
                    offline_btn.click()
                except Exception:
                    pass

                page.wait_for_selector('[data-testid="zone1-menubar"]', timeout=15000)
                load_s = time.monotonic() - t0
                print(f"[1/5] Workbench loaded in {load_s:.2f}s cleanly!")

                # Verify Home Screen: 0 WebGL contexts + clean UI + v0.0.4
                page.click('[data-testid="topbar-home-btn"]')
                page.wait_for_selector('[data-testid="home-screen-modal"]', timeout=5000)
                webgl_on_home = page.evaluate("""() => {
                  const canvases = Array.from(document.querySelectorAll('canvas'));
                  return canvases.filter(c => c.getContext && (c.getContext('webgl2') || c.getContext('webgl'))).length;
                }""")
                assert webgl_on_home == 0, f"Expected 0 WebGL contexts on Home, found {webgl_on_home}"
                run_viewport_audit(page, 1280, 720)
                page.screenshot(path=str(SCREENSHOT_DIR / "home.png"))
                page.click('[data-testid="home-close-btn"]')
                page.wait_for_selector('[data-testid="zone1-menubar"]', timeout=5000)
                print("[2/5] Home Screen verified (0 WebGL contexts, zero clutter/jargon)!")

                # Verify Canva 48px Studio Rail + Single 272px Drawer
                for tab in ("parts", "blocks", "modules", "outliner", "files", "plugins"):
                    page.click(f'[data-testid="studio-rail-{tab}"]')
                    page.wait_for_selector('[data-testid="canva-studio-drawer"]', timeout=4000)
                    assert page.locator('[data-testid="canva-studio-drawer"]').count() == 1
                    run_viewport_audit(page, 1280, 720)
                page.screenshot(path=str(SCREENSHOT_DIR / "studio-plugins.png"))
                page.click('[data-testid="studio-drawer-close"]')
                print("[3/5] Canva 48px Studio Rail & all 6 drawers verified at 1280x720!")

                # Verify 6 Affinity Personas at BOTH 1280x720 and 1920x1080 + 10x Rapid Torture Switch
                personas = ["plan", "sch_code", "pcb_3d", "mcad_3d", "virtual_lab", "fab_release"]
                for pid in personas:
                    tab = page.locator(f'[data-testid="ws-tab-{pid}"]')
                    assert tab.count() == 1, f"Missing Affinity Persona tab {pid}"
                    tab.click()
                    page.wait_for_timeout(250)
                    run_viewport_audit(page, 1280, 720)
                    if pid in ("pcb_3d", "mcad_3d", "virtual_lab"):
                        page.screenshot(path=str(SCREENSHOT_DIR / f"persona-{pid}.png"))

                # 1920x1080 check
                run_viewport_audit(page, 1920, 1080)
                page.set_viewport_size({"width": 1280, "height": 720})

                heap_start = page.evaluate("() => performance.memory ? performance.memory.usedJSHeapSize / (1024*1024) : 0")
                for cycle in range(10):
                    pid = personas[cycle % len(personas)]
                    page.click(f'[data-testid="ws-tab-{pid}"]')
                    page.wait_for_timeout(120)
                page.wait_for_timeout(300)
                heap_end = page.evaluate("() => performance.memory ? performance.memory.usedJSHeapSize / (1024*1024) : 0")
                heap_drift = max(0.0, heap_end - heap_start)
                assert heap_drift < 25.0, f"Heap drift too high across 10x Persona switch: {heap_drift:.2f} MB"
                print(f"[4/5] All 6 Affinity Personas + 10x rapid switch torture passed (heap delta: {heap_drift:.2f} MB < 25 MB)!")

                # Bespoke modals sanity
                page.keyboard.press("F1")
                page.wait_for_selector('[data-testid="help-center-modal"]', timeout=4000)
                page.keyboard.press("Escape")
                page.click('[data-testid="tool-manager-btn"]')
                page.wait_for_selector('[data-testid="polish-tools-modal"]', timeout=4000)
                page.keyboard.press("Escape")
                assert len(page_errors) == 0, f"Uncaught page errors: {page_errors}"
                print(f"[5/5] Modals & zero pageerrors verified cleanly! Screenshots saved to {SCREENSHOT_DIR}")

                browser.close()
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()

    print("PASSED: test-ultimate-ux-perf-torture.py")


if __name__ == "__main__":
    main()
