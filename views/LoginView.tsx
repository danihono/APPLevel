import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Eye, EyeOff, Lock, Mail, UserPlus } from 'lucide-react';
import {
  getBeltOptions,
  inferKidsCategoryFromBirthDate,
  inferTrainingTypeFromBirthDate,
  kidsCategoryLabel,
} from '../beltCatalog';
import DateField from '../components/DateField';
import LanguagePicker from '../components/LanguagePicker';
import { requestPasswordReset } from '../services/firebase/auth';
import { backendFunctions, isRetryableSignupAcademyFetchError } from '../services/firebase/functions';
import { t, tKey } from '../i18n';

interface LoginViewProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onRequestReactivation?: () => Promise<void>;
  initialError?: string;
  isSuspended?: boolean;
}

function getSignupPasswordError(password: string): string {
  if (password.length < 8) {
    return t('A senha deve ter no mínimo 8 caracteres.');
  }

  if (!/[0-9]/.test(password)) {
    return t('A senha deve conter pelo menos um número.');
  }

  return '';
}

const PASSWORD_RESET_SUCCESS_MESSAGE = tKey('Se este e-mail estiver cadastrado, enviaremos um link para redefinir sua senha.');

function getPasswordResetError(error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error
    ? String((error as { code: unknown }).code)
    : '';

  switch (code) {
    case 'auth/invalid-email':
    case 'functions/invalid-argument':
      return t('Informe um e-mail valido para receber o link de redefinicao.');
    case 'auth/too-many-requests':
      return t('Muitas tentativas de redefinicao. Aguarde alguns minutos e tente de novo.');
    case 'functions/resource-exhausted':
      // O servidor explica qual limite foi atingido (1 por minuto ou 5 por hora).
      return error instanceof Error && error.message
        ? t(error.message)
        : t('Muitas tentativas de redefinicao. Aguarde alguns minutos e tente de novo.');
    case 'functions/unavailable':
    case 'functions/internal':
    case 'functions/deadline-exceeded':
      return t('Nao foi possivel enviar o e-mail agora. Tente novamente em alguns minutos.');
    case 'auth/network-request-failed':
      return t('Falha na conexao com o servidor. Verifique sua internet e tente novamente.');
    default:
      if (error instanceof Error && error.message) {
        return t(error.message);
      }

      return t('Nao foi possivel enviar o link de redefinicao agora.');
  }
}

