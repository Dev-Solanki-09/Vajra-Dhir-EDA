"""Declarative .ato circuit compiler & constraint solver for Prompt 6 (atopile/atopile integration)."""

from __future__ import annotations

import json
import os
import pathlib
import re
import shutil
import sqlite3
import subprocess
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import pint

try:
    from .kicad_bridge import (
        _atom_or_str_val,
        _extract_fp_ref_and_val,
        _find_child,
        _find_children,
        ensure_external_id_map,
        format_sexpr,
        new_uuidv7,
        parse_sexpr,
        sha256_text,
        SAtom,
        SStr,
        write_text_atomic,
    )
    from .kicad_routes import (
        _ACTIVE_STATE,
        _BRIDGE,
        _STATE_LOCK,
        _ensure_active_workspace,
        _resolve_project_file,
        broadcast_ws_event,
        poll_external_changes,
    )
    from .supervision import SupervisedProcessGroup
except ImportError:
    from kicad_bridge import (
        _atom_or_str_val,
        _extract_fp_ref_and_val,
        _find_child,
        _find_children,
        ensure_external_id_map,
        format_sexpr,
        new_uuidv7,
        parse_sexpr,
        sha256_text,
        SAtom,
        SStr,
        write_text_atomic,
    )
    from kicad_routes import (
        _ACTIVE_STATE,
        _BRIDGE,
        _STATE_LOCK,
        _ensure_active_workspace,
        _resolve_project_file,
        broadcast_ws_event,
        poll_external_changes,
    )
    from supervision import SupervisedProcessGroup

_UREG = pint.UnitRegistry()
_SUPERVISOR = SupervisedProcessGroup()


@dataclass
class PhysicalVal:
    nominal: float
    min_val: float
    max_val: float
    unit: str
    raw: str
    line: int
    file: str


@dataclass
class AtoComponentSpec:
    refdes: str
    mpn_or_type: str
    value_str: str
    footprint: str = "Resistor_SMD:R_0603_1608Metric"
    file: str = ""
    line: int = 1
    x_mm: Optional[float] = None
    y_mm: Optional[float] = None
    props: Dict[str, Any] = field(default_factory=dict)


@dataclass
class AtoDiagnostic:
    file: str
    line: int
    col: int
    severity: str
    constraint_failure: str
    expected: str
    actual: str
    message: str
    refdes: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "file": self.file,
            "line": self.line,
            "col": self.col,
            "severity": self.severity,
            "constraint_failure": self.constraint_failure,
            "expected": self.expected,
            "actual": self.actual,
            "message": self.message,
            "refdes": self.refdes,
        }


def _to_base_pint(num_str: str, unit_str: str) -> Tuple[float, str]:
    u_clean = unit_str.strip()
    aliases = {
        "ohm": "ohm",
        "ohms": "ohm",
        "kohm": "kiloohm",
        "Mohm": "megaohm",
        "mohm": "milliohm",
        "uF": "microfarad",
        "nF": "nanofarad",
        "pF": "picofarad",
        "mF": "millifarad",
        "F": "farad",
        "uH": "microhenry",
        "nH": "nanohenry",
        "mH": "millihenry",
        "H": "henry",
        "V": "volt",
        "mV": "millivolt",
        "kV": "kilovolt",
        "A": "ampere",
        "mA": "milliampere",
        "W": "watt",
        "mW": "milliwatt",
        "mm": "millimeter",
        "Hz": "hertz",
        "kHz": "kilohertz",
        "MHz": "megahertz",
    }
    pint_unit = aliases.get(u_clean, u_clean)
    try:
        qty = _UREG.Quantity(float(num_str), pint_unit)
    except Exception:
        return float(num_str), u_clean or "dimensionless"
    base_map = {
        "[electric_potential]": ("volt", "V"),
        "[current]": ("ampere", "A"),
        "[resistance]": ("ohm", "ohm"),
        "[capacitance]": ("farad", "F"),
        "[inductance]": ("henry", "H"),
        "[power]": ("watt", "W"),
        "[length]": ("millimeter", "mm"),
        "[frequency]": ("hertz", "Hz"),
    }
    for dim, (target_u, short_u) in base_map.items():
        if qty.check(dim):
            return float(qty.to(target_u).magnitude), short_u
    return float(qty.magnitude), u_clean or "dimensionless"


