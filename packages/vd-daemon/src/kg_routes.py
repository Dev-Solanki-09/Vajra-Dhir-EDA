"""DuckDB Knowledge Graph & LCSC Import REST routes for Prompt 7 (loopback 127.0.0.1 only)."""

from __future__ import annotations

import json
import os
import pathlib
import sqlite3
import sys
import threading
import urllib.parse
from typing import Any, Dict, Optional

_KG_SRC = str(pathlib.Path(__file__).resolve().parents[2] / "kg-brain" / "src")
if _KG_SRC not in sys.path:
    sys.path.insert(0, _KG_SRC)

from catalog_store import (  # noqa: E402
    get_part_details,
    import_jlcparts_sqlite,
    open_kg_connection,
    search_parts,
)
from lcsc_asset_importer import import_lcsc_assets_to_project  # noqa: E402

try:
    from .kicad_bridge import (
        parse_sexpr,
        new_uuidv7,
        write_text_atomic,
        format_sexpr,
        SAtom,
        SStr,
    )
    from .kicad_routes import (
        _ACTIVE_STATE,
        _BRIDGE,
        _STATE_LOCK,
        _ensure_active_workspace,
        _resolve_project_file,
        broadcast_ws_event,
    )
except ImportError:
    from kicad_bridge import (
        parse_sexpr,
        new_uuidv7,
        write_text_atomic,
        format_sexpr,
        SAtom,
        SStr,
    )
    from kicad_routes import (
        _ACTIVE_STATE,
        _BRIDGE,
        _STATE_LOCK,
        _ensure_active_workspace,
        _resolve_project_file,
        broadcast_ws_event,
    )

_FIXTURE_KG_DB = pathlib.Path("fixtures/starter-kg/starter_kg.duckdb")
_KG_LOCK = threading.RLock()


def _kg_db_path() -> pathlib.Path:
    if _FIXTURE_KG_DB.is_file():
        return _FIXTURE_KG_DB
    db_dir = pathlib.Path(os.environ.get("VD_DB_DIR") or ".vd-dev")
    return db_dir / "starter_kg.duckdb"


def _send_json(handler: Any, status: int, body: Dict[str, Any]) -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler._send_cors()
    handler.end_headers()
    handler.wfile.write(json.dumps(body).encode("utf-8"))


def _parse_query(full_path: str) -> Dict[str, str]:
    if "?" not in full_path:
        return {}
    _, qs = full_path.split("?", 1)
    parsed = urllib.parse.parse_qs(qs)
    return {k: v[0] for k, v in parsed.items() if v}


