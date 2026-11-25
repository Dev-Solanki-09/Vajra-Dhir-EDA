import React, { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { globalCrossProbeBus } from '@vajradhir/crossprobe-bus';
import {
  BUCK_PD_SCHEMATIC_INPUT,
  LaidOutSchematic,
  runElkSchematicLayout,
} from '../engines/elkLayout';

export const SchematicElkCanvas: React.FC = () => {
  const [layout, setLayout] = useState<LaidOutSchematic | null>(null);
  const [layoutError, setLayoutError] = useState<string | null>(null);
  const [layoutMs, setLayoutMs] = useState<number>(0);

  const snapshot = useSyncExternalStore(
    globalCrossProbeBus.subscribeSnapshot,
    globalCrossProbeBus.getSnapshot
  );

  const computeLayout = useCallback(async () => {
    const start = performance.now();
    try {
      setLayoutError(null);
      const next = await runElkSchematicLayout(BUCK_PD_SCHEMATIC_INPUT);
      setLayout(next);
      setLayoutMs(Number((performance.now() - start).toFixed(2)));
    } catch (err) {
      setLayoutError(err instanceof Error ? err.message : 'ELK layout failure');
    }
  }, []);

  useEffect(() => {
    void computeLayout();
  }, [computeLayout]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, gap: 8 }}>
      <div
        className="vd-metric"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 10px',
          backgroundColor: 'var(--vd-bg-panel)',
          border: '1px solid var(--vd-border-subtle)',
          borderRadius: 4,
          fontSize: 12,
        }}
      >
        <span>
          Engine: {layout?.algorithm ?? 'elkjs'} · {layoutMs.toFixed(2)} ms · Rule: +V UP / GND DOWN
        </span>
        <button type="button" className="vd-btn vd-btn-primary" onClick={() => void computeLayout()}>
          Auto-Beautify (elkjs)
        </button>
      </div>

      {layoutError && (
        <div role="alert" style={{ color: 'var(--vd-fail)', fontSize: 13 }}>
          {layoutError}
        </div>
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          border: '1px solid var(--vd-border-subtle)',
          borderRadius: 6,
          backgroundColor: 'var(--vd-bg-canvas)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {layout ? (
          <svg
            data-testid="schematic-elk-svg"
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            style={{ width: '100%', height: '100%', maxHeight: 360 }}
            aria-label="ELK Auto-Laid Out Schematic"
          >
            {layout.edges.map((edge) => {
              const pathPoints = edge.points.map(([px, py]) => `${px},${py}`).join(' ');
              const active = snapshot.activeHighlight.netId === edge.netName;
              return (
                <g key={edge.id}>
                  <polyline
                    points={pathPoints}
                    fill="none"
                    stroke={active ? 'var(--vd-border-active)' : edge.colorToken}
                    strokeWidth={active ? 3.5 : 2.2}
                    style={{ cursor: 'pointer' }}
                    onClick={() => globalCrossProbeBus.highlightNet(edge.netName, 'schematic')}
                  />
                </g>
              );
            })}

            {layout.nodes.map((node) => {
              const isSelected = snapshot.selection.entityIds.includes(node.refdes);
              return (
                <g
                  key={node.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => globalCrossProbeBus.select([node.refdes], 'schematic')}
                >
                  <rect
                    x={node.x}
                    y={node.y}
                    width={node.width}
                    height={node.height}
                    rx={4}
                    fill="var(--vd-bg-panel)"
                    stroke={isSelected ? 'var(--vd-human-lock)' : 'var(--vd-border-subtle)'}
                    strokeWidth={isSelected ? 2.5 : 1.5}
                  />
                  <text
                    x={node.x + 10}
                    y={node.y + 20}
                    fill="var(--vd-text-primary)"
                    fontSize={12}
                    fontWeight={600}
                    fontFamily="var(--vd-font-mono)"
                  >
                    {node.refdes}
                  </text>
                  <text
                    x={node.x + 10}
                    y={node.y + 38}
                    fill="var(--vd-text-secondary)"
                    fontSize={10}
                    fontFamily="var(--vd-font-ui)"
                  >
                    {node.value}
                  </text>
                  {node.pins.map((pin) => (
                    <circle
                      key={pin.id}
                      cx={pin.x}
                      cy={pin.y}
                      r={3}
                      fill="var(--vd-layer-silk)"
                    />
                  ))}
                </g>
              );
            })}
          </svg>
        ) : (
          <span className="vd-metric" style={{ color: 'var(--vd-text-secondary)', fontSize: 13 }}>
            Computing elkjs schematic layout...
          </span>
        )}
      </div>
    </div>
  );
};
