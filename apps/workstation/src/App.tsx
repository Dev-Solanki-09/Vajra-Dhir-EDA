import React from 'react';
import { WorkstationShell } from './components/WorkstationShell';

interface RootErrorState {
  error: Error | null;
}

class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, RootErrorState> {
  state: RootErrorState = { error: null };

  static getDerivedStateFromError(error: Error): RootErrorState {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            minHeight: '100vh',
            backgroundColor: 'var(--vd-bg-app, #141416)',
            color: 'var(--vd-text-primary, #D8D8DE)',
            display: 'grid',
            placeItems: 'center',
            padding: 24,
          }}
        >
          <div style={{ maxWidth: 540, backgroundColor: '#1C1C1F', border: '1px solid #3E3E48', padding: 18, borderRadius: 3 }}>
            <strong style={{ fontSize: 13, color: '#D4565B' }}>Workstation Layout Recovery</strong>
            <p style={{ fontSize: 11.5, color: '#8E8E98' }}>{this.state.error.message}</p>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button
                type="button"
                className="vd-btn vd-btn-primary"
                onClick={() => {
                  try {
                    window.localStorage.removeItem('vd.layout.v6');
                  } catch {
                    /* ignore */
                  }
                  window.location.reload();
                }}
              >
                Reset Layout Cache
              </button>
              <button type="button" className="vd-btn" onClick={() => this.setState({ error: null })}>
                Return Home
              </button>
              <button
                type="button"
                className="vd-btn"
                onClick={() => void navigator.clipboard?.writeText(this.state.error?.stack || this.state.error?.message || '').catch(() => {})}
              >
                Copy Diagnostic Log
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function App() {
  return (
    <RootErrorBoundary>
      <WorkstationShell />
    </RootErrorBoundary>
  );
}

export default App;