SMART_CIRCUIT_BLOCKS = [
    {
        "id": "usbc_5v_input",
        "name": "USB-C 5V Input w/ 5.1k CC + ESD",
        "category": "Power Input",
        "description": "16-pin USB-C receptacle with dual 5.1k CC1/CC2 pulldown resistors and USBLC6 ESD clamp",
        "components": [
            {"prefix": "J", "value": "USB-C-5V", "mpn": "TYPE-C-31-M-12", "package": "USB_C_16P", "footprint": "Connector_USB:USB_C_Receptacle_HRO_TYPE-C-31-M-12", "dx_mm": 0, "dy_mm": 0, "pins": [{"number": "A4", "name": "VBUS", "net": "VBUS_5V"}, {"number": "A5", "name": "CC1", "net": "USB_CC1"}, {"number": "B5", "name": "CC2", "net": "USB_CC2"}, {"number": "A1", "name": "GND", "net": "GND"}]},
            {"prefix": "R", "value": "5.1k", "mpn": "RC0603FR-075K1L", "package": "0603", "footprint": "Resistor_SMD:R_0603_1608Metric", "dx_mm": 8, "dy_mm": -3, "pins": [{"number": "1", "name": "1", "net": "USB_CC1"}, {"number": "2", "name": "2", "net": "GND"}]},
            {"prefix": "R", "value": "5.1k", "mpn": "RC0603FR-075K1L", "package": "0603", "footprint": "Resistor_SMD:R_0603_1608Metric", "dx_mm": 8, "dy_mm": 3, "pins": [{"number": "1", "name": "1", "net": "USB_CC2"}, {"number": "2", "name": "2", "net": "GND"}]},
        ],
    },
    {
        "id": "ldo_5v_3v3",
        "name": "LDO 5V -> 3.3V Regulated Rail",
        "category": "Power Supply",
        "description": "AMS1117-3.3 / AP2112K-3.3 LDO with 10uF input & 100nF output decoupling",
        "components": [
            {"prefix": "U", "value": "AMS1117-3.3", "mpn": "AMS1117-3.3", "package": "SOT-223", "footprint": "Package_TO_SOT_SMD:SOT-223-3_TabPin2", "dx_mm": 0, "dy_mm": 0, "pins": [{"number": "1", "name": "GND", "net": "GND"}, {"number": "2", "name": "VOUT", "net": "+3V3"}, {"number": "3", "name": "VIN", "net": "VBUS_5V"}]},
            {"prefix": "C", "value": "10uF", "mpn": "CL21A106KAYNNNE", "package": "0805", "footprint": "Capacitor_SMD:C_0805_2012Metric", "dx_mm": -6, "dy_mm": 0, "pins": [{"number": "1", "name": "1", "net": "VBUS_5V"}, {"number": "2", "name": "2", "net": "GND"}]},
            {"prefix": "C", "value": "100nF", "mpn": "CL10B104KB8NNNC", "package": "0603", "footprint": "Capacitor_SMD:C_0603_1608Metric", "dx_mm": 3, "dy_mm": 0, "pins": [{"number": "1", "name": "1", "net": "+3V3"}, {"number": "2", "name": "2", "net": "GND"}]},
        ],
    },
    {
        "id": "sync_buck_3v3",
        "name": "3.3V 3A Synchronous Buck",
        "category": "Power Supply",
        "description": "TPS54302 28V->3.3V 3A Buck with 4.7uH inductor & feedback divider",
        "components": [
            {"prefix": "U", "value": "TPS54302", "mpn": "TPS54302DDCR", "package": "SOT-23-6", "footprint": "Package_TO_SOT_SMD:SOT-23-6", "dx_mm": 0, "dy_mm": 0, "pins": [{"number": "1", "name": "GND", "net": "GND"}, {"number": "2", "name": "SW", "net": "SW_NODE"}, {"number": "3", "name": "VIN", "net": "VBUS_12V"}]},
            {"prefix": "L", "value": "4.7uH", "mpn": "SWPA4020S4R7MT", "package": "4x4mm", "footprint": "Inductor_SMD:L_6.3x6.3_H3", "dx_mm": 8, "dy_mm": 0, "pins": [{"number": "1", "name": "1", "net": "SW_NODE"}, {"number": "2", "name": "2", "net": "+3V3"}]},
            {"prefix": "C", "value": "100nF", "mpn": "CL10B104KB8NNNC", "package": "0603", "footprint": "Capacitor_SMD:C_0603_1608Metric", "dx_mm": -3, "dy_mm": 2, "pins": [{"number": "1", "name": "1", "net": "VBUS_12V"}, {"number": "2", "name": "2", "net": "GND"}]},
        ],
    },
    {
        "id": "i2c_pullups",
        "name": "I2C Bus w/ 4.7k Pull-Ups",
        "category": "Interface",
        "description": "Dual 4.7k I2C SDA/SCL pull-up resistors tied cleanly to +3V3",
        "components": [
            {"prefix": "R", "value": "4.7k", "mpn": "RC0603FR-074K7L", "package": "0603", "footprint": "Resistor_SMD:R_0603_1608Metric", "dx_mm": 0, "dy_mm": -2, "pins": [{"number": "1", "name": "1", "net": "+3V3"}, {"number": "2", "name": "2", "net": "I2C_SDA"}]},
            {"prefix": "R", "value": "4.7k", "mpn": "RC0603FR-074K7L", "package": "0603", "footprint": "Resistor_SMD:R_0603_1608Metric", "dx_mm": 0, "dy_mm": 2, "pins": [{"number": "1", "name": "1", "net": "+3V3"}, {"number": "2", "name": "2", "net": "I2C_SCL"}]},
        ],
    },
    {
        "id": "status_led",
        "name": "Status LED w/ 1k Current-Limit",
        "category": "Indicators",
        "description": "3.3V indicator LED in series with 1k resistor to GND",
        "components": [
            {"prefix": "R", "value": "1k", "mpn": "RC0603FR-071KL", "package": "0603", "footprint": "Resistor_SMD:R_0603_1608Metric", "dx_mm": 0, "dy_mm": 0, "pins": [{"number": "1", "name": "1", "net": "+3V3"}, {"number": "2", "name": "2", "net": "LED_ANODE"}]},
            {"prefix": "D", "value": "LED_GREEN", "mpn": "KT-0603G", "package": "0603", "footprint": "LED_SMD:LED_0603_1608Metric", "dx_mm": 4, "dy_mm": 0, "pins": [{"number": "1", "name": "A", "net": "LED_ANODE"}, {"number": "2", "name": "K", "net": "GND"}]},
        ],
    },
    {
        "id": "esp32_s3_core",
        "name": "ESP32-S3 Minimal Core",
        "category": "MCU / Wireless",
        "description": "ESP32-S3-WROOM-1 module with 100nF local decoupling & EN pullup",
        "components": [
            {"prefix": "U", "value": "ESP32-S3", "mpn": "ESP32-S3-WROOM-1-N16R8", "package": "Module-18x25.5mm", "footprint": "RF_Module:ESP32-S3-WROOM-1", "dx_mm": 0, "dy_mm": 0, "pins": [{"number": "1", "name": "GND", "net": "GND"}, {"number": "2", "name": "3V3", "net": "+3V3"}]},
            {"prefix": "C", "value": "100nF", "mpn": "CL10B104KB8NNNC", "package": "0603", "footprint": "Capacitor_SMD:C_0603_1608Metric", "dx_mm": -3, "dy_mm": 2, "pins": [{"number": "1", "name": "1", "net": "+3V3"}, {"number": "2", "name": "2", "net": "GND"}]},
        ],
    },
    {
        "id": "stm32g4_core",
        "name": "STM32G4 Minimal Core",
        "category": "MCU",
        "description": "STM32G431CBU6 QFN-48 MCU with local 100nF bypass & BOOT0 pulldown",
        "components": [
            {"prefix": "U", "value": "STM32G431", "mpn": "STM32G431CBU6", "package": "QFN-48", "footprint": "Package_DFN_QFN:QFN-48-1EP_7x7mm_P0.5mm_EP5.6x5.6mm", "dx_mm": 0, "dy_mm": 0, "pins": [{"number": "1", "name": "VDD", "net": "+3V3"}, {"number": "2", "name": "VSS", "net": "GND"}]},
            {"prefix": "C", "value": "100nF", "mpn": "CL10B104KB8NNNC", "package": "0603", "footprint": "Capacitor_SMD:C_0603_1608Metric", "dx_mm": -3, "dy_mm": 2, "pins": [{"number": "1", "name": "1", "net": "+3V3"}, {"number": "2", "name": "2", "net": "GND"}]},
        ],
    },
    {
        "id": "inductive_driver",
        "name": "Inductive Driver w/ Flyback Diode",
        "category": "Actuators",
        "description": "Low-side AO3400A N-MOSFET relay/solenoid driver with SMBJ22A flyback protection",
        "components": [
            {"prefix": "Q", "value": "AO3400A", "mpn": "AO3400A", "package": "SOT-23", "footprint": "Package_TO_SOT_SMD:SOT-23", "dx_mm": 0, "dy_mm": 0, "pins": [{"number": "1", "name": "G", "net": "DRV_GATE"}, {"number": "2", "name": "S", "net": "GND"}, {"number": "3", "name": "D", "net": "COIL_LOW"}]},
            {"prefix": "D", "value": "SMBJ22A", "mpn": "SMBJ22A", "package": "SMB", "footprint": "Diode_SMD:D_SMB", "dx_mm": 5, "dy_mm": 0, "pins": [{"number": "1", "name": "K", "net": "VBUS_12V"}, {"number": "2", "name": "A", "net": "COIL_LOW"}]},
        ],
    },
]


