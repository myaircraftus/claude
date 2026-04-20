import React from "react";

interface Props { children: React.ReactNode; }
interface State { error: Error | null; }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary caught]", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#0A1628] p-8">
          <div className="max-w-lg w-full">
            <div className="w-12 h-12 rounded-2xl bg-red-500/20 flex items-center justify-center mb-4">
              <span className="text-red-400 text-2xl">⚠</span>
            </div>
            <h1 className="text-white text-xl mb-2" style={{ fontWeight: 700 }}>
              Something went wrong
            </h1>
            <p className="text-white/50 text-sm mb-4">
              {this.state.error.message}
            </p>
            <pre className="text-red-400/70 text-xs bg-white/5 rounded-xl p-4 overflow-auto max-h-48 whitespace-pre-wrap">
              {this.state.error.stack}
            </pre>
            <button
              onClick={() => this.setState({ error: null })}
              className="mt-4 px-4 py-2 bg-[#2563EB] text-white rounded-lg text-sm"
              style={{ fontWeight: 600 }}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
