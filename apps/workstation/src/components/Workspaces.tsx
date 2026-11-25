import React, { useEffect, useState } from 'react';
import {
  STEP_WORKER_LICENSE,
  createStepWorkerRequest,
  decodeStepBufferInWorker,
} from '@vajradhir/webgpu-cad-engine';
import { globalCrossProbeBus } from '@vajradhir/crossprobe-bus';
import { WorkspaceId } from '../commandBus';
import { PcbEngineCanvas } from './PcbEngineCanvas';
import { SchematicElkCanvas } from './SchematicElkCanvas';
import { UplotScope } from './UplotScope';

export type WorkspaceViewState = 'loading' | 'empty' | 'error' | 'full';

export interface ActiveWorkspaceProps {
  workspace: WorkspaceId;
  layersVisible: boolean;
  ratsnestVisible: boolean;
  lockRingsVisible: boolean;
}

const StateToolbar: React.FC<{
  signature: string;
  viewState: WorkspaceViewState;
  setViewState: (s: WorkspaceViewState) => void;
}> = ({ signature, viewState, setViewState }) => (
  <div
    className="vd-metric"
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '4px 8px',
      borderRadius: 4,
      backgroundColor: 'var(--vd-bg-panel)',
      border: '1px solid var(--vd-border-subtle)',
      fontSize: 11,
    }}
  >
    <span>Object: {signature}</span>
    <div style={{ display: 'flex', gap: 4 }}>
      {(['full', 'loading', 'empty', 'error'] as WorkspaceViewState[]).map((s) => (
        <button
          key={s}
          type="button"
          className={`vd-btn ${viewState === s ? 'vd-btn-primary' : ''}`}
          style={{ minHeight: 24, padding: '2px 7px', fontSize: 11 }}
          onClick={() => setViewState(s)}
        >
          {s}
        </button>
      ))}
    </div>
  </div>
);

const WorkspaceFrame: React.FC<{
  signature: string;
  viewState: WorkspaceViewState;
  setViewState: (s: WorkspaceViewState) => void;
  emptyActionLabel: string;
  onEmptyAction: () => void;
  errorTitle: string;
  errorHint: string;
  children: React.ReactNode;
}> = ({
  signature,
  viewState,
  setViewState,
  emptyActionLabel,
  onEmptyAction,
  errorTitle,
  errorHint,
  children,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minHeight: 0 }}>
    <StateToolbar signature={signature} viewState={viewState} setViewState={setViewState} />

    {viewState === 'loading' && (
      <div
        data-testid="workspace-state-loading"
        style={{
          flex: 1,
          border: '1px solid var(--vd-border-subtle)',
          borderRadius: 6,
          padding: 16,
          display: 'grid',
          gap: 10,
          alignContent: 'start',
          backgroundColor: 'var(--vd-bg-workbench)',
        }}
      >
        <div style={{ height: 22, width: '48%', backgroundColor: 'var(--vd-bg-elevated)', borderRadius: 4 }} />
        <div style={{ height: 140, width: '100%', backgroundColor: 'var(--vd-bg-elevated)', borderRadius: 4 }} />
        <div style={{ height: 64, width: '100%', backgroundColor: 'var(--vd-bg-elevated)', borderRadius: 4 }} />
      </div>
    )}

    {viewState === 'empty' && (
      <div
        data-testid="workspace-state-empty"
        style={{
          flex: 1,
          border: '1px dashed var(--vd-border-subtle)',
          borderRadius: 6,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          padding: 24,
        }}
      >
        <span style={{ color: 'var(--vd-text-secondary)', fontSize: 13 }}>No data loaded for {signature}.</span>
        <button type="button" className="vd-btn vd-btn-primary" onClick={onEmptyAction}>
          {emptyActionLabel}
        </button>
      </div>
    )}

    {viewState === 'error' && (
      <div
        data-testid="workspace-state-error"
        role="alert"
        style={{
          flex: 1,
          border: '1px solid var(--vd-fail)',
          borderRadius: 6,
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          backgroundColor: 'var(--vd-bg-panel)',
        }}
      >
        <strong style={{ color: 'var(--vd-fail)' }}>{errorTitle}</strong>
        <span style={{ fontSize: 13, color: 'var(--vd-text-secondary)' }}>{errorHint}</span>
        <div>
          <button type="button" className="vd-btn" onClick={() => setViewState('full')}>
            Recover &amp; Retry
          </button>
        </div>
      </div>
    )}

    {viewState === 'full' && (
      <div data-testid="workspace-state-full" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
        {children}
      </div>
    )}
  </div>
);

