import React, { useState } from 'react';

/**
 * ParetoPickerApp (ui://vajradhir/pareto-picker)
 * Visual multi-objective trade-off selector (Cost vs Thermal vs Area).
 */
export const ParetoPickerApp: React.FC = () => {
  const [selectedSolution, setSelectedSolution] = useState<string>("B");

  const solutions = [
    { id: "A", name: "Lowest Cost ($3.85)", cost: 3.85, tj: 74.2, area_mm2: 450 },
    { id: "B", name: "Balanced (Recommended, $4.30)", cost: 4.30, tj: 67.3, area_mm2: 520 },
    { id: "C", name: "Ultra-Cool ($5.20)", cost: 5.20, tj: 52.1, area_mm2: 680 },
  ];

  return (
    <div style={{ height: '100%', background: '#0b0c10', color: '#e2e8f0', padding: '16px' }}>
      <h3 style={{ margin: '0 0 12px 0', color: '#38bdf8' }}>Design Trade-off Explorer (Pareto Front)</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
        {solutions.map(sol => (
          <div
            key={sol.id}
            onClick={() => setSelectedSolution(sol.id)}
            style={{
              padding: '12px',
              borderRadius: '6px',
              border: selectedSolution === sol.id ? '2px solid #38bdf8' : '1px solid #1f2430',
              background: selectedSolution === sol.id ? '#141b29' : '#11141c',
              cursor: 'pointer'
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 8 }}>{sol.name}</div>
            <div style={{ fontSize: '13px', color: '#94a3b8' }}>Cost: ${sol.cost.toFixed(2)}</div>
            <div style={{ fontSize: '13px', color: '#94a3b8' }}>Peak Tj: {sol.tj}°C</div>
            <div style={{ fontSize: '13px', color: '#94a3b8' }}>Area: {sol.area_mm2} mm²</div>
          </div>
        ))}
      </div>
    </div>
  );
};
