import React, { useMemo, useState } from 'react';
import { getBeltMeta } from '../beltCatalog';
import { MONTH_WEEK_HEADER } from '../calendarUtils';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  CalendarDays,
  Clock3,
  Filter,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { FirestoreEntity } from '../services/firebase/data';
import type {
  AcademyRecord,
  ClassRecord,
  CompetitionRecord,
  UserRecord,
} from '../services/firebase/models';
import InstructorEditModal from '../components/InstructorEditModal';

interface SuperadminDashboardViewProps {
  academies: Array<FirestoreEntity<AcademyRecord>>;
  allUsers: Array<FirestoreEntity<UserRecord>>;
  academy: FirestoreEntity<AcademyRecord> | null;
  academyUsers: Array<FirestoreEntity<UserRecord>>;
  classes: Array<FirestoreEntity<ClassRecord>>;
  competitions: Array<FirestoreEntity<CompetitionRecord>>;
  selectedAcademyId: string;
  onEnterAcademy: (academyId: string) => void;
  onClearFocus: () => void;
  onUpdateInstructor: (payload: {
    userId: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    newPassword?: string;
    plainPassword?: string;
    phone?: string;
    belt?: string;
    grade?: number;
  }) => Promise<void>;
}

type SortMode = 'attention' | 'students' | 'attendance';
type StatusFilter = 'all' | 'active' | 'inactive' | 'suspended';

interface AcademyRow {
  id: string;
  name: string;
  slug: string;
  status: AcademyRecord['status'];
  timezone: string;
  totalUsers: number;
  activeUsers: number;
  activeStudents: number;
  invitedUsers: number;
  leaderCount: number;
  masterBlackCount: number;
  masterBlackLimit: number;
  averageAttendance: number;
  lastActivityAt: Date | null;
  lastActivityLabel: string;
  attentionReasons: string[];
}

const roleBreakdownConfig = [
  { role: 'student', label: 'Alunos' },
  { role: 'professor', label: 'Professores' },
  { role: 'superadmin', label: 'Superadmins' },
] as const;

const beltBreakdownConfig = [
  { key: 'branca', label: 'Branca', color: 'rgba(236, 239, 246, 0.92)' },
  { key: 'azul', label: 'Azul', color: 'rgba(90, 144, 255, 0.92)' },
  { key: 'roxa', label: 'Roxa', color: 'rgba(148, 92, 255, 0.9)' },
  { key: 'marrom', label: 'Marrom', color: 'rgba(172, 109, 72, 0.9)' },
  { key: 'preta', label: 'Preta', color: 'rgba(42, 44, 51, 0.95)' },
  { key: 'kids', label: 'Kids', color: 'rgba(120, 199, 115, 0.92)' },
  { key: 'outras', label: 'Outras', color: 'rgba(196, 151, 70, 0.85)' },
] as const;

function isMasterBlack(user: FirestoreEntity<UserRecord>) {
  const belt = user.belt.trim().toLowerCase();
  const isBlack = belt === 'black' || belt === 'preta';
  const isLeader = user.role === 'professor' || user.role === 'superadmin';
  return isBlack && isLeader;
}

function formatNumber(value: number) {
  return value.toLocaleString('pt-BR');
}

function getStatusLabel(status: AcademyRecord['status']) {
  switch (status) {
    case 'active':
      return 'Ativa';
    case 'inactive':
      return 'Inativa';
    case 'suspended':
      return 'Suspensa';
    default:
      return status;
  }
}

function getStatusBadgeClass(status: AcademyRecord['status']) {
  switch (status) {
    case 'active':
      return 'app-badge app-badge--success';
    case 'suspended':
      return 'app-badge app-badge--danger';
    default:
      return 'app-badge app-badge--muted';
  }
}

function percentOf(value: number, total: number) {
  if (total <= 0) {
    return 0;
  }

  return Math.round((value / total) * 100);
}

function normalizeBelt(belt: string) {
  const normalized = belt.trim().toLowerCase();
  const meta = getBeltMeta(normalized);

  if (meta.track === 'kids' && normalized !== 'white' && normalized !== 'branca') {
    return 'kids';
  }

  switch (normalized) {
    case 'white':
    case 'branca':
      return 'branca';
    case 'blue':
    case 'azul':
      return 'azul';
    case 'purple':
    case 'roxa':
      return 'roxa';
    case 'brown':
    case 'marrom':
      return 'marrom';
    case 'black':
    case 'preta':
      return 'preta';
    default:
      return 'outras';
  }
}

function safeToDate(value: { toDate?: () => Date; seconds?: number } | null | undefined): Date | undefined {
  if (!value) return undefined;
  if (typeof value.toDate === 'function') return value.toDate();
  if (typeof value.seconds === 'number') return new Date(value.seconds * 1000);
  return undefined;
}

function getLatestDate(candidates: Array<Date | null | undefined>) {
  return candidates.reduce<Date | null>((latest, candidate) => {
    if (!candidate) {
      return latest;
    }

    if (!latest || candidate.getTime() > latest.getTime()) {
      return candidate;
    }

    return latest;
  }, null);
}

function getDaysSince(date: Date | null) {
  if (!date) {
    return null;
  }

  const difference = Date.now() - date.getTime();
  return Math.max(0, Math.floor(difference / (1000 * 60 * 60 * 24)));
}

function getActivityLabel(date: Date | null) {
  const daysSince = getDaysSince(date);

  if (daysSince === null) {
    return 'Sem atividade recente';
  }

  if (daysSince === 0) {
    return 'Atividade hoje';
  }

  if (daysSince === 1) {
    return 'Atividade ontem';
  }

  return `Atividade há ${daysSince} dias`;
}

const WEEKDAY_SHORT_TO_INDEX: Record<string, number> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6,
};

const MONTH_LABELS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'] as const;

interface ZonedParts {
  weekdayIndex: number;
  hour: number;
  monthKey: string;
  monthLabel: string;
}

// Deriva dia-da-semana (0=Seg..6=Dom), hora e mês de uma data NA TIMEZONE da academia.
// Usa Intl.DateTimeFormat porque getDay()/getHours() usariam o fuso do navegador.
function getZonedParts(date: Date, timeZone: string): ZonedParts | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      hour12: false,
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(date);

    const lookup = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    const weekdayIndex = WEEKDAY_SHORT_TO_INDEX[lookup('weekday')] ?? -1;
    const hour = Number.parseInt(lookup('hour'), 10) % 24;
    const monthValue = lookup('month');
    const yearValue = lookup('year');
    const monthNumber = Number.parseInt(monthValue, 10);

    if (weekdayIndex < 0 || Number.isNaN(hour) || Number.isNaN(monthNumber)) {
      return null;
    }

    return {
      weekdayIndex,
      hour,
      monthKey: `${yearValue}-${monthValue}`,
      monthLabel: `${MONTH_LABELS_PT[monthNumber - 1] ?? ''}/${yearValue.slice(-2)}`,
    };
  } catch {
    return null;
  }
}

interface FocusBar {
  key: string;
  label: string;
  attendances: number;
  classCount: number;
}

interface FocusProfessor {
  id: string;
  name: string;
  classCount: number;
  totalAttendances: number;
  avgPerClass: number;
}

interface FocusBeltSlice {
  key: string;
  label: string;
  color: string;
  total: number;
  share: number;
}

interface FocusTopStudent {
  id: string;
  name: string;
  attendanceCount: number;
}

