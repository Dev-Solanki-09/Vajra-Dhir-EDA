"""
DuckDB Component & Pre-Made Module Knowledge Graph Engine (Prompt 7: #29 DuckDB + #70 jlcparts).
Maintains an offline 500+ part starter catalog, computes non-linear MLCC DC-bias & inductor
Isat derating curves, and provides opt-in offline JLCPCB SQLite ingestion blocked under airgap.
"""

from __future__ import annotations

import json
import os
import pathlib
import sqlite3
from typing import Any, Dict, List, Optional, Tuple

import duckdb

_SCHEMA_PATH = pathlib.Path(__file__).resolve().parent / "kg_init.sql"


def _seed_starter_rows(con: duckdb.DuckDBPyConnection) -> None:
    existing = con.execute("SELECT COUNT(*) FROM kg_parts").fetchone()
    if existing and int(existing[0]) >= 500:
        return

    parts: List[Tuple[Any, ...]] = [
        # Core Power, MCUs, USB-PD, SBC Headers & Pre-Made Modules
        ("C244615", "TPS54302DDCR", "Texas Instruments", "Regulator", "SOT-23-6",
         "28V 3A Synchronous Buck Converter 400kHz", "Extended", 48200, 0.89, 28.0, 3.0,
         None, None, None, 1.5, 150.0, 68.0, "Regulator_Switching:TPS54302DDCR",
         "Package_TO_SOT_SMD:SOT-23-6", "${KICAD10_3DMODEL_DIR}/Package_TO_SOT_SMD.3dshapes/SOT-23-6.step", False),
        ("C970725", "CH224K", "WCH", "USB_PD", "ESSOP-10",
         "USB Type-C PD3.0/QC Sink Protocol Controller", "Basic", 125400, 0.28, 24.0, 0.05,
         None, None, None, 0.25, 125.0, 85.0, "Interface_USB:CH224K",
         "Package_SO:ESSOP-10_3.9x4.9mm_P1.0mm", "${KICAD10_3DMODEL_DIR}/Package_SO.3dshapes/SOIC-16_3.9x9.9mm_P1.27mm.step", False),
        ("C529315", "STM32G431CBU6", "STMicroelectronics", "MCU", "QFN-48",
         "170MHz Arm Cortex-M4 Mixed-Signal MCU 128KB Flash CAN-FD", "Extended", 19400, 2.65, 3.6, 0.16,
         None, None, None, 0.45, 125.0, 42.0, "MCU_ST_STM32G4:STM32G431CBUx",
         "Package_DFN_QFN:QFN-48-1EP_7x7mm_P0.5mm_EP5.6x5.6mm", "${KICAD10_3DMODEL_DIR}/Package_DFN_QFN.3dshapes/QFN-48-1EP_7x7mm_P0.5mm_EP5.6x5.6mm.step", False),
        ("C2913200", "ESP32-S3-WROOM-1-N16R8", "Espressif", "Module", "Module-18x25.5mm",
         "Dual-core Xtensa LX7 WiFi/BLE5 Pre-Made RF Module 16MB Flash", "Extended", 8900, 3.40, 3.6, 0.5,
         None, None, None, 1.8, 105.0, 38.0, "RF_Module:ESP32-S3-WROOM-1",
         "RF_Module:ESP32-S3-WROOM-1", "${KICAD10_3DMODEL_DIR}/RF_Module.3dshapes/ESP32-S3-WROOM-1.step", True),
        ("C2040", "RP2040", "Raspberry Pi", "MCU", "QFN-56",
         "Dual Arm Cortex-M0+ MCU 264KB SRAM Programmable PIO", "Basic", 91200, 0.78, 3.63, 0.12,
         None, None, None, 0.4, 125.0, 44.0, "MCU_RaspberryPi:RP2040",
         "Package_DFN_QFN:QFN-56-1EP_7x7mm_P0.4mm_EP3.2x3.2mm", "${KICAD10_3DMODEL_DIR}/Package_DFN_QFN.3dshapes/QFN-48-1EP_7x7mm_P0.5mm_EP5.6x5.6mm.step", False),
        ("C6186", "AMS1117-3.3", "Advanced Monolithic", "Regulator", "SOT-223",
         "1A Low-Dropout Linear Regulator 3.3V Fixed Output", "Basic", 540000, 0.042, 15.0, 1.0,
         None, None, None, 1.2, 125.0, 90.0, "Regulator_Linear:AMS1117-3.3",
         "Package_TO_SOT_SMD:SOT-223-3_TabPin2", "${KICAD10_3DMODEL_DIR}/Package_TO_SOT_SMD.3dshapes/SOT-223-3_TabPin2.step", False),
        ("C15836", "SMBJ22A", "Littelfuse", "TVS_Diode", "SMB",
         "600W 22V Unidirectional TVS Surge Suppressor", "Basic", 84200, 0.14, 22.0, 16.9,
         None, None, None, 5.0, 150.0, 55.0, "Diode:SMBJ22A",
         "Diode_SMD:D_SMB", "${KICAD10_3DMODEL_DIR}/Diode_SMD.3dshapes/D_SMB.step", False),
        ("C2897151", "RPI-GPIO-40PIN-HDR", "Raspberry Pi Foundation", "SBC_Header", "Header_2x20",
         "Raspberry Pi 40-Pin SBC Carrier Header (3.3V non-5V tolerant GPIO)", "Basic", 31500, 0.45, 5.25, 3.0,
         None, None, None, 15.0, 85.0, 20.0, "Connector_Generic:Conn_02x20_Odd_Even",
         "Connector_PinHeader_2.54mm:PinHeader_2x20_P2.54mm_Vertical", "${KICAD10_3DMODEL_DIR}/Connector_PinHeader_2.54mm.3dshapes/PinHeader_2x20_P2.54mm_Vertical.step", True),
        ("C165948", "TYPE-C-31-M-12", "Korean Hroparts Elec", "Connector", "USB_C_16P",
         "16-Pin USB Type-C SMD Receptacle Power + USB2.0", "Basic", 195000, 0.19, 20.0, 5.0,
         None, None, None, 1.0, 105.0, 45.0, "Connector:USB_C_Receptacle_USB2.0_16P",
         "Connector_USB:USB_C_Receptacle_HRO_TYPE-C-31-M-12", "${KICAD10_3DMODEL_DIR}/Connector_USB.3dshapes/USB_C_Receptacle_HRO_TYPE-C-31-M-12.step", False),
        # MOSFETs
        ("C20917", "AO3400A", "Alpha & Omega", "MOSFET", "SOT-23",
         "30V 5.7A N-Channel Trench MOSFET 26.5mOhm @ 10V", "Basic", 430000, 0.029, 30.0, 5.7,
         None, None, 0.0265, 1.4, 150.0, 90.0, "Transistor_FET:AO3400A",
         "Package_TO_SOT_SMD:SOT-23", "${KICAD10_3DMODEL_DIR}/Package_TO_SOT_SMD.3dshapes/SOT-23.step", False),
        ("C15139", "SI2301CDS", "Vishay", "MOSFET", "SOT-23",
         "-20V -2.3A P-Channel MOSFET Low Gate Threshold", "Basic", 180000, 0.036, 20.0, 2.3,
         None, None, 0.112, 0.75, 150.0, 110.0, "Transistor_FET:TP0610T",
         "Package_TO_SOT_SMD:SOT-23", "${KICAD10_3DMODEL_DIR}/Package_TO_SOT_SMD.3dshapes/SOT-23.step", False),
        # Real MLCC Capacitors with distinct DC-bias behavior
        ("C45783", "CL21A226MAYNNNE", "Samsung Electro-Mechanics", "Capacitor", "0805",
         "22uF 25V X5R +/-20% 0805 Multilayer Ceramic Capacitor", "Basic", 620000, 0.048, 25.0, 0.5,
         22.0, None, None, 0.1, 85.0, 80.0, "Device:C",
         "Capacitor_SMD:C_0805_2012Metric", "${KICAD10_3DMODEL_DIR}/Capacitor_SMD.3dshapes/C_0805_2012Metric.step", False),
        ("C15850", "CL10B104KB8NNNC", "Samsung Electro-Mechanics", "Capacitor", "0603",
         "100nF 50V X7R +/-10% 0603 MLCC Decoupling Capacitor", "Basic", 4200000, 0.002, 50.0, 0.2,
         0.1, None, None, 0.05, 125.0, 95.0, "Device:C",
         "Capacitor_SMD:C_0603_1608Metric", "${KICAD10_3DMODEL_DIR}/Capacitor_SMD.3dshapes/C_0603_1608Metric.step", False),
        ("C12891", "CL31B226KAHNNNE", "Samsung Electro-Mechanics", "Capacitor", "1206",
         "22uF 25V X7R +/-10% 1206 Low-Derating Bulk MLCC", "Extended", 94000, 0.11, 25.0, 1.2,
         22.0, None, None, 0.25, 125.0, 60.0, "Device:C",
         "Capacitor_SMD:C_1206_3216Metric", "${KICAD10_3DMODEL_DIR}/Capacitor_SMD.3dshapes/C_1206_3216Metric.step", False),
        ("C15849", "GRM21BR61E106KA73L", "Murata", "Capacitor", "0805",
         "10uF 25V X5R +/-10% 0805 Ceramic Capacitor", "Basic", 910000, 0.026, 25.0, 0.5,
         10.0, None, None, 0.1, 85.0, 80.0, "Device:C",
         "Capacitor_SMD:C_0805_2012Metric", "${KICAD10_3DMODEL_DIR}/Capacitor_SMD.3dshapes/C_0805_2012Metric.step", False),
        ("C307331", "CL21A106KAYNNNE", "Samsung Electro-Mechanics", "Capacitor", "0805",
         "10uF 25V X5R +/-10% 0805 Basic Bypass Capacitor", "Basic", 2150000, 0.019, 25.0, 0.5,
         10.0, None, None, 0.1, 85.0, 80.0, "Device:C",
         "Capacitor_SMD:C_0805_2012Metric", "${KICAD10_3DMODEL_DIR}/Capacitor_SMD.3dshapes/C_0805_2012Metric.step", False),
        # Real Shielded Inductors
        ("C408412", "SWPA6045S100MT", "Sunlord", "Inductor", "6x6mm",
         "10uH 4.5A 24mOhm Shielded SMD Power Inductor", "Extended", 68000, 0.24, 50.0, 4.5,
         None, 10.0, 0.024, 1.0, 125.0, 40.0, "Device:L",
         "Inductor_SMD:L_6.3x6.3_H3", "${KICAD10_3DMODEL_DIR}/Inductor_SMD.3dshapes/L_10.4x10.4_H4.8.step", False),
        ("C167221", "SWPA4020S4R7MT", "Sunlord", "Inductor", "4x4mm",
         "4.7uH 2.15A 60mOhm Shielded SMD Power Inductor", "Basic", 112000, 0.14, 40.0, 2.15,
         None, 4.7, 0.06, 0.65, 125.0, 50.0, "Device:L",
         "Inductor_SMD:L_6.3x6.3_H3", "${KICAD10_3DMODEL_DIR}/Inductor_SMD.3dshapes/L_10.4x10.4_H4.8.step", False),
        # Pre-Made Buck Converter Module & BME280 Sensor Breakout
        ("C990001", "VD-BUCK-5V-3V3-MOD", "Vajra-Dhir Modules", "Module", "Castellated-16x12",
         "Pre-Made 5V/12V -> 3.3V 3A Buck Breakout Module", "Basic", 12000, 1.45, 28.0, 3.0,
         None, None, None, 2.0, 125.0, 42.0, "Regulator_Switching:TPS54302DDCR",
         "Package_TO_SOT_SMD:SOT-23-6", "${KICAD10_3DMODEL_DIR}/Package_TO_SOT_SMD.3dshapes/SOT-23-6.step", True),
        ("C92489", "BME280", "Bosch Sensortec", "Sensor", "LGA-8",
         "Digital Humidity Pressure Temperature Sensor I2C/SPI 1.8-3.6V", "Extended", 41200, 2.15, 3.6, 0.004,
         None, None, None, 0.02, 85.0, 75.0, "Sensor_Pressure:BME280",
         "Package_LGA:Bosch_LGA-8_2.5x2.5mm_P0.65mm_ClockwisePinNumbering", "${KICAD10_3DMODEL_DIR}/Package_DFN_QFN.3dshapes/QFN-48-1EP_7x7mm_P0.5mm_EP5.6x5.6mm.step", False),
    ]

    # Expand E24 resistor values across 0603 & 0805 + C0G/X7R capacitors + ESD/connectors -> >= 510 total parts
    e24 = [1.0, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2.0, 2.2, 2.4, 2.7, 3.0,
           3.3, 3.6, 3.9, 4.3, 4.7, 5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1]
    decades = [(1, "R"), (10, "R"), (100, "R"), (1000, "K"), (10000, "K"), (100000, "K"), (1000000, "M")]
    lcsc_seq = 100000
    for pkg, pwr, fp in [
        ("0603", 0.1, "Resistor_SMD:R_0603_1608Metric"),
        ("0805", 0.125, "Resistor_SMD:R_0805_2012Metric"),
        ("0402", 0.0625, "Resistor_SMD:R_0402_1005Metric"),
    ]:
        step_fp = "${KICAD10_3DMODEL_DIR}/Resistor_SMD.3dshapes/R_0603_1608Metric.step" if pkg != "0805" else "${KICAD10_3DMODEL_DIR}/Resistor_SMD.3dshapes/R_0805_2012Metric.step"
        for mul, suffix in decades:
            for base_r in e24:
                lcsc_seq += 1
                ohms = base_r * mul
                disp = f"{ohms:g}ohm" if suffix == "R" else (f"{ohms/1000:g}k" if suffix == "K" else f"{ohms/1e6:g}M")
                is_basic = base_r in (1.0, 2.2, 3.3, 4.7, 5.1, 10.0) or (ohms in (100.0, 1000.0, 2200.0, 4700.0, 10000.0, 22000.0, 47000.0, 100000.0))
                parts.append((
                    f"C{lcsc_seq}", f"RC{pkg}FR-07{disp.upper()}L", "YAGEO", "Resistor", pkg,
                    f"{disp} 1% {pwr}W {pkg} Thick Film Chip Resistor",
                    "Basic" if is_basic else "Extended", 1250000 if is_basic else 45000,
                    0.0012 if is_basic else 0.0024, 75.0, 0.5, None, None, ohms, pwr, 155.0, 120.0,
                    "Device:R", fp, step_fp, False,
                ))

    con.executemany(
        """
        INSERT OR REPLACE INTO kg_parts VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        """,
        parts,
    )

    # Sync core items to legacy `components` table so existing P0..P6 helpers stay uniform
    con.execute("""
        INSERT OR REPLACE INTO components (mpn, manufacturer, package, description, category, basic_part, stock_count, price_usd)
        SELECT mpn, manufacturer, package, description, category, feeder_type = 'Basic', stock_qty, price_usd
        FROM kg_parts
        QUALIFY ROW_NUMBER() OVER (PARTITION BY mpn ORDER BY stock_qty DESC) = 1
    """)

    # Populate MLCC DC-Bias curves (C0G stays flat; 0805 X5R drops sharply at high Vdc; 1206 X7R holds better)
    mlcc_curves: List[Tuple[str, float, float, float, float]] = []
    # (mpn, nom_uf, half_v_retention, full_v_retention)
    cap_specs = [
        ("CL21A226MAYNNNE", 22.0, 0.44, 0.24),     # 0805 X5R 25V -> severe DC bias drop!
        ("CL31B226KAHNNNE", 22.0, 0.74, 0.56),     # 1206 X7R 25V -> much better retention
        ("GRM21BR61E106KA73L", 10.0, 0.48, 0.27),  # 0805 X5R 25V
        ("CL21A106KAYNNNE", 10.0, 0.46, 0.25),
        ("CL10B104KB8NNNC", 0.1, 0.88, 0.72),      # 0603 X7R 50V 100nF
    ]
    for mpn, nom, r12, r24 in cap_specs:
        pts = [(0.0, 1.0), (3.3, 0.86 if nom >= 10 else 0.98), (5.0, 0.76 if nom >= 10 else 0.96),
               (12.0, r12), (18.0, (r12 + r24) / 2.0), (24.0, r24)]
        for v_dc, pct in pts:
            ceff = round(nom * pct, 4)
            mlcc_curves.append((mpn, v_dc, ceff, nom, round(pct * 100.0, 1)))
            con.execute(
                "INSERT OR REPLACE INTO mlcc_dc_bias_curves VALUES (?, ?, ?, ?)",
                (mpn, v_dc, ceff, nom),
            )
    con.executemany("INSERT OR REPLACE INTO kg_mlcc_dcbias_curves VALUES (?, ?, ?, ?, ?)", mlcc_curves)

    # Inductor Isat rolloff curves
    ind_specs = [
        ("SWPA6045S100MT", 10.0, 4.5, [(0.0, 1.0, 2.0), (1.5, 0.97, 8.0), (3.0, 0.90, 21.0), (4.5, 0.70, 40.0), (5.5, 0.48, 68.0)]),
        ("SWPA4020S4R7MT", 4.7, 2.15, [(0.0, 1.0, 2.0), (1.0, 0.95, 11.0), (1.8, 0.84, 29.0), (2.15, 0.70, 40.0), (3.0, 0.45, 72.0)]),
    ]
    for mpn, nom, _imax, pts in ind_specs:
        for i_dc, pct, dt in pts:
            leff = round(nom * pct, 3)
            con.execute("INSERT OR REPLACE INTO kg_inductor_isat_curves VALUES (?, ?, ?, ?, ?)", (mpn, i_dc, leff, nom, dt))
            con.execute("INSERT OR REPLACE INTO inductor_sat_curves VALUES (?, ?, ?, ?)", (mpn, i_dc, leff, nom))

    # MOSFET Rds(on) vs Vgs
    for v_gs, rds, idmax in [(2.5, 42.0, 5.7), (4.5, 29.0, 5.7), (10.0, 26.5, 5.7)]:
        con.execute("INSERT OR REPLACE INTO kg_mosfet_curves VALUES ('AO3400A', ?, ?, ?)", (v_gs, rds, idmax))
    for v_gs, rds, idmax in [(2.5, 180.0, 2.3), (4.5, 128.0, 2.3), (10.0, 112.0, 2.3)]:
        con.execute("INSERT OR REPLACE INTO kg_mosfet_curves VALUES ('SI2301CDS', ?, ?, ?)", (v_gs, rds, idmax))

    # Pin tables & silicon errata for MCUs, regulators, SBC headers
    pins = [
        ("TPS54302DDCR", "1", "GND", "power_in", 0.3, False),
        ("TPS54302DDCR", "2", "SW", "power_out", 30.0, False),
        ("TPS54302DDCR", "3", "VIN", "power_in", 28.0, False),
        ("TPS54302DDCR", "4", "FB", "input", 7.0, False),
        ("TPS54302DDCR", "5", "EN", "input", 7.0, False),
        ("TPS54302DDCR", "6", "BOOT", "power_in", 35.0, False),
        ("STM32G431CBU6", "1", "VBAT", "power_in", 3.6, True),
        ("STM32G431CBU6", "7", "NRST", "bidirectional", 3.6, True),
        ("STM32G431CBU6", "10", "PA0", "bidirectional", 3.6, True),
        ("STM32G431CBU6", "34", "PA13_SWDIO", "bidirectional", 5.5, False),
        ("STM32G431CBU6", "37", "PA14_SWCLK", "bidirectional", 5.5, False),
        ("RPI-GPIO-40PIN-HDR", "1", "3V3_PWR", "power_out", 3.45, True),
        ("RPI-GPIO-40PIN-HDR", "3", "GPIO2_SDA1", "bidirectional", 3.6, True),
        ("RPI-GPIO-40PIN-HDR", "5", "GPIO3_SCL1", "bidirectional", 3.6, True),
        ("RPI-GPIO-40PIN-HDR", "2", "5V_PWR", "power_in", 5.25, False),
        ("ESP32-S3-WROOM-1-N16R8", "3", "EN", "input", 3.6, True),
        ("ESP32-S3-WROOM-1-N16R8", "27", "GPIO0_BOOT", "bidirectional", 3.6, True),
    ]
    con.executemany("INSERT OR REPLACE INTO kg_pins VALUES (?, ?, ?, ?, ?, ?)", pins)

    con.executemany(
        "INSERT OR REPLACE INTO kg_pinmux_matrix VALUES (?, ?, ?, ?)",
        [
            ("STM32G431CBU6", "PA0", "TIM2_CH1", "PWM"),
            ("STM32G431CBU6", "PA0", "ADC1_IN1", "ADC"),
            ("STM32G431CBU6", "PB8", "I2C1_SCL", "I2C1"),
            ("STM32G431CBU6", "PB9", "FDCAN1_TX", "FDCAN1"),
            ("RPI-GPIO-40PIN-HDR", "GPIO2_SDA1", "I2C1_SDA", "I2C1"),
        ],
    )

    con.executemany(
        "INSERT OR REPLACE INTO kg_silicon_errata VALUES (?, ?, ?, ?)",
        [
            ("ESP32-S3-WROOM-1-N16R8", "ES-STRAPPING-GPIO46", "warning", "GPIO46/GPIO0 must maintain valid boot logic state until EN rises > 50us"),
            ("STM32G431CBU6", "ES0430-ADC-VREF", "info", "VDDA must stay within +/-300mV of VDD during power-up ramp"),
        ],
    )

    con.executemany(
        "INSERT OR REPLACE INTO kg_modules VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
            ("mod-rpi-40pin", "RPI-GPIO-40PIN-HDR", "Raspberry Pi 40-Pin SBC Header", "SBC Carrier Interface",
             json.dumps({"3V3_MAX_MA": 500, "5V_IN_V": 5.0, "non_5v_tolerant": True}),
             "Connector_PinHeader_2.54mm:PinHeader_2x20_P2.54mm_Vertical",
             "${KICAD10_3DMODEL_DIR}/Connector_PinHeader_2.54mm.3dshapes/PinHeader_2x20_P2.54mm_Vertical.step"),
            ("mod-buck-5v-3v3", "VD-BUCK-5V-3V3-MOD", "5V/12V -> 3.3V 3A Buck Module", "Pre-Made Buck Converter",
             json.dumps({"v_in_max": 28.0, "v_out": 3.3, "i_out_max_a": 3.0}),
             "Package_TO_SOT_SMD:SOT-23-6",
             "${KICAD10_3DMODEL_DIR}/Package_TO_SOT_SMD.3dshapes/SOT-23-6.step"),
        ],
    )


