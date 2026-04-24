import React, { useMemo } from 'react';
import { ChevronRight, Layers3 } from 'lucide-react';
import { formatTimeLabel } from '../services/firebase/adapters';
import type { FirestoreEntity } from '../services/firebase/data';
import type {
  AcademyRecord,
  AttendanceRequestRecord,
  ClassRecord,
  JoinRequestRecord,
  NotificationRecord,
  UserRecord,
} from '../services/firebase/models';
import type { User } from '../types';

interface StaffDashboardViewProps {
  user: User;
  academy: FirestoreEntity<AcademyRecord>;
  academyUsers: Array<FirestoreEntity<UserRecord>>;
  classes: Array<FirestoreEntity<ClassRecord>>;
  notifications: Array<FirestoreEntity<NotificationRecord>>;
  joinRequests: Array<FirestoreEntity<JoinRequestRecord>>;
  attendanceRequests: Array<FirestoreEntity<AttendanceRequestRecord>>;
  canReviewAllAttendanceRequests?: boolean;
}

function isSameDay(left?: Date | null, right?: Date | null) {
  if (!left || !right) {
    return false;
  }

  return left.getDate() === right.getDate()
    && left.getMonth() === right.getMonth()
    && left.getFullYear() === right.getFullYear();
}

function isSameMonth(left?: Date | null, right?: Date | null) {
  if (!left || !right) {
    return false;
  }

  return left.getMonth() === right.getMonth()
    && left.getFullYear() === right.getFullYear();
}

function getGreeting(date: Date) {
  const hour = date.getHours();

  if (hour < 12) {
    return 'Bom dia';
  }

  if (hour < 18) {
    return 'Boa tarde';
  }

  return 'Boa noite';
}

function getPendingCopy(joinCount: number, attendanceCount: number, unreadCount: number) {
  if (joinCount > 0 && attendanceCount > 0) {
    return {
      title: `${joinCount + attendanceCount} pendencias aguardando acao`,
      note: `${joinCount} pedidos de entrada e ${attendanceCount} solicitacoes de presenca.`,
    };
  }

  if (joinCount > 0) {
    return {
      title: `${joinCount} ${joinCount === 1 ? 'pedido de entrada' : 'pedidos de entrada'}`,
      note: 'Aguardando aprovacao da unidade.',
    };
  }

  if (attendanceCount > 0) {
    return {
      title: `${attendanceCount} ${attendanceCount === 1 ? 'solicitacao de presenca' : 'solicitacoes de presenca'}`,
      note: 'Aguardando analise do professor responsavel.',
    };
  }

  if (unreadCount > 0) {
    return {
      title: `${unreadCount} ${unreadCount === 1 ? 'aviso recente' : 'avisos recentes'}`,
      note: 'Abra a aba de avisos para revisar as atualizacoes da unidade.',
    };
  }

  return {
    title: 'Nenhuma pendencia agora',
    note: 'Tudo em dia na rotina da unidade.',
  };
}

