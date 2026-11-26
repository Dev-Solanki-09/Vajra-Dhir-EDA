import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { globalCrossProbeBus } from '@vajradhir/crossprobe-bus';
import { SpiceWasmHost, computeWaveformMetrics } from '@vajradhir/sim-worker';
import { globalSpiceOverlayStore, useSpiceOverlay } from '../spiceSimStore';

const UplotScope = React.lazy(() =>
  import('./UplotScope').then((m) => ({ default: m.UplotScope }))
);

export type SpiceMode = 'op' | 'tran' | 'ac' | 'montecarlo' | 'fault';
export type FaultType = 'none' | 'short_circuit' | 'overvoltage' | 'reverse_polarity' | 'surge_2x' | 'brownout_dip';

interface P9Finding {
  rule_id: string;
  severity: string;
  domain: string;
  refdes?: string;
  physics_formula: string;
  calculated_value: string;
  limit_value: string;
  why_it_fails_plain_english: string;
  recommended_fix: string;
}

interface SimRunResponse {
  ok: boolean;
  mode: string;
  fault_type: string;
  engine: string;
  sha256: string;
  cas_cached: boolean;
  netlist: string;
  cir_file?: string;
  net_uuid_map: Record<string, string>;
  fidelity_badges: Array<{ refdes: string; tier: string; detail: string }>;
  vectors: Record<string, unknown>;
  metrics: {
    min_v: number;
    max_v: number;
    mean_v: number;
    ripple_mv_pp: number;
    overshoot_pct: number;
    settling_time_us: number;
  };
  dc_nodes: Record<string, number>;
  power_mw: Record<string, number>;
  montecarlo?: {
    ok: boolean;
    spicelib_version: string;
    ring_isolation: string;
    tolerance_pct: number;
    runs_executed: number;
    worst_case_min_v: number;
    worst_case_max_v: number;
    worst_case_ripple_mv_pp: number;
  } | null;
  p9_stress_findings: P9Finding[];
  diagnostics: Array<{ line: number; severity: string; message: string }>;
  error?: string;
}

const REFDES_TO_NET: Record<string, string> = {
  J1: 'vin_12v',
  U1: 'vin_12v',
  U2: 'sw_node',
  L1: 'sw_node',
  C1: 'vout_3v3',
  C2: 'vin_12v',
  C3: 'vout_3v3',
  C4: 'v_mcu_3v3',
  R1: 'v_mcu_3v3',
  R2: 'vout_3v3',
  R3: 'v_mcu_3v3',
  D1: 'vin_12v',
  J2: 'vout_3v3',
};

const PROBE_NETS = ['vout_3v3', 'sw_node', 'v_mcu_3v3', 'vin_12v'] as const;

