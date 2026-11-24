import type { BoardSnapshot, Nm, RoutePreviewRes, VerifyReport } from "./types";

export async function fetchBoard(): Promise<BoardSnapshot> {
  const r = await fetch("/api/v1/board");
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchHealth(): Promise<{
  version: string;
  dlp_class: string;
  budget: { session_hard_cap_usd: number; usd_to_inr_rate: number };
}> {
  const r = await fetch("/api/v1/health");
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function applyPatch(payload: {
  expected_lamport: number;
  actor_kind: "human" | "agent";
  actor_id: string;
  summary: string;
  ops: unknown[];
}): Promise<{ applied: boolean; error_code?: string; message: string; new_lamport: number }> {
  const r = await fetch("/api/v1/patch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return r.json();
}

export async function simulateAgentMove(componentId: string, dxNm: Nm, dyNm: Nm) {
  const r = await fetch("/api/v1/agent-simulate-move", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ component_id: componentId, dx_nm: dxNm, dy_nm: dyNm }),
  });
  return r.json() as Promise<{ applied: boolean; error_code?: string; message: string }>;
}

export async function undoPatch() {
  const r = await fetch("/api/v1/undo", { method: "POST" });
  if (!r.ok) throw new Error(await r.text());
}

export async function redoPatch() {
  const r = await fetch("/api/v1/redo", { method: "POST" });
  if (!r.ok) throw new Error(await r.text());
}

export async function snapPoint(xNm: Nm, yNm: Nm, gridNm: Nm, layer: string) {
  const r = await fetch("/api/v1/snap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x_nm: xNm, y_nm: yNm, grid_nm: gridNm, layer }),
  });
  return r.json() as Promise<{ x_nm: Nm; y_nm: Nm; snap_kind: string; target_net_id: string | null }>;
}

export async function previewRoute(req: {
  start_x_nm: Nm;
  start_y_nm: Nm;
  end_x_nm: Nm;
  end_y_nm: Nm;
  layer: string;
  net_id: string;
  width_nm: Nm;
  diagonal_first: boolean;
}): Promise<RoutePreviewRes> {
  const r = await fetch("/api/v1/route-preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  return r.json();
}

export async function runVerify(): Promise<VerifyReport> {
  const r = await fetch("/api/v1/verify", { method: "POST" });
  return r.json();
}

export async function fetchTextExport(kind: "kicad-pcb" | "firmware-pins"): Promise<string> {
  const r = await fetch(`/api/v1/export/${kind}`);
  return r.text();
}

export async function fetchStackup() {
  const r = await fetch("/api/v1/stackup");
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchNetclasses() {
  const r = await fetch("/api/v1/netclasses");
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchDrcFull() {
  const r = await fetch("/api/v1/drc/full");
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function searchComponents(q: string = "", feederType: string = "all") {
  const r = await fetch(`/api/v1/components/search?q=${encodeURIComponent(q)}&feeder_type=${encodeURIComponent(feederType)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchDatasheetPreview(mpn: string = "TPS54302DDCR") {
  const r = await fetch(`/api/v1/datasheet/preview?mpn=${encodeURIComponent(mpn)}`);
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function solvePinmux(signals?: Array<{ signal: string; periph: string; pin?: string }>) {
  const r = await fetch("/api/v1/pinmux/solve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signals }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function calcSmpsBode(params: {
  vin?: number;
  vout?: number;
  iout?: number;
  fsw_khz?: number;
  l_uh?: number;
  c_nom_uf?: number;
  esr_mohm?: number;
}) {
  const r = await fetch("/api/v1/smps/bode-calc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function solvePdn(net: string = "+3V3_OUT", currentA: number = 3.0, ambientTempC: number = 25.0) {
  const r = await fetch("/api/v1/pdn/solve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ net, current_a: currentA, ambient_temp_c: ambientTempC }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function compileHarness(harnessName: string = "WH-001_MAIN_INTERCONNECT") {
  const r = await fetch("/api/v1/harness/compile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ harness_name: harnessName }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function generatePanel(rows: number = 2, cols: number = 2, railMm: number = 5.0) {
  const r = await fetch("/api/v1/panel/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rows, cols, rail_mm: railMm }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function compareDiff(revOld: number = 1, revNew: number = 2) {
  const r = await fetch("/api/v1/diff/compare", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ rev_old: revOld, rev_new: revNew }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function refillCopper(layer: string = "F.Cu", net: string = "GND", clearanceMm: number = 0.25) {
  const r = await fetch("/api/v1/copper/refill", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ layer, net, clearance_mm: clearanceMm }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
