# Vajra-Dhīr EDA — Industrial Addendum: 12 Production, Manufacturing & Reliability Essentials (`VD-ADD-001`)

| Field | Value |
|---|---|
| **Document ID / Revision** | `VD-ADD-001` · **Rev 1.0 (Production Essentials)** |
| **Parent Standard** | `VD-SAD-001` Rev 2.0 (Industrial Baseline) |
| **Status** | **Approved & Integrated into Master Engineering Roadmap** |
| **Target Scope** | Production Manufacturing, Factory EOL Test, CAS Storage, Diagnostics, Governance, Reliability CI |
| **Verification Baseline Date** | 2026-11-23 |

---

## Domain A: 5 Real-World Hardware & Manufacturing Workflows

### 1. Forward/Back-Annotation ECO Engine & Geographical RefDes Re-Annotation (`vd eco`)
- **Validated Forward ECO Dialog (Schematic / `.ato` → Routed PCB):** Computes an explicit dry-run transaction before touching copper:
  - `ADD_COMPONENT`: Stages new parts neatly in an off-board staging tray to the right of the outline—never dumping them at `(0,0)` on top of existing traces.
  - `CHANGE_FOOTPRINT`: Preserves component centroid & rotation, flags only affected pad-entry trace stubs for partial re-route, and refuses to move `locked=1` parts without explicit confirmation.
  - `RENAME_NET` / `DELETE_NET`: Rewires copper UUID bindings cleanly without ripping up intact traces.
- **Geographical Back-Annotation (`vd eco reannotate-geo`):** Sorts physical PCB components top-to-bottom, left-to-right (Top side first, then Bottom side) into clean `R1..Rn`, `C1..Cn`, `U1..Un` numbering—then **back-annotates atomically** in a single `HardwarePatch` across PCB silkscreen, Schematic sheets, `.ato` declarations, `InteractiveHtmlBom`, and `board_pins.h` comments.

---

### 2. Real-World Vendor SPICE Survival Layer (LTspice/PSpice Transpiler + Encrypted Model Fallback)
- **`vd-spice-compat` Pre-Processor Pipeline (`packages/sim-compat/`):**
  1. **Encrypted Model Detector:** Scans incoming `.lib`/`.mod`/`.sub` headers for encryption markers (`$CDNENCSTART`, `** Encrypted`, binary LTspice `.sub`). Instead of crashing `ngspice` with cryptic syntax errors, it immediately routes the part to the **Datasheet-to-Behavioral Macro Synthesizer** and tags the simulation waveform with an explicit **`[BEHAVIORAL-APPROX]`** badge.
  2. **Dialect Transpiler:** Auto-enables `ngspice`'s compatibility mode (`set ngbehavior=ltpsa`) and applies deterministic AST rewrites for incompatible expressions (`^` → `**`, `LIMIT(x,a,b)`, `VSWITCH` hysteresis parameters, `PARAMS:` syntax, floating `GND` pin 0 aliases).

---

### 3. BGA/CSP Automated Escape Fanout, Equivalent Pin/Gate Swapping & Chip-to-Package-to-Board (C2P2B)
- **Automated BGA Dogbone & Microvia Escape Generator:** Quadrant fanout solver generating outer-row direct traces, mid-row dogbone via-in-pad / microvia escapes, and inner power/GND ball grouping aligned directly to the active stackup drill pairs.
- **Equivalent Pin & Gate Swapping:** Extends `Z3` pinmuxing beyond MCU GPIOs to swap functionally identical pins during routing (e.g., resistor-network pairs, multi-channel op-amp gates `U3A ↔ U3B`, unpolarized 2-pin passives, or DDR byte-lane bits `DQ0..DQ7`), automatically back-annotating Schematic & Firmware.
- **Chip-to-Package-to-Board (C2P2B) Co-Design Bridge:** Links **Pack 2C** silicon die pad-rings (`LibreLane`/`OpenROAD`) directly to a parametric **BGA/QFN Substrate Ball-Map** inside `HW-IR`, eliminating manual spreadsheet transcription between ASIC and PCB engineers and enabling coupled package+board PDN impedance sweeps.

---

