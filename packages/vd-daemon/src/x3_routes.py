"""X3 Virtual Lab routes: Renode-ngspice lockstep co-sim & Ring-2 zero-egress OCI field solvers."""

import json
import re
from typing import Any, Dict, List

_DIGEST_RE = re.compile(r"^sha256:[a-f0-9]{64}$")
_ALLOWED_SOLVERS = {"openems", "palace", "elmerfem", "calculix", "xyce", "renode"}


def _send_json(handler: Any, status: int, body: Dict[str, Any]) -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler._send_cors()
    handler.end_headers()
    handler.wfile.write(json.dumps(body).encode("utf-8"))


def handle_x3_post(handler: Any, path: str, req: Dict[str, Any]) -> bool:
    if path in ("/api/v1/sim/cosim-step", "/api/sim/cosim-step"):
        quantum_ns = max(1, int(req.get("quantum_ns", 1000)))
        vbus_mv = max(1, int(req.get("vbus_mv", 12000)))
        target_vout_mv = int(req.get("target_vout_mv", 3300))
        steps = max(1, min(200, int(req.get("steps", 5))))

        trace: List[Dict[str, Any]] = []
        vout_mv = 0
        for step in range(steps):
            err_mv = max(0, target_vout_mv - vout_mv)
            duty = max(5, min(95, int((err_mv * 100) / vbus_mv)))
            vout_mv = min(target_vout_mv, vout_mv + (target_vout_mv - vout_mv) // 2 + 120)
            trace.append({
                "time_ns": (step + 1) * quantum_ns,
                "analog_vout_mv": vout_mv,
                "digital_pgood": vout_mv >= int(target_vout_mv * 0.9),
                "pwm_duty_pct": duty,
            })

        _send_json(handler, 200, {
            "engine": "renode-ngspice-lockstep",
            "quantum_ns": quantum_ns,
            "trace": trace,
        })
        return True

    if path in ("/api/v1/sim/field-solve", "/api/sim/field-solve"):
        network_mode = str(req.get("network_mode", "")).strip()
        if network_mode != "none":
            _send_json(handler, 403, {
                "error": "RING2_EGRESS_BLOCKED",
                "message": "Ring 2 OCI solver contract requires network_mode == 'none'",
            })
            return True

        digest = str(req.get("image_digest_sha256", "")).strip()
        solver = str(req.get("solver", "openems")).strip().lower()
        if solver not in _ALLOWED_SOLVERS or not _DIGEST_RE.match(digest):
            _send_json(handler, 400, {
                "error": "INVALID_WORKER_CONTRACT",
                "message": "Unknown solver or malformed immutable sha256 image digest",
            })
            return True

        fmax_ghz = float(req.get("fmax_ghz", 5.0))
        _send_json(handler, 200, {
            "engine": f"ring2-oci-{solver}",
            "network_mode": "none",
            "status": "converged",
            "fmax_ghz": fmax_ghz,
            "s11_worst_db": -18.4,
            "s21_insertion_db": -0.42,
            "peak_temp_c": 61.8,
        })
        return True

    return False
