import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, Eye, EyeOff, IdCard, Lock, Mail, User } from 'lucide-react';
import BeltImage from '../BeltImage';
import DateField from '../DateField';
import { isBlackBelt } from '../../beltCatalog';
import { t } from '../../i18n';
import './signup.css';

// Cadastro do aluno em etapas (redesign): uma pergunta por tela, barra de progresso e resumo no fim.
// So visual/fluxo — o estado, as validacoes e o envio continuam no LoginView (mesmo payload de antes).

export interface SignupWizardProps {
  firstName: string;
  onFirstNameChange: (value: string) => void;
  lastName: string;
  onLastNameChange: (value: string) => void;
  birthDate: string;
  onBirthDateChange: (value: string) => void;
  cpf: string;
  onCpfChange: (value: string) => void;
  /** "Adulto" ou "Kids · categoria", ja traduzido. */
  trackLabel: string;
  academyOptions: Array<{ academyId: string; name: string }>;
  academyLoading: boolean;
  selectedAcademyIds: string[];
  onToggleAcademy: (academyId: string) => void;
  manualAcademyId: string;
  onManualAcademyIdChange: (value: string) => void;
  onRetryAcademies: () => void;
  /** Unidades que vao no envio (selecionadas + ID manual). */
  academyIdsForSubmit: string[];
  beltOptions: Array<{ value: string; label: string }>;
  belt: string;
  onBeltChange: (value: string) => void;
  grade: number;
  onGradeChange: (value: number) => void;
  isCompetitor: boolean;
  onCompetitorChange: (value: boolean) => void;
  email: string;
  onEmailChange: (value: string) => void;
  password: string;
  onPasswordChange: (value: string) => void;
  /** Mensagem de erro da regra de senha ('' quando valida). */
  passwordError: (password: string) => string;
  busy: boolean;
  error: string;
  onSubmit: () => void | Promise<void>;
  onBackToLogin: () => void;
}

