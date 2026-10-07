import React, { useEffect, useMemo, useState } from 'react';
import { ALL_BELTS, beltLabel, getBeltMeta, getBlackBeltProgressForUser, getGradeProgressLabel, getUserProgressionSummary, type ProgressionRules } from '../beltCatalog';
import { BarChart3, ChevronRight, List, Search, SlidersHorizontal, UserX, X } from 'lucide-react';
import AvatarWithBelt from './AvatarWithBelt';
import BeltImage from './BeltImage';
import { CommitmentBadge } from './CommitmentBar';
import { resolveCommitment, summarizeMonthlyAttendanceByUser, type CommitmentResult } from '../commitmentScale';
import DateField from './DateField';
import StudentDetailView from '../views/StudentDetailView';
import type { FirestoreEntity } from '../services/firebase/data';
import type { AttendanceRecord, ClassRecord, GraduationApprovalRequestRecord } from '../services/firebase/models';
import type { BeltColor, User } from '../types';
import { t, getLocale, createDateFormatter } from '../i18n';
import './redesign/ranking.css';

type SortMode = 'name-asc' | 'name-desc' | 'belt-desc' | 'grade-desc' | 'commitment-desc' | 'commitment-asc';
type RosterSection = 'list' | 'ranking' | 'deactivated';
type RankingPeriodPreset = 'official-total' | 'mensal' | 'today' | '7d' | '30d' | '3m' | 'custom';
type StatusFilter = 'active' | 'inactive' | 'ALL';

const STATUS_FILTER_OPTIONS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'active', label: 'Ativos' },
  { value: 'inactive', label: 'Inativos' },
  { value: 'ALL', label: 'Todos' },
];

