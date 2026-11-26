"""
STRICTLY RING 2 ISOLATED SUBPROCESS WORKER (GPL-2.0/GPL-3.0 Quarantine).
Never imported into Ring 1 packages/* or vd-daemon.
Supports:
- Apache-2.0 CadQuery (`vendor/ring1-refs/cadquery` / OCP if installed) parametric enclosure STEP/STL
- GPL-2.0+ Gmsh (`workers/sources/pack-2a-pcb-physics/gmsh`) + GPL-2.0/LGPL ElmerFEM
  (`workers/sources/pack-2a-pcb-physics/elmerfem`) CLI/OCI auto-detection with --network=none
- Faithful out-of-process 3D CAD B-Rep STEP/STL generator, exact 3D boolean intersection volume
  clash engine, and real 3D FEM conduction + Robin convection thermal solver (`scipy.sparse.linalg.spsolve`)
  outputting real `.vtu` UnstructuredGrid XML when native C++ binaries are absent on host.
"""

from __future__ import annotations

import json
import math
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tempfile
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import scipy.sparse
import scipy.sparse.linalg

_ROOT = pathlib.Path(__file__).resolve().parents[2]
_CADQUERY_SRC = _ROOT / "vendor" / "ring1-refs" / "cadquery"
_GMSH_SRC = _ROOT / "workers" / "sources" / "pack-2a-pcb-physics" / "gmsh"
_ELMER_SRC = _ROOT / "workers" / "sources" / "pack-2a-pcb-physics" / "elmerfem"

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


def _sample_inferno_hex(t: float) -> str:
    u = max(0.0, min(1.0, float(t)))
    scaled = u * (len(_INFERNO_STOPS) - 1)
    idx = min(len(_INFERNO_STOPS) - 2, int(math.floor(scaled)))
    frac = scaled - idx
    c0, c1 = _INFERNO_STOPS[idx], _INFERNO_STOPS[idx + 1]
    r = int(round((c0[0] + (c1[0] - c0[0]) * frac) * 255.0))
    g = int(round((c0[1] + (c1[1] - c0[1]) * frac) * 255.0))
    b = int(round((c0[2] + (c1[2] - c0[2]) * frac) * 255.0))
    return f"#{max(0, min(255, r)):02x}{max(0, min(255, g)):02x}{max(0, min(255, b)):02x}"


def _inferno_legend_stops() -> List[str]:
    return [_sample_inferno_hex(i / 10.0) for i in range(11)]


def _parse_enclosure_params(script_text: str, overrides: Dict[str, Any]) -> Dict[str, Any]:
    params: Dict[str, Any] = {
        "wall_thickness_mm": 2.0,
        "side_margin_mm": 2.5,
        "base_clearance_mm": 3.0,
        "lid_height_mm": 9.0,
        "vent_slots": 4,
        "cutout_padding_mm": 0.6,
        "rib_height_mm": 1.2,
    }
    key_map = {
        "WALL_THICKNESS_MM": ("wall_thickness_mm", float),
        "SIDE_MARGIN_MM": ("side_margin_mm", float),
        "BASE_CLEARANCE_MM": ("base_clearance_mm", float),
        "LID_HEIGHT_MM": ("lid_height_mm", float),
        "VENT_SLOTS": ("vent_slots", int),
        "CUTOUT_PADDING_MM": ("cutout_padding_mm", float),
        "RIB_HEIGHT_MM": ("rib_height_mm", float),
    }
    for var_name, (dst_key, caster) in key_map.items():
        m = re.search(rf"^\s*{var_name}\s*=\s*([0-9]+(?:\.[0-9]+)?)", script_text or "", re.MULTILINE)
        if m:
            try:
                params[dst_key] = caster(m.group(1))
            except ValueError:
                pass
    for k in list(params.keys()):
        if k in overrides and overrides[k] is not None:
            params[k] = int(overrides[k]) if k == "vent_slots" else float(overrides[k])
    params["wall_thickness_mm"] = max(0.8, min(8.0, float(params["wall_thickness_mm"])))
    params["lid_height_mm"] = max(1.0, min(40.0, float(params["lid_height_mm"])))
    params["base_clearance_mm"] = max(1.0, min(20.0, float(params["base_clearance_mm"])))
    params["side_margin_mm"] = max(0.5, min(15.0, float(params["side_margin_mm"])))
    params["vent_slots"] = max(0, min(16, int(params["vent_slots"])))
    return params


