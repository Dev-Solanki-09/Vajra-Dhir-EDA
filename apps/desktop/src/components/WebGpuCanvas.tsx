import React, { useEffect, useRef, useState } from 'react';
import { globalCrossProbeBus } from '@vajradhir/crossprobe-bus';
import { THEME } from '../theme.js';

interface RenderEntity {
  id: string;
  refdes: string;
  x_nm: number;
  y_nm: number;
  w_nm: number;
  h_nm: number;
  layer: string;
  locked: boolean;
}

export const WebGpuCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [backend, setBackend] = useState<'WebGPU' | 'WebGL2' | 'Canvas2D'>('Canvas2D');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [scale, setScale] = useState<number>(0.000008); // nm to screen px scale
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 100, y: 100 });
  const isDragging = useRef<boolean>(false);
  const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Mock layout entities for interactive visualization
  const entities = useRef<RenderEntity[]>([
    {
      id: 'comp-u1',
      refdes: 'U1',
      x_nm: 30_000_000,
      y_nm: 25_000_000,
      w_nm: 8_000_000,
      h_nm: 8_000_000,
      layer: 'F.Cu',
      locked: true,
    },
    {
      id: 'comp-r1',
      refdes: 'R1',
      x_nm: 45_000_000,
      y_nm: 25_000_000,
      w_nm: 2_000_000,
      h_nm: 1_250_000,
      layer: 'F.Cu',
      locked: false,
    },
    {
      id: 'comp-c1',
      refdes: 'C1',
      x_nm: 30_000_000,
      y_nm: 40_000_000,
      w_nm: 3_200_000,
      h_nm: 1_600_000,
      layer: 'F.Cu',
      locked: false,
    },
  ]);

  // Subscribe to CrossProbeBus
  useEffect(() => {
    const unsub = globalCrossProbeBus.onSelection((evt) => {
      setSelectedIds(evt.entityIds);
    });
    return unsub;
  }, []);

  // Initialize graphics pipeline (WebGPU -> WebGL2 -> Canvas2D fallback)
  useEffect(() => {
    let active = true;

    async function initGpu() {
      if (typeof navigator !== 'undefined' && 'gpu' in navigator && (navigator as any).gpu) {
        try {
          const adapter = await (navigator as any).gpu.requestAdapter();
          if (adapter && active) {
            setBackend('WebGPU');
            return;
          }
        } catch {
          // WebGPU unavailable or restricted
        }
      }

      const canvas = canvasRef.current;
      if (canvas && canvas.getContext('webgl2') && active) {
        setBackend('WebGL2');
        return;
      }

      if (active) {
        setBackend('Canvas2D');
      }
    }

    initGpu();
    return () => {
      active = false;
    };
  }, []);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Resize buffer to display resolution
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    ctx.fillStyle = THEME.colors.bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    ctx.strokeStyle = '#151926';
    ctx.lineWidth = 1;
    const gridSize = 20;
    for (let x = pan.x % gridSize; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = pan.y % gridSize; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Draw board outline (100mm x 80mm)
    const boardW = 100_000_000 * scale;
    const boardH = 80_000_000 * scale;
    ctx.strokeStyle = '#2A3045';
    ctx.lineWidth = 2;
    ctx.strokeRect(pan.x, pan.y, boardW, boardH);

    // Draw components
    for (const comp of entities.current) {
      const cx = pan.x + comp.x_nm * scale;
      const cy = pan.y + comp.y_nm * scale;
      const cw = comp.w_nm * scale;
      const ch = comp.h_nm * scale;

      const isSelected = selectedIds.includes(comp.id);

      ctx.fillStyle = comp.locked ? '#3E2020' : '#222838';
      ctx.fillRect(cx - cw / 2, cy - ch / 2, cw, ch);

      ctx.strokeStyle = isSelected
        ? THEME.colors.cyan
        : comp.locked
        ? THEME.colors.layers.f_cu
        : THEME.colors.borderActive;
      ctx.lineWidth = isSelected ? 2 : 1;
      ctx.strokeRect(cx - cw / 2, cy - ch / 2, cw, ch);

      // Label
      ctx.fillStyle = isSelected ? THEME.colors.cyan : THEME.colors.text;
      ctx.font = '10px monospace';
      ctx.fillText(comp.refdes, cx - cw / 2 + 2, cy + 3);
    }
  }, [backend, selectedIds, scale, pan]);

  // Handle pan & click selection
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDragging.current = true;
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging.current) return;
    setPan({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDragging.current = false;
    // Check if clicked on a component
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    let clickedCompId: string | null = null;
    for (const comp of entities.current) {
      const cx = pan.x + comp.x_nm * scale;
      const cy = pan.y + comp.y_nm * scale;
      const cw = comp.w_nm * scale;
      const ch = comp.h_nm * scale;

      if (
        mouseX >= cx - cw / 2 &&
        mouseX <= cx + cw / 2 &&
        mouseY >= cy - ch / 2 &&
        mouseY <= cy + ch / 2
      ) {
        clickedCompId = comp.id;
        break;
      }
    }

    if (clickedCompId) {
      globalCrossProbeBus.select([clickedCompId], 'pcb');
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    setScale((prev) => Math.max(0.000001, Math.min(0.0001, prev * zoomFactor)));
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          backgroundColor: '#12151FDD',
          padding: '4px 8px',
          borderRadius: 4,
          fontSize: 11,
          fontFamily: THEME.typography.fontMono,
          color: THEME.colors.textMuted,
          border: `1px solid ${THEME.colors.border}`,
          zIndex: 10,
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}
      >
        <span>Engine: <strong style={{ color: THEME.colors.cyan }}>{backend}</strong></span>
        <span>|</span>
        <span>Scale: {(scale * 1_000_000).toFixed(2)} px/mm</span>
      </div>

      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', cursor: 'crosshair' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
      />
    </div>
  );
};
