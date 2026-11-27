# Guide 04 — Verification Suite & Live SPICE Lab

## Running Unified Board Verification (`Verify F5`)
Click **Verify (F5)** or open **Diagnostics** (`Ctrl+\``) to run:
1. **Electrical Rules (ERC & Footguns):** Checks MLCC X7R/X5R DC-bias derating, SMPS loop stability (`python-control` Phase/Gain Margin), Z3 SMT pinmux & 5V-into-3.3V tolerance hazards, I2C pull-up presence/address collisions, and IPC-2152 trace heating.
2. **Physical PCB Spatial DRC:** Checks courtyard overlaps, board-edge containment, HF decoupling proximity (`C2 -> U2`), and SMPS hot-loop span.
3. **Clickable Triage:** Click any row to focus the part (`Inspect`), trigger an electrical fix (`Auto-Fix`), or record an audited engineering exception (`Waive`).

## SPICE Virtual Lab & Schematic X-Ray
- Select between **1. DC OP**, **2. Transient**, **3. AC Sweep**, **4. Monte-Carlo**, and **5. Fault Injection** (Short Circuit, Overvoltage, Reverse Polarity, Brownout).
- Toggle **X-Ray Schematic** to render live node voltages (`V`) and component dissipation (`mW`) directly on your schematic sheet.
- Toggle **PI Heatmap** on the PCB canvas to spot high IR-drop (`mV`) and current density (`A/mm²`) bottlenecks.
