import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';

interface LoginViewProps {
  onLogin: (email: string, password: string) => Promise<void>;
}

const LoginView: React.FC<LoginViewProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      await onLogin(email, password);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Nao foi possivel entrar agora.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-auth-shell">
      <div className="app-auth-grid">
        <section className="app-panel app-auth-card">
          <div className="app-brand">
            <div className="app-brand__mark">LVL</div>
            <div className="app-brand__text">
              <p className="app-kicker">Applevel</p>
              <h1 className="app-headline">Entre para abrir o painel da academia.</h1>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <div className="app-icon-shell">
              <KeyRound size={18} />
            </div>
            <div>
              <p className="app-section-label">Entrar</p>
              <h2 className="text-3xl font-bold">Acesse o APPLevel</h2>
            </div>
          </div>

          <p className="app-note mt-4">
            Use a mesma conta cadastrada no Firebase Authentication para abrir a experiencia completa.
          </p>

          <form className="mt-6 app-form-grid" onSubmit={handleSubmit}>
            {error ? (
              <div className="app-alert app-alert--error">{error}</div>
            ) : null}

            <label className="app-field">
              <span className="app-field__label">E-mail</span>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="app-input"
                placeholder="voce@academia.com"
                required
              />
            </label>

            <label className="app-field">
              <span className="app-field__label">Senha</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="app-input"
                placeholder="Sua senha"
                required
              />
            </label>

            <button type="submit" disabled={isLoading} className="app-button app-button--gold app-button--block">
              {isLoading ? 'Entrando...' : 'Abrir painel'}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
};

export default LoginView;
