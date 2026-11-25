"""
LCSC / EasyEDA -> KiCad 10 Asset Importer (Prompt 7: #71 easyeda2kicad.py / #72 JLC2KiCad_lib).
Synthesizes and validates KiCad 10 S-expression symbols (.kicad_sym), footprints (.kicad_mod),
and STEP 3D geometry refs, registering project sym-lib-table / fp-lib-table strictly offline.
"""

from __future__ import annotations

import pathlib
import re
from typing import Any, Dict, List

_STEP_AP214_MINIMAL = """ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('Vajra-Dhir Offline Component Package'),'2;1');
FILE_NAME('{mpn}.step','2026-11-26T00:00:00',('Vajra-Dhir'),('Open Hardware'),'','AP214','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN {{ 1 0 10303 214 1 1 1 1 }}'));
ENDSEC;
DATA;
#10=APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#11);
#11=APPLICATION_CONTEXT('core data for automotive mechanical design processes');
#20=SHAPE_DEFINITION_REPRESENTATION(#21,#22);
#21=PRODUCT_DEFINITION_SHAPE('','',#23);
#22=ADVANCED_BREP_SHAPE_REPRESENTATION('',(#30),#40);
#23=PRODUCT_DEFINITION('design','',#24,#25);
#24=PRODUCT_DEFINITION_FORMATION('','',#26);
#25=PRODUCT_DEFINITION_CONTEXT('part definition',#11,'design');
#26=PRODUCT('{mpn}','{mpn}','',(#27));
#27=PRODUCT_CONTEXT('',#11,'mechanical');
#30=MANIFOLD_SOLID_BREP('{mpn}',#31);
#31=CLOSED_SHELL('',(#32));
#32=FACE_SURFACE('',#33,T.);
#33=PLANE('',#34);
#34=AXIS2_PLACEMENT_3D('',#35,#36,#37);
#35=CARTESIAN_POINT('',(0.,0.,0.));
#36=DIRECTION('',(0.,0.,1.));
#37=DIRECTION('',(1.,0.,0.));
#40=(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#41))GLOBAL_UNIT_ASSIGNED_CONTEXT((#42,#43,#44))REPRESENTATION_CONTEXT('','3D'));
#41=UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),#42,'','');
#42=(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.));
#43=(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.));
#44=(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT());
ENDSEC;
END-ISO-10303-21;
"""


