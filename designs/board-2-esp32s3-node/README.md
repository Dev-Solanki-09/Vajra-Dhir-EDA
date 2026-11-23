# Board 2 — ESP32-S3 4-Layer Environmental Sensor Node

| Field | Value |
|---|---|
| **Board ID** | `VD-BRD-002` · Rev 1.0 |
| **Dimensions** | $50.0\text{ mm} \times 30.0\text{ mm}$ (4-layer FR4, 1.6mm thickness, 1 oz Cu) |
| **Stackup** | Top Signal (1 oz) / Solid GND (1 oz) / 3.3V Power (1 oz) / Bottom Signal (1 oz) |
| **Core MCU** | Espressif ESP32-S3-WROOM-1-N8R8 (Dual-core LX7, 240MHz, 8MB Flash, 8MB PSRAM) |
| **Sensors** | Bosch BME280 (Temperature, Relative Humidity, Barometric Pressure over I²C) |
| **Connectivity** | 2.4 GHz Wi-Fi 802.11 b/g/n + Bluetooth 5 (LE), Native USB-C Serial/JTAG |
| **Power Supply** | USB-C 5V in, AP2112K-3.3 ultra-low noise LDO (600mA, 55uA Iq) |
| **RF Routing** | $50.0\,\Omega$ Coplanar Waveguide with Ground (CPWG), stitching via fence |
| **Status** | **Milestone 1 Hardware Exit Gate 2 — Verified** |

---

## 1. Subsystem Architecture

### 1.1 Microcontroller Subsystem (ESP32-S3)
- **Module:** `ESP32-S3-WROOM-1-N8R8` (`U1`).
- **Power Decoupling:**
  - $1\times 22\,\mu\text{F}$ 1206 bulk MLCC (`C1`) at module input.
  - $3\times 100\text{ nF}$ 0603 high-frequency ceramic capacitors (`C2`, `C3`, `C4`) placed within $1.5\text{ mm}$ of 3V3 power pins.
- **Reset Network (`CHIP_PU`):**
  - $10\text{ k}\Omega$ pull-up resistor to 3.3V (`R1`).
  - $1.0\,\mu\text{F}$ capacitor to GND (`C5`), creating a $10\text{ ms}$ RC power-on delay (exceeding Espressif's $50\,\mu\text{s}$ threshold).
- **Boot Strapping (`GPIO0`):**
  - $10\text{ k}\Omega$ pull-up to 3.3V (`R2`).
  - Connected to auto-download reset transistors and manual `BOOT` tactile switch (`SW1`).

### 1.2 Environmental Sensor Subsystem (Bosch BME280)
- **Sensor:** `BME280` (`U2`, LGA-8, $2.5\text{ mm} \times 2.5\text{ mm}$).
- **Interface:** I²C bus connected to `GPIO4` (SDA) and `GPIO5` (SCL).
- **Address Selection:** `SDO` pin grounded $\to$ I²C device address `0x76`.
- **I²C Pull-Up Resistors:**
  - $3.3\text{ k}\Omega \pm 1\%$ (`R3`, `R4`) tied to 3.3V.
  - Calculated rise time: $t_r = 0.8473 \cdot R_p \cdot C_b = 0.8473 \cdot 3300 \cdot 20\text{ pF} \approx 55.9\text{ ns} \ll 300\text{ ns}$ limit for 400 kHz Fast Mode.
- **Local Bypass:** $100\text{ nF}$ ceramic capacitor (`C6`) directly adjacent to VDD/VDDIO.

### 1.3 Power Regulation (Diodes Inc AP2112K-3.3)
- **Regulator:** `AP2112K-3.3` (`U3`, SOT-23-5), ultra-low noise LDO.
- **Dropout Voltage:** $250\text{ mV}$ at $600\text{ mA}$.
- **Thermal Check:**
  - $P_d = (5.0\text{V} - 3.3\text{V}) \times 0.250\text{A} \approx 0.425\text{ W}$.
  - $T_j = 25^\circ\text{C} + (0.425 \times 90^\circ\text{C}/\text{W}) \approx 63.3^\circ\text{C} < 125^\circ\text{C}$ safe ceiling.
- **Reverse Polarity:** 1A Schottky diode (`D1`, B5819W SOD-123).

### 1.4 Native USB & ESD Protection
- **Connector:** 16-pin USB Type-C (`J1`) with $5.1\text{ k}\Omega$ pull-downs on CC1/CC2 (`R5`, `R6`).
- **USB Signals:** Direct differential routing to ESP32-S3 internal USB Serial/JTAG (`GPIO19` D-, `GPIO20` D+).
- **ESD Protection:** `USBLC6-2SC6` (`D2`, SOT-23-6) clamping D+/D- with $0.8\text{ pF}$ line capacitance.

---

## 2. 4-Layer PCB Layer Stackup & Impedance Control

```text
Layer 1 (Top Signal, 1 oz Cu, 35 um):
  - Component placement, high-speed USB differential pair (90 ohm diff impedance).
  - 50 ohm CPWG antenna trace: Width = 0.35 mm, Gap to ground = 0.20 mm.
Layer 2 (Ground Plane, 1 oz Cu, 35 um):
  - Solid, unbroken ground return plane under all signals and components.
Layer 3 (Power Plane, 1 oz Cu, 35 um):
  - Dedicated 3.3V copper pour; isolated 5V VBUS distribution strip.
Layer 4 (Bottom Signal, 1 oz Cu, 35 um):
  - Non-critical low-speed routing and ground pour stitching.
```

---

## 3. Hardware-Firmware Co-Design Outputs

The following firmware binding artifacts are deterministically generated directly from `HW-IR`:
- [`firmware/include/board_pins.h`](firmware/include/board_pins.h): C/C++ pin definitions with direction, alternate functions, and physical net UUIDs.
- [`firmware/dts/esp32s3_sensor_node.overlay`](firmware/dts/esp32s3_sensor_node.overlay): Zephyr RTOS devicetree overlay configuring the BME280 sensor node on I²C0.
- [`firmware/src/main.c`](firmware/src/main.c): Deterministic self-test firmware reading BME280 telemetry and blinking status LED.
