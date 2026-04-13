import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Building2,
  Clock3,
  Filter,
  ShieldCheck,
  Trophy,
  Users,
} from 'lucide-react';
import type { FirestoreEntity } from '../services/firebase/data';
import type {
  AcademyRecord,
  ClassRecord,
  CompetitionRecord,
  RankingRecord,
  UserRecord,
} from '../services/firebase/models';

interface SuperadminDashboardViewProps {
  academies: Array<FirestoreEntity<AcademyRecord>>;
  allUsers: Array<FirestoreEntity<UserRecord>>;
  academy: FirestoreEntity<AcademyRecord> | null;
  academyUsers: Array<FirestoreEntity<UserRecord>>;
  classes: Array<FirestoreEntity<ClassRecord>>;
  rankings: Array<FirestoreEntity<RankingRecord>>;
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
  totalRankingPoints: number;
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

  return `Atividade ha ${daysSince} dias`;
}

const SuperadminDashboardView: React.FC<SuperadminDashboardViewProps> = ({
  academies,
  allUsers,
  academy,
  academyUsers,
  classes,
  rankings,
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
    const totalRankingPoints = academyScopedUsers.reduce((sum, entry) => sum + (entry.rankingPoints ?? 0), 0);
    const lastActivityAt = getLatestDate([
      academyEntry.updatedAt?.toDate(),
      academyEntry.createdAt?.toDate(),
      ...academyScopedUsers.flatMap((entry) => [
        entry.lastAttendanceAt?.toDate(),
        entry.lastLoginAt?.toDate(),
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
      totalRankingPoints,
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

  const topAcademies = useMemo(
    () => [...filteredRows]
      .sort((left, right) => right.activeStudents - left.activeStudents || right.totalRankingPoints - left.totalRankingPoints)
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
  const focusTopRankings = [...rankings]
    .sort((left, right) => left.position - right.position || right.score - left.score)
    .slice(0, 3);
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
      { label: 'Ranking acumulado', value: formatNumber(focusAcademyRow.totalRankingPoints) },
      { label: 'Aulas agendadas', value: formatNumber(focusScheduledClasses) },
      { label: 'Competicoes concluidas', value: formatNumber(focusFinishedCompetitions) },
      { label: 'Ultima atividade', value: focusAcademyRow.lastActivityLabel },
    ]
    : [];

  const totalRowsForRing = Math.max(totalAcademies, 1);
  const activeDegrees = (activeAcademies / totalRowsForRing) * 360;
  const inactiveDegrees = activeDegrees + ((inactiveAcademies / totalRowsForRing) * 360);
  const suspendedDegrees = inactiveDegrees + ((suspendedAcademies / totalRowsForRing) * 360);

  return (
    <div className="view-shell superadmin-dashboard">
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
          {overviewKpis.map((kpi) => (
            <article key={kpi.label} className="superadmin-kpi-tile">
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
            <div
              className="superadmin-ring"
              style={{
                background: `conic-gradient(var(--success) 0deg ${activeDegrees}deg, rgba(196, 151, 70, 0.9) ${activeDegrees}deg ${inactiveDegrees}deg, var(--danger) ${inactiveDegrees}deg ${suspendedDegrees}deg, rgba(127, 127, 147, 0.18) ${suspendedDegrees}deg 360deg)`,
              }}
            >
              <div className="superadmin-ring__core">
                <strong>{percentOf(activeAcademies, totalAcademies)}%</strong>
                <span>ativas</span>
              </div>
            </div>

            <div className="superadmin-status-grid">
              <div className="superadmin-status-card">
                <div className="superadmin-status-card__top">
                  <span className="app-badge app-badge--success">Ativas</span>
                  <strong>{formatNumber(activeAcademies)}</strong>
                </div>
                <p className="superadmin-status-card__note">Operando no recorte atual</p>
              </div>
              <div className="superadmin-status-card">
                <div className="superadmin-status-card__top">
                  <span className="app-badge app-badge--muted">Inativas</span>
                  <strong>{formatNumber(inactiveAcademies)}</strong>
                </div>
                <p className="superadmin-status-card__note">Fora da rotina principal</p>
              </div>
              <div className="superadmin-status-card">
                <div className="superadmin-status-card__top">
                  <span className="app-badge app-badge--danger">Suspensas</span>
                  <strong>{formatNumber(suspendedAcademies)}</strong>
                </div>
                <p className="superadmin-status-card__note">Pedem acao imediata</p>
              </div>
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
                <span className="app-badge app-badge--muted">{formatNumber(rankings.length)} atletas no ranking</span>
                {focusAcademyRow.attentionReasons.length > 0 ? (
                  <span className="app-badge app-badge--danger">
                    {formatNumber(focusAcademyRow.attentionReasons.length)} sinais ativos
                  </span>
                ) : (
                  <span className="app-badge app-badge--success">Operacao estavel</span>
                )}
              </div>

              <div className="superadmin-focus-stats">
                {focusStats.map((metric) => (
                  <div key={metric.label} className="superadmin-mini-stat">
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
                    {focusOperationalRows.map((row) => (
                      <div key={row.label} className="superadmin-detail-row">
                        <span>{row.label}</span>
                        <strong>{row.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="superadmin-subsection">
                  <div className="superadmin-subsection__header">
                    <div className="flex items-center gap-2">
                      <Trophy size={16} />
                      <strong>Top ranking</strong>
                    </div>
                    <span>{formatNumber(rankings.length)} atletas</span>
                  </div>

                  {focusTopRankings.length > 0 ? (
                    <div className="superadmin-ranking-list">
                      {focusTopRankings.map((entry) => (
                        <div key={entry.userId} className="superadmin-ranking-row">
                          <div>
                            <strong>{entry.displayName}</strong>
                            <p>Faixa {entry.belt}</p>
                          </div>
                          <div className="text-right">
                            <strong>#{entry.position}</strong>
                            <p>{formatNumber(entry.score)} pts</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="app-empty">Ainda nao existe ranking calculado para esta academia.</div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="app-empty superadmin-focus-empty">
              <strong>Rede inteira em leitura consolidada.</strong>
              <span>Escolha uma academia no mapa abaixo para destrinchar alunos, aulas e ranking.</span>
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

      <section>
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
                    <div className="superadmin-card-footnote">
                      <Trophy size={15} />
                      <span>{formatNumber(academyRow.totalRankingPoints)} pts no ranking</span>
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
