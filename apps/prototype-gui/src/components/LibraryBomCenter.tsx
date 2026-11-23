import React, { useEffect, useState } from "react";
import { fetchDatasheetPreview, searchComponents } from "../api";

export const LibraryBomCenter: React.FC = () => {
  const [query, setQuery] = useState<string>("");
  const [feederFilter, setFeederFilter] = useState<string>("all");
  const [results, setResults] = useState<any[]>([]);
  const [selectedMpn, setSelectedMpn] = useState<string>("TPS54302DDCR");
  const [datasheet, setDatasheet] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const doSearch = async () => {
    setLoading(true);
    try {
      const res = await searchComponents(query, feederFilter);
      setResults(res.results || []);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadDatasheet = async (mpn: string) => {
    setSelectedMpn(mpn);
    try {
      const ds = await fetchDatasheetPreview(mpn);
      setDatasheet(ds);
    } catch (e: any) {
      console.error(e);
    }
  };

  useEffect(() => {
    void doSearch();
    void loadDatasheet("TPS54302DDCR");
  }, [feederFilter]);

  return (
    <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <h3 style={{ margin: "0 0 4px 0", fontSize: 14 }}>Library, BOM &amp; Local PDF Datasheet Center</h3>
        <p style={{ margin: 0, fontSize: 12, color: "var(--vd-text-secondary)" }}>
          DuckDB offline parametric part catalog across JLCPCB / LCSC components with Basic ($0 fee) vs Extended (+$3 fee) filtering and local PDFium datasheet previews.
        </p>
      </div>

      {/* SEARCH BAR & FEEDER FEE FILTER */}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input
          type="text"
          placeholder="Search MPN, description, package (e.g. TPS54302, LDO, 0603)..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void doSearch();
          }}
          style={{
            flex: 1,
            background: "var(--vd-bg-elevated)",
            border: "1px solid var(--vd-border-subtle)",
            color: "var(--vd-text-primary)",
            padding: "8px 12px",
            borderRadius: 4,
            fontSize: 12,
          }}
        />

        <div style={{ display: "flex", background: "var(--vd-bg-elevated)", borderRadius: 4, padding: 2, border: "1px solid var(--vd-border-subtle)" }}>
          {[
            { id: "all", label: "All Parts" },
            { id: "basic", label: "Basic ($0 Fee)" },
            { id: "extended", label: "Extended (+$3 Fee)" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFeederFilter(f.id)}
              style={{
                background: feederFilter === f.id ? "var(--vd-border-active)" : "transparent",
                color: feederFilter === f.id ? "#0B0E14" : "var(--vd-text-secondary)",
                fontWeight: feederFilter === f.id ? 700 : 400,
                border: "none",
                borderRadius: 3,
                padding: "4px 10px",
                fontSize: 11,
                cursor: "pointer",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <button className="vd-btn vd-btn-primary" onClick={doSearch} style={{ fontSize: 11 }}>
          {loading ? "Searching..." : "Search Catalog"}
        </button>
      </div>

      {/* MAIN SPLIT: RESULTS TABLE & LOCAL DATASHEET PREVIEW */}
      <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 16 }}>
        {/* RESULTS TABLE */}
        <div style={{ background: "var(--vd-bg-elevated)", borderRadius: 6, border: "1px solid var(--vd-border-subtle)", overflow: "hidden" }}>
          <div style={{ padding: "8px 12px", background: "#0E121A", borderBottom: "1px solid var(--vd-border-subtle)", fontSize: 11, fontWeight: 600 }}>
            MATCHING COMPONENTS ({results.length})
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, textAlign: "left" }}>
            <thead>
              <tr style={{ background: "rgba(0,0,0,0.2)", borderBottom: "1px solid var(--vd-border-subtle)" }}>
                <th style={{ padding: "6px 8px" }}>MPN</th>
                <th style={{ padding: "6px 8px" }}>Category</th>
                <th style={{ padding: "6px 8px" }}>Package</th>
                <th style={{ padding: "6px 8px" }}>Feeder Type</th>
                <th style={{ padding: "6px 8px" }}>Unit Cost</th>
                <th style={{ padding: "6px 8px" }}>Stock</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => {
                const isSelected = r.mpn === selectedMpn;
                return (
                  <tr
                    key={r.mpn}
                    onClick={() => void loadDatasheet(r.mpn)}
                    style={{
                      borderBottom: "1px solid #1E293B",
                      background: isSelected ? "rgba(6, 182, 212, 0.15)" : "transparent",
                      cursor: "pointer",
                    }}
                  >
                    <td style={{ padding: "6px 8px", fontWeight: 700 }}>
                      <span className="vd-metric">{r.mpn}</span>
                    </td>
                    <td style={{ padding: "6px 8px", color: "var(--vd-text-secondary)" }}>{r.category}</td>
                    <td style={{ padding: "6px 8px" }} className="vd-metric">{r.package}</td>
                    <td style={{ padding: "6px 8px" }}>
                      <span
                        style={{
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 3,
                          fontWeight: 600,
                          background: r.feeder_fee_type === "basic" ? "#064E3B" : "#451A03",
                          color: r.feeder_fee_type === "basic" ? "#A7F3D0" : "#FDE68A",
                        }}
                      >
                        {r.feeder_fee_type === "basic" ? "BASIC ($0)" : "EXTENDED (+$3)"}
                      </span>
                    </td>
                    <td style={{ padding: "6px 8px" }} className="vd-metric">${r.unit_price_usd.toFixed(2)}</td>
                    <td style={{ padding: "6px 8px" }} className="vd-metric">{r.stock.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* LOCAL DATASHEET PREVIEW & QUARANTINE LEDGER */}
        {datasheet ? (
          <div style={{ background: "var(--vd-bg-elevated)", borderRadius: 6, border: "1px solid var(--vd-border-subtle)", padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <strong className="vd-metric" style={{ fontSize: 13, color: "var(--vd-border-active)" }}>
                  {datasheet.mpn}
                </strong>
                <div style={{ fontSize: 10, color: "var(--vd-text-muted)" }}>
                  {datasheet.rendering_engine} · {datasheet.pages} Pages
                </div>
              </div>
              <span
                style={{
                  fontSize: 10,
                  padding: "2px 6px",
                  borderRadius: 3,
                  fontWeight: 600,
                  background: "#064E3B",
                  color: "#A7F3D0",
                  border: "1px solid var(--vd-pass)",
                }}
              >
                QUARANTINE VERIFIED
              </span>
            </div>

            {/* SHA-256 DIGEST PIN */}
            <div style={{ background: "#0B0E14", padding: 8, borderRadius: 4, border: "1px solid var(--vd-border-subtle)", fontSize: 10 }}>
              <div style={{ color: "var(--vd-text-secondary)", marginBottom: 2 }}>Local SHA-256 Digest:</div>
              <code className="vd-metric" style={{ wordBreak: "break-all", color: "var(--vd-text-primary)" }}>
                {datasheet.sha256}
              </code>
            </div>

            {/* PINOUT TABLE */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Cropped Pinout Table (300-DPI BBox [45, 120, 280, 410]):</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ background: "#0B0E14", textAlign: "left" }}>
                    <th style={{ padding: "4px 6px" }}>Pin</th>
                    <th style={{ padding: "4px 6px" }}>Name</th>
                    <th style={{ padding: "4px 6px" }}>Type</th>
                    <th style={{ padding: "4px 6px" }}>Description</th>
                  </tr>
                </thead>
                <tbody>
                  {datasheet.pin_table.map((p: any) => (
                    <tr key={p.pin} style={{ borderBottom: "1px solid #1E293B" }}>
                      <td style={{ padding: "4px 6px" }} className="vd-metric">{p.pin}</td>
                      <td style={{ padding: "4px 6px", fontWeight: 700 }}>{p.name}</td>
                      <td style={{ padding: "4px 6px", color: "var(--vd-text-secondary)" }}>{p.type}</td>
                      <td style={{ padding: "4px 6px" }}>{p.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ABSOLUTE MAXIMUM RATINGS */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}>Absolute Maximum Ratings:</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ background: "#0B0E14", textAlign: "left" }}>
                    <th style={{ padding: "4px 6px" }}>Parameter</th>
                    <th style={{ padding: "4px 6px" }}>Min</th>
                    <th style={{ padding: "4px 6px" }}>Max</th>
                    <th style={{ padding: "4px 6px" }}>Unit</th>
                  </tr>
                </thead>
                <tbody>
                  {datasheet.absolute_maximums.map((m: any) => (
                    <tr key={m.parameter} style={{ borderBottom: "1px solid #1E293B" }}>
                      <td style={{ padding: "4px 6px" }}>{m.parameter}</td>
                      <td style={{ padding: "4px 6px" }} className="vd-metric">{m.min}</td>
                      <td style={{ padding: "4px 6px" }} className="vd-metric">{m.max}</td>
                      <td style={{ padding: "4px 6px" }} className="vd-metric">{m.unit}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
