import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  beltLabel,
  getBeltOptions,
  getUserProgressionSummary,
  inferKidsCategoryFromBirthDate,
  inferTrainingTypeFromBirthDate,
  isKidsOnlyBelt,
  kidsCategoryLabel,
  KIDS_CATEGORIES,
  type ProgressionRules,
} from '../beltCatalog';
import { useConfirm } from '../components/ConfirmDialog';
import { AlertTriangle, ArrowLeft, ArrowDown, ArrowUp, Award, Calendar, Camera, CheckCircle2, ChevronDown, ChevronUp, Clock, Edit, Filter, Mail, QrCode, Save, TrendingUp, UserCheck, UserX, Video, BookOpen, X } from 'lucide-react';
import AppVideoContent from '../components/AppVideoContent';
import AvatarWithBelt from '../components/AvatarWithBelt';
import ProgressBar from '../components/ProgressBar';
import StudentProfileEditModal from '../components/StudentProfileEditModal';
import { subscribeToUserAttendances, subscribeToUserGraduations, type FirestoreEntity } from '../services/firebase/data';
import type { AttendanceRecord, ClassRecord, GraduationApprovalRequestRecord, GraduationRecord } from '../services/firebase/models';
import type { KidsCategory, User } from '../types';

interface StudentDetailViewProps {
  student: User;
  progressionRules?: ProgressionRules | null;
  graduationRequest?: FirestoreEntity<GraduationApprovalRequestRecord> | null;
  classes?: Array<FirestoreEntity<ClassRecord>>;
  onBack: () => void;
  onApproveGraduationRequest?: (requestId: string) => Promise<void>;
  onUpdateStudentBeltGrade?: (payload: { userId: string; belt: string; grade: number; stripes?: number; kidsCategory?: string; attendanceCountAtBeltStart?: number }) => Promise<void>;
  onSetStudentAttendanceBonus?: (payload: { userId: string; attendanceCountBonus: number }) => Promise<void>;
  onAdminUpdateStudentProfile?: (payload: {
    userId: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    cpf?: string;
    birthDate?: string;
    isCompetitor?: boolean;
  }) => Promise<void>;
  onAdminUpdateStudentTimeline?: (payload: {
    userId: string;
    trainingStartDate?: string;
    lastGraduationDateOverride?: string;
    lastStripeDateOverride?: string;
  }) => Promise<void>;
  onAdminUpdateStudentPhoto?: (payload: { userId: string; photoFile: File }) => Promise<void>;
  onDeactivateStudent?: (userId: string) => Promise<void>;
  onActivateStudent?: (userId: string) => Promise<void>;
  academies?: Array<{ id: string; name: string }>;
  viewerRole?: 'professor' | 'superadmin';
  onAdminSetUserMemberships?: (payload: { userId: string; memberships: string[] }) => Promise<void>;
}

function formatDate(value?: string) {
  if (!value) {
    return 'Sem registro';
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return value;
  }

  return parsed.toLocaleDateString('pt-BR');
}

function graduationTargetLabel(request: FirestoreEntity<GraduationApprovalRequestRecord>) {
  return request.targetType === 'belt'
    ? `Faixa ${beltLabel(request.targetBelt)}`
    : `${request.targetStripes} grau(s) na faixa ${beltLabel(request.targetBelt)}`;
}

type AttendancePeriodPreset = 'week' | 'month' | '3months' | 'all' | 'custom';
type AttendanceSortDir = 'desc' | 'asc';

const ATTENDANCE_PAGE_SIZE = 30;

function resolveAttendanceRange(
  preset: AttendancePeriodPreset,
  customFrom: string,
  customTo: string,
): { start: Date | null; end: Date | null } {
  const now = new Date();

  if (preset === 'all') {
    return { start: null, end: null };
  }

  if (preset === 'custom') {
    const start = /^\d{4}-\d{2}-\d{2}$/.test(customFrom) ? new Date(`${customFrom}T00:00:00`) : null;
    const end = /^\d{4}-\d{2}-\d{2}$/.test(customTo) ? new Date(`${customTo}T23:59:59.999`) : null;
    return { start, end };
  }

  const end = now;
  const start = new Date(now);
  if (preset === 'week') {
    start.setDate(start.getDate() - 7);
  } else if (preset === 'month') {
    start.setMonth(start.getMonth() - 1);
  } else if (preset === '3months') {
    start.setMonth(start.getMonth() - 3);
  }
  return { start, end };
}

function attendanceCheckInMethodLabel(method: AttendanceRecord['checkInMethod']) {
  if (method === 'qr') return 'QR code';
  if (method === 'manual') return 'Manual';
  if (method === 'request') return 'Solicitada';
  return method;
}

