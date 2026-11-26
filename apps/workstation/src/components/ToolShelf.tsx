import React, { useState } from 'react';
import { WorkspaceId } from '../commandBus';
import { clampCoordsToViewport } from './FloatingWindow';
import { VajraIcon, VajraIconName } from './VajraIcons';

export interface ToolVariantItem {
  id: string;
  label: string;
  shortcut?: string;
  icon: VajraIconName;
}

export interface ToolShelfItem {
  id: string;
  label: string;
  shortcut?: string;
  icon: VajraIconName;
  variants?: ToolVariantItem[];
}

function getToolsForWorkspace(ws: WorkspaceId): ToolShelfItem[] {
  if (ws === 'schematic') {
    return [
      { id: 'select', label: 'Select', shortcut: 'Esc', icon: 'selectCursor', variants: [
        { id: 'select', label: 'Pointer Select', icon: 'selectCursor' },
        { id: 'box_select', label: 'Box Select', icon: 'boxSelect' },
      ]},
      { id: 'place', label: 'Add Component', shortcut: 'A', icon: 'cpuChip' },
      { id: 'wire', label: 'Place Wire / Net', shortcut: 'W', icon: 'wireNet' },
      { id: 'probe', label: 'Probe', shortcut: 'P', icon: 'probeNeedle', variants: [
        { id: 'probe', label: 'Voltage Probe', shortcut: 'P', icon: 'probeNeedle' },
        { id: 'datasheet_proof', label: 'Datasheet Pin Proof', icon: 'datasheetPin' },
      ]},
      { id: 'ruler', label: 'Measure Ruler', shortcut: 'M', icon: 'rulerMeasure' },
    ];
  }
  if (ws === 'mcad_3d') {
    return [
      { id: 'select', label: 'Select Part', shortcut: 'Esc', icon: 'selectCursor' },
      { id: 'move', label: 'Move Part', shortcut: 'G', icon: 'moveAxes' },
      { id: 'cross_section', label: 'Cross-Section Slicer', icon: 'crossSection' },
      { id: 'clash', label: '3D Clash Check', icon: 'clashIntersect' },
      { id: 'camera_ortho', label: 'Ortho / Persp Toggle', shortcut: '5', icon: 'cameraOrtho' },
      { id: 'ruler', label: 'Measure Ruler', shortcut: 'M', icon: 'rulerMeasure' },
    ];
  }
  if (ws === 'sim_lab') {
    return [
      { id: 'select', label: 'Select Signal', shortcut: 'Esc', icon: 'selectCursor' },
      { id: 'probe', label: 'Probe', shortcut: 'P', icon: 'probeNeedle', variants: [
        { id: 'probe_v', label: 'Voltage Probe', icon: 'probeNeedle' },
        { id: 'probe_i', label: 'Current Probe', icon: 'powerDrop' },
        { id: 'datasheet_proof', label: 'Datasheet Pin Proof', icon: 'datasheetPin' },
      ]},
      { id: 'scope', label: 'Oscilloscope', icon: 'oscilloscope' },
      { id: 'vcd', label: 'Digital VCD', icon: 'waveDigital' },
    ];
  }
  // Default: PCB & Plan tools
  return [
    { id: 'select', label: 'Select', shortcut: 'Esc', icon: 'selectCursor', variants: [
      { id: 'select', label: 'Pointer Select', icon: 'selectCursor' },
      { id: 'box_select', label: 'Box Select', icon: 'boxSelect' },
    ]},
    { id: 'move', label: 'Move', shortcut: 'G', icon: 'moveAxes' },
    { id: 'rotate', label: 'Rotate', shortcut: 'R', icon: 'rotateArc' },
    { id: 'flip', label: 'Flip Layer', shortcut: 'F', icon: 'flipLayer' },
    { id: 'route', label: 'Route', shortcut: 'X', icon: 'route45', variants: [
      { id: 'route_45', label: '45-Deg Trace', shortcut: 'X', icon: 'route45' },
      { id: 'diff_pair', label: 'Diff-Pair', icon: 'diffPair' },
      { id: 'length_tune', label: 'Length Tune', icon: 'lengthTune' },
      { id: 'auto_route', label: 'Auto-Route', icon: 'autoRoute' },
    ]},
    { id: 'via', label: 'Drop Via', shortcut: 'V', icon: 'viaRing' },
    { id: 'zones', label: 'Zones', shortcut: 'Z', icon: 'copperPour', variants: [
      { id: 'copper_pour', label: 'Copper Pour', shortcut: 'Z', icon: 'copperPour' },
      { id: 'board_outline', label: 'Board Outline', icon: 'boardOutline' },
      { id: 'cutout', label: 'Cutout', icon: 'cutoutHole' },
      { id: 'mount_hole', label: 'Mounting Hole', icon: 'mountHole' },
    ]},
    { id: 'probe', label: 'Probe', shortcut: 'P', icon: 'probeNeedle', variants: [
      { id: 'probe_v', label: 'Voltage Probe', icon: 'probeNeedle' },
      { id: 'probe_i', label: 'Current Probe', icon: 'powerDrop' },
      { id: 'datasheet_proof', label: 'Datasheet Pin Proof', icon: 'datasheetPin' },
    ]},
    { id: 'ruler', label: 'Ruler Measure', shortcut: 'M', icon: 'rulerMeasure' },
  ];
}

