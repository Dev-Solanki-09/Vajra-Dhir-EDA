import React, { useMemo, useState } from 'react';

export interface CalculatorDrawerProps {
  open: boolean;
  onClose: () => void;
}

export const CalculatorDrawer: React.FC<CalculatorDrawerProps> = ({ open, onClose }) => {
  const [currentA, setCurrentA] = useState(3.0);
  const [tempRiseC, setTempRiseC] = useState(10.0);
  const [copperOz, setCopperOz] = useState(1.0);
  const [viaDrillMm, setViaDrillMm] = useState(0.3);
  const [traceWmm, setTraceWmm] = useState(0.18);
  const [dielectricHmm, setDielectricHmm] = useState(0.11);
  const [capBiasV, setCapBiasV] = useState(3.3);
  const [capRatedV, setCapRatedV] = useState(16.0);
  const [lUh, setLUh] = useState(4.7);
  const [cEffUf, setCEffUf] = useState(28.0);

  const metrics = useMemo(() => {
    // IPC-2221 external copper cross-section area (mil^2) converted to trace width (mm)
    const thicknessMil = copperOz * 1.378;
    const areaMil2 = Math.pow(Math.max(0.05, currentA) / (0.048 * Math.pow(Math.max(1, tempRiseC), 0.44)), 1 / 0.725);
    const traceWidthMm = (areaMil2 / thicknessMil) * 0.0254;
    // IPC-2152 internal/external derated via capacity estimate
    const barrelAreaMil2 = Math.PI * ((viaDrillMm / 0.0254) * 1.0);
    const viaMaxCurrentA = 0.048 * Math.pow(Math.max(1, tempRiseC), 0.44) * Math.pow(Math.max(1, barrelAreaMil2), 0.725);
    // Microstrip diff Z0 estimate (FR-4 er=4.2)
    const erEff = 3.2;
    const zSingle = (87 / Math.sqrt(erEff + 1.41)) * Math.log((5.98 * dielectricHmm) / (0.8 * traceWmm + 0.035));
    const zDiff = Math.max(40, 2 * zSingle * (1 - 0.32 * Math.exp((-2.9 * traceWmm) / Math.max(0.05, dielectricHmm))));
    // X7R/X5R voltage derating factor
    const ratio = Math.min(1, Math.max(0, capBiasV / Math.max(1, capRatedV)));
    const mlccRetainedPct = Math.max(18, Math.round(100 * (1 - 0.62 * Math.pow(ratio, 1.35))));
    // Buck LC corner + phase margin estimate
    const fLcKhz = 1000 / (2 * Math.PI * Math.sqrt(Math.max(0.1, lUh) * Math.max(1, cEffUf)));
    const phaseMarginDeg = Math.min(72, Math.max(24, 48 + (cEffUf - 20) * 0.4));
    return { traceWidthMm, viaMaxCurrentA, zDiff, mlccRetainedPct, fLcKhz, phaseMarginDeg };
  }, [currentA, tempRiseC, copperOz, viaDrillMm, traceWmm, dielectricHmm, capBiasV, capRatedV, lUh, cEffUf]);

  if (!open) return null;

  return (
    <aside
      aria-label="Electrical Physics Calculators"
      data-testid="calculator-drawer"
      style={{
        position: 'fixed',
        top: 40,
        right: 0,
        bottom: 28,
        width: 'min(360px, 92vw)',
        backgroundColor: 'var(--vd-bg-panel)',
        borderLeft: '1px solid var(--vd-border-subtle)',
        padding: 14,
        overflowY: 'auto',
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong style={{ fontSize: 14 }}>EE Physics Calculators (Offline)</strong>
        <button type="button" className="vd-btn" onClick={onClose}>
          Close
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }} className="vd-metric">
        <tbody>
          <tr style={{ borderBottom: '1px solid var(--vd-border-subtle)' }}>
            <td style={{ padding: '6px 0' }}>IPC Trace Width</td>
            <td style={{ textAlign: 'right', color: 'var(--vd-pass)' }}>{metrics.traceWidthMm.toFixed(3)} mm</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--vd-border-subtle)' }}>
            <td style={{ padding: '6px 0' }}>Via Current ({viaDrillMm} mm)</td>
            <td style={{ textAlign: 'right', color: 'var(--vd-pass)' }}>{metrics.viaMaxCurrentA.toFixed(2)} A</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--vd-border-subtle)' }}>
            <td style={{ padding: '6px 0' }}>Diff Impedance Zdiff</td>
            <td style={{ textAlign: 'right', color: 'var(--vd-border-active)' }}>{metrics.zDiff.toFixed(1)} Ohm</td>
          </tr>
          <tr style={{ borderBottom: '1px solid var(--vd-border-subtle)' }}>
            <td style={{ padding: '6px 0' }}>MLCC Effective C</td>
            <td style={{ textAlign: 'right', color: 'var(--vd-warn)' }}>{metrics.mlccRetainedPct}%</td>
          </tr>
          <tr>
            <td style={{ padding: '6px 0' }}>SMPS f_LC / Phase Margin</td>
            <td style={{ textAlign: 'right', color: 'var(--vd-pass)' }}>
              {metrics.fLcKhz.toFixed(1)} kHz / {metrics.phaseMarginDeg.toFixed(1)} deg
            </td>
          </tr>
        </tbody>
      </table>

      <div style={{ display: 'grid', gap: 8, fontSize: 12 }}>
        <label style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Load current (A)</span>
          <input type="number" step="0.2" value={currentA} onChange={(e) => setCurrentA(Number(e.target.value) || 0.2)} style={{ width: 76 }} />
        </label>
        <label style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Temp rise (degC)</span>
          <input type="number" step="1" value={tempRiseC} onChange={(e) => setTempRiseC(Number(e.target.value) || 1)} style={{ width: 76 }} />
        </label>
        <label style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Copper weight (oz)</span>
          <input type="number" step="0.5" value={copperOz} onChange={(e) => setCopperOz(Number(e.target.value) || 0.5)} style={{ width: 76 }} />
        </label>
        <label style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Via drill (mm)</span>
          <input type="number" step="0.05" value={viaDrillMm} onChange={(e) => setViaDrillMm(Number(e.target.value) || 0.15)} style={{ width: 76 }} />
        </label>
        <label style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Diff pair width (mm)</span>
          <input type="number" step="0.02" value={traceWmm} onChange={(e) => setTraceWmm(Number(e.target.value) || 0.1)} style={{ width: 76 }} />
        </label>
        <label style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Dielectric H (mm)</span>
          <input type="number" step="0.01" value={dielectricHmm} onChange={(e) => setDielectricHmm(Number(e.target.value) || 0.05)} style={{ width: 76 }} />
        </label>
        <label style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>MLCC Bias / Rated (V)</span>
          <span style={{ display: 'flex', gap: 4 }}>
            <input type="number" step="0.5" value={capBiasV} onChange={(e) => setCapBiasV(Number(e.target.value) || 0)} style={{ width: 46 }} />
            <input type="number" step="1" value={capRatedV} onChange={(e) => setCapRatedV(Number(e.target.value) || 6.3)} style={{ width: 46 }} />
          </span>
        </label>
        <label style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>SMPS L (uH) / C_eff (uF)</span>
          <span style={{ display: 'flex', gap: 4 }}>
            <input type="number" step="0.5" value={lUh} onChange={(e) => setLUh(Number(e.target.value) || 1)} style={{ width: 46 }} />
            <input type="number" step="2" value={cEffUf} onChange={(e) => setCEffUf(Number(e.target.value) || 4.7)} style={{ width: 46 }} />
          </span>
        </label>
      </div>
    </aside>
  );
};
