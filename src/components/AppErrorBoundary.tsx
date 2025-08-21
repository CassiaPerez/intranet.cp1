import React from 'react';

type State = { hasError: boolean; error?: any };

export default class AppErrorBoundary extends React.Component<React.PropsWithChildren, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, info: any) {
    console.error('AppErrorBoundary', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24 }}>
          <h1 style={{ fontSize: 20, marginBottom: 8 }}>Ops! Algo quebrou nesta tela.</h1>
          <pre style={{ whiteSpace: 'pre-wrap' }}>
            {String(this.state.error?.message || this.state.error || 'Erro desconhecido')}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}
