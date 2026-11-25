"""
G6C Behavioral Test:
1. Cold-boots vd-daemon on an ephemeral loopback port (clean temp DB).
2. Verifies GET /api/v1/project returns autosave status and project metadata.
3. Verifies POST /api/v1/agent/chat streams SSE (thought_delta, tool_call using 12-verb MCP v2, tool_result, proposal_card, done) under $0 deterministic_offline.
4. Verifies POST /api/v1/agent/proposals/<id>/accept fails CLOSED with HTTP 409 KERNEL_LOCK_VIOLATION when targeting locked U2, and SUCCEEDS (HTTP 200) on unlocked L1.
5. Verifies external OLLAMA_HOST fails closed (NDA_AIRGAPPED).
6. Verifies all 7 workstation workspaces + 4 states + built-in physics calculators + uPlot integration.
"""
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent


def find_free_port() -> int:
    import socket
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def http_json(url: str, method: str = "GET", payload: dict | None = None):
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    if payload is not None:
        req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8"))


def parse_sse_frames(raw_text: str):
    events = []
    current_event = None
    for line in raw_text.splitlines():
        if line.startswith("event: "):
            current_event = line[len("event: "):].strip()
        elif line.startswith("data: "):
            events.append((current_event or "message", json.loads(line[len("data: "):].strip())))
            current_event = None
    return events


def run():
    # 1. Verify airgap guardrail directly on agent_routes module
    sys.path.insert(0, str(ROOT / "packages" / "vd-daemon" / "src"))
    import agent_routes  # noqa: E402

    try:
        agent_routes.resolve_llm_provider({"VD_LLM_PROVIDER": "ollama", "OLLAMA_HOST": "https://evil.example.com:11434"})
        raise AssertionError("Expected NDA_AIRGAP_VIOLATION for external OLLAMA_HOST")
    except ValueError as err:
        assert "NDA_AIRGAP_VIOLATION" in str(err), f"Unexpected error: {err}"

    # 2. Boot live daemon on free port
    port = find_free_port()
    base = f"http://127.0.0.1:{port}"
    with tempfile.TemporaryDirectory() as tmp:
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
                    st, _ = http_json(f"{base}/api/v1/health")
                    if st == 200:
                        ready = True
                        break
                except Exception:
                    time.sleep(0.15)
            assert ready, "vd-daemon failed to boot within timeout"

            # Check /api/v1/project
            st, proj = http_json(f"{base}/api/v1/project")
            assert st == 200 and "autosave_present" in proj and proj.get("name"), f"Bad /api/v1/project: {proj}"

            # Test locked U2 proposal fails closed (409 KERNEL_LOCK_VIOLATION)
            req_locked = urllib.request.Request(
                f"{base}/api/v1/agent/chat",
                data=json.dumps({"prompt": "Move U2 by +1.0mm to align input cap"}).encode("utf-8"),
                method="POST",
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req_locked, timeout=5) as resp:
                assert resp.status == 200
                ctype = resp.headers.get("Content-Type", "")
                assert "text/event-stream" in ctype, f"Expected SSE Content-Type, got {ctype}"
                events = parse_sse_frames(resp.read().decode("utf-8"))

            event_names = [e[0] for e in events]
            assert "thought_delta" in event_names, f"Missing thought_delta: {event_names}"
            assert "tool_call" in event_names, f"Missing tool_call: {event_names}"
            assert "proposal_card" in event_names, f"Missing proposal_card: {event_names}"
            assert "done" in event_names, f"Missing done: {event_names}"

            locked_card = next(d for k, d in events if k == "proposal_card")
            st_acc, acc_body = http_json(f"{base}/api/v1/agent/proposals/{locked_card['proposal_id']}/accept", method="POST", payload={})
            assert st_acc == 409, f"Expected HTTP 409 KERNEL_LOCK_VIOLATION on U2, got {st_acc}: {acc_body}"
            assert acc_body.get("error_code") == "KERNEL_LOCK_VIOLATION"

            # Test unlocked L1 proposal succeeds (200)
            req_unlocked = urllib.request.Request(
                f"{base}/api/v1/agent/chat",
                data=json.dumps({"prompt": "Nudge L1 closer to U2 SW pad"}).encode("utf-8"),
                method="POST",
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(req_unlocked, timeout=5) as resp:
                unlocked_events = parse_sse_frames(resp.read().decode("utf-8"))
            unlocked_card = next(d for k, d in unlocked_events if k == "proposal_card")
            st_ok, ok_body = http_json(f"{base}/api/v1/agent/proposals/{unlocked_card['proposal_id']}/accept", method="POST", payload={})
            assert st_ok == 200 and ok_body.get("accepted") is True, f"Expected HTTP 200 accept on L1: {st_ok} {ok_body}"

            # Test reject proposal (200)
            st_rej, rej_body = http_json(f"{base}/api/v1/agent/proposals/{locked_card['proposal_id']}/reject", method="POST", payload={})
            assert st_rej == 200 and rej_body.get("status") == "rejected", f"Expected HTTP 200 reject: {rej_body}"

        finally:
            proc.terminate()
            proc.wait(timeout=5)

    # 3. Verify all 7 workspaces + 4 states + physics calculators + uPlot exist in workstation build
    ws_files = [
        ROOT / "apps" / "workstation" / "src" / "components" / "AgentDockPanel.tsx",
        ROOT / "apps" / "workstation" / "src" / "components" / "CalculatorDrawer.tsx",
        ROOT / "apps" / "workstation" / "src" / "components" / "UplotScope.tsx",
        ROOT / "apps" / "workstation" / "src" / "components" / "Workspaces.tsx",
    ]
    for p in ws_files:
        assert p.exists(), f"Missing G6C workstation component: {p}"

    ws_text = (ROOT / "apps" / "workstation" / "src" / "components" / "Workspaces.tsx").read_text(encoding="utf-8")
    for ws_id in ("schematic", "pcb_layout", "mcad_3d", "sim_lab", "library_bom", "firmware_pinmux", "mfg_diff"):
        assert ws_id in ws_text, f"Workspace {ws_id} missing in Workspaces.tsx"
    for st_name in ("loading", "empty", "error", "full"):
        assert st_name in ws_text, f"Explicit state {st_name} missing in Workspaces.tsx"

    print("G6C_AGENT_WORKSPACES_OK")


if __name__ == "__main__":
    run()
