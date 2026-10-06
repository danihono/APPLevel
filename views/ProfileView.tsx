import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ADULT_BELTS,
  beltLabel,
  getBlackBeltProgress,
  getBlackBeltProgressForUser,
  getUserProgressionSummary,
  isBlackBelt,
  type ProgressionRules,
} from '../beltCatalog';
import { resolveAttendanceDate } from '../attendanceUtils';
import { commitmentLevelClass, commitmentNote } from '../components/CommitmentBar';
import type { CommitmentResult } from '../commitmentScale';
import { nonCountingReasonLabel } from '../classRules';
import {
  AlertTriangle,
  ArrowLeftRight,
  Award,
  Bell,
  BellRing,
  Building2,
  Camera,
  ChevronRight,
  History,
  Languages,
  LogOut,
  Mail,
  Medal,
  Moon,
  Phone,
  Plus,
  Save,
  ScrollText,
  Settings2,
  Shield,
  ShieldCheck,
  Sun,
  Trash2,
  UserRound,
} from 'lucide-react';
import BeltImage from '../components/BeltImage';
import DateField from '../components/DateField';
import ExamRulesModal from '../components/ExamRulesModal';
import PushSettingsPanel from '../components/PushSettingsPanel';
import LanguagePicker from '../components/LanguagePicker';
import ScreenHeader from '../components/redesign/ScreenHeader';
import { useRedesignShell } from '../components/redesign/ShellContext';
import type { FirestoreEntity } from '../services/firebase/data';
import type { AttendanceRecord, GraduationRecord, UserRecord } from '../services/firebase/models';
import type { User } from '../types';
import { SUPPORTED_LANGUAGES, t, getLocale, useI18n } from '../i18n';
import './redesign/profile.css';

interface ProfileViewProps {
  user: User;
  progressionRules?: ProgressionRules | null;
  profile: FirestoreEntity<UserRecord>;
  totalClasses: number;
  commitment?: CommitmentResult | null;
  academyName?: string;
  attendanceRate: number;
  attendances: Array<FirestoreEntity<AttendanceRecord>>;
  classNameById: Map<string, string>;
  classStartById: Map<string, Date>;
  graduations: Array<FirestoreEntity<GraduationRecord>>;
  isDarkMode: boolean;
  onSetThemeMode: (mode: 'light' | 'dark') => void;
  onSaveProfile: (payload: {
    firstName?: string;
    lastName?: string;
    cpf?: string;
    phone?: string;
    birthDate?: string;
    isCompetitor?: boolean;
    photoFile?: File | null;
  }) => Promise<void>;
  onSaveBeltGrade?: (payload: { belt: string; grade: number; stripes: number; attendanceCountBonus: number; blackBeltDate?: string; blackBeltDegreeManual?: number | null }) => Promise<void>;
  onChangeEmail: (nextEmail: string, currentPassword: string) => Promise<void>;
  onDeleteAccount?: (currentPassword: string) => Promise<void>;
  onOpenNotifications?: () => void;
  onLogout: () => void | Promise<void>;
  /** Troca de visao do superadmin. Chega undefined para os demais papeis. */
  superadminViewMode?: 'superadmin' | 'professor' | null;
  onSetSuperadminViewMode?: (mode: 'superadmin' | 'professor') => void;
  superadminAcademyCount?: number;
  studentMemberships?: string[];
  availableAcademiesForRequest?: Array<{ id: string; name: string }>;
  onRequestAcademyChange?: () => void;
  onRequestAdditionalAcademy?: (academyId: string) => Promise<void>;
}

// Linhas que abrem um painel embaixo (o resto navega ou abre modal).
type ProfileSection =
  | 'dados-pessoais'
  | 'faixa-grau'
  | 'acesso-email'
  | 'aparencia'
  | 'idioma'
  | 'notificacoes'
  | 'historicos'
  | 'historico-aulas'
  | 'conquistas'
  | 'excluir-conta';

function roleLabel(role: UserRecord['role']) {
  switch (role) {
    case 'admin':
      return t('Professor');
    case 'professor':
      return t('Instrutor');
    case 'superadmin':
      return t('Superadmin');
    default:
      return t('Aluno');
  }
}

// ISO/qualquer data -> yyyy-mm-dd para <input type="date">; '' se vazio/invalido.
function isoToInputDate(value?: string | null): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return '';
  return parsed.toISOString().slice(0, 10);
}