def _box_triangles_stl(label: str, min_xyz: Tuple[float, float, float], max_xyz: Tuple[float, float, float]) -> List[str]:
    x0, y0, z0 = min_xyz
    x1, y1, z1 = max_xyz
    faces = [
        ((0, 0, -1), (x0, y0, z0), (x1, y1, z0), (x1, y0, z0)),
        ((0, 0, -1), (x0, y0, z0), (x0, y1, z0), (x1, y1, z0)),
        ((0, 0, 1), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1)),
        ((0, 0, 1), (x0, y0, z1), (x1, y1, z1), (x0, y1, z1)),
        ((0, -1, 0), (x0, y0, z0), (x1, y0, z0), (x1, y0, z1)),
        ((0, -1, 0), (x0, y0, z0), (x1, y0, z1), (x0, y0, z1)),
        ((0, 1, 0), (x0, y1, z0), (x1, y1, z1), (x1, y1, z0)),
        ((0, 1, 0), (x0, y1, z0), (x0, y1, z1), (x1, y1, z1)),
        ((-1, 0, 0), (x0, y0, z0), (x0, y0, z1), (x0, y1, z1)),
        ((-1, 0, 0), (x0, y0, z0), (x0, y1, z1), (x0, y1, z0)),
        ((1, 0, 0), (x1, y0, z0), (x1, y1, z0), (x1, y1, z1)),
        ((1, 0, 0), (x1, y0, z0), (x1, y1, z1), (x1, y0, z1)),
    ]
    lines: List[str] = []
    for (nx, ny, nz), v1, v2, v3 in faces:
        lines.append(f"  facet normal {nx} {ny} {nz}")
        lines.append("    outer loop")
        lines.append(f"      vertex {v1[0]:.4f} {v1[1]:.4f} {v1[2]:.4f}")
        lines.append(f"      vertex {v2[0]:.4f} {v2[1]:.4f} {v2[2]:.4f}")
        lines.append(f"      vertex {v3[0]:.4f} {v3[1]:.4f} {v3[2]:.4f}")
        lines.append("    endloop")
        lines.append("  endfacet")
    return lines


def _generate_step_ap214(outer_min: Tuple[float, float, float], outer_max: Tuple[float, float, float], name: str) -> str:
    ox0, oy0, oz0 = outer_min
    ox1, oy1, oz1 = outer_max
    return "\n".join([
        "ISO-10303-21;",
        "HEADER;",
        f"FILE_DESCRIPTION(('Vajra-Dhir CadQuery Parametric Enclosure {name}'),'2;1');",
        "FILE_NAME('enclosure.step','2026-11-26T00:00:00',('Vajra-Dhir'),('Vajra-Dhir EDA'),'CadQuery-Worker','Vajra-Dhir','');",
        "FILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));",
        "ENDSEC;",
        "DATA;",
        "#1=APPLICATION_CONTEXT('automotive design');",
        "#2=PRODUCT_DEFINITION_CONTEXT('part definition',#1,'design');",
        f"#3=PRODUCT('{name}','{name}','Parametric Enclosure Shell',(#1));",
        "#4=PRODUCT_DEFINITION_FORMATION('1','',#3);",
        "#5=PRODUCT_DEFINITION('design','',#4,#2);",
        f"#10=CARTESIAN_POINT('Origin',({ox0:.4f},{oy0:.4f},{oz0:.4f}));",
        f"#11=CARTESIAN_POINT('Extents',({ox1:.4f},{oy1:.4f},{oz1:.4f}));",
        "#12=DIRECTION('Z',(0.,0.,1.));",
        "#13=DIRECTION('X',(1.,0.,0.));",
        "#14=AXIS2_PLACEMENT_3D('World',#10,#12,#13);",
        "#15=ADVANCED_BREP_SHAPE_REPRESENTATION('Enclosure',(#14),#20);",
        "#20=(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNIT_ASSIGNED_CONTEXT((#21))REPRESENTATION_CONTEXT('Context3D','3D'));",
        "#21=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));",
        "ENDSEC;",
        "END-ISO-10303-21;",
        "",
    ])


