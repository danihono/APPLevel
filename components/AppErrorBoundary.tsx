import React from 'react';
import { logout } from '../services/firebase/auth';
import { t } from '../i18n';

interface AppErrorBoundaryState {
  error: Error | null;
}

/**
 * Rede de seguranca do app inteiro: se alguma tela quebrar ao desenhar, mostra o que aconteceu
 * em vez de deixar a tela branca (o React desmonta tudo quando um erro de render nao e tratado).
 * A mensagem tecnica fica visivel e pequena para quem testa poder mandar um print.
 */
class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidMount() {
    // Avisa o index.html que o app abriu: o aviso de erro de abertura nao vale mais.
    (window as Window & { __lvAppMounted?: boolean }).__lvAppMounted = true;
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[AppErrorBoundary]', error, info.componentStack);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleLogout = async () => {
    try {
      await logout();
    } catch {
      // Sem sessao ou sem rede: recarrega do mesmo jeito.
    }
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    // A primeira linha do stack repete a mensagem em alguns navegadores: mostra so os locais.
    const stackLine = (error.stack ?? '')
      .split('\n')
      .filter((line) => line.trim() && !line.includes(error.message))
      .slice(0, 3)
      .join('\n');

    return (
      <div
        role="alert"
        style={{
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 'calc(env(safe-area-inset-top, 0px) + 24px) 20px calc(env(safe-area-inset-bottom, 0px) + 24px)',
          background: '#0a0a0c',
          color: '#f7f4ee',
          fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, Roboto, sans-serif',
        }}
      >
        <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <span
            aria-hidden="true"
            style={{ width: 52, height: 52, borderRadius: 17, background: '#f0b429', color: '#1a1300', display: 'grid', placeItems: 'center', fontSize: 28, fontWeight: 800 }}
          >
            !
          </span>
          <h1 style={{ margin: 0, color: '#f7f4ee', fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
            {t('Algo deu errado nesta tela.')}
          </h1>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: 'rgba(247,244,238,0.72)' }}>
            {t('Seus dados estão seguros. Tente de novo; se continuar, mande um print desta tela para a equipe.')}
          </p>
          <pre
            style={{
              margin: 0,
              padding: 12,
              borderRadius: 14,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              fontSize: 11.5,
              lineHeight: 1.45,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: 'rgba(247,244,238,0.8)',
              maxHeight: 180,
              overflow: 'auto',
            }}
          >
            {`${error.name}: ${error.message}\n${stackLine}`}
          </pre>
          <button
            type="button"
            onClick={this.handleReload}
            style={{ minHeight: 50, border: 0, borderRadius: 999, background: '#f0b429', color: '#1a1300', fontSize: 16, fontWeight: 700 }}
          >
            {t('Tentar de novo')}
          </button>
          <button
            type="button"
            onClick={() => void this.handleLogout()}
            style={{ minHeight: 46, border: '1px solid rgba(255,255,255,0.18)', borderRadius: 999, background: 'transparent', color: '#f7f4ee', fontSize: 15, fontWeight: 600 }}
          >
            {t('Sair da conta')}
          </button>
        </div>
      </div>
    );
  }
}

export default AppErrorBoundary;
