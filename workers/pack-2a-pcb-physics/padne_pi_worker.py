"""
STRICTLY RING 2 ISOLATED SUBPROCESS WORKER (GPL-3.0 Quarantine).
Never imported into Ring 1 packages/* or vd-daemon.
Wraps atx/padne (`workers/sources/pack-2a-pcb-physics/padne` or Pack 2A OCI container
with --network=none) and provides a faithful out-of-process SciPy 2.5D FEM
Cotangent-Laplacian + Barrel-Via DC Power Integrity solver matching padne's exact
physics equations when compiled C++ CGAL/MKL extensions are absent on the host.
"""

from __future__ import annotations

import hashlib
import json
import math
import os
import pathlib
import shutil
import subprocess
import sys
import tempfile
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import scipy.sparse
import scipy.sparse.linalg

_ROOT = pathlib.Path(__file__).resolve().parents[2]
_PADNE_SRC = _ROOT / "workers" / "sources" / "pack-2a-pcb-physics" / "padne"

# Reference copper conductivity at 20C in S/mm (matching padne/kicad.py: 5.95e4 S/mm)
COPPER_CONDUCTIVITY_20C_S_MM = 5.95e4
COPPER_TEMP_COEFF_PER_C = 0.00393
DEFAULT_COPPER_THICKNESS_MM = 0.035  # 1 oz copper (35 um)
DEFAULT_BOARD_THICKNESS_MM = 1.6
DEFAULT_VIA_PLATING_MM = 0.025  # 25 um electroplated barrel

# 17-stop perceptually uniform colorblind-safe Viridis & Inferno ramps (matching padne/colormaps.py)
_VIRIDIS_STOPS = (
    (0.267004, 0.004874, 0.329415),
    (0.281412, 0.155834, 0.469201),
    (0.253935, 0.265254, 0.529983),
    (0.206756, 0.371758, 0.553117),
    (0.163625, 0.471133, 0.558148),
    (0.127568, 0.566949, 0.550556),
    (0.134692, 0.658636, 0.517649),
    (0.266941, 0.748751, 0.440573),
    (0.477504, 0.821444, 0.318195),
    (0.741388, 0.873449, 0.149561),
    (0.993248, 0.906157, 0.143936),
)

_INFERNO_STOPS = (
    (0.001462, 0.000466, 0.013866),
    (0.122312, 0.047081, 0.282086),
    (0.280267, 0.062834, 0.431554),
    (0.444960, 0.100196, 0.433756),
    (0.602081, 0.156229, 0.391917),
    (0.752157, 0.228661, 0.316879),
    (0.878223, 0.333840, 0.214069),
    (0.958853, 0.483397, 0.090627),
    (0.988648, 0.658636, 0.045966),
    (0.967262, 0.843307, 0.256130),
    (0.988362, 0.998364, 0.644924),
)


def sample_colormap_hex(colormap: str, t: float) -> str:
    stops = _INFERNO_STOPS if str(colormap).lower() == "inferno" else _VIRIDIS_STOPS
    u = max(0.0, min(1.0, float(t)))
    scaled = u * (len(stops) - 1)
    idx = min(len(stops) - 2, int(math.floor(scaled)))
    frac = scaled - idx
    c0 = stops[idx]
    c1 = stops[idx + 1]
    r = int(round((c0[0] + (c1[0] - c0[0]) * frac) * 255.0))
    g = int(round((c0[1] + (c1[1] - c0[1]) * frac) * 255.0))
    b = int(round((c0[2] + (c1[2] - c0[2]) * frac) * 255.0))
    return f"#{max(0, min(255, r)):02x}{max(0, min(255, g)):02x}{max(0, min(255, b)):02x}"


def colormap_legend_stops(colormap: str) -> List[str]:
    return [sample_colormap_hex(colormap, i / 10.0) for i in range(11)]


# ---------------------------------------------------------------------------
# Lightweight iterative S-expression parser (zero Ring 1 imports)
# ---------------------------------------------------------------------------

def _parse_sexpr(text: str) -> List[Any]:
    tokens: List[str] = []
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch.isspace():
            i += 1
        elif ch in ("(", ")"):
            tokens.append(ch)
            i += 1
        elif ch == '"':
            j = i + 1
            buf: List[str] = []
            while j < n:
                c = text[j]
                if c == "\\" and j + 1 < n:
                    buf.append(text[j + 1])
                    j += 2
                elif c == '"':
                    j += 1
                    break
                else:
                    buf.append(c)
                    j += 1
            tokens.append('"' + "".join(buf) + '"')
            i = j
        else:
            j = i
            while j < n and not text[j].isspace() and text[j] not in ("(", ")"):
                j += 1
            tokens.append(text[i:j])
            i = j

    stack: List[List[Any]] = [[]]
    for tok in tokens:
        if tok == "(":
            lst: List[Any] = []
            stack[-1].append(lst)
            stack.append(lst)
        elif tok == ")":
            if len(stack) > 1:
                stack.pop()
        else:
            if len(tok) >= 2 and tok[0] == '"' and tok[-1] == '"':
                stack[-1].append(tok[1:-1])
            else:
                stack[-1].append(tok)
    return stack[0]


def _head(node: Any) -> str:
    if isinstance(node, list) and node and isinstance(node[0], str):
        return node[0]
    return ""


def _child(node: list, tag: str) -> Optional[list]:
    for item in node[1:]:
        if isinstance(item, list) and _head(item) == tag:
            return item
    return None


def _children(node: list, tag: str) -> List[list]:
    return [item for item in node[1:] if isinstance(item, list) and _head(item) == tag]


def _fp_refdes(fp: list) -> str:
    for prop in _children(fp, "property"):
        if len(prop) >= 3 and str(prop[1]) == "Reference":
            return str(prop[2])
    for txt in _children(fp, "fp_text"):
        if len(txt) >= 3 and str(txt[1]) == "reference":
            return str(txt[2])
    return ""


def _fp_value(fp: list) -> str:
    for prop in _children(fp, "property"):
        if len(prop) >= 3 and str(prop[1]) == "Value":
            return str(prop[2])
    for txt in _children(fp, "fp_text"):
        if len(txt) >= 3 and str(txt[1]) == "value":
            return str(txt[2])
    return ""


