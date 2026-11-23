import React, { useEffect, useRef, useState } from "react";
import { previewRoute, snapPoint } from "./api";
import type { BoardSnapshot, Nm, RoutePreviewRes, ToolMode, UnitMode } from "./types";

interface Props {
  snapshot: BoardSnapshot;
  selectedId: string | null;
  highlightIds: string[];
  toolMode: ToolMode;
  activeLayer: "F.Cu" | "B.Cu";
  activeNetId: string;
  traceWidthNm: Nm;
  unitMode: UnitMode;
  diagonalFirst: boolean;
  onSelect: (id: string | null) => void;
  onCommitMove: (compId: string, xNm: Nm, yNm: Nm) => Promise<void>;
  onCommitRoute: (points: Array<[Nm, Nm]>, layer: "F.Cu" | "B.Cu", netId: string, widthNm: Nm) => Promise<void>;
  onDropVia: (xNm: Nm, yNm: Nm, netId: string) => Promise<void>;
  onHudChange: (hud: {
    xNm: Nm;
    yNm: Nm;
    relDxNm: Nm;
    relDyNm: Nm;
    snapKind: string;
    routeLenMm: number;
    routeDelayPs: number;
    liveDrcCount: number;
  }) => void;
}

export const PcbCanvas: React.FC<Props> = ({
  snapshot,
  selectedId,
  highlightIds,
  toolMode,
  activeLayer,
  activeNetId,
  traceWidthNm,
  diagonalFirst,
  onSelect,
  onCommitMove,
  onCommitRoute,
  onDropVia,
  onHudChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [pxPerMm, setPxPerMm] = useState(11.5);
  const [pan, setPan] = useState({ x: 70, y: 70 });
  const [relOrigin, setRelOrigin] = useState<[Nm, Nm]>([0, 0]);
  const [cursorNm, setCursorNm] = useState<[Nm, Nm]>([0, 0]);
  const [dragState, setDragState] = useState<{ compId: string; xNm: Nm; yNm: Nm } | null>(null);
  const [panDrag, setPanDrag] = useState<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const [routeStart, setRouteStart] = useState<[Nm, Nm] | null>(null);
  const [routePreview, setRoutePreview] = useState<RoutePreviewRes | null>(null);
  const [dpr, setDpr] = useState(() => window.devicePixelRatio || 1);

  // Mixed-DPI multi-monitor DPR listener (T1.17b)
  useEffect(() => {
    const mq = window.matchMedia(`(resolution: ${dpr}dppx)`);
    const update = () => setDpr(window.devicePixelRatio || 1);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [dpr]);

  // Spacebar zeroes relative origin; V drops locked via during routing
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === " ") {
        e.preventDefault();
        setRelOrigin(cursorNm);
      } else if (e.key.toLowerCase() === "v" && toolMode === "ROUTE" && routeStart) {
        void onDropVia(cursorNm[0], cursorNm[1], activeNetId);
      } else if (e.key === "Escape") {
        setRouteStart(null);
        setRoutePreview(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursorNm, toolMode, routeStart, activeNetId, onDropVia]);

  const toScreen = (xNm: Nm, yNm: Nm): [number, number] => [
    pan.x + (xNm / 1_000_000) * pxPerMm,
    pan.y + (yNm / 1_000_000) * pxPerMm,
  ];

  const toWorldNm = (clientX: number, clientY: number): [Nm, Nm] => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return [0, 0];
    const xMm = (clientX - rect.left - pan.x) / pxPerMm;
    const yMm = (clientY - rect.top - pan.y) / pxPerMm;
    return [Math.round(xMm * 1_000_000), Math.round(yMm * 1_000_000)];
  };

  // Render Silicon Darkroom PCB scene
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0B0E14";
    ctx.fillRect(0, 0, rect.width, rect.height);

    // 1. 1mm dot grid inside board
    const [bx0, by0] = toScreen(0, 0);
    const [bx1, by1] = toScreen(snapshot.board.width_nm, snapshot.board.height_nm);
    ctx.fillStyle = "#101622";
    ctx.fillRect(bx0, by0, bx1 - bx0, by1 - by0);

    ctx.fillStyle = "#232B3B";
    for (let xMm = 0; xMm <= snapshot.board.width_nm / 1_000_000; xMm += 2) {
      for (let yMm = 0; yMm <= snapshot.board.height_nm / 1_000_000; yMm += 2) {
        const [gx, gy] = toScreen(xMm * 1_000_000, yMm * 1_000_000);
        ctx.fillRect(gx - 0.8, gy - 0.8, 1.6, 1.6);
      }
    }

    // Board outline (Edge.Cuts)
    ctx.strokeStyle = "#FBBF24";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx0, by0, bx1 - bx0, by1 - by0);

    // 2. Copper traces (B.Cu first, F.Cu on top)
    const orderedTraces = [...snapshot.traces].sort((a, b) => (a.layer_name === "B.Cu" ? -1 : b.layer_name === "B.Cu" ? 1 : 0));
    for (const t of orderedTraces) {
      const [x1, y1] = toScreen(t.x1_nm, t.y1_nm);
      const [x2, y2] = toScreen(t.x2_nm, t.y2_nm);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineCap = "round";
      ctx.lineWidth = Math.max(2, (t.width_nm / 1_000_000) * pxPerMm);
      ctx.strokeStyle = t.layer_name === "F.Cu" ? "rgba(224,79,95,0.85)" : "rgba(59,130,246,0.85)";
      ctx.stroke();
      if (t.locked) {
        ctx.lineWidth = 1;
        ctx.strokeStyle = "#FBBF24";
        ctx.stroke();
      }
    }

    // 3. Vias
    for (const v of snapshot.vias) {
      const [vx, vy] = toScreen(v.x_nm, v.y_nm);
      const rOuter = Math.max(3, ((v.diameter_nm / 2) / 1_000_000) * pxPerMm);
      const rDrill = Math.max(1.5, ((v.drill_nm / 2) / 1_000_000) * pxPerMm);
      ctx.beginPath();
      ctx.arc(vx, vy, rOuter, 0, Math.PI * 2);
      ctx.fillStyle = "#22C55E";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(vx, vy, rDrill, 0, Math.PI * 2);
      ctx.fillStyle = "#0B0E14";
      ctx.fill();
    }

    // 4. Components + Gold Human-Lock Halos
    for (const c of snapshot.components) {
      const cxNm = dragState && dragState.compId === c.id ? dragState.xNm : c.x_nm;
      const cyNm = dragState && dragState.compId === c.id ? dragState.yNm : c.y_nm;
      const [cx, cy] = toScreen(cxNm, cyNm);
      const wPx = (c.courtyard_w_nm / 1_000_000) * pxPerMm;
      const hPx = (c.courtyard_h_nm / 1_000_000) * pxPerMm;
      const isSelected = c.id === selectedId;
      const isHighlighted = highlightIds.includes(c.id);

      // Gold Human-Lock Halo (#FBBF24)
      if (c.locked) {
        ctx.strokeStyle = "#FBBF24";
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.strokeRect(cx - wPx / 2 - 4, cy - hPx / 2 - 4, wPx + 8, hPx + 8);
        ctx.setLineDash([]);
      }

      // Component body
      ctx.fillStyle = isSelected
        ? "rgba(59,130,246,0.32)"
        : isHighlighted
        ? "rgba(239,68,68,0.32)"
        : "rgba(28,35,49,0.92)";
      ctx.fillRect(cx - wPx / 2, cy - hPx / 2, wPx, hPx);

      ctx.strokeStyle = isSelected ? "#3B82F6" : isHighlighted ? "#EF4444" : "#A855F7";
      ctx.lineWidth = isSelected ? 2 : 1.2;
      ctx.strokeRect(cx - wPx / 2, cy - hPx / 2, wPx, hPx);

      // Center SMD pad dot
      ctx.fillStyle = "#E04F5F";
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Silkscreen RefDes + Lock Icon
      ctx.fillStyle = "#F8FAFC";
      ctx.font = "600 11px JetBrains Mono, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(c.locked ? `${c.refdes} 🔒` : c.refdes, cx, cy - 6);
      ctx.fillStyle = "#94A3B8";
      ctx.font = "10px Inter, sans-serif";
      ctx.fillText(c.value_str.slice(0, 14), cx, cy + 7);
    }

    // 5. Live 45° Interactive Route Preview
    if (toolMode === "ROUTE" && routePreview && routePreview.points_nm.length >= 2) {
      ctx.beginPath();
      routePreview.points_nm.forEach(([px, py], i) => {
        const [sx, sy] = toScreen(px, py);
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.lineWidth = Math.max(2, (traceWidthNm / 1_000_000) * pxPerMm);
      ctx.strokeStyle =
        routePreview.drc_hits.length > 0
          ? "#EF4444"
          : activeLayer === "F.Cu"
          ? "#FB7185"
          : "#60A5FA";
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [snapshot, selectedId, highlightIds, pxPerMm, pan, dragState, routePreview, toolMode, activeLayer, traceWidthNm, dpr]);

  const hitComponent = (xNm: Nm, yNm: Nm) =>
    snapshot.components.find(
      (c) =>
        Math.abs(xNm - c.x_nm) <= c.courtyard_w_nm / 2 &&
        Math.abs(yNm - c.y_nm) <= c.courtyard_h_nm / 2
    );

  const handleMouseDown = async (e: React.MouseEvent) => {
    if (e.button === 1 || e.button === 2 || e.shiftKey) {
      setPanDrag({ sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y });
      return;
    }
    const [wx, wy] = toWorldNm(e.clientX, e.clientY);
    if (toolMode === "ROUTE") {
      const snapped = await snapPoint(wx, wy, 500_000, activeLayer);
      if (!routeStart) {
        setRouteStart([snapped.x_nm, snapped.y_nm]);
      } else if (routePreview && routePreview.points_nm.length >= 2) {
        await onCommitRoute(routePreview.points_nm, activeLayer, activeNetId, traceWidthNm);
        setRouteStart([snapped.x_nm, snapped.y_nm]);
        setRoutePreview(null);
      }
      return;
    }

    const hit = hitComponent(wx, wy);
    if (hit) {
      onSelect(hit.id);
      setDragState({ compId: hit.id, xNm: hit.x_nm, yNm: hit.y_nm });
    } else {
      onSelect(null);
    }
  };

  const handleMouseMove = async (e: React.MouseEvent) => {
    if (panDrag) {
      setPan({ x: panDrag.ox + (e.clientX - panDrag.sx), y: panDrag.oy + (e.clientY - panDrag.sy) });
      return;
    }
    const [wx, wy] = toWorldNm(e.clientX, e.clientY);
    const snappedX = Math.round(wx / 500_000) * 500_000;
    const snappedY = Math.round(wy / 500_000) * 500_000;
    setCursorNm([snappedX, snappedY]);

    if (dragState) {
      setDragState({ ...dragState, xNm: snappedX, yNm: snappedY });
      onHudChange({
        xNm: snappedX, yNm: snappedY,
        relDxNm: snappedX - relOrigin[0], relDyNm: snappedY - relOrigin[1],
        snapKind: "grid_0.5mm", routeLenMm: 0, routeDelayPs: 0, liveDrcCount: 0,
      });
      return;
    }

    if (toolMode === "ROUTE" && routeStart) {
      const prev = await previewRoute({
        start_x_nm: routeStart[0],
        start_y_nm: routeStart[1],
        end_x_nm: snappedX,
        end_y_nm: snappedY,
        layer: activeLayer,
        net_id: activeNetId,
        width_nm: traceWidthNm,
        diagonal_first: diagonalFirst,
      });
      setRoutePreview(prev);
      onHudChange({
        xNm: snappedX, yNm: snappedY,
        relDxNm: snappedX - relOrigin[0], relDyNm: snappedY - relOrigin[1],
        snapKind: "rstar_45deg",
        routeLenMm: prev.length_mm,
        routeDelayPs: prev.delay_ps,
        liveDrcCount: prev.drc_hits.length,
      });
      return;
    }

    onHudChange({
      xNm: snappedX, yNm: snappedY,
      relDxNm: snappedX - relOrigin[0], relDyNm: snappedY - relOrigin[1],
      snapKind: "grid", routeLenMm: 0, routeDelayPs: 0, liveDrcCount: 0,
    });
  };

  const handleMouseUp = async () => {
    if (panDrag) {
      setPanDrag(null);
      return;
    }
    if (dragState) {
      const { compId, xNm, yNm } = dragState;
      setDragState(null);
      await onCommitMove(compId, xNm, yNm);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setPxPerMm((prev) => Math.min(45, Math.max(4, prev * factor)));
  };

  return (
    <canvas
      ref={canvasRef}
      onContextMenu={(e) => e.preventDefault()}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onWheel={handleWheel}
      style={{
        width: "100%",
        height: "100%",
        display: "block",
        cursor: toolMode === "ROUTE" ? "crosshair" : dragState ? "grabbing" : "default",
      }}
    />
  );
};