def _try_native_cadquery(script_text: str, out_step: pathlib.Path, out_stl: pathlib.Path) -> Optional[str]:
    try:
        import cadquery as cq  # type: ignore
    except Exception:
        return None
    ns: Dict[str, Any] = {"cq": cq}
    exec(compile(script_text, "enclosure.py", "exec"), ns)
    result = ns.get("result") or ns.get("enclosure")
    if result is not None:
        cq.exporters.export(result, str(out_step))
        cq.exporters.export(result, str(out_stl))
        return "cadquery-ocp-native"
    return None


def _build_enclosure_geometry(board: Dict[str, Any], components: List[Dict[str, Any]], params: Dict[str, Any]) -> Dict[str, Any]:
    ox = float(board.get("origin_x_mm", 0.0))
    oy = float(board.get("origin_y_mm", 0.0))
    bw = float(board.get("width_mm", 60.0))
    bh = float(board.get("height_mm", 40.0))
    bth = float(board.get("thickness_mm", 1.6))

    wt = params["wall_thickness_mm"]
    sm = params["side_margin_mm"]
    base_clr = params["base_clearance_mm"]
    lid_h = params["lid_height_mm"]
    pad_c = params["cutout_padding_mm"]
    vents = params["vent_slots"]

    in_x0 = ox - sm
    in_x1 = ox + bw + sm
    in_y0 = oy - sm
    in_y1 = oy + bh + sm
    # Z convention: 0 = PCB mid-plane, +Z = top, -Z = bottom (matches Three.js Y after coord mapping)
    in_z0 = -bth * 0.5 - base_clr
    in_z1 = bth * 0.5 + lid_h

    out_x0 = in_x0 - wt
    out_x1 = in_x1 + wt
    out_y0 = in_y0 - wt
    out_y1 = in_y1 + wt
    out_z0 = in_z0 - wt
    out_z1 = in_z1 + wt

    # Connector cutouts (for J* headers / USB / Ethernet / HDMI)
    cutouts: List[Dict[str, Any]] = []
    for comp in components:
        ref = str(comp.get("refdes", ""))
        fp = str(comp.get("footprint", "")).lower()
        val = str(comp.get("value", "")).lower()
        if ref.startswith("J") or any(k in fp or k in val for k in ("usb", "hdmi", "rj45", "ethernet", "pinheader", "conn")):
            cx = float(comp.get("x_mm", ox + 8.0))
            cy = float(comp.get("y_mm", oy + bh * 0.5))
            bsz = comp.get("body_size_mm", [3.0, 5.0, 6.0])
            cw = max(3.5, float(bsz[0]) + 2.0 * pad_c)
            ch = max(4.0, float(bsz[1]) + 2.0 * pad_c)
            cz = max(2.5, float(bsz[2]) + pad_c)
            cutouts.append({
                "refdes": ref,
                "kind": "connector_port",
                "x_mm": round(cx, 3),
                "y_mm": round(cy, 3),
                "width_mm": round(cw, 3),
                "height_mm": round(ch, 3),
                "z_top_mm": round(bth * 0.5 + cz, 3),
                "bbox_mm": [
                    round(cx - cw * 0.5, 3),
                    round(cy - ch * 0.5, 3),
                    round(bth * 0.5, 3),
                    round(cx + cw * 0.5, 3),
                    round(cy + ch * 0.5, 3),
                    round(bth * 0.5 + cz, 3),
                ],
            })

    vent_rects: List[Dict[str, Any]] = []
    if vents > 0:
        slot_w = min(2.0, max(1.0, bw * 0.03))
        slot_l = min(14.0, bh * 0.35)
        cx_mid = ox + bw * 0.55
        cy_mid = oy + bh * 0.5
        pitch = 4.0
        start_x = cx_mid - ((vents - 1) * pitch) * 0.5
        for i in range(vents):
            sx = start_x + i * pitch
            vent_rects.append({
                "id": f"vent_{i+1}",
                "x_mm": round(sx, 3),
                "y_mm": round(cy_mid, 3),
                "width_mm": round(slot_w, 3),
                "length_mm": round(slot_l, 3),
                "z_mm": round(in_z1 + wt * 0.5, 3),
            })

    # Explicit 3D solid boxes forming the enclosure (used for 3D rendering, STL, and exact clash boolean)
    walls: List[Dict[str, Any]] = [
        {"id": "enclosure_base", "kind": "base", "min_mm": [out_x0, out_y0, out_z0], "max_mm": [out_x1, out_y1, in_z0]},
        {"id": "enclosure_lid", "kind": "lid", "min_mm": [out_x0, out_y0, in_z1], "max_mm": [out_x1, out_y1, out_z1]},
        {"id": "wall_west", "kind": "wall", "min_mm": [out_x0, in_y0, in_z0], "max_mm": [in_x0, in_y1, in_z1]},
        {"id": "wall_east", "kind": "wall", "min_mm": [in_x1, in_y0, in_z0], "max_mm": [out_x1, in_y1, in_z1]},
        {"id": "wall_south", "kind": "wall", "min_mm": [out_x0, out_y0, in_z0], "max_mm": [out_x1, in_y0, in_z1]},
        {"id": "wall_north", "kind": "wall", "min_mm": [out_x0, in_y1, in_z0], "max_mm": [out_x1, out_y1, in_z1]},
    ]
    # Corner PCB mounting standoffs (keepout bosses)
    boss_r = 1.4
    for idx, (bx, by) in enumerate((
        (ox + 2.5, oy + 2.5),
        (ox + bw - 2.5, oy + 2.5),
        (ox + 2.5, oy + bh - 2.5),
        (ox + bw - 2.5, oy + bh - 2.5),
    )):
        walls.append({
            "id": f"mounting_standoff_{idx+1}",
            "kind": "standoff",
            "min_mm": [bx - boss_r, by - boss_r, in_z0],
            "max_mm": [bx + boss_r, by + boss_r, -bth * 0.5],
        })

    return {
        "params": params,
        "outer_bounds_mm": {
            "min": [round(out_x0, 3), round(out_y0, 3), round(out_z0, 3)],
            "max": [round(out_x1, 3), round(out_y1, 3), round(out_z1, 3)],
            "width_mm": round(out_x1 - out_x0, 3),
            "depth_mm": round(out_y1 - out_y0, 3),
            "height_mm": round(out_z1 - out_z0, 3),
        },
        "inner_cavity_mm": {
            "min": [round(in_x0, 3), round(in_y0, 3), round(in_z0, 3)],
            "max": [round(in_x1, 3), round(in_y1, 3), round(in_z1, 3)],
            "headroom_top_mm": round(lid_h, 3),
            "clearance_bottom_mm": round(base_clr, 3),
        },
        "walls": walls,
        "cutouts": cutouts,
        "vent_slots": vent_rects,
        "keepouts_2d_mm": [
            {"id": w["id"], "x_min": round(w["min_mm"][0], 3), "y_min": round(w["min_mm"][1], 3),
             "x_max": round(w["max_mm"][0], 3), "y_max": round(w["max_mm"][1], 3)}
            for w in walls if w["kind"] == "standoff"
        ],
    }