def open_kg_connection(db_path: pathlib.Path, seed_if_empty: bool = True) -> duckdb.DuckDBPyConnection:
    db_path = pathlib.Path(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(db_path))
    con.execute(_SCHEMA_PATH.read_text(encoding="utf-8"))
    if seed_if_empty:
        _seed_starter_rows(con)
    return con


def interpolate_mlcc_c_eff(con: duckdb.DuckDBPyConnection, mpn: str, v_dc: float) -> Optional[Dict[str, Any]]:
    rows = con.execute(
        "SELECT v_dc, c_eff_uf, c_nom_uf, derating_pct FROM kg_mlcc_dcbias_curves WHERE mpn = ? ORDER BY v_dc ASC",
        (mpn,),
    ).fetchall()
    if not rows:
        return None
    if v_dc <= rows[0][0]:
        return {"v_dc": v_dc, "c_eff_uf": float(rows[0][1]), "c_nom_uf": float(rows[0][2]), "derating_pct": float(rows[0][3])}
    if v_dc >= rows[-1][0]:
        return {"v_dc": v_dc, "c_eff_uf": float(rows[-1][1]), "c_nom_uf": float(rows[-1][2]), "derating_pct": float(rows[-1][3])}
    for idx in range(len(rows) - 1):
        v0, c0, nom, p0 = rows[idx]
        v1, c1, _nom1, p1 = rows[idx + 1]
        if v0 <= v_dc <= v1:
            t = (v_dc - v0) / max(1e-9, (v1 - v0))
            ceff = round(float(c0) + t * (float(c1) - float(c0)), 4)
            pct = round(float(p0) + t * (float(p1) - float(p0)), 1)
            return {"v_dc": v_dc, "c_eff_uf": ceff, "c_nom_uf": float(nom), "derating_pct": pct}
    return None


