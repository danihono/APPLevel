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
import { nonCountingReasonLabel } from '../classRules';
import {
  AlertTriangle,
  Award,
  Bell,
  Camera,
  ChevronRight,
  History,
  LogOut,
  Mail,
  Moon,
  Phone,
  Save,
  Settings2,
  ShieldCheck,
  Sun,
  Trash2,
  UserRound,
} from 'lucide-react';
import AvatarWithBelt from '../components/AvatarWithBelt';
import DateField from '../components/DateField';
import ProgressBar from '../components/ProgressBar';
import type { FirestoreEntity } from '../services/firebase/data';
import type { AttendanceRecord, GraduationRecord, UserRecord } from '../services/firebase/models';
import type { User } from '../types';

interface ProfileViewProps {
  user: User;
  progressionRules?: ProgressionRules | null;
  profile: FirestoreEntity<UserRecord>;
  totalClasses: number;
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
  studentMemberships?: string[];
  availableAcademiesForRequest?: Array<{ id: string; name: string }>;
  onRequestAcademyChange?: () => void;
  onRequestAdditionalAcademy?: (academyId: string) => Promise<void>;
}

function roleLabel(role: UserRecord['role']) {
  switch (role) {
    case 'admin':
      return 'Professor';
    case 'professor':
      return 'Instrutor';
    case 'superadmin':
      return 'Superadmin';
    default:
      return 'Aluno';
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
      setRequestAcademyFeedback('Solicitação enviada. Aguarde a aprovação do professor da unidade.');
      setRequestAcademyId('');
      setRequestAcademyOpen(false);
    } catch (err) {
      setRequestAcademyError(err instanceof Error ? err.message : 'Não foi possível enviar a solicitação.');
    } finally {
      setRequestAcademyBusy(false);
    }
  }

  const recentAttendances = useMemo(() => attendances.slice(0, 6), [attendances]);
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
  const currentThemeLabel = isDarkMode ? 'Escuro' : 'Claro';
  const isNextBeltMilestone = progression.stripeRemaining === null;
  const nextMilestoneCurrent = isNextBeltMilestone ? beltProgress : stripeProgress;
  const nextMilestoneRemaining = isNextBeltMilestone ? nextBeltRemaining : nextStripeRemaining;
  const nextMilestoneGoal = Math.max(nextMilestoneCurrent + nextMilestoneRemaining, 1);
  const nextMilestonePercent = Math.round((nextMilestoneCurrent / nextMilestoneGoal) * 100);
  const nextMilestoneLabel = isNextBeltMilestone
    ? `Próxima faixa - ${beltLabel(user.belt)}`
    : `${user.stripes + 1}o Grau - Faixa ${beltLabel(user.belt)}`;
  const currentGradeLabel = blackBeltProgress
    ? (blackBeltProgress.degreeLabel || 'Faixa lisa')
    : user.stripes > 0 ? `${user.stripes}o Grau` : '0 Grau';
  const [activeSection, setActiveSection] = useState<'settings' | 'history' | 'achievements' | null>(null);
  const [activeStudentSection, setActiveStudentSection] = useState<'dados-pessoais' | 'acesso-email' | 'aparencia' | 'historicos' | 'excluir-conta' | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmChecked, setDeleteConfirmChecked] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const staffMenuItems = [
    { id: 'settings' as const, icon: Settings2, label: 'Configurações da conta' },
    { id: 'notifications' as const, icon: Bell, label: 'Notificações' },
    { id: 'history' as const, icon: History, label: 'Histórico de aulas' },
    { id: 'achievements' as const, icon: Award, label: 'Conquistas' },
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
      setBeltGradeFeedback('Faixa e grau atualizados com sucesso.');
    } catch (err) {
      setBeltGradeError(err instanceof Error ? err.message : 'Não foi possível salvar.');
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
      setFeedback('Dados atualizados com sucesso.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível salvar.');
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
      setStaffPhotoFeedback('Foto atualizada com sucesso.');
    } catch (err) {
      setStaffPhotoError(err instanceof Error ? err.message : 'Não foi possível salvar a foto.');
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
      setFeedback('Perfil atualizado com sucesso.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível salvar o perfil.');
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
      setEmailFeedback('E-mail atualizado com sucesso.');
    } catch (submitError) {
      setEmailError(submitError instanceof Error ? submitError.message : 'Não foi possível atualizar o e-mail.');
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
      setDeleteError(submitError instanceof Error ? submitError.message : 'Não foi possível excluir a conta.');
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
              aria-label="Trocar foto de perfil"
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
            <span className="profile-mobile__tag is-gold">{blackBeltProgress ? blackBeltProgress.title : `Faixa ${beltLabel(user.belt)}`}</span>
            <span className="profile-mobile__tag">{currentGradeLabel}</span>
            <span className="profile-mobile__tag">{user.type}</span>
          </div>

          {staffPhotoFeedback ? <p className="text-xs text-green-400 text-center">{staffPhotoFeedback}</p> : null}
          {staffPhotoError ? <p className="text-xs text-red-400 text-center">{staffPhotoError}</p> : null}
        </section>

        <section className="profile-mobile__kpis">
          <article className="profile-mobile__kpi-card">
            <p className="profile-mobile__kpi-label">Total de aulas</p>
            <p className="profile-mobile__kpi-value">{totalClasses}</p>
            <p className="profile-mobile__kpi-note">Presenças registradas</p>
          </article>

          <article className="profile-mobile__kpi-card">
            <p className="profile-mobile__kpi-label">Frequência</p>
            <p className="profile-mobile__kpi-value">{attendanceRate}%</p>
            <p className="profile-mobile__kpi-note">No mês atual</p>
          </article>
        </section>

        <section className="profile-mobile__progress-card">
          <p className="profile-mobile__section-label">{isNextBeltMilestone ? 'Próxima faixa' : 'Próximo grau'}</p>
          <h2 className="profile-mobile__progress-title">{nextMilestoneLabel}</h2>
          <p className="profile-mobile__progress-copy">
            {nextMilestoneRemaining > 0 ? `${nextMilestoneRemaining} aulas restantes para elegibilidade` : 'Progressão manual ou meta atingida'}
          </p>
          <div className="profile-mobile__progress-bar">
            <ProgressBar current={nextMilestoneCurrent} total={nextMilestoneGoal} />
          </div>
          <p className="profile-mobile__progress-caption">{nextMilestonePercent}% do objetivo</p>
          <p className="profile-mobile__progress-caption">
            {progression.classesPerStripe > 0
              ? `Regra da faixa: ${progression.classesPerStripe} aulas por grau${progression.beltTotal > 0 ? ` / ${progression.beltTotal} aulas para a próxima faixa` : ''}.`
              : 'Regra da faixa: progressão manual.'}
          </p>
        </section>

        <section className="profile-mobile__menu-card" aria-label="Menu do perfil">
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
                        <span className="app-field__label">Telefone</span>
                        <input value={phone} onChange={(e) => setPhone(e.target.value)} className="app-input" placeholder="+55 11 99999-9999" />
                      </label>
                      <button type="submit" disabled={busy} className="app-button app-button--gold app-button--block app-button--small">
                        <Save size={14} />
                        {busy ? 'Salvando...' : 'Salvar telefone'}
                      </button>
                    </form>

                    {onSaveBeltGrade ? (
                      <form onSubmit={(e) => void handleBeltGradeSubmit(e)} className="space-y-3 pt-3 border-t border-white/10">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--text-soft)] pt-1">Faixa e Grau</p>
                        {beltGradeFeedback ? <div className="app-alert app-alert--success">{beltGradeFeedback}</div> : null}
                        {beltGradeError ? <div className="app-alert app-alert--error">{beltGradeError}</div> : null}
                        <label className="app-field">
                          <span className="app-field__label">Faixa</span>
                          <select value={staffBelt} onChange={(e) => setStaffBelt(e.target.value)} className="app-select">
                            {ADULT_BELTS.map((b) => (
                              <option key={b} value={b}>{beltLabel(b)}</option>
                            ))}
                          </select>
                        </label>
                        {staffBeltIsBlack ? (
                          <>
                            <label className="app-field">
                              <span className="app-field__label">Data da faixa preta</span>
                              <DateField value={staffBlackBeltDate} onChange={setStaffBlackBeltDate} />
                              <span className="app-field__hint">
                                {staffBlackBeltPreview
                                  ? `${staffBlackBeltPreview.label} · ${staffBlackBeltPreview.years} ${staffBlackBeltPreview.years === 1 ? 'ano' : 'anos'} de faixa preta${staffBlackBeltPreview.styleNote ? ` (${staffBlackBeltPreview.styleNote})` : ''}.`
                                  : 'Informe a data em que recebeu a preta para calcular o grau por tempo (IBJJF).'}
                              </span>
                            </label>
                            <label className="app-field">
                              <span className="app-field__label">Grau manual (opcional)</span>
                              <input
                                type="number"
                                min={0}
                                max={9}
                                value={staffBlackBeltManual}
                                onChange={(e) => setStaffBlackBeltManual(
                                  e.target.value === '' ? '' : String(Math.max(0, Math.min(9, Math.floor(Number(e.target.value) || 0)))),
                                )}
                                className="app-input"
                                placeholder={`Automático (${staffAutoBlackDegree}º)`}
                              />
                              <span className="app-field__hint">Deixe vazio para usar o grau automático pela data. Preencha só para ajustar manualmente.</span>
                            </label>
                          </>
                        ) : (
                          <>
                            <label className="app-field">
                              <span className="app-field__label">Grau</span>
                              <select value={staffStripes} onChange={(e) => setStaffStripes(Number(e.target.value))} className="app-select">
                                {[1, 2, 3, 4, 5, 6].map((g) => (
                                  <option key={g} value={g}>{g}º grau</option>
                                ))}
                              </select>
                            </label>
                            <label className="app-field">
                              <span className="app-field__label">Aulas bônus</span>
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
                          {beltGradeBusy ? 'Salvando...' : 'Salvar faixa e grau'}
                        </button>
                      </form>
                    ) : null}

                    <form onSubmit={(e) => void handleEmailSubmit(e)} className="space-y-3 pt-3 border-t border-white/10">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--text-soft)] pt-1">Alterar e-mail</p>
                      {emailFeedback ? <div className="app-alert app-alert--success">{emailFeedback}</div> : null}
                      {emailError ? <div className="app-alert app-alert--error">{emailError}</div> : null}
                      <label className="app-field">
                        <span className="app-field__label">Novo e-mail</span>
                        <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} className="app-input" required />
                      </label>
                      <label className="app-field">
                        <span className="app-field__label">Senha atual</span>
                        <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="app-input" required />
                      </label>
                      <button type="submit" disabled={emailBusy} className="app-button app-button--ghost app-button--block app-button--small">
                        <Mail size={14} />
                        {emailBusy ? 'Atualizando...' : 'Atualizar e-mail'}
                      </button>
                    </form>

                    <div className="pt-3 border-t border-white/10">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--text-soft)] pb-3">Aparência</p>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => onSetThemeMode('light')} aria-pressed={!isDarkMode} className="app-button app-button--small flex-1 app-button--theme-light">
                          <Sun size={14} />Claro
                        </button>
                        <button type="button" onClick={() => onSetThemeMode('dark')} aria-pressed={isDarkMode} className="app-button app-button--small flex-1 app-button--theme-dark">
                          <Moon size={14} />Escuro
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                {isExpanded && item.id === 'history' ? (
                  <div className="px-4 pb-5 border-t border-white/10">
                    <div className="pt-4 space-y-2">
                      {attendances.slice(0, 8).map((attendance) => (
                        <div key={attendance.id} className="app-list-card">
                          <p className="text-sm font-bold">{classNameById.get(attendance.classId) || 'Aula da academia'}</p>
                          <p className="mt-1 text-xs text-[color:var(--text-soft)]">
                            {(classStartById.get(attendance.classId) ?? attendance.checkedInAt?.toDate())?.toLocaleString('pt-BR')} • {attendance.checkInMethod}
                          </p>
                        </div>
                      ))}
                      {attendances.length === 0 ? <div className="app-empty">Nenhuma presença registrada.</div> : null}
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
                            {graduation.promotedAt?.toDate().toLocaleDateString('pt-BR')} • {graduation.reason.replaceAll('_', ' ')}
                          </p>
                        </div>
                      ))}
                      {graduations.length === 0 ? <div className="app-empty">Nenhuma graduação registrada.</div> : null}
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
              Trocar de academia
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
                    <option value="">Selecione a unidade</option>
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
                      {requestAcademyBusy ? 'Enviando...' : 'Enviar solicitação'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setRequestAcademyOpen(false); setRequestAcademyError(''); }}
                      className="app-button app-button--ghost app-button--block"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setRequestAcademyOpen(true)}
                  className="app-button app-button--ghost app-button--block"
                >
                  Solicitar entrada em outra unidade
                </button>
              )}
            </div>
          ) : null}

          <button type="button" onClick={() => void onLogout()} className="app-button app-button--danger app-button--block">
            <LogOut size={16} />
            Sair
          </button>
        </div>
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
              {academyName || 'Academia ativa'} • {roleLabel(profile.role)}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="app-badge app-badge--gold">{blackBeltProgress ? blackBeltProgress.title : `Faixa ${beltLabel(user.belt)}`}</span>
              <span className="app-badge app-badge--muted">{blackBeltProgress ? (blackBeltProgress.degreeLabel || 'Faixa lisa') : `${user.stripes} graus`}</span>
              <span className="app-badge app-badge--muted">{user.type}</span>
              {profile.isCompetitor ? <span className="app-badge app-badge--muted">Competidor</span> : null}
            </div>
          </div>
        </div>
      </section>

      {/* KPIs 2x2 */}
      <section className="grid grid-cols-2 gap-3">
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">Total de aulas</p>
          <p className="app-stat-card__value">{totalClasses}</p>
          <p className="app-stat-card__note">Presenças registradas</p>
        </article>
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">Frequência</p>
          <p className="app-stat-card__value">{attendanceRate}%</p>
          <p className="app-stat-card__note">No mês atual</p>
        </article>
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">Próximo grau</p>
          <p className="app-stat-card__value">{progression.stripeCycleRemaining ?? 0}</p>
          <p className="app-stat-card__note">Aulas restantes</p>
        </article>
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">Próxima faixa</p>
          <p className="app-stat-card__value">{nextBeltRemaining}</p>
          <p className="app-stat-card__note">Aulas para elegibilidade</p>
        </article>
      </section>

      {/* Accordion menu */}
      <section className="app-panel" aria-label="Configurações do perfil">
        {/* Dados pessoais */}
        <div>
          <button
            type="button"
            className="profile-mobile__menu-row w-full text-left"
            onClick={() => setActiveStudentSection(activeStudentSection === 'dados-pessoais' ? null : 'dados-pessoais')}
          >
            <div className="profile-mobile__menu-icon"><UserRound size={18} /></div>
            <span className="profile-mobile__menu-label">Dados pessoais</span>
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
                    <span className="app-field__label">Nome</span>
                    <input value={firstName} onChange={(event) => setFirstName(event.target.value)} className="app-input" required />
                  </label>

                  <label className="app-field">
                    <span className="app-field__label">Sobrenome</span>
                    <input value={lastName} onChange={(event) => setLastName(event.target.value)} className="app-input" required />
                  </label>

                  <label className="app-field">
                    <span className="app-field__label">CPF</span>
                    <input value={cpf} onChange={(event) => setCpf(event.target.value)} className="app-input" required />
                  </label>

                  <label className="app-field">
                    <span className="app-field__label">Telefone</span>
                    <input value={phone} onChange={(event) => setPhone(event.target.value)} className="app-input" />
                  </label>

                  <label className="app-field">
                    <span className="app-field__label">Nascimento</span>
                    <DateField value={birthDate} onChange={setBirthDate} required />
                  </label>

                  <label className="app-field">
                    <span className="app-field__label">Competidor</span>
                    <select value={isCompetitor ? 'yes' : 'no'} onChange={(event) => setIsCompetitor(event.target.value === 'yes')} className="app-select">
                      <option value="no">Não</option>
                      <option value="yes">Sim</option>
                    </select>
                  </label>

                  <label className="app-field md:col-span-2">
                    <span className="app-field__label">Foto</span>
                    <input type="file" accept="image/*" onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)} className="app-input" />
                  </label>

                  <button type="submit" disabled={busy} className="app-button app-button--gold app-button--block md:col-span-2">
                    <Save size={16} />
                    {busy ? 'Salvando...' : 'Salvar perfil'}
                  </button>
                </form>
              ) : (
                <div className="mt-4 app-list">
                  <div className="app-list-card">
                    <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">Função</p>
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
                      {profile.phone || 'Telefone não informado'}
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
            <span className="profile-mobile__menu-label">Acesso conta email</span>
            <ChevronRight
              size={18}
              className={`profile-mobile__menu-arrow transition-transform duration-200 ${activeStudentSection === 'acesso-email' ? 'rotate-90' : ''}`}
            />
          </button>

          {activeStudentSection === 'acesso-email' ? (
            <div className="px-4 pb-5 border-t border-white/10">
              <div className="mt-4 app-list">
                <div className="app-list-card">
                  <p className="text-sm font-bold">Permissões</p>
                  <p className="mt-1 text-xs text-[color:var(--text-soft)]">Perfil atual: {roleLabel(profile.role)}</p>
                </div>
                <div className="app-list-card">
                  <p className="text-sm font-bold">Academia</p>
                  <p className="mt-1 text-xs text-[color:var(--text-soft)]">{academyName || 'Sem academia vinculada'}</p>
                </div>
                <div className="app-list-card">
                  <p className="text-sm font-bold">Faixa e grau</p>
                  <p className="mt-1 text-xs text-[color:var(--text-soft)]">Alteração feita apenas por professor ou superadmin.</p>
                </div>
              </div>

              {canEditProfile ? (
                <form onSubmit={handleEmailSubmit} className="mt-4 app-form-grid">
                  <p className="app-section-label md:col-span-2">Alterar e-mail</p>

                  {emailFeedback ? <div className="app-alert app-alert--success md:col-span-2">{emailFeedback}</div> : null}
                  {emailError ? <div className="app-alert app-alert--error md:col-span-2">{emailError}</div> : null}

                  <label className="app-field">
                    <span className="app-field__label">Novo e-mail</span>
                    <input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} className="app-input" required />
                  </label>

                  <label className="app-field">
                    <span className="app-field__label">Senha atual</span>
                    <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="app-input" required />
                  </label>

                  <button type="submit" disabled={emailBusy} className="app-button app-button--ghost app-button--block md:col-span-2">
                    <Mail size={16} />
                    {emailBusy ? 'Atualizando e-mail...' : 'Atualizar e-mail'}
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
            <span className="profile-mobile__menu-label">Aparência</span>
            <ChevronRight
              size={18}
              className={`profile-mobile__menu-arrow transition-transform duration-200 ${activeStudentSection === 'aparencia' ? 'rotate-90' : ''}`}
            />
          </button>

          {activeStudentSection === 'aparencia' ? (
            <div className="px-4 pb-5 border-t border-white/10">
              <p className="mt-4 text-sm text-[color:var(--text-muted)]">Tema atual: {currentThemeLabel}.</p>
              <div className="profile-theme-picker mt-3">
                <button
                  type="button"
                  onClick={() => onSetThemeMode('light')}
                  className="app-button app-button--small app-button--block app-button--theme-light profile-theme-choice"
                  aria-pressed={!isDarkMode}
                >
                  <Sun size={16} />
                  Claro
                </button>
                <button
                  type="button"
                  onClick={() => onSetThemeMode('dark')}
                  className="app-button app-button--small app-button--block app-button--theme-dark profile-theme-choice"
                  aria-pressed={isDarkMode}
                >
                  <Moon size={16} />
                  Escuro
                </button>
              </div>
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
            <span className="profile-mobile__menu-label">Históricos</span>
            <ChevronRight
              size={18}
              className={`profile-mobile__menu-arrow transition-transform duration-200 ${activeStudentSection === 'historicos' ? 'rotate-90' : ''}`}
            />
          </button>

          {activeStudentSection === 'historicos' ? (
            <div className="px-4 pb-5 border-t border-white/10">
              <p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-[color:var(--text-soft)]">Presenças recentes</p>
              <div className="mt-2 app-list">
                {recentAttendances.map((attendance) => (
                  <div key={attendance.id} className="app-list-card">
                    <p className="text-sm font-bold">{classNameById.get(attendance.classId) || 'Aula da academia'}</p>
                    <p className="mt-1 text-xs text-[color:var(--text-soft)]">
                      {(classStartById.get(attendance.classId) ?? attendance.checkedInAt?.toDate())?.toLocaleString('pt-BR')} • método {attendance.checkInMethod}
                    </p>
                    {attendance.countsAsAttendance === false ? (
                      <span className="app-badge app-badge--muted mt-2 inline-flex">
                        {nonCountingReasonLabel(attendance.nonCountingReason)
                          ? `Não computada · ${nonCountingReasonLabel(attendance.nonCountingReason)}`
                          : 'Não computada'}
                      </span>
                    ) : null}
                  </div>
                ))}
                {recentAttendances.length === 0 ? (
                  <div className="app-empty">Ainda não há presenças registradas neste perfil.</div>
                ) : null}
              </div>

              <p className="mt-4 text-[10px] font-bold uppercase tracking-widest text-[color:var(--text-soft)]">Graduações</p>
              <div className="mt-2 app-list">
                {graduations.slice(0, 5).map((graduation) => (
                  <div key={graduation.id} className="app-list-card">
                    <p className="text-sm font-bold">
                      {beltLabel(graduation.previousBelt)} {graduation.previousStripes} → {beltLabel(graduation.newBelt)} {graduation.newStripes}
                    </p>
                    <p className="mt-1 text-xs text-[color:var(--text-soft)]">
                      {graduation.promotedAt?.toDate().toLocaleDateString('pt-BR')} • {graduation.reason.replaceAll('_', ' ')}
                    </p>
                  </div>
                ))}
                {graduations.length === 0 ? (
                  <div className="app-empty">Ainda não há graduações registradas para este perfil.</div>
                ) : null}
              </div>
            </div>
          ) : null}
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
              <span className="profile-mobile__menu-label">Trocar de academia</span>
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
                  <option value="">Selecione a unidade</option>
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
                    {requestAcademyBusy ? 'Enviando...' : 'Enviar solicitação'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRequestAcademyOpen(false); setRequestAcademyError(''); }}
                    className="app-button app-button--ghost app-button--block"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setRequestAcademyOpen(true)}
                className="app-button app-button--ghost app-button--block"
              >
                Solicitar entrada em outra unidade
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
              <span className="profile-mobile__menu-label" style={{ color: 'var(--color-danger, #ef4444)' }}>Excluir minha conta</span>
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
                      <p className="text-sm font-bold">Esta ação é permanente e não pode ser desfeita.</p>
                      <p className="mt-1 text-xs">
                        Sua conta, perfil, foto, vídeos enviados e progresso serão excluídos. Registros financeiros e
                        históricos exigidos por lei são mantidos de forma anonimizada. Saiba mais em{' '}
                        <a href="/exclusao-de-conta/" target="_blank" rel="noopener noreferrer">exclusão de conta</a>.
                      </p>
                    </div>
                  </div>
                </div>

                <form onSubmit={handleDeleteSubmit} className="mt-4 app-form-grid">
                  {deleteError ? <div className="app-alert app-alert--error md:col-span-2">{deleteError}</div> : null}

                  <label className="app-field md:col-span-2">
                    <span className="app-field__label">Confirme sua senha</span>
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
                    <span>Entendo que minha conta e meus dados pessoais serão excluídos permanentemente.</span>
                  </label>

                  <button
                    type="submit"
                    disabled={deleteBusy || !deleteConfirmChecked || deletePassword.length === 0}
                    className="app-button app-button--danger app-button--block md:col-span-2"
                  >
                    <Trash2 size={16} />
                    {deleteBusy ? 'Excluindo conta...' : 'Excluir minha conta permanentemente'}
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
            <span className="profile-mobile__menu-label" style={{ color: 'var(--color-danger, #ef4444)' }}>Sair da conta</span>
            <ChevronRight size={18} className="profile-mobile__menu-arrow" />
          </button>
        </div>
      </section>
    </div>
  );
};

export default ProfileView;
