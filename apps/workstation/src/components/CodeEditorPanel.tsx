import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import * as monaco from 'monaco-editor/editor/editor.api.js';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import { globalCrossProbeBus } from '@vajradhir/crossprobe-bus';
import {
  ATO_KEYWORDS,
  ATO_MONARCH_LANGUAGE,
  EXTRA_HW_LANGUAGES,
  KICAD_SEXPR_MONARCH_LANGUAGE,
  SPICE_MONARCH_LANGUAGE,
  buildHardwareSymbolTable,
  extractSymbolAtLineColumn,
  findFirstSymbolInText,
  formatComponentHoverMarkdown,
  mapFindingsToIdeMarkers,
  type HwBoardComponent,
} from '@vajradhir/ide-core';
import { globalIdeWorkspaceStore, useIdeWorkspace } from '../ideFileStore';
import { globalKiCadSyncStore, useKiCadSync } from '../kicadSyncClient';

let monacoBootstrapped = false;

function getLiveSymbolTable() {
  const ideSnap = globalIdeWorkspaceStore.getSnapshot();
  const syncSnap = globalKiCadSyncStore.getSnapshot();
  const components: HwBoardComponent[] = [];
  const pcbText = syncSnap.pcbText || '';
  const fpMatches = pcbText.matchAll(/\(footprint\s+"([^"]+)"[\s\S]*?\(at\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)(?:\s+(-?\d+(?:\.\d+)?))?\)[\s\S]*?\(property\s+"Reference"\s+"([^"]+)"/g);
  for (const m of fpMatches) {
    components.push({
      refdes: m[5],
      footprint: m[1],
      xNm: Math.round(Number(m[2]) * 1_000_000),
      yNm: Math.round(Number(m[3]) * 1_000_000),
      rotMdeg: Math.round(Number(m[4] || '0') * 1000),
      locked: false,
    });
  }
  const extraNets: string[] = [];
  const netMatches = pcbText.matchAll(/\(net\s+\d+\s+"([^"]+)"\)/g);
  for (const nm of netMatches) {
    if (nm[1]) extraNets.push(nm[1]);
  }
  return buildHardwareSymbolTable(
    ideSnap.tabs.map((t) => ({ path: t.path, content: t.content })),
    components,
    extraNets
  );
}

function bootstrapMonacoOffline() {
  if (monacoBootstrapped) return;
  monacoBootstrapped = true;

  (self as unknown as { MonacoEnvironment?: { getWorker: () => Worker } }).MonacoEnvironment = {
    getWorker() {
      return new EditorWorker();
    },
  };

  monaco.languages.register({ id: 'ato' });
  monaco.languages.setMonarchTokensProvider('ato', ATO_MONARCH_LANGUAGE);

  monaco.languages.register({ id: 'kicad_sexpr' });
  monaco.languages.setMonarchTokensProvider('kicad_sexpr', KICAD_SEXPR_MONARCH_LANGUAGE);

  monaco.languages.register({ id: 'spice' });
  monaco.languages.setMonarchTokensProvider('spice', SPICE_MONARCH_LANGUAGE);

  for (const [langId, spec] of Object.entries(EXTRA_HW_LANGUAGES)) {
    monaco.languages.register({ id: langId });
    monaco.languages.setMonarchTokensProvider(langId, spec);
  }

  monaco.languages.register({ id: 'systemverilog' });
  monaco.languages.setMonarchTokensProvider('systemverilog', {
    tokenizer: {
      root: [
        [/\/\/.*$/, 'comment'],
        [/\b(module|endmodule|input|output|inout|logic|wire|reg|always_ff|always_comb|assign|begin|end|if|else)\b/, 'keyword'],
      ],
    },
  });

  const hwLangs = ['ato', 'c', 'yaml', 'kicad_sexpr', 'spice'];
  for (const langId of hwLangs) {
    monaco.languages.registerHoverProvider(langId, {
      provideHover(model, position) {
        const lineText = model.getLineContent(position.lineNumber);
        const token = extractSymbolAtLineColumn(lineText, position.column);
        if (!token) return null;
        const table = getLiveSymbolTable();
        const comp = table.componentsByRefdes[token];
        if (comp) {
          return {
            contents: [{ value: formatComponentHoverMarkdown(comp) }],
          };
        }
        if (table.netNames.includes(token)) {
          return {
            contents: [{ value: `**Net \`${token}\`**\n\nIndexed in Design Graph & CrossProbeBus` }],
          };
        }
        return null;
      },
    });

    monaco.languages.registerCompletionItemProvider(langId, {
      provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position);
        const range: monaco.IRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };
        const table = getLiveSymbolTable();
        const suggestions: monaco.languages.CompletionItem[] = [];
        for (const kw of ATO_KEYWORDS) {
          suggestions.push({
            label: kw,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: kw,
            range,
          });
        }
        for (const comp of Object.values(table.componentsByRefdes)) {
          suggestions.push({
            label: comp.refdes,
            kind: monaco.languages.CompletionItemKind.Struct,
            detail: comp.mpn || comp.value || comp.footprint || 'Design component',
            insertText: comp.refdes,
            range,
          });
        }
        for (const net of table.netNames) {
          suggestions.push({
            label: net,
            kind: monaco.languages.CompletionItemKind.Constant,
            detail: 'Design net',
            insertText: net,
            range,
          });
        }
        return { suggestions };
      },
    });

    monaco.languages.registerDefinitionProvider(langId, {
      provideDefinition(model, position) {
        const lineText = model.getLineContent(position.lineNumber);
        const token = extractSymbolAtLineColumn(lineText, position.column);
        if (!token) return null;
        globalCrossProbeBus.select([token], 'code');
        const loc = findFirstSymbolInText(model.getValue(), token);
        if (!loc) return null;
        return {
          uri: model.uri,
          range: new monaco.Range(loc.line, loc.startCol, loc.line, loc.endCol),
        };
      },
    });
  }

  monaco.editor.defineTheme('silicon-darkroom', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: '38BDF8', fontStyle: 'bold' },
      { token: 'type.identifier', foreground: 'FBBF24', fontStyle: 'bold' },
      { token: 'string', foreground: '34D399' },
      { token: 'number', foreground: 'E05D44' },
      { token: 'comment', foreground: '64748B', fontStyle: 'italic' },
    ],
    colors: {
      'editor.background': '#0B0E14',
      'editor.foreground': '#E6EDF7',
      'editorLineNumber.foreground': '#475569',
      'editorLineNumber.activeForeground': '#38BDF8',
      'editor.lineHighlightBackground': '#151A24',
      'editor.selectionBackground': '#1E3A5F',
      'editorCursor.foreground': '#38BDF8',
    },
  });
}