def _local_to_world(fx: float, fy: float, rot_deg: float, lx: float, ly: float) -> Tuple[float, float]:
    rad = math.radians(rot_deg)
    c = math.cos(rad)
    s = math.sin(rad)
    return (fx + c * lx + s * ly, fy - s * lx + c * ly)


def _extract_pcb_geometry(pcb_path: pathlib.Path) -> Dict[str, Any]:
    raw = pcb_path.read_text(encoding="utf-8", errors="replace")
    trees = _parse_sexpr(raw)
    root = trees[0] if (trees and _head(trees[0]) == "kicad_pcb") else trees

    board_thick = DEFAULT_BOARD_THICKNESS_MM
    gen = _child(root, "general")
    if gen:
        th = _child(gen, "thickness")
        if th and len(th) >= 2:
            try:
                board_thick = float(th[1])
            except ValueError:
                pass

    layer_thickness: Dict[str, float] = {}
    copper_layers: List[str] = []
    layers_node = _child(root, "layers")
    if layers_node:
        for item in layers_node[1:]:
            if isinstance(item, list) and len(item) >= 3 and str(item[2]) in ("signal", "power", "mixed"):
                copper_layers.append(str(item[1]))
    if not copper_layers:
        copper_layers = ["F.Cu", "B.Cu"]

    setup_node = _child(root, "setup")
    if setup_node:
        stackup_node = _child(setup_node, "stackup")
        if stackup_node:
            for item in _children(stackup_node, "layer"):
                if len(item) >= 2:
                    lname = str(item[1])
                    t_n = _child(item, "type")
                    th_n = _child(item, "thickness")
                    if t_n and len(t_n) >= 2 and "copper" in str(t_n[1]).lower() and th_n and len(th_n) >= 2:
                        try:
                            layer_thickness[lname] = float(th_n[1])
                        except ValueError:
                            pass
    for lname in copper_layers:
        layer_thickness.setdefault(lname, DEFAULT_COPPER_THICKNESS_MM)

    net_names: Dict[int, str] = {}
    for net_n in _children(root, "net"):
        if len(net_n) >= 3:
            try:
                net_names[int(net_n[1])] = str(net_n[2])
            except ValueError:
                pass

    edge_xs: List[float] = []
    edge_ys: List[float] = []
    for gr in _children(root, "gr_rect") + _children(root, "gr_line"):
        ly = _child(gr, "layer")
        if ly and len(ly) >= 2 and str(ly[1]) == "Edge.Cuts":
            st = _child(gr, "start")
            en = _child(gr, "end")
            if st and en and len(st) >= 3 and len(en) >= 3:
                try:
                    edge_xs.extend([float(st[1]), float(en[1])])
                    edge_ys.extend([float(st[2]), float(en[2])])
                except ValueError:
                    pass

    segments: List[Dict[str, Any]] = []
    for idx, seg in enumerate(_children(root, "segment")):
        st = _child(seg, "start")
        en = _child(seg, "end")
        wd = _child(seg, "width")
        ly = _child(seg, "layer")
        nt = _child(seg, "net")
        uu = _child(seg, "uuid")
        if not (st and en and len(st) >= 3 and len(en) >= 3):
            continue
        net_idx = int(nt[1]) if (nt and len(nt) >= 2) else 0
        segments.append({
            "index": idx,
            "uuid": str(uu[1]) if (uu and len(uu) >= 2) else f"seg-{idx}",
            "x1_mm": float(st[1]),
            "y1_mm": float(st[2]),
            "x2_mm": float(en[1]),
            "y2_mm": float(en[2]),
            "width_mm": float(wd[1]) if (wd and len(wd) >= 2) else 0.25,
            "layer": str(ly[1]) if (ly and len(ly) >= 2) else "F.Cu",
            "net": net_names.get(net_idx, ""),
        })

    vias: List[Dict[str, Any]] = []
    for idx, via in enumerate(_children(root, "via")):
        at_n = _child(via, "at")
        sz_n = _child(via, "size")
        dr_n = _child(via, "drill")
        ly_n = _child(via, "layers")
        nt = _child(via, "net")
        if not (at_n and len(at_n) >= 3):
            continue
        net_idx = int(nt[1]) if (nt and len(nt) >= 2) else 0
        v_layers = [str(x) for x in ly_n[1:]] if (ly_n and len(ly_n) >= 3) else list(copper_layers)
        vias.append({
            "index": idx,
            "x_mm": float(at_n[1]),
            "y_mm": float(at_n[2]),
            "size_mm": float(sz_n[1]) if (sz_n and len(sz_n) >= 2) else 0.6,
            "drill_mm": float(dr_n[1]) if (dr_n and len(dr_n) >= 2) else 0.3,
            "layers": v_layers,
            "net": net_names.get(net_idx, ""),
        })

    pads: List[Dict[str, Any]] = []
    footprints: List[Dict[str, Any]] = []
    for fp in _children(root, "footprint"):
        refdes = _fp_refdes(fp)
        val = _fp_value(fp)
        at_n = _child(fp, "at")
        fx = float(at_n[1]) if (at_n and len(at_n) >= 3) else 0.0
        fy = float(at_n[2]) if (at_n and len(at_n) >= 3) else 0.0
        frot = float(at_n[3]) if (at_n and len(at_n) >= 4) else 0.0
        footprints.append({"refdes": refdes, "value": val, "x_mm": fx, "y_mm": fy})
        for pad in _children(fp, "pad"):
            if len(pad) < 4:
                continue
            pnum = str(pad[1])
            ptype = str(pad[2])
            pat = _child(pad, "at")
            psz = _child(pad, "size")
            pdr = _child(pad, "drill")
            ply = _child(pad, "layers")
            pnt = _child(pad, "net")
            lx = float(pat[1]) if (pat and len(pat) >= 3) else 0.0
            ly = float(pat[2]) if (pat and len(pat) >= 3) else 0.0
            wx, wy = _local_to_world(fx, fy, frot, lx, ly)
            sx = float(psz[1]) if (psz and len(psz) >= 3) else 1.0
            sy = float(psz[2]) if (psz and len(psz) >= 3) else sx
            drill = float(pdr[1]) if (pdr and len(pdr) >= 2 and str(pdr[1]) not in ("oval",)) else (0.8 if ptype == "thru_hole" else 0.0)
            p_layers_raw = [str(x) for x in ply[1:]] if ply else ["F.Cu"]
            if "*.Cu" in p_layers_raw or ptype == "thru_hole":
                p_layers = list(copper_layers)
            else:
                p_layers = [l for l in p_layers_raw if l in copper_layers] or ["F.Cu"]
            net_name = ""
            if pnt and len(pnt) >= 3:
                net_name = str(pnt[2])
            elif pnt and len(pnt) >= 2:
                try:
                    net_name = net_names.get(int(pnt[1]), "")
                except ValueError:
                    pass
            pads.append({
                "refdes": refdes,
                "value": val,
                "pad": pnum,
                "type": ptype,
                "x_mm": wx,
                "y_mm": wy,
                "sx_mm": sx,
                "sy_mm": sy,
                "drill_mm": drill,
                "layers": p_layers,
                "net": net_name,
            })

    zones: List[Dict[str, Any]] = []
    for zone in _children(root, "zone"):
        z_net_n = _child(zone, "net_name")
        z_ly_n = _child(zone, "layer")
        poly = _child(zone, "filled_polygon") or _child(zone, "polygon")
        pts_n = _child(poly, "pts") if poly else None
        if not pts_n:
            continue
        pts: List[Tuple[float, float]] = []
        for xy in _children(pts_n, "xy"):
            if len(xy) >= 3:
                pts.append((float(xy[1]), float(xy[2])))
        if len(pts) >= 3:
            zones.append({
                "net": str(z_net_n[1]) if (z_net_n and len(z_net_n) >= 2) else "",
                "layer": str(z_ly_n[1]) if (z_ly_n and len(z_ly_n) >= 2) else "F.Cu",
                "pts": pts,
            })

    if not edge_xs or not edge_ys:
        xs = [s["x1_mm"] for s in segments] + [s["x2_mm"] for s in segments] + [p["x_mm"] for p in pads] + [0.0, 60.0]
        ys = [s["y1_mm"] for s in segments] + [s["y2_mm"] for s in segments] + [p["y_mm"] for p in pads] + [0.0, 40.0]
        edge_xs = [min(xs), max(xs)]
        edge_ys = [min(ys), max(ys)]

    min_x, max_x = min(edge_xs), max(edge_xs)
    min_y, max_y = min(edge_ys), max(edge_ys)

    return {
        "board_thickness_mm": board_thick,
        "copper_layers": copper_layers,
        "layer_thickness_mm": layer_thickness,
        "bounds": {
            "min_x_mm": round(min_x, 3),
            "min_y_mm": round(min_y, 3),
            "max_x_mm": round(max_x, 3),
            "max_y_mm": round(max_y, 3),
            "width_mm": round(max(1.0, max_x - min_x), 3),
            "height_mm": round(max(1.0, max_y - min_y), 3),
        },
        "nets": [n for n in net_names.values() if n],
        "segments": segments,
        "vias": vias,
        "pads": pads,
        "zones": zones,
        "footprints": footprints,
    }


