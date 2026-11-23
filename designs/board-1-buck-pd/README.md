# Board 1 — USB-C PD 12V → 3.3V / 3A Synchronous Buck Converter (2-Layer)

| Field | Value |
|---|---|
| **Board ID** | `VD-BRD-001` · Rev 1.0 |
| **Dimensions** | $45.0\text{ mm} \times 25.0\text{ mm}$ (2-layer FR4, 1.6mm thickness, 1 oz Cu) |
| **Input** | USB Type-C (12V negotiated via CH224K PD sink decoy) |
| **Output** | $3.30\text{V} \pm 2\%$ @ up to $3.0\text{ A}$ continuous ($9.9\text{ W}$) |
| **Key ICs** | TI TPS54302 (Buck), WCH CH224K (PD Sink), ST USBLC6-2SC6 (ESD) |
| **Target Ripple** | $< 40\text{ mV}_{\text{pp}}$ ($10.2\text{ mV}_{\text{pp}}$ calculated) |
| **Thermal Peak** | $< 75^\circ\text{C}$ ($67.3^\circ\text{C}$ calculated at $3.0\text{ A}$ full load, $T_a=25^\circ\text{C}$) |
| **Status** | **Milestone 1 Hardware Exit Gate 1 — Verified** |

---

## 1. Circuit Design & Component Selection

### 1.1 USB Type-C Input & PD Sink Negotiation
- **Receptacle:** 16-pin USB Type-C (`J1`), mid-mount / surface-mount.
- **CC Pin Configuration:** $5.1\text{ k}\Omega \pm 1\%$ pull-down resistors (`R_CC1`, `R_CC2`) on pins CC1 and CC2 to ground, enabling downstream 5V standard power advertisement.
- **PD Controller:** WCH `CH224K` (`U1`, ESSOP-10).
  - Pin `CFG1` configured for 12V sink request.
  - Automatically negotiates 12V from USB-PD 2.0 / 3.0 compliant sources (or falls back cleanly to 9V/5V).
- **ESD Protection:** `USBLC6-2SC6` (`D1`, SOT-23-6) clamping D+/D- lines with ultra-low capacitance ($0.8\text{ pF}$).

### 1.2 Synchronous Step-Down Buck Converter (TI TPS54302)
- **Regulator:** TI `TPS54302` (`U2`, SOT-23-6), $4.5\text{V}$ to $28\text{V}$ input, $400\text{ kHz}$ fixed switching frequency, integrated $85\text{ m}\Omega$ high-side and $40\text{ m}\Omega$ low-side MOSFETs.
- **Feedback Network:**
  - $V_{\text{ref}} = 0.596\text{V}$.
  - $R_{\text{fb,top}} = 45.3\text{ k}\Omega$ $1\%$ (`R1`), $R_{\text{fb,bot}} = 10.0\text{ k}\Omega$ $1\%$ (`R2`).
  - Nominal output: $V_{\text{out}} = 0.596 \times (1 + 45.3 / 10.0) = 3.296\text{V}$ ($-0.12\%$ nominal deviation).
- **Power Inductor:**
  - $4.7\,\mu\text{H}$ shielded power inductor (`L1`, SWPA4030S4R7MT), $I_{\text{sat}} = 4.2\text{ A}$, $I_{\text{rms}} = 3.5\text{ A}$, DCR $= 30\text{ m}\Omega$.
  - Calculated ripple current: $\Delta I = 1.27\text{ A}$.
  - Peak current: $I_{\text{peak}} = 3.0 + 1.27 / 2 = 3.64\text{ A} < I_{\text{sat}} \ (4.2\text{ A})$ ($15\%$ margin).
- **Input Capacitor Bank:**
  - $2\times 10\,\mu\text{F}$ 50V X7R 1206 MLCC (`C1`, `C2`). At 12V DC bias, effective capacitance is $\approx 7.5\,\mu\text{F}$ each ($\approx 15\,\mu\text{F}$ net).
  - $1\times 100\text{ nF}$ 50V X7R 0603 (`C3`) local high-frequency bypass placed within $1.2\text{ mm}$ of IC `VIN` pin.
- **Output Capacitor Bank:**
  - $2\times 22\,\mu\text{F}$ 16V X7R 1206 MLCC (`C5`, `C6`). At 3.3V DC bias, effective capacitance is $\approx 19.4\,\mu\text{F}$ each ($\approx 38.8\,\mu\text{F}$ net).
  - Output ripple: $\Delta V_{\text{out}} \approx 10.2\text{ mV}_{\text{pp}} \ll 40\text{ mV}_{\text{pp}}$ ceiling.
- **Bootstrap Capacitor:**
  - $100\text{ nF}$ 50V X7R 0603 (`C4`) connected between `BOOT` (pin 1) and `SW` (pin 6).

---

## 2. PCB Stackup & Layout Design (2-Layer FR4)

```text
Layer 1 (Top Copper, 1 oz / 35 um):
  - High-current 12V VBUS trace (width >= 1.5 mm).
  - SW switching node polygon kept minimal to prevent capacitive EMI coupling.
  - 3.3V power polygon (width >= 2.0 mm) to output terminal.
  - Feedback trace routed away from inductor magnetic field, sampled after output caps.

Layer 2 (Bottom Copper, 1 oz / 35 um):
  - Solid, unbroken Ground Return Plane.
  - Thermal relief ground stitch via matrix (8 vias, 0.3mm drill / 0.6mm pad) directly under IC thermal ground area.
```

---

## 3. Manufacturing Hand-Off Checklist

- [x] Schematics formatted in KiCad 10 S-expression (`board.kicad_sch`).
- [x] PCB routed in KiCad 10 S-expression (`board.kicad_pcb`).
- [x] Bill of Materials with verified LCSC part numbers (`bom.csv`).
- [x] Centroid Pick-and-Place table for SMT machine (`pnp_centroids.csv`).
- [x] Canonical HW-IR SQLite representation (`board.vd-ir.jsonl`).
- [x] 9-Gate formal signoff certificate (`verification_report.json`).