const ProfileView: React.FC<ProfileViewProps> = ({
  user,
  progressionRules,
  profile,
  totalClasses,
  commitment = null,
  academyName,
  attendanceRate,
  attendances,
  classNameById,
  classStartById,
  graduations,
  isDarkMode,
  onSetThemeMode,
  onSaveProfile,
  onSaveBeltGrade,
  onChangeEmail,
  onDeleteAccount,
  onOpenNotifications,
  onLogout,
  superadminViewMode,
  onSetSuperadminViewMode,
  superadminAcademyCount,
  studentMemberships,
  availableAcademiesForRequest,
  onRequestAcademyChange,
  onRequestAdditionalAcademy,
}) => {
  const shell = useRedesignShell();
  const { language } = useI18n();
  const [firstName, setFirstName] = useState(profile.firstName);
  const [lastName, setLastName] = useState(profile.lastName);
  const [cpf, setCpf] = useState(profile.cpf);
  const [phone, setPhone] = useState(profile.phone || '');
  const [birthDate, setBirthDate] = useState(profile.birthDate || '');
  const [isCompetitor, setIsCompetitor] = useState(profile.isCompetitor ?? false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const staffPhotoInputRef = useRef<HTMLInputElement>(null);
  const [staffPhotoBusy, setStaffPhotoBusy] = useState(false);
  const [staffPhotoFeedback, setStaffPhotoFeedback] = useState('');
  const [staffPhotoError, setStaffPhotoError] = useState('');
  const [staffBelt, setStaffBelt] = useState(profile.belt);
  const [staffStripes, setStaffStripes] = useState(profile.stripes);
  const [staffAttendanceCountBonus, setStaffAttendanceCountBonus] = useState(profile.attendanceCountBonus ?? 0);
  // Faixa preta: data da preta + override manual do grau (grau por tempo IBJJF).
  const [staffBlackBeltDate, setStaffBlackBeltDate] = useState(
    isoToInputDate(user.lastGraduationDateOverride ?? user.lastGraduation),
  );
  const [staffBlackBeltManual, setStaffBlackBeltManual] = useState(
    user.blackBeltDegreeManual == null ? '' : String(user.blackBeltDegreeManual),
  );
  const [beltGradeBusy, setBeltGradeBusy] = useState(false);
  const [beltGradeFeedback, setBeltGradeFeedback] = useState('');
  const [beltGradeError, setBeltGradeError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [newEmail, setNewEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailFeedback, setEmailFeedback] = useState('');
  const [emailError, setEmailError] = useState('');
  const [requestAcademyOpen, setRequestAcademyOpen] = useState(false);
  const [requestAcademyId, setRequestAcademyId] = useState('');
  const [requestAcademyBusy, setRequestAcademyBusy] = useState(false);
  const [requestAcademyFeedback, setRequestAcademyFeedback] = useState('');
  const [requestAcademyError, setRequestAcademyError] = useState('');

  const hasMultipleMemberships = (studentMemberships?.length ?? 0) > 1;
  const canRequestAdditionalAcademy =
    profile.role === 'student' && Boolean(onRequestAdditionalAcademy) && (availableAcademiesForRequest?.length ?? 0) > 0;

  async function handleSubmitAdditionalAcademy() {
    if (!onRequestAdditionalAcademy || !requestAcademyId) {
      return;
    }
    setRequestAcademyBusy(true);
    setRequestAcademyError('');
    setRequestAcademyFeedback('');
    try {
      await onRequestAdditionalAcademy(requestAcademyId);
      setRequestAcademyFeedback(t('Solicitação enviada. Aguarde a aprovação do professor da unidade.'));
      setRequestAcademyId('');
      setRequestAcademyOpen(false);
    } catch (err) {
      setRequestAcademyError(err instanceof Error ? err.message : t('Não foi possível enviar a solicitação.'));
    } finally {
      setRequestAcademyBusy(false);
    }
  }

  const sortedAttendances = useMemo(
    () => [...attendances].sort((left, right) => {
      const leftMs = resolveAttendanceDate(left, classStartById.get(left.classId))?.getTime() ?? 0;
      const rightMs = resolveAttendanceDate(right, classStartById.get(right.classId))?.getTime() ?? 0;
      return rightMs - leftMs;
    }),
    [attendances, classStartById],
  );
  const recentAttendances = useMemo(() => sortedAttendances.slice(0, 6), [sortedAttendances]);
  const progression = useMemo(
    () => getUserProgressionSummary(user, progressionRules),
    [progressionRules, user],
  );
  // Faixa preta: grau por tempo (padrão IBJJF) + override manual, calculado a partir da data da preta.
  const blackBeltProgress = useMemo(
    () => getBlackBeltProgressForUser(user),
    [user.belt, user.lastGraduation, user.blackBeltDegreeManual],
  );
  // Editor rápido de faixa/grau do próprio staff: preta usa data + override manual (opcional).
  const staffBeltIsBlack = isBlackBelt(staffBelt);
  const staffBlackBeltManualDegree = staffBlackBeltManual.trim() === ''
    ? null
    : Math.max(0, Math.min(9, Math.floor(Number(staffBlackBeltManual) || 0)));
  const staffAutoBlackDegree = staffBeltIsBlack ? (getBlackBeltProgress(staffBlackBeltDate)?.degree ?? 0) : 0;
  const staffBlackBeltPreview = staffBeltIsBlack
    ? getBlackBeltProgress(staffBlackBeltDate, undefined, staffBlackBeltManualDegree)
    : null;
  const stripeTotal = progression.stripeTotal;
  const beltTotal = progression.beltTotal;
  const stripeProgress = progression.stripeProgress;
  const beltProgress = progression.beltProgress;
  const nextStripeRemaining = progression.stripeRemaining ?? 0;
  const nextBeltRemaining = progression.beltRemaining ?? 0;
  const canEditProfile = profile.role === 'student';
  const isStaffMobileProfile = profile.role !== 'student';
  const currentThemeLabel = isDarkMode ? t('Escuro') : t('Claro');
  const isNextBeltMilestone = progression.stripeRemaining === null;
  const nextMilestoneCurrent = isNextBeltMilestone ? beltProgress : stripeProgress;
  const nextMilestoneRemaining = isNextBeltMilestone ? nextBeltRemaining : nextStripeRemaining;
  const nextMilestoneGoal = Math.max(nextMilestoneCurrent + nextMilestoneRemaining, 1);
  const nextMilestonePercent = Math.round((nextMilestoneCurrent / nextMilestoneGoal) * 100);
  const nextMilestoneLabel = isNextBeltMilestone
    ? t('Próxima faixa - {belt}', { belt: beltLabel(user.belt) })
    : t('{stripe}o Grau - Faixa {belt}', { stripe: user.stripes + 1, belt: beltLabel(user.belt) });
  const currentGradeLabel = blackBeltProgress
    ? (blackBeltProgress.degreeLabel || t('Faixa lisa'))
    : user.stripes > 0 ? t('{stripe}o Grau', { stripe: user.stripes }) : t('0 Grau');
  const [openSection, setOpenSection] = useState<ProfileSection | null>(null);
  const [examRulesOpen, setExamRulesOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmChecked, setDeleteConfirmChecked] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  useEffect(() => {
    setFirstName(profile.firstName);
    setLastName(profile.lastName);
    setCpf(profile.cpf);
    setPhone(profile.phone || '');
    setBirthDate(profile.birthDate || '');
    setIsCompetitor(profile.isCompetitor ?? false);
    setNewEmail(profile.email);
    setStaffBelt(profile.belt);
    setStaffStripes(profile.stripes);
    setStaffAttendanceCountBonus(profile.attendanceCountBonus ?? 0);
    setStaffBlackBeltDate(isoToInputDate(user.lastGraduationDateOverride ?? user.lastGraduation));
    setStaffBlackBeltManual(user.blackBeltDegreeManual == null ? '' : String(user.blackBeltDegreeManual));
  }, [profile.attendanceCountBonus, profile.belt, profile.birthDate, profile.cpf, profile.email, profile.firstName, profile.isCompetitor, profile.lastName, profile.phone, profile.stripes, user.blackBeltDegreeManual, user.lastGraduation, user.lastGraduationDateOverride]);

  async function handleBeltGradeSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBeltGradeBusy(true);
    setBeltGradeFeedback('');
    setBeltGradeError('');
    try {
      const effectiveGrade = staffBeltIsBlack ? (staffBlackBeltPreview?.degree ?? 0) : staffStripes;
      await onSaveBeltGrade!({
        belt: staffBelt,
        grade: effectiveGrade,
        stripes: effectiveGrade,
        attendanceCountBonus: staffAttendanceCountBonus,
        blackBeltDate: staffBeltIsBlack ? (staffBlackBeltDate || undefined) : undefined,
        blackBeltDegreeManual: staffBeltIsBlack ? staffBlackBeltManualDegree : undefined,
      });
      setBeltGradeFeedback(t('Faixa e grau atualizados com sucesso.'));
    } catch (err) {
      setBeltGradeError(err instanceof Error ? err.message : t('Não foi possível salvar.'));
    } finally {
      setBeltGradeBusy(false);
    }
  }

  async function handleStaffSettingsSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFeedback('');
    setError('');
    try {
      await onSaveProfile({ phone });
      setFeedback(t('Dados atualizados com sucesso.'));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('Não foi possível salvar.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleStaffPhotoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) return;
    setStaffPhotoBusy(true);
    setStaffPhotoFeedback('');
    setStaffPhotoError('');
    try {
      await onSaveProfile({ photoFile: file });
      setStaffPhotoFeedback(t('Foto atualizada com sucesso.'));
    } catch (err) {
      setStaffPhotoError(err instanceof Error ? err.message : t('Não foi possível salvar a foto.'));
    } finally {
      setStaffPhotoBusy(false);
      event.target.value = '';
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFeedback('');
    setError('');

    try {
      await onSaveProfile({
        firstName,
        lastName,
        cpf,
        phone,
        birthDate,
        isCompetitor,
        photoFile,
      });
      setPhotoFile(null);
      setFeedback(t('Perfil atualizado com sucesso.'));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('Não foi possível salvar o perfil.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailBusy(true);
    setEmailFeedback('');
    setEmailError('');

    try {
      await onChangeEmail(newEmail, currentPassword);
      setCurrentPassword('');
      setEmailFeedback(t('E-mail atualizado com sucesso.'));
    } catch (submitError) {
      setEmailError(submitError instanceof Error ? submitError.message : t('Não foi possível atualizar o e-mail.'));
    } finally {
      setEmailBusy(false);
    }
  }

  async function handleDeleteSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onDeleteAccount) {
      return;
    }
    setDeleteBusy(true);
    setDeleteError('');

    try {
      await onDeleteAccount(deletePassword);
      // Em caso de sucesso a sessão é encerrada e o app volta ao login; nada mais a fazer aqui.
    } catch (submitError) {
      setDeleteError(submitError instanceof Error ? submitError.message : t('Não foi possível excluir a conta.'));
      setDeleteBusy(false);
    }
  }

  const toggleSection = (id: ProfileSection) => {
    setOpenSection((current) => (current === id ? null : id));
  };

  const beltTitle = blackBeltProgress ? blackBeltProgress.title : t('Faixa {belt}', { belt: beltLabel(user.belt) });
  const avatarInitial = (user.name || '?').trim().charAt(0).toUpperCase() || '?';
  const languageLabel = (SUPPORTED_LANGUAGES.find((entry) => entry.code === language)?.label ?? '').replace(/\s*\(.*\)\s*$/, '');
  const showOwnHeader = shell.role !== 'superadmin';

  // Linha de menu no estilo do redesign (icone, rotulo, valor atual e seta). `children` e o painel
  // que abre embaixo da linha — o mesmo conteudo que o acordeao antigo mostrava.
  const renderRow = (row: {
    id: string;
    icon: React.ReactNode;
    label: string;
    hint?: string;
    value?: string;
    open?: boolean;
    danger?: boolean;
    onClick: () => void;
    children?: React.ReactNode;
  }) => (
    <div key={row.id} className="rd-profile__item">
      <button
        type="button"
        className={`rd-profile__row ${row.danger ? 'is-danger' : ''}`.trim()}
        onClick={row.onClick}
        aria-expanded={row.children !== undefined ? Boolean(row.open) : undefined}
      >
        <span className="rd-profile__row-icon">{row.icon}</span>
        <span className="rd-profile__row-text">
          <span className="rd-profile__row-label">{row.label}</span>
          {row.hint ? <span className="rd-profile__row-hint">{row.hint}</span> : null}
        </span>
        {row.value ? <span className="rd-profile__row-value">{row.value}</span> : null}
        <ChevronRight size={18} className={`rd-profile__row-arrow ${row.open ? 'is-open' : ''}`.trim()} aria-hidden="true" />
      </button>
      {row.open && row.children !== undefined ? <div className="rd-profile__panel">{row.children}</div> : null}
    </div>
  );

  const renderHero = (staff: boolean) => (
    <section className="rd-profile__hero">
      <div className="rd-profile__hero-top">
        <span className="rd-profile__eyebrow">
          {staff ? `LEVEL · ${roleLabel(profile.role)}` : t('LEVEL · Atleta')}
        </span>
        <span className="rd-profile__mark" aria-hidden="true"><i /><i /><i /><i /></span>
      </div>

      <div className="rd-profile__identity">
        {staff ? (
          <>
            <button
              type="button"
              onClick={() => staffPhotoInputRef.current?.click()}
              disabled={staffPhotoBusy}
              className="rd-profile__avatar rd-profile__avatar--button"
              aria-label={t('Trocar foto de perfil')}
            >
              {user.avatar ? <img src={user.avatar} alt="" /> : <span>{avatarInitial}</span>}
              <span className="rd-profile__avatar-cam" aria-hidden="true">
                {staffPhotoBusy ? <span className="rd-profile__spinner" /> : <Camera size={13} />}
              </span>
            </button>
            <input
              ref={staffPhotoInputRef}
              type="file"
              accept="image/*"
              className="rd-profile__file"
              onChange={(e) => void handleStaffPhotoUpload(e)}
              disabled={staffPhotoBusy}
            />
          </>
        ) : (
          <span className="rd-profile__avatar">
            {user.avatar ? <img src={user.avatar} alt="" /> : <span>{avatarInitial}</span>}
          </span>
        )}
        <div className="rd-profile__who">
          <h2 className="rd-profile__name">{user.name}</h2>
          <p className="rd-profile__team">
            {academyName || (staff ? 'LEVEL' : t('Academia ativa'))} • {roleLabel(profile.role)}
          </p>
        </div>
      </div>

      <BeltImage
        belt={user.belt}
        stripes={user.stripes}
        blackBelt={blackBeltProgress}
        className="rd-profile__belt"
        alt={beltTitle}
      />

      <div className="rd-profile__chips">
        <span className="rd-profile__chip is-yellow">{beltTitle}</span>
        <span className="rd-profile__chip">
          {staff
            ? currentGradeLabel
            : (blackBeltProgress ? (blackBeltProgress.degreeLabel || t('Faixa lisa')) : t('{count} graus', { count: user.stripes }))}
        </span>
        <span className="rd-profile__chip">{t(user.type)}</span>
        {!staff && profile.isCompetitor ? <span className="rd-profile__chip is-outline">{t('Competidor')}</span> : null}
      </div>

      {staffPhotoFeedback ? <p className="rd-profile__hero-note is-ok">{staffPhotoFeedback}</p> : null}
      {staffPhotoError ? <p className="rd-profile__hero-note is-error">{staffPhotoError}</p> : null}
    </section>
  );

  // Comprometimento: a cor vem da escala (commitmentScale), igual ao resto do app.
  const renderCommitment = () => (commitment ? (
    <section className={`rd-profile__card rd-profile__commit commitment ${commitmentLevelClass(commitment.level)}`}>
      <p className="rd-profile__label">{t('Comprometimento')}</p>
      <div className="rd-profile__commit-row">
        <p className="rd-profile__commit-score">
          {commitment.score}
          <small>/100</small>
        </p>
        <span className="rd-profile__commit-level">{t(commitment.label)}</span>
      </div>
      <div
        className="rd-profile__commit-track"
        role="meter"
        aria-valuenow={commitment.score}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('Comprometimento: {score} de 100, {level}', { score: commitment.score, level: t(commitment.label).toLocaleLowerCase(getLocale()) })}
      >
        {commitment.score > 0 ? <div className="rd-profile__commit-fill" style={{ width: `${commitment.score}%` }} /> : null}
      </div>
      <p className="rd-profile__commit-note">{commitmentNote(commitment)}</p>
    </section>
  ) : null);

  const renderKpi = (label: string, value: React.ReactNode, note: string, highlight = false) => (
    <article className={`rd-profile__kpi ${highlight ? 'is-yellow' : ''}`.trim()}>
      <p className="rd-profile__kpi-label">{label}</p>
      <p className="rd-profile__kpi-value">{value}</p>
      <p className="rd-profile__kpi-note">{note}</p>
    </article>
  );

  const appearancePanel = (
    <>
      <p className="rd-profile__panel-copy">{t('Tema atual: {theme}.', { theme: currentThemeLabel })}</p>
      <div className="profile-theme-picker">
        <button
          type="button"
          onClick={() => onSetThemeMode('light')}
          className="app-button app-button--small app-button--block app-button--theme-light profile-theme-choice"
          aria-pressed={!isDarkMode}
        >
          <Sun size={16} />
          {t('Claro')}
        </button>
        <button
          type="button"
          onClick={() => onSetThemeMode('dark')}
          className="app-button app-button--small app-button--block app-button--theme-dark profile-theme-choice"
          aria-pressed={isDarkMode}
        >
          <Moon size={16} />
          {t('Escuro')}
        </button>
      </div>
    </>
  );

  const languagePanel = (
    <>
      <p className="rd-profile__panel-copy">{t('Escolha o idioma do aplicativo. A preferência fica salva no seu perfil.')}</p>
      <LanguagePicker userId={profile.id} />
    </>
  );

  const emailForm = (
    <form onSubmit={(e) => void handleEmailSubmit(e)} className="rd-profile__form">
      <p className="rd-profile__panel-title">{t('Alterar e-mail')}</p>
      {emailFeedback ? <div className="app-alert app-alert--success">{emailFeedback}</div> : null}
      {emailError ? <div className="app-alert app-alert--error">{emailError}</div> : null}
      <label className="app-field">
        <span className="app-field__label">{t('Novo e-mail')}</span>
        <input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} className="app-input" required />
      </label>
      <label className="app-field">
        <span className="app-field__label">{t('Senha atual')}</span>
        <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="app-input" required />
      </label>
      <button type="submit" disabled={emailBusy} className="app-button app-button--ghost app-button--block">
        <Mail size={16} />
        {emailBusy ? t('Atualizando e-mail...') : t('Atualizar e-mail')}
      </button>
    </form>
  );

  const graduationList = (limit: number, emptyText: string) => (
    <div className="app-list">
      {graduations.slice(0, limit).map((graduation) => (
        <div key={graduation.id} className="app-list-card">
          <p className="text-sm font-bold">
            {beltLabel(graduation.previousBelt)} {graduation.previousStripes} → {beltLabel(graduation.newBelt)} {graduation.newStripes}
          </p>
          <p className="mt-1 text-xs text-[color:var(--text-soft)]">
            {graduation.promotedAt?.toDate().toLocaleDateString(getLocale())} • {graduation.reason.replaceAll('_', ' ')}
          </p>
        </div>
      ))}
      {graduations.length === 0 ? <div className="app-empty">{emptyText}</div> : null}
    </div>
  );

  const unitRows = [
    hasMultipleMemberships && onRequestAcademyChange
      ? renderRow({
        id: 'trocar-academia',
        icon: <ArrowLeftRight size={18} />,
        label: t('Trocar de academia'),
        onClick: () => onRequestAcademyChange(),
      })
      : null,
    canRequestAdditionalAcademy
      ? renderRow({
        id: 'outra-unidade',
        icon: <Plus size={18} />,
        label: t('Solicitar entrada em outra unidade'),
        open: requestAcademyOpen,
        onClick: () => {
          setRequestAcademyOpen((open) => !open);
          setRequestAcademyError('');
        },
        children: (
          <div className="rd-profile__form">
            <select
              value={requestAcademyId}
              onChange={(event) => setRequestAcademyId(event.target.value)}
              className="app-select"
            >
              <option value="">{t('Selecione a unidade')}</option>
              {availableAcademiesForRequest!.map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.name}</option>
              ))}
            </select>
            <div className="rd-profile__form-actions">
              <button
                type="button"
                onClick={() => void handleSubmitAdditionalAcademy()}
                disabled={!requestAcademyId || requestAcademyBusy}
                className="app-button app-button--gold app-button--block"
              >
                {requestAcademyBusy ? t('Enviando...') : t('Enviar solicitação')}
              </button>
              <button
                type="button"
                onClick={() => { setRequestAcademyOpen(false); setRequestAcademyError(''); }}
                className="app-button app-button--ghost app-button--block"
              >
                {t('Cancelar')}
              </button>
            </div>
          </div>
        ),
      })
      : null,
  ].filter(Boolean);

  const unitGroup = unitRows.length > 0 || requestAcademyFeedback || requestAcademyError ? (
    <section className="rd-profile__group" aria-label={t('Unidade')}>
      <p className="rd-profile__group-title">{t('Unidade')}</p>
      {requestAcademyFeedback ? <div className="app-alert app-alert--success">{requestAcademyFeedback}</div> : null}
      {requestAcademyError ? <div className="app-alert app-alert--error">{requestAcademyError}</div> : null}
      {unitRows.length > 0 ? <div className="rd-profile__list">{unitRows}</div> : null}
    </section>
  ) : null;

  const header = showOwnHeader ? (
    <ScreenHeader
      eyebrow={isStaffMobileProfile ? shell.unitLabel : undefined}
      title={t('Perfil')}
      className={isStaffMobileProfile ? '' : 'rd-profile__header--inline'}
    />
  ) : null;

  if (isStaffMobileProfile) {
    return (
      <div className="view-shell rd-profile">
        {header}
        {renderHero(true)}

        {onSetSuperadminViewMode ? (
          <section className="rd-profile__card">
            <p className="rd-profile__label">{t('Visão atual')}</p>
            <div className="app-vision-switch" role="group" aria-label={t('Trocar visão')}>
              <button
                type="button"
                onClick={() => onSetSuperadminViewMode('superadmin')}
                className={`app-vision-switch__button ${superadminViewMode !== 'professor' ? 'is-active' : ''}`}
                aria-pressed={superadminViewMode !== 'professor'}
                title={t('Visão da rede')}
              >
                <Shield size={13} strokeWidth={2} />
                <span>{t('Rede')}</span>
              </button>
              <button
                type="button"
                onClick={() => onSetSuperadminViewMode('professor')}
                disabled={(superadminAcademyCount ?? 0) === 0}
                className={`app-vision-switch__button ${superadminViewMode === 'professor' ? 'is-active' : ''}`}
                aria-pressed={superadminViewMode === 'professor'}
                title={t('Visão professor')}
              >
                <Building2 size={13} strokeWidth={2} />
                <span>{t('Professor')}</span>
              </button>
            </div>
          </section>
        ) : null}

        {renderCommitment()}

        <section className="rd-profile__kpis">
          {renderKpi(t('Total de aulas'), totalClasses, t('Presenças registradas'))}
          {renderKpi(t('Frequência'), `${attendanceRate}%`, t('No mês atual'))}
        </section>

        <section className="rd-profile__card rd-profile__progress">
          <p className="rd-profile__label">{isNextBeltMilestone ? t('Próxima faixa') : t('Próximo grau')}</p>
          <h3 className="rd-profile__progress-title">{nextMilestoneLabel}</h3>
          <p className="rd-profile__progress-copy">
            {nextMilestoneRemaining > 0 ? t('{count} aulas restantes para elegibilidade', { count: nextMilestoneRemaining }) : t('Progressão manual ou meta atingida')}
          </p>
          <div className="lv-progress rd-profile__progress-bar" role="progressbar" aria-valuenow={nextMilestonePercent} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${Math.min(100, Math.max(0, nextMilestonePercent))}%` }} />
          </div>
          <p className="rd-profile__progress-caption">{t('{percent}% do objetivo', { percent: nextMilestonePercent })}</p>
          <p className="rd-profile__progress-caption">
            {progression.classesPerStripe > 0
              ? (progression.beltTotal > 0
                ? t('Regra da faixa: {perStripe} aulas por grau / {beltTotal} aulas para a próxima faixa.', { perStripe: progression.classesPerStripe, beltTotal: progression.beltTotal })
                : t('Regra da faixa: {perStripe} aulas por grau.', { perStripe: progression.classesPerStripe }))
              : t('Regra da faixa: progressão manual.')}
          </p>
        </section>

        <section className="rd-profile__group" aria-label={t('Conta')}>
          <p className="rd-profile__group-title">{t('Conta')}</p>
          <div className="rd-profile__list">
            {renderRow({
              id: 'dados-pessoais',
              icon: <UserRound size={18} />,
              label: t('Dados pessoais'),
              open: openSection === 'dados-pessoais',
              onClick: () => toggleSection('dados-pessoais'),
              children: (
                <form onSubmit={(e) => void handleStaffSettingsSubmit(e)} className="rd-profile__form">
                  {feedback ? <div className="app-alert app-alert--success">{feedback}</div> : null}
                  {error ? <div className="app-alert app-alert--error">{error}</div> : null}
                  <div className="app-list">
                    <div className="app-list-card">
                      <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">{t('Função')}</p>
                      <p className="mt-1 text-sm font-bold">{roleLabel(profile.role)}</p>
                    </div>
                    <div className="app-list-card">
                      <div className="flex items-center gap-2 text-sm font-bold">
                        <Mail size={16} className="text-[color:var(--gold-mid)]" />
                        {user.email}
                      </div>
                    </div>
                  </div>
                  <label className="app-field">
                    <span className="app-field__label">{t('Telefone')}</span>
                    <input value={phone} onChange={(e) => setPhone(e.target.value)} className="app-input" placeholder="+55 11 99999-9999" />
                  </label>
                  <button type="submit" disabled={busy} className="app-button app-button--gold app-button--block app-button--small">
                    <Save size={14} />
                    {busy ? t('Salvando...') : t('Salvar telefone')}
                  </button>
                </form>
              ),
            })}

            {onSaveBeltGrade ? renderRow({
              id: 'faixa-grau',
              icon: <Award size={18} />,
              label: t('Faixa e Grau'),
              open: openSection === 'faixa-grau',
              onClick: () => toggleSection('faixa-grau'),
              children: (
                <form onSubmit={(e) => void handleBeltGradeSubmit(e)} className="rd-profile__form">
                  {beltGradeFeedback ? <div className="app-alert app-alert--success">{beltGradeFeedback}</div> : null}
                  {beltGradeError ? <div className="app-alert app-alert--error">{beltGradeError}</div> : null}
                  <label className="app-field">
                    <span className="app-field__label">{t('Faixa')}</span>
                    <select value={staffBelt} onChange={(e) => setStaffBelt(e.target.value)} className="app-select">
                      {ADULT_BELTS.map((b) => (
                        <option key={b} value={b}>{beltLabel(b)}</option>
                      ))}
                    </select>
                  </label>
                  {staffBeltIsBlack ? (
                    <>
                      <label className="app-field">
                        <span className="app-field__label">{t('Data da faixa preta')}</span>
                        <DateField value={staffBlackBeltDate} onChange={setStaffBlackBeltDate} />
                        <span className="app-field__hint">
                          {staffBlackBeltPreview
                            ? `${staffBlackBeltPreview.label} · ${staffBlackBeltPreview.years === 1 ? t('1 ano de faixa preta') : t('{years} anos de faixa preta', { years: staffBlackBeltPreview.years })}${staffBlackBeltPreview.styleNote ? ` (${staffBlackBeltPreview.styleNote})` : ''}.`
                            : t('Informe a data em que recebeu a preta para calcular o grau por tempo (IBJJF).')}
                        </span>
                      </label>
                      <label className="app-field">
                        <span className="app-field__label">{t('Grau manual (opcional)')}</span>
                        <input
                          type="number"
                          min={0}
                          max={9}
                          value={staffBlackBeltManual}
                          onChange={(e) => setStaffBlackBeltManual(
                            e.target.value === '' ? '' : String(Math.max(0, Math.min(9, Math.floor(Number(e.target.value) || 0)))),
                          )}
                          className="app-input"
                          placeholder={t('Automático ({degree}º)', { degree: staffAutoBlackDegree })}
                        />
                        <span className="app-field__hint">{t('Deixe vazio para usar o grau automático pela data. Preencha só para ajustar manualmente.')}</span>
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="app-field">
                        <span className="app-field__label">{t('Grau')}</span>
                        <select value={staffStripes} onChange={(e) => setStaffStripes(Number(e.target.value))} className="app-select">
                          {[1, 2, 3, 4, 5, 6].map((g) => (
                            <option key={g} value={g}>{t('{degree}º grau', { degree: g })}</option>
                          ))}
                        </select>
                      </label>
                      <label className="app-field">
                        <span className="app-field__label">{t('Aulas bônus')}</span>
                        <input
                          type="number"
                          min="0"
                          value={staffAttendanceCountBonus}
                          onChange={(e) => setStaffAttendanceCountBonus(Math.max(0, Number(e.target.value)))}
                          className="app-input"
                        />
                      </label>
                    </>
                  )}
                  <button type="submit" disabled={beltGradeBusy} className="app-button app-button--gold app-button--block app-button--small">
                    <Save size={14} />
                    {beltGradeBusy ? t('Salvando...') : t('Salvar faixa e grau')}
                  </button>
                </form>
              ),
            }) : null}

            {renderRow({
              id: 'acesso-email',
              icon: <ShieldCheck size={18} />,
              label: t('Acesso conta email'),
              open: openSection === 'acesso-email',
              onClick: () => toggleSection('acesso-email'),
              children: emailForm,
            })}

            {renderRow({
              id: 'aparencia',
              icon: isDarkMode ? <Moon size={18} /> : <Sun size={18} />,
              label: t('Aparência'),
              value: currentThemeLabel,
              open: openSection === 'aparencia',
              onClick: () => toggleSection('aparencia'),
              children: appearancePanel,
            })}

            {renderRow({
              id: 'idioma',
              icon: <Languages size={18} />,
              label: t('Idioma'),
              value: languageLabel,
              open: openSection === 'idioma',
              onClick: () => toggleSection('idioma'),
              children: languagePanel,
            })}

            {renderRow({
              id: 'notificacoes',
              icon: <BellRing size={18} />,
              label: t('Notificações neste aparelho'),
              open: openSection === 'notificacoes',
              onClick: () => toggleSection('notificacoes'),
              children: <PushSettingsPanel />,
            })}
          </div>
        </section>

        <section className="rd-profile__group" aria-label={t('Treino')}>
          <p className="rd-profile__group-title">{t('Treino')}</p>
          <div className="rd-profile__list">
            {renderRow({
              id: 'avisos',
              icon: <Bell size={18} />,
              label: t('Notificações'),
              onClick: () => onOpenNotifications?.(),
            })}

            {renderRow({
              id: 'regras-exame',
              icon: <ScrollText size={18} />,
              label: t('Regras de exame'),
              onClick: () => setExamRulesOpen(true),
            })}

            {renderRow({
              id: 'historico-aulas',
              icon: <History size={18} />,
              label: t('Histórico de aulas'),
              open: openSection === 'historico-aulas',
              onClick: () => toggleSection('historico-aulas'),
              children: (
                <div className="app-list">
                  {sortedAttendances.slice(0, 8).map((attendance) => (
                    <div key={attendance.id} className="app-list-card">
                      <p className="text-sm font-bold">{classNameById.get(attendance.classId) || t('Aula da academia')}</p>
                      <p className="mt-1 text-xs text-[color:var(--text-soft)]">
                        {resolveAttendanceDate(attendance, classStartById.get(attendance.classId))?.toLocaleString(getLocale()) ?? t('Sem data')} • {attendance.checkInMethod}
                      </p>
                    </div>
                  ))}
                  {attendances.length === 0 ? <div className="app-empty">{t('Nenhuma presença registrada.')}</div> : null}
                </div>
              ),
            })}

            {renderRow({
              id: 'conquistas',
              icon: <Medal size={18} />,
              label: t('Conquistas'),
              open: openSection === 'conquistas',
              onClick: () => toggleSection('conquistas'),
              children: graduationList(8, t('Nenhuma graduação registrada.')),
            })}
          </div>
        </section>

        {unitGroup}

        <div className="rd-profile__footer">
          <button type="button" onClick={() => void onLogout()} className="rd-profile__logout">
            <LogOut size={18} />
            {t('Sair da conta')}
          </button>
        </div>

        {examRulesOpen ? (
          <ExamRulesModal currentBelt={user.belt} onClose={() => setExamRulesOpen(false)} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="view-shell rd-profile">
      {header}
      {renderHero(false)}
      {renderCommitment()}

      <section className="rd-profile__kpis">
        {renderKpi(t('Total de aulas'), totalClasses, t('Presenças registradas'))}
        {renderKpi(t('Frequência'), `${attendanceRate}%`, t('No mês atual'))}
        {renderKpi(t('Próximo grau'), progression.stripeCycleRemaining ?? 0, t('Aulas restantes'), true)}
        {renderKpi(t('Próxima faixa'), nextBeltRemaining, t('Aulas para elegibilidade'))}
      </section>

      <section className="rd-profile__group" aria-label={t('Conta')}>
        <p className="rd-profile__group-title">{t('Conta')}</p>
        <div className="rd-profile__list">
          {renderRow({
            id: 'dados-pessoais',
            icon: <UserRound size={18} />,
            label: t('Dados pessoais'),
            open: openSection === 'dados-pessoais',
            onClick: () => toggleSection('dados-pessoais'),
            children: canEditProfile ? (
              <form onSubmit={handleSubmit} className="rd-profile__form app-form-grid">
                {feedback ? <div className="app-alert app-alert--success">{feedback}</div> : null}
                {error ? <div className="app-alert app-alert--error">{error}</div> : null}

                <label className="app-field">
                  <span className="app-field__label">{t('Nome')}</span>
                  <input value={firstName} onChange={(event) => setFirstName(event.target.value)} className="app-input" required />
                </label>

                <label className="app-field">
                  <span className="app-field__label">{t('Sobrenome')}</span>
                  <input value={lastName} onChange={(event) => setLastName(event.target.value)} className="app-input" required />
                </label>

                <label className="app-field">
                  <span className="app-field__label">CPF</span>
                  <input value={cpf} onChange={(event) => setCpf(event.target.value)} className="app-input" required />
                </label>

                <label className="app-field">
                  <span className="app-field__label">{t('Telefone')}</span>
                  <input value={phone} onChange={(event) => setPhone(event.target.value)} className="app-input" />
                </label>

                <label className="app-field">
                  <span className="app-field__label">{t('Nascimento')}</span>
                  <DateField value={birthDate} onChange={setBirthDate} required />
                </label>

                <label className="app-field">
                  <span className="app-field__label">{t('Competidor')}</span>
                  <select value={isCompetitor ? 'yes' : 'no'} onChange={(event) => setIsCompetitor(event.target.value === 'yes')} className="app-select">
                    <option value="no">{t('Não')}</option>
                    <option value="yes">{t('Sim')}</option>
                  </select>
                </label>

                <label className="app-field md:col-span-2">
                  <span className="app-field__label">{t('Foto')}</span>
                  <input type="file" accept="image/*" onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)} className="app-input" />
                </label>

                <button type="submit" disabled={busy} className="app-button app-button--gold app-button--block md:col-span-2">
                  <Save size={16} />
                  {busy ? t('Salvando...') : t('Salvar perfil')}
                </button>
              </form>
            ) : (
              <div className="app-list">
                <div className="app-list-card">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">{t('Função')}</p>
                  <p className="mt-1 text-sm font-bold">{roleLabel(profile.role)}</p>
                </div>
                <div className="app-list-card">
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <Mail size={16} className="text-[color:var(--gold-mid)]" />
                    {user.email}
                  </div>
                </div>
                <div className="app-list-card">
                  <div className="flex items-center gap-2 text-sm font-bold">
                    <Phone size={16} className="text-[color:var(--gold-mid)]" />
                    {profile.phone || t('Telefone não informado')}
                  </div>
                </div>
              </div>
            ),
          })}

          {renderRow({
            id: 'acesso-email',
            icon: <ShieldCheck size={18} />,
            label: t('Acesso conta email'),
            open: openSection === 'acesso-email',
            onClick: () => toggleSection('acesso-email'),
            children: (
              <>
                <div className="app-list">
                  <div className="app-list-card">
                    <p className="text-sm font-bold">{t('Permissões')}</p>
                    <p className="mt-1 text-xs text-[color:var(--text-soft)]">{t('Perfil atual: {role}', { role: roleLabel(profile.role) })}</p>
                  </div>
                  <div className="app-list-card">
                    <p className="text-sm font-bold">{t('Academia')}</p>
                    <p className="mt-1 text-xs text-[color:var(--text-soft)]">{academyName || t('Sem academia vinculada')}</p>
                  </div>
                  <div className="app-list-card">
                    <p className="text-sm font-bold">{t('Faixa e grau')}</p>
                    <p className="mt-1 text-xs text-[color:var(--text-soft)]">{t('Alteração feita apenas por professor ou superadmin.')}</p>
                  </div>
                </div>
                {canEditProfile ? emailForm : null}
              </>
            ),
          })}

          {renderRow({
            id: 'aparencia',
            icon: isDarkMode ? <Moon size={18} /> : <Sun size={18} />,
            label: t('Aparência'),
            value: currentThemeLabel,
            open: openSection === 'aparencia',
            onClick: () => toggleSection('aparencia'),
            children: appearancePanel,
          })}

          {renderRow({
            id: 'idioma',
            icon: <Languages size={18} />,
            label: t('Idioma'),
            value: languageLabel,
            open: openSection === 'idioma',
            onClick: () => toggleSection('idioma'),
            children: languagePanel,
          })}

          {renderRow({
            id: 'notificacoes',
            icon: <Bell size={18} />,
            label: t('Notificações neste aparelho'),
            open: openSection === 'notificacoes',
            onClick: () => toggleSection('notificacoes'),
            children: <PushSettingsPanel />,
          })}
        </div>
      </section>

      <section className="rd-profile__group" aria-label={t('Treino')}>
        <p className="rd-profile__group-title">{t('Treino')}</p>
        <div className="rd-profile__list">
          {renderRow({
            id: 'historicos',
            icon: <History size={18} />,
            label: t('Históricos'),
            hint: t('Presenças recentes e graduações'),
            open: openSection === 'historicos',
            onClick: () => toggleSection('historicos'),
            children: (
              <>
                <p className="rd-profile__panel-title">{t('Presenças recentes')}</p>
                <div className="app-list">
                  {recentAttendances.map((attendance) => (
                    <div key={attendance.id} className="app-list-card">
                      <p className="text-sm font-bold">{classNameById.get(attendance.classId) || t('Aula da academia')}</p>
                      <p className="mt-1 text-xs text-[color:var(--text-soft)]">
                        {resolveAttendanceDate(attendance, classStartById.get(attendance.classId))?.toLocaleString(getLocale()) ?? t('Sem data')} • {t('método {method}', { method: attendance.checkInMethod })}
                      </p>
                      {attendance.countsAsAttendance === false ? (
                        <span className="app-badge app-badge--muted mt-2 inline-flex">
                          {nonCountingReasonLabel(attendance.nonCountingReason)
                            ? `${t('Não computada')} · ${nonCountingReasonLabel(attendance.nonCountingReason)}`
                            : t('Não computada')}
                        </span>
                      ) : null}
                    </div>
                  ))}
                  {recentAttendances.length === 0 ? (
                    <div className="app-empty">{t('Ainda não há presenças registradas neste perfil.')}</div>
                  ) : null}
                </div>

                <p className="rd-profile__panel-title">{t('Graduações')}</p>
                {graduationList(5, t('Ainda não há graduações registradas para este perfil.'))}
              </>
            ),
          })}

          {renderRow({
            id: 'regras-exame',
            icon: <ScrollText size={18} />,
            label: t('Regras de exame'),
            onClick: () => setExamRulesOpen(true),
          })}
        </div>
      </section>

      {unitGroup}

      <div className="rd-profile__footer">
        <button type="button" onClick={() => void onLogout()} className="rd-profile__logout">
          <LogOut size={18} />
          {t('Sair da conta')}
        </button>

        {/* Zona de perigo — excluir conta (apenas alunos) */}
        {onDeleteAccount ? (
          <>
            <button
              type="button"
              className="rd-profile__delete-link"
              onClick={() => {
                toggleSection('excluir-conta');
                setDeleteError('');
              }}
              aria-expanded={openSection === 'excluir-conta'}
            >
              <Trash2 size={16} />
              {t('Excluir minha conta')}
            </button>

            {openSection === 'excluir-conta' ? (
              <div className="rd-profile__card rd-profile__delete">
                <div className="app-alert app-alert--warning">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold">{t('Esta ação é permanente e não pode ser desfeita.')}</p>
                      <p className="mt-1 text-xs">
                        {t('Sua conta, perfil, foto, vídeos enviados e progresso serão excluídos. Registros financeiros e históricos exigidos por lei são mantidos de forma anonimizada. Saiba mais em')}{' '}
                        <a href="/exclusao-de-conta/" target="_blank" rel="noopener noreferrer">{t('exclusão de conta')}</a>.
                      </p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleDeleteSubmit} className="rd-profile__form">
                  {deleteError ? <div className="app-alert app-alert--error">{deleteError}</div> : null}

                  <label className="app-field">
                    <span className="app-field__label">{t('Confirme sua senha')}</span>
                    <input
                      type="password"
                      value={deletePassword}
                      onChange={(event) => setDeletePassword(event.target.value)}
                      className="app-input"
                      autoComplete="current-password"
                      required
                    />
                  </label>

                  <label className="flex items-start gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={deleteConfirmChecked}
                      onChange={(event) => setDeleteConfirmChecked(event.target.checked)}
                      className="mt-0.5"
                    />
                    <span>{t('Entendo que minha conta e meus dados pessoais serão excluídos permanentemente.')}</span>
                  </label>

                  <button
                    type="submit"
                    disabled={deleteBusy || !deleteConfirmChecked || deletePassword.length === 0}
                    className="app-button app-button--solid-danger app-button--block"
                  >
                    <Trash2 size={16} />
                    {deleteBusy ? t('Excluindo conta...') : t('Excluir minha conta permanentemente')}
                  </button>
                </form>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {examRulesOpen ? (
        <ExamRulesModal currentBelt={user.belt} onClose={() => setExamRulesOpen(false)} />
      ) : null}
    </div>
  );
};

export default ProfileView;