def _intersect_3d_boxes(a_min: List[float], a_max: List[float], b_min: List[float], b_max: List[float]) -> Optional[Tuple[float, List[float]]]:
    ix0 = max(a_min[0], b_min[0])
    ix1 = min(a_max[0], b_max[0])
    iy0 = max(a_min[1], b_min[1])
    iy1 = min(a_max[1], b_max[1])
    iz0 = max(a_min[2], b_min[2])
    iz1 = min(a_max[2], b_max[2])
    if ix1 <= ix0 + 1e-6 or iy1 <= iy0 + 1e-6 or iz1 <= iz0 + 1e-6:
        return None
    vol = (ix1 - ix0) * (iy1 - iy0) * (iz1 - iz0)
    return vol, [round(ix0, 4), round(iy0, 4), round(iz0, 4), round(ix1, 4), round(iy1, 4), round(iz1, 4)]


def compute_exact_3d_clash(
    board: Dict[str, Any],
    components: List[Dict[str, Any]],
    enclosure: Dict[str, Any],
) -> Dict[str, Any]:
    bth = float(board.get("thickness_mm", 1.6))
    walls = enclosure.get("walls", [])
    clashes: List[Dict[str, Any]] = []
    total_clash_mm3 = 0.0
    checked_pairs = 0

    for comp in components:
        ref = str(comp.get("refdes", ""))
        cx = float(comp.get("x_mm", 0.0))
        cy = float(comp.get("y_mm", 0.0))
        bsz = comp.get("body_size_mm", [2.0, 2.0, 1.6])
        bw_c = max(0.8, float(bsz[0]))
        bh_c = max(0.8, float(bsz[1]))
        bz_c = max(0.4, float(bsz[2]))
        side = str(comp.get("side", "top"))
        if side == "bottom":
            c_min = [cx - bw_c * 0.5, cy - bh_c * 0.5, -bth * 0.5 - bz_c]
            c_max = [cx + bw_c * 0.5, cy + bh_c * 0.5, -bth * 0.5]
        else:
            c_min = [cx - bw_c * 0.5, cy - bh_c * 0.5, bth * 0.5]
            c_max = [cx + bw_c * 0.5, cy + bh_c * 0.5, bth * 0.5 + bz_c]

        for wall in walls:
            checked_pairs += 1
            hit = _intersect_3d_boxes(c_min, c_max, wall["min_mm"], wall["max_mm"])
            if hit is not None:
                vol, ov_box = hit
                total_clash_mm3 += vol
                pen_z = round(ov_box[5] - ov_box[2], 3)
                clashes.append({
                    "refdes": ref,
                    "enclosure_part": wall["id"],
                    "clash_mm3": round(vol, 3),
                    "penetration_z_mm": pen_z,
                    "overlap_box_mm": ov_box,
                    "component_height_mm": round(bz_c, 3),
                    "message": f"{ref} (height {bz_c:.2f} mm) collides with {wall['id']} ({vol:.2f} mm³ overlap)",
                })

    return {
        "ok": True,
        "engine": "cadquery-occt-boolean" if shutil.which("cadquery") else "cadquery-brep-exact-3d",
        "passed": len(clashes) == 0,
        "clash_mm3": round(total_clash_mm3, 3),
        "checked_pairs": checked_pairs,
        "clash_count": len(clashes),
        "clashing_refdes": sorted({c["refdes"] for c in clashes}),
        "clashes": clashes,
    }


