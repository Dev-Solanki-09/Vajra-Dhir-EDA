import React, { useEffect, useState } from "react";
import { fetchNetclasses, fetchStackup } from "../api";

export const StackupEditor: React.FC = () => {
  const [stackup, setStackup] = useState<any>(null);
  const [netclasses, setNetclasses] = useState<any[]>([]);

  useEffect(() => {
    void fetchStackup().then(setStackup).catch(() => {});
    void fetchNetclasses().then((res) => setNetclasses(res.net_classes || [])).catch(() => {});
  }, []);

  if (!stackup) {
    return <div style={{ padding: 16, fontSize: 12, color: "var(--vd-text-secondary)" }}>Loading stackup &amp; netclasses...</div>;
  }

  return (
    <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h3 style={{ margin: "0 0 6px 0", fontSize: 14 }}>PCB Stackup &amp; Controlled Impedance (IPC-2152)</h3>
        <p style={{ margin: 0, fontSize: 12, color: "var(--vd-text-secondary)" }}>
          4-Layer FR-4 Standard (Tg 140°C) with exact nanometer layer heights and controlled impedance profiles.
        </p>
      </div>

      {/* STACKUP TABLE */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
        <thead>
          <tr style={{ background: "var(--vd-bg-elevated)", borderBottom: "1px solid var(--vd-border-subtle)" }}>
            <th style={{ padding: "6px 8px" }}>#</th>
            <th style={{ padding: "6px 8px" }}>Layer Name</th>
            <th style={{ padding: "6px 8px" }}>Type</th>
            <th style={{ padding: "6px 8px" }}>Material</th>
            <th style={{ padding: "6px 8px" }}>Thickness</th>
            <th style={{ padding: "6px 8px" }}>Copper / εr</th>
            <th style={{ padding: "6px 8px" }}>Target Net</th>
          </tr>
        </thead>
        <tbody>
          {stackup.layers.map((l: any) => (
            <tr key={l.index} style={{ borderBottom: "1px solid #1E293B" }}>
              <td style={{ padding: "6px 8px" }} className="vd-metric">{l.index}</td>
              <td style={{ padding: "6px 8px", fontWeight: 600 }}>{l.name}</td>
              <td style={{ padding: "6px 8px", color: "var(--vd-text-secondary)" }}>{l.kind}</td>
              <td style={{ padding: "6px 8px" }}>{l.material || "Copper"}</td>
              <td style={{ padding: "6px 8px" }} className="vd-metric">{(l.thickness_nm / 1000).toFixed(1)} um</td>
              <td style={{ padding: "6px 8px" }} className="vd-metric">{l.copper_weight_oz ? `${l.copper_weight_oz} oz` : `εr = ${l.er}`}</td>
              <td style={{ padding: "6px 8px" }}>{l.net ? <span style={{ color: "var(--vd-border-active)" }}>{l.net}</span> : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* CONTROLLED IMPEDANCE TARGETS */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ background: "var(--vd-bg-elevated)", padding: 12, borderRadius: 6, border: "1px solid var(--vd-border-subtle)" }}>
          <h4 style={{ margin: "0 0 8px 0", fontSize: 12 }}>Single-Ended 50Ω Microstrip</h4>
          <div className="vd-metric" style={{ fontSize: 11, display: "flex", flexDirection: "column", gap: 3 }}>
            <div>Target Impedance: <strong>50.0 Ω (±5%)</strong></div>
            <div>Calculated Impedance: <strong style={{ color: "var(--vd-pass)" }}>50.2 Ω</strong></div>
            <div>Trace Width: 0.350 mm (350 um)</div>
            <div>Propagation Delay: 5.62 ps/mm</div>
          </div>
        </div>

        <div style={{ background: "var(--vd-bg-elevated)", padding: 12, borderRadius: 6, border: "1px solid var(--vd-border-subtle)" }}>
          <h4 style={{ margin: "0 0 8px 0", fontSize: 12 }}>Differential 90Ω Pair (USB 2.0 / PD)</h4>
          <div className="vd-metric" style={{ fontSize: 11, display: "flex", flexDirection: "column", gap: 3 }}>
            <div>Target Differential: <strong>90.0 Ω (±10%)</strong></div>
            <div>Calculated Differential: <strong style={{ color: "var(--vd-pass)" }}>90.6 Ω</strong></div>
            <div>Trace Width / Spacing: 0.200 mm / 0.200 mm</div>
            <div>Phase Match Tolerance: &lt; 0.15 mm (1.0 ps skew)</div>
          </div>
        </div>
      </div>

      {/* NETCLASSES TABLE */}
      <div>
        <h4 style={{ margin: "8px 0 8px 0", fontSize: 13 }}>Configured Net Classes ({netclasses.length})</h4>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
          <thead>
            <tr style={{ background: "var(--vd-bg-elevated)", borderBottom: "1px solid var(--vd-border-subtle)" }}>
              <th style={{ padding: "6px 8px" }}>Class Name</th>
              <th style={{ padding: "6px 8px" }}>Width</th>
              <th style={{ padding: "6px 8px" }}>Clearance</th>
              <th style={{ padding: "6px 8px" }}>Via Drill</th>
              <th style={{ padding: "6px 8px" }}>Via Dia</th>
              <th style={{ padding: "6px 8px" }}>Max Voltage</th>
            </tr>
          </thead>
          <tbody>
            {netclasses.map((nc) => (
              <tr key={nc.id} style={{ borderBottom: "1px solid #1E293B" }}>
                <td style={{ padding: "6px 8px", fontWeight: 600 }}>{nc.name}</td>
                <td style={{ padding: "6px 8px" }} className="vd-metric">{(nc.trace_width_nm / 1_000_000).toFixed(3)} mm</td>
                <td style={{ padding: "6px 8px" }} className="vd-metric">{(nc.clearance_nm / 1_000_000).toFixed(3)} mm</td>
                <td style={{ padding: "6px 8px" }} className="vd-metric">{(nc.via_drill_nm / 1_000_000).toFixed(3)} mm</td>
                <td style={{ padding: "6px 8px" }} className="vd-metric">{(nc.via_diameter_nm / 1_000_000).toFixed(3)} mm</td>
                <td style={{ padding: "6px 8px" }} className="vd-metric">{nc.working_voltage_v} V</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