export const SimulationLabPanel: React.FC<{ autoRun?: boolean }> = ({ autoRun = true }) => {
  const overlay = useSpiceOverlay();
  const [mode, setMode] = useState<SpiceMode>('tran');
  const [faultType, setFaultType] = useState<FaultType>('none');
  const [enginePref, setEnginePref] = useState<'wasm' | 'native'>('native');
  const [cOutUf, setCOutUf] = useState<string>('22.0');
  const [lUh, setLUh] = useState<string>('4.7');
  const [tolPct, setTolPct] = useState<string>('5');
  const [cursorAPct, setCursorAPct] = useState<number>(25);
  const [cursorBPct, setCursorBPct] = useState<number>(80);
  const [simData, setSimData] = useState<SimRunResponse | null>(null);
  const [wasmWaveform, setWasmWaveform] = useState<{ x: number[]; y: number[]; engine: string; rippleMv: number } | null>(null);
  const [running, setRunning] = useState<boolean>(false);
  const [showNetlist, setShowNetlist] = useState<boolean>(false);
  const [statusNote, setStatusNote] = useState<string>('SPICE ready (ngspice-wasm Web Worker + native ngspice.dll)');

  const wasmHostRef = useRef<SpiceWasmHost | null>(null);
  if (!wasmHostRef.current && typeof Worker !== 'undefined') {
    wasmHostRef.current = new SpiceWasmHost(
      () => new Worker(new URL('../workers/spiceWorker.worker.ts', import.meta.url), { type: 'module' })
    );
  }

  const runSimulation = useCallback(
    async (overrideMode?: SpiceMode, overrideCout?: string, overrideFault?: FaultType, overrideEngine?: 'wasm' | 'native') => {
      const m = overrideMode ?? mode;
      const cVal = Number(overrideCout ?? cOutUf) || 22.0;
      const lVal = Number(lUh) || 4.7;
      const fType = overrideFault ?? faultType;
      const eng = overrideEngine ?? enginePref;

      setRunning(true);
      try {
        const resp = await fetch('/api/v1/sim/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: m,
            fault_type: fType,
            c_out_uf: cVal,
            l_uh: lVal,
            tol_pct: Number(tolPct) || 5.0,
          }),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = (await resp.json()) as SimRunResponse;
        setSimData(data);

        globalSpiceOverlayStore.update({
          dcNodes: data.dc_nodes || {},
          powerMw: data.power_mw || {},
          lastRippleMvPp: data.metrics?.ripple_mv_pp ?? 0,
          lastMode: m,
          p9AlertCount: (data.p9_stress_findings || []).filter((f) => f.severity === 'error').length,
        });

        // Also execute in-browser ngspice-wasm Web Worker when interactive WASM mode requested on transient/AC/OP
        if (eng === 'wasm' && (m === 'tran' || m === 'ac' || m === 'op') && wasmHostRef.current && data.netlist) {
          try {
            const wRes = await wasmHostRef.current.run(data.netlist, 25000);
            if (wRes.ok && wRes.signals) {
              const tArr = wRes.signals['time'] || wRes.signals['frequency'] || [];
              const sigKey =
                Object.keys(wRes.signals).find((k) => k.toLowerCase().includes(overlay.activeProbeNet.toLowerCase())) ||
                Object.keys(wRes.signals).find((k) => k.toLowerCase().includes('vout')) ||
                '';
              const yArr = sigKey ? wRes.signals[sigKey] : [];
              if (tArr.length > 2 && yArr.length === tArr.length) {
                const wMet = computeWaveformMetrics(tArr, yArr, 3.3);
                setWasmWaveform({
                  x: m === 'ac' ? tArr.map((f) => Number((f / 1000).toFixed(2))) : tArr.map((t) => Number((t * 1e6).toFixed(3))),
                  y: yArr,
                  engine: `ngspice-wasm (${wRes.ladderLabel})`,
                  rippleMv: wMet.rippleMvPp,
                });
              }
            }
          } catch (err) {
            setStatusNote(`ngspice-wasm fell back cleanly to native ngspice.dll: ${err instanceof Error ? err.message : String(err)}`);
          }
        } else {
          setWasmWaveform(null);
        }

        const p9Errs = (data.p9_stress_findings || []).filter((f) => f.severity === 'error').length;
        setStatusNote(
          `${data.engine} (${m.toUpperCase()}) ${data.cas_cached ? '[CAS Hit]' : '[Solved]'} · Ripple ${data.metrics.ripple_mv_pp.toFixed(1)} mVpp · P9 Alerts: ${p9Errs}`
        );
      } catch (err) {
        setStatusNote(`Simulation error: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setRunning(false);
      }
    },
    [cOutUf, enginePref, faultType, lUh, mode, overlay.activeProbeNet, tolPct]
  );

  useEffect(() => {
    if (autoRun) {
      void runSimulation('tran', '22.0', 'none', 'native');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun]);

  // CrossProbeBus P10 <-> P2/P3 Virtual Probe listener
  useEffect(() => {
    const unsubNet = globalCrossProbeBus.onNetHighlight((ev) => {
      if (!ev.netId || ev.source === 'inspector') return;
      const lower = ev.netId.toLowerCase().replace(/[^a-z0-9_]/g, '_');
      const matched = PROBE_NETS.find((n) => lower.includes(n) || n.includes(lower)) ?? 'vout_3v3';
      globalSpiceOverlayStore.update({ activeProbeNet: matched });
      setStatusNote(`Virtual Probe attached from ${ev.source}: v(${matched})`);
    });
    const unsubSel = globalCrossProbeBus.onSelection((ev) => {
      if (!ev.entityIds.length) return;
      const mapped = REFDES_TO_NET[ev.entityIds[0]];
      if (mapped) {
        globalSpiceOverlayStore.update({ activeProbeNet: mapped });
      }
    });
    return () => {
      unsubNet();
      unsubSel();
    };
  }, []);

  const chartSeries = useMemo(() => {
    if (wasmWaveform && enginePref === 'wasm' && wasmWaveform.x.length > 2) {
      return {
        xLabel: mode === 'ac' ? 'Freq (kHz)' : 'Time (us)',
        yLabel: `v(${overlay.activeProbeNet}) [WASM]`,
        x: wasmWaveform.x,
        y: wasmWaveform.y,
      };
    }
    const vecs = simData?.vectors ?? {};
    const timeVec = Array.isArray(vecs['time']) ? (vecs['time'] as number[]) : [];
    const freqRaw = vecs['frequency'] as { mag?: number[] } | number[] | undefined;
    const freqVec = Array.isArray(freqRaw) ? freqRaw : Array.isArray(freqRaw?.mag) ? freqRaw.mag : [];

    const probeKey = overlay.activeProbeNet;
    const rawTarget = vecs[probeKey] ?? vecs['vout_3v3'];

    if (simData?.mode === 'ac' && freqVec.length > 1 && rawTarget && typeof rawTarget === 'object' && !Array.isArray(rawTarget)) {
      const magDb = (rawTarget as { mag_db?: number[] }).mag_db ?? [];
      return {
        xLabel: 'Freq (kHz)',
        yLabel: `|V(${probeKey})| dB`,
        x: freqVec.map((f) => Number((f / 1000).toFixed(2))),
        y: magDb,
      };
    }

    const yArr = Array.isArray(rawTarget) ? (rawTarget as number[]) : [];
    const xArr = timeVec.length === yArr.length && timeVec.length > 0
      ? timeVec.map((t) => Number((t * 1e6).toFixed(3)))
      : yArr.map((_, idx) => idx);

    return {
      xLabel: 'Time (us)',
      yLabel: `v(${probeKey}) (V)`,
      x: xArr,
      y: yArr,
    };
  }, [enginePref, mode, overlay.activeProbeNet, simData, wasmWaveform]);

  const cursorStats = useMemo(() => {
    const { x, y } = chartSeries;
    if (x.length < 2 || y.length < 2) {
      return { dt: 0, dv: 0, vA: 0, vB: 0 };
    }
    const idxA = Math.min(x.length - 1, Math.max(0, Math.round(((x.length - 1) * cursorAPct) / 100)));
    const idxB = Math.min(x.length - 1, Math.max(0, Math.round(((x.length - 1) * cursorBPct) / 100)));
    return {
      dt: Number((x[idxB] - x[idxA]).toFixed(3)),
      dv: Number((y[idxB] - y[idxA]).toFixed(4)),
      vA: Number(y[idxA].toFixed(4)),
      vB: Number(y[idxB].toFixed(4)),
    };
  }, [chartSeries, cursorAPct, cursorBPct]);

  return (
    <div
      data-testid="simulation-lab-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: 10,
        backgroundColor: 'var(--vd-bg-canvas)',
        color: 'var(--vd-text-primary)',
        border: '1px solid var(--vd-border)',
        borderRadius: 6,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div>
          <strong style={{ fontSize: 13 }}>Analog &amp; Power SPICE Virtual Lab (P10)</strong>
          <div data-testid="sim-status-banner" style={{ fontSize: 11, color: 'var(--vd-text-muted)' }}>
            {statusNote}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="vd-btn"
            data-testid="sim-toggle-netlist-btn"
            onClick={() => setShowNetlist((s) => !s)}
          >
            {showNetlist ? 'Hide .cir Deck' : 'View .cir Deck'}
          </button>
          <button
            type="button"
            className="vd-btn"
            data-testid="sim-abort-worker-btn"
            onClick={() => {
              wasmHostRef.current?.abort('User terminated WASM SPICE worker');
              setRunning(false);
              setStatusNote('Recycled ngspice-wasm Web Worker safely');
            }}
          >
            Abort / Recycle Worker
          </button>
          <button
            type="button"
            className="vd-btn vd-btn-primary"
            data-testid="sim-run-btn"
            disabled={running}
            onClick={() => void runSimulation()}
          >
            {running ? 'Running SPICE...' : 'Run SPICE Simulation'}
          </button>
        </div>
      </div>

      {/* 5 Testbench Mode Buttons + Engine + Under-Sized Cap Quick Injection */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {(['op', 'tran', 'ac', 'montecarlo', 'fault'] as const).map((m) => (
          <button
            key={m}
            type="button"
            data-testid={`sim-mode-${m}`}
            className={mode === m ? 'vd-btn vd-btn-primary' : 'vd-btn'}
            onClick={() => {
              setMode(m);
              void runSimulation(m);
            }}
            style={{ fontSize: 11 }}
          >
            {m === 'op' ? '1. DC OP' : m === 'tran' ? '2. Transient' : m === 'ac' ? '3. AC Sweep' : m === 'montecarlo' ? '4. Monte-Carlo (spicelib)' : '5. Fault Injection'}
          </button>
        ))}

        <select
          aria-label="SPICE Engine"
          data-testid="sim-engine-select"
          value={enginePref}
          onChange={(e) => setEnginePref(e.target.value as 'wasm' | 'native')}
          className="vd-input"
          style={{ width: 170, fontSize: 11 }}
        >
          <option value="native">Native ngspice.dll + CAS</option>
          <option value="wasm">Browser ngspice-wasm Worker</option>
        </select>

        {mode === 'fault' && (
          <select
            aria-label="Fault Injection Scenario"
            data-testid="sim-fault-select"
            value={faultType}
            onChange={(e) => {
              const ft = e.target.value as FaultType;
              setFaultType(ft);
              void runSimulation('fault', undefined, ft);
            }}
            className="vd-input"
            style={{ width: 170, fontSize: 11 }}
          >
            <option value="short_circuit">Short-Circuit (50 mOhm)</option>
            <option value="overvoltage">24V Input Overvoltage</option>
            <option value="reverse_polarity">-12V Reverse Polarity</option>
            <option value="surge_2x">2x Step Load Surge</option>
            <option value="brownout_dip">4.2V Brownout Dip</option>
          </select>
        )}

        {mode === 'montecarlo' && (
          <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
            Tol %:
            <select
              value={tolPct}
              onChange={(e) => {
                setTolPct(e.target.value);
              }}
              className="vd-input"
              style={{ width: 70, fontSize: 11 }}
            >
              <option value="1">1%</option>
              <option value="5">5%</option>
              <option value="10">10%</option>
            </select>
          </label>
        )}
      </div>

      {/* Component Tuning & Virtual Probe Node Selector */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 11 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          C1 (uF):
          <input
            type="number"
            step="0.1"
            data-testid="sim-cout-input"
            value={cOutUf}
            onChange={(e) => setCOutUf(e.target.value)}
            className="vd-input"
            style={{ width: 68, fontSize: 11 }}
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          L1 (uH):
          <input
            type="number"
            step="0.5"
            value={lUh}
            onChange={(e) => setLUh(e.target.value)}
            className="vd-input"
            style={{ width: 62, fontSize: 11 }}
          />
        </label>
        <button
          type="button"
          className="vd-btn"
          data-testid="sim-inject-undersized-cap"
          onClick={() => {
            setMode('tran');
            setCOutUf('0.47');
            void runSimulation('tran', '0.47', 'none');
          }}
        >
          Inject 0.47uF Cap Fault
        </button>

        <span style={{ marginLeft: 'auto', color: 'var(--vd-text-muted)' }}>Virtual Probe:</span>
        {PROBE_NETS.map((net) => (
          <button
            key={net}
            type="button"
            data-testid={`sim-probe-btn-${net}`}
            className={overlay.activeProbeNet === net ? 'vd-btn vd-btn-primary' : 'vd-btn'}
            style={{ fontSize: 11, padding: '2px 8px' }}
            onClick={() => {
              globalSpiceOverlayStore.update({ activeProbeNet: net });
              globalCrossProbeBus.highlightNet(net, 'pcb', '#F59E0B');
            }}
          >
            v({net})
            {simData?.dc_nodes?.[net] !== undefined ? ` ${simData.dc_nodes[net].toFixed(2)}V` : ''}
          </button>
        ))}
      </div>

      {/* uPlot Multi-Channel Scope + Cursors */}
      {chartSeries.y.length > 0 && (
        <div data-testid="sim-uplot-scope">
          <Suspense fallback={<div className="vd-metric">Loading uPlot SPICE oscilloscope...</div>}>
            <UplotScope
              title={`ngspice ${mode.toUpperCase()} — ${chartSeries.yLabel} (Ripple ${simData?.metrics?.ripple_mv_pp?.toFixed(1) ?? '0.0'} mVpp)`}
              xLabel={chartSeries.xLabel}
              seriesLabel={chartSeries.yLabel}
              xValues={chartSeries.x}
              yValues={chartSeries.y}
              strokeColor="#F59E0B"
            />
          </Suspense>

          <div
            data-testid="sim-measurement-cursors"
            className="vd-metric"
            style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: '6px 10px', marginTop: 6, fontSize: 11 }}
          >
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              Cursor A:
              <input type="range" min={0} max={100} value={cursorAPct} onChange={(e) => setCursorAPct(Number(e.target.value))} />
              <span>{cursorStats.vA} V</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              Cursor B:
              <input type="range" min={0} max={100} value={cursorBPct} onChange={(e) => setCursorBPct(Number(e.target.value))} />
              <span>{cursorStats.vB} V</span>
            </label>
            <span>
              <strong>Δt:</strong> {cursorStats.dt} · <strong>ΔV:</strong> {cursorStats.dv} V ·{' '}
              <strong>Ripple:</strong> {simData?.metrics?.ripple_mv_pp ?? 0} mVpp ·{' '}
              <strong>Overshoot:</strong> {simData?.metrics?.overshoot_pct ?? 0}% ·{' '}
              <strong>Settling:</strong> {simData?.metrics?.settling_time_us ?? 0} us
            </span>
          </div>
        </div>
      )}

      {/* Monte-Carlo Worst-Case Envelope Card */}
      {simData?.montecarlo && (
        <div
          data-testid="sim-montecarlo-card"
          className="vd-metric"
          style={{ padding: 8, border: '1px solid #38BDF8', fontSize: 11 }}
        >
          <strong>Ring 2 spicelib Monte-Carlo ({simData.montecarlo.runs_executed} runs @ ±{simData.montecarlo.tolerance_pct}%):</strong>{' '}
          Vout Envelope [{simData.montecarlo.worst_case_min_v}V .. {simData.montecarlo.worst_case_max_v}V] ·
          Worst Ripple {simData.montecarlo.worst_case_ripple_mv_pp} mVpp ({simData.montecarlo.ring_isolation})
        </div>
      )}

      {/* Model Fidelity Badges & CAS Cache Status */}
      {simData && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11 }}>
          <span style={{ padding: '2px 6px', borderRadius: 3, backgroundColor: '#1e293b', color: '#93c5fd' }}>
            SHA-256: {simData.sha256.slice(0, 10)} ({simData.cas_cached ? 'CAS Cache Hit' : 'Computed'})
          </span>
          {simData.fidelity_badges.map((b) => (
            <span
              key={b.refdes}
              style={{
                padding: '2px 6px',
                borderRadius: 3,
                backgroundColor: b.tier === 'Exact SPICE' ? '#064e3b' : '#312e81',
                color: b.tier === 'Exact SPICE' ? '#6ee7b7' : '#c7d2fe',
              }}
              title={b.detail}
            >
              {b.refdes}: {b.tier}
            </span>
          ))}
        </div>
      )}

      {/* P9 Over-Stress Assertion Cards */}
      {simData && (
        <div data-testid="sim-p9-stress-alerts" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {simData.p9_stress_findings.length === 0 ? (
            <div className="vd-metric" style={{ padding: 8, fontSize: 11, color: '#6ee7b7' }}>
              P10 + P9 Co-Verification GREEN: Peak simulated rail ripple and bias stresses within datasheet limits.
            </div>
          ) : (
            simData.p9_stress_findings.map((f, idx) => (
              <div
                key={`${f.rule_id}-${idx}`}
                data-testid={`sim-p9-finding-${f.rule_id}`}
                style={{
                  padding: 8,
                  borderRadius: 4,
                  border: f.severity === 'error' ? '1px solid #ef4444' : '1px solid var(--vd-border)',
                  backgroundColor: 'rgba(127, 29, 29, 0.25)',
                  fontSize: 11,
                }}
              >
                <strong>[{f.severity.toUpperCase()}] {f.rule_id}</strong> ({f.refdes || 'RAIL'}) — {f.calculated_value} vs {f.limit_value}
                <div style={{ color: 'var(--vd-text-muted)', marginTop: 2 }}>{f.why_it_fails_plain_english}</div>
              </div>
            ))
          )}
        </div>
      )}

      {showNetlist && simData?.netlist && (
        <pre
          data-testid="sim-cir-preview"
          style={{
            maxHeight: 200,
            overflow: 'auto',
            padding: 8,
            fontSize: 11,
            backgroundColor: '#0b0f19',
            borderRadius: 4,
            border: '1px solid var(--vd-border)',
            margin: 0,
          }}
        >
          {simData.netlist}
        </pre>
      )}
    </div>
  );
};

export default SimulationLabPanel;
