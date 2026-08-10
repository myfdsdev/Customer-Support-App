import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Last line of defence. A render crash inside the inbox should not leave an
 * agent staring at a blank page mid-conversation.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Render error:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50 p-6">
        <div className="w-full max-w-md rounded-xl border border-ink-200 bg-white p-6 text-center shadow-card">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-amber-500" />
          <h1 className="text-lg font-semibold text-ink-900">Something broke on this screen</h1>
          <p className="mt-1 text-sm text-ink-500">
            The rest of the app is still running. Reloading usually clears it.
          </p>
          <pre className="mt-3 max-h-32 overflow-auto rounded-lg bg-ink-50 p-3 text-left text-[11px] text-ink-600">
            {String(error?.message || error)}
          </pre>
          <div className="mt-4 flex justify-center gap-2">
            <button onClick={() => window.location.reload()} className="btn-primary">
              Reload
            </button>
            <button onClick={() => this.setState({ error: null })} className="btn-secondary">
              Try again
            </button>
          </div>
        </div>
      </div>
    );
  }
}
