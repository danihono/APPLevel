import React, { useEffect, useMemo, useState } from 'react';
import { CalendarCheck, ChevronRight, Layers3, UserCheck, X } from 'lucide-react';
import { formatTimeLabel } from '../services/firebase/adapters';
import { subscribeToClassRsvps, type FirestoreEntity } from '../services/firebase/data';
import type {
  AcademyRecord,
  AttendanceRequestRecord,
  ClassRecord,
  ClassRsvpRecord,
  FightVideoSubmissionRecord,
  GraduationApprovalRequestRecord,
  JoinRequestRecord,
  NotificationRecord,
  UserRecord,
} from '../services/firebase/models';
import { isUnreadNotificationForViewer } from '../services/firebase/notifications';
import type { User } from '../types';

interface StaffDashboardViewProps {
  user: User;
  academy: FirestoreEntity<AcademyRecord>;
  academyUsers: Array<FirestoreEntity<UserRecord>>;
  classes: Array<FirestoreEntity<ClassRecord>>;
  notifications: Array<FirestoreEntity<NotificationRecord>>;
  joinRequests: Array<FirestoreEntity<JoinRequestRecord>>;
  attendanceRequests: Array<FirestoreEntity<AttendanceRequestRecord>>;
  graduationRequests: Array<FirestoreEntity<GraduationApprovalRequestRecord>>;
  fightVideoSubmissions: Array<FirestoreEntity<FightVideoSubmissionRecord>>;
  canReviewAllAttendanceRequests?: boolean;
  onNavigateToPending?: () => void;
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
      title: `${joinCount + attendanceCount} pendências aguardando ação`,
      note: `${joinCount} pedidos de entrada e ${attendanceCount} solicitações de presença.`,
    };
  }

  if (joinCount > 0) {
    return {
      title: `${joinCount} ${joinCount === 1 ? 'pedido de entrada' : 'pedidos de entrada'}`,
      note: 'Aguardando aprovação da unidade.',
    };
  }

  if (attendanceCount > 0) {
    return {
      title: `${attendanceCount} ${attendanceCount === 1 ? 'solicitação de presença' : 'solicitações de presença'}`,
      note: 'Aguardando análise do professor responsável.',
    };
  }

  if (unreadCount > 0) {
    return {
      title: `${unreadCount} ${unreadCount === 1 ? 'aviso recente' : 'avisos recentes'}`,
      note: 'Abra a aba de avisos para revisar as atualizações da unidade.',
    };
  }

  return {
    title: 'Nenhuma pendência agora',
    note: 'Tudo em dia na rotina da unidade.',
  };
}

function formatConfirmedLabel(count: number) {
  return `${count} ${count === 1 ? 'confirmado' : 'confirmados'}`;
}

