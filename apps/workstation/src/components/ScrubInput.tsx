import React, { useEffect, useRef, useState } from 'react';

export interface ScrubInputProps {
  label: string;
  value: number;
  unit?: string;
  step?: number;
  onChange: (nextVal: number) => void;
  'data-testid'?: string;
}

/**
 * Evaluate simple numeric expressions and optional `mil` / `mm` / `nm` unit suffixes
 * (e.g., "10 + 2.5" -> 12.5, "100mil" -> 2.54 mm). Zero eval/Function usage.
 */
export function evaluateScrubExpression(raw: string, fallback: number): number {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return fallback;
  let multiplier = 1;
  let expr = trimmed;
  if (expr.endsWith('mil')) {
    multiplier = 0.0254;
    expr = expr.slice(0, -3).trim();
  } else if (expr.endsWith('nm')) {
    multiplier = 1e-6;
    expr = expr.slice(0, -2).trim();
  } else if (expr.endsWith('mm')) {
    expr = expr.slice(0, -2).trim();
  }

  const noSpace = expr.replace(/\s+/g, '');
  const tokens: string[] = [];
  let idx = 0;
  while (idx < noSpace.length) {
    const ch = noSpace[idx];
    const expectNum = tokens.length % 2 === 0;
    if (expectNum) {
      const m = noSpace.slice(idx).match(/^[+-]?(?:\d+\.?\d*|\.\d+)/);
      if (!m) return fallback;
      tokens.push(m[0]);
      idx += m[0].length;
    } else if ('+-*/'.includes(ch)) {
      tokens.push(ch);
      idx += 1;
    } else {
      return fallback;
    }
  }
  if (tokens.length === 0 || tokens.length % 2 === 0) {
    const direct = Number(noSpace);
    return Number.isFinite(direct) ? Number((direct * multiplier).toFixed(4)) : fallback;
  }

  // Evaluate * and / first, then + and -
  const values: number[] = [];
  const ops: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i];
    if (i % 2 === 0) {
      const n = Number(tk);
      if (!Number.isFinite(n)) return fallback;
      values.push(n);
    } else {
      ops.push(tk);
    }
  }
  if (values.length === 0) return fallback;
  const reducedVals: number[] = [values[0]];
  const reducedOps: string[] = [];
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const rhs = values[i + 1];
    if (rhs === undefined) break;
    if (op === '*') {
      reducedVals[reducedVals.length - 1] *= rhs;
    } else if (op === '/') {
      if (rhs === 0) return fallback;
      reducedVals[reducedVals.length - 1] /= rhs;
    } else {
      reducedOps.push(op);
      reducedVals.push(rhs);
    }
  }
  let acc = reducedVals[0];
  for (let i = 0; i < reducedOps.length; i++) {
    const rhs = reducedVals[i + 1] ?? 0;
    acc = reducedOps[i] === '-' ? acc - rhs : acc + rhs;
  }
  if (!Number.isFinite(acc)) return fallback;
  return Number((acc * multiplier).toFixed(4));
}

export const ScrubInput: React.FC<ScrubInputProps> = ({
  label,
  value,
  unit = 'mm',
  step = 0.1,
  onChange,
  'data-testid': testId,
}) => {
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const startX = useRef(0);
  const startVal = useRef(value);

  useEffect(() => {
    if (!editing && !draggingRef.current) {
      setDraft(String(value));
    }
  }, [value]);

  const commitDraft = () => {
    setEditing(false);
    const evaluated = evaluateScrubExpression(draft, value);
    setDraft(String(evaluated));
    if (evaluated !== value) {
      onChange(evaluated);
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, fontSize: 11 }}>
      <span
        data-testid={testId ? `${testId}-label` : undefined}
        onPointerDown={(e) => {
          draggingRef.current = true;
          setDragging(true);
          startX.current = e.clientX;
          startVal.current = value;
          try {
            (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          } catch {
            // Synthetic pointer events may not have active pointer capture
          }
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current) return;
          const mult = e.shiftKey ? 0.1 : e.altKey ? 5 : 1;
          const delta = Math.round((e.clientX - startX.current) / 4) * step * mult;
          const next = Number((startVal.current + delta).toFixed(3));
          setDraft(String(next));
          onChange(next);
        }}
        onPointerUp={() => {
          draggingRef.current = false;
          setDragging(false);
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
          setDragging(false);
        }}
        style={{
          cursor: 'ew-resize',
          color: 'var(--vd-text-secondary)',
          userSelect: 'none',
          minWidth: 44,
        }}
        title="Drag horizontally to scrub (Shift=fine 0.01mm, Alt=coarse). Type math e.g. 10 + 2.5 or 100mil."
      >
        {label}
      </span>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          backgroundColor: 'var(--vd-bg-canvas)',
          border: `1px solid ${editing ? 'var(--vd-border-active)' : 'var(--vd-border-subtle)'}`,
          borderRadius: 2,
          paddingRight: 5,
        }}
      >
        <input
          type="text"
          aria-label={label}
          data-testid={testId}
          value={draft}
          onFocus={() => setEditing(true)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              commitDraft();
              (e.currentTarget as HTMLInputElement).blur();
            } else if (e.key === 'Escape') {
              setEditing(false);
              setDraft(String(value));
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          className="vd-metric"
          style={{
            width: 78,
            padding: '2px 5px',
            backgroundColor: 'transparent',
            color: 'var(--vd-text-primary)',
            border: 'none',
            outline: 'none',
            fontSize: 11,
            textAlign: 'right',
          }}
        />
        <span className="vd-metric" style={{ color: 'var(--vd-text-muted)', fontSize: 10 }}>
          {unit}
        </span>
      </div>
    </div>
  );
};
