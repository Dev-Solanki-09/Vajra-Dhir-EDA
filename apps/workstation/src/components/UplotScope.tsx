import React, { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';

export interface UplotScopeProps {
  title: string;
  xLabel: string;
  seriesLabel: string;
  xValues: number[];
  yValues: number[];
  strokeColor?: string;
}

export const UplotScope: React.FC<UplotScopeProps> = ({
  title,
  xLabel,
  seriesLabel,
  xValues,
  yValues,
  strokeColor = '#38BDF8',
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = hostRef.current;
    if (!el || xValues.length === 0) return;

    const width = Math.max(320, el.clientWidth || 520);
    const opts: uPlot.Options = {
      title,
      width,
      height: 190,
      scales: { x: { time: false } },
      axes: [
        { stroke: '#94A3B8', grid: { stroke: '#1E2736', width: 1 }, label: xLabel },
        { stroke: '#94A3B8', grid: { stroke: '#1E2736', width: 1 } },
      ],
      series: [
        { label: xLabel },
        { label: seriesLabel, stroke: strokeColor, width: 2 },
      ],
    };

    const chart = new uPlot(opts, [xValues, yValues], el);
    return () => {
      chart.destroy();
    };
  }, [title, xLabel, seriesLabel, xValues, yValues, strokeColor]);

  return (
    <div
      data-testid="uplot-scope"
      ref={hostRef}
      style={{
        border: '1px solid var(--vd-border-subtle)',
        borderRadius: 6,
        backgroundColor: 'var(--vd-bg-canvas)',
        padding: 8,
        overflow: 'hidden',
      }}
    />
  );
};
