import React, { useState } from "react";

export interface DockviewPane {
  id: string;
  title: string;
  icon?: string;
  component: React.ReactNode;
  closable?: boolean;
}

interface DockviewWorkbenchProps {
  primaryPane: DockviewPane;
  secondaryPanes: DockviewPane[];
  defaultSecondaryId?: string;
}

export const DockviewWorkbench: React.FC<DockviewWorkbenchProps> = ({
  primaryPane,
  secondaryPanes,
  defaultSecondaryId,
}) => {
  const [activeSecondaryId, setActiveSecondaryId] = useState<string>(
    defaultSecondaryId || (secondaryPanes.length > 0 ? secondaryPanes[0].id : "")
  );
  const [splitRatio, setSplitRatio] = useState<number>(65); // 65% primary, 35% secondary
  const [secondaryCollapsed, setSecondaryCollapsed] = useState<boolean>(false);

  const activeSecondary = secondaryPanes.find((p) => p.id === activeSecondaryId) || secondaryPanes[0];

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0 }}>
      {/* SECONDARY PANE TAB HEADER */}
      <div
        style={{
          height: 28,
          background: "#0E121A",
          borderBottom: "1px solid var(--vd-border-subtle)",
          display: "flex",
          alignItems: "center",
          padding: "0 8px",
          gap: 4,
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {secondaryPanes.map((pane) => {
            const isTabActive = pane.id === activeSecondaryId && !secondaryCollapsed;
            return (
              <button
                key={pane.id}
                onClick={() => {
                  setActiveSecondaryId(pane.id);
                  setSecondaryCollapsed(false);
                }}
                style={{
                  background: isTabActive ? "var(--vd-bg-panel)" : "transparent",
                  color: isTabActive ? "var(--vd-border-active)" : "var(--vd-text-secondary)",
                  border: "none",
                  borderBottom: isTabActive ? "2px solid var(--vd-border-active)" : "2px solid transparent",
                  padding: "3px 8px",
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                {pane.icon && <span>{pane.icon}</span>}
                <span>{pane.title}</span>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button
            className="vd-btn"
            style={{ padding: "1px 6px", fontSize: 10 }}
            onClick={() => setSecondaryCollapsed((c) => !c)}
          >
            {secondaryCollapsed ? "Show Pane" : "Hide Pane"}
          </button>
        </div>
      </div>

      {/* SPLIT CONTAINER */}
      <div style={{ flex: 1, display: "flex", minWidth: 0, minHeight: 0, position: "relative" }}>
        {/* PRIMARY VIEW (e.g. 2D PCB Canvas) */}
        <div
          style={{
            flex: secondaryCollapsed ? "1 1 100%" : `0 0 ${splitRatio}%`,
            minWidth: 0,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            position: "relative",
          }}
        >
          {primaryPane.component}
        </div>

        {/* SPLIT DIVIDER */}
        {!secondaryCollapsed && (
          <div
            style={{
              width: 4,
              background: "var(--vd-border-subtle)",
              cursor: "col-resize",
              position: "relative",
              zIndex: 10,
            }}
            onMouseDown={(e) => {
              const startX = e.clientX;
              const startRatio = splitRatio;
              const onMove = (me: MouseEvent) => {
                const deltaX = me.clientX - startX;
                const containerWidth = window.innerWidth;
                const deltaRatio = (deltaX / containerWidth) * 100;
                setSplitRatio(Math.max(30, Math.min(85, startRatio + deltaRatio)));
              };
              const onUp = () => {
                window.removeEventListener("mousemove", onMove);
                window.removeEventListener("mouseup", onUp);
              };
              window.addEventListener("mousemove", onMove);
              window.addEventListener("mouseup", onUp);
            }}
          />
        )}

        {/* SECONDARY VIEW (e.g. LayerManager, Stackup, Z3 Pinmux, Bode Lab, DRC) */}
        {!secondaryCollapsed && activeSecondary && (
          <div
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              background: "var(--vd-bg-panel)",
              display: "flex",
              flexDirection: "column",
              overflowY: "auto",
            }}
          >
            {activeSecondary.component}
          </div>
        )}
      </div>
    </div>
  );
};
