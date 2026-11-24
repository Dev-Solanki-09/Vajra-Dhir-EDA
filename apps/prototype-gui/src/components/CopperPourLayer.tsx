import React, { useState } from "react";
import { refillCopper } from "../api";

interface CopperPourProps {
  layer: "F.Cu" | "B.Cu";
  net: string;
}

export const CopperPourLayer: React.FC<CopperPourProps> = ({ layer, net }) => {
  const [pourData, setPourData] = useState<any>(null);
  const [refilling, setRefilling] = useState<boolean>(false);

  const handleRefill = async () => {
    setRefilling(true);
    try {
      const res = await refillCopper(layer, net, 0.25);
      setPourData(res);
    } catch (e: any) {
      console.error(e);
    } finally {
      setRefilling(false);
    }
  };

  return (
    <div style={{ padding: 10, background: "var(--vd-bg-elevated)", borderRadius: 6, border: "1px solid var(--vd-border-subtle)", fontSize: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div>
          <strong style={{ color: "var(--vd-border-active)" }}>Copper Pour Zone ({layer})</strong>
          <div style={{ fontSize: 10, color: "var(--vd-text-secondary)" }}>
            Net: {net} · Clearance: 0.25 mm · Rule: 4-spoke thermal relief
          </div>
        </div>
        <button className="vd-btn vd-btn-primary" style={{ padding: "2px 8px", fontSize: 11 }} onClick={handleRefill}>
          {refilling ? "Refilling..." : "Refill Pours (B)"}
        </button>
      </div>

      {pourData && (
        <div className="vd-metric" style={{ fontSize: 11, display: "flex", flexDirection: "column", gap: 2, color: "var(--vd-text-primary)" }}>
          <div>Area: {pourData.polygon_area_mm2} mm² · Voids: {pourData.voids_count} · Triangles: {pourData.mesh_triangles_count}</div>
          <div>Thermal Relief: {pourData.thermal_relief.spokes_count} spokes ({pourData.thermal_relief.spoke_width_mm}mm) on {pourData.thermal_relief.connected_pads} pads</div>
          <div style={{ color: "var(--vd-pass)" }}>Refilled in {pourData.computation_time_ms} ms via {pourData.engine}</div>
        </div>
      )}
    </div>
  );
};
