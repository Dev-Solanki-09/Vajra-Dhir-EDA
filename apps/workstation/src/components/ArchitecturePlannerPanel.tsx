import React, { useEffect, useMemo, useState } from 'react';
import {
  Background,
  Handle,
  Position,
  ReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { globalCrossProbeBus } from '@vajradhir/crossprobe-bus';
import {
  BUS_PROTOCOL_COLORS,
  STARTER_COMPOSITE_TEMPLATES,
  type ArchBlock,
  type BusProtocol,
} from '@vajradhir/arch-core';
import { globalArchitectureStore, useArchitectureSnapshot } from '../architectureStore';

interface BlockNodeData extends Record<string, unknown> {
  block: ArchBlock;
  severity: 'ok' | 'warning' | 'error';
  selectedInProbe: boolean;
}

const CompositeBlockNode: React.FC<NodeProps<Node<BlockNodeData>>> = ({ data, selected }) => {
  const { block, severity, selectedInProbe } = data;
  const borderColor =
    severity === 'error'
      ? 'var(--vd-fail)'
      : severity === 'warning'
        ? 'var(--vd-warn)'
        : selected || selectedInProbe
          ? 'var(--vd-border-active)'
          : 'var(--vd-border-subtle)';

  const watts = ((block.voltageV * (block.drawMa || block.maxOutputMa)) / 1000).toFixed(2);

  return (
    <div
      data-testid={`arch-node-${block.id}`}
      style={{
        width: 240,
        padding: '8px 10px',
        borderRadius: 6,
        backgroundColor: 'var(--vd-bg-elevated)',
        color: 'var(--vd-text-primary)',
        border: `2px solid ${borderColor}`,
        boxShadow: selectedInProbe ? '0 0 0 2px rgba(56, 189, 248, 0.35)' : undefined,
        fontSize: 11,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: '#38BDF8', width: 8, height: 8 }} />
      <Handle type="source" position={Position.Right} style={{ background: '#F59E0B', width: 8, height: 8 }} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <strong style={{ fontSize: 12 }}>{block.name}</strong>
        <span
          className="vd-metric"
          style={{
            padding: '1px 5px',
            borderRadius: 4,
            fontSize: 10,
            backgroundColor: severity === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(56, 189, 248, 0.14)',
            color: severity === 'error' ? 'var(--vd-fail)' : 'var(--vd-border-active)',
          }}
        >
          {block.voltageV.toFixed(1)}V · {watts}W
        </span>
      </div>

      <div style={{ color: 'var(--vd-text-secondary)', fontSize: 10, marginBottom: 4 }}>{block.role}</div>

      <div className="vd-metric" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10 }}>
        <span>
          {block.kind === 'regulator' || block.kind === 'power_source'
            ? `Cap: ${block.maxOutputMa} mA`
            : `Draw: ${block.drawMa} mA`}
        </span>
        <span style={{ color: block.tolerance === '3.3V_NON_5V_TOLERANT' ? 'var(--vd-warn)' : 'var(--vd-text-secondary)' }}>
          {block.tolerance === '3.3V_NON_5V_TOLERANT' ? 'Non-5V Tol' : block.kind}
        </span>
      </div>

      <div style={{ marginTop: 4, fontSize: 10, color: 'var(--vd-pass)' }}>
        Parts: {block.memberRefdes.join(', ') || 'unmapped'}
      </div>
    </div>
  );
};

const NODE_TYPES: NodeTypes = {
  compositeBlock: CompositeBlockNode,
};