const SIGNATURE_META: Record<
  WorkspaceId,
  { signature: string; emptyAction: string; errTitle: string; errHint: string }
> = {
  pcb_layout: {
    signature: 'HW-IR Copper & Pad Geometry',
    emptyAction: 'Load Buck PD Layout',
    errTitle: 'WebGL2/Canvas Context Unavailable',
    errHint: 'Check local GPU driver or reload Canvas2D software fallback.',
  },
  schematic: {
    signature: 'Hierarchical Sheet & elkjs Netlist',
    emptyAction: 'Synthesize .ato Schematic',
    errTitle: 'ELK Orthogonal Layout Solver Error',
    errHint: 'Verify disconnected port constraints in root sheet before re-running ELK.',
  },
  sim_lab: {
    signature: 'uPlot Transient & SMPS Bode Probe',
    emptyAction: 'Run SMPS Bode + PDN Solve',
    errTitle: 'Offline Simulation Convergence Timeout',
    errHint: 'Ensure vd-daemon (127.0.0.1:41900) is reachable for live SymPy/PDN evaluation.',
  },
  library_bom: {
    signature: 'DuckDB BOM & Basic/Extended Feeder Table',
    emptyAction: 'Query Reference Catalog',
    errTitle: 'DuckDB Part Index Unmounted',
    errHint: 'Start vd-daemon to mount local JLCPCB/LCSC catalog and cached datasheets.',
  },
  mfg_diff: {
    signature: 'G5 Panelizer (.kicad_pcb), pcb-diff, Wire Harness & iBOM',
    emptyAction: 'Generate 2x2 Panel & Diff Pack',
    errTitle: 'CAM / Diff Artifact Generation Error',
    errHint: 'Verify clean-room Rust panelizer and pcb-diff endpoints are responding.',
  },
  mcad_3d: {
    signature: 'Isolated LGPL-2.1-OCCT STEP Web Worker & Gerber Stackup',
    emptyAction: 'Decode Sample Enclosure STEP',
    errTitle: 'OCCT WASM Worker Fault',
    errHint: 'OCCT module stays sandboxed in stepWorker; inspect STEP buffer header ISO-10303-21.',
  },
  firmware_pinmux: {
    signature: 'Z3 SMT Pinmux Solver & board_pins.h',
    emptyAction: 'Solve STM32G4 Pinmux',
    errTitle: 'Z3 Pinmux Constraints Unsatisfiable (UNSAT)',
    errHint: 'Inspect conflicting UART/SPI alternate functions and release one pinned GPIO.',
  },
};

