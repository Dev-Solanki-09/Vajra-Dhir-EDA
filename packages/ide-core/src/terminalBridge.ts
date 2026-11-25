export interface TerminalLinkMatch {
  startIndex: number;
  length: number;
  text: string;
  kind: 'file' | 'refdes';
  path?: string;
  line?: number;
  column?: number;
  refdes?: string;
}

/**
 * ConPTY write/resize scheduler modeled directly on microsoft/node-pty WindowsTerminal
 * (_isReady + _deferreds queue flushed on first terminal data output so cmd/ConPTY
 * startup does not drop early commands or control frames).
 */
export class ConPtyStreamCoordinator {
  private ready = false;
  private deferred: Array<() => void> = [];
  private sender: ((payload: string) => boolean) | null = null;

  attachSender(fn: ((payload: string) => boolean) | null): void {
    this.sender = fn;
    if (!fn) {
      this.ready = false;
      this.deferred = [];
    }
  }

  markOutputReceived(): void {
    if (this.ready) return;
    this.ready = true;
    const pending = this.deferred.splice(0, this.deferred.length);
    for (const op of pending) {
      op();
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  sendRaw(payload: string): void {
    if (!payload) return;
    const exec = () => {
      this.sender?.(payload);
    };
    if (this.ready && this.sender) {
      exec();
    } else {
      this.deferred.push(exec);
    }
  }

  sendCommand(cmd: string): void {
    const trimmed = cmd.replace(/[\r\n]+$/g, '');
    if (!trimmed) return;
    this.sendRaw(trimmed + '\r');
  }

  sendResize(cols: number, rows: number): void {
    const msg = JSON.stringify({
      type: 'resize',
      cols: Math.max(20, Math.min(400, Math.round(cols))),
      rows: Math.max(4, Math.min(200, Math.round(rows))),
    });
    this.sendRaw(msg);
  }
}

const FILE_LOC_RE = /([A-Za-z0-9_./\\-]+\.(?:ato|kicad_pcb|kicad_sch|c|h|rs|py|sv|cir|ya?ml)):(\d+)(?::(\d+))?/g;
const REFDES_RE = /\b([UJCRLDQ]\d+)\b/g;

export function extractTerminalLinks(lineText: string): TerminalLinkMatch[] {
  const matches: TerminalLinkMatch[] = [];
  const occupied: Array<[number, number]> = [];

  FILE_LOC_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FILE_LOC_RE.exec(lineText)) !== null) {
    const startIndex = m.index;
    const length = m[0].length;
    occupied.push([startIndex, startIndex + length]);
    matches.push({
      startIndex,
      length,
      text: m[0],
      kind: 'file',
      path: m[1].replace(/\\/g, '/'),
      line: Number(m[2]),
      column: m[3] ? Number(m[3]) : 1,
    });
  }

  REFDES_RE.lastIndex = 0;
  while ((m = REFDES_RE.exec(lineText)) !== null) {
    const s = m.index;
    const e = s + m[0].length;
    const overlaps = occupied.some(([a, b]) => s < b && e > a);
    if (overlaps) continue;
    matches.push({
      startIndex: s,
      length: m[0].length,
      text: m[0],
      kind: 'refdes',
      refdes: m[1],
    });
  }

  return matches.sort((a, b) => a.startIndex - b.startIndex);
}