_BILATERAL_RE = re.compile(
    r"^\s*(-?\d+(?:\.\d+)?)\s*([A-Za-z]+)?\s*\+/-\s*(\d+(?:\.\d+)?)\s*(%|"
    r"[A-Za-z]+)?\s*$"
)
_BOUNDED_RE = re.compile(
    r"^\s*(-?\d+(?:\.\d+)?)\s*([A-Za-z]+)?\s+to\s+(-?\d+(?:\.\d+)?)\s*([A-Za-z]+)?\s*$"
)
_SIMPLE_QTY_RE = re.compile(r"^\s*(-?\d+(?:\.\d+)?)\s*([A-Za-z]+)\s*$")


def _parse_physical(expr: str, file_rel: str, line_no: int) -> Optional[PhysicalVal]:
    m_bi = _BILATERAL_RE.match(expr)
    if m_bi:
        nom_s, u_nom, tol_s, tol_u = m_bi.groups()
        nom, base_u = _to_base_pint(nom_s, u_nom or "")
        if tol_u == "%":
            delta = abs(nom) * (float(tol_s) / 100.0)
        else:
            delta, _ = _to_base_pint(tol_s, tol_u or u_nom or "")
        return PhysicalVal(nom, nom - delta, nom + delta, base_u, expr.strip(), line_no, file_rel)

    m_bnd = _BOUNDED_RE.match(expr)
    if m_bnd:
        lo_s, u1, hi_s, u2 = m_bnd.groups()
        u_eff1 = u1 or u2 or ""
        u_eff2 = u2 or u1 or ""
        lo, base_u = _to_base_pint(lo_s, u_eff1)
        hi, _ = _to_base_pint(hi_s, u_eff2)
        if lo > hi:
            lo, hi = hi, lo
        return PhysicalVal((lo + hi) / 2.0, lo, hi, base_u, expr.strip(), line_no, file_rel)

    m_sq = _SIMPLE_QTY_RE.match(expr)
    if m_sq:
        val, base_u = _to_base_pint(m_sq.group(1), m_sq.group(2))
        return PhysicalVal(val, val, val, base_u, expr.strip(), line_no, file_rel)

    return None


def _strip_comment(line: str) -> str:
    in_q = False
    quote_ch = ""
    for i, ch in enumerate(line):
        if ch in ('"', "'") and (i == 0 or line[i - 1] != "\\"):
            if not in_q:
                in_q = True
                quote_ch = ch
            elif quote_ch == ch:
                in_q = False
        elif ch == "#" and not in_q:
            return line[:i]
    return line


def _resolve_ato_cli() -> Optional[str]:
    candidates = [
        pathlib.Path(".venv/Scripts/ato.exe"),
        pathlib.Path(".venv/bin/ato"),
        shutil.which("ato"),
    ]
    for c in candidates:
        if c and pathlib.Path(str(c)).is_file():
            return str(pathlib.Path(str(c)).resolve())
    return None


