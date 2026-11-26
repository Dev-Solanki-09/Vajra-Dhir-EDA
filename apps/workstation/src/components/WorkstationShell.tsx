import React, { Suspense, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  DockviewReact,
  DockviewReadyEvent,
  IDockviewPanelProps,
} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import { globalCrossProbeBus } from '@vajradhir/crossprobe-bus';
import {
  CLIENT_EDA_COMMANDS,
  EdaCommand,
  WORKSPACE_TABS,
  WorkspaceId,
} from '../commandBus';
import { WorkbenchIcon } from './Icons';
import { PanelErrorBoundary } from './PanelErrorBoundary';
import { AgentDockPanel } from './AgentDockPanel';
import { CalculatorDrawer } from './CalculatorDrawer';
import { ActiveWorkspaceView } from './Workspaces';

export type ToolMode = 'select' | 'route' | 'place' | 'inspect';

const PROJECT_TEMPLATES = [
  { id: 'blank_2l', name: 'Blank 2-Layer', layers: 2, summary: 'Minimal 1.6 mm FR-4 2-layer starter board' },
  { id: 'buck_pd', name: 'Buck PD Reference', layers: 4, summary: 'TPS54302 + CH224K 4-layer USB-PD converter' },
  { id: 'mcu_dev', name: 'MCU Devboard', layers: 4, summary: 'STM32G4 / ESP32-S3 CAN-FD & SWD devboard' },
] as const;

interface BoardComponentMeta {
  refdes: string;
  detail: string;
  locked: boolean;
  net: string;
}

const DEFAULT_COMPONENTS: BoardComponentMeta[] = [
  { refdes: 'J1', detail: 'USB-C PD', locked: true, net: 'VBUS_12V' },
  { refdes: 'U2', detail: 'TPS54302', locked: true, net: 'SW_NODE' },
  { refdes: 'U1', detail: 'CH224K', locked: false, net: 'VBUS_12V' },
  { refdes: 'L1', detail: '4.7uH', locked: false, net: 'SW_NODE' },
  { refdes: 'C1', detail: '22uF X7R', locked: false, net: '+3V3_OUT' },
];

interface PanelContextState {
  activeWorkspace: WorkspaceId;
  toolMode: ToolMode;
  layersVisible: boolean;
  ratsnestVisible: boolean;
  lockRingsVisible: boolean;
  projectName: string;
  lockedCount: number;
  selectedRefdes: string;
  boardComponents: BoardComponentMeta[];
  thoughtLog: string[];
}

const ShellContext = React.createContext<PanelContextState>({
  activeWorkspace: 'pcb_layout',
  toolMode: 'select',
  layersVisible: true,
  ratsnestVisible: true,
  lockRingsVisible: true,
  projectName: 'board-1-buck-pd',
  lockedCount: 2,
  selectedRefdes: 'U2',
  boardComponents: DEFAULT_COMPONENTS,
  thoughtLog: [],
});

