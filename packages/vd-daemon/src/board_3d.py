"""KiCad 10 3D Board Mesh & STEP Asset Resolver for vd-daemon (loopback 127.0.0.1 only)."""

from __future__ import annotations

import hashlib
import math
import os
import pathlib
import sqlite3
import threading
from typing import Any, Dict, List, Optional, Tuple

try:
    from .kicad_bridge import (
        _atom_or_str_val,
        _extract_fp_ref_and_val,
        _find_child,
        _find_children,
        _head_tag,
        mm_to_nm,
        parse_sexpr,
        resolve_kicad10_libraries,
    )
except ImportError:
    from kicad_bridge import (
        _atom_or_str_val,
        _extract_fp_ref_and_val,
        _find_child,
        _find_children,
        _head_tag,
        mm_to_nm,
        parse_sexpr,
        resolve_kicad10_libraries,
    )

_STEP_LOCK = threading.Lock()
_STEP_REGISTRY: Dict[str, pathlib.Path] = {}


def kicad_local_to_world_mm(
    fx_mm: float, fy_mm: float, fp_rot_deg: float, lx_mm: float, ly_mm: float
) -> Tuple[float, float]:
    """Exact KiCad Y-down CCW rotation from footprint-local (lx, ly) to board world (wx, wy)."""
    rad = math.radians(fp_rot_deg)
    c = math.cos(rad)
    s = math.sin(rad)
    wx = fx_mm + (c * lx_mm + s * ly_mm)
    wy = fy_mm + (-s * lx_mm + c * ly_mm)
    return round(wx, 6), round(wy, 6)


def _resolve_step_path(raw_model_path: str, project_dir: Optional[pathlib.Path], step_root: Optional[str]) -> Optional[pathlib.Path]:
    if not raw_model_path:
        return None
    cleaned = raw_model_path.strip()
    candidates: List[pathlib.Path] = []
    vars_to_expand = [
        "${KICAD10_3DMODEL_DIR}",
        "${KICAD9_3DMODEL_DIR}",
        "${KICAD8_3DMODEL_DIR}",
        "${KISYS3DMOD}",
    ]
    if step_root:
        for var in vars_to_expand:
            if var in cleaned:
                candidates.append(pathlib.Path(cleaned.replace(var, step_root)))
    if project_dir is not None:
        if "${KIPRJMOD}" in cleaned:
            candidates.append(pathlib.Path(cleaned.replace("${KIPRJMOD}", str(project_dir))))
        candidates.append(project_dir / cleaned)
    direct = pathlib.Path(cleaned)
    if direct.is_absolute():
        candidates.append(direct)

    for cand in candidates:
        if cand.is_file() and cand.suffix.lower() in (".step", ".stp", ".iges", ".igs"):
            return cand.resolve()
        # Try alternate case/suffix (.step <-> .stp) if .wrl was listed in legacy footprint
        if cand.suffix.lower() == ".wrl":
            for alt_ext in (".step", ".stp"):
                alt = cand.with_suffix(alt_ext)
                if alt.is_file():
                    return alt.resolve()
    return None


def register_step_file(step_path: pathlib.Path) -> str:
    data = step_path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    with _STEP_LOCK:
        _STEP_REGISTRY[digest] = step_path.resolve()
    return digest


def lookup_step_file(sha256_hex: str) -> Optional[pathlib.Path]:
    if len(sha256_hex) != 64 or any(c not in "0123456789abcdef" for c in sha256_hex):
        return None
    with _STEP_LOCK:
        p = _STEP_REGISTRY.get(sha256_hex)
    if p is not None and p.is_file():
        return p
    return None


def _parse_xyz(node: Optional[list], default: Tuple[float, float, float]) -> List[float]:
    if not node:
        return list(default)
    xyz = _find_child(node, "xyz")
    if xyz and len(xyz) >= 4:
        try:
            return [float(_atom_or_str_val(xyz[1])), float(_atom_or_str_val(xyz[2])), float(_atom_or_str_val(xyz[3]))]
        except ValueError:
            pass
    return list(default)