const StaffDashboardView: React.FC<StaffDashboardViewProps> = ({
  user,
  academy,
  academyUsers,
  classes,
  notifications,
  joinRequests,
  attendanceRequests,
  canReviewAllAttendanceRequests = false,
}) => {
  const now = new Date();

  const todayClasses = useMemo(
    () => classes
      .filter((lesson) => isSameDay(lesson.scheduledStart?.toDate(), now))
      .sort((left, right) => (left.scheduledStart?.toMillis?.() ?? 0) - (right.scheduledStart?.toMillis?.() ?? 0)),
    [classes, now],
  );

  const instructors = useMemo(
    () => academyUsers.filter((entry) => entry.role !== 'student' && entry.status === 'active'),
    [academyUsers],
  );
  const students = useMemo(
    () => academyUsers.filter((entry) => entry.role === 'student'),
    [academyUsers],
  );

  const monthlyAttendanceRate = useMemo(() => {
    const trackedClasses = classes.filter((lesson) => {
      const start = lesson.scheduledStart?.toDate();

      if (!start) {
        return false;
      }

      return isSameMonth(start, now)
        && start.getTime() <= now.getTime()
        && lesson.status !== 'cancelled'
        && (lesson.capacity ?? 0) > 0;
    });

    const totalCapacity = trackedClasses.reduce((sum, lesson) => sum + (lesson.capacity ?? 0), 0);
    if (totalCapacity === 0) {
      return 0;
    }

    const totalAttendance = trackedClasses.reduce(
      (sum, lesson) => sum + Math.min(lesson.currentAttendanceCount, lesson.capacity ?? lesson.currentAttendanceCount),
      0,
    );

    return Math.max(0, Math.min(100, Math.round((totalAttendance / totalCapacity) * 100)));
  }, [classes, now]);

  const unreadNotifications = useMemo(
    () => notifications.filter((entry) => entry.status !== 'read').length,
    [notifications],
  );
  const pendingJoinRequests = useMemo(
    () => joinRequests.filter((entry) => entry.status === 'pending'),
    [joinRequests],
  );
  const pendingAttendanceRequests = useMemo(
    () => attendanceRequests.filter(
      (entry) => entry.status === 'pending' && (canReviewAllAttendanceRequests || entry.professorId === user.id),
    ),
    [attendanceRequests, canReviewAllAttendanceRequests, user.id],
  );
  const pendingCount = pendingJoinRequests.length + pendingAttendanceRequests.length;
  const pendingBadgeCount = pendingCount || unreadNotifications;
  const pendingCopy = getPendingCopy(
    pendingJoinRequests.length,
    pendingAttendanceRequests.length,
    unreadNotifications,
  );

  return (
    <div className="view-shell staff-home">
      <section className="staff-home__hero">
        <div className="staff-home__hero-copy">
          <p className="staff-home__eyebrow">{getGreeting(now)},</p>
          <h1 className="staff-home__greeting">{user.name}</h1>
          <p className="staff-home__summary">
            Visao do professor com equipe, agenda e pendencias da unidade.
          </p>
        </div>

        <div className="staff-home__vision">
          <div className="staff-home__vision-dot" aria-hidden="true" />
          <div className="staff-home__vision-copy">
            <p className="staff-home__vision-label">Visao atual</p>
            <p className="staff-home__vision-title">{academy.name}</p>
          </div>
        </div>
      </section>

      <section className="staff-home__section">
        <p className="staff-home__section-label">Visao geral</p>

        <div className="staff-home__kpi-grid">
          <article className="staff-home__kpi-card">
            <p className="staff-home__kpi-label">Instrutores</p>
            <p className="staff-home__kpi-value">{instructors.length}</p>
            <p className="staff-home__kpi-note">Equipe ativa</p>
          </article>

          <article className="staff-home__kpi-card">
            <p className="staff-home__kpi-label">Alunos</p>
            <p className="staff-home__kpi-value">{students.length}</p>
            <p className="staff-home__kpi-note">Matriculados</p>
          </article>

          <article className="staff-home__kpi-card">
            <p className="staff-home__kpi-label">Aulas hoje</p>
            <p className="staff-home__kpi-value">{todayClasses.length}</p>
            <p className="staff-home__kpi-note">Agendadas</p>
          </article>

          <article className="staff-home__kpi-card">
            <p className="staff-home__kpi-label">Frequencia</p>
            <p className="staff-home__kpi-value">{monthlyAttendanceRate}%</p>
            <p className="staff-home__kpi-note">Este mes</p>
          </article>
        </div>
      </section>

      <section className="staff-home__section">
        <div className="staff-home__section-head">
          <p className="staff-home__section-label">Aulas de hoje</p>
          <span className="app-badge app-badge--muted">{todayClasses.length}</span>
        </div>

        <div className="staff-home__list">
          {todayClasses.length > 0 ? (
            todayClasses.map((lesson) => {
              const professorName = lesson.professorName || 'Equipe tecnica';
              const classMeta = lesson.currentAttendanceCount > 0
                ? `${lesson.currentAttendanceCount} alunos - ${professorName}`
                : `Professor: ${professorName}`;

              return (
                <article key={lesson.id} className="staff-home__class-row">
                  <p className="staff-home__class-time">{formatTimeLabel(lesson.scheduledStart)}</p>
                  <span className="staff-home__class-divider" aria-hidden="true" />

                  <div className="staff-home__class-copy">
                    <p className="staff-home__class-title">{lesson.title}</p>
                    <p className="staff-home__class-meta">{classMeta}</p>
                  </div>

                  <ChevronRight size={18} className="staff-home__class-arrow" aria-hidden="true" />
                </article>
              );
            })
          ) : (
            <div className="staff-home__empty">Nenhuma aula programada para hoje nesta unidade.</div>
          )}
        </div>
      </section>

      <section className="staff-home__section">
        <p className="staff-home__section-label">Pendencias</p>

        <article className="staff-home__pending-card">
          <div className="staff-home__pending-icon" aria-hidden="true">
            <Layers3 size={18} />
          </div>

          <div className="staff-home__pending-copy">
            <p className="staff-home__pending-title">{pendingCopy.title}</p>
            <p className="staff-home__pending-note">{pendingCopy.note}</p>
          </div>

          <span className={`staff-home__count-badge ${pendingBadgeCount === 0 ? 'is-zero' : ''}`}>
            {pendingBadgeCount}
          </span>
        </article>
      </section>
    </div>
  );
};

export default StaffDashboardView;
