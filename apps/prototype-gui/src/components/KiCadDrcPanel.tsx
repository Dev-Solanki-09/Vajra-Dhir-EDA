import React, { useEffect, useState } from "react";
import { fetchDrcFull } from "../api";

interface DrcPanelProps {
  onFocusCoordinate?: (xNm: number, yNm: number) => void;
}

export const KiCadDrcPanel: React.FC<DrcPanelProps> = ({ onFocusCoordinate }) => {
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);

  const loadDrc = async () => {
    setLoading(true);
    try {
      const res = await fetchDrcFull();
      setReport(res);
    } catch (e: any) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDrc();
  }, []);

  if (!report) {
    return <div style={{ padding: 16, fontSize: 12, color: "var(--vd-text-secondary)" }}>Running KiCad 10 Headless DRC...</div>;
  }

  return (
    <div style={{ padding: 16, overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h3 style={{ margin: "0 0 4px 0", fontSize: 14 }}>KiCad 10 Headless DRC &amp; ERC Oracle (kicad-cli)</h3>
          <p style={{ margin: 0, fontSize: 12, color: "var(--vd-text-secondary)" }}>
            Official KiCad 10.0.8 headless design rule verifier and IPC-2221B Class 2 electrical safety engine.
          </p>
        </div>
        <button className="vd-btn vd-btn-primary" onClick={loadDrc} style={{ fontSize: 11 }}>
          {loading ? "Verifying..." : "Run DRC (F8)"}
        </button>
      </div>

      {/* DRC STATUS SUMMARY */}
      <div
        className="vd-metric"
        style={{
          padding: "10px 14px",
          borderRadius: 6,
          background: report.passed ? "#064E3B" : "#450A0A",
          border: `1px solid ${report.passed ? "var(--vd-pass)" : "var(--vd-fail)"}`,
          color: report.passed ? "#A7F3D0" : "#FCA5A5",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: 12,
        }}
      >
        <span>
          <strong>{report.passed ? "DRC CLEAN (ZERO VIOLATIONS)" : "DRC VIOLATIONS FOUND"}:</strong>{" "}
          {report.total_violations} Error(s) · {report.total_warnings} Warning(s) · {report.checks_run} Checks Passed
        </span>
        <span style={{ fontSize: 11, background: "rgba(0,0,0,0.3)", padding: "2px 8px", borderRadius: 4 }}>
          Engine: {report.engine}
        </span>
      </div>

      {/* CHECKS EXECUTED LIST */}
      <div>
        <h4 style={{ margin: "6px 0 8px 0", fontSize: 12, color: "var(--vd-text-muted)" }}>
          VERIFIED DESIGN RULES ({report.passed_checks.length})
        </h4>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {report.passed_checks.map((chk: any) => (
            <div
              key={chk.rule}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 10px",
                background: "var(--vd-bg-elevated)",
                border: "1px solid var(--vd-border-subtle)",
                borderRadius: 4,
                fontSize: 12,
              }}
            >
              <div>
                <span style={{ color: "var(--vd-pass)", marginRight: 8, fontWeight: 700 }}>✓</span>
                <strong className="vd-metric">{chk.rule}</strong>
                <span style={{ color: "var(--vd-text-secondary)", marginLeft: 8 }}>{chk.detail}</span>
              </div>
              <span className="vd-metric" style={{ fontSize: 11, color: "var(--vd-text-muted)" }}>
                PASS
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
