import React, { useCallback, useEffect, useState } from "react";
import {
  applyPatch,
  fetchBoard,
  fetchHealth,
  fetchTextExport,
  redoPatch,
  runVerify,
  simulateAgentMove,
  undoPatch,
} from "./api";
import { CLIENT_EDA_COMMANDS, WORKSPACE_TABS, type EdaCommand } from "./commandBus";
import { createDropViaPatch, createExplicitLockPatch, uuidv7 } from "./manualEditorFsm";
import { PcbCanvas } from "./PcbCanvas";
import { LayerManager, type LayerDef } from "./components/LayerManager";
import { StackupEditor } from "./components/StackupEditor";
import { Z3PinmuxStudio } from "./components/Z3PinmuxStudio";
import { SmpsBodeLab } from "./components/SmpsBodeLab";
import { KiCadDrcPanel } from "./components/KiCadDrcPanel";
import { DockviewWorkbench } from "./components/DockviewWorkbench";
import { SchematicCanvas } from "./components/SchematicCanvas";
import { LibraryBomCenter } from "./components/LibraryBomCenter";
import { ThreeDGerberViewer } from "./components/ThreeDGerberViewer";
import { VirtualLabWorkbench } from "./components/VirtualLabWorkbench";
import { PanelizerDiffCenter } from "./components/PanelizerDiffCenter";
import { CopperPourLayer } from "./components/CopperPourLayer";
import type { BoardSnapshot, Nm, ToolMode, UnitMode, VerifyReport } from "./types";

function formatCoord(nm: Nm, unit: UnitMode): string {
  if (unit === "mm") return `${(nm / 1_000_000).toFixed(3)} mm`;
  if (unit === "mil") return `${(nm / 25_400).toFixed(1)} mil`;
  return `${(nm / 1_000).toFixed(0)} um`;
}

export type AiWorkerMode = "OFF" | "COPILOT" | "AUTONOMOUS";

