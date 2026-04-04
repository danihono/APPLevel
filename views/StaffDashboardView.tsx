import React, { useMemo } from 'react';
import { BellRing, CalendarDays, UserCog, Users } from 'lucide-react';
import ClassSessionCard from '../components/ClassSessionCard';
import type { FirestoreEntity } from '../services/firebase/data';
import type { AcademyRecord, ClassRecord, NotificationRecord, UserRecord } from '../services/firebase/models';
import type { User } from '../types';

interface StaffDashboardViewProps {
  user: User;
  academy: FirestoreEntity<AcademyRecord>;
  academyUsers: Array<FirestoreEntity<UserRecord>>;
  classes: Array<FirestoreEntity<ClassRecord>>;
  notifications: Array<FirestoreEntity<NotificationRecord>>;
}

function isSameDay(left?: Date | null, right?: Date | null) {
  if (!left || !right) {
    return false;
  }

  return left.getDate() === right.getDate()
    && left.getMonth() === right.getMonth()
    && left.getFullYear() === right.getFullYear();
}

const StaffDashboardView: React.FC<StaffDashboardViewProps> = ({
  user,
  academy,
  academyUsers,
  classes,
  notifications,
}) => {
  const today = new Date();

  const todayClasses = useMemo(
    () =>
      classes.filter((lesson) => isSameDay(lesson.scheduledStart?.toDate(), today)),
    [classes, today],
  );
  const myTodayClasses = useMemo(
    () => todayClasses.filter((lesson) => lesson.professorId === user.id),
    [todayClasses, user.id],
  );
  const instructors = academyUsers.filter((entry) => entry.role !== 'student');
  const students = academyUsers.filter((entry) => entry.role === 'student');
  const unreadNotifications = notifications.filter((entry) => entry.status !== 'read').length;
  const highlightedClasses = myTodayClasses.length > 0 ? myTodayClasses : todayClasses;

  return (
    <div className="view-shell">
      <section className="app-panel app-panel-pad">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold">{academy.name}</p>
            <p className="mt-2 text-sm text-[color:var(--text-muted)]">
              Operacao do dia com equipe, agenda e pendencias da unidade.
            </p>
          </div>
          <span className="app-badge app-badge--muted">APPLevel staff</span>
        </div>
      </section>

      <section className="app-stat-grid">
        <article className="app-stat-card">
          <p className="app-stat-card__label">Instrutores</p>
          <p className="app-stat-card__value">{instructors.length}</p>
          <p className="app-stat-card__note">Equipe e liderancas ativas</p>
        </article>
        <article className="app-stat-card">
          <p className="app-stat-card__label">Alunos</p>
          <p className="app-stat-card__value">{students.length}</p>
          <p className="app-stat-card__note">Base cadastrada nesta unidade</p>
        </article>
        <article className="app-stat-card">
          <p className="app-stat-card__label">Suas aulas de hoje</p>
          <p className="app-stat-card__value">{myTodayClasses.length}</p>
          <p className="app-stat-card__note">Aulas em que voce esta escalado</p>
        </article>
        <article className="app-stat-card">
          <p className="app-stat-card__label">Pendencias</p>
          <p className="app-stat-card__value">{unreadNotifications}</p>
          <p className="app-stat-card__note">Notificacoes e eventos nao lidos</p>
        </article>
      </section>

      <section className="app-panel app-panel-pad">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="app-icon-shell">
                <CalendarDays size={18} />
              </div>
              <div>
                <p className="app-section-label">Agenda de hoje</p>
                <h2 className="text-2xl font-bold">Suas aulas de hoje</h2>
              </div>
            </div>
            <p className="app-section-copy mt-4">
              Quando voce nao estiver escalado em nenhuma aula, o painel mostra a agenda geral da academia para o dia.
            </p>
          </div>
          <span className="app-badge app-badge--gold">{highlightedClasses.length} em destaque</span>
        </div>
      </section>

      <section className="app-list">
        {highlightedClasses.length > 0 ? (
          highlightedClasses.map((lesson) => (
            <ClassSessionCard key={lesson.id} lesson={lesson} showDate={false} />
          ))
        ) : (
          <div className="app-empty">Nenhuma aula programada para hoje nesta academia.</div>
        )}
      </section>

      <section className="app-grid-2">
        <article className="app-panel app-panel-pad">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell">
              <UserCog size={18} />
            </div>
            <div>
              <p className="app-section-label">Equipe</p>
              <h2 className="text-xl font-bold">Instrutores em evidência</h2>
            </div>
          </div>

          <div className="mt-6 app-list">
            {instructors.slice(0, 4).map((entry) => (
              <div key={entry.id} className="app-list-card flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-bold">{entry.displayName}</p>
                  <p className="mt-1 text-xs text-[color:var(--text-soft)]">
                    {entry.role} • faixa {entry.belt}
                  </p>
                </div>
                <span className="app-badge app-badge--muted">{entry.status}</span>
              </div>
            ))}

            {instructors.length === 0 ? (
              <div className="app-empty">Nenhum instrutor vinculado a esta academia.</div>
            ) : null}
          </div>
        </article>

        <article className="app-panel app-panel-pad">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell">
              <BellRing size={18} />
            </div>
            <div>
              <p className="app-section-label">Atencao</p>
              <h2 className="text-xl font-bold">Resumo rapido do dia</h2>
            </div>
          </div>

          <div className="mt-6 app-list">
            <div className="app-list-card">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-soft)]">Usuario logado</p>
              <p className="mt-2 text-lg font-bold">{user.name}</p>
              <p className="mt-1 text-sm text-[color:var(--text-muted)]">Faixa {user.belt} • {user.stripes} graus</p>
            </div>
            <div className="app-list-card">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-soft)]">Aulas do dia</p>
              <p className="mt-2 text-lg font-bold">{todayClasses.length} no total</p>
              <p className="mt-1 text-sm text-[color:var(--text-muted)]">Inclui agenda geral da unidade para hoje.</p>
            </div>
            <div className="app-list-card">
              <p className="text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-soft)]">Base da academia</p>
              <p className="mt-2 text-lg font-bold">{students.length} alunos</p>
              <p className="mt-1 text-sm text-[color:var(--text-muted)]">Monitore crescimento e ocupacao logo ao abrir o app.</p>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
};

export default StaffDashboardView;
