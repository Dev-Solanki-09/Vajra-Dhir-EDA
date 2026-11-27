import { useCallback, useRef } from 'react';
import { useSettingsStore } from '../store/useSettingsStore';

export interface AlignmentGuide {
  axis: 'x' | 'y';
  posWorld: number;
  refStartWorld: number;
  refEndWorld: number;
  label: string;
}

export interface RedlineDistance {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  dxMm: number;
  dyMm: number;
  distMm: number;
}

export function emitLiveCursorCoords(xMm: number, yMm: number, layer?: string) {
  if (typeof window === 'undefined') return;
  const xEl = document.querySelector('[data-testid="status-cursor-coords"]');
  if (xEl) {
    const unit = useSettingsStore.getState().settings.navigation.unit || 'mm';
    const fmt = (v: number) =>
      unit === 'mil'
        ? `${(v * 39.3701).toFixed(1)} mil`
        : unit === 'nm'
          ? `${Math.round(v * 1_000_000)} nm`
          : `${v.toFixed(3)} mm`;
    xEl.textContent = `X: ${fmt(xMm)}  Y: ${fmt(yMm)}${layer ? ` · ${layer}` : ''}`;
  }
}

export function computeAlignmentGuides(
  movingRef: string,
  xMm: number,
  yMm: number,
  neighbors: Array<{ refdes: string; worldXMm: number; worldYMm: number }>,
  thresholdMm = 0.6
): { snappedX: number; snappedY: number; guides: AlignmentGuide[] } {
  let snappedX = xMm;
  let snappedY = yMm;
  const guides: AlignmentGuide[] = [];
  for (const n of neighbors) {
    if (n.refdes === movingRef) continue;
    if (Math.abs(n.worldXMm - xMm) <= thresholdMm) {
      snappedX = n.worldXMm;
      guides.push({
        axis: 'x',
        posWorld: n.worldXMm,
        refStartWorld: Math.min(yMm, n.worldYMm),
        refEndWorld: Math.max(yMm, n.worldYMm),
        label: `ΔY=${Math.abs(yMm - n.worldYMm).toFixed(2)}mm`,
      });
    }
    if (Math.abs(n.worldYMm - yMm) <= thresholdMm) {
      snappedY = n.worldYMm;
      guides.push({
        axis: 'y',
        posWorld: n.worldYMm,
        refStartWorld: Math.min(xMm, n.worldXMm),
        refEndWorld: Math.max(xMm, n.worldXMm),
        label: `ΔX=${Math.abs(xMm - n.worldXMm).toFixed(2)}mm`,
      });
    }
  }
  return { snappedX, snappedY, guides: guides.slice(0, 4) };
}

export function computeAltRedlineDistance(
  a: { xMm: number; yMm: number },
  b: { xMm: number; yMm: number }
): RedlineDistance {
  const dxMm = Math.abs(b.xMm - a.xMm);
  const dyMm = Math.abs(b.yMm - a.yMm);
  return {
    x1: a.xMm,
    y1: a.yMm,
    x2: b.xMm,
    y2: b.yMm,
    dxMm,
    dyMm,
    distMm: Math.hypot(dxMm, dyMm),
  };
}

export function useUnifiedViewport(options: {
  onZoom?: (factor: number, clientX: number, clientY: number) => void;
  onPanDelta?: (dxPx: number, dyPx: number) => void;
  onFit?: () => void;
  onContextMenu?: (clientX: number, clientY: number) => void;
}) {
  const spaceHeldRef = useRef(false);
  const panStateRef = useRef<{ active: boolean; button: number; startX: number; startY: number; lastX: number; lastY: number; moved: boolean }>({
    active: false,
    button: -1,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    moved: false,
  });

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      const invert = useSettingsStore.getState().settings.navigation.invertScrollZoom ? -1 : 1;
      if (e.ctrlKey || Math.abs(e.deltaY) > 0) {
        e.preventDefault();
        const factor = e.deltaY * invert < 0 ? 1.12 : 0.89;
        options.onZoom?.(factor, e.clientX, e.clientY);
      } else if (Math.abs(e.deltaX) > 0) {
        e.preventDefault();
        options.onPanDelta?.(-e.deltaX, -e.deltaY);
      }
    },
    [options]
  );

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    const isMiddle = e.button === 1;
    const isRight = e.button === 2;
    const isSpaceLeft = e.button === 0 && spaceHeldRef.current;
    if (isMiddle || isRight || isSpaceLeft) {
      panStateRef.current = {
        active: true,
        button: e.button,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        moved: false,
      };
    }
  }, []);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      const p = panStateRef.current;
      if (!p.active) return;
      const dx = e.clientX - p.lastX;
      const dy = e.clientY - p.lastY;
      if (Math.hypot(e.clientX - p.startX, e.clientY - p.startY) > 4) {
        p.moved = true;
      }
      p.lastX = e.clientX;
      p.lastY = e.clientY;
      if (p.moved) {
        options.onPanDelta?.(dx, dy);
      }
    },
    [options]
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent) => {
      const p = panStateRef.current;
      if (p.active && p.button === 2 && !p.moved) {
        options.onContextMenu?.(e.clientX, e.clientY);
      }
      p.active = false;
    },
    [options]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (!panStateRef.current.moved) {
        options.onContextMenu?.(e.clientX, e.clientY);
      }
    },
    [options]
  );

  const setSpaceHeld = useCallback((held: boolean) => {
    spaceHeldRef.current = held;
  }, []);

  return {
    handleWheel,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleContextMenu,
    setSpaceHeld,
    isSpaceHeld: () => spaceHeldRef.current,
  };
}
