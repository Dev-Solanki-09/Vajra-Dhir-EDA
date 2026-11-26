import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { VajraIcon } from './VajraIcons';

export function clampCoordsToViewport(
  x: number,
  y: number,
  width: number,
  height: number,
  margin = 8
): { left: number; top: number } {
  if (typeof window === 'undefined') return { left: x, top: y };
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(margin, Math.min(x, vw - width - margin));
  const top = Math.max(margin, Math.min(y, vh - height - margin));
  return { left, top };
}

export const Popover: React.FC<{
  open: boolean;
  anchorRect: { left: number; top: number; bottom: number; right: number } | null;
  onClose: () => void;
  children: React.ReactNode;
  'data-testid'?: string;
  minWidth?: number;
}> = ({ open, anchorRect, onClose, children, 'data-testid': testId, minWidth = 200 }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ left: 8, top: 32 });

  useLayoutEffect(() => {
    if (!open || !anchorRect) return;
    const rect = ref.current?.getBoundingClientRect();
    const w = rect?.width || minWidth;
    const h = rect?.height || 220;
    setPos(clampCoordsToViewport(anchorRect.left, anchorRect.bottom + 2, w, h));
  }, [open, anchorRect, minWidth]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open || !anchorRect) return null;

  return (
    <div
      ref={ref}
      className="vd-popover"
      data-testid={testId}
      style={{ left: pos.left, top: pos.top, minWidth }}
    >
      {children}
    </div>
  );
};

export interface ContextMenuEntry {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  separator?: boolean;
  onSelect?: () => void;
}

export const ContextMenu: React.FC<{
  open: boolean;
  x: number;
  y: number;
  items: ContextMenuEntry[];
  onClose: () => void;
  'data-testid'?: string;
}> = ({ open, x, y, items, onClose, 'data-testid': testId }) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    if (!open) return;
    const rect = ref.current?.getBoundingClientRect();
    setPos(clampCoordsToViewport(x, y, rect?.width || 210, rect?.height || 220));
  }, [open, x, y, items.length]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div ref={ref} className="vd-popover" data-testid={testId} role="menu" style={{ left: pos.left, top: pos.top, minWidth: 205 }}>
      <div className="vd-menu-list">
        {items.map((item) =>
          item.separator ? (
            <div key={item.id} className="vd-menu-sep" />
          ) : (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className="vd-menu-item"
              disabled={item.disabled}
              onClick={() => {
                item.onSelect?.();
                onClose();
              }}
            >
              <span>{item.label}</span>
              {item.shortcut && <span className="vd-metric" style={{ color: 'var(--vd-text-muted)', fontSize: 10 }}>{item.shortcut}</span>}
            </button>
          )
        )}
      </div>
    </div>
  );
};

export const FloatingWindow: React.FC<{
  open: boolean;
  title: string;
  onClose: () => void;
  initialWidth?: number;
  initialTop?: number;
  initialLeft?: number;
  children: React.ReactNode;
  'data-testid'?: string;
}> = ({
  open,
  title,
  onClose,
  initialWidth = 420,
  initialTop = 84,
  initialLeft = 180,
  children,
  'data-testid': testId,
}) => {
  const [pos, setPos] = useState(() => clampCoordsToViewport(initialLeft, initialTop, initialWidth, 320));
  const [pinned, setPinned] = useState(false);
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pinned) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, pinned, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label={title}
      data-testid={testId}
      style={{
        position: 'fixed',
        left: pos.left,
        top: pos.top,
        width: `min(${initialWidth}px, calc(100vw - 16px))`,
        maxHeight: 'calc(100vh - 48px)',
        backgroundColor: 'var(--vd-bg-panel)',
        border: '1px solid var(--vd-border-strong)',
        borderRadius: 3,
        zIndex: 82,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        data-testid={testId ? `${testId}-header` : undefined}
        onPointerDown={(e) => {
          dragRef.current = { dx: e.clientX - pos.left, dy: e.clientY - pos.top };
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragRef.current) return;
          setPos(clampCoordsToViewport(e.clientX - dragRef.current.dx, e.clientY - dragRef.current.dy, initialWidth, 240));
        }}
        onPointerUp={() => {
          dragRef.current = null;
        }}
        style={{
          height: 26,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px',
          backgroundColor: 'var(--vd-bg-elevated)',
          borderBottom: '1px solid var(--vd-border-subtle)',
          cursor: 'move',
          userSelect: 'none',
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        <span>{title}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            type="button"
            className={`vd-btn vd-btn-icon ${pinned ? 'vd-btn-primary' : ''}`}
            style={{ minHeight: 18, fontSize: 10 }}
            onClick={() => setPinned((p) => !p)}
            title={pinned ? 'Pinned (Esc ignored)' : 'Pin window'}
          >
            Pin
          </button>
          <button type="button" className="vd-btn vd-btn-icon" style={{ minHeight: 18 }} onClick={onClose} aria-label={`Close ${title}`}>
            <VajraIcon name="close" size={11} />
          </button>
        </div>
      </div>
      <div style={{ padding: 10, overflowY: 'auto', fontSize: 11.5 }}>{children}</div>
    </div>
  );
};