const StaffDashboardView: React.FC<StaffDashboardViewProps> = ({
  user,
  academy,
  academyUsers,
  classes,
  notifications,
  joinRequests,
  attendanceRequests,
  graduationRequests,
  fightVideoSubmissions,
  canReviewAllAttendanceRequests = false,
  onNavigateToPending,
}) => {
  const now = new Date();
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [selectedClassRsvps, setSelectedClassRsvps] = useState<Array<FirestoreEntity<ClassRsvpRecord>>>([]);
  const [selectedClassRsvpsLoading, setSelectedClassRsvpsLoading] = useState(false);
  const [selectedClassRsvpsError, setSelectedClassRsvpsError] = useState('');

  const todayClasses = useMemo(
    () => classes
      .filter((lesson) => isSameDay(lesson.scheduledStart?.toDate(), now))
      .sort((left, right) => (left.scheduledStart?.toMillis?.() ?? 0) - (right.scheduledStart?.toMillis?.() ?? 0)),
    [classes, now],
  );
  const selectedClass = useMemo(
    () => (selectedClassId ? classes.find((lesson) => lesson.id === selectedClassId) ?? null : null),
    [classes, selectedClassId],
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
    () => notifications.filter((entry) => isUnreadNotificationForViewer(entry, {
      viewerRole: user.role,
      actionState: {
        joinRequests,
        attendanceRequests,
        graduationRequests,
        fightVideoSubmissions,
      },
    })).length,
    [attendanceRequests, fightVideoSubmissions, graduationRequests, joinRequests, notifications, user.role],
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

  useEffect(() => {
    if (!selectedClass) {
      setSelectedClassRsvps([]);
      setSelectedClassRsvpsLoading(false);
      setSelectedClassRsvpsError('');
      return undefined;
    }

    setSelectedClassRsvps([]);
    setSelectedClassRsvpsLoading(true);
    setSelectedClassRsvpsError('');

    return subscribeToClassRsvps(
      selectedClass.id,
      selectedClass.academyId,
      (records) => {
        setSelectedClassRsvps(records);
        setSelectedClassRsvpsLoading(false);
      },
      () => {
        setSelectedClassRsvpsError('Não foi possível carregar os alunos confirmados.');
        setSelectedClassRsvpsLoading(false);
      },
    );
  }, [selectedClass]);

  return (
    <div className="view-shell staff-home">
      <section className="staff-home__hero">
        <div className="staff-home__hero-copy">
          <p className="staff-home__eyebrow">{getGreeting(now)},</p>
          <h1 className="staff-home__greeting">{user.name}</h1>
          <p className="staff-home__summary">
            Visão do professor com equipe, agenda e pendências da unidade.
          </p>
        </div>

        <div className="staff-home__vision">
          <div className="staff-home__vision-dot" aria-hidden="true" />
          <div className="staff-home__vision-copy">
            <p className="staff-home__vision-label">Visão atual</p>
            <p className="staff-home__vision-title">{academy.name}</p>
          </div>
        </div>
      </section>

      <section className="staff-home__section">
        <p className="staff-home__section-label">Visão geral</p>

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
            <p className="staff-home__kpi-label">Frequência</p>
            <p className="staff-home__kpi-value">{monthlyAttendanceRate}%</p>
            <p className="staff-home__kpi-note">Este mês</p>
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
              const professorName = lesson.professorName || 'Equipe técnica';
              const plannedCount = lesson.rsvpCount ?? 0;
              const classMeta = lesson.status === 'scheduled'
                ? `${formatConfirmedLabel(plannedCount)} para esta aula - ${professorName}`
                : lesson.currentAttendanceCount > 0
                  ? `${lesson.currentAttendanceCount} presenças registradas - ${professorName}`
                  : `Professor: ${professorName}`;

              return (
                <button
                  key={lesson.id}
                  type="button"
                  onClick={() => setSelectedClassId(lesson.id)}
                  className="staff-home__class-row"
                >
                  <p className="staff-home__class-time">{formatTimeLabel(lesson.scheduledStart)}</p>
                  <span className="staff-home__class-divider" aria-hidden="true" />

                  <div className="staff-home__class-copy">
                    <p className="staff-home__class-title">{lesson.title}</p>
                    <p className="staff-home__class-meta">{classMeta}</p>
                  </div>

                  <ChevronRight size={18} className="staff-home__class-arrow" aria-hidden="true" />
                </button>
              );
            })
          ) : (
            <div className="staff-home__empty">Nenhuma aula programada para hoje nesta unidade.</div>
          )}
        </div>
      </section>

      <section className="staff-home__section">
        <p className="staff-home__section-label">Pendências</p>

        <button
          type="button"
          className={`staff-home__pending-card${pendingBadgeCount > 0 ? ' is-clickable' : ''}`}
          onClick={pendingBadgeCount > 0 ? onNavigateToPending : undefined}
          disabled={pendingBadgeCount === 0}
        >
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
        </button>
      </section>

      {selectedClass ? (
        <div
          className="staff-home__lesson-backdrop"
          role="presentation"
          onClick={() => setSelectedClassId(null)}
        >
          <section
            className="staff-home__lesson-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-home-lesson-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="staff-home__lesson-head">
              <div className="staff-home__lesson-title-copy">
                <p className="staff-home__section-label">Aula selecionada</p>
                <h2 id="staff-home-lesson-title" className="staff-home__lesson-title">{selectedClass.title}</h2>
                <p className="staff-home__lesson-subtitle">
                  {formatTimeLabel(selectedClass.scheduledStart)} - {selectedClass.professorName || 'Equipe tecnica'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedClassId(null)}
                className="app-button app-button--ghost app-button--icon staff-home__lesson-close"
                aria-label="Fechar detalhes da aula"
              >
                <X size={16} />
              </button>
            </div>

            <div className="staff-home__lesson-summary">
              <div className="staff-home__lesson-summary-icon" aria-hidden="true">
                <CalendarCheck size={19} />
              </div>
              <div>
                <p className="staff-home__lesson-count">
                  {formatConfirmedLabel(selectedClassRsvpsLoading ? (selectedClass.rsvpCount ?? 0) : selectedClassRsvps.length)}
                </p>
                <p className="staff-home__lesson-count-note">
                  Alunos que confirmaram que vão nesta aula.
                </p>
              </div>
            </div>

            <div className="staff-home__confirmed-list">
              <div className="staff-home__confirmed-head">
                <p className="staff-home__section-label">Quem confirmou</p>
                {selectedClass.capacity ? (
                  <span className="app-badge app-badge--muted">Capacidade {selectedClass.capacity}</span>
                ) : null}
              </div>

              {selectedClassRsvpsError ? (
                <div className="staff-home__confirmed-empty">{selectedClassRsvpsError}</div>
              ) : selectedClassRsvpsLoading ? (
                <div className="staff-home__confirmed-empty">Carregando confirmados...</div>
              ) : selectedClassRsvps.length > 0 ? (
                selectedClassRsvps.map((rsvp) => (
                  <div key={rsvp.id} className="staff-home__confirmed-row">
                    <div className="staff-home__confirmed-avatar" aria-hidden="true">
                      <UserCheck size={16} />
                    </div>
                    <div className="staff-home__confirmed-copy">
                      <p className="staff-home__confirmed-name">{rsvp.userDisplayName}</p>
                      <p className="staff-home__confirmed-meta">Presença futura confirmada</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="staff-home__confirmed-empty">
                  Nenhum aluno confirmou que vai nesta aula ainda.
                </div>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
};

export default StaffDashboardView;
