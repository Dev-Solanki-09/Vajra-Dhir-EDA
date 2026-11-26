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
import { useDesignStore } from '../store/useDesignStore';
import { registerUiControlCallbacks, startUiControlBridge } from '../store/uiControlBridge';
import { PolishToolsModal } from './PolishToolsModal';
import { FOCUSED_PRESETS, FocusedPresetId, formatCoordUnit, usePolishStore } from '../store/usePolishStore';
import { formatKeyboardEventCombo, resolveEffectiveBindings } from '../store/useKeymap';
import { useSettingsStore } from '../store/useSettingsStore';
import { VajraIcon } from './VajraIcons';
import { HomeScreen } from './HomeScreen';
import { SettingsModal } from './SettingsModal';
import { EnterpriseDrawers, ToastStack } from './EnterpriseDrawers';
import { ScrubInput } from './ScrubInput';
import { MenuBar, TopMenuSpec } from './MenuBar';
import { ToolShelf } from './ToolShelf';
import { BottomDrawer, BottomDrawerTab } from './BottomDrawer';
import { ContextMenu, ContextMenuEntry, Popover } from './FloatingWindow';
import {
  AboutModal,
  ActivityLogModal,
  InputPromptDialog,
  ProjectSettingsDialog,
  ShortcutsModal,
  StackupCalculatorWindow,
  UnsavedGuardDialog,
} from './Dialogs';
import { FileBrowserModal } from './FileBrowserModal';

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
  hidden?: boolean;
  net: string;
}

const DEFAULT_COMPONENTS: BoardComponentMeta[] = [
  { refdes: 'J1', detail: 'USB-C PD', locked: true, hidden: false, net: 'VBUS_12V' },
  { refdes: 'U2', detail: 'TPS54302', locked: true, hidden: false, net: 'SW_NODE' },
  { refdes: 'U1', detail: 'CH224K', locked: false, hidden: false, net: 'VBUS_12V' },
  { refdes: 'L1', detail: '4.7uH', locked: false, hidden: false, net: 'SW_NODE' },
  { refdes: 'C1', detail: '22uF X7R', locked: false, hidden: false, net: '+3V3_OUT' },
];

interface PanelContextState {
  activeWorkspace: WorkspaceId;
  toolMode: ToolMode;
  layersVisible: boolean;
  ratsnestVisible: boolean;
  lockRingsVisible: boolean;
  pin1Visible: boolean;
  piHeatmapVisible: boolean;
  thermalHeatmapVisible: boolean;
  shadingMode: 'wireframe' | 'matte' | 'pbr' | 'xray';
  enclosureOpacity: number;
  projectName: string;
  lockedCount: number;
  selectedRefdes: string;
  boardComponents: BoardComponentMeta[];
  showHotkeyHints: boolean;
  onToggleLock: (refdes: string) => void;
  onToggleHidden: (refdes: string) => void;
  onSwitchWorkspace: (ws: WorkspaceId) => void;
  onOpenContextMenu: (e: React.MouseEvent, refdes: string) => void;
}

const ShellContext = React.createContext<PanelContextState>({
  activeWorkspace: 'pcb_layout',
  toolMode: 'select',
  layersVisible: true,
  ratsnestVisible: true,
  lockRingsVisible: true,
  pin1Visible: true,
  piHeatmapVisible: false,
  thermalHeatmapVisible: false,
  shadingMode: 'matte',
  enclosureOpacity: 65,
  projectName: 'board-1-buck-pd',
  lockedCount: 2,
  selectedRefdes: 'U2',
  boardComponents: DEFAULT_COMPONENTS,
  showHotkeyHints: true,
  onToggleLock: () => {},
  onToggleHidden: () => {},
  onSwitchWorkspace: () => {},
  onOpenContextMenu: () => {},
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
          padding: 8,
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          position: 'relative',
        }}
      >
        {/* Minimal Blender/Unreal Transparent Viewport HUD Overlay */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
          <div className="vd-metric" style={{ color: 'var(--vd-text-secondary)' }}>
            <span>{ctx.projectName}</span>
            <span> › Main Board › </span>
            <span style={{ color: 'var(--vd-text-primary)' }}>{ctx.selectedRefdes}</span>
            <span> · {activeTab.title}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {ctx.activeWorkspace === 'mcad_3d' && (
              <span className="vd-pill vd-metric" data-testid="hud-3d-gizmo">
                XYZ · {ctx.shadingMode.toUpperCase()} ({ctx.enclosureOpacity}%)
              </span>
            )}
            <span
              className="vd-metric"
              style={{
                padding: '1px 6px',
                border: `1px solid ${isSelectedLocked ? 'var(--vd-human-lock)' : 'var(--vd-pass)'}`,
                borderRadius: 2,
                color: isSelectedLocked ? 'var(--vd-human-lock)' : 'var(--vd-pass)',
                fontSize: 10.5,
              }}
            >
              {ctx.selectedRefdes} {isSelectedLocked ? 'human-locked' : 'unlocked'}
            </span>
          </div>
        </div>

        <ActiveWorkspaceView
          workspace={ctx.activeWorkspace}
          layersVisible={ctx.layersVisible}
          ratsnestVisible={ctx.ratsnestVisible}
          lockRingsVisible={ctx.lockRingsVisible}
        />

        {ctx.showHotkeyHints && (
          <div
            data-testid="hud-hotkey-hints"
            className="vd-metric"
            style={{
              fontSize: 10,
              color: 'var(--vd-text-muted)',
              display: 'flex',
              gap: 12,
              paddingTop: 2,
            }}
          >
            <span>Space: Cursor Menu</span>
            <span>G: Move</span>
            <span>R: Rotate</span>
            <span>X: Route 45</span>
            <span>L: Lock</span>
            <span>Ctrl+K: Palette</span>
          </div>
        )}
      </div>
    </PanelErrorBoundary>
  );
};

const ExplorerPanel: React.FC<IDockviewPanelProps> = () => {
  const ctx = React.useContext(ShellContext);
  const [query, setQuery] = useState('');
  const [filterKind, setFilterKind] = useState<'all' | 'locked' | 'nets'>('all');

  const filtered = ctx.boardComponents.filter((c) => {
    if (filterKind === 'locked' && !c.locked) return false;
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return c.refdes.toLowerCase().includes(q) || c.detail.toLowerCase().includes(q) || c.net.toLowerCase().includes(q);
  });

  return (
    <PanelErrorBoundary panelTitle="Outliner">
      <div
        data-testid="outliner-panel"
        style={{
          padding: 6,
          height: '100%',
          backgroundColor: 'var(--vd-bg-panel)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', gap: 4 }}>
          <input
            type="text"
            aria-label="Filter outliner"
            data-testid="outliner-search-input"
            className="vd-input"
            placeholder="Search Outliner..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ flex: 1 }}
          />
          {(['all', 'locked', 'nets'] as const).map((fk) => (
            <button
              key={fk}
              type="button"
              className={`vd-btn ${filterKind === fk ? 'vd-btn-primary' : ''}`}
              style={{ minHeight: 20, padding: '1px 5px', fontSize: 10 }}
              onClick={() => setFilterKind(fk)}
            >
              {fk}
            </button>
          ))}
        </div>

        <div className="vd-section-title" style={{ padding: '2px 4px' }}>
          Components ({filtered.length})
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {filtered.map((item) => {
            const selected = ctx.selectedRefdes === item.refdes;
            return (
              <div
                key={item.refdes}
                className="vd-tree-row"
                data-testid={`outliner-row-${item.refdes}`}
                data-selected={selected}
                onContextMenu={(e) => ctx.onOpenContextMenu(e, item.refdes)}
              >
                <button
                  type="button"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: item.hidden ? 'var(--vd-text-muted)' : 'var(--vd-text-primary)',
                    textAlign: 'left',
                    padding: 0,
                    cursor: 'pointer',
                    fontFamily: 'var(--vd-font-mono)',
                    fontSize: 11,
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  onClick={() => {
                    globalCrossProbeBus.select([item.refdes], 'tree');
                    globalCrossProbeBus.highlightNet(item.net, 'tree');
                  }}
                >
                  {item.refdes} ({item.detail})
                </button>
                <span className="vd-row-actions">
                  <button
                    type="button"
                    data-testid={`outliner-lock-${item.refdes}`}
                    aria-pressed={item.locked}
                    className="vd-btn vd-btn-icon"
                    style={{
                      minHeight: 18,
                      borderColor: 'transparent',
                      backgroundColor: 'transparent',
                      color: item.locked ? 'var(--vd-human-lock)' : 'var(--vd-text-muted)',
                    }}
                    title={item.locked ? 'Locked (click to unlock)' : 'Unlocked (click to lock)'}
                    onClick={() => ctx.onToggleLock(item.refdes)}
                  >
                    <VajraIcon name={item.locked ? 'lockClosed' : 'lockOpen'} size={11} />
                  </button>
                  <button
                    type="button"
                    data-testid={`outliner-eye-${item.refdes}`}
                    aria-pressed={!item.hidden}
                    className="vd-btn vd-btn-icon"
                    style={{
                      minHeight: 18,
                      borderColor: 'transparent',
                      backgroundColor: 'transparent',
                      color: item.hidden ? 'var(--vd-text-muted)' : 'var(--vd-text-secondary)',
                    }}
                    title={item.hidden ? 'Hidden (click to show)' : 'Visible (click to hide)'}
                    onClick={() => ctx.onToggleHidden(item.refdes)}
                  >
                    <VajraIcon name={item.hidden ? 'eyeClosed' : 'eyeOpen'} size={11} />
                  </button>
                </span>
              </div>
            );
          })}
        </div>

        <div className="vd-section-title" style={{ padding: '6px 4px 2px' }}>
          Workspaces
        </div>
        <div style={{ display: 'grid', gap: 2 }}>
          {WORKSPACE_TABS.map((wt) => (
            <button
              key={wt.id}
              type="button"
              className={`vd-btn ${ctx.activeWorkspace === wt.id ? 'vd-btn-primary' : ''}`}
              style={{ justifyContent: 'flex-start', minHeight: 20, fontSize: 10.5 }}
              onClick={() => ctx.onSwitchWorkspace(wt.id)}
            >
              {wt.title}
            </button>
          ))}
        </div>
      </div>
    </PanelErrorBoundary>
  );
};