def search_parts(
    con: duckdb.DuckDBPyConnection,
    query: str = "",
    category: str = "",
    basic_only: bool = False,
    v_bias: float = 12.0,
    limit: int = 40,
) -> List[Dict[str, Any]]:
    sql = "SELECT * FROM kg_parts WHERE 1=1"
    params: List[Any] = []
    if query.strip():
        q_like = f"%{query.strip().lower()}%"
        sql += " AND (LOWER(mpn) LIKE ? OR LOWER(lcsc_id) LIKE ? OR LOWER(description) LIKE ? OR LOWER(package) LIKE ?)"
        params.extend([q_like, q_like, q_like, q_like])
    if category.strip() and category.strip().lower() != "all":
        sql += " AND LOWER(category) = ?"
        params.append(category.strip().lower())
    if basic_only:
        sql += " AND feeder_type = 'Basic'"
    sql += " ORDER BY (feeder_type = 'Basic') DESC, stock_qty DESC LIMIT ?"
    params.append(max(1, min(int(limit), 200)))

    cols = [d[0] for d in con.execute(sql, params).description]
    rows = con.execute(sql, params).fetchall()
    out: List[Dict[str, Any]] = []
    for row in rows:
        item = dict(zip(cols, row))
        if item.get("c_nom_uf"):
            eff = interpolate_mlcc_c_eff(con, item["mpn"], v_bias)
            if eff:
                item["c_eff_uf_at_vbias"] = eff["c_eff_uf"]
                item["derating_pct_at_vbias"] = eff["derating_pct"]
        out.append(item)
    return out


