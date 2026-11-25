import React, { Suspense, useEffect, useMemo, useState } from 'react';
import {
  STEP_WORKER_LICENSE,
  createStepWorkerRequest,
  decodeStepBufferInWorker,
} from '@vajradhir/webgpu-cad-engine';
import { globalCrossProbeBus } from '@vajradhir/crossprobe-bus';
import { WorkspaceId } from '../commandBus';
import { PcbEngineCanvas } from './PcbEngineCanvas';

const SchematicElkCanvas = React.lazy(() =>
  import('./SchematicElkCanvas').then((m) => ({ default: m.SchematicElkCanvas }))
);
const Pcb2DPanel = React.lazy(() =>
  import('./Pcb2DPanel').then((m) => ({ default: m.Pcb2DPanel }))
);
const Schematic2DPanel = React.lazy(() =>
  import('./Schematic2DPanel').then((m) => ({ default: m.Schematic2DPanel }))
);
const Viewport3DPanel = React.lazy(() =>
  import('./Viewport3DPanel').then((m) => ({ default: m.Viewport3DPanel }))
);
const FileExplorerPanel = React.lazy(() =>
  import('./FileExplorerPanel').then((m) => ({ default: m.FileExplorerPanel }))
);
const CodeEditorPanel = React.lazy(() =>
  import('./CodeEditorPanel').then((m) => ({ default: m.CodeEditorPanel }))
);
const TerminalPanel = React.lazy(() =>
  import('./TerminalPanel').then((m) => ({ default: m.TerminalPanel }))
);
const ArchitecturePlannerPanel = React.lazy(() =>
  import('./ArchitecturePlannerPanel').then((m) => ({ default: m.ArchitecturePlannerPanel }))
);
const ComponentLibraryPanel = React.lazy(() =>
  import('./ComponentLibraryPanel').then((m) => ({ default: m.ComponentLibraryPanel }))
);
const UplotScope = React.lazy(() =>
  import('./UplotScope').then((m) => ({ default: m.UplotScope }))
);
const VcdWaveformViewer = React.lazy(() =>
  import('./VcdWaveformViewer').then((m) => ({ default: m.VcdWaveformViewer }))
);
const EeAuditPanel = React.lazy(() =>
  import('./EeAuditPanel').then((m) => ({ default: m.EeAuditPanel }))
);

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
  const [simResult, setSimResult] = useState<{
    phaseMarginDeg: number;
    irDropMv: number;
    bodeFreqKhz: number[];
    bodeGainDb: number[];
  }>({
    phaseMarginDeg: 58.4,
    irDropMv: 14.2,
    bodeFreqKhz: [1, 5, 10, 25, 50, 100, 200, 500],
    bodeGainDb: [38, 28, 21, 11, 2, -6, -15, -24],
  });
  const transientTimeUs = useMemo(() => [0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0], []);
  const transientSwV = useMemo(() => [0.1, 11.8, 12.1, 11.9, 0.2, 0.1, 11.9, 12.0, 0.15], []);

  const [bomQuery, setBomQuery] = useState('');
  const [bomVariant, setBomVariant] = useState<'DEFAULT' | 'PROTO_NO_CAN'>('DEFAULT');
  const [bomAnalytics, setBomAnalytics] = useState<string>(
    'BOM Readiness: 95/100 · Extended Feeder Fees: $3.00 · DFM/DFA/PI Grade: A (100/100/100)'
  );
  const [constraintSummary, setConstraintSummary] = useState<string>(
    'Netclass USB_HS: PASS (skew 80 um <= 250 um)'
  );
  const [bomRows, setBomRows] = useState([
    { refdes: 'U2', mpn: 'TPS54302DDCR', pkg: 'SOT-23-6', feeder: 'Extended (+$3)', qty: 1, side: 'top' },
    { refdes: 'U1', mpn: 'CH224K', pkg: 'ESSOP-10', feeder: 'Basic ($0)', qty: 1, side: 'top' },
    { refdes: 'L1', mpn: 'SWPA4020S4R7MT', pkg: '4x4mm', feeder: 'Basic ($0)', qty: 1, side: 'top' },
    { refdes: 'C1', mpn: 'CL21A226MQQNNNE', pkg: '0805', feeder: 'Basic ($0)', qty: 2, side: 'bottom' },
  ]);
  const [datasheetInfo, setDatasheetInfo] = useState<string>('Select a part row to inspect PDFium datasheet metadata.');

  const [mfgSubTab, setMfgSubTab] = useState<'panel' | 'diff' | 'harness' | 'ibom'>('panel');
  const [pcbEngineMode, setPcbEngineMode] = useState<'kicanvas' | 'webgpu'>('kicanvas');
  const [schEngineMode, setSchEngineMode] = useState<'kicanvas' | 'elkjs' | 'architecture'>('kicanvas');
  const [panelPreview, setPanelPreview] = useState<string>(
    `(kicad_pcb (version 20240108) (generator "vd-panelizer-mit")\n  (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (44 "Edge.Cuts" user))\n  ;; 2x2 Matrix · 5.0 mm breakaway rails · 8 mouse-bites · 3 tooling holes\n)`
  );
  const [diffSummary, setDiffSummary] = useState<string>('vd-pcb-diff: compare rev 1 -> rev 2 via POST /api/v1/diff/compare');
  const [harnessRows, setHarnessRows] = useState([
    { wire: 'W1', route: '18 AWG UL1007 Red', gauge: 'Molex Micro-Fit 3.0', lenMm: 1220 },
    { wire: 'W2', route: '18 AWG UL1007 Black', gauge: 'Molex Micro-Fit 3.0', lenMm: 1220 },
  ]);

  const [stackupInfo, setStackupInfo] = useState<string>('4-Layer FR-4 (1.6 mm) · F.Cu / In1.Cu / In2.Cu / B.Cu');
  const [stepStatus, setStepStatus] = useState<string>(
    `Boundary: ${STEP_WORKER_LICENSE} (${createStepWorkerRequest('enclosure.step', new TextEncoder().encode('ISO-10303-21;')).byteLength} B sample)`
  );
  const [pinmuxC, setPinmuxC] = useState<string>(
    '#define PIN_SWD_SWDIO PA13\n#define PIN_CAN1_TX   PB9\n#define PIN_PD_INT    PA2\n// Z3 SAT: 0 peripheral alternate-function collisions'
  );

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
              data.results.slice(0, 8).map((r: { mpn: string; package?: string; feeder_fee_type?: string }, i: number) => ({
                refdes: `U${i + 1}`,
                mpn: r.mpn,
                pkg: r.package || '0603',
                feeder: String(r.feeder_fee_type || '').toLowerCase() === 'basic' ? 'Basic ($0)' : 'Extended (+$3)',
                qty: 1,
                side: 'top',
              }))
            );
          }
        })
        .catch(() => {});
    } else if (workspace === 'mfg_diff') {
      fetch('/api/v1/panel/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: 2, cols: 2, rail_mm: 5.0 }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((p) => {
          if (p) {
            const mbCount = typeof p.mouse_bites?.count === 'number' ? p.mouse_bites.count : 8;
            const holeCount = Array.isArray(p.tooling_holes) ? p.tooling_holes.length : 4;
            const dims = p.panel_dimensions_mm ? `${p.panel_dimensions_mm.width}x${p.panel_dimensions_mm.height}mm` : '132x92mm';
            setPanelPreview(
              `; Engine: ${p.engine ?? 'vd-panelizer-mit'} | dims=${dims} | mouse_bites=${mbCount} | tooling_holes=${holeCount}\n${p.kicad_pcb_sexpr ?? '(kicad_pcb (version 20240108) (generator "vd-panelizer-mit"))'}`
            );
          }
        })
        .catch(() => {});

      fetch('/api/v1/diff/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rev_old: 1, rev_new: 2 }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => {
          if (d?.summary) setDiffSummary(String(d.summary));
        })
        .catch(() => {});

      fetch('/api/v1/harness/compile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ harness_id: 'WH-001_MAIN_INTERCONNECT' }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((h) => {
          if (Array.isArray(h?.cut_list) && h.cut_list.length) {
            setHarnessRows(
              h.cut_list.slice(0, 6).map(
                (c: { item?: number; wire?: string; terminal?: string; cut_length_mm?: number }, idx: number) => ({
                  wire: `W${c.item ?? idx + 1}`,
                  route: c.wire || '18 AWG UL1007',
                  gauge: c.terminal || 'Molex Micro-Fit',
                  lenMm: Number(c.cut_length_mm ?? 1220),
                })
              )
            );
          }
        })
        .catch(() => {});

      fetch('/api/v1/board')
        .then((r) => (r.ok ? r.json() : null))
        .then((b) => {
          if (Array.isArray(b?.components) && b.components.length) {
            setBomRows(
              b.components.map(
                (c: { refdes: string; mpn?: string; package_name?: string; footprint_ref?: string; side?: string; locked?: number | boolean }) => ({
                  refdes: c.refdes,
                  mpn: c.mpn || c.refdes,
                  pkg: c.package_name || c.footprint_ref || 'SMD',
                  feeder: c.locked ? 'Locked / BOM' : 'Basic ($0)',
                  qty: 1,
                  side: c.side || 'top',
                })
              )
            );
          }
        })
        .catch(() => {});
    } else if (workspace === 'pcb_layout') {
      fetch('/api/v1/constraints/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          netclasses: [{ name: 'USB_HS', min_width_nm: 150000, min_clearance_nm: 150000, max_skew_nm: 250000 }],
          nets: [{ name: 'USB_D', netclass: 'USB_HS', width_nm: 180000, clearance_nm: 180000, p_length_nm: 28080000, n_length_nm: 28000000, er_eff: 3.8 }],
        }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((c) => {
          if (c) {
            setConstraintSummary(`Netclass Check: ${c.passed ? 'PASS' : 'FAIL'} (${c.checked_nets} nets, ${c.violations?.length ?? 0} violations)`);
          }
        })
        .catch(() => {});
    } else if (workspace === 'mcad_3d') {
      fetch('/api/v1/stackup')
        .then((r) => (r.ok ? r.json() : null))
        .then((s) => {
          if (Array.isArray(s?.layers) && s.layers.length) {
            setStackupInfo(`${s.layers.length} layers (${s.total_thickness_mm ?? 1.6} mm) via /api/v1/stackup`);
          }
        })
        .catch(() => {});
    }
  }, [workspace, bomQuery]);

  const inspectDatasheet = async (mpn: string, refdes: string) => {
    globalCrossProbeBus.select([refdes], 'tree');
    try {
      const res = await fetch(`/api/v1/datasheet/preview?mpn=${encodeURIComponent(mpn)}`);
      if (res.ok) {
        const ds = await res.json();
        setDatasheetInfo(`${ds.mpn}: ${ds.pages ?? 32}p via ${ds.rendering_engine ?? 'pypdfium2'}`);
      }
    } catch {
      setDatasheetInfo(`${mpn} selected (daemon offline)`);
    }
  };

  const runLiveSim = async () => {
    try {
      const [pdnRes, bodeRes] = await Promise.all([
        fetch('/api/v1/pdn/solve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ net: '+3V3_OUT', current_a: 3.0 }),
        }),
        fetch('/api/v1/smps/bode-calc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vin: 12.0, vout: 3.3, iout: 2.0, fsw_khz: 500.0, l_uh: 4.7, c_nom_uf: 44.0 }),
        }),
      ]);
      const pdnJson = pdnRes.ok ? await pdnRes.json() : null;
      const bodeJson = bodeRes.ok ? await bodeRes.json() : null;
      setSimResult((prev) => ({
        phaseMarginDeg: Number(bodeJson?.phase_margin_deg ?? prev.phaseMarginDeg),
        irDropMv: Number(pdnJson?.max_ir_drop_mv ?? prev.irDropMv),
        bodeFreqKhz: Array.isArray(bodeJson?.bode_curve) && bodeJson.bode_curve.length
          ? bodeJson.bode_curve.map((pt: { freq_hz: number }) => Number((pt.freq_hz / 1000).toFixed(2)))
          : prev.bodeFreqKhz,
        bodeGainDb: Array.isArray(bodeJson?.bode_curve) && bodeJson.bode_curve.length
          ? bodeJson.bode_curve.map((pt: { mag_db: number }) => Number(pt.mag_db))
          : prev.bodeGainDb,
      }));
    } catch {
      /* Offline deterministic values retained */
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
      /* Offline C header retained */
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <div className="vd-metric" style={{ fontSize: 11, color: 'var(--vd-text-secondary)', padding: '2px 4px' }}>
              {constraintSummary}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                className={`vd-btn ${pcbEngineMode === 'kicanvas' ? 'vd-btn-primary' : ''}`}
                style={{ minHeight: 22, padding: '2px 7px', fontSize: 11 }}
                onClick={() => setPcbEngineMode('kicanvas')}
              >
                KiCanvas 2D
              </button>
              <button
                type="button"
                className={`vd-btn ${pcbEngineMode === 'webgpu' ? 'vd-btn-primary' : ''}`}
                style={{ minHeight: 22, padding: '2px 7px', fontSize: 11 }}
                onClick={() => setPcbEngineMode('webgpu')}
              >
                WebGPU Preview
              </button>
            </div>
          </div>
          {pcbEngineMode === 'kicanvas' ? (
            <Suspense fallback={<div className="vd-metric" style={{ padding: 12 }}>Loading KiCanvas PCB engine...</div>}>
              <Pcb2DPanel
                layersVisible={layersVisible}
                ratsnestVisible={ratsnestVisible}
                lockRingsVisible={lockRingsVisible}
              />
            </Suspense>
          ) : (
            <PcbEngineCanvas
              layersVisible={layersVisible}
              ratsnestVisible={ratsnestVisible}
              lockRingsVisible={lockRingsVisible}
            />
          )}
        </div>
      )}

      {workspace === 'schematic' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, height: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
            <button
              type="button"
              className={`vd-btn ${schEngineMode === 'architecture' ? 'vd-btn-primary' : ''}`}
              style={{ minHeight: 22, padding: '2px 7px', fontSize: 11 }}
              onClick={() => setSchEngineMode('architecture')}
            >
              System Architecture (xyflow)
            </button>
            <button
              type="button"
              className={`vd-btn ${schEngineMode === 'kicanvas' ? 'vd-btn-primary' : ''}`}
              style={{ minHeight: 22, padding: '2px 7px', fontSize: 11 }}
              onClick={() => setSchEngineMode('kicanvas')}
            >
              KiCanvas Schematic
            </button>
            <button
              type="button"
              className={`vd-btn ${schEngineMode === 'elkjs' ? 'vd-btn-primary' : ''}`}
              style={{ minHeight: 22, padding: '2px 7px', fontSize: 11 }}
              onClick={() => setSchEngineMode('elkjs')}
            >
              ELK Flow
            </button>
          </div>
          {schEngineMode === 'architecture' ? (
            <Suspense fallback={<div className="vd-metric" style={{ padding: 12 }}>Loading xyflow System Architecture Planner...</div>}>
              <ArchitecturePlannerPanel />
            </Suspense>
          ) : schEngineMode === 'kicanvas' ? (
            <Suspense fallback={<div className="vd-metric" style={{ padding: 12 }}>Loading KiCanvas schematic renderer...</div>}>
              <Schematic2DPanel />
            </Suspense>
          ) : (
            <Suspense fallback={<div className="vd-metric" style={{ padding: 12 }}>Loading elkjs schematic layout...</div>}>
              <SchematicElkCanvas />
            </Suspense>
          )}
        </div>
      )}

      {workspace === 'sim_lab' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }} className="vd-metric">
            <span>Phase Margin: {simResult.phaseMarginDeg.toFixed(1)} deg · PDN IR-Drop: {simResult.irDropMv.toFixed(1)} mV</span>
            <button type="button" className="vd-btn vd-btn-primary" onClick={() => void runLiveSim()}>
              Solve PDN &amp; Bode
            </button>
          </div>
          <Suspense fallback={<div className="vd-metric" style={{ padding: 12 }}>Loading uPlot oscilloscope...</div>}>
            <UplotScope
              title="SW_NODE Switching Transient & +3V3 Output Ripple (uPlot MIT)"
              xLabel="Time (us)"
              seriesLabel="V_SW (V)"
              xValues={transientTimeUs}
              yValues={transientSwV}
              strokeColor="#E05D44"
            />
            <UplotScope
              title="SMPS Closed-Loop Gain & Crossover (kHz)"
              xLabel="Freq (kHz)"
              seriesLabel="Gain (dB)"
              xValues={simResult.bodeFreqKhz}
              yValues={simResult.bodeGainDb}
              strokeColor="#38BDF8"
            />
            <VcdWaveformViewer />
            <EeAuditPanel />
          </Suspense>
        </div>
      )}

      {workspace === 'library_bom' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Suspense fallback={<div className="vd-metric" style={{ padding: 12 }}>Loading DuckDB Knowledge Graph &amp; Derating Viewer...</div>}>
            <ComponentLibraryPanel
              onPartPlaced={({ refdes, mpn }) => {
                setBomRows((prev) => [
                  ...prev,
                  { refdes, mpn, pkg: 'Imported', feeder: 'Basic ($0)', qty: 1, side: 'top' },
                ]);
              }}
            />
          </Suspense>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
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
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }} className="vd-metric">
              Variant
              <select
                aria-label="Assembly Variant"
                value={bomVariant}
                onChange={(e) => {
                  const next = e.target.value as 'DEFAULT' | 'PROTO_NO_CAN';
                  setBomVariant(next);
                  void fetch('/api/v1/bom/analyze', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      board_count: 5,
                      variant: { name: next, dnp_refdes: next === 'PROTO_NO_CAN' ? ['C1'] : [] },
                      items: bomRows.map((r) => ({
                        refdes: r.refdes,
                        mpn: r.mpn,
                        package: r.pkg,
                        feeder_fee_type: r.feeder.includes('$0') ? 'Basic' : 'Extended',
                        stock_qty: 250,
                        unit_price_usd: 0.45,
                        lifecycle: 'Active',
                        qty: r.qty,
                        alternate_mpns: ['ALT-STD'],
                      })),
                    }),
                  })
                    .then((res) => (res.ok ? res.json() : null))
                    .then((a) => {
                      if (a) {
                        setBomAnalytics(
                          `Variant ${a.variant_name}: Score ${a.supply_readiness_score}/100 · Extended Fee $${a.extended_feeder_fees_usd} · DNP ${a.dnp_excluded_count}`
                        );
                      }
                    })
                    .catch(() => {});
                }}
                style={{
                  padding: '4px 6px',
                  backgroundColor: 'var(--vd-bg-panel)',
                  color: 'var(--vd-text-primary)',
                  border: '1px solid var(--vd-border-subtle)',
                  borderRadius: 4,
                }}
              >
                <option value="DEFAULT">DEFAULT</option>
                <option value="PROTO_NO_CAN">PROTO_NO_CAN</option>
              </select>
            </label>
          </div>
          <div className="vd-metric" style={{ fontSize: 11, color: 'var(--vd-pass)' }}>{bomAnalytics}</div>
          <div className="vd-metric" style={{ fontSize: 11, color: 'var(--vd-text-secondary)' }}>{datasheetInfo}</div>
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
                    style={{ borderBottom: '1px solid var(--vd-border-subtle)' }}
                  >
                    <td style={{ padding: '6px 4px' }}>
                      <button
                        type="button"
                        className="vd-btn"
                        style={{ minHeight: 24, padding: '2px 6px' }}
                        onClick={() => void inspectDatasheet(row.mpn, row.refdes)}
                      >
                        {row.refdes}
                      </button>
                    </td>
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
              {panelPreview}
            </pre>
          )}

          {mfgSubTab === 'diff' && (
            <svg viewBox="0 0 420 140" style={{ width: '100%', maxHeight: 160, backgroundColor: 'var(--vd-bg-panel)', borderRadius: 6, border: '1px solid var(--vd-border-subtle)' }} aria-label="G5B PCB Diff SVG">
              <line x1="30" y1="60" x2="180" y2="60" stroke="var(--vd-fail)" strokeWidth="4" strokeDasharray="6 3" />
              <line x1="30" y1="88" x2="260" y2="88" stroke="var(--vd-pass)" strokeWidth="4" />
              <text x="20" y="28" fill="var(--vd-text-primary)" fontSize="11" fontFamily="var(--vd-font-mono)">{diffSummary}</text>
            </svg>
          )}

          {mfgSubTab === 'harness' && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }} className="vd-metric">
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--vd-text-secondary)', borderBottom: '1px solid var(--vd-border-subtle)' }}>
                  <th style={{ padding: '6px 4px' }}>Wire Item</th>
                  <th style={{ padding: '6px 4px' }}>Wire Spec</th>
                  <th style={{ padding: '6px 4px' }}>Terminal</th>
                  <th style={{ padding: '6px 4px', textAlign: 'right' }}>Cut Length (mm)</th>
                </tr>
              </thead>
              <tbody>
                {harnessRows.map((h) => (
                  <tr key={h.wire} style={{ borderBottom: '1px solid var(--vd-border-subtle)' }}>
                    <td style={{ padding: '5px 4px' }}>{h.wire}</td>
                    <td style={{ padding: '5px 4px' }}>{h.route}</td>
                    <td style={{ padding: '5px 4px' }}>{h.gauge}</td>
                    <td style={{ padding: '5px 4px', textAlign: 'right' }}>{h.lenMm}</td>
                  </tr>
                ))}
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
                  <tr key={`ibom-${row.refdes}`} style={{ borderBottom: '1px solid var(--vd-border-subtle)' }}>
                    <td style={{ padding: '5px 4px' }}>
                      <button
                        type="button"
                        className="vd-btn"
                        style={{ minHeight: 24, padding: '2px 6px' }}
                        onClick={() => globalCrossProbeBus.select([row.refdes], 'pcb')}
                      >
                        {row.refdes}
                      </button>
                    </td>
                    <td style={{ padding: '5px 4px' }}>{row.mpn} ({row.pkg})</td>
                    <td style={{ padding: '5px 4px' }}>{row.side}</td>
                    <td style={{ padding: '5px 4px', textAlign: 'right', color: 'var(--vd-pass)' }}>Ready</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {workspace === 'mcad_3d' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <span className="vd-metric" style={{ fontSize: 12 }}>{stepStatus} · {stackupInfo}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="vd-btn"
                onClick={() => {
                  void fetch('/api/v1/mcad/clearance-drc', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      min_clearance_nm: 500000,
                      pcb_boxes: [{ id: 'L1', min: [10000000, 10000000, 1600000], max: [14000000, 14000000, 3600000] }],
                      enclosure_walls: [{ id: 'TOP_LID', min: [0, 0, 5000000], max: [50000000, 50000000, 6000000] }],
                    }),
                  })
                    .then((r) => (r.ok ? r.json() : null))
                    .then((res) => {
                      if (res) {
                        setStepStatus(`3D STEP Clearance DRC: ${res.passed ? 'PASS' : 'FAIL'} (${res.checked_pairs} pair checked)`);
                      }
                    })
                    .catch(() => {});
                }}
              >
                Run 3D Clearance DRC
              </button>
              <button type="button" className="vd-btn vd-btn-primary" onClick={runStepWorkerDecode}>
                Verify STEP Worker Boundary
              </button>
            </div>
          </div>
          <Suspense fallback={<div className="vd-metric" style={{ padding: 12 }}>Loading Three.js + OCCT STEP 3D Viewport...</div>}>
            <Viewport3DPanel />
          </Suspense>
        </div>
      )}

      {workspace === 'firmware_pinmux' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, height: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="vd-metric" style={{ fontSize: 12 }}>Z3 SMT Pinmux + Monaco IDE + ConPTY · STM32G474 / RP2040</span>
            <button type="button" className="vd-btn vd-btn-primary" onClick={() => void runLivePinmux()}>
              Export board_pins.h
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '210px 1fr', gap: 8, flex: 1, minHeight: 280 }}>
            <Suspense fallback={<div className="vd-metric" style={{ padding: 8 }}>Loading file tree...</div>}>
              <FileExplorerPanel />
            </Suspense>
            <Suspense fallback={<div className="vd-metric" style={{ padding: 8 }}>Loading Monaco Editor...</div>}>
              <CodeEditorPanel />
            </Suspense>
          </div>
          <Suspense fallback={<div className="vd-metric" style={{ padding: 8 }}>Loading PTY Terminal...</div>}>
            <TerminalPanel />
          </Suspense>
          <pre className="vd-metric" style={{ margin: 0, padding: 8, borderRadius: 6, backgroundColor: 'var(--vd-bg-panel)', border: '1px solid var(--vd-border-subtle)', fontSize: 11, maxHeight: 90, overflow: 'auto' }}>
            {pinmuxC}
          </pre>
        </div>
      )}
    </WorkspaceFrame>
  );
};
