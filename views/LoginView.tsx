import React, { useEffect, useState } from 'react';
import { KeyRound, UserPlus } from 'lucide-react';
import { backendFunctions, isRetryableSignupAcademyFetchError } from '../services/firebase/functions';

interface LoginViewProps {
  onLogin: (email: string, password: string) => Promise<void>;
  initialError?: string;
}

const beltOptions = [
  { value: 'white', label: 'Branca' },
  { value: 'blue', label: 'Azul' },
  { value: 'purple', label: 'Roxa' },
  { value: 'brown', label: 'Marrom' },
  { value: 'black', label: 'Preta' },
];

const LoginView: React.FC<LoginViewProps> = ({ onLogin, initialError = '' }) => {
  const [mode, setMode] = useState<'login' | 'signup' | 'success'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

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
  const [academyId, setAcademyId] = useState('');
  const [belt, setBelt] = useState('white');
  const [grade, setGrade] = useState(0);
  const [isCompetitor, setIsCompetitor] = useState(false);

  useEffect(() => {
    if (mode !== 'signup' || academyOptionsLoaded) {
      return;
    }

    let active = true;
    const applyAcademyOptions = (records: Array<{ academyId: string; name: string; timezone: string }>) => {
      setAcademyOptions(records);
      setAcademyId((current) => current || records[0]?.academyId || '');

      if (records.length === 0) {
        setSignupError('Nenhuma unidade ativa esta disponivel no momento.');
      }
    };

    const applyAcademyError = (fetchError: unknown) => {
      setSignupError(fetchError instanceof Error ? fetchError.message : 'Nao foi possivel carregar as unidades.');
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
    setAcademyId('');
    setSignupError('');
    setAcademyOptionsLoaded(false);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
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

  const handleSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    setSignupLoading(true);
    setSignupError('');

    try {
      await backendFunctions.submitStudentSignup({
        academyId,
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
      setSignupError(submitError instanceof Error ? submitError.message : 'Nao foi possivel enviar o cadastro.');
    } finally {
      setSignupLoading(false);
    }
  };

  return (
    <div className="app-auth-shell">
      <div className="app-auth-grid">
        <section className="app-panel app-auth-card">
          <div className="app-brand">
            <img src="/logo3.png" alt="APPLevel" className="h-20 w-20 object-contain flex-shrink-0" />
            <div className="app-brand__text">
              <p className="app-kicker">Applevel</p>
              <h1 className="app-headline">
                {mode === 'login' ? 'Entre para abrir o painel da academia.' : 'Crie seu acesso como aluno.'}
              </h1>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <div className="app-icon-shell">
              {mode === 'login' ? <KeyRound size={18} /> : <UserPlus size={18} />}
            </div>
            <div>
              <p className="app-section-label">{mode === 'login' ? 'Entrar' : 'Cadastro do aluno'}</p>
              <h2 className="text-3xl font-bold">
                {mode === 'login'
                  ? 'Acesse o APPLevel'
                  : mode === 'signup'
                    ? 'Solicite seu acesso'
                    : 'Cadastro enviado'}
              </h2>
            </div>
          </div>

          {mode === 'login' ? (
            <>
              <p className="app-note mt-4">
                Use a mesma conta cadastrada no Firebase Authentication para abrir a experiencia completa.
              </p>

              <form className="mt-6 app-form-grid" onSubmit={handleSubmit}>
                {error || initialError ? (
                  <div className="app-alert app-alert--error">{error || initialError}</div>
                ) : null}

                <label className="app-field">
                  <span className="app-field__label">E-mail</span>
                  <input
                    type="email"
                    autoComplete="username"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
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
                    onChange={(event) => setPassword(event.target.value)}
                    className="app-input"
                    placeholder="Sua senha"
                    required
                  />
                </label>

                <button type="submit" disabled={isLoading} className="app-button app-button--gold app-button--block">
                  {isLoading ? 'Entrando...' : 'Abrir painel'}
                </button>
              </form>

              <button
                type="button"
                onClick={() => {
                  setMode('signup');
                  setError('');
                }}
                className="mt-6 w-full text-sm font-semibold text-[color:var(--gold-mid)]"
              >
                Nao tem login? Cadastre-se
              </button>
            </>
          ) : null}

          {mode === 'signup' ? (
            <>
              <p className="app-note mt-4">
                Seu cadastro fica pendente ate aprovacao do professor ou do superadmin da unidade.
              </p>

              <form className="mt-6 app-form-grid" onSubmit={handleSignup}>
                {signupError ? (
                  <div className="app-alert app-alert--error">{signupError}</div>
                ) : null}

                <label className="app-field">
                  <span className="app-field__label">Nome</span>
                  <input value={firstName} onChange={(event) => setFirstName(event.target.value)} className="app-input" required />
                </label>

                <label className="app-field">
                  <span className="app-field__label">Sobrenome</span>
                  <input value={lastName} onChange={(event) => setLastName(event.target.value)} className="app-input" required />
                </label>

                <label className="app-field">
                  <span className="app-field__label">E-mail</span>
                  <input type="email" value={signupEmail} onChange={(event) => setSignupEmail(event.target.value)} className="app-input" required />
                </label>

                <label className="app-field">
                  <span className="app-field__label">Senha</span>
                  <input type="password" value={signupPassword} onChange={(event) => setSignupPassword(event.target.value)} className="app-input" minLength={6} required />
                </label>

                <label className="app-field">
                  <span className="app-field__label">CPF</span>
                  <input value={cpf} onChange={(event) => setCpf(event.target.value)} className="app-input" placeholder="000.000.000-00" required />
                </label>

                <label className="app-field">
                  <span className="app-field__label">Data de nascimento</span>
                  <input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} className="app-input" required />
                </label>

                <label className="app-field">
                  <span className="app-field__label">Unidade</span>
                  <select
                    value={academyId}
                    onChange={(event) => setAcademyId(event.target.value)}
                    className="app-select"
                    disabled={academyLoading || academyOptions.length === 0}
                    required
                  >
                    {academyLoading ? (
                      <option value="">Carregando unidades...</option>
                    ) : academyOptions.length === 0 ? (
                      <option value="">Nenhuma unidade disponivel</option>
                    ) : (
                      academyOptions.map((academyOption) => (
                        <option key={academyOption.academyId} value={academyOption.academyId}>
                          {academyOption.name}
                        </option>
                      ))
                    )}
                  </select>
                </label>

                {academyOptions.length > 0 && academyId ? (
                  <div className="app-field__hint">
                    Academy ID selecionado: <strong>{academyId}</strong>
                  </div>
                ) : null}

                {!academyLoading && academyOptions.length === 0 ? (
                  <label className="app-field">
                    <span className="app-field__label">Academy ID manual</span>
                    <input
                      value={academyId}
                      onChange={(event) => setAcademyId(event.target.value)}
                      className="app-input"
                      placeholder="Cole aqui o Academy ID da unidade"
                      required
                    />
                    <span className="app-field__hint">
                      Se a lista nao carregar, voce ainda pode entrar com o ID da academia manualmente.
                    </span>
                  </label>
                ) : null}

                {!academyLoading && academyOptions.length === 0 ? (
                  <button
                    type="button"
                    onClick={handleRetryAcademies}
                    className="app-button app-button--ghost app-button--block"
                  >
                    Tentar carregar unidades novamente
                  </button>
                ) : null}

                <label className="app-field">
                  <span className="app-field__label">Faixa</span>
                  <select value={belt} onChange={(event) => setBelt(event.target.value)} className="app-select" required>
                    {beltOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>

                <label className="app-field">
                  <span className="app-field__label">Grau</span>
                  <input type="number" min={0} value={grade} onChange={(event) => setGrade(Number(event.target.value))} className="app-input" required />
                </label>

                <label className="app-field">
                  <span className="app-field__label">Competidor</span>
                  <select value={isCompetitor ? 'yes' : 'no'} onChange={(event) => setIsCompetitor(event.target.value === 'yes')} className="app-select">
                    <option value="no">Nao</option>
                    <option value="yes">Sim</option>
                  </select>
                </label>

                <button type="submit" disabled={signupLoading || academyLoading || !academyId} className="app-button app-button--gold app-button--block">
                  {signupLoading ? 'Enviando...' : 'Enviar cadastro'}
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
                Ja tem login? Entrar
              </button>
            </>
          ) : null}

          {mode === 'success' ? (
            <div className="mt-6 app-form-grid">
              <div className="app-alert app-alert--success">
                Cadastro enviado com sucesso. Agora aguarde a aprovacao do professor ou do superadmin da unidade antes de tentar entrar.
              </div>

              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setSignupError('');
                }}
                className="app-button app-button--gold app-button--block"
              >
                Voltar para o login
              </button>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
};

export default LoginView;
