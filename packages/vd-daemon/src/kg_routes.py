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


def handle_kg_get(handler: Any, path: str, full_path: str = "") -> bool:
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
            prefix = "C" if "cap" in cat else ("L" if "ind" in cat else ("R" if "res" in cat else "U"))
            existing_refs = set()
            pcb_p = _resolve_project_file({"project_dir": str(proj_dir)}, "pcb_path", ".kicad_pcb", prefer_active=True)
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

                x_mm = float(req.get("x_mm", 44.0))
                y_mm = float(req.get("y_mm", 14.0))
                fp_ref = str(part.get("footprint_ref") or asset_res["footprint_lib_id"])
                step_ref = str(part.get("step_model_ref") or asset_res["step_model_ref"])
                new_fp = [
                    SAtom("footprint"),
                    SStr(fp_ref),
                    [SAtom("layer"), SStr("F.Cu")],
                    [SAtom("uuid"), SStr(new_uuidv7())],
                    [SAtom("at"), SAtom(f"{x_mm:.3f}"), SAtom(f"{y_mm:.3f}"), SAtom("0")],
                    [SAtom("property"), SStr("Reference"), SStr(placed_ref), [SAtom("at"), SAtom("0"), SAtom("-1.4")], [SAtom("layer"), SStr("F.SilkS")], [SAtom("uuid"), SStr(new_uuidv7())]],
                    [SAtom("property"), SStr("Value"), SStr(part["mpn"]), [SAtom("at"), SAtom("0"), SAtom("1.4")], [SAtom("layer"), SStr("F.Fab")], [SAtom("uuid"), SStr(new_uuidv7())]],
                    [SAtom("model"), SStr(step_ref), [SAtom("offset"), [SAtom("xyz"), SAtom("0"), SAtom("0"), SAtom("0")]], [SAtom("scale"), [SAtom("xyz"), SAtom("1"), SAtom("1"), SAtom("1")]], [SAtom("rotate"), [SAtom("xyz"), SAtom("0"), SAtom("0"), SAtom("0")]]],
                ]
                root.append(new_fp)
                pcb_sha = write_text_atomic(pcb_p, format_sexpr(root) + "\n", echo_ring=_BRIDGE.echo_ring)
                with _STATE_LOCK:
                    _ACTIVE_STATE["last_pcb_sha256"] = pcb_sha
                    _ACTIVE_STATE["revision"] += 1
                    rev = _ACTIVE_STATE["revision"]
                broadcast_ws_event({
                    "type": "patch_applied",
                    "revision": rev,
                    "pcb_path": str(pcb_p),
                    "pcb_sha256": pcb_sha,
                    "placed_ref": placed_ref,
                })

            # Bind real LCSC/MPN property inside elec/src/main.ato
            ato_file = proj_dir / "elec" / "src" / "main.ato"
            ato_file.parent.mkdir(parents=True, exist_ok=True)
            prev_ato = ato_file.read_text(encoding="utf-8") if ato_file.is_file() else "module Buck3V3:\n"
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
