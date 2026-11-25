#!/usr/bin/env python3
"""Prompt 4 unit & integration tests: FS tree/read/write traversal guard + ConPTY WebSocket."""

import base64
import json
import os
import pathlib
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request


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
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode("utf-8"))


def _ws_connect(host: str, port: int, target: str) -> socket.socket:
    sock = socket.create_connection((host, port), timeout=10)
    key = base64.b64encode(os.urandom(16)).decode("ascii")
    req = (
        f"GET {target} HTTP/1.1\r\n"
        f"Host: {host}:{port}\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        "Sec-WebSocket-Version: 13\r\n\r\n"
    )
    sock.sendall(req.encode("ascii"))
    buf = b""
    while b"\r\n\r\n" not in buf:
        more = sock.recv(4096)
        if not more:
            break
        buf += more
    assert b"101 Switching Protocols" in buf, f"Expected 101, got: {buf!r}"
    return sock


def _ws_send_text(sock: socket.socket, text: str) -> None:
    payload = text.encode("utf-8")
    mask = os.urandom(4)
    hdr = bytearray([0x81])
    if len(payload) < 126:
        hdr.append(0x80 | len(payload))
    else:
        hdr.append(0x80 | 126)
        hdr.extend(struct.pack("!H", len(payload)))
    hdr.extend(mask)
    masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    sock.sendall(bytes(hdr) + masked)


def _ws_read_text(sock: socket.socket, timeout_sec: float = 5.0) -> str:
    sock.settimeout(timeout_sec)
    collected = bytearray()
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        try:
            hdr = sock.recv(2)
            if not hdr or len(hdr) < 2:
                break
            plen = hdr[1] & 0x7F
            if plen == 126:
                plen = struct.unpack("!H", sock.recv(2))[0]
            elif plen == 127:
                plen = struct.unpack("!Q", sock.recv(8))[0]
            data = bytearray()
            while len(data) < plen:
                data.extend(sock.recv(plen - len(data)))
            collected.extend(data)
            if b"PTY_SMOKE_OK" in collected:
                break
        except TimeoutError:
            break
    return collected.decode("utf-8", errors="replace")


def test_fs_api_traversal_and_conpty_ws() -> None:
    port = _free_port()
    with tempfile.TemporaryDirectory(prefix="vd_p4_test_", ignore_cleanup_errors=True) as tmp_dir:
        tmp = pathlib.Path(tmp_dir)
        proj = tmp / "proj"
        shutil.copytree("fixtures/golden-buck-mcu", proj)
        env = dict(os.environ)
        env["VD_DB_DIR"] = str(tmp / "db")

        proc = subprocess.Popen(
            [sys.executable, "packages/vd-daemon/src/daemon.py", str(port)],
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        base = f"http://127.0.0.1:{port}"
        try:
            for _ in range(80):
                try:
                    st, _ = _req(base, "GET", "/api/v1/health")
                    if st == 200:
                        break
                except Exception:
                    time.sleep(0.1)
            else:
                raise TimeoutError("Daemon failed to start")

            st, tree = _req(base, "GET", "/api/v1/fs/tree")
            assert st == 200
            paths = {e["path"] for e in tree["entries"]}
            assert "elec/src/main.ato" in paths and "firmware/board_pins.h" in paths, paths

            # Traversal block -> 403
            st_esc, err_esc = _req(base, "GET", "/api/v1/fs/read?path=../../package.json")
            assert st_esc == 403 and err_esc["error"] == "PATH_TRAVERSAL_BLOCKED"

            # Read + write inside workspace
            st_r, read_res = _req(base, "GET", "/api/v1/fs/read?path=elec/src/main.ato")
            assert st_r == 200 and "TPS54302" in read_res["content"]

            st_w, wr_res = _req(base, "POST", "/api/v1/fs/write", {
                "path": "elec/src/main.ato",
                "content": read_res["content"] + "\n# edited-by-test\n",
            })
            assert st_w == 200 and wr_res["saved"] is True

            # Unauthenticated /ws/pty must reject 403
            try:
                urllib.request.urlopen(f"{base}/ws/pty?token=bogus", timeout=5)
                raise AssertionError("Expected 403 on bogus PTY token")
            except urllib.error.HTTPError as e:
                assert e.code == 403

            # Valid ephemeral token -> real local ConPTY/PTY shell stdout
            st_tok, tok_data = _req(base, "GET", "/api/v1/pty/session")
            assert st_tok == 200 and tok_data["token"]
            ws = _ws_connect("127.0.0.1", port, f"/ws/pty?token={tok_data['token']}")
            try:
                time.sleep(0.5)
                _ws_send_text(ws, "echo PTY_SMOKE_OK\r")
                out = _ws_read_text(ws, timeout_sec=8.0)
                assert "PTY_SMOKE_OK" in out, f"Expected PTY_SMOKE_OK in PTY output, got: {out!r}"
            finally:
                ws.close()
        finally:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
