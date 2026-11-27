# Guide 01 — Your First Board in 30 Minutes

Welcome to Vajra-Dhir EDA. Follow this end-to-end guide to create, design, verify, simulate, and export your first circuit board.

## 1. Create a Blank Project (or Starter)
1. On the Home Screen, click **+ New Project**.
2. Choose a project folder (default: `~/VajraDhirProjects/<name>` or `./projects/` in Portable Mode).
3. Start with **Blank 2-Layer** or select **Smart Circuit Blocks** (e.g., USB-C PD 5V/3A Buck, STM32G4 Core) to drop verified subcircuits.

## 2. Capture Your Schematic (`Plan | Schematic`)
- Click a symbol pin and drag directly to another pin to draw orthogonal copper nets.
- Drag any symbol cleanly — attached wires rubber-band without disconnecting.
- Hold **Alt** while hovering to measure clearance redlines; double-click values (`10uF`, `4.7k`) to edit inline.
- Search components offline in the **Library** drawer (`Ctrl+\`` -> Library tab) and place parts onto the active sheet.

## 3. Lay Out & Route Your PCB (`PCB | 3D`)
- Press **G** to move footprints into clean physical placement; hold **Shift** or drag near neighbors to snap onto Alignment Guides.
- Press **L** on critical connectors (`J1`) or regulators (`U2`) to apply a **Human Lock**, preventing automated tools or assistants from relocating them.
- Press **X** to start 45° routing, **V** mid-route to drop a via and switch `F.Cu <-> B.Cu`, and **B** to refill copper zones.
- Press **3D** to inspect live component heights and STEP geometry clearance.

## 4. Verify & Simulate (`Test & Lab`)
- Open **Diagnostics** (`Ctrl+\``) or click **Verify (F5)** to run ERC, electrical physics checks (derating, pull-ups, I2C addresses, SMPS stability), and Spatial DRC together.
- Click any diagnostic row to zoom straight to the offending component, or use **SPICE Lab** (`Sim F6`) to inspect ripple, DC operating points, and schematic voltage/power X-Ray badges.

## 5. Generate Manufacturing Files (`Make`)
- Click **Export & Inspect Gerbers** to preview real copper, mask, silk, and drill layers.
- Switch to **Fab Release**, review the BOM/Pick-and-Place CSV, run **Build Manufacturing & Assembly Bundle**, complete **Human Gate-8 Signoff**, and use **Bring-Up Companion** checklists on the real hardware bench.