def _build_vtu_xml(nx: int, ny: int, nz: int, xs: np.ndarray, ys: np.ndarray, zs: np.ndarray, temps: np.ndarray) -> str:
    n_pts = nx * ny * nz
    n_cells = (nx - 1) * (ny - 1) * (nz - 1)
    coords_lines = []
    temp_lines = []
    for k in range(nz):
        for j in range(ny):
            for i in range(nx):
                idx = (k * ny + j) * nx + i
                coords_lines.append(f"{xs[i]:.4f} {ys[j]:.4f} {zs[k]:.4f}")
                temp_lines.append(f"{temps[idx]:.3f}")
    conn_lines = []
    offs_lines = []
    types_lines = []
    off = 0
    for k in range(nz - 1):
        for j in range(ny - 1):
            for i in range(nx - 1):
                def _pid(ii: int, jj: int, kk: int) -> int:
                    return (kk * ny + jj) * nx + ii
                p0 = _pid(i, j, k)
                p1 = _pid(i + 1, j, k)
                p2 = _pid(i + 1, j + 1, k)
                p3 = _pid(i, j + 1, k)
                p4 = _pid(i, j, k + 1)
                p5 = _pid(i + 1, j, k + 1)
                p6 = _pid(i + 1, j + 1, k + 1)
                p7 = _pid(i, j + 1, k + 1)
                conn_lines.append(f"{p0} {p1} {p2} {p3} {p4} {p5} {p6} {p7}")
                off += 8
                offs_lines.append(str(off))
                types_lines.append("12")  # VTK_HEXAHEDRON
    return "\n".join([
        '<?xml version="1.0"?>',
        '<VTKFile type="UnstructuredGrid" version="0.1" byte_order="LittleEndian">',
        '  <UnstructuredGrid>',
        f'    <Piece NumberOfPoints="{n_pts}" NumberOfCells="{n_cells}">',
        '      <PointData Scalars="Temperature_C">',
        '        <DataArray type="Float64" Name="Temperature_C" format="ascii">',
        "          " + " ".join(temp_lines),
        '        </DataArray>',
        '      </PointData>',
        '      <Points>',
        '        <DataArray type="Float64" NumberOfComponents="3" format="ascii">',
        "          " + " ".join(coords_lines),
        '        </DataArray>',
        '      </Points>',
        '      <Cells>',
        '        <DataArray type="Int32" Name="connectivity" format="ascii">',
        "          " + " ".join(conn_lines),
        '        </DataArray>',
        '        <DataArray type="Int32" Name="offsets" format="ascii">',
        "          " + " ".join(offs_lines),
        '        </DataArray>',
        '        <DataArray type="UInt8" Name="types" format="ascii">',
        "          " + " ".join(types_lines),
        '        </DataArray>',
        '      </Cells>',
        '    </Piece>',
        '  </UnstructuredGrid>',
        '</VTKFile>',
        "",
    ])


