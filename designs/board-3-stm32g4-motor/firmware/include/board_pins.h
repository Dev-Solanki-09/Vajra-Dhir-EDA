#ifndef BOARD_PINS_H
#define BOARD_PINS_H

/*
 * Vajra-Dhīr EDA — Deterministic Hardware-Firmware Co-Design Binding
 * Board ID: VD-BRD-003 (STM32G4 CAN-FD + Dual Motor Driver)
 * Units: Signed i64 nanometers, UUIDv7 canonical entity IDs
 * Generated: 2026-11-24T00:55:00Z
 */

#define BOARD_NAME "VD-BRD-003"
#define BOARD_REV "1.0"

// Microcontroller: STMicroelectronics STM32G431CBT6 (U1)
// CAN-FD Interface (TCAN334GDR U2)
#define PIN_FDCAN1_RX       GPIO_PIN_8   // GPIOB Pin 8 (AF9 FDCAN1_RX)
#define PIN_FDCAN1_TX       GPIO_PIN_9   // GPIOB Pin 9 (AF9 FDCAN1_TX)
#define PORT_FDCAN1         GPIOB

// DRV8833 Dual H-Bridge Motor Control (TIM1 Advanced Timer)
#define PIN_MOTOR_A_IN1     GPIO_PIN_8   // GPIOA Pin 8 (AF6 TIM1_CH1)
#define PIN_MOTOR_A_IN2     GPIO_PIN_9   // GPIOA Pin 9 (AF6 TIM1_CH2)
#define PIN_MOTOR_B_IN1     GPIO_PIN_10  // GPIOA Pin 10 (AF6 TIM1_CH3)
#define PIN_MOTOR_B_IN2     GPIO_PIN_11  // GPIOA Pin 11 (AF6 TIM1_CH4)
#define PORT_MOTOR_PWM      GPIOA

// Motor Fault & Current Feedback
#define PIN_MOTOR_nFAULT    GPIO_PIN_12  // GPIOB Pin 12 (Input Pull-up, Active Low)
#define PORT_MOTOR_FAULT    GPIOB
#define PIN_ISENSE_A        GPIO_PIN_0   // GPIOA Pin 0 (ADC1 Channel 1)
#define PIN_ISENSE_B        GPIO_PIN_1   // GPIOA Pin 1 (ADC1 Channel 2)
#define PORT_ISENSE         GPIOA

// Indicators
#define PIN_LED_CAN         GPIO_PIN_13  // GPIOC Pin 13
#define PIN_LED_FAULT       GPIO_PIN_14  // GPIOC Pin 14
#define PORT_LEDS           GPIOC

#endif // BOARD_PINS_H