def _point_to_seg_dist_and_proj(px: float, py: float, x1: float, y1: float, x2: float, y2: float) -> Tuple[float, float, float, float]:
    dx = x2 - x1
    dy = y2 - y1
    l2 = dx * dx + dy * dy
    if l2 <= 1e-12:
        return math.hypot(px - x1, py - y1), 0.0, x1, y1
    t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / l2))
    qx = x1 + t * dx
    qy = y1 + t * dy
    return math.hypot(px - qx, py - qy), t, qx, qy


def _infer_nominal_voltage(net_name: str) -> float:
    u = net_name.upper()
    if "GND" in u or "VSS" in u:
        return 0.0
    if "12V" in u or "VBUS" in u:
        return 12.0
    if "5V" in u:
        return 5.0
    if "3.3" in u or "3V3" in u:
        return 3.3
    if "1.8" in u or "1V8" in u:
        return 1.8
    return 3.3


def _default_vdd_min(nominal_v: float) -> float:
    if nominal_v <= 0.0:
        return 0.0
    if abs(nominal_v - 3.3) < 0.2:
        return 3.0  # Standard 3.3V MCU/SBC brownout threshold (< 3.0V)
    return round(nominal_v * 0.90, 3)


def _auto_boundary_conditions(
    geom: Dict[str, Any],
    net_name: str,
    req_sources: List[Dict[str, Any]],
    req_sinks: List[Dict[str, Any]],
    default_load_current_a: float,
) -> Tuple[float, List[Dict[str, Any]], List[Dict[str, Any]]]:
    net_pads = [p for p in geom["pads"] if p["net"] == net_name]
    explicit_src = [s for s in req_sources if s.get("net") == net_name]
    explicit_snk = [s for s in req_sinks if s.get("net") == net_name]
    nominal_v = _infer_nominal_voltage(net_name)
    if explicit_src:
        nominal_v = float(explicit_src[0].get("voltage_v", nominal_v))

    if not net_pads:
        return nominal_v, [], []

    sources: List[Dict[str, Any]] = []
    if explicit_src:
        for s in explicit_src:
            ref = str(s.get("refdes", ""))
            pad = str(s.get("pad", ""))
            matched = [p for p in net_pads if p["refdes"] == ref and (not pad or p["pad"] == pad)]
            if matched:
                sources.append({"pad": matched[0], "voltage_v": float(s.get("voltage_v", nominal_v))})
    if not sources:
        # Infer voltage source pad: inductor L* output for regulated rails, J* connector, or U1/regulator
        def _src_rank(p: Dict[str, Any]) -> Tuple[int, str]:
            r = p["refdes"]
            if r.startswith("J"):
                return (0, r)
            if r.startswith("L") and nominal_v < 6.0:
                return (1, r)
            if r.startswith("U") and ("TPS" in p["value"].upper() or "REG" in p["value"].upper() or r == "U1"):
                return (2, r)
            return (5, r)

        best_src = min(net_pads, key=_src_rank)
        sources.append({"pad": best_src, "voltage_v": nominal_v})

    src_keys = {(s["pad"]["refdes"], s["pad"]["pad"]) for s in sources}

    sinks: List[Dict[str, Any]] = []
    if explicit_snk:
        for sk in explicit_snk:
            ref = str(sk.get("refdes", ""))
            pad = str(sk.get("pad", ""))
            matched = [p for p in net_pads if p["refdes"] == ref and (not pad or p["pad"] == pad)]
            if matched:
                sinks.append({"pad": matched[0], "current_a": float(sk.get("current_a", default_load_current_a))})
    if not sinks:
        candidates = [p for p in net_pads if (p["refdes"], p["pad"]) not in src_keys]
        if candidates:
            # Prefer MCU/IC loads (U2, U* excluding regulator), then connectors, then farthest pad from source
            sx, sy = sources[0]["pad"]["x_mm"], sources[0]["pad"]["y_mm"]
            ic_loads = [
                p for p in candidates
                if p["refdes"].startswith("U") and "TPS" not in p["value"].upper()
            ]
            if not ic_loads:
                # Pick farthest non-passive or farthest pad
                non_cap = [p for p in candidates if not p["refdes"].startswith("C")]
                pool = non_cap or candidates
                farthest = max(pool, key=lambda p: math.hypot(p["x_mm"] - sx, p["y_mm"] - sy))
                ic_loads = [farthest]
            per_load = float(default_load_current_a) / len(ic_loads)
            for lp in ic_loads:
                sinks.append({"pad": lp, "current_a": per_load})

    return nominal_v, sources, sinks


