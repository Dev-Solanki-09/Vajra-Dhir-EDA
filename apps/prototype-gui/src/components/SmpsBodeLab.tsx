import React, { useEffect, useState } from "react";
import { calcSmpsBode } from "../api";

export const SmpsBodeLab: React.FC = () => {
  const [vin, setVin] = useState(12.0);
  const [vout, setVout] = useState(3.3);
  const [iout, setIout] = useState(2.0);
  const [fswKhz, setFswKhz] = useState(500.0);
  const [lUh, setLUh] = useState(4.7);
  const [cNomUf, setCNomUf] = useState(44.0);
  const [esrMohm, setEsrMohm] = useState(5.0);

  const [bodeRes, setBodeRes] = useState<any>(null);

  const refreshBode = async () => {
    try {
      const res = await calcSmpsBode({
        vin,
        vout,
        iout,
        fsw_khz: fswKhz,
        l_uh: lUh,
        c_nom_uf: cNomUf,
        esr_mohm: esrMohm,
      });
      setBodeRes(res);
    } catch (e: any) {
      console.error(e);
    }
  };

  useEffect(() => {
    void refreshBode();
  }, [vin, vout, iout, fswKhz, lUh, cNomUf, esrMohm]);

  return (
    <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <h3 style={{ margin: "0 0 4px 0", fontSize: 14 }}>SMPS Physics Lab &amp; Loop Stability (SymPy + Pint + Control)</h3>
        <p style={{ margin: 0, fontSize: 12, color: "var(--vd-text-secondary)" }}>
          Real-time analytical transfer function, MLCC DC-bias derating curve, inductor saturation margin, and Bode phase/gain margins.
        </p>
      </div>

      {/* PARAMETER SLIDERS GRID */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10, background: "var(--vd-bg-elevated)", padding: 12, borderRadius: 6, border: "1px solid var(--vd-border-subtle)" }}>
        <div>
          <label style={{ fontSize: 11, display: "flex", justifyContent: "space-between" }}>
            <span>Vin (Input Voltage)</span>
            <strong className="vd-metric">{vin.toFixed(1)} V</strong>
          </label>
          <input type="range" min="4.5" max="24.0" step="0.5" value={vin} onChange={(e) => setVin(parseFloat(e.target.value))} style={{ width: "100%" }} />
        </div>

        <div>
          <label style={{ fontSize: 11, display: "flex", justifyContent: "space-between" }}>
            <span>Vout (Target Output)</span>
            <strong className="vd-metric">{vout.toFixed(2)} V</strong>
          </label>
          <input type="range" min="0.8" max="5.0" step="0.1" value={vout} onChange={(e) => setVout(parseFloat(e.target.value))} style={{ width: "100%" }} />
        </div>

        <div>
          <label style={{ fontSize: 11, display: "flex", justifyContent: "space-between" }}>
            <span>Iout (Max Load Current)</span>
            <strong className="vd-metric">{iout.toFixed(1)} A</strong>
          </label>
          <input type="range" min="0.2" max="3.0" step="0.1" value={iout} onChange={(e) => setIout(parseFloat(e.target.value))} style={{ width: "100%" }} />
        </div>

        <div>
          <label style={{ fontSize: 11, display: "flex", justifyContent: "space-between" }}>
            <span>f_sw (Switching Frequency)</span>
            <strong className="vd-metric">{fswKhz.toFixed(0)} kHz</strong>
          </label>
          <input type="range" min="200" max="2200" step="50" value={fswKhz} onChange={(e) => setFswKhz(parseFloat(e.target.value))} style={{ width: "100%" }} />
        </div>

        <div>
          <label style={{ fontSize: 11, display: "flex", justifyContent: "space-between" }}>
            <span>L (Inductance)</span>
            <strong className="vd-metric">{lUh.toFixed(1)} uH</strong>
          </label>
          <input type="range" min="1.0" max="15.0" step="0.5" value={lUh} onChange={(e) => setLUh(parseFloat(e.target.value))} style={{ width: "100%" }} />
        </div>

        <div>
          <label style={{ fontSize: 11, display: "flex", justifyContent: "space-between" }}>
            <span>C_nom (Nominal Output Cap)</span>
            <strong className="vd-metric">{cNomUf.toFixed(0)} uF</strong>
          </label>
          <input type="range" min="10" max="100" step="2" value={cNomUf} onChange={(e) => setCNomUf(parseFloat(e.target.value))} style={{ width: "100%" }} />
        </div>
      </div>

      {/* METRICS & STABILITY STATUS */}
      {bodeRes && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <div style={{ background: "var(--vd-bg-elevated)", padding: 10, borderRadius: 6, border: "1px solid var(--vd-border-subtle)" }}>
              <div style={{ fontSize: 11, color: "var(--vd-text-muted)" }}>PHASE MARGIN (φm)</div>
              <div className="vd-metric" style={{ fontSize: 18, fontWeight: 700, color: bodeRes.phase_margin_deg >= 45 ? "var(--vd-pass)" : "var(--vd-fail)" }}>
                {bodeRes.phase_margin_deg.toFixed(1)}°
              </div>
              <div style={{ fontSize: 10, color: "var(--vd-text-secondary)" }}>Target: &gt;= 45.0°</div>
            </div>

            <div style={{ background: "var(--vd-bg-elevated)", padding: 10, borderRadius: 6, border: "1px solid var(--vd-border-subtle)" }}>
              <div style={{ fontSize: 11, color: "var(--vd-text-muted)" }}>GAIN MARGIN (GM)</div>
              <div className="vd-metric" style={{ fontSize: 18, fontWeight: 700, color: bodeRes.gain_margin_db <= -10 ? "var(--vd-pass)" : "var(--vd-fail)" }}>
                {bodeRes.gain_margin_db.toFixed(1)} dB
              </div>
              <div style={{ fontSize: 10, color: "var(--vd-text-secondary)" }}>Target: &lt;= -10.0 dB</div>
            </div>

            <div style={{ background: "var(--vd-bg-elevated)", padding: 10, borderRadius: 6, border: "1px solid var(--vd-border-subtle)" }}>
              <div style={{ fontSize: 11, color: "var(--vd-text-muted)" }}>OUTPUT RIPPLE (Vpp)</div>
              <div className="vd-metric" style={{ fontSize: 18, fontWeight: 700, color: bodeRes.ripple_pass ? "var(--vd-pass)" : "var(--vd-fail)" }}>
                {bodeRes.output_ripple_mvpp.toFixed(2)} mVpp
              </div>
              <div style={{ fontSize: 10, color: "var(--vd-text-secondary)" }}>Limit: &lt;= 40.0 mVpp</div>
            </div>

            <div style={{ background: "var(--vd-bg-elevated)", padding: 10, borderRadius: 6, border: "1px solid var(--vd-border-subtle)" }}>
              <div style={{ fontSize: 11, color: "var(--vd-text-muted)" }}>MLCC DC-BIAS DERATING</div>
              <div className="vd-metric" style={{ fontSize: 18, fontWeight: 700, color: "var(--vd-border-active)" }}>
                {bodeRes.c_eff_uf.toFixed(1)} uF
              </div>
              <div style={{ fontSize: 10, color: "var(--vd-text-secondary)" }}>Derated -{bodeRes.dc_bias_derating_pct}% @ {vout}V</div>
            </div>

            <div style={{ background: "var(--vd-bg-elevated)", padding: 10, borderRadius: 6, border: "1px solid var(--vd-border-subtle)" }}>
              <div style={{ fontSize: 11, color: "var(--vd-text-muted)" }}>INDUCTOR SATURATION</div>
              <div className="vd-metric" style={{ fontSize: 18, fontWeight: 700, color: bodeRes.isat_pass ? "var(--vd-pass)" : "var(--vd-fail)" }}>
                {bodeRes.isat_margin.toFixed(2)}x
              </div>
              <div style={{ fontSize: 10, color: "var(--vd-text-secondary)" }}>Ipeak: {bodeRes.inductor_peak_a}A / Isat: {bodeRes.inductor_isat_a}A</div>
            </div>
          </div>

          {/* SVG BODE PLOT (Magnitude & Phase) */}
          <div style={{ background: "#0B0E14", padding: 14, borderRadius: 6, border: "1px solid var(--vd-border-subtle)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Bode Plot (Open-Loop Gain &amp; Phase vs Frequency)</span>
              <div style={{ display: "flex", gap: 12, fontSize: 11 }}>
                <span style={{ color: "var(--vd-border-active)" }}>— Magnitude (dB)</span>
                <span style={{ color: "#F59E0B" }}>— Phase (deg)</span>
              </div>
            </div>
            <svg viewBox="0 0 600 180" style={{ width: "100%", height: 180, display: "block" }}>
              {/* Grid Lines */}
              <line x1="50" y1="20" x2="580" y2="20" stroke="#1E293B" strokeDasharray="3 3" />
              <line x1="50" y1="70" x2="580" y2="70" stroke="#334155" />
              <line x1="50" y1="120" x2="580" y2="120" stroke="#1E293B" strokeDasharray="3 3" />
              <line x1="50" y1="160" x2="580" y2="160" stroke="#1E293B" />

              {/* Zero dB line */}
              <text x="15" y="74" fill="#94A3B8" fontSize="10" fontFamily="var(--vd-font-mono)">0 dB</text>
              <text x="10" y="24" fill="#94A3B8" fontSize="10" fontFamily="var(--vd-font-mono)">+40 dB</text>
              <text x="10" y="164" fill="#94A3B8" fontSize="10" fontFamily="var(--vd-font-mono)">-40 dB</text>

              {/* Magnitude curve */}
              {bodeRes.bode_curve && (
                <polyline
                  fill="none"
                  stroke="var(--vd-border-active)"
                  strokeWidth="2"
                  points={bodeRes.bode_curve
                    .map((pt: any, idx: number) => {
                      const x = 50 + (idx / (bodeRes.bode_curve.length - 1)) * 530;
                      // map mag_db: +40 -> 20, -40 -> 160
                      const y = 70 - (pt.mag_db / 40.0) * 50;
                      return `${x},${Math.max(10, Math.min(170, y))}`;
                    })
                    .join(" ")}
                />
              )}

              {/* Phase curve */}
              {bodeRes.bode_curve && (
                <polyline
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth="1.5"
                  strokeDasharray="4 2"
                  points={bodeRes.bode_curve
                    .map((pt: any, idx: number) => {
                      const x = 50 + (idx / (bodeRes.bode_curve.length - 1)) * 530;
                      // map phase: 0 -> 20, -180 -> 160
                      const y = 20 + (-pt.phase_deg / 180.0) * 140;
                      return `${x},${Math.max(10, Math.min(170, y))}`;
                    })
                    .join(" ")}
                />
              )}
            </svg>
          </div>
        </>
      )}
    </div>
  );
};