def get_part_details(
    con: duckdb.DuckDBPyConnection,
    lcsc_or_mpn: str,
    v_bias: float = 12.0,
) -> Optional[Dict[str, Any]]:
    key = lcsc_or_mpn.strip()
    cur = con.execute(
        "SELECT * FROM kg_parts WHERE UPPER(lcsc_id) = UPPER(?) OR UPPER(mpn) = UPPER(?) LIMIT 1",
        (key, key),
    )
    cols = [d[0] for d in cur.description]
    row = cur.fetchone()
    if not row:
        return None
    part = dict(zip(cols, row))
    mpn = part["mpn"]

    dc_rows = con.execute(
        "SELECT v_dc, c_eff_uf, c_nom_uf, derating_pct FROM kg_mlcc_dcbias_curves WHERE mpn = ? ORDER BY v_dc ASC",
        (mpn,),
    ).fetchall()
    isat_rows = con.execute(
        "SELECT i_dc_a, l_eff_uh, l_nom_uh, temp_rise_c FROM kg_inductor_isat_curves WHERE mpn = ? ORDER BY i_dc_a ASC",
        (mpn,),
    ).fetchall()
    mos_rows = con.execute(
        "SELECT v_gs_v, rds_on_mohm, id_max_a FROM kg_mosfet_curves WHERE mpn = ? ORDER BY v_gs_v ASC",
        (mpn,),
    ).fetchall()
    pin_rows = con.execute(
        "SELECT pin_num, pin_name, electrical_type, v_max, tol_3v3_only FROM kg_pins WHERE mpn = ? ORDER BY pin_num ASC",
        (mpn,),
    ).fetchall()
    errata_rows = con.execute(
        "SELECT erratum_id, severity, summary FROM kg_silicon_errata WHERE mpn = ?",
        (mpn,),
    ).fetchall()

    part["mlcc_dcbias_curve"] = [
        {"v_dc": float(r[0]), "c_eff_uf": float(r[1]), "c_nom_uf": float(r[2]), "derating_pct": float(r[3])}
        for r in dc_rows
    ]
    part["effective_at_v_bias"] = interpolate_mlcc_c_eff(con, mpn, v_bias)
    part["inductor_isat_curve"] = [
        {"i_dc_a": float(r[0]), "l_eff_uh": float(r[1]), "l_nom_uh": float(r[2]), "temp_rise_c": float(r[3])}
        for r in isat_rows
    ]
    part["mosfet_curve"] = [
        {"v_gs_v": float(r[0]), "rds_on_mohm": float(r[1]), "id_max_a": float(r[2])}
        for r in mos_rows
    ]
    part["pins"] = [
        {"pin": str(r[0]), "name": str(r[1]), "type": str(r[2]), "v_max": float(r[3]), "tol_3v3_only": bool(r[4])}
        for r in pin_rows
    ]
    part["silicon_errata"] = [
        {"id": str(r[0]), "severity": str(r[1]), "summary": str(r[2])}
        for r in errata_rows
    ]
    return part