### 4. End-of-Line (EOL) Factory Production Test Executive, Calibration & Device Provisioning
- **Verified Open-Source Engine:** Auto-generate test suites targeting **`google/openhtf`** (Apache-2.0, actively maintained with PyPI-attested `1.6.3` release in Oct 2026) — explicitly avoiding unmaintained sequencers like `Flojoy Studio` (abandoned since Nov 2024) and telemetry-gated GUIs.
- **Auto-Generated Factory Flow (`vd export eol-station`):** Derives an executable `openhtf` test plan directly from `HW-IR` rails, test points, and `firmware_pinmux`:
  1. Barcode / QR Unit Serial Number scan (bound to `InvenTree` build order).
  2. Short-circuit & current-limited power-on check via programmable PSU (`PyVISA`).
  3. Automated `probe-rs` factory firmware flash + unique MAC / Ed25519 cryptographic identity injection.
  4. Closed-loop ADC gain/offset & sensor trim calibration written to flash/EEPROM.
  5. Signed JSON pass/fail measurement record uploaded to `InvenTree` PLM / local SQLite yield log (Cp/Cpk statistical process control).

```python
# Auto-generated EOL Factory Test Executive template (google/openhtf · Apache-2.0)
import openhtf as htf
from openhtf.util import validators
from vd_hil_drivers import PsuPlug, ProbeRsPlug, UartSelfTestPlug

@htf.measures(
    htf.Measurement("v_3v3_rail_v").in_range(3.234, 3.366).with_units("V"),
    htf.Measurement("i_quiescent_ma").in_range(5.0, 45.0).with_units("mA"),
)
@htf.plug(psu=PsuPlug)
def phase_power_on_current_limit(test, psu):
    psu.set_output(voltage_v=12.0, current_limit_a=0.25, enable=True)
    test.measurements.v_3v3_rail_v = psu.measure_sense_channel("TP_3V3")
    test.measurements.i_quiescent_ma = psu.measure_current_ma()

@htf.measures(htf.Measurement("mcu_uid_hex"), htf.Measurement("selftest_pass").equals(True))
@htf.plug(probe=ProbeRsPlug, uart=UartSelfTestPlug)
def phase_flash_provision_and_selftest(test, probe, uart):
    uid = probe.flash_and_read_uid("artifacts/factory_selftest.elf")
    test.measurements.mcu_uid_hex = uid
    probe.write_calibration_blob(serial=test.test_record.dut_id, uid=uid)
    test.measurements.selftest_pass = uart.run_command("VD_SELFTEST_ALL", timeout_s=8.0)

def main():
    test = htf.Test(phase_power_on_current_limit, phase_flash_provision_and_selftest)
    test.execute(test_start=htf.util.triggers.prompt_for_test_start("Scan PCB QR Serial:"))
```

---

### 5. Global + Regional Fab/EMS Profiles (Including India EMS) & EMI/EMC Regulatory Pre-Compliance Workbench
- **Pluggable Multi-Region Fab & EMS Capability Packs (`registry/fabs/*.toml`):** Ship global presets (`JLCPCB`, `PCBWay`, `Eurocircuits`, `OSHPark`, `Sierra Circuits`) **plus** regional India EMS profiles (`Lion Circuits`, `PCB Power Market`, custom local EMS templates) with:
  - Exact fab capability tiers (min trace/space, drill surcharge cutoffs, controlled-impedance stackups, solder-mask/finish options).
  - Multi-currency live BOM & fab estimation (**INR / USD / EUR**) with configurable customs/GST/shipping & feeder-fee math inside `budget.json`.
- **EMI/EMC Regulatory Pre-Compliance Workbench (FCC Part 15 / CE RED / CISPR 32 / BIS CRS & WPC India):**
  - **Automatic Harmonic Collision Matrix:** Takes every clock, crystal, and SMPS switching frequency in `HW-IR`, computes harmonics $1f..15f$, and flags collisions with onboard RF receivers (BLE/Wi-Fi 2.4 GHz, GNSS L1 1575.42 MHz, cellular, FM/CISPR limits).
  - **Boundary & Cable Audit:** Deterministically verifies common-mode chokes on external differential cables (USB/Ethernet/CAN), ESD diode placement within $< 5\text{ mm}$ of connector pins before branching to ICs, and chassis-GND vs. signal-GND capacitive/ferrite tie discipline.

---

## Domain B: 4 Production Software & Reliability Foundations

### 6. Content-Addressed Binary Artifact Store (CAS), Git-LFS Policy & SQLite WAL Compaction
- **Content-Addressed Store (`~/.vajradhir/cas/sha256/<p0>/<p1>/<digest>.zst`):**
  - Every `artifact_uri` (`cas://sha256/<digest>`) resolves locally with transparent Zstd streaming compression and hardlinks/reflinks into `.vd/artifacts/`.
  - **Garbage Collection & Pinning:** `vd cas gc --max-gb=20` runs LRU eviction while **permanently pinning** every digest referenced in any project's `hw.lock` or `gate_audit_ledger`.
  - **Team Sync (Ring 3):** Optional push/pull mirror to self-hosted S3/MinIO or Git-LFS so cloning a repo stays $< 5\text{ MB}$.
