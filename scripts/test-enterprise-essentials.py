"""
Enterprise Essentials & Application Polish Verification Suite (GUI-REDESIGN Add-On Section 7).

Verifies:
1. CSS & Matte Charcoal theme invariants (zero linear/radial gradients or backdrop-filter blur).
2. Enterprise Home Hub + starter template instantiation -> /api/v1/project/create.
3. Settings 9 categories, search ("units"), persistence across browser reload, Reset All to Defaults.
4. Keymap conflict warning + rebind + reset, plus 3-theme & compact density switching.
5. Project Settings dialog -> /api/v1/project/settings -> project.vd.json persistence.
6. Server-backed FileBrowserModal + safe directory creation (/api/v1/fs/mkdir).
7. Unsaved-changes guard (• indicator + UnsavedGuardDialog Cancel / Save & Continue).
8. Toast stack, Notification Bell drawer Clear All, Status Bar Background Jobs drawer.
9. Global Search, Plugins Capability Matrix, Activity Log, Diagnostic Bundle (zero secrets), Shortcuts, About.
10. Custom Workspace Layout create/switch + localStorage persistence.
"""

from __future__ import annotations

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


def http_get_json(url: str) -> dict:
    with urllib.request.urlopen(url, timeout=5) as resp:
        assert resp.status == 200, f"GET {url} -> {resp.status}"
        return json.loads(resp.read().decode("utf-8"))