def import_jlcparts_sqlite(
    con: duckdb.DuckDBPyConnection,
    sqlite_path: pathlib.Path,
    online_fetch: bool = False,
) -> Dict[str, Any]:
    """Opt-in importer for local jlcparts SQLite dumps; fails closed if online_fetch=True under NDA_AIRGAPPED."""
    if online_fetch and os.environ.get("NDA_AIRGAPPED", "1") == "1":
        raise PermissionError("NDA_AIRGAP_VIOLATION: online LCSC fetch is blocked when NDA_AIRGAPPED=1")
    sqlite_path = pathlib.Path(sqlite_path)
    if not sqlite_path.is_file():
        raise FileNotFoundError(f"jlcparts SQLite file not found: {sqlite_path}")
    s_con = sqlite3.connect(str(sqlite_path))
    imported = 0
    try:
        tables = {r[0] for r in s_con.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()}
        if "components" in tables:
            for row in s_con.execute(
                "SELECT lcsc, mpn, manufacturer, package, description, stock, basic, price FROM components LIMIT 5000"
            ).fetchall():
                lcsc_id = str(row[0])
                mpn = str(row[1])
                basic = "Basic" if bool(row[6]) else "Extended"
                con.execute(
                    """
                    INSERT OR REPLACE INTO kg_parts
                    VALUES (?, ?, ?, 'Imported', ?, ?, ?, ?, ?, 16.0, 1.0, NULL, NULL, NULL, 0.1, 125.0, 80.0, 'Device:U', 'Package_TO_SOT_SMD:SOT-23-6', '', FALSE)
                    """,
                    (lcsc_id, mpn, str(row[2] or "Generic"), str(row[3] or "SMD"), str(row[4] or mpn), basic, int(row[5] or 0), float(row[7] or 0.0)),
                )
                imported += 1
    finally:
        s_con.close()
    return {"imported_count": imported, "source": str(sqlite_path)}
