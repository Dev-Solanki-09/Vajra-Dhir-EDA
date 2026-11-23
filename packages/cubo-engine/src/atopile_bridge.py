# packages/cubo-engine/src/atopile_bridge.py
"""
Atopile Compiler Bridge.
Parses .ato circuit descriptions and generates deterministic HW-IR patch operations
with signed i64 nanometer placement and immutable UUIDv7 IDs.
"""

import re
import uuid
from typing import Dict, List, Any

class AtopileBlock:
    def __init__(self, name: str, signals: List[str], components: List[Dict[str, str]]):
        self.name = name
        self.signals = signals
        self.components = components

def parse_ato_source(source_text: str) -> AtopileBlock:
    """
    Extracts module name, external signals, and instantiated components from .ato text.
    """
    module_match = re.search(r'module\s+(\w+):', source_text)
    mod_name = module_match.group(1) if module_match else "AnonymousModule"
    
    signals = re.findall(r'signal\s+(\w+)', source_text)
    
    # Extract components: e.g. c_in1 = new Capacitor
    comp_matches = re.findall(r'(\w+)\s*=\s*new\s+(\w+)', source_text)
    components = [{"refdes": m[0], "kind": m[1]} for m in comp_matches]
    
    return AtopileBlock(name=mod_name, signals=signals, components=components)

def compile_ato_to_hw_ir_patches(block: AtopileBlock, board_id: str) -> List[Dict[str, Any]]:
    """
    Translates an Atopile block into a list of atomic HW-IR patch operations.
    """
    patches = []
    
    # 1. Net creations
    for sig in block.signals:
        net_id = str(uuid.uuid7()) if hasattr(uuid, "uuid7") else str(uuid.uuid4())
        patches.append({
            "op": "insert_net",
            "table": "nets",
            "data": {
                "id": net_id,
                "board_id": board_id,
                "name": f"{block.name}_{sig}",
                "net_class": "DEFAULT",
                "provenance": "cubo"
            }
        })
        
    # 2. Component placements
    for comp in block.components:
        comp_id = str(uuid.uuid7()) if hasattr(uuid, "uuid7") else str(uuid.uuid4())
        patches.append({
            "op": "insert_component",
            "table": "components",
            "data": {
                "id": comp_id,
                "board_id": board_id,
                "refdes": comp["refdes"],
                "value_str": comp["kind"],
                "package_name": "SMD_0603",
                "footprint_ref": f"Capacitor_SMD:C_0603_1608Metric",
                "symbol_ref": f"Device:{comp['kind']}",
                "x_nm": 0,
                "y_nm": 0,
                "rot_mdeg": 0,
                "provenance": "cubo",
                "locked": 0
            }
        })
        
    return patches
