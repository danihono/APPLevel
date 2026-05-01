import React, { useMemo, useState } from 'react';
import { getBeltMeta } from '../beltCatalog';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  Clock3,
  Filter,
  ShieldCheck,
  Users,
} from 'lucide-react';
import type { FirestoreEntity } from '../services/firebase/data';
import type {
  AcademyRecord,
  ClassRecord,
  CompetitionRecord,
  UserRecord,
} from '../services/firebase/models';

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
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortMode, setSortMode] = useState<SortMode>('attention');

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
  const focusActiveClasses = classes.filter((item) => item.status === 'active').length;
  const focusScheduledClasses = classes.filter((item) => item.status === 'scheduled').length;
  const focusOpenCompetitions = competitions.filter((item) => item.status === 'published').length;
  const focusFinishedCompetitions = competitions.filter((item) => item.status === 'finished').length;
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

      <section className="superadmin-hero">
        <div className={`superadmin-focus-inline ${focusAcademyRow ? 'is-focused' : 'is-network'}`}>
          <div className="superadmin-focus-inline__copy">
            <p className="app-section-label">{focusAcademyRow ? 'Academia em foco' : 'Modo de leitura'}</p>
            <div className="superadmin-focus-inline__title">
              <h2 className="text-xl font-bold">{focusAcademyRow ? focusAcademyRow.name : 'Rede inteira'}</h2>
              <span className={focusAcademyRow ? getStatusBadgeClass(focusAcademyRow.status) : 'app-badge app-badge--gold'}>
                {focusAcademyRow ? getStatusLabel(focusAcademyRow.status) : 'Consolidado'}
              </span>
            </div>
          </div>

          <div className="superadmin-focus-inline__meta">
            {focusAcademyRow ? (
              <>
                <span className="app-badge app-badge--muted">{focusAcademyRow.timezone}</span>
                <span className="app-badge app-badge--gold">{focusAcademyRow.lastActivityLabel}</span>
                <span className="app-badge app-badge--muted">{formatNumber(focusActiveStudents)} alunos ativos</span>
                {focusAcademyRow.invitedUsers > 0 ? (
                  <span className="app-badge app-badge--gold">{formatNumber(focusAcademyRow.invitedUsers)} convites</span>
                ) : null}
                {focusAcademyRow.attentionReasons.length > 0 ? (
                  <span className="app-badge app-badge--danger">{formatNumber(focusAcademyRow.attentionReasons.length)} sinais</span>
                ) : (
                  <span className="app-badge app-badge--success">Sem alertas</span>
                )}
                <button type="button" onClick={onClearFocus} className="app-button app-button--ghost app-button--small">
                  Ver rede inteira
                </button>
              </>
            ) : (
              <>
                <span className="app-badge app-badge--gold">Leitura consolidada</span>
                <span className="app-badge app-badge--muted">{formatNumber(totalAcademies)} academias</span>
                <span className="app-badge app-badge--muted">{formatNumber(globalStudents)} alunos ativos</span>
                <span className={`app-badge ${academiesInAttention > 0 ? 'app-badge--danger' : 'app-badge--success'}`}>
                  {formatNumber(academiesInAttention)} em atencao
                </span>
              </>
            )}
          </div>
        </div>

        <div className="superadmin-kpi-grid">
          {overviewKpis.map((kpi, index) => (
            <article key={`${kpi.label}-${index}`} className="superadmin-kpi-tile">
              <p className="superadmin-kpi-tile__label">{kpi.label}</p>
              <p className="superadmin-kpi-tile__value">{kpi.value}</p>
              <p className="superadmin-kpi-tile__note">{kpi.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="app-panel app-panel-pad superadmin-filter-panel">
        <div className="superadmin-filter-panel__header">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell">
              <Filter size={18} />
            </div>
            <div>
              <p className="app-section-label">Controles da leitura</p>
              <h2 className="text-xl font-bold">Filtros da rede</h2>
            </div>
          </div>

          <span className="app-badge app-badge--muted">{formatNumber(filteredRows.length)} academias no recorte</span>
        </div>

        <div className="superadmin-filter-grid">
          <label className="app-field">
            <span className="app-field__label">Busca</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome ou slug da academia"
              className="app-input"
            />
          </label>

          <label className="app-field">
            <span className="app-field__label">Status</span>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
              className="app-select"
            >
              <option value="all">Todos os status</option>
              <option value="active">Ativas</option>
              <option value="inactive">Inativas</option>
              <option value="suspended">Suspensas</option>
            </select>
          </label>

          <label className="app-field">
            <span className="app-field__label">Ordenacao</span>
            <select
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
              className="app-select"
            >
              <option value="attention">Mais sinais de atencao</option>
              <option value="students">Maior base ativa</option>
              <option value="attendance">Maior media de presenca</option>
            </select>
          </label>
        </div>
      </section>

      <section className="superadmin-grid superadmin-grid--primary">
        <article className="app-panel app-panel-pad">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell">
              <BarChart3 size={18} />
            </div>
            <div>
              <p className="app-section-label">Saude da rede</p>
              <h2 className="text-xl font-bold">Distribuicao operacional das academias</h2>
            </div>
          </div>

          <div className="superadmin-health-layout">
            <div className="superadmin-health-hero">
              <div className="superadmin-health-hero__top">
                <span className={healthBadgeClass}>{healthBadgeLabel}</span>
                <span className="superadmin-health-hero__meta">{formatNumber(totalAcademies)} academias no recorte</span>
              </div>

              <div className="superadmin-health-hero__ring">
                <div
                  className="superadmin-ring"
                  style={{
                    background: `conic-gradient(var(--success) 0deg ${activeDegrees}deg, rgba(196, 151, 70, 0.92) ${activeDegrees}deg ${inactiveDegrees}deg, var(--danger) ${inactiveDegrees}deg ${suspendedDegrees}deg, rgba(127, 127, 147, 0.16) ${suspendedDegrees}deg 360deg)`,
                  }}
                >
                  <div className="superadmin-ring__core">
                    <span className="superadmin-ring__eyebrow">Cobertura ativa</span>
                    <strong>{activeShare}%</strong>
                    <span>da rede</span>
                  </div>
                </div>
              </div>

              <div className="superadmin-health-hero__summary">
                <div>
                  <p className="superadmin-health-hero__label">Panorama do recorte</p>
                  <strong className="superadmin-health-hero__title">{healthHeadline}</strong>
                  <p className="superadmin-health-hero__copy">{healthCopy}</p>
                </div>

                <div className="superadmin-health-pill-grid">
                  {healthSummaryCards.map((item) => (
                    <div key={item.key} className={`superadmin-health-pill ${item.toneClass}`}>
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="superadmin-status-grid superadmin-status-grid--operational">
              {operationalStatusCards.map((item) => (
                <div key={item.key} className={`superadmin-status-card ${item.toneClass}`}>
                  <div className="superadmin-status-card__top">
                    <span className={item.badgeClass}>{item.label}</span>
                    <div className="superadmin-status-card__value">
                      <strong>{formatNumber(item.count)}</strong>
                      <span className="superadmin-status-card__share">{item.share}% da rede</span>
                    </div>
                  </div>

                  <div className="superadmin-status-card__bar">
                    <span style={{ width: `${item.share}%` }} />
                  </div>

                  <div className="superadmin-status-card__foot">
                    <p className="superadmin-status-card__note">{item.note}</p>
                    <span>{formatNumber(item.count)} academia{item.count === 1 ? '' : 's'}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="superadmin-subsection">
            <div className="superadmin-subsection__header">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} />
                <strong>Radar de atencao</strong>
              </div>
              <span>{formatNumber(attentionRows.length)}</span>
            </div>

            {attentionRows.length > 0 ? (
              <div className="superadmin-alert-list">
                {attentionRows.map((academyRow) => (
                  <div key={academyRow.id} className="superadmin-alert-item">
                    <div className="superadmin-alert-item__copy">
                      <strong>{academyRow.name}</strong>
                      <p>
                        {academyRow.attentionReasons[0]}
                        {academyRow.attentionReasons.length > 1
                          ? ` +${academyRow.attentionReasons.length - 1} sinal`
                          : ''}
                      </p>
                    </div>
                    <div className="superadmin-alert-item__meta">
                      <span className="app-badge app-badge--danger">{formatNumber(academyRow.attentionReasons.length)} sinais</span>
                      <span>{academyRow.lastActivityLabel}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="app-empty">Nenhuma academia apareceu com alerta nos filtros atuais.</div>
            )}
          </div>
        </article>

        <article className="app-panel app-panel--tint app-panel-pad superadmin-focus-panel">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell">
              <Building2 size={18} />
            </div>
            <div>
              <p className="app-section-label">{focusAcademyRow ? 'Academia em foco' : 'Leitura consolidada'}</p>
              <h2 className="text-xl font-bold">
                {focusAcademyRow ? focusAcademyRow.name : 'Rede inteira'}
              </h2>
            </div>
          </div>

          {focusAcademyRow ? (
            <>
              <div className="superadmin-chip-row superadmin-focus-panel__chips">
                <span className="app-badge app-badge--muted">{focusAcademyRow.timezone}</span>
                <span className="app-badge app-badge--gold">{focusAcademyRow.lastActivityLabel}</span>
                {focusAcademyRow.attentionReasons.length > 0 ? (
                  <span className="app-badge app-badge--danger">
                    {formatNumber(focusAcademyRow.attentionReasons.length)} sinais ativos
                  </span>
                ) : (
                  <span className="app-badge app-badge--success">Operacao estavel</span>
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
              </div>
            </>
          ) : (
            <div className="app-empty superadmin-focus-empty">
              <strong>Rede inteira em leitura consolidada.</strong>
              <span>Escolha uma academia no mapa abaixo para destrinchar alunos, aulas e operacao.</span>
            </div>
          )}
        </article>
      </section>

      <section className="superadmin-grid superadmin-grid--secondary">
        <article className="app-panel app-panel-pad">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell">
              <Users size={18} />
            </div>
            <div>
              <p className="app-section-label">Maior base ativa</p>
              <h2 className="text-xl font-bold">Academias com mais alunos ativos</h2>
            </div>
          </div>

          {topAcademies.length > 0 ? (
            <div className="superadmin-bar-list">
              {topAcademies.map((academyRow) => {
                const maxValue = topAcademies[0]?.activeStudents || 1;
                const fill = percentOf(academyRow.activeStudents, maxValue);

                return (
                  <div key={academyRow.id} className="superadmin-bar-item">
                    <div className="superadmin-bar-item__header">
                      <div>
                        <strong>{academyRow.name}</strong>
                        <p>{academyRow.leaderCount} liderancas ativas</p>
                      </div>
                      <div className="text-right">
                        <strong>{formatNumber(academyRow.activeStudents)}</strong>
                        <p>alunos ativos</p>
                      </div>
                    </div>
                    <div className="superadmin-bar">
                      <span style={{ width: `${fill}%` }} />
                    </div>
                    <div className="superadmin-bar-item__footer">
                      <span>Presenca media {formatNumber(academyRow.averageAttendance)}</span>
                      <span>{academyRow.lastActivityLabel}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="app-empty">Nenhuma academia disponivel para comparar neste recorte.</div>
          )}
        </article>

        <article className="app-panel app-panel-pad">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell">
              <ShieldCheck size={18} />
            </div>
            <div>
              <p className="app-section-label">Distribuicao da rede</p>
              <h2 className="text-xl font-bold">Perfis ativos e mix de faixas</h2>
            </div>
          </div>

          <div className="superadmin-subsection">
            <div className="superadmin-subsection__header">
              <strong>Perfis ativos</strong>
              <span>{formatNumber(filteredActiveUsers.length)} usuarios</span>
            </div>

            <div className="superadmin-role-list">
              {roleBreakdown.map((entry) => (
                <div key={entry.role} className="superadmin-role-row">
                  <div className="superadmin-role-row__header">
                    <span>{entry.label}</span>
                    <strong>{formatNumber(entry.total)}</strong>
                  </div>
                  <div className="superadmin-bar superadmin-bar--thin">
                    <span style={{ width: `${entry.share}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="superadmin-subsection">
            <div className="superadmin-subsection__header">
              <strong>Faixas da base ativa</strong>
              <span>{formatNumber(activeStudentBase)} alunos</span>
            </div>

            <div className="superadmin-belt-grid">
              {beltBreakdown.map((entry) => (
                <div key={entry.key} className="superadmin-belt-card">
                  <div className="superadmin-belt-card__header">
                    <span
                      className="superadmin-belt-dot"
                      style={{ backgroundColor: entry.color }}
                    />
                    <strong>{entry.label}</strong>
                  </div>
                  <p>{formatNumber(entry.total)} alunos</p>
                  <div className="superadmin-bar superadmin-bar--thin">
                    <span style={{ width: `${entry.share}%`, background: entry.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </article>
      </section>

      <section className="superadmin-academy-section">
        <div className="superadmin-section-header">
          <div>
            <p className="app-section-label">Mapa operacional</p>
            <h2 className="app-section-title">Academias da rede</h2>
            <p className="app-section-copy">
              Cards compactos com status, base ativa, capacidade e risco operacional.
            </p>
          </div>
          <span className="app-badge app-badge--muted">{formatNumber(filteredRows.length)} academias</span>
        </div>

        {filteredRows.length > 0 ? (
          <div className="superadmin-grid superadmin-grid--cards">
            {filteredRows.map((academyRow) => {
              const selected = academyRow.id === selectedAcademyId;
              const masterBlackPressure = Math.min(100, percentOf(academyRow.masterBlackCount, academyRow.masterBlackLimit));
              const activationRate = percentOf(academyRow.activeUsers, academyRow.totalUsers);

              return (
                <article key={academyRow.id} className={`app-panel app-panel-pad superadmin-academy-card ${selected ? 'app-panel--tint' : ''}`}>
                  <div className="superadmin-card-header">
                    <div className="superadmin-card-header__main">
                      <div className="superadmin-card-header__title">
                        <h3 className="superadmin-card-title">{academyRow.name}</h3>
                        <span className={getStatusBadgeClass(academyRow.status)}>
                          {getStatusLabel(academyRow.status)}
                        </span>
                        {selected ? <span className="app-badge app-badge--gold">Em foco</span> : null}
                      </div>
                      <div className="superadmin-chip-row superadmin-chip-row--tight superadmin-card-meta">
                        <span className="app-badge app-badge--muted">{academyRow.slug}</span>
                        <span className="app-badge app-badge--muted">{academyRow.timezone}</span>
                        {academyRow.invitedUsers > 0 ? (
                          <span className="app-badge app-badge--gold">{formatNumber(academyRow.invitedUsers)} convites</span>
                        ) : null}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => onEnterAcademy(academyRow.id)}
                      className={`app-button app-button--small ${selected ? 'app-button--gold' : 'app-button--dark'}`}
                    >
                      {selected ? 'Em foco' : 'Focar'}
                    </button>
                  </div>

                  <div className="superadmin-card-stats">
                    <div className="superadmin-mini-stat superadmin-mini-stat--compact">
                      <span>Usuarios totais</span>
                      <strong>{formatNumber(academyRow.totalUsers)}</strong>
                    </div>
                    <div className="superadmin-mini-stat superadmin-mini-stat--compact">
                      <span>Alunos ativos</span>
                      <strong>{formatNumber(academyRow.activeStudents)}</strong>
                    </div>
                    <div className="superadmin-mini-stat superadmin-mini-stat--compact">
                      <span>Liderancas</span>
                      <strong>{formatNumber(academyRow.leaderCount)}</strong>
                    </div>
                    <div className="superadmin-mini-stat superadmin-mini-stat--compact">
                      <span>Presenca media</span>
                      <strong>{formatNumber(academyRow.averageAttendance)}</strong>
                    </div>
                  </div>

                  <div className="superadmin-card-bars">
                    <div className="superadmin-card-bar">
                      <div className="superadmin-card-bar__header">
                        <span>Capacidade de master black</span>
                        <strong>{academyRow.masterBlackCount}/{academyRow.masterBlackLimit}</strong>
                      </div>
                      <div className="superadmin-bar superadmin-bar--thin">
                        <span
                          style={{
                            width: `${masterBlackPressure}%`,
                            background: academyRow.masterBlackCount > academyRow.masterBlackLimit
                              ? 'var(--danger)'
                              : 'var(--gold-glow)',
                          }}
                        />
                      </div>
                    </div>

                    <div className="superadmin-card-bar">
                      <div className="superadmin-card-bar__header">
                        <span>Usuarios ativos na base</span>
                        <strong>{activationRate}%</strong>
                      </div>
                      <div className="superadmin-bar superadmin-bar--thin">
                        <span style={{ width: `${activationRate}%`, background: 'var(--success)' }} />
                      </div>
                    </div>
                  </div>

                  <div className="superadmin-card-footer">
                    <div className="superadmin-card-footnote">
                      <Clock3 size={15} />
                      <span>{academyRow.lastActivityLabel}</span>
                    </div>
                  </div>

                  {academyRow.attentionReasons.length > 0 ? (
                    <div className="superadmin-card-alert">
                      <AlertTriangle size={16} />
                      <span>
                        {academyRow.attentionReasons[0]}
                        {academyRow.attentionReasons.length > 1
                          ? ` +${academyRow.attentionReasons.length - 1} sinal`
                          : ''}
                      </span>
                    </div>
                  ) : (
                    <div className="superadmin-card-ok">
                      <ShieldCheck size={16} />
                      <span>Operacao sem alertas relevantes.</span>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="app-empty">Nenhuma academia encontrada com os filtros atuais.</div>
        )}
      </section>
    </div>
  );
};

export default SuperadminDashboardView;