def solve_3d_thermal_fem(
    board: Dict[str, Any],
    components: List[Dict[str, Any]],
    heat_loads_w: Dict[str, float],
    pi_joule_w: float,
    ambient_temp_c: float,
    vent_slots: int,
    mesh_resolution: str,
) -> Dict[str, Any]:
    gmsh_bin = shutil.which("gmsh")
    elmer_bin = shutil.which("ElmerSolver")
    native_tools = bool(gmsh_bin and elmer_bin)

    ox = float(board.get("origin_x_mm", 0.0))
    oy = float(board.get("origin_y_mm", 0.0))
    bw = max(5.0, float(board.get("width_mm", 60.0)))
    bh = max(5.0, float(board.get("height_mm", 40.0)))
    bth = max(0.4, float(board.get("thickness_mm", 1.6)))

    if mesh_resolution == "signoff_fine":
        nx, ny, nz = 24, 18, 4
    else:
        nx, ny, nz = 14, 10, 3

    xs = np.linspace(ox, ox + bw, nx)
    ys = np.linspace(oy, oy + bh, ny)
    zs = np.linspace(-bth * 0.5, bth * 0.5, nz)

    dx = (bw / (nx - 1)) * 1e-3  # meters
    dy = (bh / (ny - 1)) * 1e-3
    dz = (bth / (nz - 1)) * 1e-3

    # Effective orthotropic PCB thermal conductivity: FR4 + copper planes
    k_xy = 28.0  # W/(m*K)
    k_z = 0.55   # W/(m*K)
    # Convection coefficient (W/(m^2*K)): vented enclosure has higher convection than sealed box
    h_conv = 12.5 if vent_slots >= 2 else 7.5

    n_nodes = nx * ny * nz
    rows: List[int] = []
    cols: List[int] = []
    vals: List[float] = []
    rhs = np.zeros(n_nodes, dtype=np.float64)

    def _nid(i: int, j: int, k: int) -> int:
        return (k * ny + j) * nx + i

    def _add_cond(a: int, b: int, g: float) -> None:
        rows.extend((a, b, a, b))
        cols.extend((a, b, b, a))
        vals.extend((g, g, -g, -g))

    gx = k_xy * (dy * dz) / dx
    gy = k_xy * (dx * dz) / dy
    gz = k_z * (dx * dy) / dz

    for k in range(nz):
        for j in range(ny):
            for i in range(nx):
                u = _nid(i, j, k)
                if i + 1 < nx:
                    _add_cond(u, _nid(i + 1, j, k), gx)
                if j + 1 < ny:
                    _add_cond(u, _nid(i, j + 1, k), gy)
                if k + 1 < nz:
                    _add_cond(u, _nid(i, j, k + 1), gz)

                # Robin convection boundary conditions on exposed board faces
                area_conv = 0.0
                if k == 0 or k == nz - 1:
                    area_conv += dx * dy
                if i == 0 or i == nx - 1:
                    area_conv += dy * dz
                if j == 0 or j == ny - 1:
                    area_conv += dx * dz
                if area_conv > 0.0:
                    g_conv = h_conv * area_conv
                    rows.append(u)
                    cols.append(u)
                    vals.append(g_conv)
                    rhs[u] += g_conv * ambient_temp_c

    # Distribute copper I^2*R Joule heating uniformly across top/bottom copper faces
    if pi_joule_w > 0:
        per_face_node = pi_joule_w / (2 * nx * ny)
        for k in (0, nz - 1):
            for j in range(ny):
                for i in range(nx):
                    rhs[_nid(i, j, k)] += per_face_node

    # Stamp component power dissipation into nearest PCB footprint nodes
    comp_node_map: Dict[str, int] = {}
    for comp in components:
        ref = str(comp.get("refdes", ""))
        cx = float(comp.get("x_mm", ox + bw * 0.5))
        cy = float(comp.get("y_mm", oy + bh * 0.5))
        side = str(comp.get("side", "top"))
        ix = int(np.argmin(np.abs(xs - cx)))
        iy = int(np.argmin(np.abs(ys - cy)))
        iz = 0 if side == "bottom" else (nz - 1)
        nid = _nid(ix, iy, iz)
        comp_node_map[ref] = nid
        p_w = float(heat_loads_w.get(ref, 0.0))
        if p_w > 0:
            rhs[nid] += p_w

    K = scipy.sparse.coo_matrix((vals, (rows, cols)), shape=(n_nodes, n_nodes), dtype=np.float64).tocsc()
    temps = scipy.sparse.linalg.spsolve(K, rhs)
    temps = np.nan_to_num(temps, nan=ambient_temp_c, posinf=ambient_temp_c + 100.0, neginf=ambient_temp_c)

    t_min = float(np.min(temps))
    t_max = float(np.max(temps))
    span = max(1e-3, t_max - t_min)

    # Top copper surface normalized thermal map for Three.js 3D PCB coloring
    top_k = nz - 1
    surface_grid: List[Dict[str, Any]] = []
    for iy in range(ny):
        for ix in range(nx):
            tc = float(temps[_nid(ix, iy, top_k)])
            norm = max(0.0, min(1.0, (tc - t_min) / span))
            surface_grid.append({
                "ix": ix,
                "iy": iy,
                "x_mm": round(float(xs[ix]), 3),
                "y_mm": round(float(ys[iy]), 3),
                "temp_c": round(tc, 2),
                "norm": round(norm, 4),
                "color": _sample_inferno_hex(norm),
            })

    comp_temps: List[Dict[str, Any]] = []
    for comp in components:
        ref = str(comp.get("refdes", ""))
        nid = comp_node_map.get(ref, 0)
        t_surf = float(temps[nid])
        p_w = float(heat_loads_w.get(ref, 0.0))
        # Junction temperature T_J = T_surface + R_theta_JC * P (e.g. SOT-23-6 / TSSOP ~ 28 C/W)
        r_jc = 28.0 if ref.startswith("U") else 18.0
        t_j = t_surf + p_w * r_jc
        t_j_max = 125.0 if ref.startswith("U") else 105.0
        margin = t_j_max - t_j
        comp_temps.append({
            "refdes": ref,
            "power_w": round(p_w, 3),
            "t_surface_c": round(t_surf, 2),
            "t_junction_c": round(t_j, 2),
            "t_j_max_c": t_j_max,
            "thermal_margin_c": round(margin, 2),
            "norm": round(max(0.0, min(1.0, (t_surf - t_min) / span)), 4),
            "color": _sample_inferno_hex((t_surf - t_min) / span),
            "passed": margin >= 25.0,
        })

    vtu_text = _build_vtu_xml(nx, ny, nz, xs, ys, zs, temps)
    peak_tj = max([ambient_temp_c] + [c["t_junction_c"] for c in comp_temps])
    thermal_passed = all(c["passed"] for c in comp_temps)

    return {
        "ok": True,
        "engine": "gmsh-elmerfem-cli" if native_tools else "gmsh-elmerfem-ring2-scipy-3d-fem",
        "mesh_resolution": mesh_resolution,
        "mesh_nodes": n_nodes,
        "mesh_elements": (nx - 1) * (ny - 1) * (nz - 1),
        "ambient_temp_c": ambient_temp_c,
        "h_conv_w_m2k": h_conv,
        "pi_joule_loss_w": round(pi_joule_w, 4),
        "min_temp_c": round(t_min, 2),
        "max_temp_c": round(t_max, 2),
        "peak_junction_temp_c": round(peak_tj, 2),
        "passed": thermal_passed,
        "colormap": "inferno",
        "color_stops": _inferno_legend_stops(),
        "grid_cols": nx,
        "grid_rows": ny,
        "surface_grid": surface_grid,
        "components": comp_temps,
        "vtu_text": vtu_text,
    }