def _run_subprocess_ato_check(proj_dir: pathlib.Path) -> Optional[Dict[str, Any]]:
    cli = _resolve_ato_cli()
    if not cli or not (proj_dir / "ato.yaml").is_file():
        return None
    env = dict(os.environ)
    env["PYTHONUTF8"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    env["ATO_OFFLINE"] = "1"
    try:
        proc = subprocess.Popen(
            [cli, "build", "--keep-picked-parts"],
            cwd=str(proj_dir),
            env=env,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        _SUPERVISOR._children.append(proc)
        _SUPERVISOR.attach_child(proc)
        out, err = proc.communicate(timeout=20)
        return {"cli": cli, "returncode": proc.returncode, "stdout": out, "stderr": err}
    except Exception as exc:
        return {"cli": cli, "returncode": -1, "stdout": "", "stderr": str(exc)}


def compile_ato_workspace(
    proj_dir: pathlib.Path,
    con: Optional[sqlite3.Connection] = None,
    pcb_path: Optional[pathlib.Path] = None,
    apply_changes: bool = True,
) -> Dict[str, Any]:
    """
    Compiles workspace `.ato` files using grammar rules grounded in vendor/ring1-refs/atopile + Pint,
    validates physical tolerance assertions, protects HW-IR `locked = 1` entities, and updates
    unlocked `.kicad_pcb` + `external_id_map` cleanly.
    """
    proj_dir = pathlib.Path(proj_dir).resolve()
    ato_files = sorted(proj_dir.rglob("*.ato"))
    if not ato_files:
        ato_files = [proj_dir / "elec" / "src" / "main.ato"]

    components: Dict[str, AtoComponentSpec] = {}
    nets: Dict[str, Dict[str, Any]] = {}
    variables: Dict[str, PhysicalVal] = {}
    assertions: List[Tuple[str, int, int, str]] = []
    diagnostics: List[AtoDiagnostic] = []

    comp_stmt_re = re.compile(r'^component\s+([A-Za-z_][A-Za-z0-9_]*)\s+"([^"]*)"\s*$')
    new_stmt_re = re.compile(r'^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*new\s+([A-Za-z_][A-Za-z0-9_.]*)\s*(?:"([^"]*)")?\s*$')
    net_colon_re = re.compile(r'^net\s+([A-Za-z0-9_+.-]+)\s*:\s*(.+)$')
    signal_re = re.compile(r'^signal\s+([A-Za-z0-9_+.-]+)\s*$')
    wire_re = re.compile(r'^([A-Za-z0-9_.]+)\s*(?:~|->|<-)\s*([A-Za-z0-9_.]+)\s*$')
    assign_re = re.compile(r'^([A-Za-z_][A-Za-z0-9_.]*)(?:\s*:\s*[A-Za-z_]+)?\s*=\s*(.+)$')
    assert_re = re.compile(r'^assert\s+(.+)$')
    bad_num_ident_re = re.compile(r'^(\d+[A-Za-z_][A-Za-z0-9_]*)\s*=')

    for fpath in ato_files:
        if not fpath.is_file():
            continue
        rel = fpath.relative_to(proj_dir).as_posix()
        raw_lines = fpath.read_text(encoding="utf-8", errors="replace").splitlines()
        for idx, raw_line in enumerate(raw_lines, start=1):
            code = _strip_comment(raw_line).strip()
            if not code or code.startswith(("module ", "interface ", "from ", "import ", "pass")):
                continue
            if code.count('"') % 2 != 0:
                diagnostics.append(AtoDiagnostic(
                    file=rel, line=idx, col=1, severity="error",
                    constraint_failure="SYNTAX_UNCLOSED_STRING",
                    expected='Closing quote "', actual=code,
                    message=f"Syntax error in {rel}:{idx}: unclosed string literal",
                ))
                continue
            m_bad = bad_num_ident_re.match(code)
            if m_bad:
                diagnostics.append(AtoDiagnostic(
                    file=rel, line=idx, col=1, severity="error",
                    constraint_failure="SYNTAX_INVALID_IDENTIFIER",
                    expected="Identifier starting with [A-Za-z_]", actual=m_bad.group(1),
                    message=f"Invalid name `{m_bad.group(1)}`: names cannot start with a number.",
                ))
                continue

            if m_cs := comp_stmt_re.match(code):
                ref, val = m_cs.groups()
                components[ref] = AtoComponentSpec(refdes=ref, mpn_or_type=val, value_str=val, file=rel, line=idx)
                continue

            if m_new := new_stmt_re.match(code):
                ref, typ, extra = m_new.groups()
                val_s = extra or typ
                components[ref] = AtoComponentSpec(refdes=ref, mpn_or_type=typ, value_str=val_s, file=rel, line=idx)
                continue

            if m_net := net_colon_re.match(code):
                n_name, rhs = m_net.groups()
                endpoints = [p.strip() for p in re.split(r"->|~|<-", rhs) if p.strip()]
                nets[n_name] = {"name": n_name, "endpoints": endpoints, "file": rel, "line": idx}
                continue

            if m_sig := signal_re.match(code):
                n_name = m_sig.group(1)
                nets.setdefault(n_name, {"name": n_name, "endpoints": [], "file": rel, "line": idx})
                continue

            if m_wire := wire_re.match(code):
                a, b = m_wire.groups()
                n_name = a.replace(".", "_")
                nets.setdefault(n_name, {"name": n_name, "endpoints": [a, b], "file": rel, "line": idx})
                continue

            if m_assert := assert_re.match(code):
                assertions.append((rel, idx, 1, m_assert.group(1).strip()))
                continue

            if m_asg := assign_re.match(code):
                lhs, rhs = m_asg.group(1).strip(), m_asg.group(2).strip()
                rhs_clean = rhs.strip('"').strip("'")
                if "." in lhs:
                    owner, prop = lhs.split(".", 1)
                    if owner in components:
                        c = components[owner]
                        if prop in ("value", "mpn", "part"):
                            c.value_str = rhs_clean
                        elif prop == "footprint":
                            c.footprint = rhs_clean
                        elif prop == "x_mm":
                            c.x_mm = float(re.sub(r"[A-Za-z]+$", "", rhs_clean))
                        elif prop == "y_mm":
                            c.y_mm = float(re.sub(r"[A-Za-z]+$", "", rhs_clean))
                        else:
                            pval = _parse_physical(rhs_clean, rel, idx)
                            if pval:
                                variables[lhs] = pval
                                c.props[prop] = pval.raw
                            else:
                                c.props[prop] = rhs_clean
                else:
                    pval = _parse_physical(rhs_clean, rel, idx)
                    if pval:
                        variables[lhs] = pval

    # Built-in physical formula evaluation (voltage divider v_out = v_in * r_bottom / (r_top + r_bottom))
    if "v_in" in variables and "r_top" in variables and "r_bottom" in variables:
        vin = variables["v_in"]
        rt = variables["r_top"]
        rb = variables["r_bottom"]
        if rt.unit == "ohm" and rb.unit == "ohm" and vin.unit == "V":
            vo_min = vin.min_val * (rb.min_val / (rt.max_val + rb.min_val))
            vo_max = vin.max_val * (rb.max_val / (rt.min_val + rb.max_val))
            vo_nom = vin.nominal * (rb.nominal / (rt.nominal + rb.nominal))
            variables["v_out"] = PhysicalVal(vo_nom, vo_min, vo_max, "V", f"{vo_nom:.3f}V", vin.line, vin.file)

    # Evaluate physical assertions with Pint
    within_re = re.compile(r"^([A-Za-z_][A-Za-z0-9_.]*)\s+within\s+(.+)$")
    cmp_re = re.compile(r"^([A-Za-z_][A-Za-z0-9_.]*)\s*(<=|>=|<|>)\s*(.+)$")
    for rel, line_no, col_no, body in assertions:
        if m_w := within_re.match(body):
            var_name, range_expr = m_w.groups()
            target_ref = var_name.split(".")[0] if "." in var_name else None
            var_val = variables.get(var_name)
            bnd = _parse_physical(range_expr, rel, line_no)
            if not var_val:
                diagnostics.append(AtoDiagnostic(
                    file=rel, line=line_no, col=col_no, severity="error",
                    constraint_failure="UNRESOLVED_PARAMETER",
                    expected=range_expr, actual="undefined",
                    message=f"Cannot assert `{var_name}`: parameter undefined.",
                    refdes=target_ref if target_ref in components else None,
                ))
                continue
            if not bnd:
                diagnostics.append(AtoDiagnostic(
                    file=rel, line=line_no, col=col_no, severity="error",
                    constraint_failure="INVALID_BOUND_EXPRESSION",
                    expected="<low> to <high> or <nom> +/- <tol>", actual=range_expr,
                    message=f"Invalid assertion range `{range_expr}`.",
                    refdes=target_ref if target_ref in components else None,
                ))
                continue
            if var_val.unit != bnd.unit:
                diagnostics.append(AtoDiagnostic(
                    file=rel, line=line_no, col=col_no, severity="error",
                    constraint_failure="DIMENSIONAL_UNIT_MISMATCH",
                    expected=bnd.unit, actual=var_val.unit,
                    message=f"Unit mismatch for `{var_name}`: got {var_val.unit}, expected {bnd.unit}.",
                    refdes=target_ref if target_ref in components else None,
                ))
                continue
            if var_val.min_val < bnd.min_val - 1e-9 or var_val.max_val > bnd.max_val + 1e-9:
                diagnostics.append(AtoDiagnostic(
                    file=rel, line=line_no, col=col_no, severity="error",
                    constraint_failure="CONSTRAINT_OUT_OF_BOUNDS",
                    expected=f"[{bnd.min_val:.4g}, {bnd.max_val:.4g}] {bnd.unit}",
                    actual=f"[{var_val.min_val:.4g}, {var_val.max_val:.4g}] {var_val.unit}",
                    message=(
                        f"Constraint failed for `{var_name}`: actual [{var_val.min_val:.4g}, {var_val.max_val:.4g}] {var_val.unit} "
                        f"violates expected [{bnd.min_val:.4g}, {bnd.max_val:.4g}] {bnd.unit}."
                    ),
                    refdes=target_ref if target_ref in components else None,
                ))
        elif m_c := cmp_re.match(body):
            var_name, op, rhs = m_c.groups()
            target_ref = var_name.split(".")[0] if "." in var_name else None
            var_val = variables.get(var_name)
            lim = _parse_physical(rhs, rel, line_no)
            if var_val and lim and var_val.unit == lim.unit:
                failed = (
                    (op == "<=" and var_val.max_val > lim.nominal + 1e-9)
                    or (op == "<" and var_val.max_val >= lim.nominal)
                    or (op == ">=" and var_val.min_val < lim.nominal - 1e-9)
                    or (op == ">" and var_val.min_val <= lim.nominal)
                )
                if failed:
                    diagnostics.append(AtoDiagnostic(
                        file=rel, line=line_no, col=col_no, severity="error",
                        constraint_failure="CONSTRAINT_LIMIT_EXCEEDED",
                        expected=f"{op} {lim.nominal:.4g} {lim.unit}",
                        actual=f"[{var_val.min_val:.4g}, {var_val.max_val:.4g}] {var_val.unit}",
                        message=f"Constraint failed: `{var_name}` ({var_val.raw}) violates `{op} {rhs}`.",
                        refdes=target_ref if target_ref in components else None,
                    ))

    subproc_info = _run_subprocess_ato_check(proj_dir)
    error_count = sum(1 for d in diagnostics if d.severity == "error")
    lock_conflicts: List[Dict[str, Any]] = []
    synced_refs: List[str] = []
    added_refs: List[str] = []
    pcb_sha_after = ""
    revision_after = _ACTIVE_STATE["revision"]

    if apply_changes and error_count == 0 and con is not None:
        ensure_external_id_map(con)
        cur = con.cursor()
        board_row = cur.execute("SELECT id FROM boards LIMIT 1").fetchone()
        if board_row:
            board_id = str(board_row[0])
            nc_row = cur.execute("SELECT id FROM net_classes LIMIT 1").fetchone()
            nc_id = str(nc_row[0]) if nc_row else ""

            cur.execute("UPDATE _tx_actor_ctx SET actor_kind = 'agent', allow_lock_override = 0 WHERE singleton = 1")
            for ref, spec in components.items():
                existing = cur.execute(
                    "SELECT id, x_nm, y_nm, rot_mdeg, locked, value_str, footprint_ref FROM components WHERE board_id = ? AND refdes = ? AND deleted = 0",
                    (board_id, ref),
                ).fetchone()
                ato_key = f"{spec.file}::{ref}"
                if existing:
                    cid, cur_x, cur_y, cur_rot, locked, cur_val, cur_fp = existing
                    cur.execute(
                        """
                        INSERT OR REPLACE INTO external_id_map (hwir_uuid, entity_table, external_system, external_key, last_sync_sha256)
                        VALUES (?, 'components', 'atopile', ?, ?)
                        """,
                        (str(cid), ato_key, sha256_text(spec.value_str)),
                    )
                    req_x = int(round(spec.x_mm * 1_000_000)) if spec.x_mm is not None else None
                    req_y = int(round(spec.y_mm * 1_000_000)) if spec.y_mm is not None else None
                    wants_move = (req_x is not None and req_x != int(cur_x)) or (req_y is not None and req_y != int(cur_y))
                    if int(locked) == 1 and (wants_move or spec.value_str != str(cur_val)):
                        lock_conflicts.append({
                            "error": "KERNEL_LOCK_VIOLATION",
                            "refdes": ref,
                            "hwir_uuid": str(cid),
                            "message": f"Human lock protected {ref} (locked = 1); atopile did not alter manual placement or properties.",
                            "ghost_diff": {
                                "refdes": ref,
                                "proposed_value": spec.value_str,
                                "proposed_x_mm": spec.x_mm,
                                "proposed_y_mm": spec.y_mm,
                            },
                        })
                        continue
                    new_x = req_x if req_x is not None else int(cur_x)
                    new_y = req_y if req_y is not None else int(cur_y)
                    if new_x != int(cur_x) or new_y != int(cur_y) or spec.value_str != str(cur_val):
                        cur.execute(
                            "UPDATE components SET x_nm = ?, y_nm = ?, value_str = ?, rev_lamport = rev_lamport + 1 WHERE id = ?",
                            (new_x, new_y, spec.value_str, str(cid)),
                        )
                        synced_refs.append(ref)
                else:
                    cid = new_uuidv7()
                    idx_offset = len(components) * 6_000_000
                    px_nm = int(round((spec.x_mm or 25.0) * 1_000_000)) + (idx_offset % 30_000_000)
                    py_nm = int(round((spec.y_mm or 14.0) * 1_000_000))
                    cur.execute(
                        """
                        INSERT INTO components (
                            id, board_id, refdes, value_str, mpn, package_name, footprint_ref,
                            functional_group, x_nm, y_nm, rot_mdeg, side,
                            courtyard_w_nm, courtyard_h_nm, power_diss_mw, unit_cost_usd,
                            params_json, provenance, locked, lock_owner, lock_reason, rev_lamport
                        ) VALUES (?, ?, ?, ?, ?, '0603', ?, 'atopile', ?, ?, 0, 'top', 2200000, 1400000, 10.0, 0.02, ?, 'cubo', 0, NULL, NULL, 1)
                        """,
                        (cid, board_id, ref, spec.value_str, spec.mpn_or_type, spec.footprint, px_nm, py_nm, json.dumps(spec.props)),
                    )
                    cur.execute(
                        """
                        INSERT OR REPLACE INTO external_id_map (hwir_uuid, entity_table, external_system, external_key, last_sync_sha256)
                        VALUES (?, 'components', 'atopile', ?, ?)
                        """,
                        (cid, ato_key, sha256_text(spec.value_str)),
                    )
                    added_refs.append(ref)

            # Register declared .ato nets in HW-IR if missing
            for n_name, n_spec in nets.items():
                n_row = cur.execute("SELECT id FROM nets WHERE board_id = ? AND name = ?", (board_id, n_name)).fetchone()
                if not n_row and nc_id:
                    nid = new_uuidv7()
                    cur.execute(
                        "INSERT INTO nets (id, board_id, name, net_class_id, signal_role, nominal_voltage_v, is_high_speed, provenance, locked, rev_lamport) VALUES (?, ?, ?, ?, 'generic', 3.3, 0, 'cubo', 0, 1)",
                        (nid, board_id, n_name, nc_id),
                    )
                    cur.execute(
                        "INSERT OR REPLACE INTO external_id_map (hwir_uuid, entity_table, external_system, external_key, last_sync_sha256) VALUES (?, 'nets', 'atopile', ?, ?)",
                        (nid, f"{n_spec['file']}::{n_name}", sha256_text(n_name)),
                    )
            con.commit()

            # Sync HW-IR -> KiCad .kicad_pcb (preserving locked footprints + updating Value strings!)
            target_pcb = pcb_path or _resolve_project_file({"project_dir": str(proj_dir)}, "pcb_path", ".kicad_pcb", prefer_active=True)
            if target_pcb.is_file():
                trees = parse_sexpr(target_pcb.read_text(encoding="utf-8"))
                root = trees[0]
                updated_pcb_vals = False
                for fp in _find_children(root, "footprint"):
                    f_ref, _ = _extract_fp_ref_and_val(fp)
                    is_locked = _find_child(fp, "locked") is not None
                    if f_ref in components and not is_locked and f_ref in synced_refs:
                        for prop in _find_children(fp, "property"):
                            if len(prop) >= 3 and _atom_or_str_val(prop[1]) == "Value":
                                if _atom_or_str_val(prop[2]) != components[f_ref].value_str:
                                    prop[2] = SStr(components[f_ref].value_str)
                                    updated_pcb_vals = True
                if added_refs:
                    for add_ref in added_refs:
                        sp = components[add_ref]
                        u = new_uuidv7()
                        new_fp = [
                            SAtom("footprint"),
                            SStr(sp.footprint),
                            [SAtom("layer"), SStr("F.Cu")],
                            [SAtom("uuid"), SStr(u)],
                            [SAtom("at"), SAtom(f"{(sp.x_mm or 25.0):.3f}"), SAtom(f"{(sp.y_mm or 14.0):.3f}"), SAtom("0")],
                            [SAtom("property"), SStr("Reference"), SStr(sp.refdes), [SAtom("at"), SAtom("0"), SAtom("-1.4")], [SAtom("layer"), SStr("F.SilkS")], [SAtom("uuid"), SStr(new_uuidv7())]],
                            [SAtom("property"), SStr("Value"), SStr(sp.value_str), [SAtom("at"), SAtom("0"), SAtom("1.4")], [SAtom("layer"), SStr("F.Fab")], [SAtom("uuid"), SStr(new_uuidv7())]],
                        ]
                        root.append(new_fp)
                        updated_pcb_vals = True
                if updated_pcb_vals:
                    pcb_sha_after = write_text_atomic(target_pcb, format_sexpr(root) + "\n", echo_ring=_BRIDGE.echo_ring)
                    with _STATE_LOCK:
                        _ACTIVE_STATE["last_pcb_sha256"] = pcb_sha_after
                        _ACTIVE_STATE["revision"] += 1
                        revision_after = _ACTIVE_STATE["revision"]
                    broadcast_ws_event({
                        "type": "ato_build_complete",
                        "revision": revision_after,
                        "pcb_path": str(target_pcb),
                        "pcb_sha256": pcb_sha_after,
                        "added_refs": added_refs,
                        "synced_refs": synced_refs,
                        "lock_conflicts": lock_conflicts,
                    })

    # Collect external_id_map rows for atopile
    id_bindings: Dict[str, str] = {}
    if con is not None:
        ensure_external_id_map(con)
        for ek, hu in con.execute("SELECT external_key, hwir_uuid FROM external_id_map WHERE external_system = 'atopile'").fetchall():
            id_bindings[str(ek)] = str(hu)

    return {
        "success": error_count == 0,
        "engine": "atopile-ast-pint-bridge",
        "cli_subprocess": subproc_info,
        "files_compiled": [str(f.relative_to(proj_dir).as_posix()) for f in ato_files if f.is_file()],
        "components": [
            {
                "refdes": c.refdes,
                "type": c.mpn_or_type,
                "value": c.value_str,
                "footprint": c.footprint,
                "file": c.file,
                "line": c.line,
                "props": c.props,
                "hwir_uuid": id_bindings.get(f"{c.file}::{c.refdes}"),
            }
            for c in components.values()
        ],
        "nets": list(nets.values()),
        "resolved_parameters": {
            k: {
                "nominal": v.nominal,
                "min": v.min_val,
                "max": v.max_val,
                "unit": v.unit,
                "raw": v.raw,
                "file": v.file,
                "line": v.line,
            }
            for k, v in variables.items()
        },
        "diagnostics": [d.to_dict() for d in diagnostics],
        "lock_conflicts": lock_conflicts,
        "synced_refs": synced_refs,
        "added_refs": added_refs,
        "revision": revision_after,
        "pcb_sha256": pcb_sha_after,
    }


def _send_json(handler: Any, status: int, body: Dict[str, Any]) -> None:
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler._send_cors()
    handler.end_headers()
    handler.wfile.write(json.dumps(body).encode("utf-8"))


def handle_ato_get(handler: Any, path: str, full_path: str = "", con: Optional[sqlite3.Connection] = None) -> bool:
    if path in ("/api/v1/ato/graph", "/api/ato/graph"):
        proj_dir = _ensure_active_workspace()
        res = compile_ato_workspace(proj_dir, con=con, apply_changes=False)
        _send_json(handler, 200, res)
        return True
    return False


def handle_ato_post(handler: Any, path: str, req: Dict[str, Any], con: Optional[sqlite3.Connection] = None) -> bool:
    if path in ("/api/v1/ato/check", "/api/ato/check"):
        proj_dir = pathlib.Path(req["project_dir"]) if req.get("project_dir") else _ensure_active_workspace()
        res = compile_ato_workspace(proj_dir, con=con, apply_changes=False)
        _send_json(handler, 200, res)
        return True

    if path in ("/api/v1/ato/build", "/api/ato/build"):
        proj_dir = pathlib.Path(req["project_dir"]) if req.get("project_dir") else _ensure_active_workspace()
        pcb_override = pathlib.Path(req["pcb_path"]) if req.get("pcb_path") else None
        res = compile_ato_workspace(proj_dir, con=con, pcb_path=pcb_override, apply_changes=True)
        _send_json(handler, 200, res)
        return True

    return False