export const ToolShelf: React.FC<{
  visible: boolean;
  workspace: WorkspaceId;
  activeTool: string;
  onSelectTool: (toolId: string) => void;
}> = ({ visible, workspace, activeTool, onSelectTool }) => {
  const [flyout, setFlyout] = useState<{ item: ToolShelfItem; left: number; top: number } | null>(null);
  if (!visible) return null;

  const tools = getToolsForWorkspace(workspace);

  return (
    <aside className="vd-tool-shelf" data-testid="zone3-tool-shelf" aria-label="CAD Tool Shelf">
      {tools.map((tool) => {
        const isActive = activeTool === tool.id || Boolean(tool.variants?.some((v) => v.id === activeTool));
        return (
          <button
            key={tool.id}
            type="button"
            data-testid={`tool-btn-${tool.id}`}
            data-active={isActive}
            className="vd-tool-btn"
            title={`${tool.label}${tool.shortcut ? ` [${tool.shortcut}]` : ''}${tool.variants ? ' (Right-click for variants)' : ''}`}
            onClick={(e) => {
              onSelectTool(tool.id);
              if (tool.variants && e.shiftKey) {
                const r = e.currentTarget.getBoundingClientRect();
                const pos = clampCoordsToViewport(r.right + 4, r.top, 260, 44);
                setFlyout({ item: tool, left: pos.left, top: pos.top });
              } else {
                setFlyout(null);
              }
            }}
            onContextMenu={(e) => {
              if (!tool.variants) return;
              e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              const pos = clampCoordsToViewport(r.right + 4, r.top, 260, 44);
              setFlyout({ item: tool, left: pos.left, top: pos.top });
            }}
          >
            <VajraIcon name={tool.icon} size={15} />
            {tool.variants && <span className="vd-flyout-corner" />}
          </button>
        );
      })}

      {flyout && flyout.item.variants && (
        <div
          className="vd-popover"
          data-testid={`tool-flyout-${flyout.item.id}`}
          style={{
            left: flyout.left,
            top: flyout.top,
            display: 'flex',
            flexDirection: 'row',
            gap: 4,
            minWidth: 'auto',
            padding: 4,
          }}
        >
          {flyout.item.variants.map((v) => (
            <button
              key={v.id}
              type="button"
              data-testid={`tool-variant-${v.id}`}
              className={`vd-btn ${activeTool === v.id ? 'vd-btn-primary' : ''}`}
              onClick={() => {
                onSelectTool(v.id);
                setFlyout(null);
              }}
            >
              <VajraIcon name={v.icon} size={13} /> {v.label}
            </button>
          ))}
        </div>
      )}
    </aside>
  );
};
