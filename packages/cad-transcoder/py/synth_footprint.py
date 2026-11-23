# packages/cad-transcoder/py/synth_footprint.py
"""
IPC-7351B Footprint Auto-Synthesizer.
Synthesizes KiCad 10 KLC-compliant .kicad_mod land patterns
for missing components during universal CAD imports.
"""

from typing import Dict, Any

def synthesize_qfn_footprint(
    pin_count: int = 24,
    body_size_mm: float = 4.0,
    pitch_mm: float = 0.5,
    ep_size_mm: float = 2.5
) -> str:
    """
    Synthesizes a standard Quad Flat No-Lead (QFN) package footprint in KiCad 10 S-expression.
    """
    name = f"Package_DFN_QFN:QFN-{pin_count}-1EP_{body_size_mm:.1f}x{body_size_mm:.1f}mm_P{pitch_mm:.2f}mm_EP{ep_size_mm:.1f}x{ep_size_mm:.1f}mm"
    lines = [
        f'(footprint "{name}" (version 20240108) (generator "vajra_dhir_ipc7351")',
        '  (layer "F.Cu")',
        '  (descr "IPC-7351B QFN land pattern synthesized autonomously")',
        f'  (attr smd)',
        '  (fp_text reference "REF**" (at 0 -3.0) (layer "F.SilkS") (effects (font (size 1 1) (thickness 0.15))))',
        '  (fp_text value "VAL**" (at 0 3.0) (layer "F.Fab") (effects (font (size 1 1) (thickness 0.15))))',
    ]

    # Courtyard
    half_c = body_size_mm / 2.0 + 0.25 # 0.25mm courtyard clearance
    lines.extend([
        f'  (fp_rect (start -{half_c} -{half_c}) (end {half_c} {half_c}) (stroke (width 0.05) (type solid)) (layer "F.CrtYd"))',
        # Pin 1 marker
        '  (fp_circle (center -2.2 -2.2) (end -2.0 -2.2) (stroke (width 0.15) (type solid)) (layer "F.SilkS"))',
    ])

    # Exposed Thermal Pad (Center EP)
    lines.append(f'  (pad "{pin_count + 1}" smd rect (at 0 0) (size {ep_size_mm} {ep_size_mm}) (layers "F.Cu" "F.Paste" "F.Mask"))')

    # Peripheral pads
    pins_per_side = pin_count // 4
    pad_len = 0.8
    pad_w = 0.28
    radius = body_size_mm / 2.0

    pad_idx = 1
    # Side 1: Left (Top to Bottom)
    y_start = -((pins_per_side - 1) * pitch_mm) / 2.0
    for i in range(pins_per_side):
        y = y_start + i * pitch_mm
        lines.append(f'  (pad "{pad_idx}" smd roundrect (at -{radius:.3f} {y:.3f}) (size {pad_len} {pad_w}) (layers "F.Cu" "F.Paste" "F.Mask") (roundrect_rratio 0.25))')
        pad_idx += 1

    lines.append(')')
    return "\n".join(lines) + "\n"
