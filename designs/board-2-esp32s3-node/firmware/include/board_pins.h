#ifndef BOARD_PINS_H
#define BOARD_PINS_H

/*
 * Vajra-Dhīr EDA — Deterministic Hardware-Firmware Co-Design Binding
 * Board ID: VD-BRD-002 (ESP32-S3 4-Layer Environmental Sensor Node)
 * Units: Signed i64 nanometers, UUIDv7 canonical entity IDs
 * Generated: 2026-11-24T00:40:00Z
 */

#define BOARD_NAME "VD-BRD-002"
#define BOARD_REV "1.0"

// Microcontroller: ESP32-S3-WROOM-1-N8R8 (U1)
#define PIN_I2C0_SDA      4   // GPIO4 (HW-IR Net UUID: 018f6c32-7b40-7002-a000-000000000035)
#define PIN_I2C0_SCL      5   // GPIO5 (HW-IR Net UUID: 018f6c32-7b40-7002-a000-000000000036)
#define PIN_STATUS_LED    13  // GPIO13 (HW-IR Net UUID: 018f6c32-7b40-7002-a000-000000000039)
#define PIN_BOOT_BTN      0   // GPIO0 (HW-IR Net UUID: 018f6c32-7b40-7002-a000-000000000034)
#define PIN_USB_D_N       19  // GPIO19 (HW-IR Net UUID: 018f6c32-7b40-7002-a000-000000000037)
#define PIN_USB_D_P       20  // GPIO20 (HW-IR Net UUID: 018f6c32-7b40-7002-a000-000000000038)

// Sensors & Actuators
#define BME280_I2C_ADDR   0x76 // SDO pulled low to GND
#define I2C_FREQUENCY_HZ  400000 // Fast-mode 400 kHz

#endif // BOARD_PINS_H
