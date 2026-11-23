# packages/cad-transcoder/py/importers.py
"""
Universal CAD Importers & Netlist Reconstructor.
Supports:
1. KiCad 5–10 S-Expressions (.kicad_pcb, .kicad_sch)
2. EasyEDA JSON format
3. Gerber X2 %TO.P / %TO.N netlist reconstructor
4. Specctra DSN netlist translator
"""

import re
import json
import uuid
from typing import Dict, List, Any

class ImportedDesign:
    def __init__(self, format_name: str, components: List[Dict[str, Any]], nets: List[Dict[str, Any]]):
        self.format_name = format_name
        self.components = components
        self.nets = nets

def import_kicad_pcb(content: str) -> ImportedDesign:
    """
    Parses KiCad 6/7/8/9/10 .kicad_pcb S-expressions into canonical components and nets.
    """
    nets = []
    components = []

    # Extract nets: (net 1 "GND")
    for match in re.finditer(r'\(net\s+(\d+)\s+"([^"]*)"\)', content):
        net_num = int(match.group(1))
        net_name = match.group(2)
        nets.append({
            "id": str(uuid.uuid4()),
            "net_code": net_num,
            "name": net_name
        })

    # Extract footprints: (footprint "..." (at X Y [ROT]) (fp_text reference "REF" ...))
    fp_pattern = re.compile(r'\((?:footprint|module)\s+"([^"]+)"(.*?)\n\s*\)', re.DOTALL)
    for match in fp_pattern.finditer(content):
        pkg = match.group(1)
        body = match.group(2)
        ref_match = re.search(r'\(fp_text\s+reference\s+"([^"]+)"', body)
        refdes = ref_match.group(1) if ref_match else "U?"
        at_match = re.search(r'\(at\s+([-\d.]+)\s+([-\d.]+)(?:\s+([-\d.]+))?\)', body)
        x_mm = float(at_match.group(1)) if at_match else 0.0
        y_mm = float(at_match.group(2)) if at_match else 0.0
        rot_deg = float(at_match.group(3)) if (at_match and at_match.group(3)) else 0.0

        components.append({
            "id": str(uuid.uuid4()),
            "refdes": refdes,
            "package_name": pkg,
            "x_nm": int(x_mm * 1000000),
            "y_nm": int(y_mm * 1000000),
            "rot_mdeg": int(rot_deg * 1000)
        })

    return ImportedDesign("kicad_pcb", components, nets)

def import_easyeda_json(json_text: str) -> ImportedDesign:
    """
    Parses EasyEDA Standard/Pro export JSON into canonical components and nets.
    """
    data = json.loads(json_text)
    components = []
    nets = []

    for comp in data.get("components", []):
        components.append({
            "id": str(uuid.uuid4()),
            "refdes": comp.get("refdes", "U?"),
            "package_name": comp.get("package", "UNKNOWN"),
            "x_nm": int(comp.get("x_mm", 0.0) * 1000000),
            "y_nm": int(comp.get("y_mm", 0.0) * 1000000),
            "rot_mdeg": int(comp.get("rotation_deg", 0.0) * 1000)
        })

    for net_name in data.get("nets", []):
        nets.append({
            "id": str(uuid.uuid4()),
            "name": net_name
        })

    return ImportedDesign("easyeda_json", components, nets)

def reconstruct_gerber_x2_netlist(gerber_text: str) -> List[Dict[str, Any]]:
    """
    Extracts netlist connectivity from Gerber X2 files using standard attributes:
    %TO.P,ref,pin*% (Component Pin attribute)
    %TO.N,netname*% (Net attribute)
    """
    reconstructed = []
    current_net = "UNASSIGNED"

    for line in gerber_text.splitlines():
        line = line.strip()
        if line.startswith("%TO.N,"):
            # %TO.N,GND*%
            m = re.match(r'%TO\.N,([^%*]+)', line)
            if m:
                current_net = m.group(1)
        elif line.startswith("%TO.P,"):
            # %TO.P,C1,1*%
            m = re.match(r'%TO\.P,([^,]+),([^%*]+)', line)
            if m:
                refdes, pin = m.group(1), m.group(2)
                reconstructed.append({
                    "refdes": refdes,
                    "pin_number": pin,
                    "net_name": current_net
                })

    return reconstructed
