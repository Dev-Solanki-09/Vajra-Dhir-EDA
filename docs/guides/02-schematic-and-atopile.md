# Guide 02 — Schematic Capture & Hardware Code (`atopile`)

Vajra-Dhir EDA keeps visual schematic sheets, code-first `.ato` modules, and physical PCB footprints synchronized automatically from one project database.

## Visual Direct-Manipulation Workflow
- **Direct Pin Wiring:** Hover any pin (`sch-pin-*`), press and drag to another pin to draw orthogonal segments.
- **Rubber-Band Moving:** Drag any symbol (`U1`, `R1`, `C2`) to reposition without breaking wire connectivity.
- **Alignment & Measurements:** Hold **Alt** + hover to measure redline distance from your selected part; marquee-drag to multi-select and align rows or columns.
- **Smart Circuit Blocks:** Drop pre-verified power rails, I2C sensor breakouts, USB-C CC ESD protection, or CAN transceivers directly from the Library Blocks tab.

## Code-First `.ato` Workflow
- Open the Code IDE tab (`Schematic & Code` / `Plan`) to author `elec/*.ato` modules cleanly.
- Saving or compiling `.ato` files immediately propagates updated components and net bindings to both the Schematic and PCB viewports.