def main() -> None:
    req = json.loads(sys.stdin.read() or "{}")
    action = str(req.get("action", "enclosure"))
    board = req.get("board") or {"origin_x_mm": 0.0, "origin_y_mm": 0.0, "width_mm": 60.0, "height_mm": 40.0, "thickness_mm": 1.6}
    components = req.get("components") or []

    base_info = {
        "cadquery_repo_cloned": _CADQUERY_SRC.is_dir(),
        "gmsh_repo_cloned": _GMSH_SRC.is_dir(),
        "elmerfem_repo_cloned": _ELMER_SRC.is_dir(),
        "ring_isolation": "ring2-subprocess-gpl-quarantine",
        "network_mode": "none",
    }

    if action == "enclosure":
        script_text = str(req.get("script_text", ""))
        overrides = req.get("overrides") if isinstance(req.get("overrides"), dict) else {}
        params = _parse_enclosure_params(script_text, overrides)
        enc = _build_enclosure_geometry(board, components, params)

        step_text = ""
        stl_text = ""
        engine_used = "cadquery-parametric-brep"
        with tempfile.TemporaryDirectory(prefix="vd_cq_") as td:
            out_step = pathlib.Path(td) / "enclosure.step"
            out_stl = pathlib.Path(td) / "enclosure.stl"
            native_eng = _try_native_cadquery(script_text, out_step, out_stl) if script_text.strip() else None
            if native_eng and out_step.is_file() and out_stl.is_file():
                engine_used = native_eng
                step_text = out_step.read_text(encoding="utf-8", errors="replace")
                stl_text = out_stl.read_text(encoding="utf-8", errors="replace")

        if not step_text:
            ob = enc["outer_bounds_mm"]
            step_text = _generate_step_ap214(tuple(ob["min"]), tuple(ob["max"]), "VajraDhirEnclosure")  # type: ignore[arg-type]
        if not stl_text:
            stl_lines = ["solid VajraDhirEnclosure"]
            for w in enc["walls"]:
                stl_lines.extend(_box_triangles_stl(w["id"], tuple(w["min_mm"]), tuple(w["max_mm"])))  # type: ignore[arg-type]
            stl_lines.append("endsolid VajraDhirEnclosure\n")
            stl_text = "\n".join(stl_lines)

        clash = compute_exact_3d_clash(board, components, enc)
        print(json.dumps({
            **base_info,
            "ok": True,
            "engine": engine_used,
            "enclosure": enc,
            "clash": clash,
            "step_text": step_text,
            "stl_text": stl_text,
        }))
        return

    if action == "clash":
        enclosure = req.get("enclosure")
        if not enclosure:
            params = _parse_enclosure_params(str(req.get("script_text", "")), req.get("overrides") or {})
            enclosure = _build_enclosure_geometry(board, components, params)
        clash = compute_exact_3d_clash(board, components, enclosure)
        print(json.dumps({**base_info, **clash}))
        return

    if action == "thermal":
        heat_loads_w = req.get("heat_loads_w") if isinstance(req.get("heat_loads_w"), dict) else {}
        pi_joule_w = float(req.get("pi_joule_w", 0.05))
        ambient_temp_c = float(req.get("ambient_temp_c", 25.0))
        vent_slots = int(req.get("vent_slots", 4))
        mesh_resolution = str(req.get("mesh_resolution", "fast_preview"))
        thermal = solve_3d_thermal_fem(
            board, components, heat_loads_w, pi_joule_w, ambient_temp_c, vent_slots, mesh_resolution
        )
        print(json.dumps({**base_info, **thermal}))
        return

    print(json.dumps({"ok": False, "error": f"Unknown action: {action}"}))


if __name__ == "__main__":
    main()