export const App: React.FC = () => {
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null);
  const [verify, setVerify] = useState<VerifyReport | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [highlightIds, setHighlightIds] = useState<string[]>([]);
  const [toolMode, setToolMode] = useState<ToolMode>("SELECT");
  const [activeLayer, setActiveLayer] = useState<"F.Cu" | "B.Cu">("F.Cu");
  const [activeNetId, setActiveNetId] = useState<string>("");
  const [unitMode, setUnitMode] = useState<UnitMode>("mm");
  const [diagonalFirst, setDiagonalFirst] = useState(false);
  const [banner, setBanner] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(null);
  const [budgetCap, setBudgetCap] = useState(5.0);
  const [exportModal, setExportModal] = useState<{ title: string; content: string } | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [paletteSearch, setPaletteSearch] = useState("");
  const [activeWorkspace, setActiveWorkspace] = useState<string>("pcb_layout");
  const [aiWorkerMode, setAiWorkerMode] = useState<AiWorkerMode>("OFF");
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const [layers, setLayers] = useState<LayerDef[]>([
    { name: "F.Cu", label: "Front Copper (F.Cu - 1 oz)", color: "#EF4444", visible: true, kind: "copper" },
    { name: "In1.Cu", label: "Inner 1 (GND Plane - 0.5 oz)", color: "#F59E0B", visible: true, kind: "copper" },
    { name: "In2.Cu", label: "Inner 2 (PWR Plane - 0.5 oz)", color: "#10B981", visible: true, kind: "copper" },
    { name: "B.Cu", label: "Bottom Copper (B.Cu - 1 oz)", color: "#3B82F6", visible: true, kind: "copper" },
    { name: "F.Silkscreen", label: "Front Silkscreen", color: "#F8FAFC", visible: true, kind: "silk" },
    { name: "B.Silkscreen", label: "Bottom Silkscreen", color: "#06B6D4", visible: false, kind: "silk" },
    { name: "Edge.Cuts", label: "Board Edge Cuts", color: "#EAB308", visible: true, kind: "edge" },
  ]);

  const [hud, setHud] = useState({
    xNm: 0,
    yNm: 0,
    relDxNm: 0,
    relDyNm: 0,
    snapKind: "grid",
    routeLenMm: 0,
    routeDelayPs: 0,
    liveDrcCount: 0,
  });

  const refreshAll = useCallback(async () => {
    const [b, v, h] = await Promise.all([fetchBoard(), runVerify(), fetchHealth()]);
    setSnapshot(b);
    setVerify(v);
    setBudgetCap(h.budget.session_hard_cap_usd);
    if (!activeNetId && b.nets.length > 0) setActiveNetId(b.nets[0].id);
  }, [activeNetId]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  // Keyboard shortcuts (KiCad 10 / Vajra-Dhīr preset + Command Palette)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        setCommandPaletteOpen((o) => !o);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        void undoPatch().then(refreshAll).catch(() => { });
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        void redoPatch().then(refreshAll).catch(() => { });
        return;
      }
      if (e.key.toLowerCase() === "x") setToolMode("ROUTE");
      if (e.key.toLowerCase() === "b" && !e.ctrlKey && !e.metaKey) {
        const cmd = CLIENT_EDA_COMMANDS.find((c) => c.id === "pcb.copper.refill");
        if (cmd) void runCommand(cmd);
      }
      if (e.key === "Escape") {
        setToolMode("SELECT");
        setCommandPaletteOpen(false);
        setActiveMenu(null);
      }
      if (e.key === "/") setDiagonalFirst((d) => !d);
      if (e.key.toLowerCase() === "q") {
        setUnitMode((u) => (u === "mm" ? "mil" : u === "mil" ? "um" : "mm"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [refreshAll]);

  if (!snapshot) {
    return (
      <div style={{ padding: 24, fontFamily: "var(--vd-font-mono)", color: "var(--vd-text-primary)" }}>
        Connecting to Vajra-Dhīr EDA v0.0.1 daemon on 127.0.0.1:41900...
      </div>
    );
  }

  const selectedComp = snapshot.components.find((c) => c.id === selectedId) ?? null;

  const handleHumanMove = async (compId: string, xNm: Nm, yNm: Nm) => {
    const comp = snapshot.components.find((c) => c.id === compId);
    if (!comp) return;
    const res = await applyPatch({
      expected_lamport: snapshot.project.rev_lamport,
      actor_kind: "human",
      actor_id: "engineer",
      summary: `Human moved & locked ${comp.refdes}`,
      ops: [
        { op: "MOVE_COMPONENT", component_id: compId, x_nm: xNm, y_nm: yNm, rot_mdeg: comp.rot_mdeg, side: comp.side },
        { op: "SET_LOCK", entity_type: "component", entity_id: compId, locked: true, reason: "human_manual_drag" },
      ],
    });
    setBanner({ kind: res.applied ? "ok" : "err", text: res.message });
    await refreshAll();
  };

  const handleToggleLock = async (compId: string, nextLock: boolean) => {
    const comp = snapshot.components.find((c) => c.id === compId);
    if (!comp) return;
    const res = await applyPatch(
      createExplicitLockPatch({
        entityType: "component",
        entityId: compId,
        locked: nextLock,
        expectedLamport: snapshot.project.rev_lamport,
        reason: nextLock ? "human_explicit_lock" : null,
      })
    );
    setBanner({ kind: res.applied ? "ok" : "err", text: res.message });
    await refreshAll();
  };

  const handleAgentTest = async (compId: string) => {
    const res = await simulateAgentMove(compId, 2_000_000, 0);
    if (res.applied) {
      setBanner({ kind: "info", text: `Agent moved unlocked component (+2.0mm): ${res.message}` });
    } else {
      setBanner({ kind: "err", text: `BLOCKED [${res.error_code}]: ${res.message}` });
    }
    await refreshAll();
  };

  const handleCommitRoute = async (points: Array<[Nm, Nm]>, layer: "F.Cu" | "B.Cu", netId: string, widthNm: Nm) => {
    const ops = [];
    for (let i = 0; i < points.length - 1; i++) {
      ops.push({
        op: "ADD_TRACE",
        trace: {
          id: uuidv7(),
          board_id: snapshot.board.id,
          net_id: netId,
          layer_name: layer,
          x1_nm: points[i][0],
          y1_nm: points[i][1],
          x2_nm: points[i + 1][0],
          y2_nm: points[i + 1][1],
          width_nm: widthNm,
          provenance: "human",
          locked: true,
          rev_lamport: snapshot.project.rev_lamport + 1,
        },
      });
    }
    const res = await applyPatch({
      expected_lamport: snapshot.project.rev_lamport,
      actor_kind: "human",
      actor_id: "engineer",
      summary: `Routed ${ops.length} locked ${layer} copper segment(s)`,
      ops,
    });
    setBanner({ kind: res.applied ? "ok" : "err", text: res.message });
    await refreshAll();
  };

  const handleDropVia = async (xNm: Nm, yNm: Nm, netId: string) => {
    const nextLayer = activeLayer === "F.Cu" ? "B.Cu" : "F.Cu";
    await applyPatch(
      createDropViaPatch({
        boardId: snapshot.board.id,
        netId,
        xNm,
        yNm,
        activeLayer,
        expectedLamport: snapshot.project.rev_lamport,
      })
    );
    setActiveLayer(nextLayer);
    await refreshAll();
  };

  const openExport = async (kind: "kicad-pcb" | "firmware-pins") => {
    const content = await fetchTextExport(kind);
    setExportModal({ title: kind === "kicad-pcb" ? "KiCad 10 .kicad_pcb S-Expression" : "firmware/board_pins.h", content });
  };

  const runCommand = async (cmd: EdaCommand) => {
    setCommandPaletteOpen(false);
    setActiveMenu(null);
    try {
      const res = await cmd.run({}, "human");
      if (typeof res === "string") {
        setExportModal({ title: cmd.label, content: res });
      } else {
        setBanner({ kind: "ok", text: `Executed [${cmd.label}]: ${JSON.stringify(res).slice(0, 100)}` });
      }
      await refreshAll();
    } catch (e: any) {
      setBanner({ kind: "err", text: `Failed [${cmd.label}]: ${e.message}` });
    }
  };

  const filteredCommands = CLIENT_EDA_COMMANDS.filter((c) =>
    c.label.toLowerCase().includes(paletteSearch.toLowerCase()) ||
    c.id.toLowerCase().includes(paletteSearch.toLowerCase())
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--vd-bg-canvas)", color: "var(--vd-text-primary)" }}>
      {/* 1. TOP APPLICATION MENUBAR */}
      <div style={{ height: 26, background: "#0B0E14", borderBottom: "1px solid var(--vd-border-subtle)", display: "flex", alignItems: "center", padding: "0 8px", fontSize: 12, gap: 12 }}>
        {["File", "Edit", "Place", "Route", "Verify", "Simulate", "Tools", "Export"].map((menu) => (
          <div
            key={menu}
            style={{ position: "relative", cursor: "pointer", color: activeMenu === menu ? "var(--vd-border-active)" : "var(--vd-text-secondary)" }}
            onClick={() => setActiveMenu(activeMenu === menu ? null : menu)}
          >
            <span>{menu}</span>
            {activeMenu === menu && (
              <div style={{ position: "absolute", top: 22, left: 0, background: "var(--vd-bg-elevated)", border: "1px solid var(--vd-border-subtle)", borderRadius: 4, minWidth: 200, zIndex: 1000, boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
                {CLIENT_EDA_COMMANDS.filter((c) => c.category === menu || menu === "File" || menu === "Tools").map((cmd) => (
                  <div
                    key={cmd.id}
                    onClick={() => void runCommand(cmd)}
                    style={{ padding: "6px 12px", display: "flex", justifyContent: "space-between", fontSize: 11, cursor: "pointer", borderBottom: "1px solid #1E293B" }}
                  >
                    <span>{cmd.label}</span>
                    {cmd.shortcut && <span style={{ color: "var(--vd-text-muted)" }}>{cmd.shortcut}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <button className="vd-btn" style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => setCommandPaletteOpen(true)}>
            Command Palette (Ctrl+Shift+P)
          </button>
        </div>
      </div>

      {/* 2. TOP TELEMETRY & GOVERNANCE BAR */}
      <header style={{ height: 44, background: "var(--vd-bg-panel)", borderBottom: "1px solid var(--vd-border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <img src="/logo-white.png" alt="Vajra-Dhīr Logo" style={{ height: 22, width: 22, display: "block", objectFit: "contain" }} />
          <strong style={{ letterSpacing: 0.4 }}>VAJRA-DHĪR EDA</strong>
          <span className="vd-metric" style={{ fontSize: 11, padding: "2px 6px", background: "#1E293B", borderRadius: 4 }}>v0.0.1</span>
          <span className="vd-metric" style={{ fontSize: 11, color: "var(--vd-dlp-airgap)", border: "1px solid var(--vd-dlp-airgap)", padding: "2px 6px", borderRadius: 4 }}>
            {snapshot.project.dlp_class}
          </span>
          <span className="vd-metric" style={{ fontSize: 11, color: "var(--vd-text-secondary)" }}>
            rev={snapshot.project.rev_lamport} · BOM ${snapshot.total_bom_usd.toFixed(2)} · Cap ${budgetCap.toFixed(2)}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ display: "flex", background: "var(--vd-bg-elevated)", borderRadius: 4, padding: 2, border: "1px solid var(--vd-border-subtle)" }}>
            {(["OFF", "COPILOT", "AUTONOMOUS"] as AiWorkerMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setAiWorkerMode(mode)}
                style={{
                  background: aiWorkerMode === mode ? (mode === "OFF" ? "#334155" : "var(--vd-agent-pulse)") : "transparent",
                  color: aiWorkerMode === mode ? "#FFF" : "var(--vd-text-secondary)",
                  border: "none",
                  borderRadius: 3,
                  padding: "3px 8px",
                  fontSize: 10,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                AI: {mode}
              </button>
            ))}
          </div>

          <button className={`vd-btn ${toolMode === "SELECT" ? "vd-btn-primary" : ""}`} onClick={() => setToolMode("SELECT")}>Select (Esc)</button>
          <button className={`vd-btn ${toolMode === "ROUTE" ? "vd-btn-primary" : ""}`} onClick={() => setToolMode("ROUTE")}>Route 45° (X)</button>
          <button className="vd-btn" onClick={() => setActiveLayer((l) => (l === "F.Cu" ? "B.Cu" : "F.Cu"))}>Layer: {activeLayer}</button>
          <button className="vd-btn" onClick={() => void undoPatch().then(refreshAll).catch(() => { })}>Undo</button>
          <button className="vd-btn" onClick={() => void redoPatch().then(refreshAll).catch(() => { })}>Redo</button>
          <button className="vd-btn" onClick={() => void openExport("kicad-pcb")}>Export .kicad_pcb</button>
          <button className="vd-btn" onClick={() => void openExport("firmware-pins")}>board_pins.h</button>
        </div>
      </header>

      {/* 3. WORKSPACE TABS BAR (7 Full Native Workspaces) */}
      <div style={{ height: 32, background: "#10141C", borderBottom: "1px solid var(--vd-border-subtle)", display: "flex", alignItems: "center", padding: "0 8px", gap: 4, overflowX: "auto" }}>
        {WORKSPACE_TABS.map((ws) => (
          <button
            key={ws.id}
            onClick={() => setActiveWorkspace(ws.id)}
            style={{
              background: activeWorkspace === ws.id ? "var(--vd-bg-panel)" : "transparent",
              color: activeWorkspace === ws.id ? "var(--vd-border-active)" : "var(--vd-text-secondary)",
              border: "none",
              borderBottom: activeWorkspace === ws.id ? "2px solid var(--vd-border-active)" : "2px solid transparent",
              padding: "4px 10px",
              fontSize: 11,
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
            }}
          >
            <span>{ws.icon}</span>
            <span>{ws.title}</span>
          </button>
        ))}
      </div>

      {/* LIVE STATUS / KERNEL LOCK VIOLATION BANNER */}
      {banner && (
        <div className="vd-metric" style={{
          padding: "6px 14px", fontSize: 12,
          background: banner.kind === "err" ? "#450A0A" : banner.kind === "ok" ? "#064E3B" : "#1E1B4B",
          color: banner.kind === "err" ? "#FCA5A5" : banner.kind === "ok" ? "#A7F3D0" : "#DDD6FE",
          borderBottom: "1px solid var(--vd-border-subtle)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span>{banner.text}</span>
          <button className="vd-btn" style={{ padding: "0 6px" }} onClick={() => setBanner(null)}>x</button>
        </div>
      )}

      {/* 4. MAIN WORKSPACE VIEWPORT */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: aiWorkerMode === "OFF" ? "250px 1fr 340px" : "250px 1fr 340px 280px", minHeight: 0 }}>
        {/* LEFT PANE: COMPONENTS & NETS CROSS-PROBE */}
        <aside style={{ background: "var(--vd-bg-panel)", borderRight: "1px solid var(--vd-border-subtle)", overflowY: "auto", padding: 10 }}>
          <div style={{ fontSize: 11, color: "var(--vd-text-muted)", marginBottom: 6 }}>COMPONENTS ({snapshot.components.length})</div>
          {snapshot.components.map((c) => (
            <div
              key={c.id}
              onClick={() => { setSelectedId(c.id); setHighlightIds([]); }}
              style={{
                padding: "6px 8px", borderRadius: 4, marginBottom: 4, cursor: "pointer",
                background: c.id === selectedId ? "var(--vd-bg-elevated)" : "transparent",
                border: c.id === selectedId ? "1px solid var(--vd-border-active)" : "1px solid transparent",
                display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12,
              }}
            >
              <div>
                <strong className="vd-metric">{c.refdes}</strong>{" "}
                <span style={{ color: "var(--vd-text-secondary)" }}>{c.value_str}</span>
              </div>
              {c.locked && <span style={{ color: "var(--vd-human-lock)", fontSize: 11 }}>🔒</span>}
            </div>
          ))}

          <div style={{ fontSize: 11, color: "var(--vd-text-muted)", margin: "14px 0 6px" }}>ACTIVE ROUTING NET</div>
          <select
            value={activeNetId}
            onChange={(e) => setActiveNetId(e.target.value)}
            style={{ width: "100%", background: "var(--vd-bg-elevated)", color: "var(--vd-text-primary)", border: "1px solid var(--vd-border-subtle)", padding: 6, borderRadius: 4, fontSize: 12 }}
          >
            {snapshot.nets.map((n) => (
              <option key={n.id} value={n.id}>{n.name} ({n.nominal_voltage_v}V)</option>
            ))}
          </select>
        </aside>

        {/* CENTER PANE: WORKSPACE CONTENT */}
        <main style={{ position: "relative", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {activeWorkspace === "pcb_layout" && (
            <DockviewWorkbench
              primaryPane={{
                id: "pcb_canvas",
                title: "2D PCB Canvas (120FPS)",
                component: (
                  <div style={{ flex: 1, position: "relative", minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column" }}>
                    <PcbCanvas
                      snapshot={snapshot}
                      selectedId={selectedId}
                      highlightIds={highlightIds}
                      toolMode={toolMode}
                      activeLayer={activeLayer}
                      activeNetId={activeNetId}
                      traceWidthNm={300_000}
                      unitMode={unitMode}
                      diagonalFirst={diagonalFirst}
                      onSelect={setSelectedId}
                      onCommitMove={handleHumanMove}
                      onCommitRoute={handleCommitRoute}
                      onDropVia={handleDropVia}
                      onHudChange={setHud}
                    />
                    <div className="vd-metric" style={{ position: "absolute", top: 10, left: 10, fontSize: 11, background: "rgba(16,20,28,0.85)", padding: "4px 8px", borderRadius: 4, border: "1px solid var(--vd-border-subtle)" }}>
                      {snapshot.project.name} · Drag parts to move+lock · Shift+Drag pan · Wheel zoom · / elbow · Q units
                    </div>
                  </div>
                ),
              }}
              secondaryPanes={[
                {
                  id: "layer_manager",
                  title: "Layer Manager",
                  icon: "☰",
                  component: (
                    <LayerManager
                      activeLayer={activeLayer}
                      onSelectLayer={setActiveLayer}
                      layers={layers}
                      onToggleVisibility={(name) => {
                        setLayers((prev) =>
                          prev.map((l) => (l.name === name ? { ...l, visible: !l.visible } : l))
                        );
                      }}
                    />
                  ),
                },
                {
                  id: "stackup_editor",
                  title: "Stackup & Impedance",
                  icon: "☵",
                  component: <StackupEditor />,
                },
                {
                  id: "drc_panel",
                  title: "KiCad 10 DRC",
                  icon: "🛡",
                  component: <KiCadDrcPanel />,
                },
                {
                  id: "copper_pour",
                  title: "Copper Pour Zone",
                  icon: "⛶",
                  component: (
                    <div style={{ padding: 10 }}>
                      <CopperPourLayer layer={activeLayer} net={activeNetId || "+3V3_OUT"} />
                    </div>
                  ),
                },
                {
                  id: "smps_bode",
                  title: "SMPS Stability",
                  icon: "⚡",
                  component: <SmpsBodeLab />,
                },
                {
                  id: "z3_pinmux",
                  title: "Z3 Pinmux",
                  icon: "⌥",
                  component: <Z3PinmuxStudio />,
                },
              ]}
              defaultSecondaryId="layer_manager"
            />
          )}

          {activeWorkspace === "schematic" && (
            <SchematicCanvas onSelectComponent={(refdes) => {
              const comp = snapshot.components.find((c) => c.refdes === refdes);
              if (comp) setSelectedId(comp.id);
            }} />
          )}

          {activeWorkspace === "mcad_3d" && (
            <ThreeDGerberViewer snapshot={snapshot} unitMode={unitMode} />
          )}

          {activeWorkspace === "sim_lab" && <VirtualLabWorkbench />}

          {activeWorkspace === "library_bom" && <LibraryBomCenter />}

          {activeWorkspace === "firmware_pinmux" && <Z3PinmuxStudio />}

          {activeWorkspace === "mfg_diff" && (
            <PanelizerDiffCenter snapshot={snapshot} />
          )}
        </main>

        {/* RIGHT PANE 1: INSPECTOR, AGENT LOCK TEST & DETERMINISTIC VERIFICATION */}
        <aside style={{ background: "var(--vd-bg-panel)", borderLeft: "1px solid var(--vd-border-subtle)", overflowY: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* SELECTED ENTITY INSPECTOR */}
          <section style={{ background: "var(--vd-bg-elevated)", padding: 10, borderRadius: 6, border: "1px solid var(--vd-border-subtle)" }}>
            <div style={{ fontSize: 11, color: "var(--vd-text-muted)", marginBottom: 6 }}>ENTITY INSPECTOR &amp; KERNEL LOCK PROOF</div>
            {selectedComp ? (
              <div style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 5 }}>
                <div><strong className="vd-metric">{selectedComp.refdes}</strong> — {selectedComp.mpn} ({selectedComp.package_name})</div>
                <div className="vd-metric" style={{ color: "var(--vd-text-secondary)" }}>
                  X: {selectedComp.x_nm} nm ({formatCoord(selectedComp.x_nm, unitMode)})<br />
                  Y: {selectedComp.y_nm} nm ({formatCoord(selectedComp.y_nm, unitMode)})<br />
                  Provenance: {selectedComp.provenance} · Locked: {selectedComp.locked ? "YES (GOLD HALO)" : "NO"}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  <button className="vd-btn vd-btn-warn" onClick={() => void handleToggleLock(selectedComp.id, !selectedComp.locked)}>
                    {selectedComp.locked ? "Unlock (Human)" : "Lock (Human)"}
                  </button>
                  <button className="vd-btn vd-btn-agent" onClick={() => void handleAgentTest(selectedComp.id)}>
                    Simulate Agent Move (+2mm)
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "var(--vd-text-secondary)" }}>
                Select any component (try locked <strong>U2</strong> or unlocked <strong>L1</strong>) to inspect exact i64 nm coordinates or test SQLite <code>KERNEL_LOCK_VIOLATION</code>.
              </div>
            )}
          </section>

          {/* DETERMINISTIC VERIFICATION & SMPS PHYSICS */}
          {verify && (
            <section style={{ background: "var(--vd-bg-elevated)", padding: 10, borderRadius: 6, border: "1px solid var(--vd-border-subtle)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 11, color: "var(--vd-text-muted)" }}>DETERMINISTIC VERIFIER</span>
                <span className="vd-metric" style={{ fontSize: 11, color: verify.passed ? "var(--vd-pass)" : "var(--vd-fail)" }}>
                  {verify.passed ? "PASS" : `FAIL (${verify.error_count} err)`}
                </span>
              </div>
              <div className="vd-metric" style={{ fontSize: 11, color: "var(--vd-text-secondary)", marginBottom: 8, lineHeight: 1.5 }}>
                Duty={verify.smps_duty_cycle} · Lmin={verify.smps_l_min_uh}uH · dIL={verify.smps_delta_il_a}A<br />
                Isat&gt;={verify.smps_i_sat_req_a}A · Ripple={verify.smps_ripple_mvpp}mVpp · IPC2152={verify.ipc2152_min_trace_mm}mm
              </div>
              {verify.checks.map((chk, idx) => (
                <div
                  key={idx}
                  onClick={() => setHighlightIds(chk.entity_ids)}
                  style={{
                    fontSize: 11, padding: "5px 7px", marginBottom: 4, borderRadius: 4, cursor: "pointer",
                    background: "#0B0E14",
                    borderLeft: `3px solid ${chk.passed ? "var(--vd-pass)" : chk.severity === "error" ? "var(--vd-fail)" : "var(--vd-warn)"}`,
                  }}
                >
                  <strong className="vd-metric">[{chk.code}]</strong> {chk.message}
                </div>
              ))}
            </section>
          )}

          {/* ATOMIC PATCH JOURNAL */}
          <section style={{ background: "var(--vd-bg-elevated)", padding: 10, borderRadius: 6, border: "1px solid var(--vd-border-subtle)" }}>
            <div style={{ fontSize: 11, color: "var(--vd-text-muted)", marginBottom: 6 }}>ATOMIC PATCH JOURNAL</div>
            {snapshot.patches.length === 0 ? (
              <div style={{ fontSize: 11, color: "var(--vd-text-secondary)" }}>No mutations yet. Drag a part or route a trace.</div>
            ) : (
              snapshot.patches.slice(0, 8).map((p) => (
                <div key={p.patch_id} className="vd-metric" style={{ fontSize: 11, opacity: p.undone ? 0.4 : 1, marginBottom: 4 }}>
                  rev={p.lamport_ts} [{p.actor_kind}] {p.summary}
                </div>
              ))
            )}
          </section>
        </aside>

        {/* RIGHT PANE 2: OPTIONAL COLLAPSIBLE AI WORKER DOCK */}
        {aiWorkerMode !== "OFF" && (
          <aside style={{ background: "#0D1117", borderLeft: "1px solid var(--vd-agent-pulse)", padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "var(--vd-agent-pulse)" }}>
                AI WORKER ({aiWorkerMode})
              </span>
              <button className="vd-btn" style={{ padding: "0 6px", fontSize: 10 }} onClick={() => setAiWorkerMode("OFF")}>✕</button>
            </div>

            <div style={{ fontSize: 11, background: "rgba(139, 92, 246, 0.1)", border: "1px solid var(--vd-agent-pulse)", borderRadius: 4, padding: 8, color: "#DDD6FE" }}>
              <strong>Same-Hands Law Active:</strong> Worker interacts strictly through Unified Command Bus with actor=<code>"agent"</code>.
            </div>

            <div style={{ fontSize: 11, background: "rgba(251, 191, 36, 0.1)", border: "1px solid var(--vd-human-lock)", borderRadius: 4, padding: 8, color: "#FDE68A" }}>
              <strong>Fail-Closed Locks:</strong> 22 SQLite triggers protect locked components from agent edits.
            </div>

            <div style={{ flex: 1, background: "#0B0E14", borderRadius: 4, padding: 8, fontSize: 11, color: "var(--vd-text-secondary)", overflowY: "auto" }}>
              <div style={{ color: "var(--vd-text-muted)", marginBottom: 6 }}>THOUGHT STREAM</div>
              <div>&gt; Subscribed to HW-IR SQLite rev={snapshot.project.rev_lamport}</div>
              <div>&gt; Monitored 12 components, 6 nets</div>
              <div>&gt; Waiting for user prompt or copilot trigger...</div>
            </div>
          </aside>
        )}
      </div>

      {/* 5. BOTTOM CAD HUD STATUS BAR */}
      <footer className="vd-metric" style={{ height: 28, background: "var(--vd-bg-panel)", borderTop: "1px solid var(--vd-border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", fontSize: 11, color: "var(--vd-text-secondary)" }}>
        <span>
          X: {formatCoord(hud.xNm, unitMode)} · Y: {formatCoord(hud.yNm, unitMode)} · dX: {formatCoord(hud.relDxNm, unitMode)} · dY: {formatCoord(hud.relDyNm, unitMode)} [{unitMode.toUpperCase()}]
        </span>
        <span>
          Mode: {toolMode} · Layer: {activeLayer} · Snap: {hud.snapKind}
          {hud.routeLenMm > 0 ? ` · Len: ${hud.routeLenMm}mm (${hud.routeDelayPs}ps) · LiveDRC: ${hud.liveDrcCount}` : ""}
        </span>
      </footer>

      {/* COMMAND PALETTE MODAL (Ctrl+Shift+P) */}
      {commandPaletteOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: "15vh", zIndex: 2000 }}>
          <div style={{ width: "min(600px, 90vw)", background: "var(--vd-bg-panel)", border: "1px solid var(--vd-border-active)", borderRadius: 8, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 16px 48px rgba(0,0,0,0.8)" }}>
            <input
              autoFocus
              type="text"
              placeholder="Type a command or action... (e.g. Z3, DRC, Panelize, Route)"
              value={paletteSearch}
              onChange={(e) => setPaletteSearch(e.target.value)}
              style={{ padding: "12px 16px", background: "var(--vd-bg-elevated)", border: "none", borderBottom: "1px solid var(--vd-border-subtle)", color: "#FFF", fontSize: 13, outline: "none" }}
            />
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              {filteredCommands.length === 0 ? (
                <div style={{ padding: 16, fontSize: 12, color: "var(--vd-text-muted)" }}>No matching commands</div>
              ) : (
                filteredCommands.map((cmd) => (
                  <div
                    key={cmd.id}
                    onClick={() => void runCommand(cmd)}
                    style={{ padding: "10px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #1E293B", cursor: "pointer" }}
                  >
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600 }}>{cmd.label}</div>
                      <div style={{ fontSize: 10, color: "var(--vd-text-muted)" }}>{cmd.description}</div>
                    </div>
                    {cmd.shortcut && (
                      <span className="vd-metric" style={{ fontSize: 10, background: "#1E293B", padding: "2px 6px", borderRadius: 4 }}>
                        {cmd.shortcut}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* EXPORT MODAL */}
      {exportModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 1500 }}>
          <div style={{ width: "min(860px, 95vw)", height: "75vh", background: "var(--vd-bg-panel)", border: "1px solid var(--vd-border-active)", borderRadius: 8, display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--vd-border-subtle)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong className="vd-metric">{exportModal.title}</strong>
              <button className="vd-btn" onClick={() => setExportModal(null)}>Close</button>
            </div>
            <pre className="vd-metric" style={{ flex: 1, margin: 0, padding: 14, overflow: "auto", fontSize: 12, background: "#0B0E14" }}>
              {exportModal.content}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