export const ArchitecturePlannerPanel: React.FC = () => {
  const archSnap = useArchitectureSnapshot();
  const [wireProtocol, setWireProtocol] = useState<BusProtocol>('PowerRail');
  const [wireVoltageV, setWireVoltageV] = useState<number>(3.3);
  const [selectedRefdes, setSelectedRefdes] = useState<string>('');

  // CrossProbeBus -> highlight parent block when user clicks component in 2D (P2) or 3D (P3)
  useEffect(() => {
    const applySelection = (entityIds: string[], source: string) => {
      if (!entityIds.length) return;
      const first = entityIds[0];
      setSelectedRefdes(first);
      if (source !== 'schematic') {
        globalArchitectureStore.selectBlockForRefdes(first);
      }
    };
    const initSel = globalCrossProbeBus.getSnapshot().selection;
    applySelection(initSel.entityIds, initSel.source);
    return globalCrossProbeBus.onSelection((ev) => applySelection(ev.entityIds, ev.source));
  }, []);

  const selectedBlock =
    archSnap.architecture.blocks.find((b) => b.id === archSnap.selectedBlockId) ??
    archSnap.architecture.blocks[0] ??
    null;

  const nodes: Node<BlockNodeData>[] = useMemo(
    () =>
      archSnap.architecture.blocks.map((b) => ({
        id: b.id,
        type: 'compositeBlock',
        position: { x: b.x, y: b.y },
        selected: b.id === archSnap.selectedBlockId,
        data: {
          block: b,
          severity: archSnap.report.blockSeverityById[b.id] ?? 'ok',
          selectedInProbe: Boolean(selectedRefdes && b.memberRefdes.includes(selectedRefdes)),
        },
      })),
    [archSnap.architecture.blocks, archSnap.selectedBlockId, archSnap.report.blockSeverityById, selectedRefdes]
  );

  const edges: Edge[] = useMemo(
    () =>
      archSnap.architecture.buses.map((bus) => {
        const hasErr = archSnap.report.findings.some((f) => f.busId === bus.id && f.severity === 'error');
        const stroke = hasErr ? '#EF4444' : BUS_PROTOCOL_COLORS[bus.protocol];
        return {
          id: bus.id,
          source: bus.source,
          target: bus.target,
          animated: bus.protocol === 'PowerRail',
          label: `${bus.protocol} ${bus.railVoltageV.toFixed(1)}V (${bus.expectedMa}mA)`,
          style: { stroke, strokeWidth: hasErr ? 3 : 2 },
          labelStyle: { fill: '#E6EDF7', fontSize: 10, fontFamily: 'var(--vd-font-mono)' },
          labelBgStyle: { fill: '#0B0E14', fillOpacity: 0.85 },
        };
      }),
    [archSnap.architecture.buses, archSnap.report.findings]
  );

  const onNodeClick = (_evt: React.MouseEvent, node: Node<BlockNodeData>) => {
    const blk = node.data.block;
    globalArchitectureStore.selectBlock(blk.id);
    if (blk.memberRefdes.length > 0) {
      globalCrossProbeBus.select(blk.memberRefdes, 'schematic');
    }
  };

  const onConnect = (conn: Connection) => {
    if (!conn.source || !conn.target) return;
    globalArchitectureStore.connectBus(conn.source, conn.target, wireProtocol, wireVoltageV);
  };

  const onNodeDragStop = (_evt: unknown, node: Node<BlockNodeData>) => {
    globalArchitectureStore.updateBlockPositions({ [node.id]: node.position }, true);
  };

  const totalWatts = (archSnap.report.totalLoadMw / 1000).toFixed(2);

  return (
    <div
      data-testid="architecture-planner-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        height: '100%',
        minHeight: 420,
        backgroundColor: '#0B0E14',
        border: '1px solid var(--vd-border-subtle)',
        borderRadius: 6,
        padding: 8,
      }}
    >
      {/* Top Architecture Toolbar: Templates, Buses, ELK Layout, Undo/Redo */}
      <div
        className="vd-metric"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 6,
          padding: '6px 8px',
          backgroundColor: 'var(--vd-bg-panel)',
          border: '1px solid var(--vd-border-subtle)',
          borderRadius: 4,
          fontSize: 11,
        }}
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
          <strong>Add Module:</strong>
          {STARTER_COMPOSITE_TEMPLATES.map((tpl) => (
            <button
              key={tpl.templateId}
              type="button"
              data-testid={`arch-add-${tpl.templateId}`}
              className="vd-btn"
              style={{ minHeight: 22, padding: '2px 7px', fontSize: 10 }}
              onClick={() => globalArchitectureStore.addTemplateBlock(tpl.templateId ?? tpl.id)}
            >
              + {tpl.name}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10 }}>
            Bus:
            <select
              aria-label="Bus Protocol"
              value={wireProtocol}
              onChange={(e) => setWireProtocol(e.target.value as BusProtocol)}
              style={{
                backgroundColor: 'var(--vd-bg-canvas)',
                color: 'var(--vd-text-primary)',
                border: '1px solid var(--vd-border-subtle)',
                borderRadius: 3,
                fontSize: 10,
              }}
            >
              {(['PowerRail', 'I2C', 'SPI', 'UART', 'CAN', 'USB', 'PWM', 'ADC', 'GPIO'] as BusProtocol[]).map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <input
            type="number"
            step="0.1"
            aria-label="Rail Voltage V"
            value={wireVoltageV}
            onChange={(e) => setWireVoltageV(Number(e.target.value) || 0)}
            style={{
              width: 48,
              backgroundColor: 'var(--vd-bg-canvas)',
              color: 'var(--vd-text-primary)',
              border: '1px solid var(--vd-border-subtle)',
              borderRadius: 3,
              fontSize: 10,
              padding: '1px 4px',
            }}
          />
          <button
            type="button"
            data-testid="arch-elk-layout-btn"
            className="vd-btn"
            style={{ minHeight: 22, padding: '2px 7px', fontSize: 10 }}
            onClick={() => void globalArchitectureStore.autoLayoutWithElk()}
          >
            ELK Auto-Layout
          </button>
          <button
            type="button"
            data-testid="arch-undo-btn"
            className="vd-btn"
            style={{ minHeight: 22, padding: '2px 7px', fontSize: 10 }}
            disabled={!archSnap.canUndo}
            onClick={() => globalArchitectureStore.undo()}
          >
            Undo
          </button>
          <button
            type="button"
            data-testid="arch-redo-btn"
            className="vd-btn"
            style={{ minHeight: 22, padding: '2px 7px', fontSize: 10 }}
            disabled={!archSnap.canRedo}
            onClick={() => globalArchitectureStore.redo()}
          >
            Redo
          </button>
          <button
            type="button"
            data-testid="arch-gen-ato-btn"
            className="vd-btn vd-btn-primary"
            style={{ minHeight: 22, padding: '2px 7px', fontSize: 10 }}
            onClick={() => void globalArchitectureStore.generateAtoCircuitStub()}
          >
            Sync .ato Stubs
          </button>
        </div>
      </div>

      {/* Live Power Budget & Electrical Warnings Bar */}
      <div
        data-testid="arch-power-rollup"
        className="vd-metric"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
          padding: '4px 10px',
          backgroundColor: archSnap.report.findings.some((f) => f.severity === 'error')
            ? 'rgba(239, 68, 68, 0.14)'
            : 'var(--vd-bg-panel)',
          border: `1px solid ${
            archSnap.report.findings.some((f) => f.severity === 'error')
              ? 'var(--vd-fail)'
              : 'var(--vd-border-subtle)'
          }`,
          borderRadius: 4,
          fontSize: 11,
        }}
      >
        <span>
          Power Rollup: <strong>{totalWatts} W</strong> ({archSnap.report.totalLoadMa} mA total load) ·{' '}
          {archSnap.report.railRollups
            .map((r) => `${r.sourceName} ${r.loadMa}/${r.capacityMa} mA (${r.utilizationPct}%)`)
            .join(' | ')}
        </span>
        <span
          data-testid="arch-warning-count"
          style={{
            color:
              archSnap.report.findings.length > 0 ? 'var(--vd-fail)' : 'var(--vd-pass)',
          }}
        >
          {archSnap.report.findings.length === 0
            ? 'Electrical Contracts PASS'
            : `${archSnap.report.findings.length} Warning/Fault(s)`}
        </span>
      </div>

      {/* Main Split: xyflow Interactive Canvas + Why-It-Exists & Contract Inspector */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 270px', gap: 8, flex: 1, minHeight: 300 }}>
        <div
          data-testid="xyflow-canvas-host"
          style={{
            position: 'relative',
            border: '1px solid var(--vd-border-subtle)',
            borderRadius: 6,
            overflow: 'hidden',
            backgroundColor: '#0B0E14',
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            onNodeClick={onNodeClick}
            onConnect={onConnect}
            onNodeDragStop={onNodeDragStop}
            fitView
          >
            <Background color="#1E293B" gap={18} />
          </ReactFlow>
        </div>

        {/* Right Card: Purpose, Composite Contract & Fault Explanations */}
        <div
          data-testid="arch-inspector-card"
          className="vd-metric"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            padding: 10,
            backgroundColor: 'var(--vd-bg-panel)',
            border: '1px solid var(--vd-border-subtle)',
            borderRadius: 6,
            overflowY: 'auto',
            fontSize: 11,
          }}
        >
          <div>
            <strong>Why This System Exists</strong>
            <div style={{ color: 'var(--vd-text-secondary)', marginTop: 2 }}>
              {archSnap.architecture.purpose}
            </div>
          </div>

          {selectedBlock && (
            <div style={{ borderTop: '1px solid var(--vd-border-subtle)', paddingTop: 6 }}>
              <strong>Block: {selectedBlock.name}</strong>
              <div style={{ color: 'var(--vd-text-secondary)', marginTop: 2 }}>{selectedBlock.role}</div>
              <div style={{ marginTop: 4 }}>Tolerance: <code>{selectedBlock.tolerance}</code></div>
              <div>Notes: {selectedBlock.bootstrapNotes || 'n/a'}</div>
              <div style={{ marginTop: 4 }}>
                Footprint: <code>{selectedBlock.mountingFootprint || 'custom'}</code>
              </div>
              <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {selectedBlock.memberRefdes.map((ref) => (
                  <button
                    key={ref}
                    type="button"
                    data-testid={`arch-probe-part-${ref}`}
                    className="vd-btn vd-btn-primary"
                    style={{ minHeight: 20, padding: '1px 6px', fontSize: 10 }}
                    onClick={() => globalCrossProbeBus.select([ref], 'schematic')}
                  >
                    Probe {ref}
                  </button>
                ))}
                <button
                  type="button"
                  data-testid="arch-wire-unsafe-5v-btn"
                  className="vd-btn"
                  style={{ minHeight: 20, padding: '1px 6px', fontSize: 10 }}
                  onClick={() => {
                    const firstPower = archSnap.architecture.blocks.find((b) => b.kind === 'power_source') ?? archSnap.architecture.blocks[0];
                    if (firstPower && selectedBlock && firstPower.id !== selectedBlock.id) {
                      globalArchitectureStore.connectBus(firstPower.id, selectedBlock.id, 'PowerRail', 5.0, 600);
                    }
                  }}
                >
                  Test Wire 5V Rail
                </button>
              </div>
            </div>
          )}

          {archSnap.report.findings.length > 0 && (
            <div style={{ borderTop: '1px solid var(--vd-border-subtle)', paddingTop: 6 }}>
              <strong style={{ color: 'var(--vd-fail)' }}>Active Contract Alerts</strong>
              {archSnap.report.findings.map((f) => (
                <div
                  key={f.id}
                  data-testid={`arch-finding-${f.ruleId}`}
                  style={{
                    marginTop: 4,
                    padding: 6,
                    borderRadius: 4,
                    backgroundColor: 'rgba(239, 68, 68, 0.12)',
                    border: '1px solid var(--vd-fail)',
                    fontSize: 10,
                  }}
                >
                  <strong>{f.ruleId}:</strong> {f.message}
                </div>
              ))}
            </div>
          )}

          <div style={{ marginTop: 'auto', fontSize: 10, color: 'var(--vd-text-secondary)' }}>
            {archSnap.statusNote}
          </div>
        </div>
      </div>
    </div>
  );
};
