/**
 * Pure-MIT Tracespace-Compatible RS-274X Gerber Layer SVG Preview Renderer.
 * Converts RS-274X integer coordinates cleanly into SVG paths + pad flashes.
 */

export function renderGerberPreviewSvg(gerberText: string, layerLabel = 'F.Cu'): string {
  const segs: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  const pads: Array<{ x: number; y: number }> = [];

  let curX = 0;
  let curY = 0;
  const lines = gerberText.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    const m = line.match(/^(?:X(-?\d+))?(?:Y(-?\d+))?D0([123])\*?$/);
    if (!m) continue;
    // Assume FSLAX46Y46 -> 1 unit = 1 nm -> scale 1e-6 to mm
    const nextX = m[1] ? Number(m[1]) / 1_000_000 : curX;
    const nextY = m[2] ? Number(m[2]) / 1_000_000 : curY;
    const dCode = m[3];
    if (dCode === '1') {
      segs.push({ x1: curX, y1: curY, x2: nextX, y2: nextY });
    } else if (dCode === '3') {
      pads.push({ x: nextX, y: nextY });
    }
    curX = nextX;
    curY = nextY;
  }

  const lineSvg = segs
    .map(
      (s) =>
        `<line x1="${(s.x1 * 10).toFixed(1)}" y1="${(s.y1 * 10).toFixed(1)}" x2="${(s.x2 * 10).toFixed(1)}" y2="${(s.y2 * 10).toFixed(1)}" stroke="#E05D44" stroke-width="4" stroke-linecap="round" />`
    )
    .join('');
  const padSvg = pads
    .map(
      (p) =>
        `<circle cx="${(p.x * 10).toFixed(1)}" cy="${(p.y * 10).toFixed(1)}" r="6" fill="#F59E0B" />`
    )
    .join('');

  return `<svg viewBox="0 0 420 260" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Tracespace RS-274X ${layerLabel} Preview"><rect width="420" height="260" fill="#0B0E14" />${lineSvg}${padSvg}<text x="12" y="22" fill="#E6EDF7" font-size="12" font-family="monospace">Tracespace MIT Preview (${layerLabel}): ${segs.length} traces, ${pads.length} flashes</text></svg>`;
}
