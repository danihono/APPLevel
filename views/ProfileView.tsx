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
import { CommitmentBar } from '../components/CommitmentBar';
import type { CommitmentResult } from '../commitmentScale';
import { nonCountingReasonLabel } from '../classRules';
import {
  AlertTriangle,
  Award,
  Bell,
  Building2,
  Camera,
  ChevronRight,
  History,
  Languages,
  LogOut,
  Mail,
  Moon,
  Phone,
  Save,
  ScrollText,
  Settings2,
  Shield,
  ShieldCheck,
  Sun,
  Trash2,
  UserRound,
} from 'lucide-react';
import AvatarWithBelt from '../components/AvatarWithBelt';
import DateField from '../components/DateField';
import ExamRulesModal from '../components/ExamRulesModal';
import LanguagePicker from '../components/LanguagePicker';
import ProgressBar from '../components/ProgressBar';
import type { FirestoreEntity } from '../services/firebase/data';
import type { AttendanceRecord, GraduationRecord, UserRecord } from '../services/firebase/models';
import type { User } from '../types';
import { t, getLocale } from '../i18n';

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
  const [activeSection, setActiveSection] = useState<'settings' | 'history' | 'achievements' | null>(null);
  const [activeStudentSection, setActiveStudentSection] = useState<'dados-pessoais' | 'acesso-email' | 'aparencia' | 'idioma' | 'historicos' | 'excluir-conta' | null>(null);
  const [examRulesOpen, setExamRulesOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmChecked, setDeleteConfirmChecked] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const staffMenuItems = [
    { id: 'settings' as const, icon: Settings2, label: t('Configurações da conta') },
    { id: 'notifications' as const, icon: Bell, label: t('Notificações') },
    { id: 'exam-rules' as const, icon: ScrollText, label: t('Regras de exame') },
    { id: 'history' as const, icon: History, label: t('Histórico de aulas') },
    { id: 'achievements' as const, icon: Award, label: t('Conquistas') },
  ];

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

  if (isStaffMobileProfile) {
    return (
      <div className="view-shell profile-mobile">
        <section className="profile-mobile__hero">
          <div className="relative inline-block">
            <button
              type="button"
              onClick={() => staffPhotoInputRef.current?.click()}
              disabled={staffPhotoBusy}
              className="block focus:outline-none"
              aria-label={t('Trocar foto de perfil')}
            >
              <AvatarWithBelt
                avatar={user.avatar}
                name={user.name}
                belt={user.belt}
                stripes={user.stripes}
                size="lg"
                blackBelt={blackBeltProgress}
              />
              <span className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-[color:var(--gold-mid)] text-black shadow-md pointer-events-none">
                {staffPhotoBusy ? (
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-black border-t-transparent" />
                ) : (
                  <Camera size={14} />
                )}
              </span>
            </button>
            <input
              ref={staffPhotoInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => void handleStaffPhotoUpload(e)}
              disabled={staffPhotoBusy}
            />
          </div>

          <div className="profile-mobile__identity">
            <h1 className="profile-mobile__name">{user.name}</h1>
            <p className="profile-mobile__team">{academyName || 'LEVEL'} - {roleLabel(profile.role)}</p>
          </div>

          <div className="profile-mobile__tags">
            <span className="profile-mobile__tag is-gold">{blackBeltProgress ? blackBeltProgress.title : t('Faixa {belt}', { belt: beltLabel(user.belt) })}</span>
            <span className="profile-mobile__tag">{currentGradeLabel}</span>
            <span className="profile-mobile__tag">{t(user.type)}</span>
          </div>

          {staffPhotoFeedback ? <p className="text-xs text-green-400 text-center">{staffPhotoFeedback}</p> : null}
          {staffPhotoError ? <p className="text-xs text-red-400 text-center">{staffPhotoError}</p> : null}
        </section>

        {onSetSuperadminViewMode ? (
          <section className="profile-mobile__progress-card">
            <p className="profile-mobile__section-label">{t('Visão atual')}</p>
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

        <section className="profile-mobile__kpis">
          <article className="profile-mobile__kpi-card">
            <p className="profile-mobile__kpi-label">{t('Total de aulas')}</p>
            <p className="profile-mobile__kpi-value">{totalClasses}</p>
            <p className="profile-mobile__kpi-note">{t('Presenças registradas')}</p>
          </article>

          <article className="profile-mobile__kpi-card">
            <p className="profile-mobile__kpi-label">{t('Frequência')}</p>
            <p className="profile-mobile__kpi-value">{attendanceRate}%</p>
            <p className="profile-mobile__kpi-note">{t('No mês atual')}</p>
          </article>
        </section>

        <section className="profile-mobile__progress-card">
          <p className="profile-mobile__section-label">{isNextBeltMilestone ? t('Próxima faixa') : t('Próximo grau')}</p>
          <h2 className="profile-mobile__progress-title">{nextMilestoneLabel}</h2>
          <p className="profile-mobile__progress-copy">
            {nextMilestoneRemaining > 0 ? t('{count} aulas restantes para elegibilidade', { count: nextMilestoneRemaining }) : t('Progressão manual ou meta atingida')}
          </p>
          <div className="profile-mobile__progress-bar">
            <ProgressBar current={nextMilestoneCurrent} total={nextMilestoneGoal} />
          </div>
          <p className="profile-mobile__progress-caption">{t('{percent}% do objetivo', { percent: nextMilestonePercent })}</p>
          <p className="profile-mobile__progress-caption">
            {progression.classesPerStripe > 0
              ? (progression.beltTotal > 0
                ? t('Regra da faixa: {perStripe} aulas por grau / {beltTotal} aulas para a próxima faixa.', { perStripe: progression.classesPerStripe, beltTotal: progression.beltTotal })
                : t('Regra da faixa: {perStripe} aulas por grau.', { perStripe: progression.classesPerStripe }))
              : t('Regra da faixa: progressão manual.')}
          </p>
        </section>

        <section className="profile-mobile__menu-card" aria-label={t('Menu do perfil')}>
          {staffMenuItems.map((item) => {
            const Icon = item.icon;
            const isExpanded = activeSection === item.id;
            return (
              <div key={item.id}>
                <button
                  type="button"
                  className="profile-mobile__menu-row w-full text-left"
                  onClick={() => {
                    if (item.id === 'notifications') {
                      onOpenNotifications?.();
                      return;
                    }
                    if (item.id === 'exam-rules') {
                      setExamRulesOpen(true);
                      return;
                    }
                    setActiveSection(isExpanded ? null : item.id as 'settings' | 'history' | 'achievements');
                  }}
                >
                  <div className="profile-mobile__menu-icon">
                    <Icon size={18} />
                  </div>
                  <span className="profile-mobile__menu-label">{item.label}</span>
                  <ChevronRight
                    size={18}
                    className={`profile-mobile__menu-arrow transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                  />
                </button>

                {isExpanded && item.id === 'settings' ? (
                  <div className="px-4 pb-5 space-y-4 border-t border-white/10">
                    <form onSubmit={(e) => void handleStaffSettingsSubmit(e)} className="space-y-3 pt-4">
                      {feedback ? <div className="app-alert app-alert--success">{feedback}</div> : null}
                      {error ? <div className="app-alert app-alert--error">{error}</div> : null}
                      <label className="app-field">
                        <span className="app-field__label">{t('Telefone')}</span>
                        <input value={phone} onChange={(e) => setPhone(e.target.value)} className="app-input" placeholder="+55 11 99999-9999" />
                      </label>
                      <button type="submit" disabled={busy} className="app-button app-button--gold app-button--block app-button--small">
                        <Save size={14} />
                        {busy ? t('Salvando...') : t('Salvar telefone')}
                      </button>
                    </form>

                    {onSaveBeltGrade ? (
                      <form onSubmit={(e) => void handleBeltGradeSubmit(e)} className="space-y-3 pt-3 border-t border-white/10">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--text-soft)] pt-1">{t('Faixa e Grau')}</p>
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
                    ) : null}

                    <form onSubmit={(e) => void handleEmailSubmit(e)} className="space-y-3 pt-3 border-t border-white/10">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--text-soft)] pt-1">{t('Alterar e-mail')}</p>
                      {emailFeedback ? <div className="app-alert app-alert--success">{emailFeedback}</div> : null}
                      {emailError ? <div className="app-alert app-alert--error">{emailError}</div> : null}
                      <label className="app-field">
                        <span className="app-field__label">{t('Novo e-mail')}</span>
                        <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="app-input" required />
                      </label>
                      <label className="app-field">
                        <span className="app-field__label">{t('Senha atual')}</span>
                        <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="app-input" required />
                      </label>
                      <button type="submit" disabled={emailBusy} className="app-button app-button--ghost app-button--block app-button--small">
                        <Mail size={14} />
                        {emailBusy ? t('Atualizando...') : t('Atualizar e-mail')}
                      </button>
                    </form>

                    <div className="pt-3 border-t border-white/10">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--text-soft)] pb-3">{t('Aparência')}</p>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => onSetThemeMode('light')} aria-pressed={!isDarkMode} className="app-button app-button--small flex-1 app-button--theme-light">
                          <Sun size={14} />{t('Claro')}
                        </button>
                        <button type="button" onClick={() => onSetThemeMode('dark')} aria-pressed={isDarkMode} className="app-button app-button--small flex-1 app-button--theme-dark">
                          <Moon size={14} />{t('Escuro')}
                        </button>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-white/10">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--text-soft)] pb-3">{t('Idioma')}</p>
                      <LanguagePicker userId={profile.id} />
                    </div>
                  </div>
                ) : null}

                {isExpanded && item.id === 'history' ? (
                  <div className="px-4 pb-5 border-t border-white/10">
                    <div className="pt-4 space-y-2">
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
                  </div>
                ) : null}

                {isExpanded && item.id === 'achievements' ? (
                  <div className="px-4 pb-5 border-t border-white/10">
                    <div className="pt-4 space-y-2">
                      {graduations.slice(0, 8).map((graduation) => (
                        <div key={graduation.id} className="app-list-card">
                          <p className="text-sm font-bold">
                            {beltLabel(graduation.previousBelt)} {graduation.previousStripes} → {beltLabel(graduation.newBelt)} {graduation.newStripes}
                          </p>
                          <p className="mt-1 text-xs text-[color:var(--text-soft)]">
                            {graduation.promotedAt?.toDate().toLocaleDateString(getLocale())} • {graduation.reason.replaceAll('_', ' ')}
                          </p>
                        </div>
                      ))}
                      {graduations.length === 0 ? <div className="app-empty">{t('Nenhuma graduação registrada.')}</div> : null}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>

        <div className="profile-mobile__footer">
          {hasMultipleMemberships && onRequestAcademyChange ? (
            <button
              type="button"
              onClick={() => onRequestAcademyChange()}
              className="app-button app-button--ghost app-button--block"
              style={{ marginBottom: '0.5rem' }}
            >
              {t('Trocar de academia')}
            </button>
          ) : null}

          {canRequestAdditionalAcademy ? (
            <div style={{ marginBottom: '0.75rem' }}>
              {requestAcademyFeedback ? (
                <div className="app-alert app-alert--success" style={{ marginBottom: '0.5rem' }}>{requestAcademyFeedback}</div>
              ) : null}
              {requestAcademyError ? (
                <div className="app-alert app-alert--error" style={{ marginBottom: '0.5rem' }}>{requestAcademyError}</div>
              ) : null}

              {requestAcademyOpen ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
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
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
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
              ) : (
                <button
                  type="button"
                  onClick={() => setRequestAcademyOpen(true)}
                  className="app-button app-button--ghost app-button--block"
                >
                  {t('Solicitar entrada em outra unidade')}
                </button>
              )}
            </div>
          ) : null}

          <button type="button" onClick={() => void onLogout()} className="app-button app-button--danger app-button--block">
            <LogOut size={16} />
            {t('Sair')}
          </button>
        </div>

        {examRulesOpen ? (
          <ExamRulesModal currentBelt={user.belt} onClose={() => setExamRulesOpen(false)} />
        ) : null}
      </div>
    );
  }

  return (
    <div className="view-shell">
      {/* Header */}
      <section className="app-panel app-panel-pad">
        <div className="flex flex-wrap items-center gap-4">
          <AvatarWithBelt
            avatar={user.avatar}
            name={user.name}
            belt={user.belt}
            stripes={user.stripes}
            size="md"
            blackBelt={blackBeltProgress}
          />

          <div className="min-w-0 flex-1">
            <h2 className="text-2xl font-bold">{user.name}</h2>
            <p className="mt-2 text-sm text-[color:var(--text-muted)]">
              {academyName || t('Academia ativa')} • {roleLabel(profile.role)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="app-badge app-badge--gold">{blackBeltProgress ? blackBeltProgress.title : t('Faixa {belt}', { belt: beltLabel(user.belt) })}</span>
              <span className="app-badge app-badge--muted">{blackBeltProgress ? (blackBeltProgress.degreeLabel || t('Faixa lisa')) : t('{count} graus', { count: user.stripes })}</span>
              <span className="app-badge app-badge--muted">{t(user.type)}</span>
              {profile.isCompetitor ? <span className="app-badge app-badge--muted">{t('Competidor')}</span> : null}
            </div>
          </div>
        </div>
      </section>

      {commitment ? (
        <section className="app-panel app-panel-pad">
          <CommitmentBar commitment={commitment} title={t('Comprometimento')} />
        </section>
      ) : null}

      {/* KPIs 2x2 */}
      <section className="grid grid-cols-2 gap-3">
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">{t('Total de aulas')}</p>
          <p className="app-stat-card__value">{totalClasses}</p>
          <p className="app-stat-card__note">{t('Presenças registradas')}</p>
        </article>
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">{t('Frequência')}</p>
          <p className="app-stat-card__value">{attendanceRate}%</p>
          <p className="app-stat-card__note">{t('No mês atual')}</p>
        </article>
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">{t('Próximo grau')}</p>
          <p className="app-stat-card__value">{progression.stripeCycleRemaining ?? 0}</p>
          <p className="app-stat-card__note">{t('Aulas restantes')}</p>
        </article>
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">{t('Próxima faixa')}</p>
          <p className="app-stat-card__value">{nextBeltRemaining}</p>
          <p className="app-stat-card__note">{t('Aulas para elegibilidade')}</p>
        </article>
      </section>

      {/* Accordion menu */}
      <section className="app-panel" aria-label={t('Configurações do perfil')}>
        {/* Dados pessoais */}
        <div>
          <button
            type="button"
            className="profile-mobile__menu-row w-full text-left"
            onClick={() => setActiveStudentSection(activeStudentSection === 'dados-pessoais' ? null : 'dados-pessoais')}
          >
            <div className="profile-mobile__menu-icon"><UserRound size={18} /></div>
            <span className="profile-mobile__menu-label">{t('Dados pessoais')}</span>
            <ChevronRight
              size={18}
              className={`profile-mobile__menu-arrow transition-transform duration-200 ${activeStudentSection === 'dados-pessoais' ? 'rotate-90' : ''}`}
            />
          </button>

          {activeStudentSection === 'dados-pessoais' ? (
            <div className="px-4 pb-5 border-t border-white/10">
              {canEditProfile ? (
                <form onSubmit={handleSubmit} className="mt-4 app-form-grid">
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
                <div className="mt-4 app-list">
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
              )}
            </div>
          ) : null}
        </div>

        {/* Acesso conta email */}
        <div>
          <button
            type="button"
            className="profile-mobile__menu-row w-full text-left"
            onClick={() => setActiveStudentSection(activeStudentSection === 'acesso-email' ? null : 'acesso-email')}
          >
            <div className="profile-mobile__menu-icon"><ShieldCheck size={18} /></div>
            <span className="profile-mobile__menu-label">{t('Acesso conta email')}</span>
            <ChevronRight
              size={18}
              className={`profile-mobile__menu-arrow transition-transform duration-200 ${activeStudentSection === 'acesso-email' ? 'rotate-90' : ''}`}
            />
          </button>

          {activeStudentSection === 'acesso-email' ? (
            <div className="px-4 pb-5 border-t border-white/10">
              <div className="mt-4 app-list">
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

              {canEditProfile ? (
                <form onSubmit={handleEmailSubmit} className="mt-4 app-form-grid">
                  <p className="app-section-label md:col-span-2">{t('Alterar e-mail')}</p>

                  {emailFeedback ? <div className="app-alert app-alert--success md:col-span-2">{emailFeedback}</div> : null}
                  {emailError ? <div className="app-alert app-alert--error md:col-span-2">{emailError}</div> : null}

                  <label className="app-field">
                    <span className="app-field__label">{t('Novo e-mail')}</span>
                    <input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} className="app-input" required />
                  </label>

                  <label className="app-field">
                    <span className="app-field__label">{t('Senha atual')}</span>
                    <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="app-input" required />
                  </label>

                  <button type="submit" disabled={emailBusy} className="app-button app-button--ghost app-button--block md:col-span-2">
                    <Mail size={16} />
                    {emailBusy ? t('Atualizando e-mail...') : t('Atualizar e-mail')}
                  </button>
                </form>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Aparencia */}
        <div>
          <button
            type="button"
            className="profile-mobile__menu-row w-full text-left"
            onClick={() => setActiveStudentSection(activeStudentSection === 'aparencia' ? null : 'aparencia')}
          >
            <div className="profile-mobile__menu-icon">
              {isDarkMode ? <Moon size={18} /> : <Sun size={18} />}
            </div>
            <span className="profile-mobile__menu-label">{t('Aparência')}</span>
            <ChevronRight
              size={18}
              className={`profile-mobile__menu-arrow transition-transform duration-200 ${activeStudentSection === 'aparencia' ? 'rotate-90' : ''}`}
            />
          </button>

          {activeStudentSection === 'aparencia' ? (
            <div className="px-4 pb-5 border-t border-white/10">
              <p className="mt-4 text-sm text-[color:var(--text-muted)]">{t('Tema atual: {theme}.', { theme: currentThemeLabel })}</p>
              <div className="profile-theme-picker mt-3">
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
            </div>
          ) : null}
        </div>

        {/* Idioma */}
        <div>
          <button
            type="button"
            className="profile-mobile__menu-row w-full text-left"
            onClick={() => setActiveStudentSection(activeStudentSection === 'idioma' ? null : 'idioma')}
          >
            <div className="profile-mobile__menu-icon"><Languages size={18} /></div>
            <span className="profile-mobile__menu-label">{t('Idioma')}</span>
            <ChevronRight
              size={18}
              className={`profile-mobile__menu-arrow transition-transform duration-200 ${activeStudentSection === 'idioma' ? 'rotate-90' : ''}`}
            />
          </button>

          {activeStudentSection === 'idioma' ? (
            <div className="px-4 pb-5 border-t border-white/10">
              <p className="mt-4 mb-3 text-sm text-[color:var(--text-muted)]">{t('Escolha o idioma do aplicativo. A preferência fica salva no seu perfil.')}</p>
              <LanguagePicker userId={profile.id} />
            </div>
          ) : null}
        </div>

        {/* Historicos */}
        <div>
          <button
            type="button"
            className="profile-mobile__menu-row w-full text-left"
            onClick={() => setActiveStudentSection(activeStudentSection === 'historicos' ? null : 'historicos')}
          >
            <div className="profile-mobile__menu-icon"><History size={18} /></div>
            <span className="profile-mobile__menu-label">{t('Históricos')}</span>
            <ChevronRight
              size={18}
              className={`profile-mobile__menu-arrow transition-transform duration-200 ${activeStudentSection === 'historicos' ? 'rotate-90' : ''}`}
            />
          </button>

          {activeStudentSection === 'historicos' ? (
            <div className="px-4 pb-5 border-t border-white/10">
              <p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-[color:var(--text-soft)]">{t('Presenças recentes')}</p>
              <div className="mt-2 app-list">
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

              <p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-[color:var(--text-soft)]">{t('Graduações')}</p>
              <div className="mt-2 app-list">
                {graduations.slice(0, 5).map((graduation) => (
                  <div key={graduation.id} className="app-list-card">
                    <p className="text-sm font-bold">
                      {beltLabel(graduation.previousBelt)} {graduation.previousStripes} → {beltLabel(graduation.newBelt)} {graduation.newStripes}
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--text-soft)]">
                      {graduation.promotedAt?.toDate().toLocaleDateString(getLocale())} • {graduation.reason.replaceAll('_', ' ')}
                    </p>
                  </div>
                ))}
                {graduations.length === 0 ? (
                  <div className="app-empty">{t('Ainda não há graduações registradas para este perfil.')}</div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {/* Regras de exame */}
        <div>
          <button
            type="button"
            className="profile-mobile__menu-row w-full text-left"
            onClick={() => setExamRulesOpen(true)}
          >
            <div className="profile-mobile__menu-icon"><ScrollText size={18} /></div>
            <span className="profile-mobile__menu-label">{t('Regras de exame')}</span>
            <ChevronRight size={18} className="profile-mobile__menu-arrow" />
          </button>
        </div>

        {/* Trocar de academia */}
        {hasMultipleMemberships && onRequestAcademyChange ? (
          <div>
            <button
              type="button"
              className="profile-mobile__menu-row w-full text-left"
              onClick={() => onRequestAcademyChange()}
            >
              <div className="profile-mobile__menu-icon"><History size={18} /></div>
              <span className="profile-mobile__menu-label">{t('Trocar de academia')}</span>
              <ChevronRight size={18} className="profile-mobile__menu-arrow" />
            </button>
          </div>
        ) : null}

        {/* Solicitar entrada em outra unidade */}
        {canRequestAdditionalAcademy ? (
          <div style={{ padding: '0 1rem 1rem' }}>
            {requestAcademyFeedback ? (
              <div className="app-alert app-alert--success" style={{ marginBottom: '0.5rem' }}>{requestAcademyFeedback}</div>
            ) : null}
            {requestAcademyError ? (
              <div className="app-alert app-alert--error" style={{ marginBottom: '0.5rem' }}>{requestAcademyError}</div>
            ) : null}

            {requestAcademyOpen ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
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
                <div style={{ display: 'flex', gap: '0.5rem' }}>
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
            ) : (
              <button
                type="button"
                onClick={() => setRequestAcademyOpen(true)}
                className="app-button app-button--ghost app-button--block"
              >
                {t('Solicitar entrada em outra unidade')}
              </button>
            )}
          </div>
        ) : null}

        {/* Zona de perigo — excluir conta (apenas alunos) */}
        {onDeleteAccount ? (
          <div>
            <button
              type="button"
              className="profile-mobile__menu-row w-full text-left"
              onClick={() => {
                setActiveStudentSection(activeStudentSection === 'excluir-conta' ? null : 'excluir-conta');
                setDeleteError('');
              }}
            >
              <div className="profile-mobile__menu-icon" style={{ color: 'var(--color-danger, #ef4444)' }}><Trash2 size={18} /></div>
              <span className="profile-mobile__menu-label" style={{ color: 'var(--color-danger, #ef4444)' }}>{t('Excluir minha conta')}</span>
              <ChevronRight
                size={18}
                className={`profile-mobile__menu-arrow transition-transform duration-200 ${activeStudentSection === 'excluir-conta' ? 'rotate-90' : ''}`}
              />
            </button>

            {activeStudentSection === 'excluir-conta' ? (
              <div className="px-4 pb-5 border-t border-white/10">
                <div className="app-alert app-alert--warning mt-4">
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

                <form onSubmit={handleDeleteSubmit} className="mt-4 app-form-grid">
                  {deleteError ? <div className="app-alert app-alert--error md:col-span-2">{deleteError}</div> : null}

                  <label className="app-field md:col-span-2">
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

                  <label className="flex items-start gap-2 text-xs md:col-span-2">
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
                    className="app-button app-button--solid-danger app-button--block md:col-span-2"
                  >
                    <Trash2 size={16} />
                    {deleteBusy ? t('Excluindo conta...') : t('Excluir minha conta permanentemente')}
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Sair da conta */}
        <div>
          <button
            type="button"
            className="profile-mobile__menu-row w-full text-left"
            onClick={() => void onLogout()}
          >
            <div className="profile-mobile__menu-icon" style={{ color: 'var(--color-danger, #ef4444)' }}><LogOut size={18} /></div>
            <span className="profile-mobile__menu-label" style={{ color: 'var(--color-danger, #ef4444)' }}>{t('Sair da conta')}</span>
            <ChevronRight size={18} className="profile-mobile__menu-arrow" />
          </button>
        </div>
      </section>

      {examRulesOpen ? (
        <ExamRulesModal currentBelt={user.belt} onClose={() => setExamRulesOpen(false)} />
      ) : null}
    </div>
  );
};

export default ProfileView;
