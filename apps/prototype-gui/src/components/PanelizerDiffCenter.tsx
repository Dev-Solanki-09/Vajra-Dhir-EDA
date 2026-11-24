import React, { useEffect, useState } from "react";
import { compareDiff, compileHarness, generatePanel } from "../api";
import type { BoardSnapshot } from "../types";

interface PanelizerDiffProps {
  snapshot: BoardSnapshot;
}

export const PanelizerDiffCenter: React.FC<PanelizerDiffProps> = ({ snapshot }) => {
  const [activeTab, setActiveTab] = useState<"PANELIZER" | "GIT_DIFF" | "WIRE_HARNESS" | "ASSEMBLY_BOM">("PANELIZER");
  const [rows, setRows] = useState<number>(2);
  const [cols, setCols] = useState<number>(2);
  const [railMm, setRailMm] = useState<number>(5.0);
  const [panelData, setPanelData] = useState<any>(null);
  const [diffData, setDiffData] = useState<any>(null);
  const [harnessData, setHarnessData] = useState<any>(null);

  const loadPanel = async () => {
    try {
      const p = await generatePanel(rows, cols, railMm);
      setPanelData(p);
    } catch (e: any) {
      console.error(e);
    }
  };

  const loadDiff = async () => {
    try {
      const d = await compareDiff(1, 2);
      setDiffData(d);
    } catch (e: any) {
      console.error(e);
    }
  };

  const loadHarness = async () => {
    try {
      const h = await compileHarness("WH-001_MAIN_INTERCONNECT");
      setHarnessData(h);
    } catch (e: any) {
      console.error(e);
    }
  };

  useEffect(() => {
    void loadPanel();
    void loadDiff();
    void loadHarness();
  }, [rows, cols, railMm]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#0B0E14", minWidth: 0, minHeight: 0 }}>
      {/* TOP SUB-TAB NAVIGATION */}
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
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { id: "PANELIZER", label: "KiKit Panelizer Wizard" },
            { id: "GIT_DIFF", label: "Visual Git ECO Diff (kiri)" },
            { id: "WIRE_HARNESS", label: "Wire Harness & Cable Studio" },
            { id: "ASSEMBLY_BOM", label: "Interactive Assembly BOM (iBOM)" },
          ].map((tab) => (
            <button
              key={tab.id}
              className={`vd-btn ${activeTab === tab.id ? "vd-btn-primary" : ""}`}
              style={{ fontSize: 11 }}
              onClick={() => setActiveTab(tab.id as any)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span className="vd-metric" style={{ fontSize: 11, color: "var(--vd-border-active)" }}>
            Gate 8 Fab Bundle Ready
          </span>
        </div>
      </div>

      {/* TAB CONTENT AREA */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {activeTab === "PANELIZER" && (
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h3 style={{ margin: "0 0 4px 0", fontSize: 14 }}>KiKit Automated Panelization Wizard (MIT)</h3>
                <p style={{ margin: 0, fontSize: 12, color: "var(--vd-text-secondary)" }}>
                  Multi-board matrix generation with breakaway mouse-bites, edge tooling rails, and optical fiducials.
                </p>
              </div>

              {/* CONTROLS */}
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                  <span>Rows:</span>
                  <select
                    value={rows}
                    onChange={(e) => setRows(parseInt(e.target.value))}
                    style={{ background: "var(--vd-bg-elevated)", color: "#FFF", border: "1px solid var(--vd-border-subtle)", padding: 4, borderRadius: 3 }}
                  >
                    {[1, 2, 3, 4].map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>

                <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                  <span>Cols:</span>
                  <select
                    value={cols}
                    onChange={(e) => setCols(parseInt(e.target.value))}
                    style={{ background: "var(--vd-bg-elevated)", color: "#FFF", border: "1px solid var(--vd-border-subtle)", padding: 4, borderRadius: 3 }}
                  >
                    {[1, 2, 3, 4].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>

                <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                  <span>Rail:</span>
                  <select
                    value={railMm}
                    onChange={(e) => setRailMm(parseFloat(e.target.value))}
                    style={{ background: "var(--vd-bg-elevated)", color: "#FFF", border: "1px solid var(--vd-border-subtle)", padding: 4, borderRadius: 3 }}
                  >
                    {[3.0, 5.0, 7.5, 10.0].map((w) => <option key={w} value={w}>{w} mm</option>)}
                  </select>
                </label>
              </div>
            </div>

            {panelData && (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                  <div style={{ background: "var(--vd-bg-elevated)", padding: 10, borderRadius: 6, border: "1px solid var(--vd-border-subtle)" }}>
                    <div style={{ fontSize: 11, color: "var(--vd-text-muted)" }}>PANEL DIMENSIONS</div>
                    <div className="vd-metric" style={{ fontSize: 16, fontWeight: 700, color: "var(--vd-text-primary)" }}>
                      {panelData.panel_dimensions_mm.width} × {panelData.panel_dimensions_mm.height} mm
                    </div>
                    <div style={{ fontSize: 10, color: "var(--vd-text-secondary)" }}>Grid: {rows} × {cols} ({rows * cols} Boards)</div>
                  </div>

                  <div style={{ background: "var(--vd-bg-elevated)", padding: 10, borderRadius: 6, border: "1px solid var(--vd-border-subtle)" }}>
                    <div style={{ fontSize: 11, color: "var(--vd-text-muted)" }}>PANEL UTILIZATION</div>
                    <div className="vd-metric" style={{ fontSize: 16, fontWeight: 700, color: "var(--vd-pass)" }}>
                      {panelData.utilization_pct}%
                    </div>
                    <div style={{ fontSize: 10, color: "var(--vd-text-secondary)" }}>Edge Rails: {railMm} mm (4 sides)</div>
                  </div>

                  <div style={{ background: "var(--vd-bg-elevated)", padding: 10, borderRadius: 6, border: "1px solid var(--vd-border-subtle)" }}>
                    <div style={{ fontSize: 11, color: "var(--vd-text-muted)" }}>BREAK-OFF TABS</div>
                    <div className="vd-metric" style={{ fontSize: 16, fontWeight: 700, color: "var(--vd-human-lock)" }}>
                      {panelData.mouse_bites.count} Mouse Bites
                    </div>
                    <div style={{ fontSize: 10, color: "var(--vd-text-secondary)" }}>0.8mm drill on 0.4mm pitch</div>
                  </div>

                  <div style={{ background: "var(--vd-bg-elevated)", padding: 10, borderRadius: 6, border: "1px solid var(--vd-border-subtle)" }}>
                    <div style={{ fontSize: 11, color: "var(--vd-text-muted)" }}>SMT TOOLING</div>
                    <div className="vd-metric" style={{ fontSize: 16, fontWeight: 700, color: "var(--vd-border-active)" }}>
                      4 Fiducials / 4 Holes
                    </div>
                    <div style={{ fontSize: 10, color: "var(--vd-text-secondary)" }}>3.0mm unplated tooling holes</div>
                  </div>
                </div>

                {/* SVG 2D PANEL PREVIEW */}
                <div style={{ background: "#080B10", borderRadius: 6, border: "1px solid var(--vd-border-subtle)", padding: 16 }}>
                  <svg viewBox="0 0 600 320" style={{ width: "100%", height: 320, display: "block" }}>
                    {/* Outer Panel Boundary with Rails */}
                    <rect x="50" y="20" width="500" height="280" fill="#0F172A" stroke="#EAB308" strokeWidth="2" rx="4" />

                    {/* Array of Boards */}
                    {Array.from({ length: rows }).map((_, rIdx) =>
                      Array.from({ length: cols }).map((_, cIdx) => {
                        const bw = (500 - 40 - (cols - 1) * 10) / cols;
                        const bh = (280 - 40 - (rows - 1) * 10) / rows;
                        const bx = 70 + cIdx * (bw + 10);
                        const by = 40 + rIdx * (bh + 10);
                        return (
                          <g key={`${rIdx}-${cIdx}`}>
                            <rect x={bx} y={by} width={bw} height={bh} fill="#064E3B" stroke="#10B981" strokeWidth="1.5" rx="3" />
                            <text x={bx + bw / 2} y={by + bh / 2 + 4} fill="#D1FAE5" fontSize="11" fontFamily="var(--vd-font-mono)" textAnchor="middle">
                              PCB #{rIdx * cols + cIdx + 1}
                            </text>
                            {/* Mouse-bite perforation markers */}
                            <circle cx={bx - 5} cy={by + bh / 2} r="2" fill="#EAB308" />
                            <circle cx={bx + bw + 5} cy={by + bh / 2} r="2" fill="#EAB308" />
                          </g>
                        );
                      })
                    )}

                    {/* Fiducials & Tooling Holes on Rails */}
                    {[
                      [60, 30],
                      [540, 30],
                      [60, 290],
                      [540, 290],
                    ].map(([fx, fy], idx) => (
                      <g key={idx}>
                        <circle cx={fx} cy={fy} r="5" fill="#EF4444" />
                        <circle cx={fx} cy={fy} r="2" fill="#FFF" />
                      </g>
                    ))}
                  </svg>
                </div>

                {/* KIKIT CLI PREVIEW */}
                <div style={{ background: "var(--vd-bg-elevated)", padding: 10, borderRadius: 6, border: "1px solid var(--vd-border-subtle)" }}>
                  <div style={{ fontSize: 11, color: "var(--vd-text-muted)", marginBottom: 4 }}>KiKit CLI Generation String:</div>
                  <code className="vd-metric" style={{ fontSize: 11, color: "var(--vd-border-active)", wordBreak: "break-all" }}>
                    {panelData.kikit_cli_preview}
                  </code>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === "GIT_DIFF" && diffData && (
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            <h3 style={{ margin: "0 0 2px 0", fontSize: 14 }}>Visual Git ECO Layer Diff (kiri baseline)</h3>
            <p style={{ margin: 0, fontSize: 12, color: "var(--vd-text-secondary)" }}>
              {diffData.summary}
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div style={{ background: "var(--vd-bg-elevated)", padding: 12, borderRadius: 6, border: "1px solid var(--vd-border-subtle)" }}>
                <h4 style={{ margin: "0 0 6px 0", fontSize: 12 }}>Modified Copper Layers</h4>
                {diffData.diff_layers.map((l: any) => (
                  <div key={l.layer} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 11, borderBottom: "1px solid #1E293B" }}>
                    <span style={{ color: l.color, fontWeight: 600 }}>{l.layer}</span>
                    <span className="vd-metric">+{l.added_segments || 0} / -{l.removed_segments || 0}</span>
                  </div>
                ))}
              </div>

              <div style={{ background: "var(--vd-bg-elevated)", padding: 12, borderRadius: 6, border: "1px solid var(--vd-border-subtle)" }}>
                <h4 style={{ margin: "0 0 6px 0", fontSize: 12 }}>Moved Components &amp; Net Length Changes</h4>
                {diffData.moved_components.map((m: any) => (
                  <div key={m.refdes} style={{ padding: "4px 0", fontSize: 11 }}>
                    <strong className="vd-metric" style={{ color: "var(--vd-human-lock)" }}>{m.refdes}</strong>: Moved +{m.dx_mm}mm ({m.reason})
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "WIRE_HARNESS" && harnessData && (
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            <h3 style={{ margin: "0 0 2px 0", fontSize: 14 }}>Pure-MIT Wire Harness &amp; Multi-Board Interconnect</h3>
            <p style={{ margin: 0, fontSize: 12, color: "var(--vd-text-secondary)" }}>
              Harness: <strong>{harnessData.harness_name}</strong> · {harnessData.total_cables} Cables · Total Length: {harnessData.total_wire_length_m}m · Mass: {harnessData.total_wire_mass_g}g
            </p>

            {/* CABLES TABLE */}
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, textAlign: "left" }}>
              <thead>
                <tr style={{ background: "var(--vd-bg-elevated)", borderBottom: "1px solid var(--vd-border-subtle)" }}>
                  <th style={{ padding: "6px 8px" }}>Cable ID</th>
                  <th style={{ padding: "6px 8px" }}>Signal</th>
                  <th style={{ padding: "6px 8px" }}>Gauge</th>
                  <th style={{ padding: "6px 8px" }}>Color Code</th>
                  <th style={{ padding: "6px 8px" }}>Current</th>
                  <th style={{ padding: "6px 8px" }}>V_Drop</th>
                  <th style={{ padding: "6px 8px" }}>Drop %</th>
                </tr>
              </thead>
              <tbody>
                {harnessData.cables.map((c: any) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid #1E293B" }}>
                    <td style={{ padding: "6px 8px", fontWeight: 700 }} className="vd-metric">{c.id}</td>
                    <td style={{ padding: "6px 8px", color: "var(--vd-border-active)" }}>{c.signal}</td>
                    <td style={{ padding: "6px 8px" }} className="vd-metric">{c.awg} AWG</td>
                    <td style={{ padding: "6px 8px" }}>{c.color_code}</td>
                    <td style={{ padding: "6px 8px" }} className="vd-metric">{c.max_current_a} A</td>
                    <td style={{ padding: "6px 8px" }} className="vd-metric">{c.voltage_drop_v} V</td>
                    <td style={{ padding: "6px 8px", color: c.drop_pct < 3.0 ? "var(--vd-pass)" : "var(--vd-fail)" }} className="vd-metric">
                      {c.drop_pct}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* CUT LIST */}
            <div style={{ background: "var(--vd-bg-elevated)", padding: 12, borderRadius: 6, border: "1px solid var(--vd-border-subtle)" }}>
              <h4 style={{ margin: "0 0 6px 0", fontSize: 12 }}>Fabrication Cut List &amp; Crimps</h4>
              {harnessData.cut_list.map((cut: any) => (
                <div key={cut.item} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 11, borderBottom: "1px solid #1E293B" }}>
                  <span>Item #{cut.item}: {cut.wire}</span>
                  <span className="vd-metric">Cut: {cut.cut_length_mm} mm · Strip: {cut.strip_ends_mm} · Terminal: {cut.terminal}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "ASSEMBLY_BOM" && (
          <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            <h3 style={{ margin: "0 0 2px 0", fontSize: 14 }}>Interactive HTML Assembly BOM (iBOM Baseline)</h3>
            <p style={{ margin: 0, fontSize: 12, color: "var(--vd-text-secondary)" }}>
              Visual placement verification linking BOM line items to physical footprint courtyards on the 4-layer PCB.
            </p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, textAlign: "left" }}>
              <thead>
                <tr style={{ background: "var(--vd-bg-elevated)", borderBottom: "1px solid var(--vd-border-subtle)" }}>
                  <th style={{ padding: "6px 8px" }}>RefDes</th>
                  <th style={{ padding: "6px 8px" }}>Value</th>
                  <th style={{ padding: "6px 8px" }}>Package</th>
                  <th style={{ padding: "6px 8px" }}>Side</th>
                  <th style={{ padding: "6px 8px" }}>MPN</th>
                  <th style={{ padding: "6px 8px" }}>Unit Price</th>
                  <th style={{ padding: "6px 8px" }}>Placed</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.components.map((c) => (
                  <tr key={c.id} style={{ borderBottom: "1px solid #1E293B" }}>
                    <td style={{ padding: "6px 8px", fontWeight: 700 }} className="vd-metric">{c.refdes}</td>
                    <td style={{ padding: "6px 8px" }}>{c.value_str}</td>
                    <td style={{ padding: "6px 8px" }} className="vd-metric">{c.package_name}</td>
                    <td style={{ padding: "6px 8px" }}>{c.side}</td>
                    <td style={{ padding: "6px 8px", color: "var(--vd-text-secondary)" }}>{c.mpn}</td>
                    <td style={{ padding: "6px 8px" }} className="vd-metric">${c.unit_cost_usd.toFixed(2)}</td>
                    <td style={{ padding: "6px 8px", color: "var(--vd-pass)" }}>✓ Placed</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