export const ActiveWorkspaceView: React.FC<ActiveWorkspaceProps> = ({
  workspace,
  layersVisible,
  ratsnestVisible,
  lockRingsVisible,
}) => {
  const [viewStates, setViewStates] = useState<Record<WorkspaceId, WorkspaceViewState>>({
    pcb_layout: 'full',
    schematic: 'full',
    sim_lab: 'full',
    library_bom: 'full',
    mfg_diff: 'full',
    mcad_3d: 'full',
    firmware_pinmux: 'full',
  });
  const [simResult, setSimResult] = useState<{ phaseMarginDeg: number; irDropMv: number }>({
    phaseMarginDeg: 58.4,
    irDropMv: 14.2,
  });
  const [bomQuery, setBomQuery] = useState('');
  const [bomRows, setBomRows] = useState([
    { refdes: 'U2', mpn: 'TPS54302DDCR', pkg: 'SOT-23-6', feeder: 'Extended (+$3)', qty: 1 },
    { refdes: 'U1', mpn: 'CH224K', pkg: 'ESSOP-10', feeder: 'Basic ($0)', qty: 1 },
    { refdes: 'L1', mpn: 'SWPA4020S4R7MT', pkg: '4x4mm', feeder: 'Basic ($0)', qty: 1 },
    { refdes: 'C1', mpn: 'CL21A226MQQNNNE', pkg: '0805', feeder: 'Basic ($0)', qty: 2 },
  ]);
  const [stepStatus, setStepStatus] = useState<string>(
    `Boundary: ${STEP_WORKER_LICENSE} (${createStepWorkerRequest('enclosure.step', new TextEncoder().encode('ISO-10303-21;')).byteLength} B sample)`
  );
  const [pinmuxC, setPinmuxC] = useState<string>(
    '#define PIN_SWD_SWDIO PA13\n#define PIN_CAN1_TX   PB9\n#define PIN_PD_INT    PA2\n// Z3 SAT: 0 peripheral alternate-function collisions'
  );
  const [mfgSubTab, setMfgSubTab] = useState<'panel' | 'diff' | 'harness' | 'ibom'>('panel');

  const currentMeta = SIGNATURE_META[workspace];
  const currentState = viewStates[workspace];
  const setCurrentState = (s: WorkspaceViewState) =>
    setViewStates((prev) => ({ ...prev, [workspace]: s }));

  useEffect(() => {
    if (workspace === 'library_bom') {
      fetch(`/api/v1/components/search?q=${encodeURIComponent(bomQuery)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data?.results?.length) {
            setBomRows(
              data.results.slice(0, 8).map((r: { mpn: string; package: string; feeder_type?: string }, i: number) => ({
                refdes: `U${i + 1}`,
                mpn: r.mpn,
                pkg: r.package || '0603',
                feeder: r.feeder_type === 'basic' ? 'Basic ($0)' : 'Extended (+$3)',
                qty: 1,
              }))
            );
          }
        })
        .catch(() => {});
    }
  }, [workspace, bomQuery]);

  const runLiveSim = async () => {
    try {
      const res = await fetch('/api/v1/pdn/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ net: '+3V3_OUT', current_a: 3.0 }),
      });
      if (res.ok) {
        const data = await res.json();
        setSimResult((prev) => ({
          ...prev,
          irDropMv: Number(data.max_ir_drop_mv ?? prev.irDropMv),
        }));
      }
    } catch {
      /* Offline preview fallback stays deterministic */
    }
  };

  const runLivePinmux = async () => {
    try {
      const res = await fetch('/api/v1/export/firmware-pins');
      if (res.ok) {
        const txt = await res.text();
        if (txt.trim()) setPinmuxC(txt);
      }
    } catch {
      /* Keep offline deterministic C header */
    }
  };

  const runStepWorkerDecode = () => {
    const sample = new TextEncoder().encode('ISO-10303-21;\nHEADER;\nENDSEC;\nEND-ISO-10303-21;');
    const decoded = decodeStepBufferInWorker(sample, null);
    setStepStatus(`Worker checked (${STEP_WORKER_LICENSE}): reason=${decoded.reason}`);
  };

  return (
    <WorkspaceFrame
      signature={currentMeta.signature}
      viewState={currentState}
      setViewState={setCurrentState}
      emptyActionLabel={currentMeta.emptyAction}
      onEmptyAction={() => setCurrentState('full')}
      errorTitle={currentMeta.errTitle}
      errorHint={currentMeta.errHint}
    >
      {workspace === 'pcb_layout' && (
        <PcbEngineCanvas
          layersVisible={layersVisible}
          ratsnestVisible={ratsnestVisible}
          lockRingsVisible={lockRingsVisible}
        />
      )}

      {workspace === 'schematic' && <SchematicElkCanvas />}

      {workspace === 'sim_lab' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="vd-metric">
            <span>Phase Margin: {simResult.phaseMarginDeg.toFixed(1)} deg · PDN IR-Drop: {simResult.irDropMv.toFixed(1)} mV</span>
            <button type="button" className="vd-btn vd-btn-primary" onClick={() => void runLiveSim()}>
              Solve PDN &amp; Bode
            </button>
          </div>
          <UplotScope
            title="SW_NODE Switching Transient & +3V3 Output Ripple (uPlot MIT)"
            xLabel="Time (us)"
            seriesLabel="V_SW (V)"
            xValues={[0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0]}
            yValues={[0.1, 11.8, 12.1, 11.9, 0.2, 0.1, 11.9, 12.0, 0.15]}
            strokeColor="#E05D44"
          />
          <UplotScope
            title="SMPS Closed-Loop Gain & Crossover (kHz)"
            xLabel="Freq (kHz)"
            seriesLabel="Gain (dB)"
            xValues={[1, 5, 10, 25, 50, 100, 200, 500]}
            yValues={[38, 28, 21, 11, 2, -6, -15, -24]}
            strokeColor="#38BDF8"
          />
        </div>
      )}

      {workspace === 'library_bom' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              aria-label="Filter parts by MPN"
              value={bomQuery}
              onChange={(e) => setBomQuery(e.target.value)}
              placeholder="Search DuckDB catalog (TPS54302, CH224K, 0805)..."
              style={{
                flex: 1,
                padding: '6px 10px',
                backgroundColor: 'var(--vd-bg-panel)',
                color: 'var(--vd-text-primary)',
                border: '1px solid var(--vd-border-subtle)',
                borderRadius: 4,
              }}
            />
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }} className="vd-metric">
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--vd-text-secondary)', borderBottom: '1px solid var(--vd-border-subtle)' }}>
                <th style={{ padding: '6px 4px' }}>Ref</th>
                <th style={{ padding: '6px 4px' }}>MPN</th>
                <th style={{ padding: '6px 4px' }}>Package</th>
                <th style={{ padding: '6px 4px' }}>Feeder</th>
                <th style={{ padding: '6px 4px', textAlign: 'right' }}>Qty</th>
              </tr>
            </thead>
            <tbody>
              {bomRows
                .filter((r) => !bomQuery || r.mpn.toLowerCase().includes(bomQuery.toLowerCase()))
                .map((row) => (
                  <tr
                    key={`${row.refdes}-${row.mpn}`}
                    style={{ borderBottom: '1px solid var(--vd-border-subtle)', cursor: 'pointer' }}
                    onClick={() => globalCrossProbeBus.select([row.refdes], 'tree')}
                  >
                    <td style={{ padding: '6px 4px' }}>{row.refdes}</td>
                    <td style={{ padding: '6px 4px' }}>{row.mpn}</td>
                    <td style={{ padding: '6px 4px' }}>{row.pkg}</td>
                    <td style={{ padding: '6px 4px', color: row.feeder.includes('$0') ? 'var(--vd-pass)' : 'var(--vd-warn)' }}>{row.feeder}</td>
                    <td style={{ padding: '6px 4px', textAlign: 'right' }}>{row.qty}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {workspace === 'mfg_diff' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {[
              { id: 'panel', label: 'Panelizer (.kicad_pcb + KiKit)' },
              { id: 'diff', label: 'Git PCB Diff SVG' },
              { id: 'harness', label: 'Wire Harness & Cut-List' },
              { id: 'ibom', label: 'iBOM & PcbDraw' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                className={`vd-btn ${mfgSubTab === t.id ? 'vd-btn-primary' : ''}`}
                onClick={() => setMfgSubTab(t.id as 'panel' | 'diff' | 'harness' | 'ibom')}
              >
                {t.label}
              </button>
            ))}
          </div>

          {mfgSubTab === 'panel' && (
            <pre className="vd-metric" style={{ margin: 0, padding: 10, borderRadius: 6, backgroundColor: 'var(--vd-bg-panel)', border: '1px solid var(--vd-border-subtle)', fontSize: 12, overflowX: 'auto' }}>
              {`(kicad_pcb (version 20240108) (generator "vd-panelizer-mit")\n  (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (44 "Edge.Cuts" user))\n  ;; 2x2 Matrix · 5.0 mm breakaway rails · 8 mouse-bites · 3 tooling holes\n)`}
            </pre>
          )}

          {mfgSubTab === 'diff' && (
            <svg viewBox="0 0 420 140" style={{ width: '100%', maxHeight: 160, backgroundColor: 'var(--vd-bg-panel)', borderRadius: 6, border: '1px solid var(--vd-border-subtle)' }} aria-label="G5B PCB Diff SVG">
              <line x1="30" y1="60" x2="180" y2="60" stroke="var(--vd-fail)" strokeWidth="4" strokeDasharray="6 3" />
              <line x1="30" y1="88" x2="260" y2="88" stroke="var(--vd-pass)" strokeWidth="4" />
              <text x="20" y="28" fill="var(--vd-text-primary)" fontSize="12" fontFamily="var(--vd-font-mono)">vd-pcb-diff: -1 trace removed, +1 trace widened (i64 nm)</text>
            </svg>
          )}

          {mfgSubTab === 'harness' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }} className="vd-metric">
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--vd-text-secondary)', borderBottom: '1px solid var(--vd-border-subtle)' }}>
                  <th style={{ padding: '6px 4px' }}>Wire ID</th>
                  <th style={{ padding: '6px 4px' }}>From → To</th>
                  <th style={{ padding: '6px 4px' }}>Gauge</th>
                  <th style={{ padding: '6px 4px', textAlign: 'right' }}>Cut Length (mm)</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: '1px solid var(--vd-border-subtle)' }}>
                  <td style={{ padding: '5px 4px' }}>W1 (VBUS)</td>
                  <td style={{ padding: '5px 4px' }}>J1:1 → J2:1</td>
                  <td style={{ padding: '5px 4px' }}>18 AWG Red</td>
                  <td style={{ padding: '5px 4px', textAlign: 'right' }}>250</td>
                </tr>
                <tr>
                  <td style={{ padding: '5px 4px' }}>W2 (GND)</td>
                  <td style={{ padding: '5px 4px' }}>J1:2 → J2:2</td>
                  <td style={{ padding: '5px 4px' }}>18 AWG Black</td>
                  <td style={{ padding: '5px 4px', textAlign: 'right' }}>250</td>
                </tr>
              </tbody>
            </table>
          )}

          {mfgSubTab === 'ibom' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }} className="vd-metric">
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--vd-text-secondary)', borderBottom: '1px solid var(--vd-border-subtle)' }}>
                  <th style={{ padding: '6px 4px' }}>RefDes</th>
                  <th style={{ padding: '6px 4px' }}>Value / Footprint</th>
                  <th style={{ padding: '6px 4px' }}>PcbDraw Side</th>
                  <th style={{ padding: '6px 4px', textAlign: 'right' }}>Placed</th>
                </tr>
              </thead>
              <tbody>
                {bomRows.map((row) => (
                  <tr
                    key={`ibom-${row.refdes}`}
                    style={{ borderBottom: '1px solid var(--vd-border-subtle)', cursor: 'pointer' }}
                    onClick={() => globalCrossProbeBus.select([row.refdes], 'pcb')}
                  >
                    <td style={{ padding: '5px 4px' }}>{row.refdes}</td>
                    <td style={{ padding: '5px 4px' }}>{row.mpn} ({row.pkg})</td>
                    <td style={{ padding: '5px 4px' }}>F.Cu / Top</td>
                    <td style={{ padding: '5px 4px', textAlign: 'right', color: 'var(--vd-pass)' }}>Ready</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {workspace === 'mcad_3d' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="vd-metric" style={{ fontSize: 12 }}>{stepStatus}</span>
            <button type="button" className="vd-btn vd-btn-primary" onClick={runStepWorkerDecode}>
              Verify STEP Worker Boundary
            </button>
          </div>
          <svg viewBox="0 0 420 150" style={{ width: '100%', maxHeight: 160, backgroundColor: 'var(--vd-bg-panel)', borderRadius: 6, border: '1px solid var(--vd-border-subtle)' }} aria-label="4-layer FR4 and STEP extrusion stackup">
            <rect x="40" y="36" width="340" height="14" fill="var(--vd-layer-f-cu)" />
            <rect x="40" y="54" width="340" height="22" fill="var(--vd-bg-elevated)" />
            <rect x="40" y="80" width="340" height="14" fill="var(--vd-layer-b-cu)" />
            <text x="44" y="26" fill="var(--vd-text-primary)" fontSize="11" fontFamily="var(--vd-font-mono)">1.6 mm FR-4 Stackup + RS-274X + Isolated OCCT STEP</text>
          </svg>
        </div>
      )}

      {workspace === 'firmware_pinmux' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="vd-metric" style={{ fontSize: 12 }}>Z3 SMT Pinmux Solver · STM32G474 / RP2040</span>
            <button type="button" className="vd-btn vd-btn-primary" onClick={() => void runLivePinmux()}>
              Export board_pins.h
            </button>
          </div>
          <pre className="vd-metric" style={{ margin: 0, padding: 10, borderRadius: 6, backgroundColor: 'var(--vd-bg-panel)', border: '1px solid var(--vd-border-subtle)', fontSize: 12, overflowX: 'auto' }}>
            {pinmuxC}
          </pre>
        </div>
      )}
    </WorkspaceFrame>
  );
};