- **SQLite WAL Compaction & Crash Autosave:**
  - `vd-daemon` triggers `PRAGMA wal_checkpoint(PASSIVE)` every 250 patches and `TRUNCATE` on project close/idle so `.vd.db-wal` never bloats to gigabytes during 8-hour manual routing sessions.
  - Uncommitted manual canvas drags buffer in an atomic `.vd.autosave.jsonl` crash-recovery shadow file replayed on startup after an OS reboot/power loss.

---

### 7. Self-Healing Diagnostics (`vd doctor`), GPU Driver Blocklist & True Air-Gapped Mirror (`vd airgap-bundle`)
- **`vd doctor` (2-Second Environment Preflight & Self-Repair):**
  - Probes Chromium WebGPU/Vulkan/D3D12/Metal adapters against a maintained **GPU Driver Stability Blocklist** (automatically locking known-buggy integrated Windows/Linux Mesa/Intel WebGPU drivers to rock-solid WebGL2 instead of white-screening Chromium).
  - Verifies KiCad `10.0.8` binary + NNG socket path permissions, Linux `udev` rules for `probe-rs`/`sigrok` USB probes (offering 1-command `udev` installation), WSL2 ext4 mount health, Docker/`runsc` status, and local Ollama reachability.
- **True Zero-Internet Installation (`vd airgap-bundle`):**
  - `vd airgap-bundle export --packs 2a,2b --models qwen3-coder:14b --out vajra-airgap-2026-11.tar.zst` bundles Tier 0 installers, `jlcparts.db`, DuckDB KG, signed Open-CUBOs, Ollama weights, and Ring 2 OCI image tarballs with a single Ed25519 manifest signature—allowing defense, aerospace, and foundry-NDA teams to deploy `NDA_AIRGAPPED` on completely disconnected networks.

---

### 8. Mixed-DPI Multi-Monitor Precision, Instant `Q`-Key Unit Toggle & i18n
- **Dynamic Mixed-DPI Canvas Coordinate Transform:** Subscribes to `window.matchMedia('(resolution: ...dppx)')` per Dockview window/popout so dragging a PCB canvas from a 150%-scaled 4K laptop screen onto a 100%-scaled 1440p monitor immediately resizes the WebGPU backing texture and recalibrates cursor hit-test coordinates with zero offset blur.
- **Zero-Loss `Q`-Key Display Unit Switching (`mm ↔ mil ↔ µm`):** Pure presentation-layer formatting over immutable `i64` nm `HW-IR` values—never mutating stored coordinates.
- **Day-1 i18n String Externalization:** All UI chrome labels, diagnostic explanations, and Mistake Tutor diagrams load from ICU JSON message catalogs (`locales/en.json`, `hi.json`, `zh.json`, `de.json`, `ja.json`).

---

### 9. Formal Plugin SDK ABI, Capability Sandbox (`hw-plugin.json`) & Zero-Telemetry Crash Sanitizer
```json
{
  "$schema": "https://vajradhir.org/schemas/hw-plugin.v1.json",
  "plugin_id": "com.example.india-ems-fabpack",
  "version": "1.0.0",
  "min_core_abi": "1.0.0",
  "license_spdx": "MIT",
  "runtime": "wasmtime_component_v1",
  "entry_wasm": "dist/plugin.wasm",
  "sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "signature_ed25519": "...",
  "requested_capabilities": [
    "ir:read_readonly",
    "bom:cost_quote",
    "ui:panel_register"
  ],
  "forbidden_by_default": ["fs:host_write", "net:unrestricted", "ir:override_human_lock", "usb:raw"]
}
```
- **ABI Stability Policy:** `HW-IR`, MCP 12 verbs, `WorkerContract`, and `hw-plugin` follow strict SemVer (`1.x` strictly additive; minimum 2-minor-release deprecation notice before any field removal).
- **Zero-Telemetry Privacy & Sanitized Crash Reports:** Telemetry is **100% OFF by default**. When a panic occurs, the local crash handler writes a sanitized report that automatically scrubs all net names, component values, MPNs, file paths, and user identifiers—requiring explicit user review before copying into a GitHub Issue.

---

## Domain C: 3 Open-Source Institution & Adoption Essentials