const STEP_COUNT = 6;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SignupWizard: React.FC<SignupWizardProps> = (props) => {
  const {
    firstName, lastName, birthDate, cpf, trackLabel,
    academyOptions, academyLoading, selectedAcademyIds, manualAcademyId, academyIdsForSubmit,
    beltOptions, belt, grade, isCompetitor, email, password, busy, error,
  } = props;
  const [step, setStep] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Foco no primeiro campo de cada etapa (teclado ja aberto no celular).
    firstFieldRef.current?.focus({ preventScroll: true });
  }, [step]);

  // Erro do envio (e-mail ja usado etc.) leva para o resumo, onde ele aparece.
  useEffect(() => {
    if (error) setStep(STEP_COUNT - 1);
  }, [error]);

  const firstNameTrimmed = firstName.trim();
  const passwordProblem = password ? props.passwordError(password) : '';
  const stepValid = [
    firstNameTrimmed !== '' && lastName.trim() !== '',
    birthDate !== '' && cpf.trim() !== '',
    academyIdsForSubmit.length > 0,
    belt !== '' && grade >= 0,
    EMAIL_PATTERN.test(email.trim()) && password !== '' && passwordProblem === '',
    true,
  ];
  const isLast = step === STEP_COUNT - 1;
  const canContinue = stepValid[step] && !busy && !(isLast && academyLoading);

  const goNext = () => {
    if (!canContinue) return;
    if (isLast) {
      void props.onSubmit();
      return;
    }
    setStep((current) => Math.min(STEP_COUNT - 1, current + 1));
  };

  const goBack = () => {
    if (step === 0) {
      props.onBackToLogin();
      return;
    }
    setStep((current) => Math.max(0, current - 1));
  };

  const handleFormSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    goNext();
  };

  const maxGrade = isBlackBelt(belt) ? 6 : 4;
  const gradeOptions = Array.from({ length: maxGrade + 1 }, (_, index) => index);
  const beltLabelOf = (value: string) => beltOptions.find((option) => option.value === value)?.label ?? value;
  const selectedAcademyNames = academyIdsForSubmit.map(
    (id) => academyOptions.find((option) => option.academyId === id)?.name ?? id,
  );

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <>
            <h1 className="rd-signup__title">{t('Qual é o seu nome?')}</h1>
            <p className="rd-signup__lead">{t('É assim que seu professor vai te encontrar na academia.')}</p>
            <div className="rd-signup__fields">
              <label className="rd-signup__input">
                <User size={18} aria-hidden="true" />
                <input
                  ref={firstFieldRef}
                  value={firstName}
                  onChange={(event) => props.onFirstNameChange(event.target.value)}
                  placeholder={t('Nome')}
                  aria-label={t('Nome')}
                  autoComplete="given-name"
                  autoCapitalize="words"
                />
              </label>
              <label className="rd-signup__input">
                <User size={18} aria-hidden="true" />
                <input
                  value={lastName}
                  onChange={(event) => props.onLastNameChange(event.target.value)}
                  placeholder={t('Sobrenome')}
                  aria-label={t('Sobrenome')}
                  autoComplete="family-name"
                  autoCapitalize="words"
                />
              </label>
            </div>
          </>
        );
      case 1:
        return (
          <>
            <h1 className="rd-signup__title">{t('Quando você nasceu?')}</h1>
            <p className="rd-signup__lead">{t('A idade define sua trilha: Adulto ou Kids.')}</p>
            <div className="rd-signup__fields">
              <div className="rd-signup__date">
                <DateField
                  value={birthDate}
                  onChange={props.onBirthDateChange}
                  ariaLabel={t('Data de nascimento')}
                  className="app-input rd-signup__date-input"
                  required
                />
              </div>
              {birthDate ? (
                <p className="rd-signup__hint">
                  {t('Trilha detectada:')} <strong>{trackLabel}</strong>
                </p>
              ) : null}
              <label className="rd-signup__input">
                <IdCard size={18} aria-hidden="true" />
                <input
                  value={cpf}
                  onChange={(event) => props.onCpfChange(event.target.value)}
                  placeholder="CPF · 000.000.000-00"
                  aria-label="CPF"
                  inputMode="numeric"
                />
              </label>
            </div>
          </>
        );
      case 2:
        return (
          <>
            <h1 className="rd-signup__title">{t('Onde você treina?')}</h1>
            <p className="rd-signup__lead">{t('Marque uma ou mais unidades. Cada unidade vai analisar sua solicitação separadamente.')}</p>
            {academyLoading ? (
              <p className="rd-signup__hint">{t('Carregando unidades...')}</p>
            ) : academyOptions.length > 0 ? (
              <div className="rd-signup__options" role="group" aria-label={t('Unidades')}>
                {academyOptions.map((option) => {
                  const checked = selectedAcademyIds.includes(option.academyId);
                  return (
                    <button
                      key={option.academyId}
                      type="button"
                      className={`rd-signup__option ${checked ? 'is-selected' : ''}`.trim()}
                      aria-pressed={checked}
                      onClick={() => props.onToggleAcademy(option.academyId)}
                    >
                      <span className="rd-signup__option-icon" aria-hidden="true">
                        <span className="rd-signup__option-mark"><i /><i /><i /></span>
                      </span>
                      <span className="rd-signup__option-text">
                        <strong>{option.name}</strong>
                        <small>Level Jiu-Jitsu</small>
                      </span>
                      <span className="rd-signup__check" aria-hidden="true">{checked ? <Check size={14} strokeWidth={3} /> : null}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="rd-signup__fields">
                <p className="rd-signup__hint">{t('Nenhuma unidade disponível no momento.')}</p>
                <label className="rd-signup__input">
                  <IdCard size={18} aria-hidden="true" />
                  <input
                    value={manualAcademyId}
                    onChange={(event) => props.onManualAcademyIdChange(event.target.value)}
                    placeholder={t('Cole aqui o Academy ID da unidade')}
                    aria-label={t('Academy ID manual')}
                  />
                </label>
                <p className="rd-signup__hint">{t('Se a lista não carregar, você ainda pode entrar com o ID da academia manualmente.')}</p>
                <button type="button" className="rd-signup__link" onClick={props.onRetryAcademies}>
                  {t('Tentar carregar unidades novamente')}
                </button>
              </div>
            )}
            {selectedAcademyIds.length > 0 ? (
              <p className="rd-signup__hint">{t('Solicitando entrada em {count} unidade(s).', { count: selectedAcademyIds.length })}</p>
            ) : null}
          </>
        );
      case 3:
        return (
          <>
            <h1 className="rd-signup__title">{t('Qual é a sua faixa?')}</h1>
            <p className="rd-signup__lead">{t('Escolha a faixa e o grau que você tem hoje. O professor confirma na aprovação.')}</p>
            <div className="rd-signup__options" role="radiogroup" aria-label={t('Faixa')}>
              {beltOptions.map((option) => {
                const selected = option.value === belt;
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    className={`rd-signup__option rd-signup__option--belt ${selected ? 'is-selected' : ''}`.trim()}
                    onClick={() => {
                      props.onBeltChange(option.value);
                      if (grade > (isBlackBelt(option.value) ? 6 : 4)) props.onGradeChange(0);
                    }}
                  >
                    <span className="rd-signup__option-belt" aria-hidden="true">
                      <BeltImage belt={option.value} stripes={selected ? grade : 0} hideEmptyStripes={!selected} />
                    </span>
                    <span className="rd-signup__option-text">
                      <strong>{option.label}</strong>
                    </span>
                    <span className="rd-signup__radio" aria-hidden="true" />
                  </button>
                );
              })}
            </div>

            <p className="rd-signup__section">{t('Grau')}</p>
            <div className="rd-signup__pills" role="radiogroup" aria-label={t('Grau')}>
              {gradeOptions.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={grade === value}
                  className={`rd-signup__pill ${grade === value ? 'is-selected' : ''}`.trim()}
                  onClick={() => props.onGradeChange(value)}
                >
                  {value === 0 ? t('Sem grau') : `${value}º`}
                </button>
              ))}
            </div>

            <p className="rd-signup__section">{t('Você compete?')}</p>
            <div className="rd-signup__pills" role="radiogroup" aria-label={t('Competidor')}>
              {[false, true].map((value) => (
                <button
                  key={String(value)}
                  type="button"
                  role="radio"
                  aria-checked={isCompetitor === value}
                  className={`rd-signup__pill rd-signup__pill--wide ${isCompetitor === value ? 'is-selected' : ''}`.trim()}
                  onClick={() => props.onCompetitorChange(value)}
                >
                  {value ? t('Sim') : t('Não')}
                </button>
              ))}
            </div>
          </>
        );
      case 4:
        return (
          <>
            <h1 className="rd-signup__title">{t('Crie seu acesso')}</h1>
            <p className="rd-signup__lead">{t('Você vai entrar no app com esse e-mail e senha.')}</p>
            <div className="rd-signup__fields">
              <label className="rd-signup__input">
                <Mail size={18} aria-hidden="true" />
                <input
                  ref={firstFieldRef}
                  type="email"
                  value={email}
                  onChange={(event) => props.onEmailChange(event.target.value)}
                  placeholder={t('E-mail')}
                  aria-label={t('E-mail')}
                  autoComplete="email"
                  autoCapitalize="none"
                  inputMode="email"
                />
              </label>
              <label className="rd-signup__input">
                <Lock size={18} aria-hidden="true" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => props.onPasswordChange(event.target.value)}
                  placeholder={t('Senha')}
                  aria-label={t('Senha')}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="rd-signup__eye"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? t('Ocultar senha') : t('Mostrar senha')}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </label>
              <p className={`rd-signup__hint ${passwordProblem ? 'is-error' : ''}`.trim()}>
                {passwordProblem || t('Use pelo menos 8 caracteres e 1 número.')}
              </p>
            </div>
          </>
        );
      default:
        return (
          <>
            <div className="rd-signup__done-mark" aria-hidden="true">
              <Check size={34} strokeWidth={3} />
            </div>
            <h1 className="rd-signup__title rd-signup__title--center">
              {t('Tudo certo, {name}!', { name: firstNameTrimmed || t('atleta') })}
            </h1>
            <p className="rd-signup__lead rd-signup__lead--center">
              {t('Confira seus dados. Seu cadastro fica pendente até aprovação do professor da unidade.')}
            </p>

            {error ? <div className="app-alert app-alert--error">{error}</div> : null}

            <div className="rd-signup__summary">
              {[
                { label: t('Nome'), value: `${firstNameTrimmed} ${lastName.trim()}`.trim(), target: 0 },
                { label: t('Trilha'), value: trackLabel, target: 1 },
                { label: t('Unidades'), value: selectedAcademyNames.join(', '), target: 2 },
                { label: t('Faixa'), value: `${beltLabelOf(belt)} · ${grade === 0 ? t('Sem grau') : `${grade}º`}`, target: 3 },
                { label: t('Competidor'), value: isCompetitor ? t('Sim') : t('Não'), target: 3 },
                { label: t('E-mail'), value: email.trim(), target: 4 },
              ].map((row) => (
                <button key={row.label} type="button" className="rd-signup__summary-row" onClick={() => setStep(row.target)}>
                  <span className="rd-signup__summary-label">{row.label}</span>
                  <span className="rd-signup__summary-value">{row.value}</span>
                  <span className="rd-signup__summary-edit">{t('Editar')}</span>
                </button>
              ))}
            </div>
          </>
        );
    }
  };

  return (
    <div className="rd-signup">
      <form className="rd-signup__frame" onSubmit={handleFormSubmit} noValidate>
        <div className="rd-signup__top">
          <button type="button" className="rd-signup__back" onClick={goBack} aria-label={t('Voltar')}>
            <ChevronLeft size={22} />
          </button>
          <div
            className="rd-signup__progress"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={STEP_COUNT}
            aria-valuenow={step + 1}
            aria-label={t('Etapa {current} de {total}', { current: step + 1, total: STEP_COUNT })}
          >
            <span style={{ width: `${((step + 1) / STEP_COUNT) * 100}%` }} />
          </div>
          <span className="rd-signup__counter">{t('{current} de {total}', { current: step + 1, total: STEP_COUNT })}</span>
        </div>

        <div className="rd-signup__body" key={step}>
          {renderStep()}
        </div>

        <div className="rd-signup__footer">
          <button type="submit" className="rd-signup__continue" disabled={!canContinue}>
            {isLast ? (busy ? t('Enviando...') : t('Enviar cadastro')) : t('Continuar')}
          </button>
          {step === 0 ? (
            <button type="button" className="rd-signup__link" onClick={props.onBackToLogin}>
              {t('Já tem login? Entrar')}
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
};

export default SignupWizard;
