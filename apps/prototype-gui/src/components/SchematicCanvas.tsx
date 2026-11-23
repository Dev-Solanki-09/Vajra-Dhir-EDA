import React, { useState } from "react";

interface SchematicSymbol {
  id: string;
  refdes: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pins: Array<{ name: string; number: string; side: "left" | "right" | "top" | "bottom" }>;
  sheet: string;
}

interface SchematicWire {
  id: string;
  netName: string;
  points: Array<[number, number]>;
  color: string;
}

interface SchematicCanvasProps {
  onSelectComponent?: (refdes: string) => void;
}

export const SchematicCanvas: React.FC<SchematicCanvasProps> = ({ onSelectComponent }) => {
  const [activeSheet, setActiveSheet] = useState<string>("root");
  const [selectedSymbolId, setSelectedSymbolId] = useState<string | null>("U1");
  const [beautified, setBeautified] = useState<boolean>(true);

  // Hierarchical schematic symbols
  const symbols: SchematicSymbol[] = [
    {
      id: "U1",
      refdes: "U1",
      name: "CH224K (USB-PD Sink)",
      x: 80,
      y: 120,
      width: 160,
      height: 100,
      sheet: "root",
      pins: [
        { name: "CC1", number: "1", side: "left" },
        { name: "CC2", number: "2", side: "left" },
        { name: "VBUS", number: "3", side: "right" },
        { name: "CFG1", number: "4", side: "bottom" },
      ],
    },
    {
      id: "U2",
      refdes: "U2",
      name: "TPS54302 (Sync Buck 3A)",
      x: 320,
      y: 100,
      width: 180,
      height: 120,
      sheet: "root",
      pins: [
        { name: "VIN", number: "3", side: "left" },
        { name: "EN", number: "5", side: "left" },
        { name: "GND", number: "1", side: "bottom" },
        { name: "SW", number: "2", side: "right" },
        { name: "FB", number: "4", side: "right" },
      ],
    },
    {
      id: "L1",
      refdes: "L1",
      name: "4.7uH Shielded (SWPA4020)",
      x: 540,
      y: 110,
      width: 100,
      height: 60,
      sheet: "root",
      pins: [
        { name: "1", number: "1", side: "left" },
        { name: "2", number: "2", side: "right" },
      ],
    },
    {
      id: "U3",
      refdes: "U3",
      name: "AP2112K-3.3 (LDO 600mA)",
      x: 320,
      y: 280,
      width: 160,
      height: 90,
      sheet: "root",
      pins: [
        { name: "VIN", number: "1", side: "left" },
        { name: "GND", number: "2", side: "bottom" },
        { name: "EN", number: "3", side: "left" },
        { name: "VOUT", number: "5", side: "right" },
      ],
    },
  ];

  // Orthogonal wire connections
  const wires: SchematicWire[] = [
    {
      id: "w1",
      netName: "VBUS_12V",
      points: [[240, 150], [280, 150], [280, 130], [320, 130]],
      color: "#EF4444",
    },
    {
      id: "w2",
      netName: "SW_NODE",
      points: [[500, 140], [540, 140]],
      color: "#F59E0B",
    },
    {
      id: "w3",
      netName: "+3V3_OUT",
      points: [[640, 140], [700, 140]],
      color: "#10B981",
    },
    {
      id: "w4",
      netName: "GND",
      points: [[410, 220], [410, 250]],
      color: "#3B82F6",
    },
  ];

  const handleAutoBeautify = () => {
    setBeautified(true);
  };

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#0B0E14", minWidth: 0, minHeight: 0 }}>
      {/* SCHEMATIC TOOLBAR */}
      <div
        style={{
          height: 36,
          background: "var(--vd-bg-panel)",
          borderBottom: "1px solid var(--vd-border-subtle)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 12px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <strong style={{ fontSize: 12 }}>Schematic Sheets:</strong>
          <div style={{ display: "flex", gap: 4 }}>
            {["root", "power_tree", "mcu_subsystem"].map((sheet) => (
              <button
                key={sheet}
                onClick={() => setActiveSheet(sheet)}
                style={{
                  background: activeSheet === sheet ? "var(--vd-bg-elevated)" : "transparent",
                  color: activeSheet === sheet ? "var(--vd-border-active)" : "var(--vd-text-secondary)",
                  border: activeSheet === sheet ? "1px solid var(--vd-border-active)" : "1px solid transparent",
                  borderRadius: 3,
                  padding: "2px 8px",
                  fontSize: 11,
                  cursor: "pointer",
                }}
              >
                {sheet === "root" ? "1. Root Sheet" : sheet === "power_tree" ? "2. Power Tree" : "3. MCU Subsystem"}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="vd-metric" style={{ fontSize: 11, color: "var(--vd-text-muted)" }}>
            Layout: elkjs orthogonal · Rule: +V UP / GND DOWN
          </span>
          <button className="vd-btn vd-btn-primary" onClick={handleAutoBeautify} style={{ fontSize: 11 }}>
            Auto-Beautify (elkjs)
          </button>
        </div>
      </div>

      {/* SCHEMATIC GRAPH CANVAS (SVG) */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        <svg
          viewBox="0 0 800 450"
          style={{ width: "100%", height: "100%", display: "block", background: "#080B10" }}
        >
          {/* Subtle Schematic Grid */}
          <defs>
            <pattern id="sch-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="10" cy="10" r="0.75" fill="#1E293B" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#sch-grid)" />

          {/* Wires */}
          {wires.map((w) => (
            <g key={w.id}>
              <polyline
                fill="none"
                stroke={w.color}
                strokeWidth="2"
                points={w.points.map((p) => `${p[0]},${p[1]}`).join(" ")}
              />
              <text
                x={(w.points[0][0] + w.points[w.points.length - 1][0]) / 2}
                y={w.points[0][1] - 5}
                fill={w.color}
                fontSize="10"
                fontFamily="var(--vd-font-mono)"
                textAnchor="middle"
              >
                {w.netName}
              </text>
            </g>
          ))}

          {/* Symbols */}
          {symbols.map((s) => {
            const isSelected = selectedSymbolId === s.id;
            return (
              <g
                key={s.id}
                transform={`translate(${s.x}, ${s.y})`}
                onClick={() => {
                  setSelectedSymbolId(s.id);
                  if (onSelectComponent) onSelectComponent(s.refdes);
                }}
                style={{ cursor: "pointer" }}
              >
                {/* Box body */}
                <rect
                  width={s.width}
                  height={s.height}
                  fill="var(--vd-bg-panel)"
                  stroke={isSelected ? "var(--vd-border-active)" : "var(--vd-border-subtle)"}
                  strokeWidth={isSelected ? 2 : 1}
                  rx="3"
                />

                {/* Header text */}
                <text
                  x={s.width / 2}
                  y="20"
                  fill="var(--vd-text-primary)"
                  fontSize="11"
                  fontWeight="bold"
                  fontFamily="var(--vd-font-mono)"
                  textAnchor="middle"
                >
                  {s.refdes}
                </text>
                <text
                  x={s.width / 2}
                  y="36"
                  fill="var(--vd-text-secondary)"
                  fontSize="9"
                  fontFamily="var(--vd-font-mono)"
                  textAnchor="middle"
                >
                  {s.name}
                </text>

                {/* Pins */}
                {s.pins.map((p, idx) => {
                  let px = 0;
                  let py = 50 + idx * 16;
                  let tx = 8;
                  if (p.side === "right") {
                    px = s.width;
                    tx = s.width - 8;
                  }
                  return (
                    <g key={p.name}>
                      <line
                        x1={px}
                        y1={py}
                        x2={p.side === "left" ? px - 10 : px + 10}
                        y2={py}
                        stroke="#94A3B8"
                        strokeWidth="1.5"
                      />
                      <text
                        x={tx}
                        y={py + 3}
                        fill="#94A3B8"
                        fontSize="9"
                        fontFamily="var(--vd-font-mono)"
                        textAnchor={p.side === "left" ? "start" : "end"}
                      >
                        {p.name}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>

        {/* Ambient Legend */}
        <div
          className="vd-metric"
          style={{
            position: "absolute",
            bottom: 10,
            left: 10,
            fontSize: 11,
            background: "rgba(16,20,28,0.85)",
            padding: "4px 8px",
            borderRadius: 4,
            border: "1px solid var(--vd-border-subtle)",
          }}
        >
          Click symbols to cross-probe to PCB layout · VBUS: Red · SW: Amber · +3V3: Green · GND: Blue
        </div>
      </div>
    </div>
  );
};