const LoginView: React.FC<LoginViewProps> = ({ onLogin, onRequestReactivation, initialError = '', isSuspended = false }) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'success'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [passwordResetLoading, setPasswordResetLoading] = useState(false);
  const [passwordResetSuccess, setPasswordResetSuccess] = useState('');
  const [reactivationBusy, setReactivationBusy] = useState(false);
  const [reactivationSent, setReactivationSent] = useState(false);

  const [signupLoading, setSignupLoading] = useState(false);
  const [signupError, setSignupError] = useState('');
  const [academyOptions, setAcademyOptions] = useState<Array<{ academyId: string; name: string; timezone: string }>>([]);
  const [academyLoading, setAcademyLoading] = useState(false);
  const [academyOptionsLoaded, setAcademyOptionsLoaded] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [cpf, setCpf] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [selectedAcademyIds, setSelectedAcademyIds] = useState<string[]>([]);
  const [manualAcademyId, setManualAcademyId] = useState('');
  const [belt, setBelt] = useState('white');
  const [grade, setGrade] = useState(0);
  const [isCompetitor, setIsCompetitor] = useState(false);

  const trainingType = useMemo(() => inferTrainingTypeFromBirthDate(birthDate), [birthDate]);
  const inferredKidsCategory = useMemo(() => inferKidsCategoryFromBirthDate(birthDate), [birthDate]);
  const signupBeltOptions = useMemo(
    () => getBeltOptions(trainingType, inferredKidsCategory),
    [inferredKidsCategory, trainingType],
  );

  useEffect(() => {
    if (!signupBeltOptions.length) {
      return;
    }

    if (!signupBeltOptions.some((option) => option.value === belt)) {
      setBelt(signupBeltOptions[0].value);
      setGrade(0);
    }
  }, [belt, signupBeltOptions]);

  useEffect(() => {
    if (mode !== 'signup' || academyOptionsLoaded) {
      return;
    }

    let active = true;
    const applyAcademyOptions = (records: Array<{ academyId: string; name: string; timezone: string }>) => {
      setAcademyOptions(records);

      if (records.length === 0) {
        setSignupError(t('Nenhuma unidade ativa está disponível no momento.'));
      }
    };

    const applyAcademyError = (fetchError: unknown) => {
      setSignupError(fetchError instanceof Error ? fetchError.message : t('Não foi possível carregar as unidades.'));
    };

    const loadAcademies = async () => {
      setAcademyLoading(true);
      setSignupError('');

      try {
        const records = await backendFunctions.listSignupAcademies();

        if (!active) {
          return;
        }

        applyAcademyOptions(records);
        return;
      } catch (fetchError) {
        if (active && isRetryableSignupAcademyFetchError(fetchError)) {
          try {
            const retryRecords = await backendFunctions.listSignupAcademies();

            if (!active) {
              return;
            }

            applyAcademyOptions(retryRecords);
            return;
          } catch (retryError) {
            if (!active) {
              return;
            }

            applyAcademyError(retryError);
            return;
          }
        }

        if (!active) {
          return;
        }

        applyAcademyError(fetchError);
      } finally {
        if (active) {
          setAcademyLoading(false);
          setAcademyOptionsLoaded(true);
        }
      }
    };

    void loadAcademies();

    return () => {
      active = false;
    };
  }, [academyOptionsLoaded, mode]);

  const handleRetryAcademies = () => {
    setAcademyOptions([]);
    setSelectedAcademyIds([]);
    setManualAcademyId('');
    setSignupError('');
    setAcademyOptionsLoaded(false);
  };

  const toggleAcademySelection = (academyOptionId: string) => {
    setSelectedAcademyIds((current) =>
      current.includes(academyOptionId)
        ? current.filter((entry) => entry !== academyOptionId)
        : [...current, academyOptionId],
    );
  };

  const handleRequestReactivation = async () => {
    if (!onRequestReactivation) return;
    setReactivationBusy(true);
    setError('');
    try {
      await onRequestReactivation();
      setReactivationSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Não foi possível enviar a solicitação.'));
    } finally {
      setReactivationBusy(false);
    }
  };

  const handlePasswordReset = async () => {
    const trimmedEmail = email.trim();
    setError('');
    setPasswordResetSuccess('');

    if (!trimmedEmail) {
      setError(t('Informe seu e-mail para receber o link de redefinicao.'));
      return;
    }

    setPasswordResetLoading(true);

    try {
      await requestPasswordReset(trimmedEmail);
      setPasswordResetSuccess(t(PASSWORD_RESET_SUCCESS_MESSAGE));
    } catch (resetError) {
      const code = typeof resetError === 'object' && resetError && 'code' in resetError
        ? String((resetError as { code: unknown }).code)
        : '';

      if (code === 'auth/user-not-found' || code === 'auth/user-disabled') {
        setPasswordResetSuccess(t(PASSWORD_RESET_SUCCESS_MESSAGE));
        return;
      }

      setError(getPasswordResetError(resetError));
    } finally {
      setPasswordResetLoading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setPasswordResetSuccess('');
    setIsLoading(true);

    try {
      await onLogin(email, password);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('Não foi possível entrar agora.'));
    } finally {
      setIsLoading(false);
    }
  };

  const academyIdsForSubmit = useMemo(() => {
    const ids = [...selectedAcademyIds];
    const manualId = manualAcademyId.trim();
    if (manualId && !ids.includes(manualId)) {
      ids.push(manualId);
    }
    return [...new Set(ids)];
  }, [manualAcademyId, selectedAcademyIds]);

  const handleSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    const passwordError = getSignupPasswordError(signupPassword);

    if (passwordError) {
      setSignupError(passwordError);
      return;
    }

    if (academyIdsForSubmit.length === 0) {
      setSignupError(t('Selecione ao menos uma unidade.'));
      return;
    }

    setSignupLoading(true);
    setSignupError('');

    try {
      await backendFunctions.submitStudentSignup({
        academyIds: academyIdsForSubmit,
        email: signupEmail,
        password: signupPassword,
        firstName,
        lastName,
        cpf,
        birthDate,
        isCompetitor,
        belt,
        grade,
      });
      setMode('success');
    } catch (submitError) {
      setSignupError(submitError instanceof Error ? submitError.message : t('Não foi possível enviar o cadastro.'));
    } finally {
      setSignupLoading(false);
    }
  };

  if (isSuspended) {
    return (
      <div className="lv-login">
        <div className="lv-login__card">
          <div className="lv-login__hero">
            <div className="lv-login__hero-photo" style={{ backgroundImage: 'url(/login.png)' }} />
            <div className="lv-login__hero-overlay" />
            <img src="/logo3.png" alt="Level Jiu Jitsu" className="lv-login__logo" />
          </div>
          <div className="lv-login__body">
            <p className="lv-login__kicker">{t('ACESSO BLOQUEADO')}</p>
            <h1 className="lv-login__headline">
              {t('Conta desativada')}<span className="lv-login__headline-period">.</span>
            </h1>
            <p className="lv-login__sub">
              {t('Sua conta foi desativada pelo seu professor. Para voltar a treinar, solicite a reativação.')}
            </p>

            {error ? <div className="lv-login__error">{error}</div> : null}

            {reactivationSent ? (
              <div style={{ color: '#22c55e', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '0.75rem', padding: '0.75rem 1rem', fontSize: '0.875rem', marginBottom: '1rem' }}>
                {t('Solicitação enviada! Aguarde a resposta do seu professor.')}
              </div>
            ) : (
              <button
                type="button"
                disabled={reactivationBusy || !onRequestReactivation}
                onClick={() => void handleRequestReactivation()}
                className="lv-btn-entrar"
                style={{ marginTop: '1rem' }}
              >
                <span className="lv-btn-entrar__label">
                  {reactivationBusy ? t('Enviando...') : t('Solicitar Reativação')}
                </span>
                <span className="lv-btn-entrar__arrow"><ArrowRight size={18} /></span>
              </button>
            )}

            <p className="lv-login__register" style={{ marginTop: '1.5rem' }}>
              <button type="button" className="lv-login__register-link" onClick={() => window.location.reload()}>
                {t('Voltar ao login')}
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'login') {
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
            <div style={{ marginBottom: '1rem' }}>
              <LanguagePicker compact />
            </div>
            <p className="lv-login__kicker">{t('BEM-VINDO DE VOLTA')}</p>
            <h1 className="lv-login__headline">
              {t('Acesse sua')}<br />{t('evolução')}<span className="lv-login__headline-period">.</span>
            </h1>
            <p className="lv-login__sub">
              {t('Entre para acompanhar seus treinos, conquistas e sua jornada no tatame.')}
            </p>

            {error || initialError ? (
              <div className="lv-login__error">{error || initialError}</div>
            ) : null}

            {passwordResetSuccess ? (
              <div className="lv-login__success">{passwordResetSuccess}</div>
            ) : null}

            <form onSubmit={handleSubmit}>
              {/* Email */}
              <div className="lv-field">
                <span className="lv-field__icon"><Mail size={18} /></span>
                <div className="lv-field__inner">
                  <span className="lv-field__label">{t('E-mail')}</span>
                  <input
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setPasswordResetSuccess('');
                    }}
                    className="lv-field__input"
                    placeholder={t('você@academia.com')}
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="lv-field">
                <span className="lv-field__icon"><Lock size={18} /></span>
                <div className="lv-field__inner">
                  <span className="lv-field__label">{t('Senha')}</span>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="lv-field__input"
                    placeholder={t('Sua senha')}
                    required
                  />
                </div>
                <button
                  type="button"
                  className="lv-field__eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t('Ocultar senha') : t('Mostrar senha')}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {/* Remember + Forgot */}
              <div className="lv-login__remember-row">
                <label className="lv-login__remember">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  {t('Lembrar de mim')}
                </label>
                <button
                  type="button"
                  className="lv-login__forgot"
                  disabled={passwordResetLoading}
                  onClick={() => void handlePasswordReset()}
                >
                  {passwordResetLoading ? t('Enviando...') : t('Esqueci minha senha')}
                </button>
              </div>

              {/* Entrar button */}
              <button type="submit" disabled={isLoading} className="lv-btn-entrar">
                <span className="lv-btn-entrar__label">{isLoading ? t('Entrando...') : t('Entrar')}</span>
                <span className="lv-btn-entrar__arrow"><ArrowRight size={18} /></span>
              </button>
            </form>

            {/* Register link */}
            <p className="lv-login__register">
              {t('Ainda não tem uma conta?')}{' '}
              <button
                type="button"
                className="lv-login__register-link"
                onClick={() => setMode('signup')}
              >
                {t('Cadastre-se')}
              </button>
            </p>
          </div>

          {/* Watermark */}
          <div className="lv-login__watermark" aria-hidden="true">
            <img src="/logo3.png" alt="" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-auth-shell">
      <div className="app-auth-grid">
        <section className="app-panel app-auth-card">
          <div className="app-brand">
            <img src="/logo3.png" alt="APPLevel" className="h-20 w-20 object-contain flex-shrink-0" />
            <div className="app-brand__text">
              <p className="app-kicker">Applevel</p>
              <h1 className="app-headline">
                {mode === 'signup' ? t('Crie seu acesso como aluno.') : t('Cadastro enviado!')}
              </h1>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <div className="app-icon-shell">
              <UserPlus size={18} />
            </div>
            <div>
              <p className="app-section-label">{mode === 'signup' ? t('Cadastro do aluno') : ''}</p>
              <h2 className="text-3xl font-bold">
                {mode === 'signup' ? t('Solicite seu acesso') : t('Cadastro enviado')}
              </h2>
            </div>
          </div>

          {mode === 'signup' ? (
            <>
              <p className="app-note mt-4">
                {t('Seu cadastro fica pendente até aprovação do professor da unidade.')}
              </p>

              <form className="mt-6 app-form-grid" onSubmit={handleSignup}>
                {signupError ? (
                  <div className="app-alert app-alert--error">{signupError}</div>
                ) : null}

                <label className="app-field">
                  <span className="app-field__label">{t('Nome')}</span>
                  <input value={firstName} onChange={(event) => setFirstName(event.target.value)} className="app-input" required />
                </label>

                <label className="app-field">
                  <span className="app-field__label">{t('Sobrenome')}</span>
                  <input value={lastName} onChange={(event) => setLastName(event.target.value)} className="app-input" required />
                </label>

                <label className="app-field">
                  <span className="app-field__label">{t('E-mail')}</span>
                  <input type="email" value={signupEmail} onChange={(event) => setSignupEmail(event.target.value)} className="app-input" required />
                </label>

                <label className="app-field">
                  <span className="app-field__label">{t('Senha')}</span>
                  <input
                    type="password"
                    value={signupPassword}
                    onChange={(event) => setSignupPassword(event.target.value)}
                    className="app-input"
                    minLength={8}
                    pattern="(?=.*[0-9]).{8,}"
                    title={t('A senha deve ter no mínimo 8 caracteres e conter pelo menos um número.')}
                    autoComplete="new-password"
                    required
                  />
                  <span className="app-field__hint">{t('Use pelo menos 8 caracteres e 1 número.')}</span>
                </label>

                <label className="app-field">
                  <span className="app-field__label">CPF</span>
                  <input value={cpf} onChange={(event) => setCpf(event.target.value)} className="app-input" placeholder="000.000.000-00" required />
                </label>

                <label className="app-field">
                  <span className="app-field__label">{t('Data de nascimento')}</span>
                  <DateField value={birthDate} onChange={setBirthDate} required />
                  <span className="app-field__hint">
                    {t('Trilha detectada:')} {t(trainingType)}
                    {trainingType === 'Kids' ? ` • ${kidsCategoryLabel(inferredKidsCategory)}` : ''}
                  </span>
                </label>

                <div className="app-field">
                  <span className="app-field__label">{t('Unidades')}</span>
                  <span className="app-field__hint">
                    {t('Marque uma ou mais unidades. Cada unidade vai analisar sua solicitação separadamente.')}
                  </span>
                  {academyLoading ? (
                    <div className="app-note" style={{ marginTop: '0.5rem' }}>{t('Carregando unidades...')}</div>
                  ) : academyOptions.length === 0 ? (
                    <div className="app-note" style={{ marginTop: '0.5rem' }}>{t('Nenhuma unidade disponível no momento.')}</div>
                  ) : (
                    <div className="signup-units">
                      {academyOptions.map((academyOption) => {
                        const checked = selectedAcademyIds.includes(academyOption.academyId);
                        return (
                          <label
                            key={academyOption.academyId}
                            className={`signup-units__option${checked ? ' signup-units__option--checked' : ''}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAcademySelection(academyOption.academyId)}
                            />
                            <span className="signup-units__name">{academyOption.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                  {selectedAcademyIds.length > 0 ? (
                    <span className="app-field__hint" style={{ marginTop: '0.5rem' }}>
                      {t('Solicitando entrada em {count} unidade(s).', { count: selectedAcademyIds.length })}
                    </span>
                  ) : null}
                </div>

                {!academyLoading && academyOptions.length === 0 ? (
                  <label className="app-field">
                    <span className="app-field__label">{t('Academy ID manual')}</span>
                    <input
                      value={manualAcademyId}
                      onChange={(event) => setManualAcademyId(event.target.value)}
                      className="app-input"
                      placeholder={t('Cole aqui o Academy ID da unidade')}
                    />
                    <span className="app-field__hint">
                      {t('Se a lista não carregar, você ainda pode entrar com o ID da academia manualmente.')}
                    </span>
                  </label>
                ) : null}

                {!academyLoading && academyOptions.length === 0 ? (
                  <button
                    type="button"
                    onClick={handleRetryAcademies}
                    className="app-button app-button--ghost app-button--block"
                  >
                    {t('Tentar carregar unidades novamente')}
                  </button>
                ) : null}

                <label className="app-field">
                  <span className="app-field__label">{t('Faixa')}</span>
                  <select value={belt} onChange={(event) => setBelt(event.target.value)} className="app-select" required>
                    {signupBeltOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <label className="app-field">
                  <span className="app-field__label">{t('Grau')}</span>
                  <input type="number" min={0} value={grade} onChange={(event) => setGrade(Number(event.target.value))} className="app-input" required />
                </label>

                <label className="app-field">
                  <span className="app-field__label">{t('Competidor')}</span>
                  <select value={isCompetitor ? 'yes' : 'no'} onChange={(event) => setIsCompetitor(event.target.value === 'yes')} className="app-select">
                    <option value="no">{t('Não')}</option>
                    <option value="yes">{t('Sim')}</option>
                  </select>
                </label>

                <button type="submit" disabled={signupLoading || academyLoading || academyIdsForSubmit.length === 0} className="app-button app-button--gold app-button--block">
                  {signupLoading ? t('Enviando...') : t('Enviar cadastro')}
                </button>
              </form>

              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setSignupError('');
                }}
                className="mt-6 w-full text-sm font-semibold text-[color:var(--gold-mid)]"
              >
                {t('Já tem login? Entrar')}
              </button>
            </>
          ) : null}

          {mode === 'success' ? (
            <div className="mt-6 app-form-grid">
              <div className="app-alert app-alert--success">
                {t('Cadastro enviado com sucesso. Cada unidade selecionada vai analisar sua solicitação separadamente — você receberá uma notificação assim que algum professor aprovar.')}
              </div>

              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setSignupError('');
                }}
                className="app-button app-button--gold app-button--block"
              >
                {t('Voltar para o login')}
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
};

export default LoginView;
