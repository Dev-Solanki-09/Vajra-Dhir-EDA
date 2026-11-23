# packages/cad-transcoder/tests/test_universal_importers.py
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "py")))

from importers import import_kicad_pcb, import_easyeda_json, reconstruct_gerber_x2_netlist
from synth_footprint import synthesize_qfn_footprint

def test_kicad_pcb_importer():
    sample_kicad = """
    (kicad_pcb (version 20240108) (generator pcbnew)
      (net 0 "")
      (net 1 "GND")
      (net 2 "VCC_3V3")
      (footprint "Package_SO:SOIC-8_3.9x4.9mm_P1.27mm" (at 100.5 50.25 90)
        (fp_text reference "U1" (at 0 -2.5) (layer "F.SilkS"))
      )
      (footprint "Capacitor_SMD:C_0603_1608Metric" (at 110.0 50.25)
        (fp_text reference "C1" (at 0 -1.5) (layer "F.SilkS"))
      )
    )
    """
    design = import_kicad_pcb(sample_kicad)
    assert len(design.nets) == 3
    assert len(design.components) == 2
    u1 = next(c for c in design.components if c["refdes"] == "U1")
    assert u1["x_nm"] == 100500000 # 100.5 mm in nm
    assert u1["y_nm"] == 50250000  # 50.25 mm in nm
    assert u1["rot_mdeg"] == 90000 # 90 deg in mdeg
    print("[PASS] KiCad PCB S-expression importer verified.")

def test_easyeda_importer():
    sample_easyeda = """{
        "components": [
            {"refdes": "R1", "package": "0805", "x_mm": 20.0, "y_mm": 15.0, "rotation_deg": 180.0},
            {"refdes": "D1", "package": "SOD-123", "x_mm": 25.0, "y_mm": 15.0, "rotation_deg": 0.0}
        ],
        "nets": ["VBUS", "GND", "SIGNAL_OUT"]
    }"""
    design = import_easyeda_json(sample_easyeda)
    assert len(design.components) == 2
    assert len(design.nets) == 3
    r1 = next(c for c in design.components if c["refdes"] == "R1")
    assert r1["x_nm"] == 20000000
    assert r1["rot_mdeg"] == 180000
    print("[PASS] EasyEDA JSON importer verified.")

def test_gerber_x2_netlist_reconstruction():
    sample_gerber = """
    G04 Gerber X2 Netlist Test*
    %TF.GenerationSoftware,KiCad,Pcbnew*
    %TO.N,GND*%
    %TO.P,C1,1*%
    X100000Y200000D03*
    %TO.P,U1,EP*%
    X105000Y200000D03*
    %TO.N,VCC_3V3*%
    %TO.P,C1,2*%
    X100000Y250000D03*
    M02*
    """
    reconstructed = reconstruct_gerber_x2_netlist(sample_gerber)
    assert len(reconstructed) == 3
    assert reconstructed[0] == {"refdes": "C1", "pin_number": "1", "net_name": "GND"}
    assert reconstructed[1] == {"refdes": "U1", "pin_number": "EP", "net_name": "GND"}
    assert reconstructed[2] == {"refdes": "C1", "pin_number": "2", "net_name": "VCC_3V3"}
    print("[PASS] Gerber X2 %TO.N / %TO.P netlist reconstructor verified.")

def test_qfn_footprint_synthesizer():
    mod_text = synthesize_qfn_footprint(pin_count=24, body_size_mm=4.0, pitch_mm=0.5, ep_size_mm=2.5)
    assert '(footprint "Package_DFN_QFN:QFN-24' in mod_text
    assert 'F.CrtYd' in mod_text
    assert 'F.SilkS' in mod_text
    assert '(pad "25" smd rect (at 0 0)' in mod_text # Thermal EP
    assert '(pad "1" smd roundrect' in mod_text
    print("[PASS] QFN-24 footprint auto-synthesizer verified.")

if __name__ == "__main__":
    test_kicad_pcb_importer()
    test_easyeda_importer()
    test_gerber_x2_netlist_reconstruction()
    test_qfn_footprint_synthesizer()
    print("ALL UNIVERSAL CAD IMPORTER TESTS PASSED.")
