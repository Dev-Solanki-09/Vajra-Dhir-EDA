/**
 * Pure-MIT IEEE-1364 VCD (Value Change Dump) Parser & Min-Max Decimator.
 * Replaces EUPL-1.2 `surfer` so Ring 1 remains 100% MIT / Apache-2.0.
 */

export interface VcdSignalSeries {
  symbol: string;
  name: string;
  width: number;
  timesNs: number[];
  values: number[];
  rawStates: string[];
}

export interface ParsedVcdDocument {
  timescaleNs: number;
  endTimeNs: number;
  signals: VcdSignalSeries[];
}

function parseTimescaleNs(token: string): number {
  const m = token.trim().match(/^(\d+)\s*(s|ms|us|ns|ps|fs)$/i);
  if (!m) return 1;
  const n = Number(m[1]);
  switch (m[2].toLowerCase()) {
    case 's': return n * 1e9;
    case 'ms': return n * 1e6;
    case 'us': return n * 1e3;
    case 'ns': return n;
    case 'ps': return n * 1e-3;
    case 'fs': return n * 1e-6;
    default: return 1;
  }
}

export function parseVcd(vcdText: string): ParsedVcdDocument {
  const tokens = vcdText.trim().split(/\s+/);
  let timescaleNs = 1;
  const sigBySym = new Map<string, VcdSignalSeries>();
  const signals: VcdSignalSeries[] = [];

  let i = 0;
  let inDefs = true;
  while (i < tokens.length && inDefs) {
    const tok = tokens[i];
    if (tok === '$timescale') {
      const parts: string[] = [];
      i += 1;
      while (i < tokens.length && tokens[i] !== '$end') {
        parts.push(tokens[i]);
        i += 1;
      }
      timescaleNs = parseTimescaleNs(parts.join(''));
    } else if (tok === '$var') {
      const width = Number(tokens[i + 2] ?? '1');
      const symbol = tokens[i + 3] ?? '';
      const name = tokens[i + 4] ?? symbol;
      if (symbol && !sigBySym.has(symbol)) {
        const entry: VcdSignalSeries = {
          symbol,
          name,
          width: Number.isFinite(width) && width > 0 ? width : 1,
          timesNs: [],
          values: [],
          rawStates: [],
        };
        sigBySym.set(symbol, entry);
        signals.push(entry);
      }
      while (i < tokens.length && tokens[i] !== '$end') i += 1;
    } else if (tok === '$enddefinitions') {
      while (i < tokens.length && tokens[i] !== '$end') i += 1;
      inDefs = false;
    }
    i += 1;
  }

  let currentNs = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (!tok) {
      i += 1;
      continue;
    }
    if (tok === '$dumpvars' || tok === '$dumpon' || tok === '$dumpoff' || tok === '$end') {
      i += 1;
      continue;
    }
    if (tok.startsWith('#')) {
      const rawT = Number(tok.slice(1));
      if (Number.isFinite(rawT)) {
        currentNs = rawT * timescaleNs;
      }
      i += 1;
      continue;
    }
    if ((tok.startsWith('b') || tok.startsWith('B')) && i + 1 < tokens.length) {
      const bits = tok.slice(1).toLowerCase();
      const sym = tokens[i + 1];
      const sig = sigBySym.get(sym);
      if (sig) {
        const numeric = /^[01]+$/.test(bits) ? Number.parseInt(bits, 2) : -1;
        sig.timesNs.push(currentNs);
        sig.values.push(numeric);
        sig.rawStates.push(bits);
      }
      i += 2;
      continue;
    }
    const ch = tok[0]?.toLowerCase();
    if (ch === '0' || ch === '1' || ch === 'x' || ch === 'z') {
      const sym = tok.slice(1);
      const sig = sigBySym.get(sym);
      if (sig) {
        const numeric = ch === '1' ? 1 : ch === '0' ? 0 : -1;
        sig.timesNs.push(currentNs);
        sig.values.push(numeric);
        sig.rawStates.push(ch);
      }
    }
    i += 1;
  }

  return { timescaleNs, endTimeNs: currentNs, signals };
}

/**
 * Min-Max envelope decimation over up to 166k+ waveform samples into bounded pixel buckets
 * so uPlot renders in <25 ms on low-spec hardware without losing peaks.
 */
export function downsampleMinMax(
  xs: Float64Array,
  ys: Float64Array,
  maxBuckets = 1600,
): { x: number[]; y: number[] } {
  const len = Math.min(xs.length, ys.length);
  if (len <= maxBuckets * 2) {
    return { x: Array.from(xs.subarray(0, len)), y: Array.from(ys.subarray(0, len)) };
  }
  const bucketSize = Math.ceil(len / maxBuckets);
  const outX: number[] = [];
  const outY: number[] = [];

  for (let start = 0; start < len; start += bucketSize) {
    const end = Math.min(len, start + bucketSize);
    let minVal = ys[start];
    let maxVal = ys[start];
    let minIdx = start;
    let maxIdx = start;
    for (let j = start + 1; j < end; j += 1) {
      const v = ys[j];
      if (v < minVal) { minVal = v; minIdx = j; }
      if (v > maxVal) { maxVal = v; maxIdx = j; }
    }
    if (minIdx <= maxIdx) {
      outX.push(xs[minIdx]); outY.push(minVal);
      if (maxIdx !== minIdx) { outX.push(xs[maxIdx]); outY.push(maxVal); }
    } else {
      outX.push(xs[maxIdx]); outY.push(maxVal);
      outX.push(xs[minIdx]); outY.push(minVal);
    }
  }
  return { x: outX, y: outY };
}