def handle_kg_get(handler: Any, path: str, full_path: str = "") -> bool:
    if path in ("/api/v1/blocks/catalog", "/api/blocks/catalog"):
        _send_json(handler, 200, {"blocks": SMART_CIRCUIT_BLOCKS})
        return True

    if path in ("/api/v1/parts/search", "/api/parts/search"):
        q = _parse_query(full_path or getattr(handler, "path", path))
        query = q.get("q", "")
        category = q.get("category", "")
        basic_only = q.get("basic_only", "").lower() in ("1", "true", "yes")
        v_bias = float(q.get("v_bias", "12.0") or "12.0")
        limit = int(q.get("limit", "40") or "40")
        with _KG_LOCK:
            con_kg = open_kg_connection(_kg_db_path())
            try:
                items = search_parts(con_kg, query=query, category=category, basic_only=basic_only, v_bias=v_bias, limit=limit)
            finally:
                con_kg.close()
        _send_json(handler, 200, {
            "engine": "duckdb-jlcparts-kg",
            "v_bias_v": v_bias,
            "count": len(items),
            "results": items,
        })
        return True

    m_prefix = "/api/v1/parts/"
    if path.startswith(m_prefix) and path.endswith("/details"):
        part_key = urllib.parse.unquote(path[len(m_prefix) : -len("/details")].strip("/"))
        q = _parse_query(full_path or getattr(handler, "path", path))
        v_bias = float(q.get("v_bias", "12.0") or "12.0")
        with _KG_LOCK:
            con_kg = open_kg_connection(_kg_db_path())
            try:
                details = get_part_details(con_kg, part_key, v_bias=v_bias)
            finally:
                con_kg.close()
        if not details:
            _send_json(handler, 404, {"error": "PART_NOT_FOUND", "query": part_key})
            return True
        _send_json(handler, 200, details)
        return True

    return False


