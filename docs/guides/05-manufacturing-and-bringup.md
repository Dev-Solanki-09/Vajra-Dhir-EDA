# Guide 05 — Manufacturing Export, Signoff & Bench Bring-Up

## Preflight & Gerber Inspection
1. Open the **Make** workspace and click **Export & Inspect Gerbers**.
2. Inspect Top Composite, Bottom Composite, Silkscreen, Soldermask, Solderpaste, and Excellon Drill layers interactively. Click any pad/trace coordinate to cross-probe back to the 2D PCB.
3. Watch the freshness indicator: editing your PCB after Gerber export immediately marks Gerbers **Stale** so outdated files never ship to a fab.

## Generating the Release Bundle
- Click **Build Manufacturing & Assembly Bundle** to produce:
  - RS-274X/X2 Gerbers + Excellon Drill
  - IPC-2581 XML + schema validation
  - EMS BOM & Pick-and-Place CPL CSVs (with LCSC/Indian fab part readiness)
  - PcbDraw assembly pinout SVGs and InteractiveHtmlBom
- Every new board remains marked **`NOT_FABRICATED_0_OF_3`** until physical bench signoff is completed by the lead engineer (`Human Gate-8 Signoff`).

## First-Article Bench Bring-Up
Open the **Bring-Up Companion** tab inside **Fab Release** to walk through expected test-point voltage windows (`TP_VIN`, `TP_3V3`, `TP_SW`, `TP_GND`) and monitor live UART bring-up telemetry over WebSerial (`115200 8N1`).
