import React, { useEffect, useState } from "react";
import { solvePinmux } from "../api";

interface PinAssignment {
  pin: string;
  periph: string;
  signal: string;
  mode: string;
}

export const Z3PinmuxStudio: React.FC = () => {
  const [assignments, setAssignments] = useState<PinAssignment[]>([]);
  const [solved, setSolved] = useState<boolean>(true);
  const [unsatCore, setUnsatCore] = useState<string[]>([]);
  const [boardPinsH, setBoardPinsH] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedSignal, setSelectedSignal] = useState<string | null>(null);

  const runSolve = async (customSignals?: any[]) => {
    setLoading(true);
    try {
      const res = await solvePinmux(customSignals);
      setSolved(res.solved);
      setAssignments(res.assignments);
      setUnsatCore(res.unsat_core || []);
      setBoardPinsH(res.board_pins_h || "");
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void runSolve();
  }, []);

  const handleInjectConflict = () => {
    // Deliberately force two conflicting peripherals onto PB6
    const conflictSignals = [
      { signal: "PIN_PMIC_SCL", periph: "I2C1_SCL", pin: "PB6" },
      { signal: "PIN_BUCK_PWM", periph: "TIM4_CH1", pin: "PB6" },
      { signal: "PIN_PMIC_SDA", periph: "I2C1_SDA", pin: "PB7" },
    ];
    void runSolve(conflictSignals);
  };

  const handleResetClean = () => {
    void runSolve();
  };

  return (
    <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h3 style={{ margin: "0 0 4px 0", fontSize: 14 }}>Firmware &amp; MCU Pinmux Studio (Z3 SMT Solver)</h3>
          <p style={{ margin: 0, fontSize: 12, color: "var(--vd-text-secondary)" }}>
            Deterministic SAT alternate-function allocation for STM32G4 / ESP32-S3 with unsat_core conflict proof.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="vd-btn" onClick={handleInjectConflict} style={{ fontSize: 11 }}>
            Test Conflict (Inject Collision)
          </button>
          <button className="vd-btn vd-btn-primary" onClick={handleResetClean} style={{ fontSize: 11 }}>
            {loading ? "Solving SMT..." : "Solve Clean (Z3 SMT)"}
          </button>
        </div>
      </div>

      {/* SOLVER STATUS BANNER */}
      <div
        className="vd-metric"
        style={{
          padding: "8px 12px",
          borderRadius: 4,
          fontSize: 12,
          background: solved ? "#064E3B" : "#450A0A",
          color: solved ? "#A7F3D0" : "#FCA5A5",
          border: `1px solid ${solved ? "var(--vd-pass)" : "var(--vd-fail)"}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>
          <strong>{solved ? "SATISFIABLE (Z3 SMT PASS)" : "UNSATISFIABLE (PIN CONFLICT DETECTED)"}:</strong>{" "}
          {solved
            ? "All MCU alternate functions allocated with zero pin collisions."
            : `Unsat Core: ${unsatCore.join(" | ")}`}
        </span>
        <span style={{ fontSize: 10, background: "rgba(0,0,0,0.3)", padding: "2px 6px", borderRadius: 3 }}>
          Target MCU: STM32G474RET6 (LQFP-64)
        </span>
      </div>

      {/* PIN ASSIGNMENT TABLE */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
        <thead>
          <tr style={{ background: "var(--vd-bg-elevated)", borderBottom: "1px solid var(--vd-border-subtle)" }}>
            <th style={{ padding: "6px 8px" }}>MCU Pin</th>
            <th style={{ padding: "6px 8px" }}>Signal Name</th>
            <th style={{ padding: "6px 8px" }}>Peripheral</th>
            <th style={{ padding: "6px 8px" }}>Electrical Mode</th>
            <th style={{ padding: "6px 8px" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((a) => {
            const isConflicted = unsatCore.some((c) => c.includes(a.pin));
            return (
              <tr
                key={a.signal}
                onClick={() => setSelectedSignal(a.signal)}
                style={{
                  borderBottom: "1px solid #1E293B",
                  background: selectedSignal === a.signal ? "var(--vd-bg-elevated)" : "transparent",
                  cursor: "pointer",
                }}
              >
                <td style={{ padding: "6px 8px", fontWeight: 700 }} className="vd-metric">
                  {a.pin}
                </td>
                <td style={{ padding: "6px 8px", color: "var(--vd-border-active)" }}>
                  <code>{a.signal}</code>
                </td>
                <td style={{ padding: "6px 8px" }}>{a.periph}</td>
                <td style={{ padding: "6px 8px" }} className="vd-metric">
                  {a.mode}
                </td>
                <td style={{ padding: "6px 8px" }}>
                  {isConflicted ? (
                    <span style={{ color: "var(--vd-fail)", fontWeight: 600 }}>CONFLICT</span>
                  ) : (
                    <span style={{ color: "var(--vd-pass)", fontWeight: 600 }}>OK</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* LIVE GENERATED FIRMWARE HEADER */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 600 }}>Synchronized C Header (board_pins.h)</span>
          <button
            className="vd-btn"
            style={{ padding: "2px 8px", fontSize: 11 }}
            onClick={() => void navigator.clipboard.writeText(boardPinsH)}
          >
            Copy C Header
          </button>
        </div>
        <pre
          className="vd-metric"
          style={{
            background: "#0B0E14",
            padding: 12,
            borderRadius: 6,
            border: "1px solid var(--vd-border-subtle)",
            fontSize: 11,
            color: "var(--vd-text-primary)",
            overflowX: "auto",
            margin: 0,
          }}
        >
          {boardPinsH}
        </pre>
      </div>
    </div>
  );
};
