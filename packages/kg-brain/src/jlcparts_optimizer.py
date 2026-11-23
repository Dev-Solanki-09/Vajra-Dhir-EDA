# packages/kg-brain/src/jlcparts_optimizer.py
"""
JLCPCB SMT Feeder-Fee & Basic Part Optimization Engine.
Minimizes manufacturing total cost by selecting Basic Parts ($0 fee)
over Extended Parts ($3.00 feeder load fee) when specifications permit.
"""

from typing import List, Dict, Any, Optional

FEEDER_FEE_EXTENDED_USD = 3.00

class ComponentSpec:
    def __init__(self, mpn: str, category: str, package: str, unit_price_usd: float, is_basic: bool):
        self.mpn = mpn
        self.category = category
        self.package = package
        self.unit_price_usd = unit_price_usd
        self.is_basic = is_basic

def calculate_bom_manufacturing_cost(
    selected_components: List[ComponentSpec],
    quantities: Dict[str, int]
) -> Dict[str, float]:
    """
    Calculates component unit cost, feeder setup fees, and total manufacturing BOM cost.
    """
    unit_cost_total = 0.0
    feeder_fees_total = 0.0
    extended_parts_seen = set()

    for comp in selected_components:
        qty = quantities.get(comp.mpn, 1)
        unit_cost_total += comp.unit_price_usd * qty
        if not comp.is_basic:
            if comp.mpn not in extended_parts_seen:
                extended_parts_seen.add(comp.mpn)
                feeder_fees_total += FEEDER_FEE_EXTENDED_USD

    total_cost = unit_cost_total + feeder_fees_total
    return {
        "unit_cost_total_usd": round(unit_cost_total, 4),
        "feeder_fees_total_usd": round(feeder_fees_total, 2),
        "extended_feeder_count": len(extended_parts_seen),
        "total_manufacturing_cost_usd": round(total_cost, 4)
    }

def choose_optimal_component(
    candidates: List[ComponentSpec],
    quantity: int
) -> ComponentSpec:
    """
    Picks the candidate that minimizes unit cost + amortized feeder fee.
    """
    if not candidates:
        raise ValueError("No candidate components provided")

    best_comp = candidates[0]
    best_cost = float("inf")

    for comp in candidates:
        feeder = 0.0 if comp.is_basic else FEEDER_FEE_EXTENDED_USD
        total = comp.unit_price_usd * quantity + feeder
        if total < best_cost:
            best_cost = total
            best_comp = comp

    return best_comp