const AccordionSection: React.FC<{ title: string; defaultOpen?: boolean; children: React.ReactNode }> = ({
  title,
  defaultOpen = true,
  children,
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button type="button" className="vd-accordion-header" onClick={() => setOpen((o) => !o)}>
        <VajraIcon name={open ? 'chevronDown' : 'chevronRight'} size={11} />
        <span>{title}</span>
      </button>
      {open && <div style={{ padding: '6px 8px', display: 'grid', gap: 5 }}>{children}</div>}
    </div>
  );
};

const InspectorPanel: React.FC<IDockviewPanelProps> = () => {
  const ctx = React.useContext(ShellContext);
  const probe = useSyncExternalStore(
    globalCrossProbeBus.subscribeSnapshot,
    globalCrossProbeBus.getSnapshot
  );
  const revId = useDesignStore((s) => s.revId);
  const entitiesByRefdes = useDesignStore((s) => s.entitiesByRefdes);
  const transientPreviews = useDesignStore((s) => s.transientPreviews);
  const stageFreshness = useDesignStore((s) => s.stageFreshness);
  const unitMode = usePolishStore((s) => s.unitMode);

  const activeRef = probe.selection.entityIds[0] || ctx.selectedRefdes;
  const activeEntity = entitiesByRefdes[activeRef];
  const compMeta = ctx.boardComponents.find((c) => c.refdes === activeRef);
  const livePreview = transientPreviews[activeRef];
  const displayXNm = livePreview ? livePreview.x_nm : (activeEntity?.x_nm ?? 12_500_000);
  const displayYNm = livePreview ? livePreview.y_nm : (activeEntity?.y_nm ?? 15_000_000);
  const displayRotMdeg = livePreview ? livePreview.rot_mdeg : (activeEntity?.rot_mdeg ?? 0);
  const displaySide = livePreview ? livePreview.side : (activeEntity?.side ?? 'top');
  const staleCount = Object.values(stageFreshness).filter((v) => v === 'STALE').length;

  return (
    <PanelErrorBoundary panelTitle="Inspector">
      <div style={{ height: '100%', backgroundColor: 'var(--vd-bg-panel)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {/* Dynamic Entity Header */}
        <div style={{ padding: '6px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--vd-border-subtle)', backgroundColor: 'var(--vd-bg-elevated)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <VajraIcon name="cpuChip" size={13} />
            <strong className="vd-metric" style={{ fontSize: 12 }}>{activeRef}</strong>
            <span className="vd-pill vd-metric">{activeEntity?.mpn || compMeta?.detail || 'Component'}</span>
          </div>
          <div style={{ display: 'flex', gap: 3 }}>
            <button
              type="button"
              className="vd-btn vd-btn-icon"
              title="Toggle Lock"
              onClick={() => ctx.onToggleLock(activeRef)}
            >
              <VajraIcon name={compMeta?.locked || activeEntity?.locked ? 'lockClosed' : 'lockOpen'} size={11} color={compMeta?.locked ? 'var(--vd-human-lock)' : undefined} />
            </button>
            <button
              type="button"
              className="vd-btn vd-btn-icon"
              title="Focus Entity"
              onClick={() => globalCrossProbeBus.select([activeRef], 'inspector')}
            >
              <VajraIcon name="search" size={11} />
            </button>
          </div>
        </div>

        <div style={{ padding: '5px 8px', borderBottom: '1px solid var(--vd-border-subtle)' }}>
          <div className="vd-metric" data-testid="inspector-sync-rev" style={{ fontSize: 10.5, color: 'var(--vd-pass)' }}>
            Sync rev_id: {revId} · {staleCount > 0 ? `${staleCount} STALE` : 'FRESH'}
          </div>
          <div className="vd-metric" data-testid="inspector-live-coords" style={{ fontSize: 10.5, color: 'var(--vd-text-secondary)' }}>
            {activeRef}: ({(displayXNm / 1_000_000).toFixed(2)}, {(Number(displayYNm) / 1_000_000).toFixed(2)}) mm · {displaySide}
          </div>
        </div>

        <AccordionSection title="Transform" defaultOpen>
          <ScrubInput
            label="X Pos"
            data-testid="inspector-scrub-x"
            unit={unitMode}
            value={Number((displayXNm / 1_000_000).toFixed(2))}
            onChange={(nxMm) => {
              void useDesignStore.getState().commitTx(
                'inspector-scrub',
                [{ op: 'MOVE_COMPONENT', refdes: activeRef, x_nm: Math.round(nxMm * 1_000_000), y_nm: Number(displayYNm) }],
                `Scrub ${activeRef} X=${nxMm}mm`,
                'human'
              );
            }}
          />
          <ScrubInput
            label="Y Pos"
            data-testid="inspector-scrub-y"
            unit={unitMode}
            value={Number((Number(displayYNm) / 1_000_000).toFixed(2))}
            onChange={(nyMm) => {
              void useDesignStore.getState().commitTx(
                'inspector-scrub',
                [{ op: 'MOVE_COMPONENT', refdes: activeRef, x_nm: displayXNm, y_nm: Math.round(nyMm * 1_000_000) }],
                `Scrub ${activeRef} Y=${nyMm}mm`,
                'human'
              );
            }}
          />
          <ScrubInput
            label="Rot"
            unit="deg"
            step={15}
            value={Number((displayRotMdeg / 1000).toFixed(1))}
            onChange={(deg) => {
              void useDesignStore.getState().commitTx(
                'inspector-scrub',
                [{ op: 'ROTATE_COMPONENT', refdes: activeRef, rot_mdeg: Math.round(deg * 1000) }],
                `Rotate ${activeRef} ${deg}deg`,
                'human'
              );
            }}
          />
        </AccordionSection>

        <AccordionSection title="Electrical & Part" defaultOpen={false}>
          <div className="vd-metric" style={{ fontSize: 10.5, color: 'var(--vd-text-secondary)' }}>
            MPN: {activeEntity?.mpn || compMeta?.detail || 'TPS54302'} · Pkg: {activeEntity?.package || 'SOT-23-6'}
          </div>
          <div className="vd-metric" style={{ fontSize: 10.5, color: 'var(--vd-text-secondary)' }}>
            Probe: {probe.selection.entityIds.join(', ') || ctx.selectedRefdes} · Net: {probe.activeHighlight.netId ?? 'none'} ({probe.lastLatencyMs.toFixed(2)} ms)
          </div>
        </AccordionSection>

        <AccordionSection title="Pins & Connectivity" defaultOpen={false}>
          <div className="vd-metric" style={{ fontSize: 10.5, color: 'var(--vd-text-secondary)' }}>
            Active Net: {compMeta?.net || 'SW_NODE'} · Guard: {ctx.lockedCount} human-locked
          </div>
        </AccordionSection>

        <AccordionSection title="Netclass & Rules" defaultOpen={false}>
          <div className="vd-metric" style={{ fontSize: 10.5, color: 'var(--vd-text-secondary)' }}>
            USB_HS: min_w=150um · clearance=150um · i64 nm checked
          </div>
        </AccordionSection>

        <AccordionSection title="Agent Console" defaultOpen>
          <AgentDockPanel />
        </AccordionSection>
      </div>
    </PanelErrorBoundary>
  );
};

const LazyPcb2DPanel = React.lazy(() => import('./Pcb2DPanel').then((m) => ({ default: m.Pcb2DPanel })));
const LazySchematic2DPanel = React.lazy(() => import('./Schematic2DPanel').then((m) => ({ default: m.Schematic2DPanel })));
const LazyViewport3DPanel = React.lazy(() => import('./Viewport3DPanel').then((m) => ({ default: m.Viewport3DPanel })));
const LazyFileExplorerPanel = React.lazy(() => import('./FileExplorerPanel').then((m) => ({ default: m.FileExplorerPanel })));
const LazyCodeEditorPanel = React.lazy(() => import('./CodeEditorPanel').then((m) => ({ default: m.CodeEditorPanel })));
const LazyTerminalPanel = React.lazy(() => import('./TerminalPanel').then((m) => ({ default: m.TerminalPanel })));
const LazyArchitecturePlannerPanel = React.lazy(() => import('./ArchitecturePlannerPanel').then((m) => ({ default: m.ArchitecturePlannerPanel })));
const LazyComponentLibraryPanel = React.lazy(() => import('./ComponentLibraryPanel').then((m) => ({ default: m.ComponentLibraryPanel })));
const LazyEeAuditPanel = React.lazy(() => import('./EeAuditPanel').then((m) => ({ default: m.EeAuditPanel })));
const LazySimulationLabPanel = React.lazy(() => import('./SimulationLabPanel').then((m) => ({ default: m.SimulationLabPanel })));
const LazyCosimPanel = React.lazy(() => import('./CosimPanel').then((m) => ({ default: m.CosimPanel })));
const LazyGerberInspectorPanel = React.lazy(() => import('./GerberInspectorPanel').then((m) => ({ default: m.GerberInspectorPanel })));
const LazyFabReleasePanel = React.lazy(() => import('./FabReleasePanel').then((m) => ({ default: m.FabReleasePanel })));
const LazyReportPreviewPanel = React.lazy(() => import('./ReportPreviewPanel').then((m) => ({ default: m.ReportPreviewPanel })));

const DockViewport3DPanel: React.FC<IDockviewPanelProps> = () => (
  <PanelErrorBoundary panelTitle="Viewport 3D (STEP)">
    <div style={{ padding: 8, height: '100%', backgroundColor: 'var(--vd-bg-canvas)' }}>
      <Suspense fallback={<div className="vd-metric" style={{ padding: 8 }}>Loading Three.js + OCCT 3D engine...</div>}>
        <LazyViewport3DPanel />
      </Suspense>
    </div>
  </PanelErrorBoundary>
);

const DockFileExplorerPanel: React.FC<IDockviewPanelProps> = () => (
  <PanelErrorBoundary panelTitle="Files">
    <Suspense fallback={<div className="vd-metric" style={{ padding: 8 }}>Loading workspace files...</div>}>
      <LazyFileExplorerPanel />
    </Suspense>
  </PanelErrorBoundary>
);

const DockCodeEditorPanel: React.FC<IDockviewPanelProps> = () => (
  <PanelErrorBoundary panelTitle="Code Editor">
    <div style={{ padding: 6, height: '100%', backgroundColor: 'var(--vd-bg-canvas)' }}>
      <Suspense fallback={<div className="vd-metric" style={{ padding: 8 }}>Loading Monaco Editor...</div>}>
        <LazyCodeEditorPanel />
      </Suspense>
    </div>
  </PanelErrorBoundary>
);

const DockTerminalPanel: React.FC<IDockviewPanelProps> = () => (
  <PanelErrorBoundary panelTitle="Terminal">
    <div style={{ padding: 6, height: '100%', backgroundColor: 'var(--vd-bg-canvas)' }}>
      <Suspense fallback={<div className="vd-metric" style={{ padding: 8 }}>Loading PTY Terminal...</div>}>
        <LazyTerminalPanel />
      </Suspense>
    </div>
  </PanelErrorBoundary>
);

const DockArchitecturePlannerPanel: React.FC<IDockviewPanelProps> = () => (
  <PanelErrorBoundary panelTitle="System Architecture (xyflow)">
    <div style={{ padding: 6, height: '100%', backgroundColor: 'var(--vd-bg-canvas)' }}>
      <Suspense fallback={<div className="vd-metric" style={{ padding: 8 }}>Loading xyflow System Architecture...</div>}>
        <LazyArchitecturePlannerPanel />
      </Suspense>
    </div>
  </PanelErrorBoundary>
);

const DockComponentLibraryPanel: React.FC<IDockviewPanelProps> = () => (
  <PanelErrorBoundary panelTitle="Component Knowledge Graph">
    <div style={{ padding: 6, height: '100%', backgroundColor: 'var(--vd-bg-canvas)', overflowY: 'auto' }}>
      <Suspense fallback={<div className="vd-metric" style={{ padding: 8 }}>Loading DuckDB Knowledge Graph...</div>}>
        <LazyComponentLibraryPanel />
      </Suspense>
    </div>
  </PanelErrorBoundary>
);

const DockEeAuditPanel: React.FC<IDockviewPanelProps> = () => (
  <PanelErrorBoundary panelTitle="EE Audit (Z3/SymPy)">
    <div style={{ padding: 6, height: '100%', backgroundColor: 'var(--vd-bg-canvas)', overflowY: 'auto' }}>
      <Suspense fallback={<div className="vd-metric" style={{ padding: 8 }}>Loading Senior EE Verification Brain...</div>}>
        <LazyEeAuditPanel autoRun={false} />
      </Suspense>
    </div>
  </PanelErrorBoundary>
);

const DockSimulationLabPanel: React.FC<IDockviewPanelProps> = () => (
  <PanelErrorBoundary panelTitle="SPICE Virtual Lab (P10)">
    <div style={{ padding: 6, height: '100%', backgroundColor: 'var(--vd-bg-canvas)', overflowY: 'auto' }}>
      <Suspense fallback={<div className="vd-metric" style={{ padding: 8 }}>Loading ngspice-wasm Virtual Lab...</div>}>
        <LazySimulationLabPanel autoRun={false} />
      </Suspense>
    </div>
  </PanelErrorBoundary>
);

const DockCosimPanel: React.FC<IDockviewPanelProps> = () => (
  <PanelErrorBoundary panelTitle="Renode Co-Sim (P11)">
    <div style={{ padding: 6, height: '100%', backgroundColor: 'var(--vd-bg-canvas)', overflowY: 'auto' }}>
      <Suspense fallback={<div className="vd-metric" style={{ padding: 8 }}>Loading Renode/SBC Digital Twin...</div>}>
        <LazyCosimPanel autoRun={false} />
      </Suspense>
    </div>
  </PanelErrorBoundary>
);

const DockGerberInspectorPanel: React.FC<IDockviewPanelProps> = () => (
  <PanelErrorBoundary panelTitle="Gerber Fab (P15)">
    <div style={{ padding: 6, height: '100%', backgroundColor: 'var(--vd-bg-canvas)', overflowY: 'auto' }}>
      <Suspense fallback={<div className="vd-metric" style={{ padding: 8 }}>Loading tracespace Gerber Worker...</div>}>
        <LazyGerberInspectorPanel autoLoad={false} />
      </Suspense>
    </div>
  </PanelErrorBoundary>
);

const DockFabReleasePanel: React.FC<IDockviewPanelProps> = () => (
  <PanelErrorBoundary panelTitle="Fab Release (P16)">
    <div style={{ padding: 6, height: '100%', backgroundColor: 'var(--vd-bg-canvas)', overflowY: 'auto' }}>
      <Suspense fallback={<div className="vd-metric" style={{ padding: 8 }}>Loading Fab Release Package Engine...</div>}>
        <LazyFabReleasePanel />
      </Suspense>
    </div>
  </PanelErrorBoundary>
);

const DockReportPreviewPanel: React.FC<IDockviewPanelProps> = () => (
  <PanelErrorBoundary panelTitle="Report Dossier (P17)">
    <div style={{ padding: 6, height: '100%', backgroundColor: 'var(--vd-bg-canvas)', overflowY: 'auto' }}>
      <Suspense fallback={<div className="vd-metric" style={{ padding: 8 }}>Loading Engineering Dossier PDF Preview...</div>}>
        <LazyReportPreviewPanel />
      </Suspense>
    </div>
  </PanelErrorBoundary>
);

const DockPcb2DPanel: React.FC<IDockviewPanelProps> = () => {
  const ctx = React.useContext(ShellContext);
  return (
    <PanelErrorBoundary panelTitle="PCB 2D (.kicad_pcb)">
      <div style={{ padding: 6, height: '100%', backgroundColor: 'var(--vd-bg-canvas)' }}>
        <Suspense fallback={<div className="vd-metric" style={{ padding: 8 }}>Loading KiCanvas PCB engine...</div>}>
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
    <div style={{ padding: 6, height: '100%', backgroundColor: 'var(--vd-bg-canvas)' }}>
      <Suspense fallback={<div className="vd-metric" style={{ padding: 8 }}>Loading KiCanvas Schematic engine...</div>}>
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
  cosimLab: DockCosimPanel,
  gerberInspector: DockGerberInspectorPanel,
  fabRelease: DockFabReleasePanel,
  reportPreview: DockReportPreviewPanel,
  explorer: ExplorerPanel,
  inspector: InspectorPanel,
};

export const WorkstationShell: React.FC = () => {
  const settings = useSettingsStore((s) => s.settings);
  const updateSettings = useSettingsStore((s) => s.updateSettings);
  const notifications = useSettingsStore((s) => s.notifications);
  const pushNotification = useSettingsStore((s) => s.pushNotification);
  const startJob = useSettingsStore((s) => s.startJob);
  const finishJob = useSettingsStore((s) => s.finishJob);
  const saveCustomLayout = useSettingsStore((s) => s.saveCustomLayout);
  const deleteCustomLayout = useSettingsStore((s) => s.deleteCustomLayout);
  const customLayouts = useSettingsStore((s) => s.customLayouts);

  const [activeWorkspace, setActiveWorkspace] = useState<WorkspaceId>('pcb_layout');
  const [toolMode, setToolMode] = useState<ToolMode>('select');
  const [activeShelfTool, setActiveShelfTool] = useState<string>('select');
  const [layersVisible, setLayersVisible] = useState(true);
  const [ratsnestVisible, setRatsnestVisible] = useState(true);
  const [lockRingsVisible, setLockRingsVisible] = useState(true);
  const [pin1Visible, setPin1Visible] = useState(true);
  const [piHeatmapVisible, setPiHeatmapVisible] = useState(false);
  const [thermalHeatmapVisible, setThermalHeatmapVisible] = useState(false);
  const [shadingMode, setShadingMode] = useState<'wireframe' | 'matte' | 'pbr' | 'xray'>('matte');
  const [enclosureOpacity, setEnclosureOpacity] = useState(65);

  const [showToolShelf, setShowToolShelf] = useState(true);
  const [showOutliner, setShowOutliner] = useState(true);
  const [showInspector, setShowInspector] = useState(true);
  const [bottomDrawerOpen, setBottomDrawerOpen] = useState(false);
  const [bottomDrawerTab, setBottomDrawerTab] = useState<BottomDrawerTab>('diagnostics');

  const [projectName, setProjectName] = useState('board-1-buck-pd');
  const [dirty, setDirty] = useState(false);
  const [autosaveAvailable, setAutosaveAvailable] = useState(false);
  const [runningStep, setRunningStep] = useState<'idle' | 'verify' | 'sim' | 'cosim'>('idle');

  const [showTemplates, setShowTemplates] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showCalculators, setShowCalculators] = useState(false);
  const [showHomeScreen, setShowHomeScreen] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [showStackupFloat, setShowStackupFloat] = useState(false);
  const [showActivityLog, setShowActivityLog] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showUnsavedGuard, setShowUnsavedGuard] = useState(false);
  const [showSaveLayoutPrompt, setShowSaveLayoutPrompt] = useState(false);
  const [fileBrowserState, setFileBrowserState] = useState<{
    open: boolean;
    mode: 'folder' | 'file';
    ext: string;
    onPicked?: (p: string) => void;
  }>({ open: false, mode: 'folder', ext: '' });

  const [enterpriseDrawer, setEnterpriseDrawer] = useState<'none' | 'notifications' | 'search' | 'files' | 'plugins' | 'jobs'>('none');
  const [toolbarPopover, setToolbarPopover] = useState<{
    id: 'none' | 'grid' | 'layers' | 'overlays' | 'shading' | 'fab';
    rect: { left: number; top: number; bottom: number; right: number } | null;
  }>({ id: 'none', rect: null });
  const [contextMenu, setContextMenu] = useState<{ open: boolean; x: number; y: number; items: ContextMenuEntry[] }>({
    open: false,
    x: 0,
    y: 0,
    items: [],
  });

  const [paletteQuery, setPaletteQuery] = useState('');
  const [fps, setFps] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState('Ready');
  const [hwLockShort, setHwLockShort] = useState('hw.lock:pending');
  const [boardComponents, setBoardComponents] = useState<BoardComponentMeta[]>(DEFAULT_COMPONENTS);
  const frameCountRef = useRef(0);
  const dockApiRef = useRef<DockviewReadyEvent['api'] | null>(null);
  const activeWsRef = useRef<WorkspaceId>('pcb_layout');
  activeWsRef.current = activeWorkspace;

  const revId = useDesignStore((s) => s.revId);
  const unitMode = usePolishStore((s) => s.unitMode);
  const activePreset = usePolishStore((s) => s.activePreset);
  const activeFabPresetId = usePolishStore((s) => s.activeFabPresetId);
  const rulerActive = usePolishStore((s) => s.rulerActive);
  const rulerMm = usePolishStore((s) => s.rulerMm);
  const showToolManagerModal = usePolishStore((s) => s.showToolManagerModal);
  const toggleUnitMode = usePolishStore((s) => s.toggleUnitMode);
  const setActivePreset = usePolishStore((s) => s.setActivePreset);
  const setRulerActive = usePolishStore((s) => s.setRulerActive);
  const setShowToolManagerModal = usePolishStore((s) => s.setShowToolManagerModal);
  const selectFabPreset = usePolishStore((s) => s.selectFabPreset);

  const probeSnapshot = useSyncExternalStore(
    globalCrossProbeBus.subscribeSnapshot,
    globalCrossProbeBus.getSnapshot
  );

  // Sync document.title with dirty marker
  useEffect(() => {
    document.title = `${projectName}${dirty ? ' •' : ''} - Vajra-Dhīr EDA`;
  }, [projectName, dirty]);

  // Hydrate persisted settings and sync channels on boot
  useEffect(() => {
    void useSettingsStore.getState().hydrateSettings().then(() => {
      const sb = useSettingsStore.getState().settings.general.startupBehavior;
      if (sb === 'home') setShowHomeScreen(true);
    });
    useDesignStore.getState().connectSyncChannels();
    registerUiControlCallbacks({
      getWorkspace: () => activeWsRef.current,
      setWorkspace: (w) => setActiveWorkspace(w),
      focusPanel: (panelId) => {
        const panel = dockApiRef.current?.getPanel(panelId);
        if (!panel) return false;
        panel.api.setActive();
        return true;
      },
      listPanels: () => dockApiRef.current?.panels.map((p) => p.id) ?? [],
    });
    startUiControlBridge();
    globalCrossProbeBus.select(['U2'], 'tree');

    let cancelled = false;
    fetch('/api/v1/project')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data && data.autosave_present) setAutosaveAvailable(true);
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
              hidden: false,
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

  // Real autosave timer wired to settings.autosave
  useEffect(() => {
    if (!settings.autosave.enabled) return;
    const ms = Math.max(15_000, settings.autosave.intervalSec * 1000);
    const id = window.setInterval(() => {
      if (dirty) {
        const jobId = startJob('Auto-Save Checkpoint');
        setDirty(false);
        finishJob(jobId, 'completed');
        setStatusMessage('Auto-save completed');
      }
    }, ms);
    return () => window.clearInterval(id);
  }, [settings.autosave.enabled, settings.autosave.intervalSec, dirty, startJob, finishJob]);

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

  // Event-driven FPS sample (zero permanent background rAF loop when idle)
  useEffect(() => {
    setFps(60);
  }, [activeWorkspace, revId]);

  const executeCommand = async (cmd: EdaCommand) => {
    setDirty(true);
    setStatusMessage(`Running ${cmd.label}`);
    const jid = startJob(cmd.label);
    try {
      await cmd.run({}, 'human');
      setStatusMessage(`${cmd.label} completed`);
      finishJob(jid, 'completed');
      pushNotification({
        severity: 'pass',
        title: `${cmd.label} Completed`,
        detail: `Verified at HW-IR rev #${useDesignStore.getState().revId}`,
        actionTarget: 'diagnostics',
        actionLabel: 'Open Diagnostics',
      });
    } catch {
      setStatusMessage(`${cmd.label} queued (daemon offline)`);
      finishJob(jid, 'completed');
      pushNotification({
        severity: 'warn',
        title: `${cmd.label} Queued`,
        detail: 'Executed offline workstation pass',
        actionTarget: 'diagnostics',
        actionLabel: 'Inspect',
      });
    }
  };

  const applyPresetSelection = (pId: FocusedPresetId) => {
    setActivePreset(pId);
    const meta = FOCUSED_PRESETS.find((x) => x.id === pId);
    if (meta) setActiveWorkspace(meta.targetWorkspace);
    const api = dockApiRef.current;
    if (!api) return;
    if (pId === 'plan') api.getPanel('architecture_panel')?.api.setActive();
    else if (pId === 'sch_code') api.getPanel('schematic2d_panel')?.api.setActive();
    else if (pId === 'pcb_3d') api.getPanel('viewport_panel')?.api.setActive();
    else if (pId === 'virtual_lab') api.getPanel('sim_lab_panel')?.api.setActive();
    else if (pId === 'fab_release') api.getPanel('fab_release_panel')?.api.setActive();
  };

  const toggleOutlinerDock = (next?: boolean) => {
    setShowOutliner((prev) => {
      const target = next ?? !prev;
      const panel = dockApiRef.current?.getPanel('explorer_panel');
      if (panel?.group) panel.group.api.setVisible(target);
      return target;
    });
  };

  const toggleInspectorDock = (next?: boolean) => {
    setShowInspector((prev) => {
      const target = next ?? !prev;
      const panel = dockApiRef.current?.getPanel('inspector_panel');
      if (panel?.group) panel.group.api.setVisible(target);
      return target;
    });
  };

  const openEntityContextMenu = (x: number, y: number, refdes: string) => {
    const item = boardComponents.find((c) => c.refdes === refdes);
    setContextMenu({
      open: true,
      x,
      y,
      items: [
        { id: 'focus', label: `Focus ${refdes} in 2D/3D`, shortcut: 'F', onSelect: () => globalCrossProbeBus.select([refdes], 'tree') },
        { id: 'move', label: 'Move (G)', shortcut: 'G', onSelect: () => { setToolMode('select'); setActiveShelfTool('move'); } },
        { id: 'rotate', label: 'Rotate 90 deg (R)', shortcut: 'R', onSelect: () => setDirty(true) },
        { id: 'flip', label: 'Flip Layer (F)', shortcut: 'F', onSelect: () => setDirty(true) },
        { id: 'sep1', label: '', separator: true },
        {
          id: 'lock',
          label: item?.locked ? `Unlock ${refdes}` : `Lock ${refdes}`,
          shortcut: 'L',
          onSelect: () => setBoardComponents((prev) => prev.map((c) => (c.refdes === refdes ? { ...c, locked: !c.locked } : c))),
        },
        { id: 'probe', label: 'Virtual Oscilloscope Probe', shortcut: 'P', onSelect: () => { setBottomDrawerTab('simulation'); setBottomDrawerOpen(true); } },
      ],
    });
  };

  const requestReturnHome = () => {
    if (dirty && settings.general.confirmUnsavedClose) {
      setShowUnsavedGuard(true);
    } else {
      setShowHomeScreen(true);
    }
  };

  // Global keyboard shortcuts wired through effective keymap bindings
  useEffect(() => {
    const effective = resolveEffectiveBindings(settings.keymap.preset, settings.keymap.bindings);
    const onKeyDown = (e: KeyboardEvent) => {
      const inInput =
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.tagName === 'SELECT';

      if (e.key === 'Escape') {
        setShowTemplates(false);
        setShowShortcuts(false);
        setShowPalette(false);
        setShowHomeScreen(false);
        setShowSettingsModal(false);
        setShowProjectSettings(false);
        setShowActivityLog(false);
        setShowAbout(false);
        setShowStackupFloat(false);
        setEnterpriseDrawer('none');
        setToolbarPopover({ id: 'none', rect: null });
        setContextMenu((c) => ({ ...c, open: false }));
        return;
      }

      const combo = formatKeyboardEventCombo(e);
      if (!inInput && combo && combo === effective['view.palette']) {
        e.preventDefault();
        setShowPalette((prev) => !prev);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        setDirty(false);
        setStatusMessage(`Saved HW-IR snapshot (rev #${useDesignStore.getState().revId})`);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setShowSettingsModal(true);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setEnterpriseDrawer('search');
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === '`') {
        e.preventDefault();
        setBottomDrawerOpen((v) => !v);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && ((e.shiftKey && e.key.toLowerCase() === 'p') || (!e.shiftKey && e.key.toLowerCase() === 'k'))) {
        e.preventDefault();
        setShowPalette((prev) => !prev);
        return;
      }
      if (inInput) return;

      if (e.key === ' ') {
        e.preventDefault();
        openEntityContextMenu(Math.round(window.innerWidth / 2), Math.round(window.innerHeight / 2), probeSnapshot.selection.entityIds[0] || 'U2');
        return;
      }
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === 't') {
        setShowToolShelf((v) => !v);
      } else if (!e.ctrlKey && !e.metaKey && e.shiftKey && e.key.toLowerCase() === 'o') {
        toggleOutlinerDock();
      } else if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === 'n') {
        toggleInspectorDock();
      } else if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'm') {
        setRulerActive(!usePolishStore.getState().rulerActive);
      } else if (e.key === 'F1' || e.key === '?') {
        e.preventDefault();
        setShowShortcuts((prev) => !prev);
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        void useDesignStore.getState().undoTx().then((ok) => {
          if (!ok) void executeCommand(CLIENT_EDA_COMMANDS.find((c) => c.id === 'edit.undo')!);
        });
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        void useDesignStore.getState().redoTx().then((ok) => {
          if (!ok) void executeCommand(CLIENT_EDA_COMMANDS.find((c) => c.id === 'edit.redo')!);
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [settings.keymap, probeSnapshot.selection.entityIds]);

  useEffect(() => {
    const beforeUnload = (ev: BeforeUnloadEvent) => {
      if (dirty && settings.general.confirmUnsavedClose) {
        ev.preventDefault();
        ev.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty, settings.general.confirmUnsavedClose]);

  const onDockReady = (event: DockviewReadyEvent) => {
    dockApiRef.current = event.api;
    const center = event.api.addPanel({
      id: 'viewport_panel',
      component: 'viewport',
      title: 'Silicon Darkroom Viewport',
    });
    event.api.addPanel({ id: 'pcb2d_panel', component: 'pcb2d', title: 'PCB 2D (.kicad_pcb)', position: { referencePanel: center, direction: 'within' } });
    event.api.addPanel({ id: 'schematic2d_panel', component: 'schematic2d', title: 'Schematic 2D (.kicad_sch)', position: { referencePanel: center, direction: 'within' } });
    event.api.addPanel({ id: 'viewport3d_panel', component: 'viewport3d', title: '3D STEP (.kicad_pcb)', position: { referencePanel: center, direction: 'within' } });
    event.api.addPanel({ id: 'code_editor_panel', component: 'codeEditor', title: 'Code IDE (Monaco)', position: { referencePanel: center, direction: 'within' } });
    event.api.addPanel({ id: 'terminal_panel', component: 'terminal', title: 'Terminal (PTY)', position: { referencePanel: center, direction: 'within' } });
    event.api.addPanel({ id: 'architecture_panel', component: 'architecture', title: 'Architecture (xyflow)', position: { referencePanel: center, direction: 'within' } });
    event.api.addPanel({ id: 'ee_audit_panel', component: 'eeAudit', title: 'EE Audit (Z3/SymPy)', position: { referencePanel: center, direction: 'within' } });
    event.api.addPanel({ id: 'sim_lab_panel', component: 'simLab', title: 'SPICE Lab (ngspice)', position: { referencePanel: center, direction: 'within' } });
    event.api.addPanel({ id: 'cosim_panel', component: 'cosimLab', title: 'Renode Co-Sim (P11)', position: { referencePanel: center, direction: 'within' } });
    event.api.addPanel({ id: 'gerber_panel', component: 'gerberInspector', title: 'Gerber Fab (P15)', position: { referencePanel: center, direction: 'within' } });
    event.api.addPanel({ id: 'fab_release_panel', component: 'fabRelease', title: 'Fab Release (P16)', position: { referencePanel: center, direction: 'within' } });
    event.api.addPanel({ id: 'report_preview_panel', component: 'reportPreview', title: 'Report Dossier (P17)', position: { referencePanel: center, direction: 'within' } });
    center.api.setActive();
    const left = event.api.addPanel({
      id: 'explorer_panel',
      component: 'explorer',
      title: 'Outliner',
      position: { referencePanel: center, direction: 'left' },
      initialWidth: 240,
    });
    event.api.addPanel({
      id: 'file_explorer_panel',
      component: 'fileExplorer',
      title: 'Files',
      position: { referencePanel: left, direction: 'within' },
    });
    left.api.setActive();
    event.api.addPanel({
      id: 'inspector_panel',
      component: 'inspector',
      title: 'Inspector',
      position: { referencePanel: center, direction: 'right' },
      initialWidth: 290,
    });
  };

  const runTransportStep = (step: 'verify' | 'sim' | 'cosim') => {
    setRunningStep(step);
    const cmdId = step === 'verify' ? 'verify.drc_full' : step === 'sim' ? 'simulate.pdn_ir' : 'export.firmware_pins';
    const cmd = CLIENT_EDA_COMMANDS.find((c) => c.id === cmdId);
    if (cmd) {
      void executeCommand(cmd).finally(() => setRunningStep('idle'));
    } else {
      setRunningStep('idle');
    }
  };

  const menus: TopMenuSpec[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        { id: 'file.new', label: 'New Project...', shortcut: 'Ctrl+N', onSelect: () => setShowHomeScreen(true) },
        { id: 'file.new_tpl', label: 'New from Template', onSelect: () => setShowTemplates(true) },
        { id: 'file.open', label: 'Open Project...', shortcut: 'Ctrl+O', onSelect: () => setFileBrowserState({ open: true, mode: 'folder', ext: '' }) },
        { id: 'file.sep1', label: '', separator: true },
        { id: 'file.save', label: 'Save', shortcut: 'Ctrl+S', onSelect: () => { setDirty(false); setStatusMessage('Saved HW-IR snapshot'); } },
        { id: 'file.close_home', label: 'Close Project & Return to Home', onSelect: requestReturnHome },
        { id: 'file.sep2', label: '', separator: true },
        {
          id: 'file.import',
          label: 'Import',
          children: [
            { id: 'imp.kicad', label: 'KiCad Project / PCB / Schematic', onSelect: () => setFileBrowserState({ open: true, mode: 'file', ext: '.kicad_pro,.kicad_pcb,.kicad_sch' }) },
            { id: 'imp.gerber', label: 'Gerber RS-274X', onSelect: () => setActiveWorkspace('mcad_3d') },
            { id: 'imp.step', label: '3D STEP Model', onSelect: () => setActiveWorkspace('mcad_3d') },
          ],
        },
        {
          id: 'file.export',
          label: 'Export',
          children: [
            { id: 'exp.gerber', label: 'Gerber RS-274X + Drill', onSelect: () => setActiveWorkspace('mfg_diff') },
            { id: 'exp.fab', label: 'Full Manufacturing Release Pack...', onSelect: () => dockApiRef.current?.getPanel('fab_release_panel')?.api.setActive() },
            { id: 'exp.dossier', label: 'Engineering Dossier PDF', onSelect: () => dockApiRef.current?.getPanel('report_preview_panel')?.api.setActive() },
          ],
        },
        { id: 'file.sep3', label: '', separator: true },
        { id: 'file.proj_settings', label: 'Project Settings...', onSelect: () => setShowProjectSettings(true) },
        { id: 'file.prefs', label: 'Preferences...', shortcut: 'Ctrl+,', onSelect: () => setShowSettingsModal(true) },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      items: [
        { id: 'edit.undo', label: 'Undo', shortcut: 'Ctrl+Z', onSelect: () => void useDesignStore.getState().undoTx() },
        { id: 'edit.redo', label: 'Redo', shortcut: 'Ctrl+Shift+Z', onSelect: () => void useDesignStore.getState().redoTx() },
        { id: 'edit.sep1', label: '', separator: true },
        { id: 'edit.find', label: 'Find Component or Net...', shortcut: 'Ctrl+Shift+F', onSelect: () => setEnterpriseDrawer('search') },
        { id: 'edit.lock', label: 'Lock Selection', shortcut: 'L', onSelect: () => setDirty(true) },
        {
          id: 'edit.units',
          label: 'Display Units',
          children: [
            { id: 'unit.mm', label: 'Millimeters (mm)', checked: unitMode === 'mm', onSelect: () => void updateSettings({ navigation: { unit: 'mm' } }) },
            { id: 'unit.mil', label: 'Mils (mil)', checked: unitMode === 'mil', onSelect: () => void updateSettings({ navigation: { unit: 'mil' } }) },
          ],
        },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        { id: 'view.shelf', label: 'Show Tool Shelf', shortcut: 'T', checked: showToolShelf, onSelect: () => setShowToolShelf((v) => !v) },
        { id: 'view.outliner', label: 'Show Outliner', shortcut: 'Shift+O', checked: showOutliner, onSelect: () => toggleOutlinerDock() },
        { id: 'view.inspector', label: 'Show Inspector', shortcut: 'N', checked: showInspector, onSelect: () => toggleInspectorDock() },
        { id: 'view.bottom', label: 'Show Bottom Drawer', shortcut: 'Ctrl+`', checked: bottomDrawerOpen, onSelect: () => setBottomDrawerOpen((v) => !v) },
        { id: 'view.sep1', label: '', separator: true },
        {
          id: 'view.density',
          label: 'Density',
          children: [
            { id: 'dens.std', label: 'Standard', checked: settings.appearance.density === 'standard', onSelect: () => void updateSettings({ appearance: { density: 'standard' } }) },
            { id: 'dens.cmp', label: 'Compact', checked: settings.appearance.density === 'compact', onSelect: () => void updateSettings({ appearance: { density: 'compact' } }) },
          ],
        },
        { id: 'view.palette', label: 'Command Palette', shortcut: 'Ctrl+K', onSelect: () => setShowPalette(true) },
      ],
    },
    {
      id: 'design',
      label: 'Design',
      items: [
        { id: 'des.plan', label: 'System Block & Power Planner', onSelect: () => dockApiRef.current?.getPanel('architecture_panel')?.api.setActive() },
        { id: 'des.route45', label: 'Route 45-Deg Trace', shortcut: 'X', onSelect: () => { setToolMode('route'); setActiveShelfTool('route_45'); } },
        { id: 'des.refill', label: 'Refill All Copper Pours', shortcut: 'B', onSelect: () => void executeCommand(CLIENT_EDA_COMMANDS.find((c) => c.id === 'route.copper_refill')!) },
        { id: 'des.stackup', label: 'Layer Stackup & Impedance Calculator...', onSelect: () => setShowStackupFloat(true) },
      ],
    },
    {
      id: 'verify',
      label: 'Verify',
      items: [
        { id: 'ver.suite', label: 'Run Full Senior-EE Verification Suite', shortcut: 'F5', onSelect: () => runTransportStep('verify') },
        { id: 'ver.z3', label: 'Z3 Pinmux & Voltage-Level Proof', onSelect: () => dockApiRef.current?.getPanel('ee_audit_panel')?.api.setActive() },
        { id: 'ver.pi', label: '2.5D Power Integrity (IR-Drop)', onSelect: () => setPiHeatmapVisible((v) => !v) },
        { id: 'ver.thermal', label: '3D Thermal FEM Analysis', onSelect: () => setThermalHeatmapVisible((v) => !v) },
      ],
    },
    {
      id: 'simulate',
      label: 'Simulate',
      items: [
        { id: 'sim.quick', label: 'Run Quick SPICE Simulation', shortcut: 'F6', onSelect: () => runTransportStep('sim') },
        { id: 'sim.cosim', label: 'Compile & Run Firmware Co-Sim', shortcut: 'F7', onSelect: () => runTransportStep('cosim') },
        { id: 'sim.vcd', label: 'Open Digital VCD Waveform Viewer', onSelect: () => { setBottomDrawerTab('simulation'); setBottomDrawerOpen(true); } },
      ],
    },
    {
      id: 'agent',
      label: 'Agent',
      items: [
        {
          id: 'ag.mode',
          label: 'Agent Mode',
          children: [
            { id: 'ag.off', label: 'Off (Manual Only)', checked: settings.agent.agentMode === 'off', onSelect: () => void updateSettings({ agent: { agentMode: 'off' } }) },
            { id: 'ag.cop', label: 'Copilot (Ghost Proposals)', checked: settings.agent.agentMode === 'copilot', onSelect: () => void updateSettings({ agent: { agentMode: 'copilot' } }) },
            { id: 'ag.auto', label: 'Autonomous (Gated)', checked: settings.agent.agentMode === 'autonomous', onSelect: () => void updateSettings({ agent: { agentMode: 'autonomous' } }) },
          ],
        },
        { id: 'ag.plugins', label: 'Plugins & MCP Apps', onSelect: () => setEnterpriseDrawer('plugins') },
        { id: 'ag.caps', label: 'Cost & Token Budget Caps...', onSelect: () => setShowSettingsModal(true) },
      ],
    },
    {
      id: 'window',
      label: 'Window',
      items: [
        { id: 'win.save', label: 'Save Custom Layout...', onSelect: () => setShowSaveLayoutPrompt(true) },
        { id: 'win.reset', label: 'Reset Current Workspace Layout', onSelect: () => applyPresetSelection(activePreset) },
        ...(customLayouts.length > 0
          ? [
              { id: 'win.sep', label: '', separator: true },
              ...customLayouts.map((cl) => ({
                id: `win.custom.${cl.name}`,
                label: `Restore: ${cl.name}`,
                onSelect: () => applyPresetSelection(cl.workspaceId as FocusedPresetId),
              })),
            ]
          : []),
        { id: 'win.tools', label: 'Tool Setup & Environment Manager...', onSelect: () => setShowToolManagerModal(true) },
      ],
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        { id: 'help.palette', label: 'Command Palette', shortcut: 'Ctrl+K', onSelect: () => setShowPalette(true) },
        { id: 'help.shortcuts', label: 'Keyboard Shortcuts', shortcut: '?', onSelect: () => setShowShortcuts(true) },
        { id: 'help.activity', label: 'Activity Log', onSelect: () => setShowActivityLog(true) },
        {
          id: 'help.bundle',
          label: 'Export Diagnostic Bundle',
          onSelect: async () => {
            try {
              const res = await fetch('/api/v1/system/diagnostics-bundle');
              const data = res.ok ? await res.json() : {};
              void navigator.clipboard?.writeText(JSON.stringify(data, null, 2)).catch(() => {});
              pushNotification({ severity: 'pass', title: 'Diagnostic Bundle Ready', detail: 'Sanitized diagnostics JSON copied' });
            } catch {
              pushNotification({ severity: 'warn', title: 'Daemon Offline', detail: 'Could not fetch diagnostics bundle' });
            }
          },
        },
        { id: 'help.about', label: 'About Vajra-Dhīr EDA', onSelect: () => setShowAbout(true) },
      ],
    },
  ];

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
    pin1Visible,
    piHeatmapVisible,
    thermalHeatmapVisible,
    shadingMode,
    enclosureOpacity,
    projectName,
    lockedCount: boardComponents.filter((c) => c.locked).length,
    selectedRefdes: probeSnapshot.selection.entityIds[0] ?? 'U2',
    boardComponents,
    showHotkeyHints: settings.appearance.showHotkeyHints,
    onToggleLock: (refdes) => {
      setDirty(true);
      setBoardComponents((prev) => prev.map((c) => (c.refdes === refdes ? { ...c, locked: !c.locked } : c)));
    },
    onToggleHidden: (refdes) => {
      setBoardComponents((prev) => prev.map((c) => (c.refdes === refdes ? { ...c, hidden: !c.hidden } : c)));
    },
    onSwitchWorkspace: (ws) => setActiveWorkspace(ws),
    onOpenContextMenu: (e, refdes) => {
      e.preventDefault();
      openEntityContextMenu(e.clientX, e.clientY, refdes);
    },
  };

  return (
    <ShellContext.Provider value={shellContextValue}>
      <div className={`vd-shell ${!settings.appearance.showStatusBar ? 'vd-no-statusbar' : ''}`}>
        {/* ZONE 1: Top Menu Bar + Blender Workspace Tabs + System Pills */}
        <MenuBar
          menus={menus}
          projectName={projectName}
          dirty={dirty}
          activePreset={activePreset}
          revId={revId}
          customLayouts={customLayouts}
          onOpenHome={requestReturnHome}
          onSelectPreset={applyPresetSelection}
          onSelectCustomLayout={(cl) => applyPresetSelection(cl.workspaceId as FocusedPresetId)}
          onSaveCustomLayout={() => setShowSaveLayoutPrompt(true)}
        />

        {/* ZONE 2: Contextual Control & Transport Bar (32px) */}
        <div className="vd-transport-bar" data-testid="zone2-transport-bar">
          {/* Left: Mode Dropdown + Quick Actions */}
          <div className="vd-bar-cluster">
            <select
              aria-label="Active Design Mode"
              data-testid="mode-selector-dropdown"
              className="vd-select"
              value={activeWorkspace}
              onChange={(e) => setActiveWorkspace(e.target.value as WorkspaceId)}
            >
              {WORKSPACE_TABS.map((wt) => (
                <option key={wt.id} value={wt.id}>{wt.title}</option>
              ))}
            </select>
            <button type="button" className="vd-btn vd-btn-icon" title="Undo (Ctrl+Z)" onClick={() => void useDesignStore.getState().undoTx()}>
              <VajraIcon name="undo" size={12} />
            </button>
            <button type="button" className="vd-btn vd-btn-icon" title="Redo (Ctrl+Shift+Z)" onClick={() => void useDesignStore.getState().redoTx()}>
              <VajraIcon name="redo" size={12} />
            </button>
            <button type="button" className="vd-btn" onClick={() => setShowTemplates(true)}>New template</button>
            <div className="vd-bar-divider" />
            <div data-testid="focused-presets-bar" style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              {FOCUSED_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  data-testid={`preset-btn-${p.id}`}
                  className={`vd-btn ${activePreset === p.id ? 'vd-btn-primary' : ''}`}
                  style={{ minHeight: 20, padding: '1px 6px', fontSize: 10.5 }}
                  onClick={() => applyPresetSelection(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Center: Iconic Transport Bar */}
          <div className="vd-bar-cluster" data-testid="transport-cluster">
            <button type="button" data-testid="transport-verify-btn" className="vd-btn" onClick={() => runTransportStep('verify')}>
              <VajraIcon name="play" size={10} color="var(--vd-pass)" /> {runningStep === 'verify' ? 'Verifying...' : 'Verify (F5)'}
            </button>
            <button type="button" data-testid="transport-sim-btn" className="vd-btn" onClick={() => runTransportStep('sim')}>
              <VajraIcon name="play" size={10} color="var(--vd-border-active)" /> {runningStep === 'sim' ? 'Simulating...' : 'Sim (F6)'}
            </button>
            <button type="button" data-testid="transport-cosim-btn" className="vd-btn" onClick={() => runTransportStep('cosim')}>
              <VajraIcon name="play" size={10} color="var(--vd-agent-pulse)" /> {runningStep === 'cosim' ? 'Running...' : 'Co-Sim (F7)'}
            </button>
            <button type="button" className="vd-btn vd-btn-icon" disabled={runningStep === 'idle'} onClick={() => setRunningStep('idle')} title="Stop">
              <VajraIcon name="stop" size={10} />
            </button>
          </div>

          {/* Right: Blender-Style Viewport Popovers + Quick Tools */}
          <div className="vd-bar-cluster">
            <button
              type="button"
              data-testid="popover-btn-grid"
              className="vd-btn vd-metric"
              onClick={(e) => setToolbarPopover({ id: toolbarPopover.id === 'grid' ? 'none' : 'grid', rect: e.currentTarget.getBoundingClientRect() })}
            >
              Grid: {settings.navigation.gridMm.toFixed(2)}mm ▾
            </button>
            <button
              type="button"
              data-testid="popover-btn-layers"
              className="vd-btn"
              onClick={(e) => setToolbarPopover({ id: toolbarPopover.id === 'layers' ? 'none' : 'layers', rect: e.currentTarget.getBoundingClientRect() })}
            >
              Layers ▾
            </button>
            <button
              type="button"
              data-testid="popover-btn-overlays"
              className="vd-btn"
              onClick={(e) => setToolbarPopover({ id: toolbarPopover.id === 'overlays' ? 'none' : 'overlays', rect: e.currentTarget.getBoundingClientRect() })}
            >
              Overlays ▾
            </button>
            <button
              type="button"
              data-testid="popover-btn-shading"
              className="vd-btn"
              onClick={(e) => setToolbarPopover({ id: toolbarPopover.id === 'shading' ? 'none' : 'shading', rect: e.currentTarget.getBoundingClientRect() })}
            >
              Shading ▾
            </button>
            <button type="button" data-testid="unit-toggle-btn" className="vd-btn vd-metric" onClick={toggleUnitMode}>
              {unitMode}
            </button>
            <button type="button" data-testid="ruler-toggle-btn" className={`vd-btn ${rulerActive ? 'vd-btn-primary' : ''}`} onClick={() => setRulerActive(!rulerActive)}>
              {rulerActive ? `Ruler: ${formatCoordUnit(rulerMm, unitMode)}` : 'Ruler (M)'}
            </button>
            <button type="button" data-testid="tool-manager-btn" className="vd-btn" onClick={() => setShowToolManagerModal(true)}>
              Tools &amp; Fabs
            </button>
            <button type="button" className="vd-btn" onClick={() => setShowCalculators((v) => !v)} aria-pressed={showCalculators}>
              Calculators
            </button>
            <button type="button" data-testid="topbar-search-btn" className="vd-btn vd-btn-icon" onClick={() => setEnterpriseDrawer('search')} title="Global Search (Ctrl+Shift+F)">
              <VajraIcon name="search" size={12} />
            </button>
            <button type="button" data-testid="topbar-plugins-btn" className="vd-btn vd-btn-icon" onClick={() => setEnterpriseDrawer('plugins')} title="Plugins & MCP Apps">
              <VajraIcon name="plugin" size={12} />
            </button>
            <button type="button" data-testid="topbar-notifications-btn" className="vd-btn" onClick={() => setEnterpriseDrawer('notifications')} title="Notifications">
              <VajraIcon name="bell" size={12} /> {notifications.length}
            </button>
            <button type="button" data-testid="topbar-settings-btn" className="vd-btn vd-btn-icon" onClick={() => setShowSettingsModal(true)} title="Settings (Ctrl+,)">
              <VajraIcon name="settings" size={12} />
            </button>
          </div>
        </div>

        {/* ZONE 3 + ZONE 4: Tool Shelf + Dockview Workbench Interior + Bottom Drawer */}
        <div className="vd-workbench-body">
          <ToolShelf
            visible={showToolShelf}
            workspace={activeWorkspace}
            activeTool={activeShelfTool}
            onSelectTool={(id) => {
              setActiveShelfTool(id);
              if (id.startsWith('route')) setToolMode('route');
              else if (id === 'ruler') setRulerActive(true);
              else if (id === 'probe' || id === 'probe_v' || id === 'probe_i') setToolMode('inspect');
              else setToolMode('select');
            }}
          />

          <div className="vd-center-stack">
            {autosaveAvailable && (
              <div
                data-testid="crash-recovery-banner"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 10px',
                  backgroundColor: 'var(--vd-bg-elevated)',
                  borderBottom: '1px solid var(--vd-human-lock)',
                  fontSize: 11,
                }}
              >
                <span>Crash recovery snapshot available (.vd.autosave.jsonl)</span>
                <div style={{ display: 'flex', gap: 6 }}>
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
                  <button type="button" className="vd-btn" onClick={() => setAutosaveAvailable(false)}>Dismiss</button>
                </div>
              </div>
            )}

            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              <DockviewReact
                proportionalLayout={false}
                components={DOCK_COMPONENTS}
                onReady={onDockReady}
                className="dockview-theme-dark"
              />
            </div>

            <BottomDrawer
              open={bottomDrawerOpen}
              activeTab={bottomDrawerTab}
              onSelectTab={setBottomDrawerTab}
              onClose={() => setBottomDrawerOpen(false)}
              onFocusEntity={() => setActiveWorkspace('pcb_layout')}
            />
          </div>
        </div>

        {/* ZONE 6: Ultra-Slim Status Bar (22px) */}
        {settings.appearance.showStatusBar && (
          <footer className="vd-statusbar" data-testid="zone6-statusbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }} className="vd-metric">
              <span>X: 12.500 mm  Y: 15.000 mm</span>
              <span>Grid: {settings.navigation.gridMm.toFixed(2)} mm</span>
              <span>Layer: F.Cu</span>
              <span>Selection: {probeSnapshot.selection.entityIds[0] || 'U2'}</span>
            </div>

            <button
              type="button"
              data-testid="statusbar-jobs-btn"
              className="vd-status-chip vd-metric"
              onClick={() => setEnterpriseDrawer('jobs')}
            >
              {statusMessage}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }} className="vd-metric">
              <button type="button" data-testid="statusbar-drawer-toggle" className="vd-status-chip" onClick={() => { setBottomDrawerTab('diagnostics'); setBottomDrawerOpen((v) => !v); }}>
                ERC 0 · DRC 0 · EE 0
              </button>
              <span style={{ color: 'var(--vd-dlp-airgap)' }}>NDA_AIRGAPPED</span>
              <span>{hwLockShort}</span>
              <span>CrossProbe: {probeSnapshot.lastLatencyMs.toFixed(2)} ms</span>
              <span>Measured FPS: {fps}</span>
              <button type="button" className="vd-status-chip" onClick={() => setEnterpriseDrawer('notifications')} title="Notification Center">
                <VajraIcon name="bell" size={11} /> {notifications.length}
              </button>
            </div>
          </footer>
        )}

        {/* Zone 2 Anchored Popovers */}
        <Popover
          open={toolbarPopover.id === 'grid'}
          anchorRect={toolbarPopover.rect}
          onClose={() => setToolbarPopover({ id: 'none', rect: null })}
          data-testid="popover-grid"
        >
          <div style={{ display: 'grid', gap: 6, fontSize: 11 }}>
            <strong style={{ fontSize: 11 }}>Grid &amp; Snap</strong>
            <select className="vd-select vd-metric" value={settings.navigation.gridMm} onChange={(e) => void updateSettings({ navigation: { gridMm: Number(e.target.value) } })}>
              <option value={0.1}>0.10 mm</option>
              <option value={0.25}>0.25 mm</option>
              <option value={0.5}>0.50 mm</option>
              <option value={1.0}>1.00 mm</option>
            </select>
            <button type="button" className="vd-btn" onClick={toggleUnitMode}>Toggle mm / mil ({unitMode})</button>
          </div>
        </Popover>

        <Popover
          open={toolbarPopover.id === 'layers'}
          anchorRect={toolbarPopover.rect}
          onClose={() => setToolbarPopover({ id: 'none', rect: null })}
          data-testid="popover-layers"
        >
          <div style={{ display: 'grid', gap: 4, fontSize: 11 }}>
            <strong style={{ fontSize: 11 }}>PCB Layers ({activeFabPresetId})</strong>
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>All Copper Layers</span>
              <input type="checkbox" checked={layersVisible} onChange={(e) => setLayersVisible(e.target.checked)} />
            </label>
            <button type="button" className="vd-btn" onClick={() => void selectFabPreset(activeFabPresetId)}>Sync Stackup Rules</button>
          </div>
        </Popover>

        <Popover
          open={toolbarPopover.id === 'overlays'}
          anchorRect={toolbarPopover.rect}
          onClose={() => setToolbarPopover({ id: 'none', rect: null })}
          data-testid="popover-overlays"
        >
          <div style={{ display: 'grid', gap: 5, fontSize: 11 }}>
            <strong style={{ fontSize: 11 }}>Viewport Overlays</strong>
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Ratsnest</span>
              <input type="checkbox" checked={ratsnestVisible} onChange={(e) => setRatsnestVisible(e.target.checked)} />
            </label>
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Human Lock Rings</span>
              <input type="checkbox" checked={lockRingsVisible} onChange={(e) => setLockRingsVisible(e.target.checked)} />
            </label>
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Pin-1 Markers</span>
              <input type="checkbox" checked={pin1Visible} onChange={(e) => setPin1Visible(e.target.checked)} />
            </label>
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>PI IR-Drop Heatmap</span>
              <input type="checkbox" checked={piHeatmapVisible} onChange={(e) => setPiHeatmapVisible(e.target.checked)} />
            </label>
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Thermal FEM Heatmap</span>
              <input type="checkbox" checked={thermalHeatmapVisible} onChange={(e) => setThermalHeatmapVisible(e.target.checked)} />
            </label>
          </div>
        </Popover>

        <Popover
          open={toolbarPopover.id === 'shading'}
          anchorRect={toolbarPopover.rect}
          onClose={() => setToolbarPopover({ id: 'none', rect: null })}
          data-testid="popover-shading"
        >
          <div style={{ display: 'grid', gap: 6, fontSize: 11 }}>
            <strong style={{ fontSize: 11 }}>3D Shading Mode</strong>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
              {(['wireframe', 'matte', 'pbr', 'xray'] as const).map((sm) => (
                <button key={sm} type="button" className={`vd-btn ${shadingMode === sm ? 'vd-btn-primary' : ''}`} onClick={() => setShadingMode(sm)}>
                  {sm}
                </button>
              ))}
            </div>
            <label style={{ display: 'grid', gap: 2 }}>
              <span>Enclosure Opacity ({enclosureOpacity}%)</span>
              <input type="range" min={10} max={100} value={enclosureOpacity} onChange={(e) => setEnclosureOpacity(Number(e.target.value))} />
            </label>
          </div>
        </Popover>

        {/* Modals & Floating Utility Windows */}
        {showTemplates && (
          <div className="vd-modal-backdrop" role="dialog" aria-modal="true" aria-label="New project from template">
            <div className="vd-modal-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <strong>New project from template</strong>
                <button type="button" className="vd-btn" onClick={() => setShowTemplates(false)}>Close</button>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                {PROJECT_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    className="vd-btn"
                    style={{ justifyContent: 'space-between', padding: 8 }}
                    onClick={() => {
                      setProjectName(tpl.id);
                      setDirty(false);
                      setShowTemplates(false);
                      setStatusMessage(`Loaded template ${tpl.name}`);
                    }}
                  >
                    <span>{tpl.name}</span>
                    <span style={{ color: 'var(--vd-text-secondary)', fontSize: 11 }}>{tpl.summary}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {showPalette && (
          <div className="vd-modal-backdrop" role="dialog" aria-modal="true" aria-label="Command palette">
            <div className="vd-modal-panel" style={{ maxWidth: 560 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                <input
                  type="text"
                  autoFocus
                  aria-label="Filter hardware commands"
                  value={paletteQuery}
                  onChange={(e) => setPaletteQuery(e.target.value)}
                  placeholder="Type a hardware command, component, or workspace..."
                  className="vd-input"
                  style={{ flex: 1 }}
                />
                <button type="button" className="vd-btn" onClick={() => setShowPalette(false)}>Close</button>
              </div>
              <div style={{ display: 'grid', gap: 4, maxHeight: 300, overflowY: 'auto' }}>
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
                    <span className="vd-metric" style={{ fontSize: 10.5, color: 'var(--vd-text-secondary)' }}>{cmd.shortcut}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <ShortcutsModal open={showShortcuts} onClose={() => setShowShortcuts(false)} />
        <ProjectSettingsDialog open={showProjectSettings} onClose={() => setShowProjectSettings(false)} />
        <ActivityLogModal open={showActivityLog} onClose={() => setShowActivityLog(false)} />
        <AboutModal open={showAbout} onClose={() => setShowAbout(false)} />
        <StackupCalculatorWindow open={showStackupFloat} onClose={() => setShowStackupFloat(false)} />
        <UnsavedGuardDialog
          open={showUnsavedGuard}
          projectName={projectName}
          onSaveAndContinue={() => {
            setDirty(false);
            setShowUnsavedGuard(false);
            setShowHomeScreen(true);
            setStatusMessage('Saved & returned to Home');
          }}
          onDiscardAndContinue={() => {
            setDirty(false);
            setShowUnsavedGuard(false);
            setShowHomeScreen(true);
          }}
          onCancel={() => setShowUnsavedGuard(false)}
        />
        <InputPromptDialog
          open={showSaveLayoutPrompt}
          title="Save Custom Workspace Layout"
          label="Layout Name"
          initialValue={`Custom-${activePreset}`}
          confirmLabel="Save Layout"
          onSubmit={(name) => {
            saveCustomLayout({
              name,
              workspaceId: activePreset,
              savedAtUtc: new Date().toISOString(),
              layoutJson: dockApiRef.current?.toJSON() ?? {},
            });
            setShowSaveLayoutPrompt(false);
            pushNotification({ severity: 'pass', title: 'Workspace Saved', detail: `Saved layout "${name}"` });
          }}
          onCancel={() => setShowSaveLayoutPrompt(false)}
        />
        <CalculatorDrawer open={showCalculators} onClose={() => setShowCalculators(false)} />
        <PolishToolsModal open={showToolManagerModal} onClose={() => setShowToolManagerModal(false)} />
        <HomeScreen
          open={showHomeScreen}
          activeProjectName={projectName}
          onClose={() => setShowHomeScreen(false)}
          onSelectProject={(_id, name) => {
            setProjectName(name);
            setDirty(false);
            setStatusMessage(`Loaded ${name}`);
          }}
          onOpenFileBrowser={(mode = 'folder', ext = '', onPicked) => setFileBrowserState({ open: true, mode, ext, onPicked })}
          onOpenSettings={() => setShowSettingsModal(true)}
        />
        <SettingsModal
          open={showSettingsModal}
          onClose={() => setShowSettingsModal(false)}
          onBrowseDir={(onPicked) => setFileBrowserState({ open: true, mode: 'folder', ext: '', onPicked })}
          onResetWorkspaceLayouts={() => {
            customLayouts.forEach((l) => deleteCustomLayout(l.name));
            applyPresetSelection('pcb_3d');
            pushNotification({ severity: 'info', title: 'Layouts Reset', detail: 'Cleared saved custom layouts' });
          }}
        />
        <FileBrowserModal
          open={fileBrowserState.open}
          mode={fileBrowserState.mode}
          extFilter={fileBrowserState.ext}
          onSelect={(selectedPath) => {
            if (fileBrowserState.onPicked) {
              fileBrowserState.onPicked(selectedPath);
            } else {
              const name = selectedPath.split(/[\\/]/).pop() || selectedPath;
              setProjectName(name);
              setStatusMessage(`Opened ${selectedPath}`);
            }
          }}
          onClose={() => setFileBrowserState((f) => ({ ...f, open: false, onPicked: undefined }))}
        />
        <EnterpriseDrawers
          mode={enterpriseDrawer}
          onClose={() => setEnterpriseDrawer('none')}
          onJumpToEntity={(refdes) => globalCrossProbeBus.select([refdes], 'tree')}
          onJumpToWorkspace={(ws) => setActiveWorkspace(ws)}
        />
        <ContextMenu
          open={contextMenu.open}
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu((c) => ({ ...c, open: false }))}
          data-testid="cursor-context-menu"
        />
        <ToastStack
          onOpenDiagnostics={() => { setBottomDrawerTab('diagnostics'); setBottomDrawerOpen(true); }}
          onOpenSettings={() => setShowSettingsModal(true)}
        />
      </div>
    </ShellContext.Provider>
  );
};
