import React from "react";

export interface LayerDef {
  name: "F.Cu" | "In1.Cu" | "In2.Cu" | "B.Cu" | "F.Silkscreen" | "B.Silkscreen" | "Edge.Cuts";
  label: string;
  color: string;
  visible: boolean;
  kind: "copper" | "silk" | "edge";
}

interface LayerManagerProps {
  activeLayer: "F.Cu" | "B.Cu";
  onSelectLayer: (layer: "F.Cu" | "B.Cu") => void;
  layers: LayerDef[];
  onToggleVisibility: (layerName: string) => void;
}

export const LayerManager: React.FC<LayerManagerProps> = ({
  activeLayer,
  onSelectLayer,
  layers,
  onToggleVisibility,
}) => {
  return (
    <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "var(--vd-text-muted)", letterSpacing: 0.5 }}>
          LAYER MANAGER (4-LAYER STACKUP)
        </span>
        <span className="vd-metric" style={{ fontSize: 10, color: "var(--vd-border-active)" }}>
          Active: {activeLayer}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {layers.map((l) => {
          const isRouting = l.name === "F.Cu" || l.name === "B.Cu";
          const isSelected = l.name === activeLayer;
          return (
            <div
              key={l.name}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "6px 8px",
                background: isSelected ? "var(--vd-bg-elevated)" : "transparent",
                border: isSelected ? "1px solid var(--vd-border-active)" : "1px solid transparent",
                borderRadius: 4,
                fontSize: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  type="checkbox"
                  checked={l.visible}
                  onChange={() => onToggleVisibility(l.name)}
                  style={{ cursor: "pointer", accentColor: l.color }}
                />
                <span
                  style={{
                    display: "inline-block",
                    width: 12,
                    height: 12,
                    borderRadius: 2,
                    background: l.color,
                    border: "1px solid rgba(255,255,255,0.2)",
                  }}
                />
                <span style={{ fontWeight: isSelected ? 600 : 400, color: l.visible ? "var(--vd-text-primary)" : "var(--vd-text-muted)" }}>
                  {l.label}
                </span>
              </div>

              {isRouting && (
                <button
                  className={`vd-btn ${isSelected ? "vd-btn-primary" : ""}`}
                  style={{ padding: "1px 6px", fontSize: 10 }}
                  onClick={() => onSelectLayer(l.name as "F.Cu" | "B.Cu")}
                >
                  {isSelected ? "ACTIVE" : "Select"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 8, padding: 8, background: "#0B0E14", borderRadius: 4, border: "1px solid var(--vd-border-subtle)", fontSize: 11 }}>
        <div style={{ color: "var(--vd-text-secondary)", marginBottom: 4 }}>Stackup Rules:</div>
        <div>• <strong>Top/Bottom:</strong> 35 um (1 oz) Outer Copper</div>
        <div>• <strong>Inner 1:</strong> In1.Cu (GND Plane, 0.5 oz)</div>
        <div>• <strong>Inner 2:</strong> In2.Cu (+3V3 Power Plane, 0.5 oz)</div>
        <div>• <strong>Substrate:</strong> FR-4 Core (1.1 mm, εr = 4.5)</div>
      </div>
    </div>
  );
};