export const CodeEditorPanel: React.FC = () => {
  const ide = useIdeWorkspace();
  const sync = useKiCadSync();
  const probe = useSyncExternalStore(
    globalCrossProbeBus.subscribeSnapshot,
    globalCrossProbeBus.getSnapshot
  );

  const hostRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const suppressCursorProbeRef = useRef(false);
  const activePathRef = useRef(ide.activePath);
  activePathRef.current = ide.activePath;

  const [cursorLine, setCursorLine] = useState(1);
  const [jumpInfo, setJumpInfo] = useState('CrossProbe ready');

  const activeTab = ide.tabs.find((t) => t.path === ide.activePath) ?? ide.tabs[0] ?? null;

  const jumpToToken = (targetRef: string, sourceLabel: string) => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model || !targetRef) return;
    const loc = findFirstSymbolInText(model.getValue(), targetRef);
    if (loc) {
      suppressCursorProbeRef.current = true;
      editor.revealLineInCenter(loc.line);
      editor.setSelection(new monaco.Range(loc.line, loc.startCol, loc.line, loc.endCol));
      setCursorLine(loc.line);
      setJumpInfo(`Jumped to ${targetRef} at L${loc.line} (${sourceLabel})`);
      window.setTimeout(() => {
        suppressCursorProbeRef.current = false;
      }, 60);
    } else {
      setJumpInfo(`${targetRef} not in ${activePathRef.current}`);
    }
  };

  // Mount Monaco Editor once offline
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    bootstrapMonacoOffline();

    const editor = monaco.editor.create(el, {
      value: activeTab?.content ?? '',
      language: activeTab?.language ?? 'ato',
      theme: 'silicon-darkroom',
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 12,
      fontFamily: 'JetBrains Mono, Consolas, monospace',
      scrollBeyondLastLine: false,
    });
    editorRef.current = editor;

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      void globalIdeWorkspaceStore.saveActiveFile(activePathRef.current);
    });

    const changeSub = editor.onDidChangeModelContent(() => {
      const val = editor.getValue();
      globalIdeWorkspaceStore.updateTabContent(activePathRef.current, val);
    });

    const cursorSub = editor.onDidChangeCursorPosition((ev) => {
      setCursorLine(ev.position.lineNumber);
      if (suppressCursorProbeRef.current) return;
      const model = editor.getModel();
      if (!model) return;
      const lineText = model.getLineContent(ev.position.lineNumber);
      const token = extractSymbolAtLineColumn(lineText, ev.position.column);
      if (!token) return;
      if (/^[UJCRLDQ][0-9]+$/.test(token)) {
        globalCrossProbeBus.select([token], 'code');
        setJumpInfo(`Cursor -> ${token} (L${ev.position.lineNumber})`);
      } else {
        globalCrossProbeBus.highlightNet(token, 'code');
        setJumpInfo(`Cursor net -> ${token}`);
      }
    });

    // Respect current CrossProbeBus selection immediately upon panel mount
    const currentSelection = globalCrossProbeBus.getSnapshot().selection;
    if (currentSelection.source !== 'code' && currentSelection.entityIds.length > 0) {
      jumpToToken(currentSelection.entityIds[0], currentSelection.source);
    }

    return () => {
      changeSub.dispose();
      cursorSub.dispose();
      editor.dispose();
      editorRef.current = null;
    };
  }, []);

  // Sync open tab text & language cleanly with max-8 LRU Monaco model eviction
  const lruModelsRef = useRef<Map<string, monaco.editor.ITextModel>>(new Map());
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !activeTab) return;
    const map = lruModelsRef.current;
    let model = map.get(activeTab.path) ?? null;
    if (!model || model.isDisposed()) {
      model = monaco.editor.createModel(activeTab.content, activeTab.language);
      map.set(activeTab.path, model);
    } else {
      map.delete(activeTab.path);
      map.set(activeTab.path, model);
      if (model.getValue() !== activeTab.content && !activeTab.dirty) {
        model.setValue(activeTab.content);
      }
      monaco.editor.setModelLanguage(model, activeTab.language);
    }
    if (editor.getModel() !== model) {
      editor.setModel(model);
    }
    while (map.size > 8) {
      const oldestKey = map.keys().next().value;
      if (!oldestKey) break;
      const oldModel = map.get(oldestKey);
      map.delete(oldestKey);
      if (oldModel && !oldModel.isDisposed() && editor.getModel() !== oldModel) {
        oldModel.dispose();
      }
    }
  }, [activeTab?.path, activeTab?.savedContent]);

  // Honor file:line jumps triggered from TerminalPanel clickable error/component links
  useEffect(() => {
    const rev = ide.revealTarget;
    const editor = editorRef.current;
    if (!rev || !editor || rev.path !== activeTab?.path) return;
    suppressCursorProbeRef.current = true;
    editor.revealLineInCenter(rev.line);
    editor.setPosition({ lineNumber: rev.line, column: 1 });
    setCursorLine(rev.line);
    setJumpInfo(`Opened ${rev.path}:L${rev.line}`);
    window.setTimeout(() => {
      suppressCursorProbeRef.current = false;
    }, 60);
  }, [ide.revealTarget?.seq, activeTab?.path]);

  // Diagnostics Gutter Sync: KiCad 10 ERC/DRC + atopile compiler diagnostics -> Monaco markers via ide-core
  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!model) return;

    const kicadFindings = [...sync.ercFindings, ...sync.drcFindings].map((f) => ({
      ruleId: f.rule_id,
      severity: (f.severity === 'error' ? 'error' : f.severity === 'warning' ? 'warning' : 'info') as 'error' | 'warning' | 'info',
      message: f.message,
      refdes: f.entity_uuid || undefined,
      source: 'kicad10-diagnostics',
    }));

    const atoFindings = ide.atoDiagnostics
      .filter((d) => !d.file || d.file === activeTab?.path)
      .map((d) => ({
        ruleId: d.constraint_failure,
        severity: (d.severity === 'error' ? 'error' : 'warning') as 'error' | 'warning',
        message: d.message,
        refdes: d.refdes || undefined,
        line: d.line,
        col: d.col,
        source: 'atopile-compiler',
      }));

    const mapped = mapFindingsToIdeMarkers(model.getValue(), [...kicadFindings, ...atoFindings]);

    const markers: monaco.editor.IMarkerData[] = mapped.map((m) => ({
      severity:
        m.severity === 'error'
          ? monaco.MarkerSeverity.Error
          : m.severity === 'warning'
            ? monaco.MarkerSeverity.Warning
            : monaco.MarkerSeverity.Info,
      message: m.message,
      startLineNumber: m.startLineNumber,
      startColumn: m.startColumn,
      endLineNumber: m.endLineNumber,
      endColumn: m.endColumn,
      source: m.source,
      code: m.code,
    }));
    monaco.editor.setModelMarkers(model, 'kicad10-diagnostics', markers);
  }, [sync.ercFindings, sync.drcFindings, ide.atoDiagnostics, activeTab?.path, activeTab?.content]);

  // Incoming CrossProbeBus selection from 2D/3D/Explorer -> jump directly to component line
  useEffect(() => {
    return globalCrossProbeBus.onSelection((ev) => {
      if (ev.source === 'code' || !ev.entityIds.length) return;
      jumpToToken(ev.entityIds[0], ev.source);
    });
  }, []);

  return (
    <div
      data-testid="code-editor-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 320,
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
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 6,
          padding: '4px 8px',
          backgroundColor: 'var(--vd-bg-panel)',
          borderBottom: '1px solid var(--vd-border-subtle)',
          fontSize: 11,
        }}
      >
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', flex: 1 }}>
          {ide.tabs.map((t) => {
            const active = t.path === activeTab?.path;
            return (
              <div key={t.path} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                <button
                  type="button"
                  className={`vd-btn ${active ? 'vd-btn-primary' : ''}`}
                  style={{ minHeight: 22, padding: '2px 8px', fontSize: 11 }}
                  onClick={() => globalIdeWorkspaceStore.setActiveTab(t.path)}
                >
                  {t.path.split('/').pop()}{t.dirty ? ' •' : ''}
                </button>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span data-testid="monaco-jump-status" style={{ color: 'var(--vd-border-active)' }}>
            {jumpInfo}
          </span>
          <span
            data-testid="ato-compile-badge"
            style={{ color: ide.atoDiagnostics.length > 0 ? 'var(--vd-fail)' : 'var(--vd-pass)' }}
          >
            {ide.atoStatus}
          </span>
          {ide.atoLockConflicts.length > 0 && (
            <span data-testid="ato-lock-conflict-badge" style={{ color: 'var(--vd-warn)' }}>
              LOCK GUARD: {ide.atoLockConflicts.map((l) => l.refdes).join(', ')}
            </span>
          )}
          <button
            type="button"
            data-testid="monaco-ato-build-btn"
            className="vd-btn"
            style={{ minHeight: 22, padding: '2px 8px', fontSize: 11 }}
            onClick={() => void globalIdeWorkspaceStore.compileAto(true)}
          >
            Compile .ato
          </button>
          <button
            type="button"
            data-testid="monaco-save-btn"
            className="vd-btn vd-btn-primary"
            style={{ minHeight: 22, padding: '2px 8px', fontSize: 11 }}
            onClick={() => void globalIdeWorkspaceStore.saveActiveFile(activeTab?.path)}
          >
            Save {activeTab?.dirty ? '*' : ''}
          </button>
        </div>
      </div>

      <div ref={hostRef} data-testid="monaco-editor-host" style={{ flex: 1, minHeight: 240 }} />

      <div
        className="vd-metric"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '2px 8px',
          fontSize: 11,
          color: 'var(--vd-text-secondary)',
          backgroundColor: 'var(--vd-bg-panel)',
          borderTop: '1px solid var(--vd-border-subtle)',
        }}
      >
        <span>
          {activeTab?.path ?? 'No file'} ({activeTab?.language ?? 'plaintext'}) · Ln {cursorLine}
        </span>
        <span>
          Probe: {probe.selection.entityIds.join(', ') || 'none'} · {ide.statusNote}
        </span>
      </div>
    </div>
  );
};