export interface StudentRosterProps {
  students: User[];
  deactivatedStudents?: User[];
  progressionRules?: ProgressionRules | null;
  graduationRequests?: Array<FirestoreEntity<GraduationApprovalRequestRecord>>;
  rankingAttendances?: Array<FirestoreEntity<AttendanceRecord>>;
  classes?: Array<FirestoreEntity<ClassRecord>>;
  academyName?: string;
  academies?: Array<{ id: string; name: string }>;
  selectedAcademyId?: string;
  onSelectAcademy?: (academyId: string) => void;
  enableAcademyFilter?: boolean;
  requireAcademySelection?: boolean;
  selectedStudentId?: string;
  onSelectStudent?: (studentId: string) => void;
  onApproveGraduationRequest?: (requestId: string) => Promise<void>;
  onUpdateStudentBeltGrade?: (payload: { userId: string; belt: string; grade: number; stripes?: number; kidsCategory?: string }) => Promise<void>;
  onSetStudentAttendanceBonus?: (payload: { userId: string; attendanceCountBonus: number }) => Promise<void>;
  onAdminUpdateStudentProfile?: (payload: {
    userId: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    cpf?: string;
    birthDate?: string;
    email?: string;
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
  focusSection?: RosterSection | null;
  onFocusSectionHandled?: () => void;
  viewerRole?: 'professor' | 'superadmin';
  onAdminSetUserMemberships?: (payload: { userId: string; memberships: string[] }) => Promise<void>;
  kicker?: string;
  title?: string;
  description?: string;
  emptySelectionMessage?: string;
  emptyResultsMessage?: string;
}

const RANKING_START_DATE_INPUT = '2026-05-06';
const MILLISECONDS_PER_DAY = 86_400_000;
const beltOrder = new Map(ALL_BELTS.map((belt, index) => [belt, index]));
const saoPauloDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const saoPauloMonthFormatter = createDateFormatter({
  timeZone: 'America/Sao_Paulo',
  month: 'long',
  year: 'numeric',
});

const rankingPeriodOptions: Array<{ value: RankingPeriodPreset; label: string }> = [
  { value: '3m', label: '3 meses' },
  { value: 'official-total', label: 'Total oficial' },
  { value: 'mensal', label: 'Mensal' },
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'custom', label: 'Periodo' },
];

function getStudentGrade(student: User) {
  // Faixa preta: grau por tempo (data) + override manual — fonte única, mesmo se stripes/grade
  // ainda estiver desatualizado (aluno antigo não re-salvo).
  const blackBelt = getBlackBeltProgressForUser(student);
  if (blackBelt) return blackBelt.degree;
  return Number(student.grade ?? student.stripes ?? 0);
}

function getProgressionHint(student: User, rules?: ProgressionRules | null): string | null {
  const prog = getUserProgressionSummary(student, rules);
  const parts: string[] = [];
  const gradeProgress = getGradeProgressLabel(student, rules);
  if (gradeProgress) {
    parts.push(t('{progress} grau', { progress: gradeProgress }));
  }
  if (prog.beltTotal > 0) {
    parts.push(t('{current}/{total} faixa', { current: prog.beltProgress, total: prog.beltTotal }));
  }
  return parts.length > 0 ? parts.join(' / ') : null;
}

// "Frequencia +/-" ordena pela NOTA do comprometimento (o numero do selo, ja normalizado entre
// Kids e Adulto), desempatando por aulas no mes e depois por nome. Sem presencas carregadas o
// mapa vem vazio e a ordenacao cai para nome, em vez de embaralhar a lista com zeros.
function sortStudents(
  students: User[],
  sortMode: SortMode,
  commitmentByUserId?: Map<string, CommitmentResult>,
) {
  const commitmentSort = sortMode === 'commitment-desc' || sortMode === 'commitment-asc';
  const hasCommitment = commitmentSort && !!commitmentByUserId && commitmentByUserId.size > 0;

  return [...students].sort((left, right) => {
    if (hasCommitment) {
      const leftCommitment = commitmentByUserId!.get(left.id);
      const rightCommitment = commitmentByUserId!.get(right.id);
      const leftScore = leftCommitment?.score ?? 0;
      const rightScore = rightCommitment?.score ?? 0;
      const scoreDiff = sortMode === 'commitment-desc'
        ? rightScore - leftScore
        : leftScore - rightScore;

      if (scoreDiff !== 0) {
        return scoreDiff;
      }

      const leftClasses = leftCommitment?.classes ?? 0;
      const rightClasses = rightCommitment?.classes ?? 0;
      const classesDiff = sortMode === 'commitment-desc'
        ? rightClasses - leftClasses
        : leftClasses - rightClasses;

      if (classesDiff !== 0) {
        return classesDiff;
      }

      return left.name.localeCompare(right.name, 'pt-BR');
    }

    if (sortMode === 'name-asc' || commitmentSort) {
      return left.name.localeCompare(right.name, 'pt-BR');
    }

    if (sortMode === 'name-desc') {
      return right.name.localeCompare(left.name, 'pt-BR');
    }

    if (sortMode === 'belt-desc') {
      const beltDiff = (beltOrder.get(right.belt) ?? -1) - (beltOrder.get(left.belt) ?? -1);
      if (beltDiff !== 0) {
        return beltDiff;
      }

      const gradeDiff = getStudentGrade(right) - getStudentGrade(left);
      if (gradeDiff !== 0) {
        return gradeDiff;
      }

      return left.name.localeCompare(right.name, 'pt-BR');
    }

    const gradeDiff = getStudentGrade(right) - getStudentGrade(left);
    if (gradeDiff !== 0) {
      return gradeDiff;
    }

    const beltDiff = (beltOrder.get(right.belt) ?? -1) - (beltOrder.get(left.belt) ?? -1);
    if (beltDiff !== 0) {
      return beltDiff;
    }

    return left.name.localeCompare(right.name, 'pt-BR');
  });
}

function toSaoPauloDateInput(date = new Date()): string {
  const parts = saoPauloDateFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value ?? '2026';
  const month = parts.find((part) => part.type === 'month')?.value ?? '05';
  const day = parts.find((part) => part.type === 'day')?.value ?? '06';
  return `${year}-${month}-${day}`;
}

function formatDateInput(value: string): string {
  const [year, month, day] = value.split('-');
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatMonthLabel(date: Date): string {
  const label = saoPauloMonthFormatter.format(date);
  return label.charAt(0).toLocaleUpperCase('pt-BR') + label.slice(1);
}

function dateInputToSaoPauloDate(value: string, boundary: 'start' | 'end'): Date {
  const safeValue = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : RANKING_START_DATE_INPUT;
  const time = boundary === 'start' ? '00:00:00.000' : '23:59:59.999';
  return new Date(`${safeValue}T${time}-03:00`);
}

function addDaysToInput(value: string, days: number): string {
  const baseDate = dateInputToSaoPauloDate(value, 'start');
  return toSaoPauloDateInput(new Date(baseDate.getTime() + days * MILLISECONDS_PER_DAY));
}

function addMonthsToInput(value: string, months: number): string {
  const baseDate = dateInputToSaoPauloDate(value, 'start');
  const shifted = new Date(baseDate);
  shifted.setMonth(shifted.getMonth() + months);
  return toSaoPauloDateInput(shifted);
}

function clampRankingStart(value: string): string {
  return value && value >= RANKING_START_DATE_INPUT ? value : RANKING_START_DATE_INPUT;
}

function resolveRankingPeriod(
  preset: RankingPeriodPreset,
  customStartDate: string,
  customEndDate: string,
) {
  const todayInput = toSaoPauloDateInput();

  if (preset === 'mensal') {
    const monthStartInput = `${todayInput.slice(0, 8)}01`;
    const startDate = dateInputToSaoPauloDate(monthStartInput, 'start');
    return {
      startInput: monthStartInput,
      endInput: todayInput,
      startDate,
      endDate: dateInputToSaoPauloDate(todayInput, 'end'),
      label: formatMonthLabel(startDate),
    };
  }

  if (preset === 'today') {
    return {
      startInput: todayInput,
      endInput: todayInput,
      startDate: dateInputToSaoPauloDate(todayInput, 'start'),
      endDate: dateInputToSaoPauloDate(todayInput, 'end'),
      label: t('Hoje ({date})', { date: formatDateInput(todayInput) }),
    };
  }

  // t('3 meses') nao passa por clampRankingStart de proposito: o padrao do ranking precisa
  // cobrir 3 meses de verdade, mesmo quando a janela comeca antes da epoca oficial.
  if (preset === '3m') {
    const startInput = addMonthsToInput(todayInput, -3);
    return {
      startInput,
      endInput: todayInput,
      startDate: dateInputToSaoPauloDate(startInput, 'start'),
      endDate: dateInputToSaoPauloDate(todayInput, 'end'),
      label: t('Ultimos 3 meses ({start} ate {end})', { start: formatDateInput(startInput), end: formatDateInput(todayInput) }),
    };
  }

  if (preset === '7d' || preset === '30d') {
    const days = preset === '7d' ? 6 : 29;
    const startInput = clampRankingStart(addDaysToInput(todayInput, -days));
    return {
      startInput,
      endInput: todayInput,
      startDate: dateInputToSaoPauloDate(startInput, 'start'),
      endDate: dateInputToSaoPauloDate(todayInput, 'end'),
      label: t('{start} ate {end}', { start: formatDateInput(startInput), end: formatDateInput(todayInput) }),
    };
  }

  if (preset === 'custom') {
    const startInput = clampRankingStart(customStartDate);
    const endCandidate = customEndDate || todayInput;
    const endInput = endCandidate < startInput ? startInput : endCandidate;
    return {
      startInput,
      endInput,
      startDate: dateInputToSaoPauloDate(startInput, 'start'),
      endDate: dateInputToSaoPauloDate(endInput, 'end'),
      label: t('{start} ate {end}', { start: formatDateInput(startInput), end: formatDateInput(endInput) }),
    };
  }

  return {
    startInput: RANKING_START_DATE_INPUT,
    endInput: '',
    startDate: dateInputToSaoPauloDate(RANKING_START_DATE_INPUT, 'start'),
    endDate: null,
    label: t('Total oficial'),
  };
}

function getAttendanceMillis(attendance: FirestoreEntity<AttendanceRecord>): number {
  return attendance.checkedInAt?.toMillis() ?? attendance.createdAt?.toMillis() ?? 0;
}

function formatNumber(value: number): string {
  return value.toLocaleString(getLocale());
}

function formatAverage(value: number): string {
  return value.toLocaleString(getLocale(), { maximumFractionDigits: 1 });
}

const StudentRoster: React.FC<StudentRosterProps> = ({
  students,
  deactivatedStudents = [],
  progressionRules,
  graduationRequests = [],
  rankingAttendances = [],
  classes = [],
  academyName,
  academies = [],
  selectedAcademyId = '',
  onSelectAcademy,
  enableAcademyFilter = false,
  requireAcademySelection = false,
  selectedStudentId = '',
  onSelectStudent,
  onApproveGraduationRequest,
  onUpdateStudentBeltGrade,
  onSetStudentAttendanceBonus,
  onAdminUpdateStudentProfile,
  onAdminUpdateStudentTimeline,
  onAdminUpdateStudentPhoto,
  onDeactivateStudent,
  onActivateStudent,
  focusSection,
  onFocusSectionHandled,
  viewerRole,
  onAdminSetUserMemberships,
  kicker = t('Roster'),
  title = t('Alunos com leitura mais limpa e mais forte.'),
  description,
  emptySelectionMessage = t('Escolha uma unidade da LEVEL para visualizar os alunos daquele local.'),
  emptyResultsMessage = t('Nenhum aluno encontrado com os filtros atuais.'),
}) => {
  const [activeSection, setActiveSection] = useState<RosterSection>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBelt, setFilterBelt] = useState<BeltColor | 'ALL'>('ALL');
  const [filterType, setFilterType] = useState<'ALL' | 'Adulto' | 'Kids'>('ALL');
  const [filterGrade, setFilterGrade] = useState<'ALL' | string>('ALL');
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('active');
  const [sortMode, setSortMode] = useState<SortMode>('name-asc');
  const [rankingPeriod, setRankingPeriod] = useState<RankingPeriodPreset>('3m');
  const [rankingFiltersOpen, setRankingFiltersOpen] = useState(false);
  const [customStartDate, setCustomStartDate] = useState(RANKING_START_DATE_INPUT);
  const [customEndDate, setCustomEndDate] = useState(toSaoPauloDateInput());
  const [internalSelectedStudentId, setInternalSelectedStudentId] = useState(selectedStudentId);
  const canManageDeactivated = Boolean(onDeactivateStudent || onActivateStudent);
  // Quando existe a aba dedicada t('Desativados'), os suspensos ja vem fora da lista
  // e o filtro de situacao seria redundante.
  const showStatusFilter = !canManageDeactivated;
  const shouldChooseAcademyFirst = requireAcademySelection && !selectedAcademyId;
  const showAcademyFilter = (enableAcademyFilter || requireAcademySelection) && academies.length > 0;
  const academyNameById = useMemo(() => new Map(academies.map((entry) => [entry.id, entry.name])), [academies]);
  const currentDateInput = toSaoPauloDateInput();
  const periodRange = useMemo(
    () => resolveRankingPeriod(rankingPeriod, customStartDate, customEndDate),
    [customEndDate, customStartDate, rankingPeriod],
  );
  const isOfficialTotalRanking = rankingPeriod === 'official-total';

  const graduationRequestByUserId = useMemo(() => {
    const next = new Map<string, FirestoreEntity<GraduationApprovalRequestRecord>>();
    graduationRequests
      .filter((entry) => entry.status === 'pending')
      .forEach((entry) => next.set(entry.userId, entry));
    return next;
  }, [graduationRequests]);

  const scopedStudents = useMemo(() => (
    students.filter((student) => {
      if (!enableAcademyFilter || !selectedAcademyId) {
        return true;
      }

      return student.branchId === selectedAcademyId;
    })
  ), [enableAcademyFilter, selectedAcademyId, students]);

  const gradeOptions = useMemo(() => (
    [...new Set(scopedStudents.map((student) => getStudentGrade(student)))]
      .sort((left, right) => right - left)
  ), [scopedStudents]);

  const filteredStudents = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase('pt-BR');
    return scopedStudents.filter((student) => {
      const matchesSearch = !query || student.name.toLocaleLowerCase('pt-BR').includes(query);
      const matchesBelt = filterBelt === 'ALL' || student.belt === filterBelt;
      const matchesType = filterType === 'ALL' || student.type === filterType;
      const matchesGrade = filterGrade === 'ALL' || getStudentGrade(student) === Number(filterGrade);
      const matchesStatus = !showStatusFilter || filterStatus === 'ALL'
        || (filterStatus === 'inactive'
          ? student.status === 'suspended'
          : student.status !== 'suspended');
      return matchesSearch && matchesBelt && matchesType && matchesGrade && matchesStatus;
    });
  }, [filterBelt, filterGrade, filterStatus, filterType, scopedStudents, searchTerm, showStatusFilter]);


  // Aula "realizada": finalizada, em andamento, ou que simplesmente já passou do horário —
  // muitos professores nunca clicam em "Finalizar", e exigir status 'finished' zerava o
  // ranking por período dessas unidades (mesma regra usada na Central).
  const finishedClassIds = useMemo(
    () => new Set(
      classes
        .filter((lesson) => {
          if (lesson.status === 'cancelled') {
            return false;
          }

          if (lesson.status === 'finished' || lesson.status === 'active') {
            return true;
          }

          const start = lesson.scheduledStart?.toDate();
          return !!start && start.getTime() < Date.now();
        })
        .map((lesson) => lesson.id),
    ),
    [classes],
  );
  const hasClassData = classes.length > 0;
  const scheduledStartByClassId = useMemo(
    () => new Map(classes.map((lesson) => [lesson.id, lesson.scheduledStart])),
    [classes],
  );

  const periodAttendances = useMemo(() => {
    if (isOfficialTotalRanking) {
      return [];
    }

    const startMillis = periodRange.startDate.getTime();
    const endMillis = periodRange.endDate?.getTime() ?? Number.POSITIVE_INFINITY;
    return rankingAttendances.filter((attendance) => {
      if (enableAcademyFilter && selectedAcademyId && attendance.academyId !== selectedAcademyId) {
        return false;
      }

      if (attendance.countsAsAttendance === false) {
        return false;
      }

      // Conta apenas presencas de aulas finalizadas pelo professor (status 'finished').
      // Sem dados de aula carregados (ex.: superadmin em "Toda a rede") o join e ignorado
      // para nao zerar o ranking de rede.
      if (hasClassData && !finishedClassIds.has(attendance.classId)) {
        return false;
      }

      const attendanceMillis = getAttendanceMillis(attendance);
      return attendanceMillis >= startMillis && attendanceMillis <= endMillis;
    });
  }, [enableAcademyFilter, finishedClassIds, hasClassData, isOfficialTotalRanking, periodRange.endDate, periodRange.startDate, rankingAttendances, selectedAcademyId]);

  const attendanceCountByUserId = useMemo(() => {
    const next = new Map<string, number>();
    periodAttendances.forEach((attendance) => {
      next.set(attendance.userId, (next.get(attendance.userId) ?? 0) + 1);
    });
    return next;
  }, [periodAttendances]);

  const rankingRows = useMemo(() => (
    filteredStudents
      .map((student) => ({
        student,
        attendanceCount: isOfficialTotalRanking
          ? Math.max(0, Math.floor(student.attendanceCount ?? 0))
          : attendanceCountByUserId.get(student.id) ?? 0,
      }))
      .sort((left, right) => {
        const attendanceDiff = right.attendanceCount - left.attendanceCount;
        if (attendanceDiff !== 0) {
          return attendanceDiff;
        }

        return left.student.name.localeCompare(right.student.name, 'pt-BR');
      })
  ), [attendanceCountByUserId, filteredStudents, isOfficialTotalRanking]);

  const topRankByUserId = useMemo(() => {
    const next = new Map<string, number>();
    rankingRows
      .filter((row) => row.attendanceCount > 0)
      .slice(0, 3)
      .forEach((row, index) => next.set(row.student.id, index + 1));
    return next;
  }, [rankingRows]);

  const rankingTotalAttendances = rankingRows.reduce((total, row) => total + row.attendanceCount, 0);

  const rankingAverage = rankingRows.length === 0 ? 0 : rankingTotalAttendances / rankingRows.length;
  const rankingLeader = rankingRows.find((row) => row.attendanceCount > 0) ?? null;
  const topChartRows = rankingRows.filter((row) => row.attendanceCount > 0).slice(0, 10);
  const maxTopAttendance = Math.max(1, ...topChartRows.map((row) => row.attendanceCount));
  const beltBreakdown = useMemo(() => {
    const byBelt = new Map<BeltColor, { belt: BeltColor; attendanceCount: number; studentCount: number }>();

    rankingRows.forEach((row) => {
      const current = byBelt.get(row.student.belt) ?? {
        belt: row.student.belt,
        attendanceCount: 0,
        studentCount: 0,
      };
      current.attendanceCount += row.attendanceCount;
      current.studentCount += 1;
      byBelt.set(row.student.belt, current);
    });

    return [...byBelt.values()]
      .sort((left, right) => right.attendanceCount - left.attendanceCount || (beltOrder.get(right.belt) ?? 0) - (beltOrder.get(left.belt) ?? 0));
  }, [rankingRows]);
  const maxBeltAttendance = Math.max(1, ...beltBreakdown.map((row) => row.attendanceCount));

  const allStudents = useMemo(() => [...students, ...deactivatedStudents], [students, deactivatedStudents]);

  // Comprometimento do mes (vide commitmentScale.ts). Uma passada so nas presencas e a trilha
  // (Kids x Adulto) resolvida aqui dentro, para nao chamar a progressao a cada render.
  //
  // Sem presenca carregada nao da para distinguir "nao treinou" de "ainda nao chegou": nesse
  // caso o selo simplesmente nao aparece, em vez de marcar a academia inteira de faltosa.
  const hasCommitmentData = rankingAttendances.length > 0;
  const commitmentByUserId = useMemo(() => {
    const result = new Map<string, CommitmentResult>();
    if (!hasCommitmentData) {
      return result;
    }

    const scopedAcademyId = enableAcademyFilter && selectedAcademyId ? selectedAcademyId : undefined;
    const summaries = summarizeMonthlyAttendanceByUser({
      attendances: rankingAttendances,
      academyId: scopedAcademyId,
      classStartById: scheduledStartByClassId,
    });

    allStudents.forEach((student) => {
      const summary = summaries.get(student.id);
      result.set(student.id, resolveCommitment({
        classes: summary?.classes ?? 0,
        countedClasses: summary?.countedClasses ?? 0,
        weeksWithClasses: summary?.weeksWithClasses ?? 0,
        track: getUserProgressionSummary(student, progressionRules).track,
        monthLabel: summary?.monthLabel,
      }));
    });

    return result;
  }, [allStudents, enableAcademyFilter, hasCommitmentData, progressionRules, rankingAttendances, scheduledStartByClassId, selectedAcademyId]);

  const visibleStudents = useMemo(
    () => sortStudents(filteredStudents, sortMode, commitmentByUserId),
    [commitmentByUserId, filteredStudents, sortMode],
  );

  useEffect(() => {
    if (!selectedStudentId) {
      return;
    }

    if (allStudents.some((student) => student.id === selectedStudentId)) {
      setInternalSelectedStudentId(selectedStudentId);
    }
  }, [selectedStudentId, allStudents]);

  useEffect(() => {
    if (internalSelectedStudentId && allStudents.length > 0 && !allStudents.some((student) => student.id === internalSelectedStudentId)) {
      setInternalSelectedStudentId('');
      onSelectStudent?.('');
    }
  }, [internalSelectedStudentId, onSelectStudent, allStudents]);

  useEffect(() => {
    if (!focusSection) {
      return;
    }

    if (focusSection === 'deactivated' && !canManageDeactivated) {
      onFocusSectionHandled?.();
      return;
    }

    setActiveSection(focusSection);
    onFocusSectionHandled?.();
  }, [canManageDeactivated, focusSection, onFocusSectionHandled]);

  const selectedStudent = internalSelectedStudentId
    ? allStudents.find((student) => student.id === internalSelectedStudentId) ?? null
    : null;

  function openStudent(studentId: string) {
    setInternalSelectedStudentId(studentId);
    onSelectStudent?.(studentId);
  }

  if (selectedStudent) {
    return (
      <StudentDetailView
        student={selectedStudent}
        progressionRules={progressionRules}
        graduationRequest={graduationRequestByUserId.get(selectedStudent.id) ?? null}
        classes={classes}
        onBack={() => {
          setInternalSelectedStudentId('');
          onSelectStudent?.('');
        }}
        onApproveGraduationRequest={onApproveGraduationRequest}
        onUpdateStudentBeltGrade={onUpdateStudentBeltGrade}
        onSetStudentAttendanceBonus={onSetStudentAttendanceBonus}
        onAdminUpdateStudentProfile={onAdminUpdateStudentProfile}
        onAdminUpdateStudentTimeline={onAdminUpdateStudentTimeline}
        onAdminUpdateStudentPhoto={onAdminUpdateStudentPhoto}
        academies={academies}
        viewerRole={viewerRole}
        onAdminSetUserMemberships={onAdminSetUserMemberships}
        onDeactivateStudent={onDeactivateStudent}
        onActivateStudent={onActivateStudent}
      />
    );
  }

  // ─── Ranking (redesign): pódio + resumo + classificação. Mesmos dados e regras da versão anterior;
  // Lista e Desativados continuam com o layout de antes (render abaixo).
  if (activeSection === 'ranking' && !shouldChooseAcademyFirst) {
    const podiumRows = rankingRows.filter((row) => row.attendanceCount > 0).slice(0, 3);
    // Ordem visual do pódio: 2º · 1º · 3º (só os que existem).
    const podiumSlots = [
      podiumRows[1] ? { row: podiumRows[1], place: 2 } : null,
      podiumRows[0] ? { row: podiumRows[0], place: 1 } : null,
      podiumRows[2] ? { row: podiumRows[2], place: 3 } : null,
    ].filter((slot): slot is { row: (typeof rankingRows)[number]; place: number } => slot !== null);
    const classificationRows = rankingRows.slice(podiumRows.length);
    const presencesLabel = (count: number) => (count === 1 ? t('presença') : t('presenças'));

    const renderAvatar = (student: User, size: 'lg' | 'md') => (
      <span
        className={`rd-rank__avatar rd-rank__avatar--${size}`}
        style={{ '--rd-rank-ring': getBeltMeta(student.belt).breakdownColor } as React.CSSProperties}
      >
        {student.avatar ? (
          <img src={student.avatar} alt="" loading="lazy" />
        ) : (
          <span>{(student.name || '?').trim().charAt(0).toUpperCase() || '?'}</span>
        )}
      </span>
    );

    const renderMiniBelt = (student: User) => (
      <BeltImage
        belt={student.belt}
        stripes={getStudentGrade(student)}
        blackBelt={getBlackBeltProgressForUser(student)}
        className="rd-rank__belt"
      />
    );

    const filterCount = [
      searchTerm.trim() !== '',
      filterBelt !== 'ALL',
      filterGrade !== 'ALL',
      filterType !== 'ALL',
      showStatusFilter && filterStatus !== 'active',
    ].filter(Boolean).length;

    return (
      <div className="view-shell rd-rank">
        <header className="rd-rank__header">
          <div className="rd-rank__header-row">
            <p className="rd-rank__eyebrow">
              {t('Academia')}{academyName ? ` · ${academyName}` : ''}
            </p>
            <button
              type="button"
              className="rd-rank__filters-btn"
              onClick={() => setRankingFiltersOpen(true)}
              aria-haspopup="dialog"
            >
              <SlidersHorizontal size={16} />
              {t('Filtros')}
              {filterCount > 0 ? <span className="rd-rank__filters-count">{filterCount}</span> : null}
            </button>
          </div>
          <h1 className="rd-rank__title">{t('Alunos')}</h1>

          <div className="rd-rank__tabs" role="tablist" aria-label={t('Secoes de alunos')}>
            <button type="button" role="tab" aria-selected={false} onClick={() => setActiveSection('list')} className="rd-rank__tab">
              {t('Lista')}
            </button>
            <button type="button" role="tab" aria-selected className="rd-rank__tab is-active">
              {t('Ranking')}
            </button>
            {canManageDeactivated ? (
              <button type="button" role="tab" aria-selected={false} onClick={() => setActiveSection('deactivated')} className="rd-rank__tab">
                {t('Desativados')}
                {deactivatedStudents.length > 0 ? <span className="rd-rank__tab-count">{deactivatedStudents.length}</span> : null}
              </button>
            ) : null}
          </div>
        </header>

        <section className="rd-rank__stage" aria-label={t('Ranking')}>
          <div className="rd-rank__periods" role="group" aria-label={t('Período do ranking')}>
            {rankingPeriodOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setRankingPeriod(option.value)}
                aria-pressed={rankingPeriod === option.value}
                className={`rd-rank__period ${rankingPeriod === option.value ? 'is-active' : ''}`.trim()}
              >
                {t(option.label)}
              </button>
            ))}
          </div>

          {rankingPeriod === 'custom' ? (
            <div className="rd-rank__dates">
              <label className="app-field">
                <span className="app-field__label">{t('Inicio')}</span>
                <DateField
                  min={RANKING_START_DATE_INPUT}
                  max={currentDateInput}
                  value={customStartDate}
                  onChange={(value) => setCustomStartDate(clampRankingStart(value))}
                />
              </label>
              <label className="app-field">
                <span className="app-field__label">{t('Fim')}</span>
                <DateField
                  min={clampRankingStart(customStartDate)}
                  max={currentDateInput}
                  value={customEndDate}
                  onChange={setCustomEndDate}
                />
              </label>
            </div>
          ) : null}

          <p className="rd-rank__note">
            {isOfficialTotalRanking
              ? t('Ranking oficial: usa a contagem registrada no perfil do aluno.')
              : t('Ranking analitico: {period}. Conta presencas de aulas ja realizadas. Nao altera faixa, grau ou contagem oficial.', { period: periodRange.label })}
          </p>

          {podiumSlots.length > 0 ? (
            <div className={`rd-rank__podium rd-rank__podium--${podiumSlots.length}`}>
              <span className="rd-rank__confetti" aria-hidden="true">
                <i /><i /><i /><i /><i /><i /><i /><i />
              </span>
              {podiumSlots.map(({ row, place }) => (
                <button
                  key={row.student.id}
                  type="button"
                  className={`rd-rank__place rd-rank__place--${place}`}
                  onClick={() => openStudent(row.student.id)}
                  aria-label={`${place}º · ${row.student.name} · ${formatNumber(row.attendanceCount)} ${presencesLabel(row.attendanceCount)}`}
                >
                  <span className="rd-rank__place-person">
                    {renderAvatar(row.student, 'lg')}
                    <span className="rd-rank__place-name">{row.student.name}</span>
                    {renderMiniBelt(row.student)}
                    <span className="rd-rank__place-count">{formatNumber(row.attendanceCount)}</span>
                    <span className="rd-rank__place-unit">{presencesLabel(row.attendanceCount)}</span>
                  </span>
                  <span className="rd-rank__block" aria-hidden="true">
                    <span>{place}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="rd-rank__stage-empty">{t('Nenhuma presenca encontrada neste periodo.')}</div>
          )}
        </section>

        <section className="rd-rank__sheet">
          <div className="rd-rank__kpis">
            <article className="rd-rank__kpi">
              <p className="rd-rank__kpi-label">{t('Alunos no filtro')}</p>
              <p className="rd-rank__kpi-value">{formatNumber(rankingRows.length)}</p>
              <p className="rd-rank__kpi-note">{selectedAcademyId ? academyNameById.get(selectedAcademyId) ?? t('Unidade selecionada') : (academyName ?? t('Base atual'))}</p>
            </article>
            <article className="rd-rank__kpi">
              <p className="rd-rank__kpi-label">{t('Presencas')}</p>
              <p className="rd-rank__kpi-value">{formatNumber(rankingTotalAttendances)}</p>
              <p className="rd-rank__kpi-note">{periodRange.label}</p>
            </article>
            <article className="rd-rank__kpi">
              <p className="rd-rank__kpi-label">{t('Media')}</p>
              <p className="rd-rank__kpi-value">{formatAverage(rankingAverage)}</p>
              <p className="rd-rank__kpi-note">{t('Presencas por aluno')}</p>
            </article>
            <article className="rd-rank__kpi">
              <p className="rd-rank__kpi-label">{t('Lider')}</p>
              <p className="rd-rank__kpi-value">{rankingLeader ? formatNumber(rankingLeader.attendanceCount) : '0'}</p>
              <p className="rd-rank__kpi-note">{rankingLeader?.student.name ?? t('Sem presencas no periodo')}</p>
            </article>
          </div>

          <div className="rd-rank__section-head">
            <h2 className="rd-rank__section-title">{t('Classificação')}</h2>
            <span className="rd-rank__section-meta">
              {rankingRows.length === 1 ? t('1 aluno') : t('{count} alunos', { count: formatNumber(rankingRows.length) })}
            </span>
          </div>

          {rankingRows.length === 0 ? (
            <div className="app-empty">{emptyResultsMessage}</div>
          ) : classificationRows.length > 0 ? (
            <div className="rd-rank__list">
              {classificationRows.map((row, index) => {
                const position = podiumRows.length + index + 1;
                const commitment = commitmentByUserId.get(row.student.id);
                return (
                  <button
                    key={row.student.id}
                    type="button"
                    className="rd-rank__row"
                    onClick={() => openStudent(row.student.id)}
                  >
                    <span className="rd-rank__position">{position}º</span>
                    {renderAvatar(row.student, 'md')}
                    <span className="rd-rank__row-main">
                      <span className="rd-rank__row-name">{row.student.name}</span>
                      <span className="rd-rank__row-meta">
                        {academyNameById.get(row.student.branchId) ?? academyName ?? t('Academia')} / {t('Faixa {belt}', { belt: beltLabel(row.student.belt) })} / {t('Grau {grade}', { grade: getStudentGrade(row.student) })}
                      </span>
                      <span className="rd-rank__row-tags">
                        {renderMiniBelt(row.student)}
                        {commitment ? <CommitmentBadge commitment={commitment} /> : null}
                      </span>
                    </span>
                    <span className="rd-rank__row-count">
                      <strong>{formatNumber(row.attendanceCount)}</strong>
                      <small>{presencesLabel(row.attendanceCount)}</small>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          <div className="rd-rank__section-head rd-rank__section-head--stack">
            <p className="rd-rank__section-eyebrow">{t('Top 10')}</p>
            <h2 className="rd-rank__section-title">{t('Mais frequentes')}</h2>
          </div>
          {topChartRows.length > 0 ? (
            <div className="rd-rank__bars">
              {topChartRows.map((row, index) => (
                <div key={row.student.id} className="rd-rank__bar-row">
                  <div className="rd-rank__bar-head">
                    <strong>#{index + 1} {row.student.name}</strong>
                    <span>{formatNumber(row.attendanceCount)}</span>
                  </div>
                  <div className="rd-rank__bar-track">
                    <span style={{ width: `${Math.max(8, (row.attendanceCount / maxTopAttendance) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="app-empty">{t('Nenhuma presenca encontrada neste periodo.')}</div>
          )}

          <div className="rd-rank__section-head rd-rank__section-head--stack">
            <p className="rd-rank__section-eyebrow">{t('Faixas')}</p>
            <h2 className="rd-rank__section-title">{t('Presencas por faixa')}</h2>
          </div>
          {beltBreakdown.length > 0 ? (
            <div className="rd-rank__bars">
              {beltBreakdown.map((row) => (
                <div key={row.belt} className="rd-rank__bar-row">
                  <div className="rd-rank__bar-head">
                    <strong>
                      <span className="rd-rank__swatch" style={{ background: getBeltMeta(row.belt).breakdownColor }} aria-hidden="true" />
                      {beltLabel(row.belt)}
                    </strong>
                    <span>{t('{count} presencas', { count: formatNumber(row.attendanceCount) })}</span>
                  </div>
                  <div className="rd-rank__bar-track">
                    <span style={{ width: `${row.attendanceCount > 0 ? Math.max(8, (row.attendanceCount / maxBeltAttendance) * 100) : 0}%` }} />
                  </div>
                  <p className="rd-rank__bar-note">{row.studentCount === 1 ? t('1 aluno') : t('{count} alunos', { count: formatNumber(row.studentCount) })}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="app-empty">{t('Nenhuma faixa para os filtros atuais.')}</div>
          )}
        </section>

        {rankingFiltersOpen ? (
          <div className="lv-backdrop rd-rank__backdrop" onClick={() => setRankingFiltersOpen(false)}>
            <div
              className="lv-sheet rd-rank__filters"
              role="dialog"
              aria-modal="true"
              aria-label={t('Filtros')}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="lv-sheet__grip" aria-hidden="true" />
              <div className="lv-sheet__head">
                <h2 className="rd-rank__section-title">{t('Filtros')}</h2>
                <button type="button" className="lv-icon-btn" onClick={() => setRankingFiltersOpen(false)} aria-label={t('Fechar')}>
                  <X size={20} />
                </button>
              </div>

              <div className="rd-rank__filter-fields">
                {showAcademyFilter ? (
                  <label className="app-field">
                    <span className="app-field__label">{t('Unidade em foco')}</span>
                    <select value={selectedAcademyId} onChange={(event) => onSelectAcademy?.(event.target.value)} className="app-select">
                      <option value="">{enableAcademyFilter ? t('Todas as unidades') : t('Selecione uma unidade')}</option>
                      {academies.map((academyOption) => (
                        <option key={academyOption.id} value={academyOption.id}>{academyOption.name}</option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <label className="app-field">
                  <span className="app-field__label">{t('Buscar aluno')}</span>
                  <div className="app-search">
                    <Search size={18} />
                    <input
                      type="text"
                      placeholder={t('Nome ou sobrenome')}
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      className="app-input pl-11"
                    />
                  </div>
                </label>

                <label className="app-field">
                  <span className="app-field__label">{t('Faixa')}</span>
                  <select value={filterBelt} onChange={(event) => setFilterBelt(event.target.value as BeltColor | 'ALL')} className="app-select">
                    <option value="ALL">{t('Todas as faixas')}</option>
                    {ALL_BELTS.map((belt) => (
                      <option key={belt} value={belt}>{beltLabel(belt)}</option>
                    ))}
                  </select>
                </label>

                <label className="app-field">
                  <span className="app-field__label">{t('Grau')}</span>
                  <select value={filterGrade} onChange={(event) => setFilterGrade(event.target.value)} className="app-select">
                    <option value="ALL">{t('Todos os graus')}</option>
                    {gradeOptions.map((grade) => (
                      <option key={grade} value={grade}>{grade}</option>
                    ))}
                  </select>
                </label>

                {showStatusFilter ? (
                  <div className="rd-rank__chips">
                    {STATUS_FILTER_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setFilterStatus(option.value)}
                        aria-pressed={filterStatus === option.value}
                        className={`rd-rank__chip ${filterStatus === option.value ? 'is-active' : ''}`.trim()}
                      >
                        {t(option.label)}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="rd-rank__chips">
                  {['ALL', 'Adulto', 'Kids'].map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setFilterType(item as 'ALL' | 'Adulto' | 'Kids')}
                      aria-pressed={filterType === item}
                      className={`rd-rank__chip ${filterType === item ? 'is-active' : ''}`.trim()}
                    >
                      {item === 'ALL' ? t('Todos') : t(item)}
                    </button>
                  ))}
                </div>
              </div>

              <button type="button" className="lv-btn lv-btn--primary lv-btn--block" onClick={() => setRankingFiltersOpen(false)}>
                {t('Ver ranking')}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="view-shell">
      <section className="app-panel app-panel--hero app-panel-pad">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="app-section-label">{kicker}</p>
            <h1 className="app-section-title">{title}</h1>
            <p className="app-section-copy">
              {description ?? academyName ?? t('Selecione uma unidade da LEVEL para abrir a base de alunos.')}
            </p>
          </div>
        </div>

        <div className="app-segment app-segment--block mt-6 student-roster__section-tabs" role="tablist" aria-label={t('Secoes de alunos')}>
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'list'}
            onClick={() => setActiveSection('list')}
            className={`app-segment__button ${activeSection === 'list' ? 'is-active' : ''}`}
          >
            <List size={16} />
            {t('Lista')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'ranking'}
            onClick={() => setActiveSection('ranking')}
            className={`app-segment__button ${activeSection === 'ranking' ? 'is-active' : ''}`}
          >
            <BarChart3 size={16} />
            {t('Ranking')}
          </button>
          {canManageDeactivated ? (
            <button
              type="button"
              role="tab"
              aria-selected={activeSection === 'deactivated'}
              onClick={() => setActiveSection('deactivated')}
              className={`app-segment__button ${activeSection === 'deactivated' ? 'is-active' : ''}`}
            >
              <UserX size={16} />
              {t('Desativados')}
              {deactivatedStudents.length > 0 ? (
                <span className="app-badge app-badge--muted" style={{ marginLeft: 4 }}>{deactivatedStudents.length}</span>
              ) : null}
            </button>
          ) : null}
        </div>

        {showAcademyFilter ? (
          <label className="app-field mt-6 max-w-sm">
            <span className="app-field__label">{t('Unidade em foco')}</span>
            <select value={selectedAcademyId} onChange={(event) => onSelectAcademy?.(event.target.value)} className="app-select">
              <option value="">{enableAcademyFilter ? t('Todas as unidades') : t('Selecione uma unidade')}</option>
              {academies.map((academyOption) => (
                <option key={academyOption.id} value={academyOption.id}>{academyOption.name}</option>
              ))}
            </select>
          </label>
        ) : null}

        {!shouldChooseAcademyFirst ? (
          <>
            <div className="mt-6 student-roster__filter-grid">
              <label className="app-field student-roster__search">
                <span className="app-field__label">{t('Buscar aluno')}</span>
                <div className="app-search">
                  <Search size={18} />
                  <input
                    type="text"
                    placeholder={t('Nome ou sobrenome')}
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="app-input pl-11"
                  />
                </div>
              </label>

              <label className="app-field">
                <span className="app-field__label">{t('Faixa')}</span>
                <select value={filterBelt} onChange={(event) => setFilterBelt(event.target.value as BeltColor | 'ALL')} className="app-select app-select--compact">
                  <option value="ALL">{t('Todas as faixas')}</option>
                  {ALL_BELTS.map((belt) => (
                    <option key={belt} value={belt}>{beltLabel(belt)}</option>
                  ))}
                </select>
              </label>

              <label className="app-field">
                <span className="app-field__label">{t('Grau')}</span>
                <select value={filterGrade} onChange={(event) => setFilterGrade(event.target.value)} className="app-select app-select--compact">
                  <option value="ALL">{t('Todos os graus')}</option>
                  {gradeOptions.map((grade) => (
                    <option key={grade} value={grade}>{grade}</option>
                  ))}
                </select>
              </label>

              <label className="app-field">
                <span className="app-field__label">{t('Ordenar por')}</span>
                <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className="app-select app-select--compact">
                  <option value="name-asc">{t('Nome A-Z')}</option>
                  <option value="name-desc">{t('Nome Z-A')}</option>
                  <option value="belt-desc">{t('Faixa mais alta primeiro')}</option>
                  <option value="grade-desc">{t('Grau mais alto primeiro')}</option>
                  <option value="commitment-desc">{t('Frequência +')}</option>
                  <option value="commitment-asc">{t('Frequência -')}</option>
                </select>
              </label>

              {showStatusFilter ? (
                <div className="app-chip-row student-roster__status-row">
                  {STATUS_FILTER_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setFilterStatus(option.value)}
                      className={`app-chip ${filterStatus === option.value ? 'is-active' : ''}`}
                    >
                      {t(option.label)}
                    </button>
                  ))}
                </div>
              ) : null}

              <div className="app-chip-row student-roster__type-row">
                {['ALL', 'Adulto', 'Kids'].map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setFilterType(item as 'ALL' | 'Adulto' | 'Kids')}
                    className={`app-chip ${filterType === item ? 'is-active' : ''}`}
                  >
                    {item === 'ALL' ? t('Todos') : t(item)}
                  </button>
                ))}
              </div>
            </div>

            {activeSection === 'ranking' ? (
              <div className="student-roster__period-panel">
                <div className="app-chip-row student-roster__period-row">
                  {rankingPeriodOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setRankingPeriod(option.value)}
                      className={`app-chip ${rankingPeriod === option.value ? 'is-active' : ''}`}
                    >
                      {t(option.label)}
                    </button>
                  ))}
                </div>

                {rankingPeriod === 'custom' ? (
                  <div className="student-roster__date-grid">
                    <label className="app-field">
                      <span className="app-field__label">{t('Inicio')}</span>
                      <DateField
                        min={RANKING_START_DATE_INPUT}
                        max={currentDateInput}
                        value={customStartDate}
                        onChange={(value) => setCustomStartDate(clampRankingStart(value))}
                      />
                    </label>
                    <label className="app-field">
                      <span className="app-field__label">{t('Fim')}</span>
                      <DateField
                        min={clampRankingStart(customStartDate)}
                        max={currentDateInput}
                        value={customEndDate}
                        onChange={setCustomEndDate}
                      />
                    </label>
                  </div>
                ) : null}

                <p className="student-roster__period-note">
                  {isOfficialTotalRanking
                    ? t('Ranking oficial: usa a contagem registrada no perfil do aluno.')
                    : t('Ranking analitico: {period}. Conta presencas de aulas ja realizadas. Nao altera faixa, grau ou contagem oficial.', { period: periodRange.label })}
                </p>
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      {shouldChooseAcademyFirst ? (
        <section className="app-panel app-panel-pad">
          <div className="app-empty">{emptySelectionMessage}</div>
        </section>
      ) : activeSection === 'deactivated' ? (
        <section className="student-roster__cards">
          {deactivatedStudents.length === 0 ? (
            <div className="app-empty">{t('Nenhum aluno desativado.')}</div>
          ) : (
            deactivatedStudents
              .slice()
              .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'))
              .map((student) => (
                <button
                  key={student.id}
                  type="button"
                  onClick={() => openStudent(student.id)}
                  className="app-list-card student-roster__card"
                >
                  <div className="student-roster__avatar-column">
                    <AvatarWithBelt
                      avatar={student.avatar}
                      name={student.name}
                      belt={student.belt}
                      stripes={getStudentGrade(student)}
                      size="md"
                      blackBelt={getBlackBeltProgressForUser(student)}
                    />
                    <p className="student-roster__rank">{t('Faixa {belt}', { belt: beltLabel(student.belt) })}</p>
                    <p className="student-roster__grade">{t('Grau {grade}', { grade: getStudentGrade(student) })}</p>
                  </div>
                  <div className="student-roster__copy">
                    <h3 className="student-roster__name">{student.name}</h3>
                    <div className="student-roster__badge-row">
                      <span className="app-badge app-badge--muted">{t(student.type)}</span>
                      <span className="app-badge" style={{ color: '#ef4444', background: '#fee2e2' }}>{t('Desativado')}</span>
                    </div>
                  </div>
                  <ChevronRight size={18} className="student-roster__arrow" />
                </button>
              ))
          )}
        </section>
      ) : activeSection === 'ranking' ? (
        <section className="student-roster__ranking-shell">
          <div className="app-stat-grid student-roster__ranking-kpis">
            <article className="app-stat-card">
              <p className="app-stat-card__label">{t('Alunos no filtro')}</p>
              <p className="app-stat-card__value">{formatNumber(rankingRows.length)}</p>
              <p className="app-stat-card__note">{selectedAcademyId ? academyNameById.get(selectedAcademyId) ?? t('Unidade selecionada') : t('Base atual')}</p>
            </article>
            <article className="app-stat-card">
              <p className="app-stat-card__label">{t('Presencas')}</p>
              <p className="app-stat-card__value">{formatNumber(rankingTotalAttendances)}</p>
              <p className="app-stat-card__note">{periodRange.label}</p>
            </article>
            <article className="app-stat-card">
              <p className="app-stat-card__label">{t('Media')}</p>
              <p className="app-stat-card__value">{formatAverage(rankingAverage)}</p>
              <p className="app-stat-card__note">{t('Presencas por aluno')}</p>
            </article>
            <article className="app-stat-card">
              <p className="app-stat-card__label">{t('Lider')}</p>
              <p className="app-stat-card__value student-roster__leader-value">
                {rankingLeader ? formatNumber(rankingLeader.attendanceCount) : '0'}
              </p>
              <p className="app-stat-card__note">{rankingLeader?.student.name ?? t('Sem presencas no periodo')}</p>
            </article>
          </div>

          <div className="student-roster__ranking-grid">
            <article className="app-panel app-panel-pad student-roster__chart-panel">
              <div className="student-roster__panel-heading">
                <p className="app-section-label">{t('Top 10')}</p>
                <h2>{t('Mais frequentes')}</h2>
              </div>
              {topChartRows.length > 0 ? (
                <div className="student-roster__chart-list">
                  {topChartRows.map((row, index) => (
                    <div key={row.student.id} className="student-roster__chart-row">
                      <div className="student-roster__chart-row-head">
                        <strong>#{index + 1} {row.student.name}</strong>
                        <span>{formatNumber(row.attendanceCount)}</span>
                      </div>
                      <div className="student-roster__chart-track">
                        <span style={{ width: `${Math.max(8, (row.attendanceCount / maxTopAttendance) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="app-empty">{t('Nenhuma presenca encontrada neste periodo.')}</div>
              )}
            </article>

            <article className="app-panel app-panel-pad student-roster__chart-panel">
              <div className="student-roster__panel-heading">
                <p className="app-section-label">{t('Faixas')}</p>
                <h2>{t('Presencas por faixa')}</h2>
              </div>
              {beltBreakdown.length > 0 ? (
                <div className="student-roster__chart-list">
                  {beltBreakdown.map((row) => (
                    <div key={row.belt} className="student-roster__chart-row">
                      <div className="student-roster__chart-row-head">
                        <strong>{beltLabel(row.belt)}</strong>
                        <span>{t('{count} presencas', { count: formatNumber(row.attendanceCount) })}</span>
                      </div>
                      <div className="student-roster__chart-track">
                        <span style={{ width: `${row.attendanceCount > 0 ? Math.max(8, (row.attendanceCount / maxBeltAttendance) * 100) : 0}%` }} />
                      </div>
                      <p className="student-roster__chart-note">{row.studentCount === 1 ? t('1 aluno') : t('{count} alunos', { count: formatNumber(row.studentCount) })}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="app-empty">{t('Nenhuma faixa para os filtros atuais.')}</div>
              )}
            </article>
          </div>

          <section className="student-roster__ranking-list">
            {rankingRows.map((row, index) => (
              <button
                key={row.student.id}
                type="button"
                onClick={() => openStudent(row.student.id)}
                className="app-list-card student-roster__ranking-row"
              >
                <span className={`student-roster__ranking-position ${index < 3 && row.attendanceCount > 0 ? 'is-top' : ''}`}>#{index + 1}</span>
                <AvatarWithBelt
                  avatar={row.student.avatar}
                  name={row.student.name}
                  belt={row.student.belt}
                  stripes={getStudentGrade(row.student)}
                  size="sm"
                  blackBelt={getBlackBeltProgressForUser(row.student)}
                />
                <div className="student-roster__ranking-copy">
                  <h3>{row.student.name}</h3>
                  <p>
                    {academyNameById.get(row.student.branchId) ?? academyName ?? t('Academia')} / {t('Faixa {belt}', { belt: beltLabel(row.student.belt) })} / {t('Grau {grade}', { grade: getStudentGrade(row.student) })}
                  </p>
                  {(() => {
                    const commitment = commitmentByUserId.get(row.student.id);
                    return commitment ? <CommitmentBadge commitment={commitment} /> : null;
                  })()}
                </div>
                <span className="app-badge app-badge--gold">
                  {row.attendanceCount === 1 ? t('1 presenca') : t('{count} presencas', { count: formatNumber(row.attendanceCount) })}
                </span>
              </button>
            ))}

            {rankingRows.length === 0 ? (
              <div className="app-empty">{emptyResultsMessage}</div>
            ) : null}
          </section>
        </section>
      ) : (
        <section className="student-roster__cards">
          {visibleStudents.map((student) => {
            const topRank = topRankByUserId.get(student.id);
            return (
              <button
                key={student.id}
                type="button"
                onClick={() => openStudent(student.id)}
                className="app-list-card student-roster__card"
              >
                <div className="student-roster__avatar-column">
                  <AvatarWithBelt
                    avatar={student.avatar}
                    name={student.name}
                    belt={student.belt}
                    stripes={getStudentGrade(student)}
                    size="md"
                    blackBelt={getBlackBeltProgressForUser(student)}
                  />
                  <p className="student-roster__rank">{t('Faixa {belt}', { belt: beltLabel(student.belt) })}</p>
                  <p className="student-roster__grade">{t('Grau {grade}', { grade: getStudentGrade(student) })}</p>
                </div>

                <div className="student-roster__copy">
                  <h3 className="student-roster__name">
                    {student.name}
                    {topRank ? <span className="student-roster__top-rank">#{topRank}</span> : null}
                  </h3>
                  <div className="student-roster__badge-row">
                    {(() => {
                      const commitment = commitmentByUserId.get(student.id);
                      return commitment ? <CommitmentBadge commitment={commitment} showLabel /> : null;
                    })()}
                    <span className="app-badge app-badge--muted">{t(student.type)}</span>
                    {enableAcademyFilter ? (
                      <span className="app-badge app-badge--muted">{academyNameById.get(student.branchId) ?? t('Academia')}</span>
                    ) : null}
                    {student.status === 'suspended' ? (
                      <span className="app-badge app-badge--danger">{t('Desativado')}</span>
                    ) : null}
                    {student.status === 'invited' ? (
                      <span className="app-badge app-badge--muted">{t('Convite pendente')}</span>
                    ) : null}
                    {graduationRequestByUserId.has(student.id) ? (
                      <span className="app-badge app-badge--gold">{t('Graduacao pendente')}</span>
                    ) : null}
                    {(() => {
                      const remaining = student.totalClassesToNextBelt - student.currentBeltProgress;
                      if (student.totalClassesToNextBelt <= 0) {
                        return null;
                      }

                      if (remaining <= 0) {
                        return (
                          <span className="app-badge app-badge--belt-alert">
                            {t('Apto para proxima faixa')}
                          </span>
                        );
                      }

                      return remaining <= 3 ? (
                        <span className="app-badge app-badge--belt-alert">
                          {remaining === 1 ? t('Falta 1 aula para nova faixa') : t('Faltam {count} aulas para nova faixa', { count: remaining })}
                        </span>
                      ) : null;
                    })()}
                  </div>
                  {(() => {
                    const hint = getProgressionHint(student, progressionRules);
                    return hint ? (
                      <p className="mt-1 text-xs text-[color:var(--text-soft)]">{hint}</p>
                    ) : null;
                  })()}
                </div>

                <ChevronRight size={18} className="student-roster__arrow" />
              </button>
            );
          })}

          {visibleStudents.length === 0 ? (
            <div className="app-empty">{emptyResultsMessage}</div>
          ) : null}
        </section>
      )}
    </div>
  );
};

export default StudentRoster;
