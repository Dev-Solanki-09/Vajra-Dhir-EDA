import React from 'react';

interface Props {
  panelTitle: string;
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class PanelErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  private handleCopyDiagnostics = () => {
    const payload = `[${this.props.panelTitle}] ${this.state.error?.stack || this.state.error?.message || 'Unknown panel error'}`;
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(payload);
    }
  };

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: 16,
            backgroundColor: 'var(--vd-bg-panel)',
            color: 'var(--vd-text-primary)',
            height: '100%',
          }}
        >
          <p style={{ margin: '0 0 8px', color: 'var(--vd-fail)', fontWeight: 600 }}>
            Panel fault: {this.props.panelTitle}
          </p>
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--vd-text-secondary)' }}>
            {this.state.error.message}
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="vd-btn vd-btn-primary"
              onClick={() => this.setState({ error: null })}
            >
              Reset panel
            </button>
            <button type="button" className="vd-btn" onClick={this.handleCopyDiagnostics}>
              Copy diagnostics
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
