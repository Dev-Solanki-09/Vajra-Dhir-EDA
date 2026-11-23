import React, { useState } from 'react';

/**
 * VirtualLabApp (ui://vajradhir/virtual-lab)
 * Live transient simulation and fault injection workbench.
 */
export const VirtualLabApp: React.FC = () => {
  const [fault, setFault] = useState<string>("NONE");
  const [vout, setVout] = useState<number>(3.3);

  const handleInjectFault = (f: string) => {
    setFault(f);
    if (f === "SHORT_VOUT_GND") {
      setVout(0.0);
    } else if (f === "OVERVOLTAGE") {
      setVout(4.8);
    } else {
      setVout(3.3);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#08090b', color: '#f1f5f9', padding: '16px' }}>
      <header style={{ marginBottom: '16px' }}>
        <h3 style={{ margin: 0, color: '#10b981' }}>Virtual Lab & SPICE Oscilloscope</h3>
        <p style={{ margin: '4px 0', fontSize: '12px', color: '#94a3b8' }}>Real-time macromodel transient execution & fault-injection harness</p>
      </header>

      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
        <button onClick={() => handleInjectFault("NONE")} style={{ background: fault === "NONE" ? "#059669" : "#1e293b", color: "#fff", border: "none", padding: "6px 12px", borderRadius: 4, cursor: "pointer" }}>Nominal 12V→3.3V</button>
        <button onClick={() => handleInjectFault("SHORT_VOUT_GND")} style={{ background: fault === "SHORT_VOUT_GND" ? "#dc2626" : "#1e293b", color: "#fff", border: "none", padding: "6px 12px", borderRadius: 4, cursor: "pointer" }}>Fault: Short to GND</button>
        <button onClick={() => handleInjectFault("OVERVOLTAGE")} style={{ background: fault === "OVERVOLTAGE" ? "#d97706" : "#1e293b", color: "#fff", border: "none", padding: "6px 12px", borderRadius: 4, cursor: "pointer" }}>Fault: 30V Surge</button>
      </div>

      <div style={{ flex: 1, background: '#111318', border: '1px solid #1f232b', borderRadius: '6px', padding: '16px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ fontSize: '32px', fontFamily: 'monospace', color: vout === 3.3 ? '#10b981' : '#ef4444' }}>
          {vout.toFixed(2)} V
        </div>
        <div style={{ fontSize: '14px', color: '#64748b', marginTop: '4px' }}>
          Status: {fault === "NONE" ? "REGULATING (30 mVpp ripple)" : `FAULT ACTIVE (${fault})`}
        </div>
      </div>
    </div>
  );
};
