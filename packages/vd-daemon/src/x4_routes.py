"""X4 MCAD STEP 3D Clearance DRC (integer i64 nm) & LibreLane Pack-2C Silicon Bridge routes."""

import json
import math
import re
from typing import Any, Dict, List

_DIGEST_RE = re.compile(r"^sha256:[a-f0-9]{64}$")


def _axis_gap(min_a: int, max_a: int, min_b: int, max_b: int) -> int:
    if max_a < min_b:
        return min_b - max_a
    if max_b < min_a:
        return min_a - max_b
    return -(min(max_a, max_b) - max(min_a, min_b))


def _send_json(handler: Any, status: int, body: Dict[str, Any]) -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler._send_cors()
    handler.end_headers()
    handler.wfile.write(json.dumps(body).encode("utf-8"))


def handle_x4_post(handler: Any, path: str, req: Dict[str, Any]) -> bool:
    if path in ("/api/v1/mcad/clearance-drc", "/api/mcad/clearance-drc"):
        min_clr = int(req.get("min_clearance_nm", 500_000))
        pcb_boxes = req.get("pcb_boxes", [])
        enclosure_walls = req.get("enclosure_walls", [])
        violations: List[Dict[str, Any]] = []
        pairs = 0
        for p in pcb_boxes:
            pmin = [int(v) for v in p.get("min", [0, 0, 0])]
            pmax = [int(v) for v in p.get("max", [0, 0, 0])]
            for e in enclosure_walls:
                pairs += 1
                emin = [int(v) for v in e.get("min", [0, 0, 0])]
                emax = [int(v) for v in e.get("max", [0, 0, 0])]
                gx = _axis_gap(pmin[0], pmax[0], emin[0], emax[0])
                gy = _axis_gap(pmin[1], pmax[1], emin[1], emax[1])
                gz = _axis_gap(pmin[2], pmax[2], emin[2], emax[2])
                if gx <= 0 and gy <= 0 and gz <= 0:
                    violations.append({
                        "pcb_id": str(p.get("id", "")),
                        "enclosure_id": str(e.get("id", "")),
                        "clearance_nm": max(gx, gy, gz),
                        "required_clearance_nm": min_clr,
                        "kind": "MCAD_3D_INTERFERENCE",
                    })
                    continue
                dx = max(0, gx)
                dy = max(0, gy)
                dz = max(0, gz)
                dist_nm = round(math.sqrt(dx * dx + dy * dy + dz * dz))
                if dist_nm < min_clr:
                    violations.append({
                        "pcb_id": str(p.get("id", "")),
                        "enclosure_id": str(e.get("id", "")),
                        "clearance_nm": dist_nm,
                        "required_clearance_nm": min_clr,
                        "kind": "MCAD_3D_CLEARANCE_LOW",
                    })
        _send_json(handler, 200, {
            "engine": "vd-cad-geom-mcad-3d",
            "passed": len(violations) == 0,
            "checked_pairs": pairs,
            "violations": violations,
        })
        return True

    if path in ("/api/v1/silicon/librelane-pack", "/api/silicon/librelane-pack"):
        flow = str(req.get("flow", "librelane")).strip().lower()
        if flow != "librelane":
            _send_json(handler, 400, {
                "error": "LEGACY_OPENLANE_FORBIDDEN",
                "message": "Pack-2C mandates LibreLane only (OpenLane v1 forbidden)",
            })
            return True
        network_mode = str(req.get("network_mode", "")).strip()
        if network_mode != "none":
            _send_json(handler, 403, {
                "error": "RING2_EGRESS_BLOCKED",
                "message": "Pack-2C requires Ring-2 zero-egress network_mode == 'none'",
            })
            return True
        digest = str(req.get("image_digest_sha256", "")).strip()
        if not _DIGEST_RE.match(digest):
            _send_json(handler, 400, {
                "error": "INVALID_WORKER_CONTRACT",
                "message": "Malformed immutable sha256 digest",
            })
            return True
        _send_json(handler, 200, {
            "pack_id": "pack-2c",
            "flow": "librelane",
            "pdk": str(req.get("pdk", "sky130A")),
            "network_mode": "none",
            "c2p2b_balls": [
                {"ball": "A1", "pad_idx": 1, "net": "VDD_CORE", "x_nm": 800_000, "y_nm": 800_000, "pitch_nm": 800_000},
                {"ball": "A2", "pad_idx": 2, "net": "VSS_CORE", "x_nm": 1_600_000, "y_nm": 800_000, "pitch_nm": 800_000},
                {"ball": "B1", "pad_idx": 3, "net": "SPI_SCK", "x_nm": 800_000, "y_nm": 1_600_000, "pitch_nm": 800_000},
            ],
        })
        return True

    return False