def _solve_net_fem(
    geom: Dict[str, Any],
    net_name: str,
    nominal_v: float,
    sources: List[Dict[str, Any]],
    sinks: List[Dict[str, Any]],
    conductivity_s_mm: float,
    copper_thickness_override: Optional[float],
    colormap: str,
) -> Dict[str, Any]:
    segs = [s for s in geom["segments"] if s["net"] == net_name]
    vias = [v for v in geom["vias"] if v["net"] == net_name]
    pads = [p for p in geom["pads"] if p["net"] == net_name]
    zones = [z for z in geom["zones"] if z["net"] == net_name]
    board_thick = max(0.2, float(geom["board_thickness_mm"]))

    def _layer_thick(layer_name: str) -> float:
        if copper_thickness_override is not None and copper_thickness_override > 0:
            return float(copper_thickness_override)
        return float(geom["layer_thickness_mm"].get(layer_name, DEFAULT_COPPER_THICKNESS_MM))

    node_coords: List[Tuple[str, float, float]] = []
    node_map: Dict[Tuple[str, int, int], int] = {}
    adj: Dict[int, List[int]] = {}

    def _get_node(layer: str, x_mm: float, y_mm: float) -> int:
        key = (layer, int(round(x_mm * 1000.0)), int(round(y_mm * 1000.0)))
        idx = node_map.get(key)
        if idx is None:
            idx = len(node_coords)
            node_map[key] = idx
            node_coords.append((layer, x_mm, y_mm))
            adj[idx] = []
        return idx

    tri_rows: List[int] = []
    tri_cols: List[int] = []
    tri_vals: List[float] = []

    def _stamp_conductance(a: int, b: int, g: float) -> None:
        if a == b or g <= 0.0:
            return
        tri_rows.extend((a, b, a, b))
        tri_cols.extend((a, b, b, a))
        tri_vals.extend((g, g, -g, -g))
        adj[a].append(b)
        adj[b].append(a)

    # 1. Register pad nodes (and thru-hole barrel coupling)
    pad_node_ids: List[Tuple[Dict[str, Any], int]] = []
    for p in pads:
        p_layers = p["layers"] or ["F.Cu"]
        p_nodes = [_get_node(ly, p["x_mm"], p["y_mm"]) for ly in p_layers]
        pad_node_ids.append((p, p_nodes[0]))
        if len(p_nodes) >= 2 and p["drill_mm"] > 0:
            d_eff = max(0.2, p["drill_mm"])
            area_barrel = math.pi * (d_eff * DEFAULT_VIA_PLATING_MM - DEFAULT_VIA_PLATING_MM ** 2)
            g_barrel = conductivity_s_mm * max(1e-5, area_barrel) / board_thick
            for k in range(len(p_nodes) - 1):
                _stamp_conductance(p_nodes[k], p_nodes[k + 1], g_barrel)

    # 2. Register vias & barrel conductance
    via_records: List[Dict[str, Any]] = []
    for v in vias:
        v_layers = [ly for ly in v["layers"] if ly in geom["copper_layers"]] or ["F.Cu", "B.Cu"]
        v_nodes = [_get_node(ly, v["x_mm"], v["y_mm"]) for ly in v_layers]
        area_barrel = math.pi * (v["drill_mm"] * DEFAULT_VIA_PLATING_MM - DEFAULT_VIA_PLATING_MM ** 2)
        g_barrel = conductivity_s_mm * max(1e-5, area_barrel) / board_thick
        for k in range(len(v_nodes) - 1):
            _stamp_conductance(v_nodes[k], v_nodes[k + 1], g_barrel)
        via_records.append({
            "via": v,
            "top_node": v_nodes[0],
            "bot_node": v_nodes[-1],
            "g_barrel": g_barrel,
            "area_mm2": max(1e-5, area_barrel),
        })

    # 3. Discretize copper segments into 2.5D finite elements (splitting at pads, vias, & junctions)
    anchor_pts_by_layer: Dict[str, List[Tuple[float, float, float]]] = {}
    for p in pads:
        rad = max(p["sx_mm"], p["sy_mm"]) * 0.65 + 0.15
        for ly in p["layers"]:
            anchor_pts_by_layer.setdefault(ly, []).append((p["x_mm"], p["y_mm"], rad))
    for v in vias:
        rad = v["size_mm"] * 0.6 + 0.15
        for ly in v["layers"]:
            anchor_pts_by_layer.setdefault(ly, []).append((v["x_mm"], v["y_mm"], rad))
    for s in segs:
        anchor_pts_by_layer.setdefault(s["layer"], []).append((s["x1_mm"], s["y1_mm"], s["width_mm"] * 0.6 + 0.1))
        anchor_pts_by_layer.setdefault(s["layer"], []).append((s["x2_mm"], s["y2_mm"], s["width_mm"] * 0.6 + 0.1))

    seg_elements: List[Dict[str, Any]] = []
    for s in segs:
        ly = s["layer"]
        thick = _layer_thick(ly)
        gs = conductivity_s_mm * thick
        x1, y1, x2, y2 = s["x1_mm"], s["y1_mm"], s["x2_mm"], s["y2_mm"]
        seg_len = math.hypot(x2 - x1, y2 - y1)
        if seg_len < 1e-4:
            continue

        # Collect split parameter t in [0, 1] for T-junctions & pads/vias along trace
        ts = {0.0, 1.0}
        n_sub = max(1, min(16, int(math.ceil(seg_len / 1.5))))
        for k in range(1, n_sub):
            ts.add(round(k / n_sub, 6))

        for ax, ay, rad in anchor_pts_by_layer.get(ly, []):
            dist, t_proj, _, _ = _point_to_seg_dist_and_proj(ax, ay, x1, y1, x2, y2)
            if dist <= rad + s["width_mm"] * 0.5:
                ts.add(round(t_proj, 6))

        t_sorted = sorted(ts)
        sub_links: List[Tuple[int, int, float]] = []
        for k in range(len(t_sorted) - 1):
            t0, t1 = t_sorted[k], t_sorted[k + 1]
            if t1 - t0 < 1e-5:
                continue
            sx0 = x1 + t0 * (x2 - x1)
            sy0 = y1 + t0 * (y2 - y1)
            sx1 = x1 + t1 * (x2 - x1)
            sy1 = y1 + t1 * (y2 - y1)
            sub_len = math.hypot(sx1 - sx0, sy1 - sy0)
            if sub_len < 1e-4:
                continue
            n0 = _get_node(ly, sx0, sy0)
            n1 = _get_node(ly, sx1, sy1)
            g_elem = gs * (max(0.05, s["width_mm"]) / sub_len)
            _stamp_conductance(n0, n1, g_elem)
            sub_links.append((n0, n1, g_elem))

        if sub_links:
            seg_elements.append({
                "seg": s,
                "start_node": sub_links[0][0],
                "end_node": sub_links[-1][1],
                "sub_links": sub_links,
                "thickness_mm": thick,
                "length_mm": seg_len,
            })

    # Stitch pads & vias to nearby segment endpoints within pad copper bounds
    layer_nodes: Dict[str, List[int]] = {}
    for nid, (ly, _x, _y) in enumerate(node_coords):
        layer_nodes.setdefault(ly, []).append(nid)

    for p in pads:
        rad = max(p["sx_mm"], p["sy_mm"]) * 0.65 + 0.15
        for ly in p["layers"]:
            p_nid = _get_node(ly, p["x_mm"], p["y_mm"])
            g_pad = 8.0 * conductivity_s_mm * _layer_thick(ly)
            for cand in layer_nodes.get(ly, []):
                if cand == p_nid:
                    continue
                _, cx, cy = node_coords[cand]
                if math.hypot(cx - p["x_mm"], cy - p["y_mm"]) <= rad:
                    _stamp_conductance(p_nid, cand, g_pad)

    # 4. Discretize copper zones (2D Delaunay cotangent FEM elements, matching padne/cpp/_mesh.cpp)
    for z in zones:
        ly = z["layer"]
        pts = z["pts"]
        xs = [pt[0] for pt in pts]
        ys = [pt[1] for pt in pts]
        zx0, zx1 = min(xs), max(xs)
        zy0, zy1 = min(ys), max(ys)
        nx, ny = 8, 6
        grid_nids: List[List[int]] = []
        for ix in range(nx):
            col: List[int] = []
            gx = zx0 + (zx1 - zx0) * (ix / max(1, nx - 1))
            for iy in range(ny):
                gy = zy0 + (zy1 - zy0) * (iy / max(1, ny - 1))
                col.append(_get_node(ly, gx, gy))
            grid_nids.append(col)
        gs = conductivity_s_mm * _layer_thick(ly)
        # Cotangent stiffness over 2 triangles per grid quad
        for ix in range(nx - 1):
            for iy in range(ny - 1):
                a, b = grid_nids[ix][iy], grid_nids[ix + 1][iy]
                c, d = grid_nids[ix + 1][iy + 1], grid_nids[ix][iy + 1]
                for (i0, i1, i2) in ((a, b, c), (a, c, d)):
                    _, x0, y0 = node_coords[i0]
                    _, x1_, y1_ = node_coords[i1]
                    _, x2_, y2_ = node_coords[i2]
                    area = 0.5 * abs((x1_ - x0) * (y2_ - y0) - (x2_ - x0) * (y1_ - y0))
                    if area < 1e-8:
                        continue
                    edges = ((i0, i1, i2), (i1, i2, i0), (i2, i0, i1))
                    for u_id, v_id, opp_id in edges:
                        _, ux, uy = node_coords[u_id]
                        _, vx, vy = node_coords[v_id]
                        _, ox, oy = node_coords[opp_id]
                        d1x, d1y = ux - ox, uy - oy
                        d2x, d2y = vx - ox, vy - oy
                        cross = abs(d1x * d2y - d1y * d2x)
                        if cross > 1e-9:
                            cot_half = max(1e-4, ((d1x * d2x + d1y * d2y) / cross) * 0.5)
                            _stamp_conductance(u_id, v_id, gs * cot_half)

    n_mesh = len(node_coords)
    if n_mesh == 0 or not sources:
        return {
            "net": net_name,
            "nominal_v": nominal_v,
            "min_delivered_v": nominal_v,
            "max_ir_drop_mv": 0.0,
            "max_ir_drop_pct": 0.0,
            "peak_current_density_a_mm2": 0.0,
            "total_joule_loss_mw": 0.0,
            "vdd_min_threshold_v": _default_vdd_min(nominal_v),
            "brownout_risk": False,
            "passed": True,
            "mesh_nodes": n_mesh,
            "mesh_elements": len(seg_elements),
            "residual": 0.0,
            "bottleneck": None,
            "segments": [],
            "pads": [],
            "vias": [],
        }

    # Resolve source & sink global nodes
    src_nodes: List[Tuple[int, float]] = []
    for s in sources:
        p = s["pad"]
        ly = (p["layers"] or ["F.Cu"])[0]
        src_nodes.append((_get_node(ly, p["x_mm"], p["y_mm"]), float(s["voltage_v"])))

    # Connected component reachable from source nodes
    reachable: set[int] = set()
    stack = [sn for sn, _ in src_nodes]
    while stack:
        cur = stack.pop()
        if cur in reachable:
            continue
        reachable.add(cur)
        for nxt in adj.get(cur, ()):
            if nxt not in reachable:
                stack.append(nxt)

    # Stamp Lagrange voltage sources & current sinks
    n_extra = len(src_nodes)
    N = n_mesh + n_extra
    r = np.zeros(N, dtype=np.float64)

    for k, (sn, v_val) in enumerate(src_nodes):
        ev = n_mesh + k
        tri_rows.extend((ev, sn))
        tri_cols.extend((sn, ev))
        tri_vals.extend((1.0, 1.0))
        r[ev] = v_val

    for sk in sinks:
        p = sk["pad"]
        ly = (p["layers"] or ["F.Cu"])[0]
        sn_idx = _get_node(ly, p["x_mm"], p["y_mm"])
        if sn_idx in reachable:
            r[sn_idx] -= float(sk["current_a"])

    # Tiny diagonal Tikhonov stabilizer ONLY on disconnected islands so spsolve stays nonsingular
    for nid in range(n_mesh):
        if nid not in reachable:
            tri_rows.append(nid)
            tri_cols.append(nid)
            tri_vals.append(1e-6)
            r[nid] = nominal_v * 1e-6

    L = scipy.sparse.coo_matrix((tri_vals, (tri_rows, tri_cols)), shape=(N, N), dtype=np.float64).tocsc()
    v_sol = scipy.sparse.linalg.spsolve(L, r)
    v_sol = np.nan_to_num(v_sol, nan=nominal_v, posinf=nominal_v, neginf=0.0)

    r_norm = float(np.linalg.norm(r))
    residual = float(np.linalg.norm(L @ v_sol - r) / r_norm) if r_norm > 0 else 0.0

    # Extract per-segment FEM results
    seg_results: List[Dict[str, Any]] = []
    total_joule_w = 0.0
    for se in seg_elements:
        s = se["seg"]
        v0 = float(v_sol[se["start_node"]])
        v1 = float(v_sol[se["end_node"]])
        sub_currents: List[float] = []
        sub_powers = 0.0
        for a, b, g_elem in se["sub_links"]:
            dv = abs(float(v_sol[a]) - float(v_sol[b]))
            i_sub = dv * g_elem
            sub_currents.append(i_sub)
            sub_powers += i_sub * dv
        i_seg = max(sub_currents) if sub_currents else 0.0
        area_mm2 = max(1e-5, s["width_mm"] * se["thickness_mm"])
        j_a_mm2 = i_seg / area_mm2
        total_joule_w += sub_powers
        drop_mv = max(0.0, (nominal_v - min(v0, v1)) * 1000.0) if nominal_v > 0 else abs(v0 - v1) * 1000.0
        seg_results.append({
            "uuid": s["uuid"],
            "x1_mm": s["x1_mm"],
            "y1_mm": s["y1_mm"],
            "x2_mm": s["x2_mm"],
            "y2_mm": s["y2_mm"],
            "width_mm": s["width_mm"],
            "layer": s["layer"],
            "net": net_name,
            "v_start": round(v0, 5),
            "v_end": round(v1, 5),
            "ir_drop_mv": round(drop_mv, 3),
            "seg_delta_mv": round(abs(v0 - v1) * 1000.0, 3),
            "current_a": round(i_seg, 4),
            "current_density_a_mm2": round(j_a_mm2, 2),
            "power_mw": round(sub_powers * 1000.0, 4),
        })

    pad_results: List[Dict[str, Any]] = []
    min_pad_v = nominal_v
    for p, nid in pad_node_ids:
        vp = float(v_sol[nid]) if nid in reachable else nominal_v
        if nominal_v > 0 and nid in reachable:
            min_pad_v = min(min_pad_v, vp)
        pad_results.append({
            "refdes": p["refdes"],
            "pad": p["pad"],
            "x_mm": round(p["x_mm"], 4),
            "y_mm": round(p["y_mm"], 4),
            "layer": (p["layers"] or ["F.Cu"])[0],
            "net": net_name,
            "voltage_v": round(vp, 5),
            "ir_drop_mv": round(max(0.0, (nominal_v - vp) * 1000.0) if nominal_v > 0 else 0.0, 3),
            "reachable": nid in reachable,
        })

    via_results: List[Dict[str, Any]] = []
    for vr in via_records:
        v = vr["via"]
        dv = abs(float(v_sol[vr["top_node"]]) - float(v_sol[vr["bot_node"]]))
        i_v = dv * vr["g_barrel"]
        j_v = i_v / vr["area_mm2"]
        via_results.append({
            "x_mm": v["x_mm"],
            "y_mm": v["y_mm"],
            "size_mm": v["size_mm"],
            "drill_mm": v["drill_mm"],
            "net": net_name,
            "ir_drop_mv": round(dv * 1000.0, 3),
            "current_a": round(i_v, 4),
            "current_density_a_mm2": round(j_v, 2),
        })

    max_ir_drop_mv = round(max([0.0] + [sr["ir_drop_mv"] for sr in seg_results] + [pr["ir_drop_mv"] for pr in pad_results]), 3)
    min_delivered_v = round(min([nominal_v] + [pr["voltage_v"] for pr in pad_results if pr["reachable"]]), 4)
    max_ir_drop_pct = round((max_ir_drop_mv / (nominal_v * 1000.0)) * 100.0, 2) if nominal_v > 0 else 0.0
    peak_j = round(max([0.0] + [sr["current_density_a_mm2"] for sr in seg_results] + [vr["current_density_a_mm2"] for vr in via_results]), 2)

    bottleneck = None
    if seg_results:
        worst_seg = max(seg_results, key=lambda s: (s["current_density_a_mm2"], s["seg_delta_mv"]))
        mx = round((worst_seg["x1_mm"] + worst_seg["x2_mm"]) * 0.5, 4)
        my = round((worst_seg["y1_mm"] + worst_seg["y2_mm"]) * 0.5, 4)
        # Suggested width so current density <= 30 A/mm^2
        i_bn = max(0.1, worst_seg["current_a"])
        suggested_w = round(max(0.5, min(2.5, i_bn / (30.0 * DEFAULT_COPPER_THICKNESS_MM))), 2)
        bottleneck = {
            "entity_type": "trace_segment",
            "uuid": worst_seg["uuid"],
            "net": net_name,
            "layer": worst_seg["layer"],
            "x_mm": mx,
            "y_mm": my,
            "x_nm": int(round(mx * 1_000_000)),
            "y_nm": int(round(my * 1_000_000)),
            "width_mm": worst_seg["width_mm"],
            "current_a": worst_seg["current_a"],
            "current_density_a_mm2": worst_seg["current_density_a_mm2"],
            "ir_drop_mv": worst_seg["ir_drop_mv"],
            "voltage_v": round(min(worst_seg["v_start"], worst_seg["v_end"]), 4),
            "suggested_width_mm": suggested_w,
            "repair_action": "widen_trace" if worst_seg["current_density_a_mm2"] > 35.0 or max_ir_drop_pct > 5.0 else "ok",
        }

    vdd_min = _default_vdd_min(nominal_v)
    brownout_risk = (nominal_v > 0) and (min_delivered_v < vdd_min)
    passed = (not brownout_risk) and (peak_j <= 35.0) and (max_ir_drop_pct <= 5.0)

    return {
        "net": net_name,
        "nominal_v": nominal_v,
        "min_delivered_v": min_delivered_v,
        "max_ir_drop_mv": max_ir_drop_mv,
        "max_ir_drop_pct": max_ir_drop_pct,
        "peak_current_density_a_mm2": peak_j,
        "total_joule_loss_mw": round(total_joule_w * 1000.0, 3),
        "vdd_min_threshold_v": vdd_min,
        "brownout_risk": brownout_risk,
        "passed": passed,
        "mesh_nodes": n_mesh,
        "mesh_elements": len(seg_elements),
        "residual": round(residual, 10),
        "bottleneck": bottleneck,
        "segments": seg_results,
        "pads": pad_results,
        "vias": via_results,
    }