interface FocusStatistics {
  finishedClassCount: number;
  totalAttendances: number;
  avgPerClass: number;
  occupancyRate: number;
  cancellationRate: number;
  byWeekday: FocusBar[];
  peakWeekday: FocusBar | null;
  byHour: FocusBar[];
  peakHour: FocusBar | null;
  monthlyTrend: Array<{ key: string; label: string; attendances: number }>;
  professors: FocusProfessor[];
  topProfessor: FocusProfessor | null;
  classStatusCounts: { scheduled: number; active: number; finished: number; cancelled: number };
  topTatame: { name: string; classCount: number } | null;
  belts: FocusBeltSlice[];
  beltRingGradient: string;
  activeStudents: number;
  invitedStudents: number;
  suspendedStudents: number;
  newStudents: number;
  atRiskStudents: number;
  topStudents: FocusTopStudent[];
}

// Lista de barras horizontais reaproveitada por desktop e mobile.
const FocusBarList: React.FC<{
  items: Array<{ key: string; label: string; value: number; caption?: string }>;
  emptyLabel: string;
}> = ({ items, emptyLabel }) => {
  if (items.length === 0) {
    return <div className="app-empty">{emptyLabel}</div>;
  }

  const max = items.reduce((largest, item) => Math.max(largest, item.value), 0);

  return (
    <div className="superadmin-bar-list">
      {items.map((item) => (
        <div key={item.key} className="superadmin-bar-item">
          <div className="superadmin-bar-item__header">
            <span>{item.label}</span>
            <strong>{formatNumber(item.value)}</strong>
          </div>
          <div className="superadmin-bar superadmin-bar--thin">
            <span style={{ width: `${max > 0 ? Math.max(6, Math.round((item.value / max) * 100)) : 0}%` }} />
          </div>
          {item.caption ? <p className="superadmin-bar-item__footer">{item.caption}</p> : null}
        </div>
      ))}
    </div>
  );
};