def build_board_3d_payload(
    pcb_text: str,
    pcb_path: Optional[pathlib.Path] = None,
    con: Optional[sqlite3.Connection] = None,
) -> Dict[str, Any]:
    libs = resolve_kicad10_libraries()
    step_root = libs.get("KICAD10_3DMODEL_DIR")
    proj_dir = pcb_path.parent if pcb_path else None

    hwir_locks: Dict[str, bool] = {}
    hwir_uuids: Dict[str, str] = {}
    if con is not None:
        try:
            for row in con.execute("SELECT id, refdes, locked FROM components WHERE deleted = 0").fetchall():
                hwir_uuids[str(row[1])] = str(row[0])
                hwir_locks[str(row[1])] = bool(row[2])
        except sqlite3.Error:
            pass

    trees = parse_sexpr(pcb_text)
    if not trees or _head_tag(trees[0]) != "kicad_pcb":
        return {
            "board": {"width_mm": 60.0, "height_mm": 40.0, "thickness_mm": 1.6, "origin_x_mm": 0.0, "origin_y_mm": 0.0},
            "copper_segments": [],
            "pads": [],
            "vias": [],
            "components": [],
            "step_models_resolved": 0,
        }
    root = trees[0]

    thickness_mm = 1.6
    gen = _find_child(root, "general")
    if gen:
        th = _find_child(gen, "thickness")
        if th and len(th) >= 2:
            try:
                thickness_mm = float(_atom_or_str_val(th[1]))
            except ValueError:
                pass

    min_x, min_y, max_x, max_y = 0.0, 0.0, 60.0, 40.0
    found_edge = False
    edge_xs: List[float] = []
    edge_ys: List[float] = []

    for gr in _find_children(root, "gr_rect"):
        lay = _find_child(gr, "layer")
        if lay and len(lay) >= 2 and _atom_or_str_val(lay[1]) == "Edge.Cuts":
            st = _find_child(gr, "start")
            en = _find_child(gr, "end")
            if st and en and len(st) >= 3 and len(en) >= 3:
                x1, y1 = float(_atom_or_str_val(st[1])), float(_atom_or_str_val(st[2]))
                x2, y2 = float(_atom_or_str_val(en[1])), float(_atom_or_str_val(en[2]))
                edge_xs.extend([x1, x2])
                edge_ys.extend([y1, y2])
                found_edge = True

    for gr in _find_children(root, "gr_line"):
        lay = _find_child(gr, "layer")
        if lay and len(lay) >= 2 and _atom_or_str_val(lay[1]) == "Edge.Cuts":
            st = _find_child(gr, "start")
            en = _find_child(gr, "end")
            if st and en and len(st) >= 3 and len(en) >= 3:
                edge_xs.extend([float(_atom_or_str_val(st[1])), float(_atom_or_str_val(en[1]))])
                edge_ys.extend([float(_atom_or_str_val(st[2])), float(_atom_or_str_val(en[2]))])
                found_edge = True

    if found_edge and edge_xs and edge_ys:
        min_x, max_x = min(edge_xs), max(edge_xs)
        min_y, max_y = min(edge_ys), max(edge_ys)

    net_names: Dict[int, str] = {}
    for net_n in _find_children(root, "net"):
        if len(net_n) >= 3:
            try:
                net_names[int(_atom_or_str_val(net_n[1]))] = _atom_or_str_val(net_n[2])
            except ValueError:
                pass

    copper_segments: List[Dict[str, Any]] = []
    for seg in _find_children(root, "segment"):
        st = _find_child(seg, "start")
        en = _find_child(seg, "end")
        wi = _find_child(seg, "width")
        lay = _find_child(seg, "layer")
        nt = _find_child(seg, "net")
        if st and en and len(st) >= 3 and len(en) >= 3:
            net_idx = int(_atom_or_str_val(nt[1])) if (nt and len(nt) >= 2) else 0
            copper_segments.append({
                "x1_mm": float(_atom_or_str_val(st[1])),
                "y1_mm": float(_atom_or_str_val(st[2])),
                "x2_mm": float(_atom_or_str_val(en[1])),
                "y2_mm": float(_atom_or_str_val(en[2])),
                "width_mm": float(_atom_or_str_val(wi[1])) if (wi and len(wi) >= 2) else 0.25,
                "layer": _atom_or_str_val(lay[1]) if (lay and len(lay) >= 2) else "F.Cu",
                "net": net_names.get(net_idx, ""),
            })

    vias: List[Dict[str, Any]] = []
    for via in _find_children(root, "via"):
        at_n = _find_child(via, "at")
        sz_n = _find_child(via, "size")
        dr_n = _find_child(via, "drill")
        nt = _find_child(via, "net")
        if at_n and len(at_n) >= 3:
            net_idx = int(_atom_or_str_val(nt[1])) if (nt and len(nt) >= 2) else 0
            vias.append({
                "x_mm": float(_atom_or_str_val(at_n[1])),
                "y_mm": float(_atom_or_str_val(at_n[2])),
                "size_mm": float(_atom_or_str_val(sz_n[1])) if (sz_n and len(sz_n) >= 2) else 0.6,
                "drill_mm": float(_atom_or_str_val(dr_n[1])) if (dr_n and len(dr_n) >= 2) else 0.3,
                "net": net_names.get(net_idx, ""),
            })

    pads: List[Dict[str, Any]] = []
    components: List[Dict[str, Any]] = []
    step_resolved_count = 0

    for fp in _find_children(root, "footprint"):
        fp_ref = _atom_or_str_val(fp[1]) if len(fp) >= 2 else "Unknown:Footprint"
        refdes, value_str = _extract_fp_ref_and_val(fp)
        if not refdes:
            continue
        u_node = _find_child(fp, "uuid")
        k_uuid = _atom_or_str_val(u_node[1]) if (u_node and len(u_node) >= 2) else refdes
        at_node = _find_child(fp, "at")
        fx_mm = float(_atom_or_str_val(at_node[1])) if (at_node and len(at_node) >= 3) else 0.0
        fy_mm = float(_atom_or_str_val(at_node[2])) if (at_node and len(at_node) >= 3) else 0.0
        rot_deg = float(_atom_or_str_val(at_node[3])) if (at_node and len(at_node) >= 4) else 0.0
        layer_n = _find_child(fp, "layer")
        layer_str = _atom_or_str_val(layer_n[1]) if (layer_n and len(layer_n) >= 2) else "F.Cu"
        side = "bottom" if layer_str.startswith("B.") else "top"
        locked_pcb = _find_child(fp, "locked") is not None
        locked = hwir_locks.get(refdes, locked_pcb) or locked_pcb

        fp_pads_world_x: List[float] = []
        fp_pads_world_y: List[float] = []
        for pad in _find_children(fp, "pad"):
            p_num = _atom_or_str_val(pad[1]) if len(pad) >= 2 else "1"
            p_type = _atom_or_str_val(pad[2]) if len(pad) >= 3 else "smd"
            p_shape = _atom_or_str_val(pad[3]) if len(pad) >= 4 else "rect"
            p_at = _find_child(pad, "at")
            p_sz = _find_child(pad, "size")
            p_dr = _find_child(pad, "drill")
            p_nt = _find_child(pad, "net")
            lx = float(_atom_or_str_val(p_at[1])) if (p_at and len(p_at) >= 3) else 0.0
            ly = float(_atom_or_str_val(p_at[2])) if (p_at and len(p_at) >= 3) else 0.0
            pad_abs_rot = float(_atom_or_str_val(p_at[3])) if (p_at and len(p_at) >= 4) else rot_deg
            wx, wy = kicad_local_to_world_mm(fx_mm, fy_mm, rot_deg, lx, ly)
            sx = float(_atom_or_str_val(p_sz[1])) if (p_sz and len(p_sz) >= 3) else 0.8
            sy = float(_atom_or_str_val(p_sz[2])) if (p_sz and len(p_sz) >= 3) else sx
            drill = float(_atom_or_str_val(p_dr[1])) if (p_dr and len(p_dr) >= 2 and _atom_or_str_val(p_dr[1]) not in ("oval",)) else 0.0
            net_name = _atom_or_str_val(p_nt[2]) if (p_nt and len(p_nt) >= 3) else ""
            fp_pads_world_x.extend([wx - sx * 0.5, wx + sx * 0.5])
            fp_pads_world_y.extend([wy - sy * 0.5, wy + sy * 0.5])
            pads.append({
                "refdes": refdes,
                "number": p_num,
                "type": p_type,
                "shape": p_shape,
                "layer": "B.Cu" if side == "bottom" else "F.Cu",
                "x_mm": wx,
                "y_mm": wy,
                "sx_mm": sx,
                "sy_mm": sy,
                "rot_deg": pad_abs_rot,
                "drill_mm": drill,
                "net": net_name,
            })

        bbox_w = max((max(fp_pads_world_x) - min(fp_pads_world_x)) if fp_pads_world_x else 2.0, 1.8)
        bbox_h = max((max(fp_pads_world_y) - min(fp_pads_world_y)) if fp_pads_world_y else 2.0, 1.4)

        model_n = _find_child(fp, "model")
        step_sha = None
        step_url = None
        step_resolved_path = None
        step_offset = [0.0, 0.0, 0.0]
        step_rotate = [0.0, 0.0, 0.0]
        step_scale = [1.0, 1.0, 1.0]
        raw_model_path = _atom_or_str_val(model_n[1]) if (model_n and len(model_n) >= 2) else ""
        if model_n is not None:
            step_offset = _parse_xyz(_find_child(model_n, "offset"), (0.0, 0.0, 0.0))
            step_rotate = _parse_xyz(_find_child(model_n, "rotate"), (0.0, 0.0, 0.0))
            step_scale = _parse_xyz(_find_child(model_n, "scale"), (1.0, 1.0, 1.0))
            resolved_p = _resolve_step_path(raw_model_path, proj_dir, step_root)
            if resolved_p is not None:
                step_sha = register_step_file(resolved_p)
                step_url = f"/api/v1/3d/step/{step_sha}"
                step_resolved_path = resolved_p.name
                step_resolved_count += 1

        components.append({
            "uuid": k_uuid,
            "hwir_uuid": hwir_uuids.get(refdes, k_uuid),
            "refdes": refdes,
            "value": value_str,
            "footprint": fp_ref,
            "x_nm": mm_to_nm(fx_mm),
            "y_nm": mm_to_nm(fy_mm),
            "rot_mdeg": int(round(rot_deg * 1000.0)),
            "x_mm": fx_mm,
            "y_mm": fy_mm,
            "rot_deg": rot_deg,
            "side": side,
            "locked": locked,
            "bbox_mm": [
                round(fx_mm - bbox_w / 2.0, 4),
                round(fy_mm - bbox_h / 2.0, 4),
                round(fx_mm + bbox_w / 2.0, 4),
                round(fy_mm + bbox_h / 2.0, 4),
            ],
            "body_size_mm": [round(bbox_w, 3), round(bbox_h, 3), 1.6 if "PinHeader" not in fp_ref else 6.0],
            "step_model_raw": raw_model_path,
            "step_model_name": step_resolved_path,
            "step_sha256": step_sha,
            "step_url": step_url,
            "step_offset_mm": step_offset,
            "step_rotate_deg": step_rotate,
            "step_scale": step_scale,
        })

    return {
        "board": {
            "origin_x_mm": round(min_x, 4),
            "origin_y_mm": round(min_y, 4),
            "width_mm": round(max(max_x - min_x, 5.0), 4),
            "height_mm": round(max(max_y - min_y, 5.0), 4),
            "thickness_mm": round(thickness_mm, 4),
        },
        "copper_segments": copper_segments,
        "pads": pads,
        "vias": vias,
        "components": components,
        "step_models_resolved": step_resolved_count,
    }
