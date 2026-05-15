import React, { useEffect, useState } from 'react';
import { ArrowRight, Eye, EyeOff, Lock } from 'lucide-react';
import { applyPasswordReset, verifyResetCode } from '../services/firebase/auth';

interface ResetPasswordViewProps {
  oobCode: string;
}

function getResetPasswordError(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';

  switch (code) {
    case 'auth/expired-action-code':
      return 'Este link de redefinição expirou. Solicite um novo link na tela de login.';
    case 'auth/invalid-action-code':
      return 'Este link de redefinição é inválido ou já foi usado. Solicite um novo link.';
    case 'auth/weak-password':
      return 'A senha deve ter no mínimo 6 caracteres.';
    case 'auth/network-request-failed':
      return 'Falha na conexão. Verifique sua internet e tente novamente.';
    default:
      return 'Não foi possível redefinir a senha. Tente novamente ou solicite um novo link.';
  }
}

function goToLogin() {
  window.location.replace(window.location.pathname);
}

const ResetPasswordView: React.FC<ResetPasswordViewProps> = ({ oobCode }) => {
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;

    verifyResetCode(oobCode)
      .then((resolvedEmail) => {
        if (!cancelled) {
          setEmail(resolvedEmail);
          setVerifying(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Este link de redefinição é inválido ou expirou. Solicite um novo link na tela de login.');
          setVerifying(false);
        }
      });

    return () => { cancelled = true; };
  }, [oobCode]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('A senha deve ter no mínimo 6 caracteres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);

    try {
      await applyPasswordReset(oobCode, newPassword);
      setSuccess(true);
    } catch (err) {
      setError(getResetPasswordError(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lv-login">
      <div className="lv-login__card">
        {/* Hero */}
        <div className="lv-login__hero">
          <div className="lv-login__hero-photo" style={{ backgroundImage: 'url(/login.png)' }} />
          <div className="lv-login__hero-overlay" />
          <img src="/logo3.png" alt="Level Jiu Jitsu" className="lv-login__logo" />
        </div>

        {/* Form body */}
        <div className="lv-login__body">
          <p className="lv-login__kicker">REDEFINIÇÃO DE SENHA</p>
          <h1 className="lv-login__headline">
            Nova senha<span className="lv-login__headline-period">.</span>
          </h1>

          {success ? (
            <>
              <div className="lv-login__success">
                Senha redefinida com sucesso! Agora você pode entrar com sua nova senha.
              </div>
              <button type="button" className="lv-btn-entrar" style={{ marginTop: '1.5rem' }} onClick={goToLogin}>
                <span className="lv-btn-entrar__label">Ir para o login</span>
                <span className="lv-btn-entrar__arrow"><ArrowRight size={18} /></span>
              </button>
            </>
          ) : verifying ? (
            <p className="lv-login__sub">Validando link...</p>
          ) : (
            <>
              {error && <div className="lv-login__error">{error}</div>}

              {email && !error && (
                <p className="lv-login__sub">
                  Crie uma nova senha para <strong>{email}</strong>
                </p>
              )}

              {!error && (
                <form onSubmit={(e) => void handleSubmit(e)}>
                  <div className="lv-field">
                    <span className="lv-field__icon"><Lock size={18} /></span>
                    <div className="lv-field__inner">
                      <span className="lv-field__label">Nova senha</span>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="lv-field__input"
                        placeholder="Mínimo 6 caracteres"
                        required
                      />
                    </div>
                    <button
                      type="button"
                      className="lv-field__eye"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>

                  <div className="lv-field">
                    <span className="lv-field__icon"><Lock size={18} /></span>
                    <div className="lv-field__inner">
                      <span className="lv-field__label">Confirmar senha</span>
                      <input
                        type={showConfirm ? 'text' : 'password'}
                        autoComplete="new-password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="lv-field__input"
                        placeholder="Repita a senha"
                        required
                      />
                    </div>
                    <button
                      type="button"
                      className="lv-field__eye"
                      onClick={() => setShowConfirm((v) => !v)}
                      aria-label={showConfirm ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>

                  <button type="submit" disabled={loading} className="lv-btn-entrar">
                    <span className="lv-btn-entrar__label">{loading ? 'Salvando...' : 'Redefinir senha'}</span>
                    <span className="lv-btn-entrar__arrow"><ArrowRight size={18} /></span>
                  </button>
                </form>
              )}

              <p className="lv-login__register" style={{ marginTop: '1.5rem' }}>
                <button type="button" className="lv-login__register-link" onClick={goToLogin}>
                  Voltar ao login
                </button>
              </p>
            </>
          )}
        </div>

        {/* Watermark */}
        <div className="lv-login__watermark" aria-hidden="true">
          <img src="/logo3.png" alt="" />
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordView;
