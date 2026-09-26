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
import { getBlackBeltProgressForUser } from '../beltCatalog';
import BjjBelt from '../components/BjjBelt';
import type { User } from '../types';
import { t } from '../i18n';

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
  onNavigateToInstructors?: () => void;
  onNavigateToStudents?: () => void;
  onNavigateToClasses?: () => void;
  onNavigateToInactiveStudents?: () => void;
}

interface StaffKpiCardProps {
  label: string;
  value: React.ReactNode;
  note: string;
  onClick?: () => void;
}

const StaffKpiCard: React.FC<StaffKpiCardProps> = ({ label, value, note, onClick }) => {
  if (!onClick) {
    return (
      <article className="staff-home__kpi-card">
        <p className="staff-home__kpi-label">{label}</p>
        <p className="staff-home__kpi-value">{value}</p>
        <p className="staff-home__kpi-note">{note}</p>
      </article>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="staff-home__kpi-card staff-home__kpi-card--action"
    >
      <ChevronRight size={16} className="staff-home__kpi-arrow" aria-hidden="true" />
      <p className="staff-home__kpi-label">{label}</p>
      <p className="staff-home__kpi-value">{value}</p>
      <p className="staff-home__kpi-note">{note}</p>
    </button>
  );
};

function isSameDay(left?: Date | null, right?: Date | null) {
  if (!left || !right) {
    return false;
  }

  return left.getDate() === right.getDate()
    && left.getMonth() === right.getMonth()
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
      title: t('{count} pendências aguardando ação', { count: joinCount + attendanceCount }),
      note: t('{join} pedidos de entrada e {attendance} solicitações de presença.', { join: joinCount, attendance: attendanceCount }),
    };
  }

  if (joinCount > 0) {
    return {
      title: joinCount === 1 ? t('1 pedido de entrada') : t('{count} pedidos de entrada', { count: joinCount }),
      note: t('Aguardando aprovação da unidade.'),
    };
  }

  if (attendanceCount > 0) {
    return {
      title: attendanceCount === 1 ? t('1 solicitação de presença') : t('{count} solicitações de presença', { count: attendanceCount }),
      note: t('Aguardando análise do professor responsável.'),
    };
  }

  if (unreadCount > 0) {
    return {
      title: unreadCount === 1 ? t('1 aviso recente') : t('{count} avisos recentes', { count: unreadCount }),
      note: t('Abra a aba de avisos para revisar as atualizações da unidade.'),
    };
  }

  return {
    title: t('Nenhuma pendência agora'),
    note: t('Tudo em dia na rotina da unidade.'),
  };
}

