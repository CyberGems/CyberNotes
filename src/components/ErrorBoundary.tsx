import { Component, type ReactNode } from 'react';

const STRINGS = {
  es: {
    title: 'Algo salió mal',
    message: 'La aplicación encontró un error inesperado y no pudo continuar.',
    retry: 'Recargar la aplicación',
  },
  en: {
    title: 'Something went wrong',
    message: 'The application hit an unexpected error and could not continue.',
    retry: 'Reload the application',
  },
} as const;

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

/** Red de seguridad: un error de render no debe dejar la ventana en negro. */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    console.error('[CyberNotes] Uncaught render error:', error);
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children;
    const lang = typeof navigator !== 'undefined' && navigator.language?.startsWith('es') ? 'es' : 'en';
    const t = STRINGS[lang];
    return (
      <div
        role="alert"
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: 32,
          textAlign: 'center',
          background: 'var(--bg-app, #08090e)',
          color: 'var(--text-primary, #f8fafc)',
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700 }}>{t.title}</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary, #a0a6b8)', maxWidth: 420 }}>{t.message}</div>
        <button
          type="button"
          onClick={this.handleReload}
          style={{
            marginTop: 8,
            padding: '8px 20px',
            borderRadius: 8,
            border: '1px solid var(--accent, #6366f1)',
            background: 'var(--accent-dim, rgba(99,102,241,0.15))',
            color: 'var(--accent-light, #a5b4fc)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {t.retry}
        </button>
      </div>
    );
  }
}
