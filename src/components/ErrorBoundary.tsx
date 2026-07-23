import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallbackLabel?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught UI error:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#070b12] text-gray-100 p-6">
          <div className="surface-panel max-w-md p-8 text-center flex flex-col items-center rounded-3xl border border-white/10 bg-slate-950 shadow-2xl">
            <div className="h-12 w-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-4">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">
              {this.props.fallbackLabel || 'Something went wrong'}
            </h2>
            <p className="text-xs text-gray-400 mb-6 leading-relaxed">
              {this.state.error?.message || 'An unexpected error occurred while loading this view.'}
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold"
            >
              <RefreshCw className="h-4 w-4" />
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