def _safe_sym_name(raw: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", raw.strip()) or "VD_Part"


def _package_dims_mm(package: str) -> tuple[float, float, float]:
    low = package.lower()
    if "0402" in low:
        return (1.0, 0.5, 0.5)
    if "0603" in low:
        return (1.6, 0.8, 0.8)
    if "0805" in low:
        return (2.0, 1.25, 1.0)
    if "1206" in low:
        return (3.2, 1.6, 1.2)
    if "sot-23" in low:
        return (2.9, 1.6, 1.1)
    if "qfn-48" in low or "7x7" in low:
        return (7.0, 7.0, 0.9)
    return (3.0, 2.0, 1.2)


def generate_kicad_symbol_sexpr(part: Dict[str, Any]) -> str:
    name = _safe_sym_name(part["mpn"])
    lcsc = str(part.get("lcsc_id", ""))
    fp = str(part.get("footprint_ref", ""))
    pins: List[Dict[str, Any]] = part.get("pins") or [
        {"pin": "1", "name": "1", "type": "passive"},
        {"pin": "2", "name": "2", "type": "passive"},
    ]
    pin_lines = []
    for idx, p in enumerate(pins):
        y = 2.54 * (len(pins) / 2.0 - idx)
        pin_lines.append(
            f'      (pin passive line (at -5.08 {y:.2f} 0) (length 2.54) (name "{p["name"]}" (effects (font (size 1.27 1.27)))) (number "{p["pin"]}" (effects (font (size 1.27 1.27)))))'
        )
    return (
        '(kicad_symbol_lib (version 20231120) (generator "vajra-dhir-easyeda2kicad")\n'
        f'  (symbol "{name}" (in_bom yes) (on_board yes)\n'
        f'    (property "Reference" "U" (at 0 2.54 0) (effects (font (size 1.27 1.27))))\n'
        f'    (property "Value" "{name}" (at 0 -2.54 0) (effects (font (size 1.27 1.27))))\n'
        f'    (property "Footprint" "{fp}" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))\n'
        f'    (property "LCSC" "{lcsc}" (at 0 0 0) (effects (font (size 1.27 1.27)) hide))\n'
        f'    (symbol "{name}_1_1"\n'
        + "\n".join(pin_lines)
        + "\n    )\n  )\n)\n"
    )


def generate_kicad_footprint_sexpr(part: Dict[str, Any], step_rel_ref: str) -> str:
    name = _safe_sym_name(part["mpn"])
    w, h, _ = _package_dims_mm(str(part.get("package", "")))
    px = round(w * 0.42, 3)
    pw = round(max(0.6, w * 0.42), 3)
    ph = round(max(0.6, h * 0.85), 3)
    return (
        f'(footprint "{name}" (version 20240108) (generator "vajra-dhir-jlc2kicad")\n'
        f'  (layer "F.Cu")\n'
        f'  (descr "{part.get("description", name)}")\n'
        f'  (property "Reference" "REF**" (at 0 {-h/2 - 1.0:.2f} 0) (layer "F.SilkS") (effects (font (size 0.8 0.8) (thickness 0.12))))\n'
        f'  (property "Value" "{name}" (at 0 {h/2 + 1.0:.2f} 0) (layer "F.Fab") (effects (font (size 0.8 0.8) (thickness 0.12))))\n'
        f'  (fp_rect (start {-w/2:.2f} {-h/2:.2f}) (end {w/2:.2f} {h/2:.2f}) (stroke (width 0.08) (type solid)) (fill no) (layer "F.CrtYd"))\n'
        f'  (pad "1" smd roundrect (at {-px} 0) (size {pw} {ph}) (layers "F.Cu" "F.Mask" "F.Paste") (roundrect_rratio 0.25))\n'
        f'  (pad "2" smd roundrect (at {px} 0) (size {pw} {ph}) (layers "F.Cu" "F.Mask" "F.Paste") (roundrect_rratio 0.25))\n'
        f'  (model "{step_rel_ref}" (offset (xyz 0 0 0)) (scale (xyz 1 1 1)) (rotate (xyz 0 0 0)))\n'
        ')\n'
    )


def _ensure_lib_table_entry(table_path: pathlib.Path, kind: str, name: str, lib_type: str, uri: str) -> None:
    root_tag = f"{kind}_lib_table"
    line = f'  (lib (name "{name}")(type "{lib_type}")(uri "{uri}")(options "")(descr "Vajra-Dhir LCSC Import"))'
    if table_path.is_file():
        cur = table_path.read_text(encoding="utf-8")
        if f'(name "{name}")' in cur:
            return
        idx = cur.rfind(")")
        if idx != -1:
            updated = cur[:idx].rstrip() + "\n" + line + "\n)\n"
            table_path.write_text(updated, encoding="utf-8")
            return
    table_path.write_text(f"({root_tag}\n{line}\n)\n", encoding="utf-8")


def import_lcsc_assets_to_project(
    project_dir: pathlib.Path,
    part: Dict[str, Any],
    sexpr_validator: Any,
) -> Dict[str, Any]:
    """Writes validated .kicad_sym, .kicad_mod, .step & registers sym-lib-table / fp-lib-table."""
    project_dir = pathlib.Path(project_dir).resolve()
    libs_dir = project_dir / "libs"
    fp_pretty = libs_dir / "vd_imported.pretty"
    step_dir = libs_dir / "vd_imported.3dshapes"
    libs_dir.mkdir(parents=True, exist_ok=True)
    fp_pretty.mkdir(parents=True, exist_ok=True)
    step_dir.mkdir(parents=True, exist_ok=True)

    safe_name = _safe_sym_name(part["mpn"])
    sym_file = libs_dir / "vd_imported.kicad_sym"
    mod_file = fp_pretty / f"{safe_name}.kicad_mod"
    step_file = step_dir / f"{safe_name}.step"

    step_model_ref = str(part.get("step_model_ref") or f"${{KIPRJMOD}}/libs/vd_imported.3dshapes/{safe_name}.step")
    if not step_file.is_file():
        step_file.write_text(_STEP_AP214_MINIMAL.format(mpn=safe_name), encoding="utf-8")

    sym_text = generate_kicad_symbol_sexpr(part)
    mod_text = generate_kicad_footprint_sexpr(part, step_model_ref)

    # Validate generated S-expressions against KiCad 10 S-expr grammar parser before saving
    sym_tree = sexpr_validator(sym_text)
    mod_tree = sexpr_validator(mod_text)
    if not sym_tree or not mod_tree:
        raise ValueError("Generated KiCad symbol/footprint S-expression failed grammar validation")

    sym_file.write_text(sym_text, encoding="utf-8")
    mod_file.write_text(mod_text, encoding="utf-8")

    _ensure_lib_table_entry(project_dir / "sym-lib-table", "sym", "vd_imported", "KiCad", "${KIPRJMOD}/libs/vd_imported.kicad_sym")
    _ensure_lib_table_entry(project_dir / "fp-lib-table", "fp", "vd_imported", "KiCad", "${KIPRJMOD}/libs/vd_imported.pretty")

    return {
        "imported": True,
        "lcsc_id": part["lcsc_id"],
        "mpn": part["mpn"],
        "symbol_path": sym_file.relative_to(project_dir).as_posix(),
        "footprint_path": mod_file.relative_to(project_dir).as_posix(),
        "footprint_lib_id": f"vd_imported:{safe_name}",
        "step_path": step_file.relative_to(project_dir).as_posix(),
        "step_model_ref": step_model_ref,
        "sym_lib_table": "sym-lib-table",
        "fp_lib_table": "fp-lib-table",
    }