### 10. Open-Source Governance, DCO, Coordinated Security Disclosure (`SECURITY.md`) & Trademark Policy
- **DCO (`Signed-off-by`) Over CLA:** Enforce Developer Certificate of Origin on PRs (zero legal friction for corporate/academic contributors, unlike CLAs).
- **`GOVERNANCE.md` + `docs/rfcs/`:** Any breaking change to `HW-IR` DDL, the 12 MCP verbs, or `WorkerContract` requires a concise RFC PR with 7-day technical review.
- **`SECURITY.md`:** Enable GitHub Private Vulnerability Reporting, publish a dedicated security PGP key, define a 90-day Coordinated Vulnerability Disclosure (CVD) SLA, and establish a path to CVE numbering authority (CNA) via GitHub.
- **`TRADEMARK.md`:** Keep 100% of code open-source while protecting the **Vajra-Dhīr EDA** name and logo against deceptive modified forks or malicious trojanized binaries.

---

### 11. Built-In 3-Minute Interactive Onboarding & Curated Reference Hardware Gallery
- **Zero-Manual Interactive First-Run Walkthrough:** First launch opens a 4-step live sandbox project (`tutorial_usb_buck`) inside Tier 0:
  1. Drag a resistor and see the gold human-lock engage.
  2. Deliberately delete a 5.1 kΩ CC pulldown and watch `FG-01` + the Visual Mistake Tutor catch it.
  3. Trigger a 3.3 V short in `ngspice-wasm` Virtual Lab.
  4. Press `Cmd+K` to auto-repair and export a 1:1 print check—teaching the entire mental model in **3 minutes**.
- **Verified Reference Hardware Gallery:** Built-in searchable gallery of real, silicon-proven open-hardware boards (ESP32-S3, STM32G4 motor drive, USB-C PD PSU, RP2350 logic analyzer, Tiny Tapeout RISC-V tile) complete with real lab oscilloscope captures and 1-click **"Fork into Workspace"**.

---

### 12. Continuous Performance, Migration & Bundle-Size Regression CI
1. **`criterion` Latency Ratchet:** Fails PR if `vd-cad-geom` hit-test exceeds `1.0 ms` or `vd-ir` patch commit exceeds `5.0 ms`.
2. **Migration Upgrade Replay:** Runs every SQLite migration (`v1 → v2 → ... → vN`) against frozen real project fixture databases on every PR to guarantee zero user project corruption across upgrades.
3. **WebGL2 Frame-Time Check:** Headless Chromium SwiftShader test verifying 10k-pad viewport renders within budget.
4. **Tier 0 Installer Size Budget:** Hard CI warning at `> 140 MB` and fail at `> 175 MB`.

---

## Clean Integration Into Milestones (Zero Bloat to Milestone 1)

### Added to Milestone 1 (Months 1–3 · Core Reliability Essentials)
- [ ] **`T1.02b`** Local Content-Addressed Artifact Store (`cas://sha256/...`) + SQLite WAL auto-checkpoint + crash autosave shadow file.
- [ ] **`T1.12b`** Forward/Back-Annotation ECO Diff engine + Geographical RefDes re-annotation.
- [ ] **`T1.15b`** `vd-spice-compat` (encrypted vendor SPICE detector + LTspice/PSpice dialect transpiler).
- [ ] **`T1.17b`** Mixed-DPI multi-monitor canvas scaling + `Q`-key `mm ↔ mil` toggle + GPU driver WebGL2 fallback blocklist.
- [ ] **`T1.20b`** `vd doctor` diagnostic CLI + `SECURITY.md` / DCO / `GOVERNANCE.md` / 3-minute interactive first-run tutorial + CI migration/latency ratchets.

### Added to Milestone 2 (Months 4–6 · Factory & Global Scale)
- [ ] **`T2.01`** Multi-region Fab/EMS packs (JLCPCB, PCBWay, Eurocircuits, OSHPark, India EMS profiles + INR/USD/EUR BOM costing) + FCC/CE/BIS/WPC harmonic pre-compliance audit.
- [ ] **`T2.02`** Automated BGA escape fanout + equivalent pin/gate swapping + `hw-plugin.json` Wasmtime capability SDK + i18n message catalogs.
- [ ] **`T2.03`** `vd airgap-bundle export|import` zero-internet enterprise distribution package + sanitized zero-telemetry crash reporter.

### Added to Milestone 3 (Months 7–12 · High-Volume Manufacturing & C2P2B)
- [ ] **`T3.01`** `google/openhtf` auto-generated EOL factory production test station (barcode scan, `probe-rs` provisioning, calibration, `InvenTree` SPC yield logging).
- [ ] **`T3.02`** Chip-to-Package-to-Board (C2P2B) die pad-ring ↔ BGA substrate co-design bridge.
