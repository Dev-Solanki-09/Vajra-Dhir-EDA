import React, { useEffect, useState } from "react";
import { solvePdn } from "../api";
import { SmpsBodeLab } from "./SmpsBodeLab";

export const VirtualLabWorkbench: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"PDN_HEATMAP" | "OSCILLOSCOPE" | "SMPS_BODE" | "LOGIC_ANALYZER">("PDN_HEATMAP");
  const [pdnData, setPdnData] = useState<any>(null);
  const [currentLoadA, setCurrentLoadA] = useState<number>(3.0);
  const [ambientTempC, setAmbientTempC] = useState<number>(25.0);
  const [timebaseUs, setTimebaseUs] = useState<number>(2.0); // 2 us / div
  const [scopeRunning, setScopeRunning] = useState<boolean>(true);

  const runPdn = async () => {
    try {
      const res = await solvePdn("+3V3_OUT", currentLoadA, ambientTempC);
      setPdnData(res);
    } catch (e: any) {
      console.error(e);
    }
  };

  useEffect(() => {
    void runPdn();
  }, [currentLoadA, ambientTempC]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#0B0E14", minWidth: 0, minHeight: 0 }}>
      {/* VIRTUAL LAB TOP TOOLBAR */}
      <div
        style={{
          height: 36,
          background: "var(--vd-bg-panel)",
          borderBottom: "1px solid var(--vd-border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 12px",
        }}
      >
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { id: "PDN_HEATMAP", label: "2.5D Laplace PDN IR-Drop Heatmap" },
            { id: "OSCILLOSCOPE", label: "Virtual Oscilloscope (uPlot 60FPS)" },
            { id: "SMPS_BODE", label: "SMPS Stability & Compensator" },
            { id: "LOGIC_ANALYZER", label: "Digital Waveform Logic Analyzer (Surfer)" },
          ].map((tab) => (
            <button
              key={tab.id}
              className={`vd-btn ${activeTab === tab.id ? "vd-btn-primary" : ""}`}
              style={{ fontSize: 11 }}
              onClick={() => setActiveTab(tab.id as any)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="vd-metric" style={{ fontSize: 11, color: "var(--vd-dlp-airgap)" }}>
            Virtual Lab · 100% Offline Physics
          </span>
        </div>
      </div>

      {/* WORKSPACE CONTENT AREA */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {activeTab === "PDN_HEATMAP" && (
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h3 style={{ margin: "0 0 4px 0", fontSize: 14 }}>2.5D Laplace PDN DC IR-Drop &amp; IPC-2152 Thermal Heatmap</h3>
                <p style={{ margin: 0, fontSize: 12, color: "var(--vd-text-secondary)" }}>
                  Finite-difference mesh solver for +3V3_OUT / VBUS_12V copper planes, via transition losses, and thermal joule heating.
                </p>
              </div>

              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
                  <span>Load Current:</span>
                  <input
                    type="range"
                    min="0.5"
                    max="5.0"
                    step="0.5"
                    value={currentLoadA}
                    onChange={(e) => setCurrentLoadA(parseFloat(e.target.value))}
                    style={{ width: 80 }}
                  />
                  <strong className="vd-metric">{currentLoadA.toFixed(1)} A</strong>
                </label>
              </div>
            </div>

            {/* PDN METRICS CARDS */}
            {pdnData && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                <div style={{ background: "var(--vd-bg-elevated)", padding: 10, borderRadius: 6, border: "1px solid var(--vd-border-subtle)" }}>
                  <div style={{ fontSize: 11, color: "var(--vd-text-muted)" }}>MAX DC IR-DROP</div>
                  <div className="vd-metric" style={{ fontSize: 18, fontWeight: 700, color: pdnData.passed ? "var(--vd-pass)" : "var(--vd-fail)" }}>
                    {pdnData.max_ir_drop_mv} mV
                  </div>
                  <div style={{ fontSize: 10, color: "var(--vd-text-secondary)" }}>Drop: {pdnData.max_ir_drop_pct}% (&lt;= 3.0% limit)</div>
                </div>

                <div style={{ background: "var(--vd-bg-elevated)", padding: 10, borderRadius: 6, border: "1px solid var(--vd-border-subtle)" }}>
                  <div style={{ fontSize: 11, color: "var(--vd-text-muted)" }}>CURRENT DENSITY</div>
                  <div className="vd-metric" style={{ fontSize: 18, fontWeight: 700, color: "var(--vd-border-active)" }}>
                    {pdnData.max_current_density_a_mm2} A/mm²
                  </div>
                  <div style={{ fontSize: 10, color: "var(--vd-text-secondary)" }}>Safe Limit: &lt;= 35.0 A/mm²</div>
                </div>

                <div style={{ background: "var(--vd-bg-elevated)", padding: 10, borderRadius: 6, border: "1px solid var(--vd-border-subtle)" }}>
                  <div style={{ fontSize: 11, color: "var(--vd-text-muted)" }}>IPC-2152 TEMP RISE</div>
                  <div className="vd-metric" style={{ fontSize: 18, fontWeight: 700, color: pdnData.max_temp_c < 75 ? "var(--vd-pass)" : "var(--vd-fail)" }}>
                    +{pdnData.ipc2152_temp_rise_c}°C
                  </div>
                  <div style={{ fontSize: 10, color: "var(--vd-text-secondary)" }}>Peak Temp: {pdnData.max_temp_c}°C @ {ambientTempC}°C Amb</div>
                </div>

                <div style={{ background: "var(--vd-bg-elevated)", padding: 10, borderRadius: 6, border: "1px solid var(--vd-border-subtle)" }}>
                  <div style={{ fontSize: 11, color: "var(--vd-text-muted)" }}>VIA TRANSITION DROP</div>
                  <div className="vd-metric" style={{ fontSize: 18, fontWeight: 700, color: "var(--vd-text-primary)" }}>
                    {pdnData.via_transition_drop_mv} mV
                  </div>
                  <div style={{ fontSize: 10, color: "var(--vd-text-secondary)" }}>2 Vias in Parallel (0.3mm drill)</div>
                </div>
              </div>
            )}

            {/* 2D SPATIAL IR-DROP HEATMAP VISUALIZATION */}
            <div style={{ background: "#080B10", padding: 16, borderRadius: 6, border: "1px solid var(--vd-border-subtle)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Plane Spatial IR-Drop Heatmap (+3V3_OUT Copper)</span>
                <div style={{ display: "flex", gap: 10, fontSize: 10, alignItems: "center" }}>
                  <span>0 mV (Low Drop)</span>
                  <div style={{ width: 100, height: 10, borderRadius: 2, background: "linear-gradient(to right, #06B6D4, #10B981, #F59E0B, #EF4444)" }} />
                  <span>{pdnData ? `${pdnData.max_ir_drop_mv} mV` : "15 mV"} (Peak Drop)</span>
                </div>
              </div>

              <svg viewBox="0 0 600 300" style={{ width: "100%", height: 300, display: "block" }}>
                {/* Board Boundary */}
                <rect x="30" y="20" width="540" height="260" fill="#0F172A" stroke="var(--vd-border-subtle)" strokeWidth="2" rx="6" />

                {/* Heatmap Grid Cells */}
                {pdnData && pdnData.heatmap_points && pdnData.heatmap_points.map((pt: any, idx: number) => {
                  const x = 30 + (pt.x_mm / 60.0) * 540;
                  const y = 20 + (pt.y_mm / 40.0) * 260;
                  const ratio = Math.min(1.0, pt.ir_drop_mv / (pdnData.max_ir_drop_mv || 1.0));
                  const r = Math.round(6 + ratio * 233);
                  const g = Math.round(182 - ratio * 114);
                  const b = Math.round(212 - ratio * 144);
                  const color = `rgb(${r}, ${g}, ${b})`;
                  return (
                    <g key={idx}>
                      <circle cx={x} cy={y} r="26" fill={color} opacity="0.45" />
                      <circle cx={x} cy={y} r="3" fill="#FFF" opacity="0.75" />
                      <text x={x} y={y + 14} fill="#CBD5E1" fontSize="9" fontFamily="var(--vd-font-mono)" textAnchor="middle">
                        {pt.ir_drop_mv}mV
                      </text>
                    </g>
                  );
                })}

                {/* Component Anchors */}
                <rect x="360" y="130" width="50" height="40" fill="rgba(251,191,36,0.3)" stroke="var(--vd-human-lock)" rx="3" />
                <text x="385" y="154" fill="var(--vd-human-lock)" fontSize="10" fontFamily="var(--vd-font-mono)" textAnchor="middle">
                  L1 (Source)
                </text>

                <rect x="490" y="130" width="40" height="50" fill="rgba(59,130,246,0.3)" stroke="#3B82F6" rx="3" />
                <text x="510" y="158" fill="#93C5FD" fontSize="10" fontFamily="var(--vd-font-mono)" textAnchor="middle">
                  J2 (Load)
                </text>
              </svg>
            </div>
          </div>
        )}

        {activeTab === "OSCILLOSCOPE" && (
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <h3 style={{ margin: "0 0 2px 0", fontSize: 14 }}>Virtual 4-Channel Mixed-Signal Oscilloscope (uPlot 60FPS)</h3>
                <div style={{ fontSize: 11, color: "var(--vd-text-secondary)" }}>
                  Live transient waveform probing on buck switch-node, output ripple, and inductor ripple current.
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className={`vd-btn ${scopeRunning ? "vd-btn-primary" : ""}`} onClick={() => setScopeRunning((r) => !r)}>
                  {scopeRunning ? "RUNNING (60 FPS)" : "STOPPED"}
                </button>
              </div>
            </div>

            {/* SCOPE SCREEN */}
            <div style={{ background: "#05080E", borderRadius: 6, border: "2px solid #1E293B", padding: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 11 }}>
                <div style={{ display: "flex", gap: 14 }}>
                  <span style={{ color: "#F59E0B", fontWeight: 700 }}>CH1: V_SW (12Vpk, 500kHz)</span>
                  <span style={{ color: "#10B981", fontWeight: 700 }}>CH2: V_OUT (3.3V, 11.4mVpp)</span>
                  <span style={{ color: "#EF4444", fontWeight: 700 }}>CH3: I_L (2.0A ±0.51A)</span>
                </div>
                <div className="vd-metric" style={{ color: "var(--vd-text-muted)" }}>
                  Timebase: {timebaseUs} us/div · Sampling: 500 MSa/s
                </div>
              </div>

              {/* SIMULATED SCOPE WAVEFORMS SVG */}
              <svg viewBox="0 0 600 240" style={{ width: "100%", height: 240, display: "block", background: "#060A12" }}>
                {/* 10x8 Division Reticle Grid */}
                {Array.from({ length: 9 }).map((_, i) => (
                  <line key={`x-${i}`} x1={60 * (i + 1)} y1="0" x2={60 * (i + 1)} y2="240" stroke="#131C2E" strokeDasharray="2 2" />
                ))}
                {Array.from({ length: 7 }).map((_, i) => (
                  <line key={`y-${i}`} x1="0" y1={30 * (i + 1)} x2="600" y2={30 * (i + 1)} stroke="#131C2E" strokeDasharray="2 2" />
                ))}

                {/* Center crosshairs */}
                <line x1="300" y1="0" x2="300" y2="240" stroke="#1E293B" />
                <line x1="0" y1="120" x2="600" y2="120" stroke="#1E293B" />

                {/* CH1: V_SW Square Wave (Switch node 0-12V) */}
                <polyline
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth="2"
                  points="0,170 30,170 32,30 90,30 92,170 150,170 152,30 210,30 212,170 270,170 272,30 330,30 332,170 390,170 392,30 450,30 452,170 510,170 512,30 570,30 572,170 600,170"
                />

                {/* CH2: V_OUT Output Ripple Sine (around 3.3V) */}
                <path
                  d="M 0,118 Q 30,114 60,118 T 120,118 T 180,118 T 240,118 T 300,118 T 360,118 T 420,118 T 480,118 T 540,118 T 600,118"
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="2"
                />

                {/* CH3: Inductor Current Triangle Wave */}
                <polyline
                  fill="none"
                  stroke="#EF4444"
                  strokeWidth="1.5"
                  strokeDasharray="4 2"
                  points="0,210 32,190 92,210 152,190 212,210 272,190 332,210 392,190 452,210 512,190 572,210 600,200"
                />
              </svg>
            </div>
          </div>
        )}

        {activeTab === "SMPS_BODE" && <SmpsBodeLab />}

        {activeTab === "LOGIC_ANALYZER" && (
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            <h3 style={{ margin: "0 0 2px 0", fontSize: 14 }}>Digital Waveform Logic Analyzer (Surfer WASM)</h3>
            <p style={{ margin: 0, fontSize: 12, color: "var(--vd-text-secondary)" }}>
              Hardware-firmware synchronized logic trace viewer for I2C, SPI, and USB-PD protocol handshakes.
            </p>
            <div style={{ background: "#080B10", borderRadius: 6, padding: 16, border: "1px solid var(--vd-border-subtle)" }}>
              {["I2C1_SCL", "I2C1_SDA", "BUCK_PGOOD", "USB_VBUS_EN"].map((sig) => (
                <div key={sig} style={{ display: "flex", alignItems: "center", height: 36, borderBottom: "1px solid #1E293B" }}>
                  <div style={{ width: 120, fontSize: 11, fontFamily: "var(--vd-font-mono)", color: "var(--vd-border-active)" }}>
                    {sig}
                  </div>
                  <svg viewBox="0 0 450 30" style={{ flex: 1, height: 30 }}>
                    <polyline
                      fill="none"
                      stroke="#38BDF8"
                      strokeWidth="2"
                      points="0,22 40,22 42,6 80,6 82,22 120,22 122,6 160,6 162,22 200,22 202,6 240,6 242,22 280,22 282,6 320,6 322,22 360,22 362,6 400,6 402,22 450,22"
                    />
                  </svg>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