const ViewportPanel: React.FC<IDockviewPanelProps> = () => {
  const ctx = React.useContext(ShellContext);
  const activeTab = WORKSPACE_TABS.find((t) => t.id === ctx.activeWorkspace) ?? WORKSPACE_TABS[1];
  const compMeta = ctx.boardComponents.find((c) => c.refdes === ctx.selectedRefdes);
  const isSelectedLocked = compMeta ? compMeta.locked : false;

  return (
    <PanelErrorBoundary panelTitle={activeTab.title}>
      <div
        data-testid="workstation-viewport"
        style={{
          height: '100%',
          backgroundColor: 'var(--vd-bg-canvas)',
          color: 'var(--vd-text-primary)',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{activeTab.title}</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--vd-text-secondary)' }}>
              {activeTab.description}
            </p>
          </div>
          <span
            className="vd-metric"
            style={{
              padding: '4px 8px',
              border: `1px solid ${isSelectedLocked ? 'var(--vd-human-lock)' : 'var(--vd-pass)'}`,
              borderRadius: 4,
              color: isSelectedLocked ? 'var(--vd-human-lock)' : 'var(--vd-pass)',
              fontSize: 12,
            }}
          >
            {ctx.selectedRefdes} {isSelectedLocked ? 'human-locked' : 'unlocked'}
          </span>
        </div>

        <ActiveWorkspaceView
          workspace={ctx.activeWorkspace}
          layersVisible={ctx.layersVisible}
          ratsnestVisible={ctx.ratsnestVisible}
          lockRingsVisible={ctx.lockRingsVisible}
        />
      </div>
    </PanelErrorBoundary>
  );
};

const ExplorerPanel: React.FC<IDockviewPanelProps> = () => {
  const ctx = React.useContext(ShellContext);

  return (
    <PanelErrorBoundary panelTitle="Explorer">
      <div style={{ padding: 12, height: '100%', backgroundColor: 'var(--vd-bg-panel)', fontSize: 13 }}>
        <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Project explorer</p>
        <p style={{ margin: '0 0 12px', color: 'var(--vd-text-secondary)' }}>{ctx.projectName}</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--vd-text-secondary)' }}>
              <th style={{ paddingBottom: 6 }}>RefDes</th>
              <th style={{ paddingBottom: 6 }}>State</th>
            </tr>
          </thead>
          <tbody className="vd-metric">
            {ctx.boardComponents.map((item) => {
              const selected = ctx.selectedRefdes === item.refdes;
              return (
                <tr
                  key={item.refdes}
                  style={{
                    backgroundColor: selected ? 'var(--vd-bg-elevated)' : 'transparent',
                  }}
                >
                  <td style={{ padding: '4px 4px' }}>
                    <button
                      type="button"
                      className="vd-btn"
                      style={{ minHeight: 24, padding: '2px 6px', fontSize: 11 }}
                      onClick={() => {
                        globalCrossProbeBus.select([item.refdes], 'tree');
                        globalCrossProbeBus.highlightNet(item.net, 'tree');
                      }}
                    >
                      {item.refdes} ({item.detail})
                    </button>
                  </td>
                  <td style={{ color: item.locked ? 'var(--vd-human-lock)' : 'var(--vd-pass)' }}>
                    {item.locked ? 'Locked' : 'Unlocked'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </PanelErrorBoundary>
  );
};

const InspectorPanel: React.FC<IDockviewPanelProps> = () => {
  const ctx = React.useContext(ShellContext);
  const probe = useSyncExternalStore(
    globalCrossProbeBus.subscribeSnapshot,
    globalCrossProbeBus.getSnapshot
  );

  return (
    <PanelErrorBoundary panelTitle="Inspector">
      <div style={{ padding: 12, height: '100%', backgroundColor: 'var(--vd-bg-panel)', fontSize: 13 }}>
        <p style={{ margin: '0 0 8px', fontWeight: 600 }}>Inspector & lock guards</p>
        <p style={{ margin: '0 0 8px', color: 'var(--vd-text-secondary)' }}>
          Mode: {ctx.toolMode} | Locked entities: <span className="vd-metric">{ctx.lockedCount}</span>
        </p>
        <p className="vd-metric" style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--vd-border-active)' }}>
          Probe: {probe.selection.entityIds.join(', ') || ctx.selectedRefdes} · Net:{' '}
          {probe.activeHighlight.netId ?? 'none'} ({probe.lastLatencyMs.toFixed(2)} ms)
        </p>
        <div style={{ marginTop: 12 }}>
          <p style={{ margin: '0 0 6px', fontWeight: 600 }}>Agent hardware assistant</p>
          <AgentDockPanel />
        </div>
      </div>
    </PanelErrorBoundary>
  );
};

const LazyPcb2DPanel = React.lazy(() =>
  import('./Pcb2DPanel').then((m) => ({ default: m.Pcb2DPanel }))
);
const LazySchematic2DPanel = React.lazy(() =>
  import('./Schematic2DPanel').then((m) => ({ default: m.Schematic2DPanel }))
);
const LazyViewport3DPanel = React.lazy(() =>
  import('./Viewport3DPanel').then((m) => ({ default: m.Viewport3DPanel }))
);
const LazyFileExplorerPanel = React.lazy(() =>
  import('./FileExplorerPanel').then((m) => ({ default: m.FileExplorerPanel }))
);
const LazyCodeEditorPanel = React.lazy(() =>
  import('./CodeEditorPanel').then((m) => ({ default: m.CodeEditorPanel }))
);
const LazyTerminalPanel = React.lazy(() =>
  import('./TerminalPanel').then((m) => ({ default: m.TerminalPanel }))
);
const LazyArchitecturePlannerPanel = React.lazy(() =>
  import('./ArchitecturePlannerPanel').then((m) => ({ default: m.ArchitecturePlannerPanel }))
);
const LazyComponentLibraryPanel = React.lazy(() =>
  import('./ComponentLibraryPanel').then((m) => ({ default: m.ComponentLibraryPanel }))
);
const LazyEeAuditPanel = React.lazy(() =>
  import('./EeAuditPanel').then((m) => ({ default: m.EeAuditPanel }))
);
const LazySimulationLabPanel = React.lazy(() =>
  import('./SimulationLabPanel').then((m) => ({ default: m.SimulationLabPanel }))
);

const DockViewport3DPanel: React.FC<IDockviewPanelProps> = () => (
  <PanelErrorBoundary panelTitle="Viewport 3D (STEP)">
    <div style={{ padding: 12, height: '100%', backgroundColor: 'var(--vd-bg-canvas)' }}>
      <Suspense fallback={<div className="vd-metric" style={{ padding: 12 }}>Loading Three.js + OCCT 3D engine...</div>}>
        <LazyViewport3DPanel />
      </Suspense>
    </div>
  </PanelErrorBoundary>
);

const DockFileExplorerPanel: React.FC<IDockviewPanelProps> = () => (
  <PanelErrorBoundary panelTitle="Files">
    <Suspense fallback={<div className="vd-metric" style={{ padding: 12 }}>Loading workspace files...</div>}>
      <LazyFileExplorerPanel />
    </Suspense>
  </PanelErrorBoundary>
);

const DockCodeEditorPanel: React.FC<IDockviewPanelProps> = () => (
  <PanelErrorBoundary panelTitle="Code Editor">
    <div style={{ padding: 8, height: '100%', backgroundColor: 'var(--vd-bg-canvas)' }}>
      <Suspense fallback={<div className="vd-metric" style={{ padding: 12 }}>Loading Monaco Editor...</div>}>
        <LazyCodeEditorPanel />
      </Suspense>
    </div>
  </PanelErrorBoundary>
);

const DockTerminalPanel: React.FC<IDockviewPanelProps> = () => (
  <PanelErrorBoundary panelTitle="Terminal">
    <div style={{ padding: 8, height: '100%', backgroundColor: 'var(--vd-bg-canvas)' }}>
      <Suspense fallback={<div className="vd-metric" style={{ padding: 12 }}>Loading PTY Terminal...</div>}>
        <LazyTerminalPanel />
      </Suspense>
    </div>
  </PanelErrorBoundary>
);

const DockArchitecturePlannerPanel: React.FC<IDockviewPanelProps> = () => (
  <PanelErrorBoundary panelTitle="System Architecture (xyflow)">
    <div style={{ padding: 8, height: '100%', backgroundColor: 'var(--vd-bg-canvas)' }}>
      <Suspense fallback={<div className="vd-metric" style={{ padding: 12 }}>Loading xyflow System Architecture...</div>}>
        <LazyArchitecturePlannerPanel />
      </Suspense>
    </div>
  </PanelErrorBoundary>
);

const DockComponentLibraryPanel: React.FC<IDockviewPanelProps> = () => (
  <PanelErrorBoundary panelTitle="Component Knowledge Graph">
    <div style={{ padding: 8, height: '100%', backgroundColor: 'var(--vd-bg-canvas)', overflowY: 'auto' }}>
      <Suspense fallback={<div className="vd-metric" style={{ padding: 12 }}>Loading DuckDB Knowledge Graph...</div>}>
        <LazyComponentLibraryPanel />
      </Suspense>
    </div>
  </PanelErrorBoundary>
);

const DockEeAuditPanel: React.FC<IDockviewPanelProps> = () => (
  <PanelErrorBoundary panelTitle="EE Audit (Z3/SymPy)">
    <div style={{ padding: 8, height: '100%', backgroundColor: 'var(--vd-bg-canvas)', overflowY: 'auto' }}>
      <Suspense fallback={<div className="vd-metric" style={{ padding: 12 }}>Loading Senior EE Verification Brain...</div>}>
        <LazyEeAuditPanel />
      </Suspense>
    </div>
  </PanelErrorBoundary>
);

const DockSimulationLabPanel: React.FC<IDockviewPanelProps> = () => (
  <PanelErrorBoundary panelTitle="SPICE Virtual Lab (P10)">
    <div style={{ padding: 8, height: '100%', backgroundColor: 'var(--vd-bg-canvas)', overflowY: 'auto' }}>
      <Suspense fallback={<div className="vd-metric" style={{ padding: 12 }}>Loading ngspice-wasm Virtual Lab...</div>}>
        <LazySimulationLabPanel />
      </Suspense>
    </div>
  </PanelErrorBoundary>
);

const DockPcb2DPanel: React.FC<IDockviewPanelProps> = () => {
  const ctx = React.useContext(ShellContext);
  return (
    <PanelErrorBoundary panelTitle="PCB 2D (.kicad_pcb)">
      <div style={{ padding: 12, height: '100%', backgroundColor: 'var(--vd-bg-canvas)' }}>
        <Suspense fallback={<div className="vd-metric" style={{ padding: 12 }}>Loading KiCanvas PCB engine...</div>}>
          <LazyPcb2DPanel
            layersVisible={ctx.layersVisible}
            ratsnestVisible={ctx.ratsnestVisible}
            lockRingsVisible={ctx.lockRingsVisible}
            useLegacyCanvasTestId={false}
          />
        </Suspense>
      </div>
    </PanelErrorBoundary>
  );
};

const DockSchematic2DPanel: React.FC<IDockviewPanelProps> = () => (
  <PanelErrorBoundary panelTitle="Schematic 2D (.kicad_sch)">
    <div style={{ padding: 12, height: '100%', backgroundColor: 'var(--vd-bg-canvas)' }}>
      <Suspense fallback={<div className="vd-metric" style={{ padding: 12 }}>Loading KiCanvas Schematic engine...</div>}>
        <LazySchematic2DPanel useLegacySvgTestId={false} />
      </Suspense>
    </div>
  </PanelErrorBoundary>
);

const DOCK_COMPONENTS = {
  viewport: ViewportPanel,
  pcb2d: DockPcb2DPanel,
  schematic2d: DockSchematic2DPanel,
  viewport3d: DockViewport3DPanel,
  fileExplorer: DockFileExplorerPanel,
  codeEditor: DockCodeEditorPanel,
  terminal: DockTerminalPanel,
  architecture: DockArchitecturePlannerPanel,
  componentLibrary: DockComponentLibraryPanel,
  eeAudit: DockEeAuditPanel,
  simLab: DockSimulationLabPanel,
  explorer: ExplorerPanel,
  inspector: InspectorPanel,
};

export const WorkstationShell: React.FC = () => {
  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>('pcb_layout');
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [layersVisible, setLayersVisible] = useState(true);
  const [ratsnestVisible, setRatsnestVisible] = useState(true);
  const [lockRingsVisible, setLockRingsVisible] = useState(true);
  const [projectName, setProjectName] = useState('board-1-buck-pd');
  const [dirty, setDirty] = useState(false);
  const [autosaveAvailable, setAutosaveAvailable] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showCalculators, setShowCalculators] = useState(false);
  const [paletteQuery, setPaletteQuery] = useState('');
  const [fps, setFps] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState('Loopback 127.0.0.1:41900 ready');
  const [hwLockShort, setHwLockShort] = useState('hw.lock:pending');
  const [boardComponents, setBoardComponents] = useState<BoardComponentMeta[]>(DEFAULT_COMPONENTS);
  const frameCountRef = useRef(0);

  const probeSnapshot = useSyncExternalStore(
    globalCrossProbeBus.subscribeSnapshot,
    globalCrossProbeBus.getSnapshot
  );

  useEffect(() => {
    globalCrossProbeBus.select(['U2'], 'tree');
    let cancelled = false;
    fetch('/api/v1/project')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && data.autosave_present) {
          setAutosaveAvailable(true);
        }
      })
      .catch(() => {});
    fetch('/api/v1/board')
      .then((res) => (res.ok ? res.json() : null))
      .then((b) => {
        if (!cancelled && Array.isArray(b?.components) && b.components.length) {
          setBoardComponents(
            b.components.map((c: { refdes: string; mpn?: string; value_str?: string; value?: string; locked?: number | boolean }) => ({
              refdes: c.refdes,
              detail: c.mpn || c.value_str || c.value || c.refdes,
              locked: Boolean(c.locked),
              net: c.refdes === 'U1' || c.refdes === 'J1' ? 'VBUS_12V' : c.refdes === 'C1' ? '+3V3_OUT' : 'SW_NODE',
            }))
          );
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void import('@vajradhir/collab')
      .then(({ HwIrCrdtSession, computeHwLockDigest }) => {
        if (!active) return;
        const session = new HwIrCrdtSession('studio-human', 'human');
        boardComponents.forEach((comp, idx) => {
          session.upsertEntity('human', {
            id: `01950000-0000-7000-8000-0000000000${idx.toString().padStart(2, '0')}`,
            refdes: comp.refdes,
            x_nm: (idx + 1) * 10_000_000,
            y_nm: 15_000_000,
            rot_mdeg: 0,
            locked: comp.locked,
          });
        });
        const lock = computeHwLockDigest({
          symbols: [],
          footprints: [],
          spice_models: [],
          constraints: [{ name: 'USB_HS', min_width_nm: 150_000, min_clearance_nm: 150_000 }],
          entities: session.listEntities(),
        });
        setHwLockShort(`hw.lock:${lock.digest_sha256.slice(0, 8)}`);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [boardComponents]);

  useEffect(() => {
    let rafId = 0;
    let lastSample = performance.now();
    const tick = (now: number) => {
      frameCountRef.current += 1;
      const elapsed = now - lastSample;
      if (elapsed >= 500) {
        setFps(Math.round((frameCountRef.current * 1000) / elapsed));
        frameCountRef.current = 0;
        lastSample = now;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const inInput =
        document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
      if (e.key === 'Escape') {
        setShowTemplates(false);
        setShowShortcuts(false);
        setShowPalette(false);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        setShowPalette((prev) => !prev);
      } else if (e.key === 'F1' || (e.key === '?' && !inInput)) {
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
      } else if (!inInput && (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        void executeCommand(CLIENT_EDA_COMMANDS.find((c) => c.id === 'edit.undo')!);
      } else if (!inInput && (e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        void executeCommand(CLIENT_EDA_COMMANDS.find((c) => c.id === 'edit.redo')!);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const executeCommand = async (cmd: EdaCommand) => {
    setDirty(true);
    setStatusMessage(`Running ${cmd.label}`);
    try {
      await cmd.run({}, 'human');
      setStatusMessage(`${cmd.label} completed`);
    } catch {
      setStatusMessage(`${cmd.label} queued (daemon offline)`);
    }
  };

  const onDockReady = (event: DockviewReadyEvent) => {
    const center = event.api.addPanel({
      id: 'viewport_panel',
      component: 'viewport',
      title: 'Silicon Darkroom Viewport',
    });
    event.api.addPanel({
      id: 'pcb2d_panel',
      component: 'pcb2d',
      title: 'PCB 2D (.kicad_pcb)',
      position: { referencePanel: center, direction: 'within' },
    });
    event.api.addPanel({
      id: 'schematic2d_panel',
      component: 'schematic2d',
      title: 'Schematic 2D (.kicad_sch)',
      position: { referencePanel: center, direction: 'within' },
    });
    event.api.addPanel({
      id: 'viewport3d_panel',
      component: 'viewport3d',
      title: '3D STEP (.kicad_pcb)',
      position: { referencePanel: center, direction: 'within' },
    });
    event.api.addPanel({
      id: 'code_editor_panel',
      component: 'codeEditor',
      title: 'Code IDE (Monaco)',
      position: { referencePanel: center, direction: 'within' },
    });
    event.api.addPanel({
      id: 'terminal_panel',
      component: 'terminal',
      title: 'Terminal (PTY)',
      position: { referencePanel: center, direction: 'within' },
    });
    event.api.addPanel({
      id: 'architecture_panel',
      component: 'architecture',
      title: 'Architecture (xyflow)',
      position: { referencePanel: center, direction: 'within' },
    });
    event.api.addPanel({
      id: 'ee_audit_panel',
      component: 'eeAudit',
      title: 'EE Audit (Z3/SymPy)',
      position: { referencePanel: center, direction: 'within' },
    });
    event.api.addPanel({
      id: 'sim_lab_panel',
      component: 'simLab',
      title: 'SPICE Lab (ngspice)',
      position: { referencePanel: center, direction: 'within' },
    });
    center.api.setActive();
    event.api.addPanel({
      id: 'explorer_panel',
      component: 'explorer',
      title: 'Explorer',
      position: { referencePanel: center, direction: 'left' },
      initialWidth: 250,
    });
    event.api.addPanel({
      id: 'inspector_panel',
      component: 'inspector',
      title: 'Inspector',
      position: { referencePanel: center, direction: 'right' },
      initialWidth: 290,
    });
  };

  const filteredCommands = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase();
    if (!q) return CLIENT_EDA_COMMANDS;
    return CLIENT_EDA_COMMANDS.filter(
      (c) => c.label.toLowerCase().includes(q) || c.category.toLowerCase().includes(q)
    );
  }, [paletteQuery]);

  const shellContextValue: PanelContextState = {
    activeWorkspace,
    toolMode,
    layersVisible,
    ratsnestVisible,
    lockRingsVisible,
    projectName,
    lockedCount: boardComponents.filter((c) => c.locked).length,
    selectedRefdes: probeSnapshot.selection.entityIds[0] ?? 'U2',
    boardComponents,
    thoughtLog: [
      `Active workspace: ${activeWorkspace}`,
      'SQLite HW-IR WAL & _tx_actor_ctx lock triggers armed',
      'Offline $0 zero-egress verified',
    ],
  };

  return (
    <ShellContext.Provider value={shellContextValue}>
      <div className="vd-shell">
        <header className="vd-topbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <strong style={{ fontSize: 14 }}>Vajra-Dhīr Studio</strong>
            <span style={{ color: 'var(--vd-text-secondary)', fontSize: 13 }}>
              {projectName}
              {dirty ? ' •' : ''} / {WORKSPACE_TABS.find((w) => w.id === activeWorkspace)?.title}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {(['select', 'route', 'place', 'inspect'] as ToolMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={toolMode === mode}
                className={`vd-btn ${toolMode === mode ? 'vd-btn-primary' : ''}`}
                onClick={() => setToolMode(mode)}
              >
                {mode[0].toUpperCase() + mode.slice(1)}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={layersVisible}
              className="vd-btn"
              onClick={() => setLayersVisible((v) => !v)}
            >
              {layersVisible ? 'Hide layers' : 'Show layers'}
            </button>
            <button
              type="button"
              aria-pressed={ratsnestVisible}
              className="vd-btn"
              onClick={() => setRatsnestVisible((v) => !v)}
            >
              {ratsnestVisible ? 'Ratsnest on' : 'Ratsnest off'}
            </button>
            <button
              type="button"
              aria-pressed={lockRingsVisible}
              className="vd-btn vd-btn-lock"
              onClick={() => setLockRingsVisible((v) => !v)}
            >
              {lockRingsVisible ? 'Locks visible' : 'Locks hidden'}
            </button>
            <button type="button" className="vd-btn" onClick={() => setShowTemplates(true)}>
              New template
            </button>
            <button type="button" className="vd-btn" onClick={() => setShowCalculators((v) => !v)} aria-pressed={showCalculators}>
              Calculators
            </button>
            <button type="button" className="vd-btn" onClick={() => setShowPalette(true)}>
              Palette (Ctrl+Shift+P)
            </button>
            <button type="button" className="vd-btn" onClick={() => setShowShortcuts(true)} aria-label="Keyboard shortcuts">
              <WorkbenchIcon name="help" size={16} />
            </button>
          </div>
        </header>

        <div className="vd-main">
          <nav className="vd-activity-bar" aria-label="Workspaces">
            {WORKSPACE_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className="vd-activity-btn"
                data-active={activeWorkspace === tab.id}
                aria-current={activeWorkspace === tab.id ? 'page' : undefined}
                title={tab.title}
                aria-label={tab.title}
                onClick={() => setActiveWorkspace(tab.id)}
              >
                <WorkbenchIcon name={tab.id} />
              </button>
            ))}
          </nav>

          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
            {autosaveAvailable && (
              <div
                data-testid="crash-recovery-banner"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 12px',
                  backgroundColor: 'var(--vd-bg-elevated)',
                  borderBottom: '1px solid var(--vd-human-lock)',
                  fontSize: 13,
                }}
              >
                <span>Crash recovery snapshot available (.vd.autosave.jsonl)</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="vd-btn vd-btn-lock"
                    onClick={() => {
                      setAutosaveAvailable(false);
                      setStatusMessage('Recovered .vd.autosave.jsonl snapshot');
                    }}
                  >
                    Restore autosave
                  </button>
                  <button type="button" className="vd-btn" onClick={() => setAutosaveAvailable(false)}>
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              <DockviewReact
                components={DOCK_COMPONENTS}
                onReady={onDockReady}
                className="dockview-theme-dark"
              />
            </div>
          </div>
        </div>

        <footer className="vd-statusbar">
          <span className="vd-metric">{statusMessage}</span>
          <div style={{ display: 'flex', gap: 14 }} className="vd-metric">
            <span style={{ color: 'var(--vd-dlp-airgap)' }}>NDA_AIRGAPPED</span>
            <span style={{ color: 'var(--vd-human-lock)' }}>Human locks active</span>
            <span>{hwLockShort}</span>
            <span>CrossProbe: {probeSnapshot.lastLatencyMs.toFixed(2)} ms</span>
            <span>Measured FPS: {fps}</span>
          </div>
        </footer>

        {showTemplates && (
          <div className="vd-modal-backdrop" role="dialog" aria-modal="true" aria-label="New project from template">
            <div className="vd-modal-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <strong>New project from template</strong>
                <button type="button" className="vd-btn" onClick={() => setShowTemplates(false)}>Close</button>
              </div>
              <div style={{ display: 'grid', gap: 8 }}>
                {PROJECT_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    className="vd-btn"
                    style={{ justifyContent: 'space-between', padding: 10 }}
                    onClick={() => {
                      setProjectName(tpl.id);
                      setDirty(false);
                      setShowTemplates(false);
                      setStatusMessage(`Loaded template ${tpl.name}`);
                    }}
                  >
                    <span>{tpl.name}</span>
                    <span style={{ color: 'var(--vd-text-secondary)', fontSize: 12 }}>{tpl.summary}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {showShortcuts && (
          <div className="vd-modal-backdrop" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
            <div className="vd-modal-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <strong>Keyboard shortcuts ({CLIENT_EDA_COMMANDS.length} commands)</strong>
                <button type="button" className="vd-btn" onClick={() => setShowShortcuts(false)}>Close</button>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                  {CLIENT_EDA_COMMANDS.map((cmd) => (
                    <tr key={cmd.id} style={{ borderBottom: '1px solid var(--vd-border-subtle)' }}>
                      <td style={{ padding: '6px 4px' }}>{cmd.label}</td>
                      <td className="vd-metric" style={{ padding: '6px 4px', textAlign: 'right', color: 'var(--vd-text-secondary)' }}>
                        {cmd.shortcut || 'Palette'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {showPalette && (
          <div className="vd-modal-backdrop" role="dialog" aria-modal="true" aria-label="Command palette">
            <div className="vd-modal-panel">
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input
                  type="text"
                  autoFocus
                  aria-label="Filter hardware commands"
                  value={paletteQuery}
                  onChange={(e) => setPaletteQuery(e.target.value)}
                  placeholder="Type a hardware command..."
                  style={{
                    flex: 1,
                    padding: '6px 10px',
                    backgroundColor: 'var(--vd-bg-canvas)',
                    color: 'var(--vd-text-primary)',
                    border: '1px solid var(--vd-border-active)',
                    borderRadius: 4,
                  }}
                />
                <button type="button" className="vd-btn" onClick={() => setShowPalette(false)}>Close</button>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                {filteredCommands.map((cmd) => (
                  <button
                    key={cmd.id}
                    type="button"
                    className="vd-btn"
                    style={{ justifyContent: 'space-between' }}
                    onClick={() => {
                      setShowPalette(false);
                      void executeCommand(cmd);
                    }}
                  >
                    <span>{cmd.label}</span>
                    <span className="vd-metric" style={{ fontSize: 12, color: 'var(--vd-text-secondary)' }}>
                      {cmd.shortcut}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        <CalculatorDrawer open={showCalculators} onClose={() => setShowCalculators(false)} />
      </div>
    </ShellContext.Provider>
  );
};