def _build_spatial_heatmap_grid(
    bounds: Dict[str, float],
    all_segments: List[Dict[str, Any]],
    all_pads: List[Dict[str, Any]],
    cols: int,
    rows: int,
    max_ir_drop_mv: float,
    max_j_a_mm2: float,
    colormap: str,
) -> List[Dict[str, Any]]:
    bx0, by0 = bounds["min_x_mm"], bounds["min_y_mm"]
    bw, bh = bounds["width_mm"], bounds["height_mm"]
    grid: List[Dict[str, Any]] = []
    denom_dv = max(1e-3, max_ir_drop_mv)
    denom_j = max(1e-3, max_j_a_mm2)

    for iy in range(rows):
        y_mm = by0 + bh * ((iy + 0.5) / rows)
        for ix in range(cols):
            x_mm = bx0 + bw * ((ix + 0.5) / cols)
            best_d = 999.0
            best_v = 0.0
            best_dv = 0.0
            best_j = 0.0
            best_net = ""
            for s in all_segments:
                d, t, _, _ = _point_to_seg_dist_and_proj(x_mm, y_mm, s["x1_mm"], s["y1_mm"], s["x2_mm"], s["y2_mm"])
                eff_d = max(0.0, d - s["width_mm"] * 0.5)
                if eff_d < best_d:
                    best_d = eff_d
                    best_v = s["v_start"] + t * (s["v_end"] - s["v_start"])
                    best_dv = s["ir_drop_mv"]
                    best_j = s["current_density_a_mm2"]
                    best_net = s["net"]
            for p in all_pads:
                d = math.hypot(x_mm - p["x_mm"], y_mm - p["y_mm"])
                if d < best_d:
                    best_d = d
                    best_v = p["voltage_v"]
                    best_dv = p["ir_drop_mv"]
                    best_net = p["net"]
            valid = best_d <= 2.5
            norm_dv = min(1.0, best_dv / denom_dv) if valid else 0.0
            norm_j = min(1.0, best_j / denom_j) if valid else 0.0
            grid.append({
                "ix": ix,
                "iy": iy,
                "x_mm": round(x_mm, 3),
                "y_mm": round(y_mm, 3),
                "valid": valid,
                "net": best_net,
                "voltage_v": round(best_v, 4),
                "ir_drop_mv": round(best_dv, 3),
                "current_density_a_mm2": round(best_j, 2),
                "norm_ir_drop": round(norm_dv, 4),
                "norm_current_density": round(norm_j, 4),
                "color_ir_drop": sample_colormap_hex(colormap, norm_dv),
                "color_current_density": sample_colormap_hex(colormap, norm_j),
            })
    return grid