const SuperadminDashboardView: React.FC<SuperadminDashboardViewProps> = ({
  academies,
  allUsers,
  academy,
  academyUsers,
  classes,
  competitions,
  selectedAcademyId,
  onEnterAcademy,
  onClearFocus,
  onUpdateInstructor,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('attention');
  const [editingInstructor, setEditingInstructor] = useState<FirestoreEntity<UserRecord> | null>(null);

  const usersByAcademyId = useMemo(() => {
    const grouped = new Map<string, Array<FirestoreEntity<UserRecord>>>();

    allUsers.forEach((user) => {
      const currentUsers = grouped.get(user.academyId) ?? [];
      currentUsers.push(user);
      grouped.set(user.academyId, currentUsers);
    });

    return grouped;
  }, [allUsers]);

  const academyRows = useMemo(() => academies.map((academyEntry) => {
    const academyScopedUsers = usersByAcademyId.get(academyEntry.id) ?? [];
    const activeUsers = academyScopedUsers.filter((entry) => entry.status === 'active');
    const activeStudents = activeUsers.filter((entry) => entry.role === 'student');
    const leaderCount = activeUsers.filter((entry) => entry.role !== 'student').length;
    const masterBlackCount = academyScopedUsers.filter(isMasterBlack).length;
    const masterBlackLimit = Math.max(academyEntry.masterBlackLimit ?? 1, 1);
    const averageAttendance = activeStudents.length > 0
      ? Math.round(activeStudents.reduce((sum, entry) => sum + (entry.attendanceCount ?? 0), 0) / activeStudents.length)
      : 0;
    const lastActivityAt = getLatestDate([
      safeToDate(academyEntry.updatedAt),
      safeToDate(academyEntry.createdAt),
      ...academyScopedUsers.flatMap((entry) => [
        safeToDate(entry.lastAttendanceAt),
        safeToDate(entry.lastLoginAt),
      ]),
    ]);

    const attentionReasons: string[] = [];

    if (academyEntry.status !== 'active') {
      attentionReasons.push('Status operacional fora do padrao ativo');
    }

    if (leaderCount === 0) {
      attentionReasons.push('Sem lideranca ativa cadastrada');
    }

    if (activeStudents.length === 0) {
      attentionReasons.push('Sem alunos ativos na base');
    }

    if (masterBlackCount > masterBlackLimit) {
      attentionReasons.push('Limite de master black ultrapassado');
    }

    const daysSinceActivity = getDaysSince(lastActivityAt);
    if (daysSinceActivity !== null && daysSinceActivity > 21) {
      attentionReasons.push(`Sem atividade recente ha ${daysSinceActivity} dias`);
    }

    return {
      id: academyEntry.id,
      name: academyEntry.name,
      slug: academyEntry.slug,
      status: academyEntry.status,
      timezone: academyEntry.timezone,
      totalUsers: academyScopedUsers.length,
      activeUsers: activeUsers.length,
      activeStudents: activeStudents.length,
      invitedUsers: academyScopedUsers.filter((entry) => entry.status === 'invited').length,
      leaderCount,
      masterBlackCount,
      masterBlackLimit,
      averageAttendance,
      lastActivityAt,
      lastActivityLabel: getActivityLabel(lastActivityAt),
      attentionReasons,
    } satisfies AcademyRow;
  }), [academies, usersByAcademyId]);

  const filteredRows = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    return academyRows
      .filter((academyRow) => {
        const matchesSearch = searchTerm.length === 0
          || academyRow.name.toLowerCase().includes(searchTerm)
          || academyRow.slug.toLowerCase().includes(searchTerm);
        const matchesStatus = statusFilter === 'all' || academyRow.status === statusFilter;

        return matchesSearch && matchesStatus;
      })
      .sort((left, right) => {
        const selectedPriority = left.id === selectedAcademyId
          ? -1
          : right.id === selectedAcademyId
            ? 1
            : 0;

        if (selectedPriority !== 0) {
          return selectedPriority;
        }

        switch (sortMode) {
          case 'students':
            return right.activeStudents - left.activeStudents || right.totalUsers - left.totalUsers;
          case 'attendance':
            return right.averageAttendance - left.averageAttendance || right.activeStudents - left.activeStudents;
          case 'attention':
          default:
            return right.attentionReasons.length - left.attentionReasons.length || right.activeStudents - left.activeStudents;
        }
      });
  }, [academyRows, search, selectedAcademyId, sortMode, statusFilter]);

  const filteredAcademyIds = useMemo(
    () => new Set(filteredRows.map((academyRow) => academyRow.id)),
    [filteredRows],
  );

  const filteredUsers = useMemo(
    () => allUsers.filter((user) => filteredAcademyIds.has(user.academyId)),
    [allUsers, filteredAcademyIds],
  );

  const filteredActiveUsers = useMemo(
    () => filteredUsers.filter((user) => user.status === 'active'),
    [filteredUsers],
  );

  const totalAcademies = filteredRows.length;
  const activeAcademies = filteredRows.filter((academyRow) => academyRow.status === 'active').length;
  const inactiveAcademies = filteredRows.filter((academyRow) => academyRow.status === 'inactive').length;
  const suspendedAcademies = filteredRows.filter((academyRow) => academyRow.status === 'suspended').length;
  const globalStudents = filteredRows.reduce((sum, academyRow) => sum + academyRow.activeStudents, 0);
  const globalUsers = filteredRows.reduce((sum, academyRow) => sum + academyRow.totalUsers, 0);
  const globalLeaders = filteredRows.reduce((sum, academyRow) => sum + academyRow.leaderCount, 0);
  const globalMasterBlack = filteredRows.reduce((sum, academyRow) => sum + academyRow.masterBlackCount, 0);
  const averageAttendance = totalAcademies > 0
    ? Math.round(filteredRows.reduce((sum, academyRow) => sum + academyRow.averageAttendance, 0) / totalAcademies)
    : 0;
  const academiesInAttention = filteredRows.filter((academyRow) => academyRow.attentionReasons.length > 0).length;
  const activeShare = percentOf(activeAcademies, totalAcademies);
  const inactiveShare = percentOf(inactiveAcademies, totalAcademies);
  const suspendedShare = percentOf(suspendedAcademies, totalAcademies);

  const topAcademies = useMemo(
    () => [...filteredRows]
      .sort((left, right) => right.activeStudents - left.activeStudents || right.averageAttendance - left.averageAttendance)
      .slice(0, 5),
    [filteredRows],
  );

  const roleBreakdown = useMemo(() => roleBreakdownConfig.map((entry) => {
    const total = filteredActiveUsers.filter((user) => user.role === entry.role).length;
    return {
      ...entry,
      total,
      share: percentOf(total, filteredActiveUsers.length),
    };
  }), [filteredActiveUsers]);

  const beltBreakdown = useMemo(() => {
    const activeStudents = filteredActiveUsers.filter((user) => user.role === 'student');

    return beltBreakdownConfig.map((belt) => {
      const total = activeStudents.filter((user) => normalizeBelt(user.belt) === belt.key).length;

      return {
        ...belt,
        total,
        share: percentOf(total, activeStudents.length),
      };
    });
  }, [filteredActiveUsers]);

  const attentionRows = useMemo(
    () => [...filteredRows]
      .filter((academyRow) => academyRow.attentionReasons.length > 0)
      .sort((left, right) => right.attentionReasons.length - left.attentionReasons.length || right.activeStudents - left.activeStudents)
      .slice(0, 4),
    [filteredRows],
  );

  const focusAcademyRow = selectedAcademyId
    ? (
      academyRows.find((academyRow) => academyRow.id === (academy?.id ?? selectedAcademyId))
      ?? null
    )
    : null;

  const focusActiveStudents = academyUsers.filter((user) => user.role === 'student' && user.status === 'active').length;
  const focusLeaders = academyUsers.filter((user) => user.role !== 'student' && user.status === 'active').length;
  const focusInstructors = useMemo(
    () => academyUsers.filter((user) => (user.role === 'professor' || user.role === 'superadmin') && user.status === 'active'),
    [academyUsers],
  );
  const focusActiveClasses = classes.filter((item) => item.status === 'active').length;
  const focusScheduledClasses = classes.filter((item) => item.status === 'scheduled').length;
  const focusOpenCompetitions = competitions.filter((item) => item.status === 'published').length;
  const focusFinishedCompetitions = competitions.filter((item) => item.status === 'finished').length;

  // Estatísticas detalhadas da unidade em foco — calculadas no cliente a partir das
  // aulas/usuários já carregados quando uma academia está selecionada.
  const focusStatistics = useMemo<FocusStatistics | null>(() => {
    if (!selectedAcademyId) {
      return null;
    }

    const timeZone = academy?.timezone || 'America/Sao_Paulo';
    const finishedClasses = classes.filter((item) => item.status === 'finished');

    const weekdayBuckets = MONTH_WEEK_HEADER.map((label) => ({ label, attendances: 0, classCount: 0 }));
    const hourBuckets = new Map<number, { attendances: number; classCount: number }>();
    const monthBuckets = new Map<string, { label: string; attendances: number }>();
    const professorBuckets = new Map<string, FocusProfessor>();
    const tatameBuckets = new Map<string, number>();

    finishedClasses.forEach((item) => {
      const attendance = item.currentAttendanceCount ?? 0;
      const start = safeToDate(item.scheduledStart);

      if (start) {
        const zoned = getZonedParts(start, timeZone);
        if (zoned) {
          weekdayBuckets[zoned.weekdayIndex].attendances += attendance;
          weekdayBuckets[zoned.weekdayIndex].classCount += 1;

          const hourBucket = hourBuckets.get(zoned.hour) ?? { attendances: 0, classCount: 0 };
          hourBucket.attendances += attendance;
          hourBucket.classCount += 1;
          hourBuckets.set(zoned.hour, hourBucket);

          const monthBucket = monthBuckets.get(zoned.monthKey) ?? { label: zoned.monthLabel, attendances: 0 };
          monthBucket.attendances += attendance;
          monthBuckets.set(zoned.monthKey, monthBucket);
        }
      }

      const professorId = item.professorId || 'desconhecido';
      const resolvedName = item.professorName
        || academyUsers.find((user) => user.id === item.professorId)?.displayName
        || 'Professor';
      const professorBucket = professorBuckets.get(professorId)
        ?? { id: professorId, name: resolvedName, classCount: 0, totalAttendances: 0, avgPerClass: 0 };
      professorBucket.classCount += 1;
      professorBucket.totalAttendances += attendance;
      professorBuckets.set(professorId, professorBucket);

      const tatame = (item.tatame || '').trim();
      if (tatame) {
        tatameBuckets.set(tatame, (tatameBuckets.get(tatame) ?? 0) + 1);
      }
    });

    const byWeekday: FocusBar[] = weekdayBuckets.map((bucket, index) => ({
      key: String(index),
      label: bucket.label,
      attendances: bucket.attendances,
      classCount: bucket.classCount,
    }));
    const peakWeekday = [...byWeekday]
      .filter((bucket) => bucket.classCount > 0)
      .sort((left, right) => right.attendances - left.attendances)[0] ?? null;

    const byHour: FocusBar[] = [...hourBuckets.entries()]
      .sort((left, right) => right[1].attendances - left[1].attendances)
      .map(([hour, value]) => ({
        key: String(hour),
        label: `${String(hour).padStart(2, '0')}h`,
        attendances: value.attendances,
        classCount: value.classCount,
      }));
    const peakHour = byHour[0] ?? null;

    const monthlyTrend = [...monthBuckets.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .slice(-12)
      .map(([key, value]) => ({ key, label: value.label, attendances: value.attendances }));

    const professors = [...professorBuckets.values()]
      .map((professor) => ({
        ...professor,
        avgPerClass: professor.classCount > 0 ? Math.round(professor.totalAttendances / professor.classCount) : 0,
      }))
      .sort((left, right) => right.classCount - left.classCount || right.totalAttendances - left.totalAttendances);

    const classStatusCounts = {
      scheduled: classes.filter((item) => item.status === 'scheduled').length,
      active: classes.filter((item) => item.status === 'active').length,
      finished: finishedClasses.length,
      cancelled: classes.filter((item) => item.status === 'cancelled').length,
    };
    const cancellationDenominator = classStatusCounts.finished + classStatusCounts.cancelled;
    const cancellationRate = cancellationDenominator > 0
      ? Math.round((classStatusCounts.cancelled / cancellationDenominator) * 100)
      : 0;

    const occupancyClasses = finishedClasses.filter((item) => (item.capacity ?? 0) > 0);
    const occupancyRate = occupancyClasses.length > 0
      ? Math.round(
        (occupancyClasses.reduce(
          (sum, item) => sum + Math.min(1, (item.currentAttendanceCount ?? 0) / (item.capacity || 1)),
          0,
        ) / occupancyClasses.length) * 100,
      )
      : 0;

    const totalAttendances = finishedClasses.reduce((sum, item) => sum + (item.currentAttendanceCount ?? 0), 0);
    const avgPerClass = classStatusCounts.finished > 0
      ? Math.round(totalAttendances / classStatusCounts.finished)
      : 0;

    const topTatameEntry = [...tatameBuckets.entries()].sort((left, right) => right[1] - left[1])[0];
    const topTatame = topTatameEntry ? { name: topTatameEntry[0], classCount: topTatameEntry[1] } : null;

    const students = academyUsers.filter((user) => user.role === 'student');
    const activeStudentsList = students.filter((user) => user.status === 'active');

    let beltCursor = 0;
    const belts: FocusBeltSlice[] = beltBreakdownConfig.map((belt) => {
      const total = activeStudentsList.filter((user) => normalizeBelt(user.belt) === belt.key).length;
      return {
        key: belt.key,
        label: belt.label,
        color: belt.color,
        total,
        share: percentOf(total, activeStudentsList.length),
      };
    });
    const beltSegments = belts
      .filter((belt) => belt.total > 0)
      .map((belt) => {
        const segmentStart = beltCursor * 3.6;
        beltCursor += belt.share;
        return `${belt.color} ${segmentStart}deg ${beltCursor * 3.6}deg`;
      });
    const beltRingGradient = beltSegments.length > 0
      ? `conic-gradient(${beltSegments.join(', ')}, rgba(127, 127, 147, 0.16) ${beltCursor * 3.6}deg 360deg)`
      : 'conic-gradient(rgba(127, 127, 147, 0.16) 0deg 360deg)';

    const newStudents = students.filter((user) => {
      const daysSince = getDaysSince(safeToDate(user.createdAt) ?? null);
      return daysSince !== null && daysSince <= 30;
    }).length;
    const atRiskStudents = activeStudentsList.filter((user) => {
      const daysSince = getDaysSince(safeToDate(user.lastAttendanceAt) ?? null);
      return daysSince === null || daysSince > 21;
    }).length;
    const topStudents: FocusTopStudent[] = [...activeStudentsList]
      .sort((left, right) => (right.attendanceCount ?? 0) - (left.attendanceCount ?? 0))
      .slice(0, 5)
      .map((user) => ({ id: user.id, name: user.displayName, attendanceCount: user.attendanceCount ?? 0 }));

    return {
      finishedClassCount: classStatusCounts.finished,
      totalAttendances,
      avgPerClass,
      occupancyRate,
      cancellationRate,
      byWeekday,
      peakWeekday,
      byHour,
      peakHour,
      monthlyTrend,
      professors,
      topProfessor: professors[0] ?? null,
      classStatusCounts,
      topTatame,
      belts,
      beltRingGradient,
      activeStudents: activeStudentsList.length,
      invitedStudents: students.filter((user) => user.status === 'invited').length,
      suspendedStudents: students.filter((user) => user.status === 'suspended').length,
      newStudents,
      atRiskStudents,
      topStudents,
    } satisfies FocusStatistics;
  }, [classes, academyUsers, academy?.timezone, selectedAcademyId]);
  const activeStudentBase = filteredActiveUsers.filter((user) => user.role === 'student').length;
  const overviewKpis = [
    {
      label: 'Academias',
      value: formatNumber(totalAcademies),
      note: `${formatNumber(activeAcademies)} ativas`,
    },
    {
      label: 'Alunos ativos',
      value: formatNumber(globalStudents),
      note: `${formatNumber(globalUsers)} usuarios`,
    },
    {
      label: 'Liderancas',
      value: formatNumber(globalLeaders),
      note: `${formatNumber(globalMasterBlack)} master black`,
    },
    {
      label: 'Presenca media',
      value: formatNumber(averageAttendance),
      note: `${formatNumber(academiesInAttention)} em atencao`,
    },
  ];
  const focusStats = focusAcademyRow
    ? [
      { label: 'Alunos ativos', value: formatNumber(focusActiveStudents) },
      { label: 'Liderancas', value: formatNumber(focusLeaders) },
      { label: 'Aulas ao vivo', value: formatNumber(focusActiveClasses) },
      { label: 'Competicoes abertas', value: formatNumber(focusOpenCompetitions) },
    ]
    : [];
  const focusOperationalRows = focusAcademyRow
    ? [
      { label: 'Presenca media', value: formatNumber(focusAcademyRow.averageAttendance) },
      { label: 'Aulas agendadas', value: formatNumber(focusScheduledClasses) },
      { label: 'Competicoes concluidas', value: formatNumber(focusFinishedCompetitions) },
      { label: 'Ultima atividade', value: focusAcademyRow.lastActivityLabel },
    ]
    : [];

  const totalRowsForRing = Math.max(totalAcademies, 1);
  const activeDegrees = (activeAcademies / totalRowsForRing) * 360;
  const inactiveDegrees = activeDegrees + ((inactiveAcademies / totalRowsForRing) * 360);
  const suspendedDegrees = inactiveDegrees + ((suspendedAcademies / totalRowsForRing) * 360);
  const healthBadgeClass = academiesInAttention > 0 ? 'app-badge app-badge--danger' : 'app-badge app-badge--success';
  const healthBadgeLabel = academiesInAttention > 0
    ? `${formatNumber(academiesInAttention)} em atencao`
    : 'Operacao estavel';
  const healthHeadline = totalAcademies === 0
    ? 'Sem academias no recorte'
    : suspendedAcademies > 0
      ? 'Rede pede acao imediata em pontos criticos'
      : activeShare >= 85
        ? 'Rede operando com alta estabilidade'
        : 'Rede em transicao operacional';
  const healthCopy = totalAcademies === 0
    ? 'Ajuste os filtros para reconstruir o panorama da rede.'
    : `${formatNumber(activeAcademies)} de ${formatNumber(totalAcademies)} academias seguem ativas no recorte atual. ${academiesInAttention > 0 ? `${formatNumber(academiesInAttention)} aparecem no radar de atencao.` : 'Nenhuma academia entrou no radar de atencao.'}`;
  const healthSummaryCards = [
    {
      key: 'coverage',
      label: 'Cobertura ativa',
      value: `${activeShare}%`,
      toneClass: 'superadmin-health-pill--success',
    },
    {
      key: 'attention',
      label: 'Radar de atencao',
      value: formatNumber(academiesInAttention),
      toneClass: academiesInAttention > 0 ? 'superadmin-health-pill--danger' : 'superadmin-health-pill--success',
    },
    {
      key: 'out-of-flow',
      label: 'Fora do fluxo',
      value: formatNumber(inactiveAcademies + suspendedAcademies),
      toneClass: inactiveAcademies + suspendedAcademies > 0 ? 'superadmin-health-pill--gold' : 'superadmin-health-pill--muted',
    },
  ];
  const operationalStatusCards = [
    {
      key: 'active',
      label: 'Ativas',
      count: activeAcademies,
      share: activeShare,
      note: 'Operando no recorte atual',
      badgeClass: 'app-badge app-badge--success',
      toneClass: 'superadmin-status-card--success',
    },
    {
      key: 'inactive',
      label: 'Inativas',
      count: inactiveAcademies,
      share: inactiveShare,
      note: 'Fora da rotina principal',
      badgeClass: 'app-badge app-badge--muted',
      toneClass: 'superadmin-status-card--muted',
    },
    {
      key: 'suspended',
      label: 'Suspensas',
      count: suspendedAcademies,
      share: suspendedShare,
      note: 'Pedem acao imediata',
      badgeClass: 'app-badge app-badge--danger',
      toneClass: 'superadmin-status-card--danger',
    },
  ];

  const referenceDate = new Date();
  const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const monthEnd = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0);
  const formatDay = (date: Date) => date.toLocaleDateString('pt-BR');
  const monthRangeLabel = `${formatDay(monthStart)} - ${formatDay(monthEnd)}`;

  const desktopKpis = [
    {
      key: 'academias',
      label: 'Academias',
      value: formatNumber(totalAcademies),
      note: `${formatNumber(activeAcademies)} ativas`,
      icon: Building2,
    },
    {
      key: 'alunos',
      label: 'Alunos ativos',
      value: formatNumber(globalStudents),
      note: `${formatNumber(globalUsers)} usuarios no total`,
      icon: Users,
    },
    {
      key: 'liderancas',
      label: 'Liderancas',
      value: formatNumber(globalLeaders),
      note: `${formatNumber(globalMasterBlack)} master black`,
      icon: ShieldCheck,
    },
    {
      key: 'presenca',
      label: 'Presenca media',
      value: formatNumber(averageAttendance),
      note: 'Media consolidada da rede',
      icon: TrendingUp,
    },
  ];

  const outOfFlowAcademies = inactiveAcademies + suspendedAcademies;
  const healthLegend = [
    {
      key: 'active',
      label: 'Ativas',
      color: 'var(--success)',
      detail: `${formatNumber(activeAcademies)} academias`,
      share: activeShare,
    },
    {
      key: 'inactive',
      label: 'Inativas',
      color: 'rgba(127, 127, 147, 0.55)',
      detail: `${formatNumber(outOfFlowAcademies)} academias`,
      share: percentOf(outOfFlowAcademies, totalAcademies),
    },
    {
      key: 'attention',
      label: 'Em atencao',
      color: '#e8af48',
      detail: `${formatNumber(academiesInAttention)} academias`,
      share: percentOf(academiesInAttention, totalAcademies),
    },
  ];
  const healthRingGradient = `conic-gradient(var(--success) 0deg ${activeShare * 3.6}deg, rgba(127, 127, 147, 0.16) ${activeShare * 3.6}deg 360deg)`;

  let beltRingCursor = 0;
  const beltRingSegments = beltBreakdown
    .filter((entry) => entry.total > 0)
    .map((entry) => {
      const segmentStart = beltRingCursor * 3.6;
      beltRingCursor += entry.share;
      return `${entry.color} ${segmentStart}deg ${beltRingCursor * 3.6}deg`;
    });
  const beltRingGradient = beltRingSegments.length > 0
    ? `conic-gradient(${beltRingSegments.join(', ')}, rgba(127, 127, 147, 0.16) ${beltRingCursor * 3.6}deg 360deg)`
    : 'conic-gradient(rgba(127, 127, 147, 0.16) 0deg 360deg)';

  const performanceRows = [...filteredRows]
    .sort((left, right) => right.activeStudents - left.activeStudents || right.averageAttendance - left.averageAttendance)
    .slice(0, 5);

  const podiumRanked = topAcademies.slice(0, 3).map((academyRow, index) => ({
    ...academyRow,
    rank: index + 1,
  }));
  const podiumOrder = [podiumRanked[1], podiumRanked[0], podiumRanked[2]].filter(Boolean) as Array<
    AcademyRow & { rank: number }
  >;

  const recentActivities = [...academyRows]
    .filter((academyRow) => academyRow.lastActivityAt)
    .sort((left, right) => (right.lastActivityAt?.getTime() ?? 0) - (left.lastActivityAt?.getTime() ?? 0))
    .slice(0, 4)
    .map((academyRow) => ({
      id: academyRow.id,
      title: academyRow.name,
      desc: academyRow.attentionReasons[0] ?? 'Operacao dentro do padrao',
      time: academyRow.lastActivityLabel,
      tone: academyRow.attentionReasons.length > 0 ? 'is-warn' : 'is-ok',
    }));

  if (editingInstructor) {
    return (
      <InstructorEditModal
        instructor={editingInstructor}
        onClose={() => setEditingInstructor(null)}
        onSave={async (payload) => {
          await onUpdateInstructor(payload);
          setEditingInstructor(null);
        }}
      />
    );
  }

  return (
    <div className="view-shell superadmin-dashboard">
      {/* ── MOBILE LAYOUT ── escondido no desktop via CSS */}
      <div className="superadmin-mobile-layout">

        {/* Header */}
        <div className="sa-mob-header">
          <div className="sa-mob-header__avatar">SA</div>
          <div className="sa-mob-header__copy">
            <p className="sa-mob-header__eyebrow">Superadmin</p>
            <h1 className="sa-mob-header__title">
              {focusAcademyRow ? focusAcademyRow.name : 'Rede inteira'}
            </h1>
          </div>
          <div className="sa-mob-status-pill">
            <span className="sa-mob-status-pill__dot" />
            Leitura consolidada · {formatNumber(totalAcademies)} academias
          </div>
        </div>

        {/* Estatísticas da unidade em foco (mobile) */}
        {focusAcademyRow && focusStatistics ? (
          <>
            <div className="sa-mob-section">
              <p className="sa-mob-section__label">Estatísticas · {focusAcademyRow.name}</p>
              <div className="sa-mob-kpi-grid">
                <div className="sa-mob-kpi-tile">
                  <p className="sa-mob-kpi-tile__label">Presenças</p>
                  <p className="sa-mob-kpi-tile__value">{formatNumber(focusStatistics.totalAttendances)}</p>
                  <p className="sa-mob-kpi-tile__sublabel">{formatNumber(focusStatistics.finishedClassCount)} aulas</p>
                </div>
                <div className="sa-mob-kpi-tile">
                  <p className="sa-mob-kpi-tile__label">Ocupação</p>
                  <p className="sa-mob-kpi-tile__value">{focusStatistics.occupancyRate}%</p>
                  <p className="sa-mob-kpi-tile__sublabel">média</p>
                </div>
                <div className="sa-mob-kpi-tile">
                  <p className="sa-mob-kpi-tile__label">Média/aula</p>
                  <p className="sa-mob-kpi-tile__value">{formatNumber(focusStatistics.avgPerClass)}</p>
                  <p className="sa-mob-kpi-tile__sublabel">alunos</p>
                </div>
                <div className={`sa-mob-kpi-tile ${focusStatistics.atRiskStudents > 0 ? 'sa-mob-kpi-tile--danger' : ''}`}>
                  <p className="sa-mob-kpi-tile__label">Em risco</p>
                  <p className="sa-mob-kpi-tile__value">{formatNumber(focusStatistics.atRiskStudents)}</p>
                  <p className="sa-mob-kpi-tile__sublabel">alunos</p>
                </div>
              </div>
            </div>

            <div className="sa-mob-section">
              <p className="sa-mob-section__label">
                Dias mais frequentados{focusStatistics.peakWeekday ? ` · pico ${focusStatistics.peakWeekday.label}` : ''}
              </p>
              <FocusBarList
                emptyLabel="Sem aulas realizadas ainda."
                items={focusStatistics.byWeekday.map((bucket) => ({
                  key: bucket.key,
                  label: bucket.label,
                  value: bucket.attendances,
                  caption: `${formatNumber(bucket.classCount)} aulas`,
                }))}
              />
            </div>

            <div className="sa-mob-section">
              <p className="sa-mob-section__label">
                Horários de pico{focusStatistics.peakHour ? ` · ${focusStatistics.peakHour.label}` : ''}
              </p>
              <FocusBarList
                emptyLabel="Sem aulas realizadas ainda."
                items={focusStatistics.byHour.slice(0, 6).map((bucket) => ({
                  key: bucket.key,
                  label: bucket.label,
                  value: bucket.attendances,
                  caption: `${formatNumber(bucket.classCount)} aulas`,
                }))}
              />
            </div>

            <div className="sa-mob-section">
              <p className="sa-mob-section__label">Professores mais ativos</p>
              {focusStatistics.professors.length > 0 ? (
                <div className="superadmin-detail-list">
                  {focusStatistics.professors.slice(0, 6).map((professor) => (
                    <div key={professor.id} className="superadmin-detail-row">
                      <span>{professor.name}</span>
                      <strong>{formatNumber(professor.classCount)} aulas · {formatNumber(professor.totalAttendances)} pres.</strong>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="app-empty">Sem aulas realizadas ainda.</div>
              )}
            </div>

            <div className="sa-mob-section">
              <p className="sa-mob-section__label">Faixas da unidade</p>
              <div className="sa-mob-belt-grid">
                {focusStatistics.belts.map((entry) => (
                  <div key={entry.key} className="sa-mob-belt-item">
                    <span className="sa-mob-belt-dot" style={{ backgroundColor: entry.color }} />
                    <strong className="sa-mob-belt-count">{formatNumber(entry.total)}</strong>
                    <p className="sa-mob-belt-name">{entry.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {focusStatistics.monthlyTrend.length > 0 ? (
              <div className="sa-mob-section">
                <p className="sa-mob-section__label">Tendência mensal</p>
                <FocusBarList
                  emptyLabel="Sem histórico de presenças."
                  items={focusStatistics.monthlyTrend.map((bucket) => ({
                    key: bucket.key,
                    label: bucket.label,
                    value: bucket.attendances,
                  }))}
                />
              </div>
            ) : null}

            {focusStatistics.topStudents.length > 0 ? (
              <div className="sa-mob-section">
                <p className="sa-mob-section__label">Top frequentadores</p>
                <div className="superadmin-detail-list">
                  {focusStatistics.topStudents.map((student) => (
                    <div key={student.id} className="superadmin-detail-row">
                      <span>{student.name}</span>
                      <strong>{formatNumber(student.attendanceCount)} presenças</strong>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {/* KPI 2×2 */}
        <div className="sa-mob-kpi-grid">
          <div className="sa-mob-kpi-tile">
            <p className="sa-mob-kpi-tile__label">Academias</p>
            <p className="sa-mob-kpi-tile__value">{formatNumber(totalAcademies)}</p>
            <p className="sa-mob-kpi-tile__sublabel">{formatNumber(activeAcademies)} ativas</p>
          </div>
          <div className={`sa-mob-kpi-tile ${academiesInAttention > 0 ? 'sa-mob-kpi-tile--danger' : ''}`}>
            <p className="sa-mob-kpi-tile__label">Em atenção</p>
            <p className="sa-mob-kpi-tile__value">{formatNumber(academiesInAttention)}</p>
            <p className="sa-mob-kpi-tile__sublabel">academias</p>
          </div>
          <div className="sa-mob-kpi-tile">
            <p className="sa-mob-kpi-tile__label">Alunos ativos</p>
            <p className="sa-mob-kpi-tile__value">{formatNumber(globalStudents)}</p>
            <p className="sa-mob-kpi-tile__sublabel">{formatNumber(globalUsers)} usuários</p>
          </div>
          <div className="sa-mob-kpi-tile">
            <p className="sa-mob-kpi-tile__label">Lideranças</p>
            <p className="sa-mob-kpi-tile__value">{formatNumber(globalLeaders)}</p>
            <p className="sa-mob-kpi-tile__sublabel">{formatNumber(globalMasterBlack)} master black</p>
          </div>
        </div>

        {/* Hero dark — cobertura da rede */}
        <div className="sa-mob-health-card">
          <div className="sa-mob-health-card__left">
            <p className="sa-mob-health-card__percent">{activeShare}%</p>
            <p className="sa-mob-health-card__label">Cobertura ativa</p>
            <p className="sa-mob-health-card__sub">
              {formatNumber(activeAcademies)} de {formatNumber(totalAcademies)} academias
            </p>
          </div>
          <div className="sa-mob-health-card__ring">
            <svg viewBox="0 0 80 80" aria-hidden="true" className="sa-mob-ring-svg">
              <circle cx="40" cy="40" r="32" className="sa-mob-ring-track" />
              <circle
                cx="40" cy="40" r="32"
                className="sa-mob-ring-progress"
                style={{ strokeDashoffset: 201 - (activeShare / 100) * 201 }}
              />
            </svg>
          </div>
        </div>

        {/* Radar de atenção — condicional */}
        {attentionRows.length > 0 && (
          <div className="sa-mob-section">
            <p className="sa-mob-section__label">Radar de atenção</p>
            <div className="sa-mob-alert-list">
              {attentionRows.map((academyRow) => (
                <div key={academyRow.id} className="sa-mob-alert-item">
                  <div className="sa-mob-alert-item__body">
                    <p className="sa-mob-alert-item__name">{academyRow.name}</p>
                    <p className="sa-mob-alert-item__desc">
                      {academyRow.attentionReasons[0]}
                      {academyRow.attentionReasons.length > 1
                        ? ` +${academyRow.attentionReasons.length - 1} sinal`
                        : ''}
                    </p>
                  </div>
                  <span className="sa-mob-alert-badge">
                    {formatNumber(academyRow.attentionReasons.length)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lista de academias */}
        <div className="sa-mob-section">
          <p className="sa-mob-section__label">Academias da rede</p>
          <div className="sa-mob-academy-list">
            {filteredRows.map((academyRow) => (
              <div
                key={academyRow.id}
                className="sa-mob-academy-row"
                role="button"
                tabIndex={0}
                onClick={() => onEnterAcademy(academyRow.id)}
              >
                <span className={`sa-mob-dot ${academyRow.status === 'active' ? 'sa-mob-dot--active' : 'sa-mob-dot--risk'}`} />
                <div className="sa-mob-academy-row__body">
                  <p className="sa-mob-academy-row__name">{academyRow.name}</p>
                </div>
                <span className="sa-mob-academy-row__meta">
                  {formatNumber(academyRow.activeStudents)} alunos
                </span>
                <span className="sa-mob-academy-row__chevron" aria-hidden="true">›</span>
              </div>
            ))}
          </div>
        </div>

        {/* Faixas da base ativa */}
        <div className="sa-mob-section">
          <p className="sa-mob-section__label">Faixas da base ativa</p>
          <div className="sa-mob-belt-grid">
            {beltBreakdown.map((entry) => (
              <div key={entry.key} className="sa-mob-belt-item">
                <span className="sa-mob-belt-dot" style={{ backgroundColor: entry.color }} />
                <strong className="sa-mob-belt-count">{formatNumber(entry.total)}</strong>
                <p className="sa-mob-belt-name">{entry.label}</p>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* ── DESKTOP LAYOUT ── escondido no mobile via CSS */}
      <div className="superadmin-desktop">
        <header className="sa-desk-header">
          <div className="sa-desk-header__copy">
            <h1 className="sa-desk-header__title">Visão geral</h1>
            <p className="sa-desk-header__subtitle">
              Acompanhe o desempenho da sua rede em tempo real.
            </p>
          </div>
          <div className="sa-desk-header__actions">
            <div className="sa-date-pill">
              <CalendarDays size={16} />
              <span>{monthRangeLabel}</span>
            </div>
            {focusAcademyRow ? (
              <button type="button" onClick={onClearFocus} className="sa-clear-focus">
                Ver rede inteira
              </button>
            ) : null}
          </div>
        </header>

        <div className="sa-kpi-row">
          {desktopKpis.map((kpi) => {
            const KpiIcon = kpi.icon;
            return (
              <article key={kpi.key} className="sa-kpi-card">
                <span className="sa-kpi-card__icon">
                  <KpiIcon size={20} />
                </span>
                <div className="sa-kpi-card__body">
                  <p className="sa-kpi-card__label">{kpi.label}</p>
                  <p className="sa-kpi-card__value">{kpi.value}</p>
                  <p className="sa-kpi-card__note">{kpi.note}</p>
                </div>
              </article>
            );
          })}
          <article className={`sa-kpi-card sa-kpi-card--alert ${academiesInAttention > 0 ? 'is-active' : ''}`}>
            <span className="sa-kpi-card__icon">
              <AlertTriangle size={20} />
            </span>
            <div className="sa-kpi-card__body">
              <p className="sa-kpi-card__label">Atenção</p>
              <p className="sa-kpi-card__value">{formatNumber(academiesInAttention)}</p>
              <p className="sa-kpi-card__note">Requerem atenção</p>
            </div>
          </article>
        </div>

        <div className="sa-row sa-row--triple">
          <article className="sa-card">
            <div className="sa-card__head">
              <h3 className="sa-card__title">Saúde da rede</h3>
            </div>
            <div className="sa-health">
              <div className="sa-donut" style={{ background: healthRingGradient }}>
                <div className="sa-donut__core">
                  <strong>{activeShare}%</strong>
                  <span>{academiesInAttention > 0 ? 'Em atenção' : 'Saudável'}</span>
                </div>
              </div>
              <ul className="sa-legend">
                {healthLegend.map((item) => (
                  <li key={item.key} className="sa-legend__item">
                    <span className="sa-legend__dot" style={{ background: item.color }} />
                    <div className="sa-legend__copy">
                      <span className="sa-legend__label">{item.label}</span>
                      <span className="sa-legend__detail">{item.detail}</span>
                    </div>
                    <strong className="sa-legend__value">{item.share}%</strong>
                  </li>
                ))}
              </ul>
            </div>
          </article>

          <article className="sa-card">
            <div className="sa-card__head">
              <h3 className="sa-card__title">Distribuição por faixa</h3>
            </div>
            <div className="sa-health">
              <div className="sa-donut" style={{ background: beltRingGradient }}>
                <div className="sa-donut__core">
                  <strong>{formatNumber(activeStudentBase)}</strong>
                  <span>Alunos</span>
                </div>
              </div>
              <ul className="sa-legend sa-legend--compact">
                {beltBreakdown.map((entry) => (
                  <li key={entry.key} className="sa-legend__item">
                    <span className="sa-legend__dot" style={{ background: entry.color }} />
                    <span className="sa-legend__label">{entry.label}</span>
                    <span className="sa-legend__inline">
                      {formatNumber(entry.total)} ({entry.share}%)
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </article>

          <article className="sa-card">
            <div className="sa-card__head">
              <h3 className="sa-card__title">Desempenho das academias</h3>
            </div>
            {performanceRows.length > 0 ? (
              <table className="sa-table">
                <thead>
                  <tr>
                    <th>Academia</th>
                    <th>Alunos ativos</th>
                    <th>Presença média</th>
                  </tr>
                </thead>
                <tbody>
                  {performanceRows.map((row) => (
                    <tr
                      key={row.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => onEnterAcademy(row.id)}
                      onKeyDown={(event) => event.key === 'Enter' && onEnterAcademy(row.id)}
                    >
                      <td className="sa-table__name">{row.name}</td>
                      <td>{formatNumber(row.activeStudents)}</td>
                      <td>
                        <div className="sa-table__attendance">
                          <span className="sa-table__attendance-value">
                            {row.activeStudents > 0 ? formatNumber(row.averageAttendance) : '—'}
                          </span>
                          <div className="sa-table__bar">
                            <span
                              style={{
                                width: `${Math.min(100, row.averageAttendance)}%`,
                                background: row.averageAttendance >= 50 ? 'var(--success)' : 'var(--danger)',
                              }}
                            />
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="app-empty">Nenhuma academia disponível neste recorte.</div>
            )}
          </article>
        </div>

        <div className="sa-row sa-row--duo">
          <article className="sa-card">
            <div className="sa-card__head">
              <h3 className="sa-card__title">Ranking de academias</h3>
            </div>
            {podiumOrder.length > 0 ? (
              <div className="sa-podium">
                {podiumOrder.map((item) => (
                  <div
                    key={item.id}
                    className={`sa-podium__card sa-podium__card--rank-${item.rank}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => onEnterAcademy(item.id)}
                    onKeyDown={(event) => event.key === 'Enter' && onEnterAcademy(item.id)}
                  >
                    <span className="sa-podium__rank">{item.rank}</span>
                    <p className="sa-podium__name">{item.name}</p>
                    <p className="sa-podium__metric">{formatNumber(item.averageAttendance)}</p>
                    <p className="sa-podium__metric-label">Presença média</p>
                    <p className="sa-podium__students">{formatNumber(item.activeStudents)}</p>
                    <p className="sa-podium__students-label">Alunos ativos</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="app-empty">Sem academias suficientes para o ranking.</div>
            )}
          </article>

          <article className="sa-card">
            <div className="sa-card__head">
              <h3 className="sa-card__title">Atividades recentes</h3>
            </div>
            {recentActivities.length > 0 ? (
              <ul className="sa-activity-list">
                {recentActivities.map((item) => (
                  <li key={item.id} className="sa-activity-item">
                    <span className={`sa-activity-item__icon ${item.tone}`}>
                      <Activity size={15} />
                    </span>
                    <div className="sa-activity-item__copy">
                      <p className="sa-activity-item__title">{item.title}</p>
                      <p className="sa-activity-item__desc">{item.desc}</p>
                    </div>
                    <span className="sa-activity-item__time">{item.time}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="app-empty">Nenhuma atividade recente registrada.</div>
            )}
          </article>
        </div>

        {focusAcademyRow ? (
          <article className="sa-card sa-card--focus">
            <div className="sa-card__head">
              <div className="flex items-center gap-3">
                <span className="sa-kpi-card__icon">
                  <Building2 size={18} />
                </span>
                <div>
                  <p className="app-section-label">Academia em foco</p>
                  <h3 className="sa-card__title">{focusAcademyRow.name}</h3>
                </div>
              </div>
              <span className={getStatusBadgeClass(focusAcademyRow.status)}>
                {getStatusLabel(focusAcademyRow.status)}
              </span>
            </div>

            <div className="superadmin-chip-row superadmin-focus-panel__chips">
              <span className="app-badge app-badge--muted">{focusAcademyRow.timezone}</span>
              <span className="app-badge app-badge--gold">{focusAcademyRow.lastActivityLabel}</span>
              {focusAcademyRow.attentionReasons.length > 0 ? (
                <span className="app-badge app-badge--danger">
                  {formatNumber(focusAcademyRow.attentionReasons.length)} sinais ativos
                </span>
              ) : (
                <span className="app-badge app-badge--success">Operação estável</span>
              )}
            </div>

            <div className="superadmin-focus-stats">
              {focusStats.map((metric, index) => (
                <div key={`${metric.label}-${index}`} className="superadmin-mini-stat">
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </div>
              ))}
            </div>

            <div className="superadmin-focus-panel__grid">
              <div className="superadmin-subsection">
                <div className="superadmin-subsection__header">
                  <div className="flex items-center gap-2">
                    <Activity size={16} />
                    <strong>Resumo operacional</strong>
                  </div>
                  <span>{focusAcademyRow.timezone}</span>
                </div>
                <div className="superadmin-detail-list">
                  {focusOperationalRows.map((row, index) => (
                    <div key={`${row.label}-${index}`} className="superadmin-detail-row">
                      <span>{row.label}</span>
                      <strong>{row.value}</strong>
                    </div>
                  ))}
                </div>
              </div>

              <div className="superadmin-subsection">
                <div className="superadmin-subsection__header">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={16} />
                    <strong>Instrutores da unidade</strong>
                  </div>
                  <span>{focusInstructors.length}</span>
                </div>
                {focusInstructors.length > 0 ? (
                  <div className="superadmin-detail-list">
                    {focusInstructors.map((instructor) => (
                      <div
                        key={instructor.id}
                        className="superadmin-detail-row superadmin-detail-row--clickable"
                        role="button"
                        tabIndex={0}
                        onClick={() => setEditingInstructor(instructor)}
                        onKeyDown={(event) => event.key === 'Enter' && setEditingInstructor(instructor)}
                      >
                        <div>
                          <p className="text-sm font-bold">{instructor.displayName}</p>
                          <p className="text-xs text-[color:var(--text-soft)]">{instructor.email}</p>
                        </div>
                        <span className="app-badge app-badge--gold">Instrutor</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="app-empty">Nenhum instrutor ativo nesta unidade.</div>
                )}
              </div>
            </div>
          </article>
        ) : null}

        {focusAcademyRow && focusStatistics ? (
          <>
            <div className="sa-row sa-row--triple">
              <article className="sa-card">
                <div className="sa-card__head">
                  <h3 className="sa-card__title">Dias mais frequentados</h3>
                  <span className="app-badge app-badge--muted">
                    {focusStatistics.peakWeekday ? `Pico: ${focusStatistics.peakWeekday.label}` : 'Sem dados'}
                  </span>
                </div>
                <FocusBarList
                  emptyLabel="Sem aulas realizadas ainda."
                  items={focusStatistics.byWeekday.map((bucket) => ({
                    key: bucket.key,
                    label: bucket.label,
                    value: bucket.attendances,
                    caption: `${formatNumber(bucket.classCount)} aulas`,
                  }))}
                />
              </article>

              <article className="sa-card">
                <div className="sa-card__head">
                  <h3 className="sa-card__title">Horários de pico</h3>
                  <span className="app-badge app-badge--muted">
                    {focusStatistics.peakHour ? `Pico: ${focusStatistics.peakHour.label}` : 'Sem dados'}
                  </span>
                </div>
                <FocusBarList
                  emptyLabel="Sem aulas realizadas ainda."
                  items={focusStatistics.byHour.slice(0, 8).map((bucket) => ({
                    key: bucket.key,
                    label: bucket.label,
                    value: bucket.attendances,
                    caption: `${formatNumber(bucket.classCount)} aulas`,
                  }))}
                />
              </article>

              <article className="sa-card">
                <div className="sa-card__head">
                  <h3 className="sa-card__title">Tendência mensal</h3>
                  <TrendingUp size={16} />
                </div>
                <FocusBarList
                  emptyLabel="Sem histórico de presenças."
                  items={focusStatistics.monthlyTrend.map((bucket) => ({
                    key: bucket.key,
                    label: bucket.label,
                    value: bucket.attendances,
                  }))}
                />
              </article>
            </div>

            <div className="sa-row sa-row--duo">
              <article className="sa-card">
                <div className="sa-card__head">
                  <h3 className="sa-card__title">Professores mais ativos</h3>
                  <span className="app-badge app-badge--gold">{formatNumber(focusStatistics.professors.length)}</span>
                </div>
                {focusStatistics.professors.length > 0 ? (
                  <table className="sa-table">
                    <thead>
                      <tr>
                        <th>Professor</th>
                        <th>Aulas</th>
                        <th>Presenças</th>
                        <th>Média</th>
                      </tr>
                    </thead>
                    <tbody>
                      {focusStatistics.professors.slice(0, 8).map((professor) => (
                        <tr key={professor.id}>
                          <td className="sa-table__name">{professor.name}</td>
                          <td>{formatNumber(professor.classCount)}</td>
                          <td>{formatNumber(professor.totalAttendances)}</td>
                          <td>{formatNumber(professor.avgPerClass)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="app-empty">Nenhuma aula realizada com professor registrado.</div>
                )}
              </article>

              <article className="sa-card">
                <div className="sa-card__head">
                  <h3 className="sa-card__title">Aulas e ocupação</h3>
                  <BarChart3 size={16} />
                </div>
                <div className="superadmin-focus-stats">
                  <div className="superadmin-mini-stat">
                    <span>Ocupação média</span>
                    <strong>{focusStatistics.occupancyRate}%</strong>
                  </div>
                  <div className="superadmin-mini-stat">
                    <span>Presença média/aula</span>
                    <strong>{formatNumber(focusStatistics.avgPerClass)}</strong>
                  </div>
                  <div className="superadmin-mini-stat">
                    <span>Aulas realizadas</span>
                    <strong>{formatNumber(focusStatistics.finishedClassCount)}</strong>
                  </div>
                  <div className="superadmin-mini-stat">
                    <span>Cancelamento</span>
                    <strong>{focusStatistics.cancellationRate}%</strong>
                  </div>
                </div>
                <div className="superadmin-detail-list">
                  <div className="superadmin-detail-row">
                    <span>Presenças totais</span>
                    <strong>{formatNumber(focusStatistics.totalAttendances)}</strong>
                  </div>
                  <div className="superadmin-detail-row">
                    <span>Agendadas / Ao vivo</span>
                    <strong>
                      {formatNumber(focusStatistics.classStatusCounts.scheduled)} / {formatNumber(focusStatistics.classStatusCounts.active)}
                    </strong>
                  </div>
                  <div className="superadmin-detail-row">
                    <span>Canceladas</span>
                    <strong>{formatNumber(focusStatistics.classStatusCounts.cancelled)}</strong>
                  </div>
                  <div className="superadmin-detail-row">
                    <span>Tatame mais usado</span>
                    <strong>
                      {focusStatistics.topTatame
                        ? `${focusStatistics.topTatame.name} (${formatNumber(focusStatistics.topTatame.classCount)})`
                        : '—'}
                    </strong>
                  </div>
                </div>
              </article>
            </div>

            <div className="sa-row sa-row--duo">
              <article className="sa-card">
                <div className="sa-card__head">
                  <h3 className="sa-card__title">Faixas da unidade</h3>
                </div>
                <div className="sa-health">
                  <div className="sa-donut" style={{ background: focusStatistics.beltRingGradient }}>
                    <div className="sa-donut__core">
                      <strong>{formatNumber(focusStatistics.activeStudents)}</strong>
                      <span>Alunos</span>
                    </div>
                  </div>
                  <ul className="sa-legend sa-legend--compact">
                    {focusStatistics.belts.map((belt) => (
                      <li key={belt.key} className="sa-legend__item">
                        <span className="sa-legend__dot" style={{ background: belt.color }} />
                        <span className="sa-legend__label">{belt.label}</span>
                        <span className="sa-legend__inline">
                          {formatNumber(belt.total)} ({belt.share}%)
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>

              <article className="sa-card">
                <div className="sa-card__head">
                  <h3 className="sa-card__title">Alunos da unidade</h3>
                  <Users size={16} />
                </div>
                <div className="superadmin-focus-stats">
                  <div className="superadmin-mini-stat">
                    <span>Ativos</span>
                    <strong>{formatNumber(focusStatistics.activeStudents)}</strong>
                  </div>
                  <div className="superadmin-mini-stat">
                    <span>Novos (30d)</span>
                    <strong>{formatNumber(focusStatistics.newStudents)}</strong>
                  </div>
                  <div className="superadmin-mini-stat">
                    <span>Em risco</span>
                    <strong>{formatNumber(focusStatistics.atRiskStudents)}</strong>
                  </div>
                  <div className="superadmin-mini-stat">
                    <span>Convidados</span>
                    <strong>{formatNumber(focusStatistics.invitedStudents)}</strong>
                  </div>
                </div>
                {focusStatistics.topStudents.length > 0 ? (
                  <div className="superadmin-detail-list">
                    {focusStatistics.topStudents.map((student) => (
                      <div key={student.id} className="superadmin-detail-row">
                        <span>{student.name}</span>
                        <strong>{formatNumber(student.attendanceCount)} presenças</strong>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="app-empty">Sem alunos ativos para ranquear.</div>
                )}
              </article>
            </div>
          </>
        ) : null}
      </div>

    </div>
  );
};

export default SuperadminDashboardView;