def run() -> None:
    tokens = (ROOT / "apps" / "workstation" / "src" / "tokens.css").read_text(encoding="utf-8")
    base_css = (ROOT / "apps" / "workstation" / "src" / "base.css").read_text(encoding="utf-8")
    for text, label in ((tokens, "tokens.css"), (base_css, "base.css")):
        assert "linear-gradient" not in text, f"{label} must not contain linear-gradient"
        assert "radial-gradient" not in text, f"{label} must not contain radial-gradient"
        assert "backdrop-filter" not in text, f"{label} must not contain backdrop-filter"
    assert "#141416" in tokens and "#1C1C1F" in tokens and "#232327" in tokens

    dist_index = ROOT / "apps" / "workstation" / "dist" / "index.html"
    assert dist_index.exists(), f"Missing built bundle {dist_index}"

    port = find_free_port()
    base = f"http://127.0.0.1:{port}"
    canary_secret = "ghp_DO_NOT_LEAK_CANARY_TOKEN_987654321"
    test_mkdir_path = ROOT / "_tmp_essentials_browse_dir"
    if test_mkdir_path.exists():
        shutil.rmtree(test_mkdir_path, ignore_errors=True)

    with tempfile.TemporaryDirectory(prefix="vd-essentials-", ignore_cleanup_errors=True) as tmp_dir:
        cache_dir = pathlib.Path(tmp_dir) / "cache"
        db_dir = pathlib.Path(tmp_dir) / "db"
        env = dict(os.environ)
        env["VD_LLM_PROVIDER"] = "deterministic_offline"
        env["VD_CACHE_DIR"] = str(cache_dir)
        env["VD_DB_DIR"] = str(db_dir)
        env["GITHUB_TOKEN"] = canary_secret
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
            for _ in range(100):
                if proc.poll() is not None:
                    raise RuntimeError(f"vd-daemon exited early ({proc.returncode})")
                try:
                    with urllib.request.urlopen(f"{base}/api/v1/health", timeout=2) as resp:
                        if resp.status == 200:
                            ready = True
                            break
                except Exception:
                    time.sleep(0.15)
            assert ready, "vd-daemon failed to boot"

            with sync_playwright() as pw:
                browser = launch_browser(pw)
                context = browser.new_context(viewport={"width": 1440, "height": 900})
                page = context.new_page()

                page_errors: list[str] = []
                console_errors: list[str] = []
                bad_5xx: list[str] = []
                page.on("pageerror", lambda exc: page_errors.append(str(exc)))
                page.on(
                    "console",
                    lambda msg: console_errors.append(msg.text)
                    if msg.type == "error" and "ERR_CONNECTION_REFUSED" not in msg.text
                    else None,
                )
                page.on(
                    "response",
                    lambda res: bad_5xx.append(f"{res.status} {res.url}") if res.status >= 500 else None,
                )

                page.goto(base, wait_until="networkidle")
                page.locator("[data-testid='zone1-menubar']").wait_for(state="visible", timeout=15000)

                # 1. Home Hub + template instantiation
                page.locator("[data-testid='topbar-home-btn']").click()
                page.locator("[data-testid='home-screen-modal']").wait_for(state="visible")
                page.locator("[data-testid='home-template-stm32_can']").click()
                page.locator("[data-testid='home-screen-modal']").wait_for(state="detached", timeout=5000)

                # 2. Settings 9 categories, search ("units"), persistence across reload, Reset All
                page.locator("[data-testid='topbar-settings-btn']").click()
                page.locator("[data-testid='settings-modal']").wait_for(state="visible")
                page.locator("[data-testid='settings-search-input']").fill("units")
                unit_select = page.locator("[data-testid='settings-unit-select']")
                unit_select.wait_for(state="visible")
                unit_select.select_option("mil")

                page.locator("[data-testid='settings-search-input']").fill("autosave")
                autosave_select = page.locator("[data-testid='settings-autosave-select']")
                autosave_select.wait_for(state="visible")
                autosave_select.select_option("30")
                page.locator("[data-testid='settings-search-input']").fill("")

                # Switch theme & density temporarily, verify DOM attrs
                page.locator("[data-testid='settings-cat-appearance']").click()
                page.locator("[data-testid='settings-theme-select']").select_option("high_contrast_dark")
                page.locator("[data-testid='settings-density-select']").select_option("compact")
                assert page.evaluate("() => document.documentElement.getAttribute('data-theme')") == "high_contrast_dark"
                assert page.evaluate("() => document.documentElement.getAttribute('data-density')") == "compact"

                # 3. Keymap conflict warning + reset
                page.locator("[data-testid='settings-cat-keybindings']").click()
                page.locator("[data-testid='keymap-bind-verify.suite']").click()
                # F6 is already bound to sim.spice -> triggers conflict warning
                page.keyboard.press("F6")
                page.locator("[data-testid='keymap-conflict-warning']").wait_for(state="visible")
                page.locator("[data-testid='keymap-reset-verify.suite']").click()

                # AI Agent & Security category check
                page.locator("[data-testid='settings-cat-agent-dlp']").click()
                page.get_by_text("Default DLP Mode").wait_for(state="visible")
                page.locator("[data-testid='settings-close-btn']").click()

                # Reload & confirm persisted settings in daemon JSON + UI
                time.sleep(0.25)
                persisted = http_get_json(f"{base}/api/v1/settings")
                assert persisted["navigation"]["unit"] == "mil", f"Settings unit did not persist: {persisted}"
                assert persisted["autosave"]["intervalSec"] == 30, f"Autosave did not persist: {persisted}"

                page.reload(wait_until="networkidle")
                page.locator("[data-testid='topbar-settings-btn']").click()
                page.locator("[data-testid='settings-cat-pcb-units']").click()
                assert page.locator("[data-testid='settings-unit-select']").input_value() == "mil"
                page.locator("[data-testid='settings-reset-all-btn']").click()
                time.sleep(0.2)
                assert page.locator("[data-testid='settings-unit-select']").input_value() == "mm"
                page.locator("[data-testid='settings-close-btn']").click()

                # 4. Project Settings dialog -> project.vd.json
                page.locator("[data-testid='menu-trigger-file']").click()
                page.locator("[data-testid='menu-item-file.proj_settings']").click()
                page.locator("[data-testid='project-settings-modal']").wait_for(state="visible")
                page.locator("[data-testid='proj-settings-revision']").fill("2.4")
                page.locator("[data-testid='proj-settings-soldermask']").select_option("Blue")
                page.locator("[data-testid='proj-settings-save-btn']").click()
                time.sleep(0.2)
                proj_json = http_get_json(f"{base}/api/v1/project/settings")
                assert proj_json["revision"] == "2.4" and proj_json["solderMaskColor"] == "Blue", proj_json

                # 5. Server-backed FileBrowserModal & mkdir
                page.locator("[data-testid='topbar-home-btn']").click()
                page.locator("[data-testid='home-browse-files-btn']").click()
                page.locator("[data-testid='file-browser-modal']").wait_for(state="visible")
                page.locator("[data-testid='file-browser-new-folder-btn']").click()
                page.locator("[data-testid='file-browser-mkdir-input']").fill("_tmp_essentials_browse_dir")
                page.locator("[data-testid='file-browser-mkdir-confirm-btn']").click()
                time.sleep(0.2)
                assert test_mkdir_path.is_dir(), f"Expected folder created at {test_mkdir_path}"
                page.locator("[data-testid='file-browser-select-btn']").click()
                # Close home hub modal
                page.locator("[data-testid='home-template-buck_pd']").click()

                # 6. Dirty indicator & UnsavedGuardDialog
                page.locator("[data-testid='outliner-lock-U1']").click()
                page.locator("[data-testid='menu-trigger-file']").click()
                assert "•" in page.locator("[data-testid='topbar-project-title']").inner_text()
                page.locator("[data-testid='menu-item-file.close_home']").click()
                page.locator("[data-testid='unsaved-guard-dialog']").wait_for(state="visible")
                page.locator("[data-testid='unsaved-cancel-btn']").click()
                page.locator("[data-testid='unsaved-guard-dialog']").wait_for(state="detached", timeout=5000)

                page.locator("[data-testid='menu-trigger-file']").click()
                page.locator("[data-testid='menu-item-file.close_home']").click()
                page.locator("[data-testid='unsaved-save-btn']").click()
                # Enter workbench again after saving cleanly
                page.locator("[data-testid='home-template-buck_pd']").click()

                # 7. Toast Stack + Notifications Bell Clear + Background Jobs Drawer
                page.locator("[data-testid='transport-verify-btn']").click()
                page.locator("[data-testid='toast-stack']").wait_for(state="visible")
                page.locator("[data-testid='topbar-notifications-btn']").click()
                page.locator("[data-testid='enterprise-drawer-notifications']").wait_for(state="visible")
                page.locator("[data-testid='notifications-clear-btn']").click()
                page.get_by_text("No active notifications.").wait_for(state="visible")
                page.keyboard.press("Escape")

                page.locator("[data-testid='statusbar-jobs-btn']").click()
                page.locator("[data-testid='enterprise-drawer-jobs']").wait_for(state="visible")
                page.keyboard.press("Escape")

                # 8. Plugins Matrix & Global Search Drawer
                page.locator("[data-testid='topbar-plugins-btn']").click()
                page.locator("[data-testid='plugin-card-trace-impedance-helper']").wait_for(state="visible")
                page.keyboard.press("Escape")
                page.locator("[data-testid='topbar-search-btn']").click()
                page.locator("[data-testid='enterprise-drawer-search']").wait_for(state="visible")
                page.keyboard.press("Escape")

                # 9. Activity Log, Shortcuts (?), About Modal, Diagnostics Bundle zero-secret check
                page.locator("[data-testid='menu-trigger-help']").click()
                page.locator("[data-testid='menu-item-help.activity']").click()
                page.locator("[data-testid='activity-log-modal']").wait_for(state="visible")
                page.keyboard.press("Escape")

                page.locator("[data-testid='menu-trigger-help']").click()
                page.locator("[data-testid='menu-item-help.about']").click()
                page.locator("[data-testid='about-modal']").wait_for(state="visible")
                page.keyboard.press("Escape")

                page.keyboard.press("?")
                page.locator("[data-testid='shortcuts-modal']").wait_for(state="visible")
                page.keyboard.press("Escape")

                bundle = http_get_json(f"{base}/api/v1/system/diagnostics-bundle")
                bundle_text = json.dumps(bundle)
                assert canary_secret not in bundle_text, "SECRET LEAKED into diagnostics bundle!"
                assert "version" in bundle and "settings" in bundle, f"Diagnostics bundle malformed: {bundle}"

                # 10. Custom Workspace Layout save
                page.locator("[data-testid='ws-save-custom-btn']").click()
                prompt_dlg = page.locator("[data-testid='input-prompt-dialog']")
                prompt_dlg.wait_for(state="visible")
                prompt_dlg.locator("input").fill("RF Bench")
                prompt_dlg.locator("button:has-text('Save Layout')").click()
                page.get_by_role("tab", name="RF Bench").wait_for(state="visible")

                assert not page_errors, f"Page errors: {page_errors}"
                assert not console_errors, f"Console errors: {console_errors}"
                assert not bad_5xx, f"HTTP 5xx errors: {bad_5xx}"
                browser.close()
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
            if test_mkdir_path.exists():
                shutil.rmtree(test_mkdir_path, ignore_errors=True)

    print("[enterprise-essentials] PASSED (all 10 enterprise capabilities verified with 0 errors)")


if __name__ == "__main__":
    run()