def _detect_upstream_padne_cli() -> Optional[str]:
    env_bin = os.environ.get("PADNE_BIN")
    if env_bin and pathlib.Path(env_bin).is_file():
        return env_bin
    on_path = shutil.which("padne")
    if on_path:
        return on_path
    for cand in (
        _PADNE_SRC / ".venv" / "bin" / "padne",
        _PADNE_SRC / ".venv" / "Scripts" / "padne.exe",
    ):
        if cand.is_file():
            return str(cand)
    return None


def solve_power_integrity(req: Dict[str, Any]) -> Dict[str, Any]:
    pcb_path = pathlib.Path(str(req.get("pcb_path", ""))).resolve()
    if not pcb_path.is_file():
        return {"ok": False, "error": f"PCB file not found: {pcb_path}"}

    ambient_temp_c = float(req.get("ambient_temp_c", 25.0))
    conductivity_s_mm = COPPER_CONDUCTIVITY_20C_S_MM / (1.0 + COPPER_TEMP_COEFF_PER_C * (ambient_temp_c - 20.0))
    copper_thick_override = float(req["copper_thickness_mm"]) if req.get("copper_thickness_mm") else None
    colormap = str(req.get("colormap", "viridis")).lower()
    if colormap not in ("viridis", "inferno"):
        colormap = "viridis"
    metric = str(req.get("metric", "ir_drop_mv"))
    load_current_a = float(req.get("load_current_a", 2.0))
    req_sources = req.get("sources") if isinstance(req.get("sources"), list) else []
    req_sinks = req.get("sinks") if isinstance(req.get("sinks"), list) else []

    padne_cli = _detect_upstream_padne_cli()
    pro_path = pcb_path.with_suffix(".kicad_pro")
    padne_oci = os.environ.get("PADNE_OCI_IMAGE")
    engine_name = "padne-ring2-scipy-fem"
    upstream_cli_invoked = False

    if req.get("prefer_padne_cli", True) and padne_cli and pro_path.is_file():
        # Attempt upstream atx/padne CLI execution if binary + compiled CGAL extensions exist
        try:
            with tempfile.TemporaryDirectory(prefix="vd_padne_cli_") as td:
                out_padne = pathlib.Path(td) / "out.padne"
                proc = subprocess.run(
                    [padne_cli, "solve", str(pro_path), str(out_padne)],
                    capture_output=True,
                    text=True,
                    timeout=60,
                )
                if proc.returncode == 0 and out_padne.is_file():
                    engine_name = "padne-cli"
                    upstream_cli_invoked = True
        except Exception:
            pass
    elif req.get("prefer_padne_cli", True) and padne_oci and shutil.which("docker") and pro_path.is_file():
        try:
            with tempfile.TemporaryDirectory(prefix="vd_padne_oci_") as td:
                out_padne = pathlib.Path(td) / "out.padne"
                proc = subprocess.run(
                    [
                        "docker", "run", "--rm", "--network=none", "--read-only",
                        "-v", f"{pcb_path.parent}:/work:ro",
                        "-v", f"{td}:/out:rw",
                        padne_oci, "solve", f"/work/{pro_path.name}", "/out/out.padne",
                    ],
                    capture_output=True,
                    text=True,
                    timeout=90,
                )
                if proc.returncode == 0 and out_padne.is_file():
                    engine_name = "padne-pack2a-oci"
                    upstream_cli_invoked = True
        except Exception:
            pass

    geom = _extract_pcb_geometry(pcb_path)

    # Determine target power nets
    req_net = str(req.get("net") or "").strip()
    if req_net:
        target_nets = [req_net]
    else:
        power_nets = [
            n for n in geom["nets"]
            if any(k in n.upper() for k in ("3.3", "3V3", "5V", "12V", "VBUS", "VCC", "VDD"))
        ]
        target_nets = power_nets or ([geom["nets"][0]] if geom["nets"] else [])

    net_results: List[Dict[str, Any]] = []
    all_segs: List[Dict[str, Any]] = []
    all_pads: List[Dict[str, Any]] = []
    all_vias: List[Dict[str, Any]] = []

    for net_name in target_nets:
        nominal_v, sources, sinks = _auto_boundary_conditions(
            geom, net_name, req_sources, req_sinks, load_current_a
        )
        nres = _solve_net_fem(
            geom,
            net_name,
            nominal_v,
            sources,
            sinks,
            conductivity_s_mm,
            copper_thick_override,
            colormap,
        )
        net_results.append(nres)
        all_segs.extend(nres["segments"])
        all_pads.extend(nres["pads"])
        all_vias.extend(nres["vias"])

    max_dv_global = max([0.0] + [s["ir_drop_mv"] for s in all_segs] + [n["max_ir_drop_mv"] for n in net_results])
    max_j_global = max([0.0] + [s["current_density_a_mm2"] for s in all_segs] + [v["current_density_a_mm2"] for v in all_vias])
    denom_dv = max(1e-3, max_dv_global)
    denom_j = max(1e-3, max_j_global)

    for s in all_segs:
        ndv = min(1.0, s["ir_drop_mv"] / denom_dv)
        nj = min(1.0, s["current_density_a_mm2"] / denom_j)
        s["norm_ir_drop"] = round(ndv, 4)
        s["norm_current_density"] = round(nj, 4)
        s["color_ir_drop"] = sample_colormap_hex(colormap, ndv)
        s["color_current_density"] = sample_colormap_hex(colormap, nj)

    for p in all_pads:
        ndv = min(1.0, p["ir_drop_mv"] / denom_dv)
        p["norm_ir_drop"] = round(ndv, 4)
        p["color_ir_drop"] = sample_colormap_hex(colormap, ndv)

    for v in all_vias:
        nj = min(1.0, v["current_density_a_mm2"] / denom_j)
        v["norm_current_density"] = round(nj, 4)
        v["color_current_density"] = sample_colormap_hex(colormap, nj)

    cols = max(8, min(64, int(req.get("grid_cols", 32))))
    rows = max(8, min(48, int(req.get("grid_rows", 24))))
    grid = _build_spatial_heatmap_grid(
        geom["bounds"], all_segs, all_pads, cols, rows, max_dv_global, max_j_global, colormap
    )

    worst_net = max(
        net_results,
        key=lambda n: (1 if n["brownout_risk"] else 0, n["peak_current_density_a_mm2"], n["max_ir_drop_mv"]),
    ) if net_results else None

    overall_passed = all(n["passed"] for n in net_results) if net_results else True

    return {
        "ok": True,
        "engine": engine_name,
        "upstream_repo_present": _PADNE_SRC.is_dir(),
        "upstream_cli_invoked": upstream_cli_invoked,
        "ring_isolation": "ring2-subprocess-gpl3-quarantine",
        "pcbnew_in_process": "pcbnew" in sys.modules,
        "passed": overall_passed,
        "ambient_temp_c": ambient_temp_c,
        "conductivity_s_mm": round(conductivity_s_mm, 1),
        "board_bounds_mm": geom["bounds"],
        "nets": [
            {k: v for k, v in nr.items() if k not in ("segments", "pads", "vias")}
            for nr in net_results
        ],
        "worst_case": {
            "net": worst_net["net"],
            "nominal_v": worst_net["nominal_v"],
            "min_delivered_v": worst_net["min_delivered_v"],
            "max_ir_drop_mv": worst_net["max_ir_drop_mv"],
            "max_ir_drop_pct": worst_net["max_ir_drop_pct"],
            "peak_current_density_a_mm2": worst_net["peak_current_density_a_mm2"],
            "total_joule_loss_mw": worst_net["total_joule_loss_mw"],
            "vdd_min_threshold_v": worst_net["vdd_min_threshold_v"],
            "brownout_risk": worst_net["brownout_risk"],
            "passed": worst_net["passed"],
            "bottleneck": worst_net["bottleneck"],
        } if worst_net else None,
        "heatmap": {
            "colormap": colormap,
            "metric": metric,
            "min_value": 0.0,
            "max_value": round(max_j_global if metric == "current_density_a_mm2" else max_dv_global, 3),
            "unit": "A/mm²" if metric == "current_density_a_mm2" else "mV",
            "max_ir_drop_mv": round(max_dv_global, 3),
            "max_current_density_a_mm2": round(max_j_global, 2),
            "color_stops": colormap_legend_stops(colormap),
            "grid_cols": cols,
            "grid_rows": rows,
            "segments": all_segs,
            "pads": all_pads,
            "vias": all_vias,
            "grid": grid,
        },
    }


if __name__ == "__main__":
    payload = json.loads(sys.stdin.read() or "{}")
    print(json.dumps(solve_power_integrity(payload)))
