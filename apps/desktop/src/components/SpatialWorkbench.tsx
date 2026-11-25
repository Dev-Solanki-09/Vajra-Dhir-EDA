import React from 'react';
import {
  DockviewReact,
  DockviewReadyEvent,
  IDockviewPanelProps,
} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import { LensesPanel } from './LensesPanel.js';
import { WebGpuCanvas } from './WebGpuCanvas.js';
import { InspectorPanel } from './InspectorPanel.js';
import { THEME } from '../theme.js';

const LensesWrapper: React.FC<IDockviewPanelProps> = () => <LensesPanel />;
const CanvasWrapper: React.FC<IDockviewPanelProps> = () => <WebGpuCanvas />;
const InspectorWrapper: React.FC<IDockviewPanelProps> = () => <InspectorPanel />;

const TerminalWrapper: React.FC<IDockviewPanelProps> = () => (
  <div
    style={{
      height: '100%',
      backgroundColor: '#07080C',
      color: '#A0AEC0',
      padding: 10,
      fontFamily: THEME.typography.fontMono,
      fontSize: 11,
      overflowY: 'auto',
    }}
  >
    <div style={{ color: THEME.colors.cyan, marginBottom: 4 }}>
      Vajra-Dhīr EDA — ACP Agent Terminal & Diagnostic Log
    </div>
    <div style={{ color: THEME.colors.textDim }}>
      [22:00:01] sqlite-wal: Connected to packages/hw-ir kernel (SQLite 3.44.0, UUIDv7 enabled)
    </div>
    <div style={{ color: THEME.colors.textDim }}>
      [22:00:02] mcp-gateway: 12 EDA verbs registered with ACP broker
    </div>
    <div style={{ color: THEME.colors.emerald }}>
      [22:00:03] vd-guard: Zero AGPL dependencies, zero PDF bytes in Git verified
    </div>
    <div style={{ color: THEME.colors.textDim }}>
      [22:00:04] drc-engine: Clearance rule checked (200 um) -&gt; 0 violations
    </div>
    <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
      <span style={{ color: THEME.colors.purple }}>vd-agent&gt;</span>
      <span style={{ color: THEME.colors.text }}>Waiting for user instruction or Gate evaluation...</span>
    </div>
  </div>
);

const components = {
  lenses: LensesWrapper,
  canvas: CanvasWrapper,
  inspector: InspectorWrapper,
  terminal: TerminalWrapper,
};

export const SpatialWorkbench: React.FC = () => {
  const onReady = (event: DockviewReadyEvent) => {
    // 1. Center: WebGPU Canvas
    const canvasPanel = event.api.addPanel({
      id: 'canvas_panel',
      component: 'canvas',
      title: 'PCB Darkroom Canvas (2D/3D)',
    });

    // 2. Left: 5 Knowledge Lenses
    event.api.addPanel({
      id: 'lenses_panel',
      component: 'lenses',
      title: 'Knowledge Lenses',
      position: { referencePanel: canvasPanel, direction: 'left' },
      initialWidth: 260,
    });

    // 3. Right: Inspector
    event.api.addPanel({
      id: 'inspector_panel',
      component: 'inspector',
      title: 'Inspector & Lock Guards',
      position: { referencePanel: canvasPanel, direction: 'right' },
      initialWidth: 300,
    });

    // 4. Bottom: Terminal
    event.api.addPanel({
      id: 'terminal_panel',
      component: 'terminal',
      title: 'ACP Terminal & Logs',
      position: { referencePanel: canvasPanel, direction: 'below' },
      initialHeight: 180,
    });
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <DockviewReact
        components={components}
        onReady={onReady}
        className="dockview-theme-dark"
      />
    </div>
  );
};
