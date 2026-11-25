import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal, type ILink } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { globalCrossProbeBus } from '@vajradhir/crossprobe-bus';
import { ConPtyStreamCoordinator, extractTerminalLinks } from '@vajradhir/ide-core';
import { globalIdeWorkspaceStore } from '../ideFileStore';
import { globalKiCadSyncStore } from '../kicadSyncClient';

export const TerminalPanel: React.FC = () => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const coordRef = useRef<ConPtyStreamCoordinator>(new ConPtyStreamCoordinator());
  const startedRef = useRef(false);

  const [ptyState, setPtyState] = useState<'connecting' | 'connected' | 'offline'>('connecting');
  const [rendererKind, setRendererKind] = useState<'DOM' | 'WebGL'>('DOM');
  const [cwdNote, setCwdNote] = useState('');

  const connectPty = useCallback(async () => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;

    wsRef.current?.close();
    coordRef.current.attachSender(null);
    setPtyState('connecting');

    try {
      const sesRes = await fetch('/api/v1/pty/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (!sesRes.ok) throw new Error(`HTTP ${sesRes.status}`);
      const ses = await sesRes.json();
      const token = String(ses.token ?? '');
      setCwdNote(String(ses.cwd ?? ''));
      if (!token) throw new Error('Empty PTY token');

      fit.fit();
      const cols = Math.max(term.cols || 80, 40);
      const rows = Math.max(term.rows || 24, 10);
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws/pty?token=${encodeURIComponent(token)}&cols=${cols}&rows=${rows}`);
      wsRef.current = ws;

      coordRef.current.attachSender((payload) => {
        if (ws.readyState !== WebSocket.OPEN) return false;
        ws.send(payload);
        return true;
      });

      ws.onopen = () => {
        setPtyState('connected');
      };
      ws.onmessage = (ev) => {
        coordRef.current.markOutputReceived();
        term.write(String(ev.data));
      };
      ws.onclose = () => {
        coordRef.current.attachSender(null);
        setPtyState('offline');
      };
    } catch {
      coordRef.current.attachSender(null);
      setPtyState('offline');
      term.writeln('\x1b[33m[pty] Local ConPTY session unavailable (daemon offline)\x1b[0m');
    }
  }, []);

  useEffect(() => {
    const container = hostRef.current;
    if (!container) return;

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 12,
      fontFamily: 'JetBrains Mono, Consolas, monospace',
      theme: {
        background: '#0B0E14',
        foreground: '#E6EDF7',
        cursor: '#38BDF8',
        selectionBackground: '#1E3A5F',
        red: '#EF4444',
        green: '#34D399',
        yellow: '#FBBF24',
        blue: '#60A5FA',
        magenta: '#8B5CF6',
        cyan: '#38BDF8',
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    try {
      fit.fit();
    } catch {
      /* hidden dock tab initially 0x0 */
    }

    // Deep xterm.js integration: clickable file:line errors & hardware refdes in terminal output
    const linkDisposable = term.registerLinkProvider({
      provideLinks(lineNumber, callback) {
        const line = term.buffer.active.getLine(lineNumber - 1);
        if (!line) {
          callback(undefined);
          return;
        }
        const text = line.translateToString(true);
        const matches = extractTerminalLinks(text);
        if (!matches.length) {
          callback(undefined);
          return;
        }
        const links: ILink[] = matches.map((m) => ({
          text: m.text,
          range: {
            start: { x: m.startIndex + 1, y: lineNumber },
            end: { x: m.startIndex + m.length + 1, y: lineNumber },
          },
          activate() {
            if (m.kind === 'file' && m.path) {
              void globalIdeWorkspaceStore.openFileAtLine(m.path, m.line ?? 1);
            } else if (m.kind === 'refdes' && m.refdes) {
              globalCrossProbeBus.select([m.refdes], 'code');
            }
          },
        }));
        callback(links);
      },
    });

    termRef.current = term;
    fitRef.current = fit;

    // Respect WebGL context budget: count existing <canvas> elements; fall back to DOM if > 2 active
    let webglAddon: { dispose: () => void } | null = null;
    const canvasCount = document.querySelectorAll('canvas').length;
    if (canvasCount <= 2) {
      void import('@xterm/addon-webgl')
        .then(({ WebglAddon }) => {
          if (!termRef.current) return;
          const addon = new WebglAddon();
          addon.onContextLoss(() => {
            addon.dispose();
            setRendererKind('DOM');
          });
          term.loadAddon(addon);
          webglAddon = addon;
          setRendererKind('WebGL');
        })
        .catch(() => setRendererKind('DOM'));
    } else {
      setRendererKind('DOM');
    }

    const dataSub = term.onData((chunk) => {
      coordRef.current.sendRaw(chunk);
      if (chunk.includes('\r')) {
        window.setTimeout(() => {
          void globalIdeWorkspaceStore.refreshTree();
          void globalKiCadSyncStore.pollEvents();
        }, 650);
      }
    });

    const maybeStartVisiblePty = () => {
      if (startedRef.current) return;
      if (container.clientWidth > 20 && container.clientHeight > 20) {
        startedRef.current = true;
        void connectPty();
      }
    };

    const resizeObserver = new ResizeObserver(() => {
      try {
        maybeStartVisiblePty();
        if (container.clientWidth > 20 && container.clientHeight > 20) {
          fit.fit();
          coordRef.current.sendResize(term.cols, term.rows);
        }
      } catch {
        /* ignore before layout */
      }
    });
    resizeObserver.observe(container);
    maybeStartVisiblePty();

    return () => {
      startedRef.current = false;
      linkDisposable.dispose();
      dataSub.dispose();
      resizeObserver.disconnect();
      coordRef.current.attachSender(null);
      wsRef.current?.close();
      wsRef.current = null;
      webglAddon?.dispose();
      term.dispose();
      termRef.current = null;
    };
  }, [connectPty]);

  const sendCommand = (cmd: string) => {
    coordRef.current.sendCommand(cmd);
    window.setTimeout(() => {
      void globalIdeWorkspaceStore.refreshTree();
      void globalKiCadSyncStore.pollEvents();
    }, 650);
  };

  return (
    <div
      data-testid="terminal-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 200,
        backgroundColor: '#0B0E14',
        border: '1px solid var(--vd-border-subtle)',
        borderRadius: 6,
        overflow: 'hidden',
      }}
    >
      <div
        className="vd-metric"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 6,
          padding: '4px 8px',
          backgroundColor: 'var(--vd-bg-panel)',
          borderBottom: '1px solid var(--vd-border-subtle)',
          fontSize: 11,
        }}
      >
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <strong>PTY Terminal</strong>
          <span
            data-testid="pty-connection-badge"
            style={{ color: ptyState === 'connected' ? 'var(--vd-pass)' : 'var(--vd-warn)' }}
          >
            {ptyState}
          </span>
          <span style={{ color: 'var(--vd-text-secondary)' }}>Renderer: {rendererKind}</span>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            className="vd-btn"
            style={{ minHeight: 20, padding: '1px 7px', fontSize: 10 }}
            onClick={() => sendCommand('echo VD_TERMINAL_OK')}
          >
            Ping Shell
          </button>
          <button
            type="button"
            className="vd-btn"
            style={{ minHeight: 20, padding: '1px 7px', fontSize: 10 }}
            onClick={() => termRef.current?.clear()}
          >
            Clear
          </button>
          <button
            type="button"
            className="vd-btn"
            style={{ minHeight: 20, padding: '1px 7px', fontSize: 10 }}
            onClick={() => void connectPty()}
          >
            Reconnect
          </button>
        </div>
      </div>

      <div ref={hostRef} data-testid="xterm-container" style={{ flex: 1, minHeight: 160, padding: 4 }} />

      {cwdNote && (
        <div
          className="vd-metric"
          style={{
            padding: '2px 8px',
            fontSize: 10,
            color: 'var(--vd-text-secondary)',
            backgroundColor: 'var(--vd-bg-panel)',
            borderTop: '1px solid var(--vd-border-subtle)',
          }}
        >
          cwd: {cwdNote}
        </div>
      )}
    </div>
  );
};