const StudentDetailView: React.FC<StudentDetailViewProps> = ({
  student,
  progressionRules,
  graduationRequest = null,
  classes = [],
  onBack,
  onApproveGraduationRequest,
  onUpdateStudentBeltGrade,
  onSetStudentAttendanceBonus,
  onAdminUpdateStudentProfile,
  onAdminUpdateStudentTimeline,
  onAdminUpdateStudentPhoto,
  onDeactivateStudent,
  onActivateStudent,
  academies,
  viewerRole,
  onAdminSetUserMemberships,
}) => {
  const confirm = useConfirm();
  const [showEditModal, setShowEditModal] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoFeedback, setPhotoFeedback] = useState('');
  const [photoError, setPhotoError] = useState('');
  const age = student.birthDate
    ? new Date().getFullYear() - new Date(student.birthDate).getFullYear()
    : 28;
  const inferredKidsCategory = inferKidsCategoryFromBirthDate(student.birthDate);
  const inferredTrainingType = inferTrainingTypeFromBirthDate(student.birthDate);
  const canUseAdultGraduation = inferredKidsCategory == null;
  const [studentBelt, setStudentBelt] = useState(student.belt);
  const [studentGrade, setStudentGrade] = useState(student.stripes);
  const [studentKidsCategory, setStudentKidsCategory] = useState<KidsCategory | ''>(student.kidsCategory ?? inferredKidsCategory ?? '');
  const [attendanceBonus, setAttendanceBonus] = useState(student.attendanceCountBonus ?? 0);
  const [gradeCurrentClasses, setGradeCurrentClasses] = useState(
    () => getUserProgressionSummary({ ...student }, progressionRules).stripeCycleProgress,
  );
  const [approveBusy, setApproveBusy] = useState(false);
  const [approveConfirmOpen, setApproveConfirmOpen] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [bonusBusy, setBonusBusy] = useState(false);
  const [deactivateBusy, setDeactivateBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const [liveGraduations, setLiveGraduations] = useState<Array<FirestoreEntity<GraduationRecord>>>([]);
  const [studentAttendances, setStudentAttendances] = useState<Array<FirestoreEntity<AttendanceRecord>>>([]);
  const [historyPeriod, setHistoryPeriod] = useState<AttendancePeriodPreset>('month');
  const [historyCustomFrom, setHistoryCustomFrom] = useState('');
  const [historyCustomTo, setHistoryCustomTo] = useState('');
  const [historyClassTitle, setHistoryClassTitle] = useState('');
  const [historySortDir, setHistorySortDir] = useState<AttendanceSortDir>('desc');
  const [historyAdvancedOpen, setHistoryAdvancedOpen] = useState(false);
  const [historyVisibleCount, setHistoryVisibleCount] = useState(ATTENDANCE_PAGE_SIZE);

  const initialMemberships = useMemo(
    () => (student.memberships && student.memberships.length > 0)
      ? [...student.memberships]
      : (student.branchId ? [student.branchId] : []),
    [student.id, student.memberships, student.branchId],
  );
  const [selectedMemberships, setSelectedMemberships] = useState<string[]>(initialMemberships);
  const [membershipsBusy, setMembershipsBusy] = useState(false);
  const [membershipsError, setMembershipsError] = useState('');

  useEffect(() => {
    setSelectedMemberships(initialMemberships);
    setMembershipsError('');
  }, [initialMemberships]);

  const membershipsDirty = useMemo(() => {
    const a = [...selectedMemberships].sort();
    const b = [...initialMemberships].sort();
    return a.length !== b.length || a.some((v, i) => v !== b[i]);
  }, [selectedMemberships, initialMemberships]);

  function toggleMembership(academyId: string, checked: boolean) {
    setSelectedMemberships((current) => (
      checked
        ? [...new Set([...current, academyId])]
        : current.filter((id) => id !== academyId)
    ));
  }

  async function confirmAndSubmitMemberships() {
    if (!onAdminSetUserMemberships || selectedMemberships.length === 0) return;
    const academiesById = new Map(academies?.map((a) => [a.id, a.name]) ?? []);
    const added = selectedMemberships
      .filter((id) => !initialMemberships.includes(id))
      .map((id) => academiesById.get(id) ?? id);
    const removed = initialMemberships
      .filter((id) => !selectedMemberships.includes(id))
      .map((id) => academiesById.get(id) ?? id);
    const parts: string[] = [];
    if (added.length > 0) parts.push(`adicionar: ${added.join(', ')}`);
    if (removed.length > 0) parts.push(`remover: ${removed.join(', ')}`);
    const summary = parts.join(' | ');
    const willSwitchActive = removed.length > 0 && !selectedMemberships.includes(student.branchId);
    const warning = willSwitchActive
      ? '\n\nATENCAO: a unidade ativa do aluno sera trocada automaticamente.'
      : '';
    if (!(await confirm({
      title: 'Alterar unidades',
      message: `Confirmar alteracao de unidades para ${student.name}?\n\n${summary}${warning}`,
      confirmLabel: 'Confirmar',
      tone: willSwitchActive ? 'danger' : 'default',
    }))) {
      return;
    }
    setMembershipsBusy(true);
    setMembershipsError('');
    try {
      await onAdminSetUserMemberships({ userId: student.id, memberships: selectedMemberships });
    } catch (err) {
      setMembershipsError(err instanceof Error ? err.message : 'Nao foi possivel salvar as unidades.');
    } finally {
      setMembershipsBusy(false);
    }
  }

  useEffect(() => {
    setStudentBelt(student.belt);
    setStudentGrade(student.stripes);
    setStudentKidsCategory(student.kidsCategory ?? inferKidsCategoryFromBirthDate(student.birthDate) ?? '');
    setAttendanceBonus(student.attendanceCountBonus ?? 0);
    setGradeCurrentClasses(getUserProgressionSummary({ ...student }, progressionRules).stripeCycleProgress);
  }, [student, progressionRules]);

  useEffect(() => {
    setHistoryVisibleCount(ATTENDANCE_PAGE_SIZE);
  }, [student.id, historyPeriod, historyCustomFrom, historyCustomTo, historyClassTitle, historySortDir]);

  useEffect(() => {
    return subscribeToUserGraduations(
      student.branchId,
      student.id,
      setLiveGraduations,
      (error) => console.warn('[StudentDetailView:graduations]', error),
    );
  }, [student.id, student.branchId]);

  useEffect(() => {
    return subscribeToUserAttendances(
      student.branchId,
      student.id,
      setStudentAttendances,
      (error) => console.warn('[StudentDetailView:attendances]', error),
    );
  }, [student.id, student.branchId]);

  const classesById = useMemo(() => {
    const map = new Map<string, FirestoreEntity<ClassRecord>>();
    classes.forEach((entry) => map.set(entry.id, entry));
    return map;
  }, [classes]);

  const availableClassTitles = useMemo(() => {
    const titles = new Set<string>();
    studentAttendances.forEach((att) => {
      const title = classesById.get(att.classId)?.title?.trim();
      if (title) {
        titles.add(title);
      }
    });
    return Array.from(titles).sort((left, right) => left.localeCompare(right, 'pt-BR'));
  }, [studentAttendances, classesById]);

  const filteredAttendances = useMemo(() => {
    const { start, end } = resolveAttendanceRange(historyPeriod, historyCustomFrom, historyCustomTo);
    const selectedTitle = historyClassTitle.trim();

    const result = studentAttendances.filter((att) => {
      const refDate = (att.checkedInAt ?? att.createdAt)?.toDate?.();
      if (start && refDate && refDate < start) return false;
      if (end && refDate && refDate > end) return false;
      if (selectedTitle) {
        const title = classesById.get(att.classId)?.title?.trim() ?? '';
        if (title !== selectedTitle) return false;
      }
      return true;
    });

    result.sort((left, right) => {
      const leftMs = (left.checkedInAt ?? left.createdAt)?.toDate?.()?.getTime?.() ?? 0;
      const rightMs = (right.checkedInAt ?? right.createdAt)?.toDate?.()?.getTime?.() ?? 0;
      return historySortDir === 'desc' ? rightMs - leftMs : leftMs - rightMs;
    });

    return result;
  }, [studentAttendances, classesById, historyPeriod, historyCustomFrom, historyCustomTo, historyClassTitle, historySortDir]);

  const visibleAttendances = useMemo(
    () => filteredAttendances.slice(0, historyVisibleCount),
    [filteredAttendances, historyVisibleCount],
  );

  const studentTrack = useMemo<'Adulto' | 'Kids'>(() => {
    if (isKidsOnlyBelt(studentBelt)) {
      return 'Kids';
    }

    if (!canUseAdultGraduation && studentKidsCategory) {
      return 'Kids';
    }

    return inferredTrainingType;
  }, [canUseAdultGraduation, inferredTrainingType, studentBelt, studentKidsCategory]);

  const studentBeltOptions = useMemo(() => {
    const baseOptions = canUseAdultGraduation
      ? getBeltOptions('Adulto')
      : getBeltOptions(studentTrack, studentKidsCategory || undefined);
    if (baseOptions.some((entry) => entry.value === studentBelt)) {
      return baseOptions;
    }

    return [...baseOptions, { value: studentBelt, label: beltLabel(studentBelt) }];
  }, [canUseAdultGraduation, studentBelt, studentKidsCategory, studentTrack]);

  function handleStudentBeltChange(value: string) {
    const nextBelt = value as typeof student.belt;
    const beltChanged = nextBelt !== studentBelt;
    setStudentBelt(nextBelt);
    if (beltChanged) {
      setStudentGrade(0);
      setGradeCurrentClasses(0);
    }

    if (canUseAdultGraduation && !isKidsOnlyBelt(nextBelt)) {
      setStudentKidsCategory('');
    }
  }
  const registeredAttendanceCount = Math.max(
    0,
    Math.floor((student.attendanceCount ?? 0) - (student.attendanceCountBonus ?? 0)),
  );
  const previewAttendanceCount = registeredAttendanceCount + attendanceBonus;
  const progression = useMemo(
    () => {
      // 1o passo: resolve o stripeEvery da faixa (independe do marco).
      const base = getUserProgressionSummary({
        ...student,
        belt: studentBelt,
        stripes: studentGrade,
        attendanceCount: previewAttendanceCount,
        attendanceCountBonus: attendanceBonus,
        attendanceCountAtBeltStart: studentBelt === student.belt ? student.attendanceCountAtBeltStart : undefined,
      }, progressionRules);
      // 2o passo: reposiciona o marco a partir do campo "Aulas no grau atual", para que o
      // progresso do grau mostre exatamente `gradeCurrentClasses`/stripeEvery.
      const manualBaseline = Math.max(
        0,
        previewAttendanceCount - studentGrade * base.classesPerStripe - gradeCurrentClasses,
      );
      return getUserProgressionSummary({
        ...student,
        belt: studentBelt,
        stripes: studentGrade,
        attendanceCount: previewAttendanceCount,
        attendanceCountBonus: attendanceBonus,
        attendanceCountAtBeltStart: manualBaseline,
      }, progressionRules);
    },
    [progressionRules, previewAttendanceCount, student, studentBelt, studentGrade, attendanceBonus, gradeCurrentClasses],
  );
  const beltTotal = progression.beltTotal;
  const beltProgress = progression.beltProgress;
  const gradeDisplayTotal = progression.stripeCycleTotal;
  const gradeDisplayProgress = progression.stripeCycleProgress;

  useEffect(() => {
    if (!studentBeltOptions.length) {
      return;
    }

    if (!studentBeltOptions.some((entry) => entry.value === studentBelt)) {
      setStudentBelt(studentBeltOptions[0].value);
      setStudentGrade(0);
    }
  }, [studentBelt, studentBeltOptions]);

  async function handleApproveSuggested() {
    if (approveBusy) return;
    if (!graduationRequest || !onApproveGraduationRequest) {
      return;
    }

    setApproveBusy(true);
    setFeedback('');
    setError('');

    try {
      await onApproveGraduationRequest(graduationRequest.id);
      setFeedback('Graduação aprovada com sucesso.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível aprovar a graduação.');
    } finally {
      setApproveBusy(false);
      setApproveConfirmOpen(false);
    }
  }

  async function handleSaveManual(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!onUpdateStudentBeltGrade) {
      return;
    }

    setSaveBusy(true);
    setFeedback('');
    setError('');

    try {
      const attendanceCountAtBeltStart = Math.max(
        0,
        previewAttendanceCount - studentGrade * progression.classesPerStripe - gradeCurrentClasses,
      );
      await onUpdateStudentBeltGrade({
        userId: student.id,
        belt: studentBelt,
        grade: studentGrade,
        stripes: studentGrade,
        kidsCategory: studentTrack === 'Kids' ? studentKidsCategory : '',
        attendanceCountAtBeltStart,
      });
      if (onSetStudentAttendanceBonus) {
        await onSetStudentAttendanceBonus({ userId: student.id, attendanceCountBonus: attendanceBonus });
      }
      setFeedback('Graduação do aluno atualizada com sucesso.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível atualizar a graduação.');
    } finally {
      setSaveBusy(false);
    }
  }

  async function handleDeactivate() {
    if (!onDeactivateStudent) return;
    if (!(await confirm({
      title: 'Desativar aluno',
      message: `Desativar ${student.name}? O aluno não poderá mais acessar o aplicativo.`,
      confirmLabel: 'Desativar',
      tone: 'danger',
    }))) return;
    setDeactivateBusy(true);
    setFeedback('');
    setError('');
    try {
      await onDeactivateStudent(student.id);
      setFeedback('Aluno desativado. O acesso foi bloqueado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível desativar o aluno.');
    } finally {
      setDeactivateBusy(false);
    }
  }

  async function handleActivate() {
    if (!onActivateStudent) return;
    setDeactivateBusy(true);
    setFeedback('');
    setError('');
    try {
      await onActivateStudent(student.id);
      setFeedback('Aluno reativado com sucesso.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível reativar o aluno.');
    } finally {
      setDeactivateBusy(false);
    }
  }

  async function handlePhotoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file || !onAdminUpdateStudentPhoto) return;
    setPhotoBusy(true);
    setPhotoFeedback('');
    setPhotoError('');
    try {
      await onAdminUpdateStudentPhoto({ userId: student.id, photoFile: file });
      setPhotoFeedback('Foto atualizada com sucesso.');
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Não foi possível salvar a foto.');
    } finally {
      setPhotoBusy(false);
      event.target.value = '';
    }
  }

  async function handleSaveAttendanceBonus(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!onSetStudentAttendanceBonus) {
      return;
    }

    setBonusBusy(true);
    setFeedback('');
    setError('');

    try {
      await onSetStudentAttendanceBonus({ userId: student.id, attendanceCountBonus: attendanceBonus });
      setFeedback('Aulas extras salvas com sucesso.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível salvar as aulas extras.');
    } finally {
      setBonusBusy(false);
    }
  }

  if (showEditModal) {
    return (
      <StudentProfileEditModal
        student={student}
        onClose={() => setShowEditModal(false)}
        onAdminUpdateStudentProfile={onAdminUpdateStudentProfile}
        onAdminUpdateStudentTimeline={onAdminUpdateStudentTimeline}
        onSetStudentAttendanceBonus={onSetStudentAttendanceBonus}
      />
    );
  }

  const latestGraduationIso = liveGraduations[0]?.promotedAt?.toDate?.()?.toISOString();
  const timelineLastGraduation = student.lastGraduationDateOverride ?? latestGraduationIso;
  const timelineLastStripeDate = student.lastStripeDateOverride ?? latestGraduationIso;

  return (
    <div className="view-shell">
      <div className="flex items-center gap-4">
        <button type="button" onClick={onBack} className="app-button app-button--ghost app-button--icon">
          <ArrowLeft size={18} />
        </button>
        <div>
          <p className="app-section-label">Perfil do aluno</p>
          <h1 className="text-2xl font-bold">{student.name}</h1>
        </div>
      </div>

      <section className="app-panel app-panel--hero app-panel-pad text-center">
        <div className="flex justify-center">
          <AvatarWithBelt
            avatar={student.avatar}
            name={student.name}
            belt={student.belt}
            stripes={student.stripes}
            size="lg"
          />
        </div>
        {onAdminUpdateStudentPhoto ? (
          <>
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={photoBusy}
              className="app-button app-button--ghost mt-4"
            >
              {photoBusy ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              ) : (
                <Camera size={16} />
              )}
              {photoBusy ? 'Enviando...' : 'Alterar foto'}
            </button>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handlePhotoUpload}
            />
          </>
        ) : null}
        {photoFeedback ? <p className="mt-2 text-xs text-green-500">{photoFeedback}</p> : null}
        {photoError ? <p className="mt-2 text-xs text-red-500">{photoError}</p> : null}
        <h2 className="mt-4 text-3xl font-bold">{student.name}</h2>
        <p className="mt-2 text-sm text-[color:var(--text-muted)]">{student.type} - {age} anos</p>

        <div className="app-panel app-panel--soft mt-6 px-4 py-4">
          <div className="flex items-center justify-center gap-2 text-sm text-[color:var(--text-muted)]">
            <Mail size={16} />
            {student.email}
          </div>
        </div>

        {(onAdminUpdateStudentProfile || onAdminUpdateStudentTimeline) ? (
          <button
            type="button"
            onClick={() => setShowEditModal(true)}
            className="app-button app-button--ghost mt-4 w-full"
          >
            <Edit size={16} />
            Editar dados completos
          </button>
        ) : null}

        {student.status === 'suspended' ? (
          <div className="mt-4 space-y-3">
            <div className="app-alert app-alert--error flex items-center gap-2">
              <UserX size={16} />
              Conta desativada — este aluno não pode acessar o aplicativo.
            </div>
            {onActivateStudent ? (
              <button
                type="button"
                onClick={() => void handleActivate()}
                disabled={deactivateBusy}
                className="app-button app-button--primary w-full"
              >
                {deactivateBusy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <CheckCircle2 size={16} />}
                {deactivateBusy ? 'Reativando...' : 'Reativar aluno'}
              </button>
            ) : null}
          </div>
        ) : (onDeactivateStudent ? (
          <button
            type="button"
            onClick={() => void handleDeactivate()}
            disabled={deactivateBusy}
            className="app-button app-button--danger mt-4 w-full"
          >
            {deactivateBusy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <UserX size={16} />}
            {deactivateBusy ? 'Desativando...' : 'Desativar aluno'}
          </button>
        ) : null)}
      </section>

      {viewerRole === 'superadmin' && academies && academies.length > 0 && onAdminSetUserMemberships ? (
        <section className="app-panel app-panel-pad">
          <p className="app-section-label">Unidades autorizadas</p>
          <h2 className="text-xl font-bold mt-1">Acesso às unidades</h2>
          <p className="mt-2 text-sm text-[color:var(--text-muted)]">
            Marque as unidades que este aluno pode acessar. Lembre-se de clicar em <strong>Salvar unidades</strong> ao final — as alterações só são aplicadas após confirmação.
          </p>
          {membershipsError ? (
            <div className="app-alert app-alert--error mt-3">{membershipsError}</div>
          ) : null}
          {membershipsDirty && !membershipsBusy ? (
            <div className="app-alert app-alert--warning mt-3">
              Você tem alterações não salvas.
            </div>
          ) : null}
          <div className="mt-4 flex flex-col gap-2">
            {academies.map((academy) => (
              <label key={academy.id} className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedMemberships.includes(academy.id)}
                  disabled={membershipsBusy}
                  onChange={(event) => toggleMembership(academy.id, event.target.checked)}
                  className="h-4 w-4 rounded"
                />
                <span className="text-sm font-medium">{academy.name}</span>
                {academy.id === student.branchId ? (
                  <span className="app-badge app-badge--muted">Unidade ativa</span>
                ) : null}
              </label>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              disabled={membershipsBusy || selectedMemberships.length === 0 || !membershipsDirty}
              onClick={() => void confirmAndSubmitMemberships()}
              className="app-button app-button--gold app-button--small"
            >
              {membershipsBusy ? 'Salvando...' : 'Salvar unidades'}
            </button>
            <button
              type="button"
              disabled={membershipsBusy || !membershipsDirty}
              onClick={() => {
                setSelectedMemberships(initialMemberships);
                setMembershipsError('');
              }}
              className="app-button app-button--ghost app-button--small"
            >
              Cancelar
            </button>
          </div>
        </section>
      ) : null}

      {graduationRequest ? (
        <section className="app-panel app-panel-pad">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="app-section-label">Graduação pendente</p>
              <h2 className="text-xl font-bold">Aprovação sugerida pela progressão</h2>
              <p className="mt-2 text-sm text-[color:var(--text-muted)]">
                {graduationRequest.remainingClasses <= 0
                  ? 'A meta já foi atingida e o aluno aguarda sua aprovação.'
                  : `Falta ${graduationRequest.remainingClasses} presença para liberar a avaliação formal.`}
              </p>
            </div>
            <span className="app-badge app-badge--gold">{graduationRequest.targetType === 'belt' ? 'Faixa' : 'Grau'}</span>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <span className="app-badge app-badge--muted">Atual: {beltLabel(graduationRequest.currentBelt)} • {graduationRequest.currentStripes} grau(s)</span>
            <span className="app-badge app-badge--muted">Próximo passo: {graduationTargetLabel(graduationRequest)}</span>
            <span className="app-badge app-badge--muted">
              {graduationRequest.remainingClasses <= 0 ? 'Meta atingida' : `Restam ${graduationRequest.remainingClasses} aula(s)`}
            </span>
          </div>

          {onApproveGraduationRequest ? (
            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setApproveConfirmOpen(true)}
                disabled={approveBusy}
                className="app-button app-button--gold"
              >
                <CheckCircle2 size={16} />
                {approveBusy ? 'Aprovando...' : 'Aprovar próxima graduação'}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {approveConfirmOpen && graduationRequest && onApproveGraduationRequest ? (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 sm:items-center"
          onClick={() => { if (!approveBusy) setApproveConfirmOpen(false); }}
        >
          <div
            className="app-panel app-panel-pad app-sheet-modal w-full max-w-xl rounded-b-none sm:rounded-[1.8rem]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="app-icon-shell" style={{ color: '#f59e0b' }}>
                  <AlertTriangle size={18} />
                </div>
                <h2 className="text-xl font-bold">Confirmar graduação</h2>
              </div>
              <button
                type="button"
                onClick={() => setApproveConfirmOpen(false)}
                disabled={approveBusy}
                className="app-button app-button--ghost app-button--icon"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-6 app-list-card">
              <p className="text-sm font-semibold">{student.name}</p>
              <p className="mt-2 text-sm text-[color:var(--text-muted)]">
                Promover para <strong>{graduationTargetLabel(graduationRequest)}</strong>? Esta ação não pode ser desfeita.
              </p>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setApproveConfirmOpen(false)}
                disabled={approveBusy}
                className="app-button app-button--ghost flex-1"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleApproveSuggested()}
                disabled={approveBusy}
                className="app-button app-button--gold flex-1"
              >
                <CheckCircle2 size={14} />
                {approveBusy ? 'Aprovando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {(feedback || error) ? (
        <section className="space-y-3">
          {feedback ? <div className="app-alert app-alert--success">{feedback}</div> : null}
          {error ? <div className="app-alert app-alert--error">{error}</div> : null}
        </section>
      ) : null}

      {onUpdateStudentBeltGrade ? (
        <form onSubmit={handleSaveManual} className="app-panel app-panel-pad">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell">
              <Save size={18} />
            </div>
            <div>
              <p className="app-section-label">Graduação manual</p>
              <h2 className="text-xl font-bold">Adiantar ou ajustar faixa e grau</h2>
            </div>
          </div>

          <div className="mt-6 app-grid-2">
            <label className="app-field">
              <span className="app-field__label">Faixa</span>
              <select value={studentBelt} onChange={(event) => handleStudentBeltChange(event.target.value)} className="app-select">
                {studentBeltOptions.map((entry) => (
                  <option key={entry.value} value={entry.value}>{entry.label}</option>
                ))}
              </select>
              {canUseAdultGraduation ? (
                <span className="app-field__hint">Aluno liberado para faixas adultas pelo ano em que completa 16.</span>
              ) : null}
            </label>

            <label className="app-field">
              <span className="app-field__label">Grau</span>
              <input
                type="number"
                min={0}
                value={studentGrade}
                onChange={(event) => {
                  setStudentGrade(Math.max(0, Math.floor(Number(event.target.value) || 0)));
                  setGradeCurrentClasses(0);
                }}
                className="app-input"
              />
            </label>

            {progression.classesPerStripe > 0 ? (
              <label className="app-field">
                <span className="app-field__label">Aulas no grau atual</span>
                <input
                  type="number"
                  min={0}
                  max={progression.classesPerStripe}
                  value={gradeCurrentClasses}
                  onChange={(event) => setGradeCurrentClasses(
                    Math.max(0, Math.min(progression.classesPerStripe, Math.floor(Number(event.target.value) || 0))),
                  )}
                  className="app-input"
                />
                <span className="app-field__hint">Quantas aulas o aluno já tem no grau atual (0 reinicia o grau)</span>
              </label>
            ) : null}

            {onSetStudentAttendanceBonus ? (
              <label className="app-field">
                <span className="app-field__label">Aulas anteriores</span>
                <input
                  type="number"
                  min={0}
                  value={attendanceBonus}
                  onChange={(event) => setAttendanceBonus(Math.max(0, Math.floor(Number(event.target.value) || 0)))}
                  className="app-input"
                />
                <span className="app-field__hint">Aulas realizadas antes do cadastro no sistema</span>
              </label>
            ) : null}

            {studentTrack === 'Kids' ? (
              <label className="app-field md:col-span-2">
                <span className="app-field__label">Categoria kids</span>
                <select
                  value={studentKidsCategory}
                  onChange={(event) => setStudentKidsCategory(event.target.value as KidsCategory | '')}
                  className="app-select"
                >
                  <option value="">Inferir pela idade</option>
                  {KIDS_CATEGORIES.map((entry) => (
                    <option key={entry.value} value={entry.value}>{entry.label}</option>
                  ))}
                </select>
                <span className="app-field__hint">
                  {studentKidsCategory
                    ? `Categoria atual: ${kidsCategoryLabel(studentKidsCategory)}`
                    : `Categoria sugerida: ${kidsCategoryLabel(inferredKidsCategory)}`}
                </span>
              </label>
            ) : null}
          </div>

          <button type="submit" disabled={saveBusy} className="app-button app-button--gold mt-6">
            <Save size={16} />
            {saveBusy ? 'Salvando...' : 'Salvar graduação do aluno'}
          </button>
        </form>
      ) : null}


      <section className="app-panel app-panel-pad">
        <div className="flex items-center gap-3">
          <div className="app-icon-shell">
            <TrendingUp size={18} />
          </div>
          <div>
            <p className="app-section-label">Progresso</p>
            <h2 className="text-xl font-bold">Avanço atual</h2>
          </div>
        </div>

        <div className="mt-6 space-y-6">
          <div>
            <ProgressBar current={gradeDisplayProgress} total={gradeDisplayTotal} />
            <p className="mt-3 text-sm text-[color:var(--text-muted)]">
              {gradeDisplayTotal > 0
                ? `Progresso real para o próximo grau: ${gradeDisplayProgress}/${gradeDisplayTotal} aulas`
                : 'Próximo grau: progressão manual'}
            </p>
          </div>
          <div>
            <ProgressBar current={beltProgress} total={beltTotal} color="bg-gold" />
            <p className="mt-3 text-sm text-[color:var(--text-muted)]">
              {beltTotal > 0
                ? `Progresso real para a próxima faixa: ${beltProgress}/${beltTotal} aulas`
                : 'Próxima faixa: progressão manual'}
            </p>
          </div>
          <p className="text-xs text-[color:var(--text-soft)]">
            {progression.classesPerStripe > 0
              ? `Regra oficial da faixa ${beltLabel(progression.currentBelt)}: ${progression.classesPerStripe} aulas por grau${progression.beltTotal > 0 ? ` / ${progression.beltTotal} aulas para a próxima faixa` : ''}.`
              : `Regra oficial da faixa ${beltLabel(progression.currentBelt)}: progressão manual.`}
          </p>
        </div>
      </section>

      <section className="app-panel app-panel-pad">
        <div className="flex items-center gap-3">
          <div className="app-icon-shell">
            <Calendar size={18} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="app-section-label">Histórico</p>
            <h2 className="text-xl font-bold">Aulas frequentadas</h2>
            <p className="mt-1 text-xs text-[color:var(--text-soft)]">
              {filteredAttendances.length} aula{filteredAttendances.length === 1 ? '' : 's'} no período selecionado
            </p>
          </div>
        </div>

        <div className="mt-5">
          <div className="app-segment flex flex-wrap gap-2" role="tablist" aria-label="Período do histórico de aulas">
            {([
              { value: 'week', label: '7 dias' },
              { value: 'month', label: 'Mês' },
              { value: '3months', label: '3 meses' },
              { value: 'all', label: 'Todos' },
              { value: 'custom', label: 'Personalizado' },
            ] as Array<{ value: AttendancePeriodPreset; label: string }>).map((option) => (
              <button
                key={option.value}
                type="button"
                role="tab"
                aria-selected={historyPeriod === option.value}
                onClick={() => setHistoryPeriod(option.value)}
                className={`app-segment__button ${historyPeriod === option.value ? 'is-active' : ''}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <button
            type="button"
            onClick={() => setHistoryAdvancedOpen((value) => !value)}
            className="app-button app-button--ghost app-button--small"
            aria-expanded={historyAdvancedOpen}
          >
            <Filter size={14} />
            Mais filtros
            {historyAdvancedOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
        </div>

        {historyAdvancedOpen ? (
          <div className="mt-4 space-y-4">
            <label className="app-field">
              <span className="app-field__label">Nome da aula</span>
              <select
                value={historyClassTitle}
                onChange={(event) => setHistoryClassTitle(event.target.value)}
                className="app-select"
                disabled={availableClassTitles.length === 0}
              >
                <option value="">Todas as aulas</option>
                {availableClassTitles.map((title) => (
                  <option key={title} value={title}>{title}</option>
                ))}
              </select>
              {availableClassTitles.length === 0 ? (
                <span className="app-field__hint">Nenhum nome de aula disponível para este aluno ainda.</span>
              ) : null}
            </label>

            {historyPeriod === 'custom' ? (
              <div className="app-grid-2">
                <label className="app-field">
                  <span className="app-field__label">De</span>
                  <input
                    type="date"
                    value={historyCustomFrom}
                    onChange={(event) => setHistoryCustomFrom(event.target.value)}
                    className="app-input"
                  />
                </label>
                <label className="app-field">
                  <span className="app-field__label">Até</span>
                  <input
                    type="date"
                    value={historyCustomTo}
                    onChange={(event) => setHistoryCustomTo(event.target.value)}
                    className="app-input"
                  />
                </label>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => setHistorySortDir((value) => (value === 'desc' ? 'asc' : 'desc'))}
              className="app-button app-button--ghost app-button--small"
            >
              {historySortDir === 'desc' ? <ArrowDown size={14} /> : <ArrowUp size={14} />}
              {historySortDir === 'desc' ? 'Mais recentes primeiro' : 'Mais antigas primeiro'}
            </button>
          </div>
        ) : null}

        <div className="mt-5 app-list">
          {visibleAttendances.length === 0 ? (
            <div className="app-empty">Nenhuma aula encontrada no período selecionado.</div>
          ) : (
            visibleAttendances.map((attendance) => {
              const classInfo = classesById.get(attendance.classId);
              const refDate = (attendance.checkedInAt ?? classInfo?.scheduledStart ?? attendance.createdAt)?.toDate?.();
              const dateLabel = refDate ? refDate.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Sem data';
              const counts = attendance.countsAsAttendance ?? true;
              return (
                <div key={attendance.id} className="app-list-card flex items-start gap-4">
                  <div className="app-icon-shell">
                    {attendance.checkInMethod === 'qr' ? <QrCode size={16} /> : <UserCheck size={16} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold truncate">{classInfo?.title ?? 'Aula da academia'}</p>
                    <p className="mt-1 text-xs text-[color:var(--text-soft)]">{dateLabel}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className="app-badge app-badge--muted">{attendanceCheckInMethodLabel(attendance.checkInMethod)}</span>
                      {classInfo?.professorName ? (
                        <span className="app-badge app-badge--muted">Prof. {classInfo.professorName}</span>
                      ) : null}
                      {!counts ? <span className="app-badge app-badge--muted">Não computada</span> : null}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {filteredAttendances.length > historyVisibleCount ? (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setHistoryVisibleCount((value) => value + ATTENDANCE_PAGE_SIZE)}
              className="app-button app-button--ghost app-button--block"
            >
              Carregar mais ({filteredAttendances.length - historyVisibleCount} restantes)
            </button>
          </div>
        ) : null}
      </section>

      {student.videos && student.videos.length > 0 ? (
        <section className="app-panel app-panel-pad">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell">
              <Video size={18} />
            </div>
            <div>
              <p className="app-section-label">Vídeos</p>
              <h2 className="text-xl font-bold">Arquivo de vídeos</h2>
            </div>
          </div>

          <div className="mt-6 app-list">
            {student.videos.map((video) => (
              <div key={video.id} className="app-list-card">
                <AppVideoContent
                  title={video.title}
                  sourceUrl={video.url}
                  sourceKind={video.sourceKind}
                />
                <div className="mt-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold">{video.title}</p>
                    <span className="app-badge app-badge--muted">
                      {video.origin === 'submission' ? 'Enviado pelo aluno' : 'Luta oficial'}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[color:var(--text-soft)]">{video.date}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="app-panel app-panel-pad">
        <div className="flex items-center gap-3">
          <div className="app-icon-shell">
            <Clock size={18} />
          </div>
          <div>
            <p className="app-section-label">Histórico</p>
            <h2 className="text-xl font-bold">Linha do tempo</h2>
          </div>
        </div>

        <div className="mt-6 app-list">
          <div className="app-list-card flex items-start gap-4">
            <div className="app-icon-shell">
              <Calendar size={16} />
            </div>
            <div>
              <p className="text-sm font-bold">Início dos treinos</p>
              <p className="mt-1 text-xs text-[color:var(--text-soft)]">{formatDate(student.startDate)}</p>
            </div>
          </div>

          <div className="app-list-card flex items-start gap-4">
            <div className="app-icon-shell">
              <Award size={16} />
            </div>
            <div>
              <p className="text-sm font-bold">Última graduação</p>
              <p className="mt-1 text-xs text-[color:var(--text-soft)]">{formatDate(timelineLastGraduation)}</p>
            </div>
          </div>

          <div className="app-list-card flex items-start gap-4">
            <div className="app-icon-shell">
              <TrendingUp size={16} />
            </div>
            <div>
              <p className="text-sm font-bold">Último grau recebido</p>
              <p className="mt-1 text-xs text-[color:var(--text-soft)]">{formatDate(timelineLastStripeDate)}</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default StudentDetailView;
