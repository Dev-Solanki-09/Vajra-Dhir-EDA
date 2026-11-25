"""
P0 (VD-PERF-001) — Sequential Offline Baseline Measurement & Budget Gate
Measures CrossProbeBus, WebGPU CAD FrameBuffers, GeometryWorker, elkjs,
vd-daemon REST endpoints, and apps/workstation bundle sizes cleanly on 127.0.0.1.
"""

from __future__ import annotations

import json
import os
import pathlib
import socket
import statistics
import subprocess
import sys
import time
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
PRIVATE_BASELINE = ROOT / ".ai-sync" / "private" / "perf-baseline.json"


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def measure_node_engines() -> dict:
    script = r"""
import { performance } from 'node:perf_hooks';
import { CrossProbeBus } from './packages/crossprobe-bus/dist/index.js';
import { WebGpuCadEngine, createSampleBuckScene, createGpuFrameBuffers, runGeometryWorkerTask } from './packages/webgpu-cad-engine/dist/index.js';
import { runElkSchematicLayout, BUCK_PD_SCHEMATIC_INPUT } from './apps/workstation/src/engines/elkLayout.ts';

const bus = new CrossProbeBus();
const busTimes = [];
for (let i = 0; i < 200; i++) {
  const t0 = performance.now();
  bus.select(['U2'], 'pcb');
  bus.highlightNet('SW_NODE', 'pcb');
  busTimes.push(performance.now() - t0);
}

const engine = new WebGpuCadEngine(false, true);
const scene = createSampleBuckScene();
const bufTimes = [];
const hitTimes = [];
for (let i = 0; i < 100; i++) {
  const t0 = performance.now();
  createGpuFrameBuffers(scene, engine.getViewport(), 1280, 720, { layersVisible: true, ratsnestVisible: true, lockRingsVisible: true });
  bufTimes.push(performance.now() - t0);
  const t1 = performance.now();
  await runGeometryWorkerTask({ kind: 'HIT_TEST', scene, targetNm: [scene.pads[1].xNm, scene.pads[1].yNm], toleranceNm: 2000000n });
  hitTimes.push(performance.now() - t1);
}

const elkTimes = [];
for (let i = 0; i < 5; i++) {
  const t0 = performance.now();
  await runElkSchematicLayout(BUCK_PD_SCHEMATIC_INPUT);
  elkTimes.push(performance.now() - t0);
}

const median = (arr) => { const s = [...arr].sort((a,b)=>a-b); return Number(s[Math.floor(s.length/2)].toFixed(4)); };
const maxv = (arr) => Number(Math.max(...arr).toFixed(4));
console.log(JSON.stringify({
  crossprobe_median_ms: median(busTimes),
  crossprobe_max_ms: maxv(busTimes),
  cad_framebuffer_median_ms: median(bufTimes),
  cad_hittest_median_ms: median(hitTimes),
  elk_layout_median_ms: median(elkTimes),
}));
"""
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(proc.stdout.strip().splitlines()[-1])


def measure_daemon_endpoints() -> dict:
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
                with urllib.request.urlopen(f"{base}/api/v1/health", timeout=2) as r:
                    if r.status == 200:
                        ready = True
                        break
            except Exception:
                time.sleep(0.1)
        assert ready, "vd-daemon failed to boot for P0 benchmark"

        endpoints = [
            ("health", "GET", "/api/v1/health", None),
            ("project", "GET", "/api/v1/project", None),
            ("board", "GET", "/api/v1/board", None),
            ("panel_generate", "POST", "/api/v1/panel/generate", {"rows": 2, "cols": 2, "rail_mm": 5.0}),
            ("copper_refill", "POST", "/api/v1/copper/refill", {"layer": "F.Cu", "net": "GND"}),
            ("pdn_solve", "POST", "/api/v1/pdn/solve", {"net": "+3V3_OUT", "current_a": 3.0}),
            ("smps_bode", "POST", "/api/v1/smps/bode-calc", {"vin": 12.0, "vout": 3.3, "iout": 2.0}),
        ]
        results = {}
        for name, method, path, payload in endpoints:
            samples_ms = []
            for _ in range(10):
                data = None if payload is None else json.dumps(payload).encode("utf-8")
                req = urllib.request.Request(f"{base}{path}", data=data, method=method)
                if payload is not None:
                    req.add_header("Content-Type", "application/json")
                t0 = time.perf_counter()
                with urllib.request.urlopen(req, timeout=5) as resp:
                    _ = resp.read()
                    assert resp.status == 200
                samples_ms.append((time.perf_counter() - t0) * 1000.0)
            results[f"{name}_median_ms"] = round(statistics.median(samples_ms), 3)
        return results
    finally:
        proc.terminate()
        proc.wait(timeout=5)


def measure_workstation_bundle() -> dict:
    dist_assets = ROOT / "apps" / "workstation" / "dist" / "assets"
    assert dist_assets.exists(), "apps/workstation/dist/assets missing"
    js_files = list(dist_assets.glob("*.js"))
    js_bytes = sum(p.stat().st_size for p in js_files)
    css_bytes = sum(p.stat().st_size for p in dist_assets.glob("*.css"))
    largest_js = max((p.stat().st_size for p in js_files), default=0)
    entry_js = sum(p.stat().st_size for p in js_files if p.name.startswith("index-"))
    assert entry_js > 0, "Workstation entry JS bundle (index-*.js) missing"
    return {
        "total_js_bytes": js_bytes,
        "total_css_bytes": css_bytes,
        "largest_js_chunk_bytes": largest_js,
        "entry_js_bytes": entry_js,
    }


def run() -> None:
    node_metrics = measure_node_engines()
    daemon_metrics = measure_daemon_endpoints()
    bundle_metrics = measure_workstation_bundle()

    baseline = {
        "measured_at": "2026-11-25",
        "node_engines": node_metrics,
        "daemon_endpoints": daemon_metrics,
        "bundle": bundle_metrics,
    }

    PRIVATE_BASELINE.parent.mkdir(parents=True, exist_ok=True)
    PRIVATE_BASELINE.write_text(json.dumps(baseline, indent=2) + "\n", encoding="utf-8")

    # Enforce P0/P4 performance budgets (hard <16ms CrossProbeBus + responsive offline daemon + split entry JS)
    assert node_metrics["crossprobe_max_ms"] < 16.0, f"CrossProbeBus budget violation: {node_metrics['crossprobe_max_ms']} ms"
    assert daemon_metrics["health_median_ms"] < 100.0, f"Daemon health slow: {daemon_metrics['health_median_ms']} ms"
    assert node_metrics["elk_layout_median_ms"] < 1000.0, f"ELK layout slow: {daemon_metrics['elk_layout_median_ms']} ms"
    assert bundle_metrics["entry_js_bytes"] < 400_000, f"Entry JS budget violation: {bundle_metrics['entry_js_bytes']} bytes"

    print("P0_BASELINE_OK", json.dumps(baseline))


if __name__ == "__main__":
    run()
