import React, { useEffect, useMemo, useState } from 'react';
import { ALL_BELTS, beltLabel, getUserProgressionSummary, type ProgressionRules } from '../beltCatalog';
import { BarChart3, ChevronRight, List, Search, UserX } from 'lucide-react';
import AvatarWithBelt from './AvatarWithBelt';
import StudentDetailView from '../views/StudentDetailView';
import type { FirestoreEntity } from '../services/firebase/data';
import type { AttendanceRecord, ClassRecord, GraduationApprovalRequestRecord } from '../services/firebase/models';
import type { BeltColor, User } from '../types';

type SortMode = 'name-asc' | 'name-desc' | 'belt-desc' | 'grade-desc';
type RosterSection = 'list' | 'ranking' | 'deactivated';
type RankingPeriodPreset = 'official-total' | 'today' | '7d' | '30d' | 'custom';

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

const rankingPeriodOptions: Array<{ value: RankingPeriodPreset; label: string }> = [
  { value: 'official-total', label: 'Total oficial' },
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: '7 dias' },
  { value: '30d', label: '30 dias' },
  { value: 'custom', label: 'Periodo' },
];

function getStudentGrade(student: User) {
  return Number(student.grade ?? student.stripes ?? 0);
}

function getProgressionHint(student: User, rules?: ProgressionRules | null): string | null {
  const prog = getUserProgressionSummary(student, rules);
  const parts: string[] = [];
  if (prog.stripeTotal > 0) {
    parts.push(`${prog.stripeProgress}/${prog.stripeTotal} grau`);
  }
  if (prog.beltTotal > 0) {
    parts.push(`${prog.beltProgress}/${prog.beltTotal} faixa`);
  }
  return parts.length > 0 ? parts.join(' / ') : null;
}

