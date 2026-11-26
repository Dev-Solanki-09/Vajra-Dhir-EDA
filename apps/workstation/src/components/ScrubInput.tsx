import React, { useRef, useState } from 'react';

export interface ScrubInputProps {
  label: string;
  value: number;
  unit?: string;
  step?: number;
  onChange: (nextVal: number) => void;
}

export const ScrubInput: React.FC<ScrubInputProps> = ({
  label,
  value,
  unit = 'mm',
  step = 0.1,
  onChange,
}) => {
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startVal = useRef(value);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
      <span
        onPointerDown={(e) => {
          setDragging(true);
          startX.current = e.clientX;
          startVal.current = value;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragging) return;
          const mult = e.shiftKey ? 5 : e.altKey ? 0.1 : 1;
          const delta = Math.round((e.clientX - startX.current) / 4) * step * mult;
          onChange(Number((startVal.current + delta).toFixed(3)));
        }}
        onPointerUp={() => setDragging(false)}
        style={{ cursor: 'ew-resize', color: 'var(--vd-text-secondary)', userSelect: 'none', minWidth: 32 }}
        title="Drag horizontally to scrub (Shift=5x, Alt=0.1x)"
      >
        {label}
      </span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="vd-metric"
        style={{
          width: 72,
          padding: '2px 5px',
          backgroundColor: 'var(--vd-bg-canvas)',
          color: 'var(--vd-text-primary)',
          border: '1px solid var(--vd-border-subtle)',
          borderRadius: 4,
          fontSize: 11,
        }}
      />
      <span className="vd-metric" style={{ color: 'var(--vd-text-muted)' }}>{unit}</span>
    </div>
  );
};
