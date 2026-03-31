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
  { role: 'admin', label: 'Admins' },
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
  const isLeader = user.role === 'professor' || user.role === 'admin' || user.role === 'superadmin';
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
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'suspended'>('all');
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

  const totalRowsForRing = Math.max(totalAcademies, 1);
  const activeDegrees = (activeAcademies / totalRowsForRing) * 360;
  const inactiveDegrees = activeDegrees + ((inactiveAcademies / totalRowsForRing) * 360);
  const suspendedDegrees = inactiveDegrees + ((suspendedAcademies / totalRowsForRing) * 360);

  return (
    <div className="view-shell superadmin-dashboard">
      <section className="app-panel app-panel--hero app-panel-pad superadmin-hero">
        <div className="superadmin-hero__copy">
          <p className="app-section-label">Central do superadmin</p>
          <h1 className="app-section-title">Rede das academias sob controle.</h1>
          <p className="app-section-copy">
            Esta visao foi reorganizada para leitura executiva: crescimento, risco operacional, lideranca
            e a academia em foco em um unico painel.
          </p>
        </div>

        <div className="superadmin-focus-banner">
          {focusAcademyRow ? (
            <>
              <div className="superadmin-focus-banner__header">
                <div>
                  <p className="app-section-label">Academia em foco</p>
                  <h2 className="text-2xl font-bold">{focusAcademyRow.name}</h2>
                </div>
                <span className={getStatusBadgeClass(focusAcademyRow.status)}>
                  {getStatusLabel(focusAcademyRow.status)}
                </span>
              </div>

              <div className="superadmin-chip-row">
                <span className="app-badge app-badge--muted">{focusAcademyRow.timezone}</span>
                <span className="app-badge app-badge--gold">{focusAcademyRow.lastActivityLabel}</span>
              </div>

              <p className="superadmin-focus-banner__note">
                Alunos e gestao passam a usar esta academia como contexto principal. Use a central sem foco para ler a rede inteira.
              </p>

              <button type="button" onClick={onClearFocus} className="app-button app-button--ghost app-button--small mt-4">
                Ver rede inteira
              </button>
            </>
          ) : (
            <>
              <div className="superadmin-focus-banner__header">
                <div>
                  <p className="app-section-label">Modo de leitura</p>
                  <h2 className="text-2xl font-bold">Nenhuma academia em foco</h2>
                </div>
                <span className="app-badge app-badge--gold">Rede inteira</span>
              </div>

              <p className="superadmin-focus-banner__note">
                Este e o padrao da central: todas as estatisticas aparecem consolidadas. Escolha uma academia so quando quiser aprofundar a operacao.
              </p>
            </>
          )}
        </div>

        <div className="superadmin-kpi-grid">
          <article className="app-stat-card">
            <p className="app-stat-card__label">Academias monitoradas</p>
            <p className="app-stat-card__value">{formatNumber(totalAcademies)}</p>
            <p className="app-stat-card__note">{activeAcademies} ativas no recorte atual</p>
          </article>
          <article className="app-stat-card">
            <p className="app-stat-card__label">Alunos ativos</p>
            <p className="app-stat-card__value">{formatNumber(globalStudents)}</p>
            <p className="app-stat-card__note">{formatNumber(globalUsers)} usuarios no total</p>
          </article>
          <article className="app-stat-card">
            <p className="app-stat-card__label">Liderancas ativas</p>
            <p className="app-stat-card__value">{formatNumber(globalLeaders)}</p>
            <p className="app-stat-card__note">{formatNumber(globalMasterBlack)} master black em cargos-chave</p>
          </article>
          <article className="app-stat-card">
            <p className="app-stat-card__label">Media de presenca</p>
            <p className="app-stat-card__value">{formatNumber(averageAttendance)}</p>
            <p className="app-stat-card__note">{academiesInAttention} academias com sinal de atencao</p>
          </article>
        </div>
      </section>

      <section className="app-panel app-panel-pad">
        <div className="flex items-center gap-3">
          <div className="app-icon-shell">
            <Filter size={18} />
          </div>
          <div>
            <p className="app-section-label">Controles da leitura</p>
            <h2 className="text-xl font-bold">Refine a rede que aparece na central</h2>
          </div>
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
              onChange={(event) => setStatusFilter(event.target.value as 'all' | 'active' | 'inactive' | 'suspended')}
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
                <p className="app-stat-card__note">Academias prontas para operar no recorte atual.</p>
              </div>
              <div className="superadmin-status-card">
                <div className="superadmin-status-card__top">
                  <span className="app-badge app-badge--muted">Inativas</span>
                  <strong>{formatNumber(inactiveAcademies)}</strong>
                </div>
                <p className="app-stat-card__note">Unidades fora da rotina ativa, mas nao suspensas.</p>
              </div>
              <div className="superadmin-status-card">
                <div className="superadmin-status-card__top">
                  <span className="app-badge app-badge--danger">Suspensas</span>
                  <strong>{formatNumber(suspendedAcademies)}</strong>
                </div>
                <p className="app-stat-card__note">Pedem intervencao imediata de governanca.</p>
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
                    <div>
                      <strong>{academyRow.name}</strong>
                      <p>
                        {academyRow.attentionReasons[0]}
                        {academyRow.attentionReasons.length > 1
                          ? ` +${academyRow.attentionReasons.length - 1} sinal`
                          : ''}
                      </p>
                    </div>
                    <span>{academyRow.lastActivityLabel}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="app-empty">Nenhuma academia apareceu com alerta nos filtros atuais.</div>
            )}
          </div>
        </article>

        <article className="app-panel app-panel--tint app-panel-pad">
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
              <p className="app-section-copy mt-4">
                A unidade escolhida dita o contexto das abas operacionais e ganha uma leitura propria aqui no topo.
              </p>

              <div className="superadmin-focus-stats">
                <div className="superadmin-mini-stat">
                  <span>Alunos ativos</span>
                  <strong>{formatNumber(focusActiveStudents)}</strong>
                </div>
                <div className="superadmin-mini-stat">
                  <span>Liderancas ativas</span>
                  <strong>{formatNumber(focusLeaders)}</strong>
                </div>
                <div className="superadmin-mini-stat">
                  <span>Aulas ao vivo</span>
                  <strong>{formatNumber(focusActiveClasses)}</strong>
                </div>
                <div className="superadmin-mini-stat">
                  <span>Competicoes abertas</span>
                  <strong>{formatNumber(focusOpenCompetitions)}</strong>
                </div>
              </div>

              <div className="superadmin-subsection">
                <div className="superadmin-subsection__header">
                  <div className="flex items-center gap-2">
                    <Activity size={16} />
                    <strong>Resumo operacional</strong>
                  </div>
                  <span>{focusAcademyRow.timezone}</span>
                </div>

                <div className="superadmin-detail-list">
                  <div className="superadmin-detail-row">
                    <span>Media de presenca da base ativa</span>
                    <strong>{formatNumber(focusAcademyRow.averageAttendance)}</strong>
                  </div>
                  <div className="superadmin-detail-row">
                    <span>Pontos de ranking acumulados</span>
                    <strong>{formatNumber(focusAcademyRow.totalRankingPoints)}</strong>
                  </div>
                  <div className="superadmin-detail-row">
                    <span>Aulas agendadas</span>
                    <strong>{formatNumber(focusScheduledClasses)}</strong>
                  </div>
                  <div className="superadmin-detail-row">
                    <span>Competicoes concluidas</span>
                    <strong>{formatNumber(focusFinishedCompetitions)}</strong>
                  </div>
                  <div className="superadmin-detail-row">
                    <span>Ultima atividade observada</span>
                    <strong>{focusAcademyRow.lastActivityLabel}</strong>
                  </div>
                </div>
              </div>

              <div className="superadmin-subsection">
                <div className="superadmin-subsection__header">
                  <div className="flex items-center gap-2">
                    <Trophy size={16} />
                    <strong>Top ranking da academia</strong>
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
            </>
          ) : (
            <div className="app-empty">
              Nenhuma academia esta em foco agora. As metricas desta tela permanecem consolidadas para a rede inteira.
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
              <span>{formatNumber(filteredActiveUsers.filter((user) => user.role === 'student').length)} alunos</span>
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
              Cada card resume status, capacidade de lideranca, ritmo de uso e acesso rapido para trocar o contexto da operacao.
            </p>
          </div>
        </div>

        {filteredRows.length > 0 ? (
          <div className="superadmin-grid superadmin-grid--cards">
            {filteredRows.map((academyRow) => {
              const selected = academyRow.id === selectedAcademyId;
              const masterBlackPressure = Math.min(100, percentOf(academyRow.masterBlackCount, academyRow.masterBlackLimit));
              const activationRate = percentOf(academyRow.activeUsers, academyRow.totalUsers);

              return (
                <article key={academyRow.id} className={`app-panel app-panel-pad ${selected ? 'app-panel--tint' : ''}`}>
                  <div className="superadmin-card-header">
                    <div>
                      <div className="superadmin-card-header__title">
                        <h3 className="text-2xl font-bold">{academyRow.name}</h3>
                        <span className={getStatusBadgeClass(academyRow.status)}>
                          {selected ? 'Em foco' : getStatusLabel(academyRow.status)}
                        </span>
                      </div>
                      <p className="app-section-copy mt-3">
                        {academyRow.slug} . {academyRow.timezone}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => onEnterAcademy(academyRow.id)}
                      className={`app-button ${selected ? 'app-button--gold' : 'app-button--dark'}`}
                    >
                      {selected ? 'Academia em foco' : 'Colocar em foco'}
                    </button>
                  </div>

                  <div className="superadmin-card-stats">
                    <div className="superadmin-mini-stat">
                      <span>Usuarios totais</span>
                      <strong>{formatNumber(academyRow.totalUsers)}</strong>
                    </div>
                    <div className="superadmin-mini-stat">
                      <span>Alunos ativos</span>
                      <strong>{formatNumber(academyRow.activeStudents)}</strong>
                    </div>
                    <div className="superadmin-mini-stat">
                      <span>Liderancas ativas</span>
                      <strong>{formatNumber(academyRow.leaderCount)}</strong>
                    </div>
                    <div className="superadmin-mini-stat">
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
                      <span>Operacao sem alertas relevantes no recorte atual.</span>
                    </div>
                  )}

                  {academyRow.invitedUsers > 0 ? (
                    <p className="app-stat-card__note mt-4">
                      {formatNumber(academyRow.invitedUsers)} contas ainda aguardam ativacao.
                    </p>
                  ) : null}
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
