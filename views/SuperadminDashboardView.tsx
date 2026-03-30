import React, { useMemo, useState } from 'react';
import { Building2, Filter, ShieldCheck, Users } from 'lucide-react';
import type { FirestoreEntity } from '../services/firebase/data';
import type { AcademyRecord, UserRecord } from '../services/firebase/models';

interface SuperadminDashboardViewProps {
  academies: Array<FirestoreEntity<AcademyRecord>>;
  allUsers: Array<FirestoreEntity<UserRecord>>;
  selectedAcademyId: string;
  onSelectAcademy: (academyId: string) => void;
}

function isMasterBlack(user: FirestoreEntity<UserRecord>) {
  const belt = user.belt.trim().toLowerCase();
  const isBlack = belt === 'black' || belt === 'preta';
  const isLeader = user.role === 'professor' || user.role === 'admin' || user.role === 'superadmin';
  return isBlack && isLeader;
}

const SuperadminDashboardView: React.FC<SuperadminDashboardViewProps> = ({
  academies,
  allUsers,
  selectedAcademyId,
  onSelectAcademy,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive' | 'suspended'>('all');

  const academyRows = useMemo(() => academies.map((academy) => {
    const academyUsers = allUsers.filter((entry) => entry.academyId === academy.id);
    const activeStudents = academyUsers.filter((entry) => entry.role === 'student' && entry.status === 'active');
    const masterBlackCount = academyUsers.filter(isMasterBlack).length;
    const averageAttendance = activeStudents.length > 0
      ? Math.round(activeStudents.reduce((sum, entry) => sum + (entry.attendanceCount ?? 0), 0) / activeStudents.length)
      : 0;

    return {
      id: academy.id,
      name: academy.name,
      status: academy.status,
      timezone: academy.timezone,
      slug: academy.slug,
      ownerUserId: academy.ownerUserId,
      activeStudents: activeStudents.length,
      totalUsers: academyUsers.length,
      averageAttendance,
      masterBlackCount,
      masterBlackLimit: academy.masterBlackLimit ?? 1,
    };
  }), [academies, allUsers]);

  const filteredRows = academyRows.filter((academy) => {
    const matchesSearch =
      academy.name.toLowerCase().includes(search.toLowerCase()) ||
      academy.slug.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || academy.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const globalStudents = filteredRows.reduce((sum, entry) => sum + entry.activeStudents, 0);
  const globalUsers = filteredRows.reduce((sum, entry) => sum + entry.totalUsers, 0);
  const globalMasterBlack = filteredRows.reduce((sum, entry) => sum + entry.masterBlackCount, 0);
  const selectedAcademy = academyRows.find((entry) => entry.id === selectedAcademyId) ?? filteredRows[0] ?? null;

  return (
    <div className="view-shell">
      <section className="app-panel app-panel--hero app-panel-pad">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="app-section-label">Superadmin</p>
            <h1 className="app-section-title">Controle global das academias sem cara de planilha.</h1>
            <p className="app-section-copy">
              Filtre unidades, acompanhe o limite de master black e escolha a academia que define o contexto das outras abas.
            </p>
          </div>

          {selectedAcademy ? (
            <div className="app-panel app-panel--soft px-4 py-4">
              <p className="app-section-label">Academia em uso</p>
              <p className="mt-2 text-xl font-bold">{selectedAcademy.name}</p>
              <p className="mt-1 text-sm text-[color:var(--text-soft)]">{selectedAcademy.timezone}</p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="app-stat-grid">
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">Academias</p>
          <p className="app-stat-card__value">{filteredRows.length}</p>
        </article>
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">Alunos ativos</p>
          <p className="app-stat-card__value">{globalStudents}</p>
        </article>
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">Usuarios totais</p>
          <p className="app-stat-card__value">{globalUsers}</p>
        </article>
        <article className="app-panel app-panel-pad">
          <p className="app-stat-card__label">Master black</p>
          <p className="app-stat-card__value">{globalMasterBlack}</p>
        </article>
      </section>

      <section className="app-panel app-panel-pad">
        <div className="flex items-center gap-3">
          <div className="app-icon-shell">
            <Filter size={18} />
          </div>
          <div>
            <p className="app-section-label">Filtros</p>
            <h2 className="text-xl font-bold">Refine o dashboard</h2>
          </div>
        </div>

        <div className="mt-6 app-grid-2">
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
        </div>
      </section>

      <section className="app-list">
        {filteredRows.map((academy) => {
          const overLimit = academy.masterBlackCount > academy.masterBlackLimit;
          const selected = academy.id === selectedAcademyId;

          return (
            <article key={academy.id} className={`app-panel app-panel-pad ${selected ? 'app-panel--tint' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-2xl font-bold">{academy.name}</h2>
                    <span className={selected ? 'app-badge app-badge--gold' : 'app-badge app-badge--muted'}>
                      {selected ? 'Em uso' : academy.status}
                    </span>
                  </div>
                  <p className="app-section-copy mt-3">
                    Slug: {academy.slug} - Timezone: {academy.timezone}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => onSelectAcademy(academy.id)}
                  className={`app-button ${selected ? 'app-button--gold' : 'app-button--dark'}`}
                >
                  Entrar nesta academia
                </button>
              </div>

              <div className="mt-6 app-stat-grid">
                <div className="app-stat-card">
                  <div className="flex items-center gap-2 text-[color:var(--text-muted)]">
                    <Building2 size={16} />
                    <span className="app-stat-card__label">Usuarios</span>
                  </div>
                  <p className="app-stat-card__value">{academy.totalUsers}</p>
                </div>
                <div className="app-stat-card">
                  <div className="flex items-center gap-2 text-[color:var(--text-muted)]">
                    <Users size={16} />
                    <span className="app-stat-card__label">Alunos ativos</span>
                  </div>
                  <p className="app-stat-card__value">{academy.activeStudents}</p>
                </div>
                <div className="app-stat-card">
                  <div className="flex items-center gap-2 text-[color:var(--text-muted)]">
                    <ShieldCheck size={16} />
                    <span className="app-stat-card__label">Master black</span>
                  </div>
                  <p className={`app-stat-card__value ${overLimit ? 'text-[color:var(--danger)]' : ''}`}>
                    {academy.masterBlackCount}/{academy.masterBlackLimit}
                  </p>
                </div>
                <div className="app-stat-card">
                  <p className="app-stat-card__label">Media de presencas</p>
                  <p className="app-stat-card__value">{academy.averageAttendance}</p>
                </div>
              </div>
            </article>
          );
        })}

        {filteredRows.length === 0 ? (
          <div className="app-empty">Nenhuma academia encontrada com os filtros atuais.</div>
        ) : null}
      </section>
    </div>
  );
};

export default SuperadminDashboardView;