function formatConfirmedLabel(count: number) {
  return count === 1 ? t('1 confirmado') : t('{count} confirmados', { count });
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
  onNavigateToInstructors,
  onNavigateToStudents,
  onNavigateToClasses,
  onNavigateToInactiveStudents,
}) => {
  const now = new Date();
  const blackBeltProgress = getBlackBeltProgressForUser(user, now);
  const blackBeltMetaLine = blackBeltProgress
    ? [
      blackBeltProgress.degreeLabel || t('Faixa lisa'),
      blackBeltProgress.styleNote,
      blackBeltProgress.yearsToNextDegree != null && blackBeltProgress.nextDegree != null
        ? (blackBeltProgress.yearsToNextDegree === 1
          ? t('falta 1 ano para o {degree}º grau', { degree: blackBeltProgress.nextDegree })
          : t('faltam {years} anos para o {degree}º grau', { years: blackBeltProgress.yearsToNextDegree, degree: blackBeltProgress.nextDegree }))
        : t('Grau máximo alcançado'),
    ].filter(Boolean).join(' · ')
    : '';
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
  const activeStudents = useMemo(
    () => academyUsers.filter((entry) => entry.role === 'student' && entry.status !== 'suspended'),
    [academyUsers],
  );
  const inactiveStudents = useMemo(
    () => academyUsers.filter((entry) => entry.role === 'student' && entry.status === 'suspended'),
    [academyUsers],
  );

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
        setSelectedClassRsvpsError(t('Não foi possível carregar os alunos confirmados.'));
        setSelectedClassRsvpsLoading(false);
      },
    );
  }, [selectedClass]);

  return (
    <div className="view-shell staff-home">
      <section className="staff-home__hero">
        <div className="staff-home__hero-copy">
          <p className="staff-home__eyebrow">{t(getGreeting(now))},</p>
          <h1 className="staff-home__greeting">{user.name}</h1>
          <p className="staff-home__summary">
            {t('Visão do professor com equipe, agenda e pendências da unidade.')}
          </p>

          {blackBeltProgress ? (
            <div className="staff-home__belt">
              <div className="staff-home__belt-head">
                <span className="staff-home__belt-title">{blackBeltProgress.label}</span>
                <span className="staff-home__belt-since">
                  {blackBeltProgress.title} {t('desde:')} {blackBeltProgress.startDate.getFullYear()}
                </span>
              </div>
              <BjjBelt color={user.belt} stripes={blackBeltProgress.degree} blackBelt={blackBeltProgress} />
              {blackBeltMetaLine ? (
                <p className="staff-home__belt-meta">{blackBeltMetaLine}</p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="staff-home__vision">
          <div className="staff-home__vision-dot" aria-hidden="true" />
          <div className="staff-home__vision-copy">
            <p className="staff-home__vision-label">{t('Visão atual')}</p>
            <p className="staff-home__vision-title">{academy.name}</p>
          </div>
        </div>
      </section>

      <section className="staff-home__section">
        <p className="staff-home__section-label">{t('Visão geral')}</p>

        <div className="staff-home__kpi-grid">
          <StaffKpiCard
            label={t('Instrutores')}
            value={instructors.length}
            note={t('Equipe ativa')}
            onClick={onNavigateToInstructors}
          />

          <StaffKpiCard
            label={t('Alunos')}
            value={activeStudents.length}
            note={t('Ativos')}
            onClick={onNavigateToStudents}
          />

          <StaffKpiCard
            label={t('Aulas hoje')}
            value={todayClasses.length}
            note={t('Agendadas')}
            onClick={onNavigateToClasses}
          />

          <StaffKpiCard
            label={t('Inativos')}
            value={inactiveStudents.length}
            note={t('Desativados')}
            onClick={onNavigateToInactiveStudents}
          />
        </div>
      </section>

      <section className="staff-home__section">
        <div className="staff-home__section-head">
          <p className="staff-home__section-label">{t('Aulas de hoje')}</p>
          <span className="app-badge app-badge--muted">{todayClasses.length}</span>
        </div>

        <div className="staff-home__list">
          {todayClasses.length > 0 ? (
            todayClasses.map((lesson) => {
              const professorName = lesson.professorName || t('Equipe técnica');
              const plannedCount = lesson.rsvpCount ?? 0;
              const classMeta = lesson.status === 'scheduled'
                ? t('{confirmed} para esta aula - {professor}', { confirmed: formatConfirmedLabel(plannedCount), professor: professorName })
                : lesson.currentAttendanceCount > 0
                  ? t('{count} presenças registradas - {professor}', { count: lesson.currentAttendanceCount, professor: professorName })
                  : t('Professor: {professor}', { professor: professorName });

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
            <div className="staff-home__empty">{t('Nenhuma aula programada para hoje nesta unidade.')}</div>
          )}
        </div>
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
                <p className="staff-home__section-label">{t('Aula selecionada')}</p>
                <h2 id="staff-home-lesson-title" className="staff-home__lesson-title">{selectedClass.title}</h2>
                <p className="staff-home__lesson-subtitle">
                  {formatTimeLabel(selectedClass.scheduledStart)} - {selectedClass.professorName || t('Equipe tecnica')}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedClassId(null)}
                className="app-button app-button--ghost app-button--icon staff-home__lesson-close"
                aria-label={t('Fechar detalhes da aula')}
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
                  {t('Alunos que confirmaram que vão nesta aula.')}
                </p>
              </div>
            </div>

            <div className="staff-home__confirmed-list">
              <div className="staff-home__confirmed-head">
                <p className="staff-home__section-label">{t('Quem confirmou')}</p>
                {selectedClass.capacity ? (
                  <span className="app-badge app-badge--muted">{t('Capacidade {count}', { count: selectedClass.capacity })}</span>
                ) : null}
              </div>

              {selectedClassRsvpsError ? (
                <div className="staff-home__confirmed-empty">{selectedClassRsvpsError}</div>
              ) : selectedClassRsvpsLoading ? (
                <div className="staff-home__confirmed-empty">{t('Carregando confirmados...')}</div>
              ) : selectedClassRsvps.length > 0 ? (
                selectedClassRsvps.map((rsvp) => (
                  <div key={rsvp.id} className="staff-home__confirmed-row">
                    <div className="staff-home__confirmed-avatar" aria-hidden="true">
                      <UserCheck size={16} />
                    </div>
                    <div className="staff-home__confirmed-copy">
                      <p className="staff-home__confirmed-name">{rsvp.userDisplayName}</p>
                      <p className="staff-home__confirmed-meta">{t('Presença futura confirmada')}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="staff-home__confirmed-empty">
                  {t('Nenhum aluno confirmou que vai nesta aula ainda.')}
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
