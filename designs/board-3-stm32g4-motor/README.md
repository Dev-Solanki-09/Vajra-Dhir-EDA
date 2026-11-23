# Board 3 — STM32G4 CAN-FD + Dual Motor Driver (4-Layer, Human Co-Edited)

| Field | Value |
|---|---|
| **Board ID** | `VD-BRD-003` · Rev 1.0 |
| **Dimensions** | $60.0\text{ mm} \times 40.0\text{ mm}$ (4-layer FR4, 1.6mm thickness, 2 oz outer Cu, 1 oz inner Cu) |
| **Stackup** | Top Signal & Power (2 oz) / Solid GND (1 oz) / 12V Motor & 3.3V Logic (1 oz) / Bottom Signal (2 oz) |
| **Core MCU** | STMicroelectronics STM32G431CBT6 (Arm Cortex-M4 @ 170 MHz, FPU, CORDIC, CAN-FD, TIM1) |
| **Motor Driver** | Texas Instruments DRV8833PWP (Dual H-Bridge, 2.0A continuous per bridge, current trip & decay) |
| **Bus Interface** | Texas Instruments TCAN334GDR (3.3V CAN-FD Transceiver up to 5 Mbps, split termination) |
| **Power Stage** | 12V DC input ($9.0\text{V}\dots 18.0\text{V}$), onboard TPS54302 3A synchronous buck for 3.3V logic |
| **Human Lock Status** | **Mixed-Control Architecture (`locked = 1` fail-closed power stage)** |
| **Status** | **Milestone 1 Hardware Exit Gate 3 — Verified** |

---

## 1. Mixed-Control Human Lock Architecture (`locked = 1`)

Board 3 serves as the reference hardware implementation for **Vajra-Dhīr EDA's fail-closed human protection model**:

```text
+-----------------------------------------------------------------------------------------+
|                                    VD-BRD-003 BOUNDARY                                  |
|                                                                                         |
|  +---------------------------------------+   +---------------------------------------+  |
|  | AUTONOMOUS / AGENT-MODIFIABLE DOMAIN  |   |    HUMAN-LOCKED POWER DOMAIN          |  |
|  |           (locked = 0)                |   |          (locked = 1)                 |  |
|  |                                       |   |                                       |  |
|  | - STM32G431CBT6 MCU (U1)               |   | - DRV8833 Dual H-Bridge (U3)          |  |
|  | - TCAN334 CAN-FD Transceiver (U2)     |   | - 12V Screw Terminal (J1)             |  |
|  | - 3.3V Buck Regulator (U4)            |   | - Motor Screw Terminal (J2)           |  |
|  | - Decoupling MLCCs & Pull-ups         |   | - Current Sense Shunts (R_S1, R_S2)   |  |
|  | - CAN-FD Split Termination Filter     |   | - 100uF Bulk Electrolytic (C_VM)      |  |
|  | - SWD Debug Header (J4)               |   | - 2.0mm High-Current Copper Traces    |  |
|  +---------------------------------------+   +---------------------------------------+  |
|                       |                                           |                     |
|         Agent can optimize & reroute            ABORTS with KERNEL_LOCK_VIOLATION       |
|                                                 if agent attempts modification          |
+-----------------------------------------------------------------------------------------+
```

### Fail-Closed Enforcement Rules:
1. Every write to `HW-IR` executes inside an SQLite transaction with `_tx_actor_ctx.actor_type` set.
2. If `actor_type IN ('agent', 'compiler', 'placer')` and an `UPDATE` or `DELETE` targets an entity with `locked = 1`, the database trigger `trg_protect_locked_components_upd` raises:
   ```sql
   SELECT RAISE(ABORT, 'KERNEL_LOCK_VIOLATION: Non-human actor cannot mutate locked entity');
   ```
3. Only `actor_type = 'human'` accompanied by an explicit signed hardware patch can clear or mutate locked entities.

---

## 2. Electrical Subsystems & Physics Calculations

### 2.1 12V Motor Power Stage & Thermal Derating
- **Motor Voltage:** $12.0\text{V nominal}$ ($18.0\text{V max}$).
- **Peak Current:** $2.0\text{ A}$ continuous per channel, $4.0\text{ A}$ total.
- **Trace Width Requirement (IPC-2152):**
  - For $2.0\text{ A}$ DC current on $2\text{ oz}$ outer copper ($70\,\mu\text{m}$) with maximum temperature rise $\Delta T \le 10^\circ\text{C}$:
  - Minimum trace width: $W \ge 1.4\text{ mm}$ ($1\,400\,000\text{ nm}$).
  - Routed trace width: $W = 2.0\text{ mm}$ ($2\,000\,000\text{ nm}$), providing $42\%$ safety margin.
- **Current Shunt Dissipation:**
  - $R_{\text{sense}} = 0.05\,\Omega$.
  - At $2.0\text{ A}$: $P_d = I^2 R = (2.0)^2 \times 0.05 = 0.20\text{ W}$.
  - Resistor rating: $1206$ package rated for $0.50\text{ W}$ ($60\%$ derating margin).

### 2.2 CAN-FD Bus Interface (TCAN334GDR)
- **Data Rate:** $1\text{ Mbps nominal arbitration}, 5\text{ Mbps data phase}$.
- **Split Termination:**
  - $R_1 = 60.4\,\Omega \pm 1\%$, $R_2 = 60.4\,\Omega \pm 1\%$ ($R_{\text{total}} = 120.8\,\Omega$).
  - Center-tap common-mode filtering: $C_1 = 4.7\text{ nF} \pm 10\%$ to GND.
  - Cutoff frequency: $f_c = \frac{1}{2 \pi (R_1/2) C_1} = \frac{1}{2 \pi \times 30.2 \times 4.7 \times 10^{-9}} \approx 1.12\text{ MHz}$, attenuating RF common-mode emissions without distorting CAN-FD edges.
- **Differential Impedance:**
  - Target: $120\,\Omega \pm 10\%$.
  - Routed geometry: Trace width $W = 0.25\text{ mm}$, Gap $S = 0.20\text{ mm}$ over Layer 2 solid GND plane $\to Z_{\text{diff}} = 118.6\,\Omega$.

---

## 3. Hardware-Firmware Co-Design Artifacts
- [`firmware/include/board_pins.h`](firmware/include/board_pins.h): STM32G4 HAL pin assignments for TIM1 PWM, CAN-FD, Fault input, and Current Sense ADC.
- [`firmware/src/main.c`](firmware/src/main.c): Deterministic self-test firmware executing CAN-FD echo and dual motor PWM ramp.
