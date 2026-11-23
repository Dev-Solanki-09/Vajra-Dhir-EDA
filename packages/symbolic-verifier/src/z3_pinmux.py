# packages/symbolic-verifier/src/z3_pinmux.py
"""
Z3 SMT Neuro-Symbolic Pinmux & Bus Constraint Solver.
Uses Microsoft Z3 SMT solver with trackable assertions for exact unsat_core extraction.
Solves peripheral pad mapping, I2C address uniqueness, and electrical domain compatibility.
"""

from typing import Dict, List, Optional, Tuple, Set
import z3

class PadCandidate:
    def __init__(self, name: str, functions: List[str], is_5v_tolerant: bool = False):
        self.name = name
        self.functions = functions
        self.is_5v_tolerant = is_5v_tolerant

def solve_pinmux_smt(
    signals: List[str],
    candidates: Dict[str, List[str]],
    five_volt_required: Optional[List[str]] = None,
    five_volt_pads: Optional[Set[str]] = None
) -> Tuple[Optional[Dict[str, str]], List[str]]:
    """
    Solves pinmux allocation using Z3 SMT.
    Returns (mapping, []) if SAT.
    Returns (None, unsat_core) if UNSAT.
    """
    solver = z3.Solver()
    pin_vars: Dict[str, z3.ArithRef] = {}
    
    all_pads = set()
    for sig, pads in candidates.items():
        all_pads.update(pads)
        
    pad_to_id = {pad: idx for idx, pad in enumerate(sorted(all_pads))}
    id_to_pad = {idx: pad for pad, idx in pad_to_id.items()}
    
    five_volt_pads = five_volt_pads or set()
    five_volt_required = five_volt_required or []
    
    # Domain constraints
    for sig in signals:
        pin_vars[sig] = z3.Int(sig)
        allowed_pads = candidates.get(sig, [])
        if not allowed_pads:
            return None, [f"no_candidates_for_{sig}"]
            
        domain_clauses = [pin_vars[sig] == pad_to_id[p] for p in allowed_pads]
        solver.assert_and_track(z3.Or(domain_clauses), f"domain_{sig}")
        
        # 5V tolerance constraint
        if sig in five_volt_required:
            tolerant_clause = z3.Or([
                pin_vars[sig] == pad_to_id[p] for p in allowed_pads if p in five_volt_pads
            ])
            solver.assert_and_track(tolerant_clause, f"5v_tol_{sig}")
            
    # Uniqueness constraint: no two signals may share the same physical pad
    sig_list = list(signals)
    for i in range(len(sig_list)):
        for j in range(i + 1, len(sig_list)):
            s1, s2 = sig_list[i], sig_list[j]
            solver.assert_and_track(pin_vars[s1] != pin_vars[s2], f"conflict_{s1}_vs_{s2}")
            
    if solver.check() == z3.sat:
        model = solver.model()
        solution = {sig: id_to_pad[model[pin_vars[sig]].as_long()] for sig in signals}
        return solution, []
    else:
        unsat_core = [str(clause) for clause in solver.unsat_core()]
        return None, unsat_core

def verify_i2c_bus_addresses(bus_devices: Dict[str, int]) -> Tuple[bool, Optional[str]]:
    """
    Verifies that all devices on an I2C bus have unique 7-bit addresses (0x08..0x77).
    """
    seen_addresses: Dict[int, str] = {}
    for refdes, addr in bus_devices.items():
        if addr < 0x08 or addr > 0x77:
            return False, f"Device {refdes} address 0x{addr:02X} outside standard 7-bit range (0x08..0x77)"
        if addr in seen_addresses:
            return False, f"I2C Address Collision: {refdes} and {seen_addresses[addr]} both use 0x{addr:02X}"
        seen_addresses[addr] = refdes
    return True, None