function sortStudents(students: User[], sortMode: SortMode) {
  return [...students].sort((left, right) => {
    if (sortMode === 'name-asc') {
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

function dateInputToSaoPauloDate(value: string, boundary: 'start' | 'end'): Date {
  const safeValue = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : RANKING_START_DATE_INPUT;
  const time = boundary === 'start' ? '00:00:00.000' : '23:59:59.999';
  return new Date(`${safeValue}T${time}-03:00`);
}

function addDaysToInput(value: string, days: number): string {
  const baseDate = dateInputToSaoPauloDate(value, 'start');
  return toSaoPauloDateInput(new Date(baseDate.getTime() + days * MILLISECONDS_PER_DAY));
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

  if (preset === 'today') {
    return {
      startInput: todayInput,
      endInput: todayInput,
      startDate: dateInputToSaoPauloDate(todayInput, 'start'),
      endDate: dateInputToSaoPauloDate(todayInput, 'end'),
      label: `Hoje (${formatDateInput(todayInput)})`,
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
      label: `${formatDateInput(startInput)} ate ${formatDateInput(todayInput)}`,
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
      label: `${formatDateInput(startInput)} ate ${formatDateInput(endInput)}`,
    };
  }

  return {
    startInput: RANKING_START_DATE_INPUT,
    endInput: '',
    startDate: dateInputToSaoPauloDate(RANKING_START_DATE_INPUT, 'start'),
    endDate: null,
    label: 'Total oficial',
  };
}

function getAttendanceMillis(attendance: FirestoreEntity<AttendanceRecord>): number {
  return attendance.checkedInAt?.toMillis() ?? attendance.createdAt?.toMillis() ?? 0;
}

function formatNumber(value: number): string {
  return value.toLocaleString('pt-BR');
}

function formatAverage(value: number): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
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
  viewerRole,
  onAdminSetUserMemberships,
  kicker = 'Roster',
  title = 'Alunos com leitura mais limpa e mais forte.',
  description,
  emptySelectionMessage = 'Escolha uma unidade da LEVEL para visualizar os alunos daquele local.',
  emptyResultsMessage = 'Nenhum aluno encontrado com os filtros atuais.',
}) => {
  const [activeSection, setActiveSection] = useState<RosterSection>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterBelt, setFilterBelt] = useState<BeltColor | 'ALL'>('ALL');
  const [filterType, setFilterType] = useState<'ALL' | 'Adulto' | 'Kids'>('ALL');
  const [filterGrade, setFilterGrade] = useState<'ALL' | string>('ALL');
  const [sortMode, setSortMode] = useState<SortMode>('name-asc');
  const [rankingPeriod, setRankingPeriod] = useState<RankingPeriodPreset>('official-total');
  const [customStartDate, setCustomStartDate] = useState(RANKING_START_DATE_INPUT);
  const [customEndDate, setCustomEndDate] = useState(toSaoPauloDateInput());
  const [internalSelectedStudentId, setInternalSelectedStudentId] = useState(selectedStudentId);
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
      return matchesSearch && matchesBelt && matchesType && matchesGrade;
    });
  }, [filterBelt, filterGrade, filterType, scopedStudents, searchTerm]);

  const visibleStudents = useMemo(
    () => sortStudents(filteredStudents, sortMode),
    [filteredStudents, sortMode],
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

      const attendanceMillis = getAttendanceMillis(attendance);
      return attendanceMillis >= startMillis && attendanceMillis <= endMillis;
    });
  }, [enableAcademyFilter, isOfficialTotalRanking, periodRange.endDate, periodRange.startDate, rankingAttendances, selectedAcademyId]);

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

  return (
    <div className="view-shell">
      <section className="app-panel app-panel--hero app-panel-pad">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="app-section-label">{kicker}</p>
            <h1 className="app-section-title">{title}</h1>
            <p className="app-section-copy">
              {description ?? academyName ?? 'Selecione uma unidade da LEVEL para abrir a base de alunos.'}
            </p>
          </div>
        </div>

        <div className="app-segment app-segment--block mt-6 student-roster__section-tabs" role="tablist" aria-label="Secoes de alunos">
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'list'}
            onClick={() => setActiveSection('list')}
            className={`app-segment__button ${activeSection === 'list' ? 'is-active' : ''}`}
          >
            <List size={16} />
            Lista
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'ranking'}
            onClick={() => setActiveSection('ranking')}
            className={`app-segment__button ${activeSection === 'ranking' ? 'is-active' : ''}`}
          >
            <BarChart3 size={16} />
            Ranking
          </button>
          {(onDeactivateStudent || onActivateStudent) ? (
            <button
              type="button"
              role="tab"
              aria-selected={activeSection === 'deactivated'}
              onClick={() => setActiveSection('deactivated')}
              className={`app-segment__button ${activeSection === 'deactivated' ? 'is-active' : ''}`}
            >
              <UserX size={16} />
              Desativados
              {deactivatedStudents.length > 0 ? (
                <span className="app-badge app-badge--muted" style={{ marginLeft: 4 }}>{deactivatedStudents.length}</span>
              ) : null}
            </button>
          ) : null}
        </div>

        {showAcademyFilter ? (
          <label className="app-field mt-6 max-w-sm">
            <span className="app-field__label">Unidade em foco</span>
            <select value={selectedAcademyId} onChange={(event) => onSelectAcademy?.(event.target.value)} className="app-select">
              <option value="">{enableAcademyFilter ? 'Todas as unidades' : 'Selecione uma unidade'}</option>
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
                <span className="app-field__label">Buscar aluno</span>
                <div className="app-search">
                  <Search size={18} />
                  <input
                    type="text"
                    placeholder="Nome ou sobrenome"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    className="app-input pl-11"
                  />
                </div>
              </label>

              <label className="app-field">
                <span className="app-field__label">Faixa</span>
                <select value={filterBelt} onChange={(event) => setFilterBelt(event.target.value as BeltColor | 'ALL')} className="app-select app-select--compact">
                  <option value="ALL">Todas as faixas</option>
                  {ALL_BELTS.map((belt) => (
                    <option key={belt} value={belt}>{beltLabel(belt)}</option>
                  ))}
                </select>
              </label>

              <label className="app-field">
                <span className="app-field__label">Grau</span>
                <select value={filterGrade} onChange={(event) => setFilterGrade(event.target.value)} className="app-select app-select--compact">
                  <option value="ALL">Todos os graus</option>
                  {gradeOptions.map((grade) => (
                    <option key={grade} value={grade}>{grade}</option>
                  ))}
                </select>
              </label>

              <label className="app-field">
                <span className="app-field__label">Ordenar por</span>
                <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} className="app-select app-select--compact">
                  <option value="name-asc">Nome A-Z</option>
                  <option value="name-desc">Nome Z-A</option>
                  <option value="belt-desc">Faixa mais alta primeiro</option>
                  <option value="grade-desc">Grau mais alto primeiro</option>
                </select>
              </label>

              <div className="app-chip-row student-roster__type-row">
                {['ALL', 'Adulto', 'Kids'].map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setFilterType(item as 'ALL' | 'Adulto' | 'Kids')}
                    className={`app-chip ${filterType === item ? 'is-active' : ''}`}
                  >
                    {item === 'ALL' ? 'Todos' : item}
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
                      {option.label}
                    </button>
                  ))}
                </div>

                {rankingPeriod === 'custom' ? (
                  <div className="student-roster__date-grid">
                    <label className="app-field">
                      <span className="app-field__label">Inicio</span>
                      <input
                        type="date"
                        min={RANKING_START_DATE_INPUT}
                        max={currentDateInput}
                        value={customStartDate}
                        onChange={(event) => setCustomStartDate(clampRankingStart(event.target.value))}
                        className="app-input"
                      />
                    </label>
                    <label className="app-field">
                      <span className="app-field__label">Fim</span>
                      <input
                        type="date"
                        min={clampRankingStart(customStartDate)}
                        max={currentDateInput}
                        value={customEndDate}
                        onChange={(event) => setCustomEndDate(event.target.value)}
                        className="app-input"
                      />
                    </label>
                  </div>
                ) : null}

                <p className="student-roster__period-note">
                  {isOfficialTotalRanking
                    ? 'Ranking oficial: usa a contagem registrada no perfil do aluno.'
                    : `Ranking analitico: ${periodRange.label}. Nao altera faixa, grau ou contagem oficial.`}
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
            <div className="app-empty">Nenhum aluno desativado.</div>
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
                      stripes={student.stripes}
                      size="md"
                    />
                    <p className="student-roster__rank">Faixa {beltLabel(student.belt)}</p>
                    <p className="student-roster__grade">Grau {getStudentGrade(student)}</p>
                  </div>
                  <div className="student-roster__copy">
                    <h3 className="student-roster__name">{student.name}</h3>
                    <div className="student-roster__badge-row">
                      <span className="app-badge app-badge--muted">{student.type}</span>
                      <span className="app-badge" style={{ color: '#ef4444', background: '#fee2e2' }}>Desativado</span>
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
              <p className="app-stat-card__label">Alunos no filtro</p>
              <p className="app-stat-card__value">{formatNumber(rankingRows.length)}</p>
              <p className="app-stat-card__note">{selectedAcademyId ? academyNameById.get(selectedAcademyId) ?? 'Unidade selecionada' : 'Base atual'}</p>
            </article>
            <article className="app-stat-card">
              <p className="app-stat-card__label">Presencas</p>
              <p className="app-stat-card__value">{formatNumber(rankingTotalAttendances)}</p>
              <p className="app-stat-card__note">{periodRange.label}</p>
            </article>
            <article className="app-stat-card">
              <p className="app-stat-card__label">Media</p>
              <p className="app-stat-card__value">{formatAverage(rankingAverage)}</p>
              <p className="app-stat-card__note">Presencas por aluno</p>
            </article>
            <article className="app-stat-card">
              <p className="app-stat-card__label">Lider</p>
              <p className="app-stat-card__value student-roster__leader-value">
                {rankingLeader ? formatNumber(rankingLeader.attendanceCount) : '0'}
              </p>
              <p className="app-stat-card__note">{rankingLeader?.student.name ?? 'Sem presencas no periodo'}</p>
            </article>
          </div>

          <div className="student-roster__ranking-grid">
            <article className="app-panel app-panel-pad student-roster__chart-panel">
              <div className="student-roster__panel-heading">
                <p className="app-section-label">Top 10</p>
                <h2>Mais frequentes</h2>
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
                <div className="app-empty">Nenhuma presenca encontrada neste periodo.</div>
              )}
            </article>

            <article className="app-panel app-panel-pad student-roster__chart-panel">
              <div className="student-roster__panel-heading">
                <p className="app-section-label">Faixas</p>
                <h2>Presencas por faixa</h2>
              </div>
              {beltBreakdown.length > 0 ? (
                <div className="student-roster__chart-list">
                  {beltBreakdown.map((row) => (
                    <div key={row.belt} className="student-roster__chart-row">
                      <div className="student-roster__chart-row-head">
                        <strong>{beltLabel(row.belt)}</strong>
                        <span>{formatNumber(row.attendanceCount)} presencas</span>
                      </div>
                      <div className="student-roster__chart-track">
                        <span style={{ width: `${row.attendanceCount > 0 ? Math.max(8, (row.attendanceCount / maxBeltAttendance) * 100) : 0}%` }} />
                      </div>
                      <p className="student-roster__chart-note">{formatNumber(row.studentCount)} aluno{row.studentCount === 1 ? '' : 's'}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="app-empty">Nenhuma faixa para os filtros atuais.</div>
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
                  stripes={row.student.stripes}
                  size="sm"
                />
                <div className="student-roster__ranking-copy">
                  <h3>{row.student.name}</h3>
                  <p>
                    {academyNameById.get(row.student.branchId) ?? academyName ?? 'Academia'} / Faixa {beltLabel(row.student.belt)} / Grau {getStudentGrade(row.student)}
                  </p>
                </div>
                <span className="app-badge app-badge--gold">
                  {formatNumber(row.attendanceCount)} presenca{row.attendanceCount === 1 ? '' : 's'}
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
                    stripes={student.stripes}
                    size="md"
                  />
                  <p className="student-roster__rank">Faixa {beltLabel(student.belt)}</p>
                  <p className="student-roster__grade">Grau {getStudentGrade(student)}</p>
                </div>

                <div className="student-roster__copy">
                  <h3 className="student-roster__name">
                    {student.name}
                    {topRank ? <span className="student-roster__top-rank">#{topRank}</span> : null}
                  </h3>
                  <div className="student-roster__badge-row">
                    <span className="app-badge app-badge--muted">{student.type}</span>
                    {enableAcademyFilter ? (
                      <span className="app-badge app-badge--muted">{academyNameById.get(student.branchId) ?? 'Academia'}</span>
                    ) : null}
                    {student.status ? <span className="app-badge app-badge--muted">{student.status}</span> : null}
                    {graduationRequestByUserId.has(student.id) ? (
                      <span className="app-badge app-badge--gold">Graduacao pendente</span>
                    ) : null}
                    {(() => {
                      const remaining = student.totalClassesToNextBelt - student.currentBeltProgress;
                      if (student.totalClassesToNextBelt <= 0) {
                        return null;
                      }

                      if (remaining <= 0) {
                        return (
                          <span className="app-badge app-badge--belt-alert">
                            Apto para proxima faixa
                          </span>
                        );
                      }

                      return remaining <= 3 ? (
                        <span className="app-badge app-badge--belt-alert">
                          {remaining === 1 ? 'Falta 1 aula para nova faixa' : `Faltam ${remaining} aulas para nova faixa`}
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