def handle_kg_post(handler: Any, path: str, req: Dict[str, Any], con: Optional[sqlite3.Connection] = None) -> bool:
    if path in ("/api/v1/blocks/drop", "/api/blocks/drop"):
        block_id = str(req.get("block_id") or "")
        block = next((b for b in SMART_CIRCUIT_BLOCKS if b["id"] == block_id), None)
        if not block:
            _send_json(handler, 404, {"error": "BLOCK_NOT_FOUND", "block_id": block_id})
            return True
        if con is None:
            _send_json(handler, 500, {"error": "DB_UNAVAILABLE"})
            return True
        try:
            from .sync_propagator import commit_tx
        except ImportError:
            from sync_propagator import commit_tx
        base_x_nm = int(round(float(req.get("x_mm", 25.0)) * 1_000_000))
        base_y_nm = int(round(float(req.get("y_mm", 20.0)) * 1_000_000))
        existing = {str(r[0]) for r in con.execute("SELECT refdes FROM components WHERE COALESCE(deleted,0)=0").fetchall()}
        ops = []
        placed_refs = []
        for comp in block["components"]:
            idx = 1
            while f"{comp['prefix']}{idx}" in existing:
                idx += 1
            ref = f"{comp['prefix']}{idx}"
            existing.add(ref)
            placed_refs.append(ref)
            ops.append({
                "op": "ADD_COMPONENT",
                "refdes": ref,
                "value": comp["value"],
                "mpn": comp["mpn"],
                "package": comp["package"],
                "footprint": comp["footprint"],
                "x_nm": base_x_nm + int(comp["dx_mm"] * 1_000_000),
                "y_nm": base_y_nm + int(comp["dy_mm"] * 1_000_000),
                "pins": comp.get("pins", []),
            })
        code, body = commit_tx(con, {"origin_pane_id": "blocks-drawer", "actor_kind": "human", "summary": f"Drop smart block {block['name']}", "ops": ops, "sync_now": True})
        body["placed_refs"] = placed_refs
        body["block_id"] = block_id
        _send_json(handler, code, body)
        return True

    if path in ("/api/v1/parts/import-jlcparts", "/api/parts/import-jlcparts"):
        sqlite_path = pathlib.Path(str(req.get("sqlite_path", "")))
        online_fetch = bool(req.get("online_fetch", False))
        with _KG_LOCK:
            con_kg = open_kg_connection(_kg_db_path())
            try:
                res = import_jlcparts_sqlite(con_kg, sqlite_path, online_fetch=online_fetch)
                _send_json(handler, 200, res)
            except PermissionError as exc:
                _send_json(handler, 403, {"error": "NDA_AIRGAP_VIOLATION", "message": str(exc)})
            except FileNotFoundError as exc:
                _send_json(handler, 404, {"error": "SQLITE_NOT_FOUND", "message": str(exc)})
            finally:
                con_kg.close()
        return True

    m_prefix = "/api/v1/parts/"
    if path.startswith(m_prefix) and path.endswith("/import-assets"):
        part_key = urllib.parse.unquote(path[len(m_prefix) : -len("/import-assets")].strip("/"))
        with _KG_LOCK:
            con_kg = open_kg_connection(_kg_db_path())
            try:
                part = get_part_details(con_kg, part_key, v_bias=float(req.get("v_bias", 12.0)))
            finally:
                con_kg.close()
        if not part:
            _send_json(handler, 404, {"error": "PART_NOT_FOUND", "query": part_key})
            return True

        proj_dir = pathlib.Path(req["project_dir"]) if req.get("project_dir") else _ensure_active_workspace()
        asset_res = import_lcsc_assets_to_project(proj_dir, part, parse_sexpr)

        placed_ref = ""
        if req.get("place", True):
            cat = str(part.get("category", "")).lower()
            prefix = "C" if "cap" in cat else ("L" if "ind" in cat else ("R" if "res" in cat else ("D" if "diode" in cat or "led" in cat else ("J" if "conn" in cat or "hdr" in cat else "U"))))
            existing_refs = set()
            pcb_p = _resolve_project_file({"project_dir": str(proj_dir)}, "pcb_path", ".kicad_pcb", prefer_active=True)
            if con is not None:
                try:
                    existing_refs.update(str(r[0]) for r in con.execute("SELECT refdes FROM components WHERE COALESCE(deleted, 0) = 0").fetchall())
                except Exception:
                    pass
            if pcb_p.is_file():
                trees = parse_sexpr(pcb_p.read_text(encoding="utf-8"))
                root = trees[0]
                for item in root:
                    if isinstance(item, list) and item and isinstance(item[0], SAtom) and item[0].value == "footprint":
                        for prop in item:
                            if isinstance(prop, list) and len(prop) >= 3 and isinstance(prop[0], SAtom) and prop[0].value == "property" and isinstance(prop[1], SStr) and prop[1].value == "Reference":
                                existing_refs.add(prop[2].value)
            req_ref = str(req.get("refdes") or "").strip()
            if req_ref:
                placed_ref = req_ref
            else:
                idx = 1
                while f"{prefix}{idx}" in existing_refs:
                    idx += 1
                placed_ref = f"{prefix}{idx}"

            x_mm = float(req.get("x_mm", 20.0 + (len(existing_refs) % 6) * 8.0))
            y_mm = float(req.get("y_mm", 14.0 + (len(existing_refs) // 6) * 8.0))
            fp_ref = str(part.get("footprint_ref") or asset_res["footprint_lib_id"])

            # Materialize directly through canonical HW-IR TX_COMMIT -> syncs SQLite, .kicad_pcb, .kicad_sch, 3D & BOM!
            if con is not None:
                try:
                    from .sync_propagator import commit_tx
                except ImportError:
                    from sync_propagator import commit_tx
                pins_spec = [
                    {"number": str(p.get("pin") or i + 1), "name": str(p.get("name") or p.get("pin") or i + 1), "type": str(p.get("type") or "passive")}
                    for i, p in enumerate(part.get("pins") or [])
                ] or [{"number": "1", "name": "1", "type": "passive"}, {"number": "2", "name": "2", "type": "passive"}]
                commit_tx(
                    con,
                    {
                        "origin_pane_id": "parts-library",
                        "actor_kind": "human",
                        "summary": f"Place part {placed_ref} ({part['mpn']})",
                        "sync_now": True,
                        "ops": [
                            {
                                "op": "ADD_COMPONENT",
                                "refdes": placed_ref,
                                "value": str(part.get("description") or part["mpn"])[:28],
                                "mpn": str(part["mpn"]),
                                "package": str(part.get("package") or "0603"),
                                "footprint": fp_ref,
                                "x_nm": int(round(x_mm * 1_000_000)),
                                "y_nm": int(round(y_mm * 1_000_000)),
                                "unit_cost_usd": float(part.get("unit_price_usd") or 0.05),
                                "pins": pins_spec,
                            }
                        ],
                    },
                )

            # Bind real LCSC/MPN property inside elec/src/main.ato
            ato_file = proj_dir / "elec" / "src" / "main.ato"
            ato_file.parent.mkdir(parents=True, exist_ok=True)
            prev_ato = ato_file.read_text(encoding="utf-8") if ato_file.is_file() else "module Main:\n"
            eff = part.get("effective_at_v_bias")
            extra_comment = f'  # c_eff@{eff["v_dc"]}V={eff["c_eff_uf"]}uF' if eff else ""
            if f"component {placed_ref} " not in prev_ato:
                addition = (
                    f'    component {placed_ref} "{part["mpn"]}"{extra_comment}\n'
                    f'    {placed_ref}.lcsc_id = "{part["lcsc_id"]}"\n'
                    f'    {placed_ref}.mpn = "{part["mpn"]}"\n'
                )
                ato_file.write_text(prev_ato.rstrip() + "\n" + addition, encoding="utf-8")

        asset_res["placed_refdes"] = placed_ref
        _send_json(handler, 200, asset_res)
        return True

    return False
