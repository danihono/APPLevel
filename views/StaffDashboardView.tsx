import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CalendarCheck, ChevronRight, Play, Radio, X } from 'lucide-react';
import './redesign/staff-home.css';
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
import {
  beltLabel,
  getBlackBeltProgressForUser,
  getUserProgressionSummary,
  isBlackBelt,
} from '../beltCatalog';
import { classTypeLabel } from '../calendarUtils';
import BeltImage from '../components/BeltImage';
import ScreenHeader from '../components/redesign/ScreenHeader';
import { useRedesignShell } from '../components/redesign/ShellContext';
import type { User } from '../types';
import { createDateFormatter, t } from '../i18n';

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
  /**
   * Opcional: abre Avisos ja na aba certa ('requests' = solicitacoes, 'notifications' = caixa
   * de entrada). Sem ela, as linhas do card de pendencias usam onNavigateToPending.
   */
  onNavigateToPendingSection?: (section: 'requests' | 'notifications') => void;
  /** Opcional: inicia a aula (startClassSession) e leva ao Calendario. Sem ela, o CTA abre o Calendario. */
  onStartClass?: (classId: string) => Promise<void>;
  /** Opcional: abre o detalhe do aluno ("Perto de graduar"). Sem ela, vai para a lista de alunos. */
  onOpenStudent?: (studentId: string) => void;
}

// Alunos sem treino ha esse tempo contam como "inativos" (continuam ativos no cadastro).
const INACTIVE_MINIMUM_DAYS = 30;
// "Em breve": aula agendada que comeca dentro dessa janela (ou ja passou do horario de inicio).
const SOON_WINDOW_MS = 60 * 60 * 1000;
const CONFIRMED_PREVIEW_SIZE = 4;
const NEAR_GRADUATION_SIZE = 5;

const shortDateFormatter = createDateFormatter({ day: '2-digit', month: '2-digit' });

type LessonDisplayStatus = 'live' | 'soon' | 'scheduled' | 'finished' | 'cancelled' | 'unfinished';

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

function formatAttendanceLabel(count: number) {
  return count === 1 ? t('1 presença registrada') : t('{count} presenças registradas', { count });
}

function firstNameOf(value?: string | null) {
  return (value ?? '').trim().split(/\s+/)[0] ?? '';
}

function initialOf(value?: string | null) {
  return (value ?? '').trim().charAt(0).toUpperCase() || '?';
}

// "Felipe", "Felipe e Marina", "Felipe, Marina e mais 1".
function formatNameList(names: string[]) {
  const clean = names.map(firstNameOf).filter(Boolean);
  if (clean.length === 0) {
    return '';
  }
  if (clean.length === 1) {
    return clean[0];
  }
  if (clean.length === 2) {
    return t('{first} e {second}', { first: clean[0], second: clean[1] });
  }
  return t('{first}, {second} e mais {count}', { first: clean[0], second: clean[1], count: clean.length - 2 });
}

function getLessonStatus(lesson: FirestoreEntity<ClassRecord>, nowMs: number): LessonDisplayStatus {
  if (lesson.status === 'cancelled') {
    return 'cancelled';
  }
  if (lesson.status === 'finished') {
    return 'finished';
  }

  const deadline = lesson.scheduledEnd ?? lesson.scheduledStart;
  if (deadline && deadline.toMillis() < nowMs) {
    return 'unfinished';
  }

  if (lesson.status === 'active') {
    return 'live';
  }

  const startMs = lesson.scheduledStart?.toMillis() ?? 0;
  return startMs - nowMs <= SOON_WINDOW_MS ? 'soon' : 'scheduled';
}

function lessonStatusLabel(status: LessonDisplayStatus) {
  switch (status) {
    case 'live':
      return t('Ao vivo');
    case 'soon':
      return t('Em breve');
    case 'finished':
      return t('Finalizada');
    case 'cancelled':
      return t('Cancelada');
    case 'unfinished':
      return t('Não finalizada');
    default:
      return t('Agendada');
  }
}

function lessonStatusChipClass(status: LessonDisplayStatus) {
  switch (status) {
    case 'live':
      return 'lv-chip lv-chip--live';
    case 'soon':
      return 'lv-chip lv-chip--soon';
    case 'finished':
      return 'lv-chip lv-chip--done';
    case 'cancelled':
      return 'lv-chip lv-chip--danger';
    case 'unfinished':
      return 'lv-chip lv-chip--warning';
    default:
      return 'lv-chip';
  }
}

function lessonMetaParts(lesson: FirestoreEntity<ClassRecord>) {
  const typeLabel = classTypeLabel(lesson.description);
  const title = lesson.title?.trim() || typeLabel || '';
  const showType = Boolean(typeLabel)
    && !title.toLocaleLowerCase().includes((typeLabel ?? '').toLocaleLowerCase());

  return [
    title,
    showType ? typeLabel : null,
    lesson.professorName || t('Equipe técnica'),
    lesson.tatame || null,
  ].filter(Boolean).join(' · ');
}

interface NearGraduationRow {
  student: FirestoreEntity<UserRecord>;
  remaining: number;
  line: string;
  suggested: boolean;
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
  onNavigateToPendingSection,
  onStartClass,
  onOpenStudent,
}) => {
  const shell = useRedesignShell();
  // Relogio da tela: atualiza os chips "Em breve"/"Ao vivo" sem recriar as listas a cada render.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const now = useMemo(() => new Date(nowMs), [nowMs]);

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
  const [featuredRsvps, setFeaturedRsvps] = useState<Array<FirestoreEntity<ClassRsvpRecord>>>([]);
  const [featuredRsvpsLoading, setFeaturedRsvpsLoading] = useState(false);
  const [featuredRsvpsError, setFeaturedRsvpsError] = useState('');
  const [startingClass, setStartingClass] = useState(false);
  const [startError, setStartError] = useState('');

  const todayKey = now.toDateString();
  const todayClasses = useMemo(
    () => {
      const today = new Date(todayKey);
      return classes
        .filter((lesson) => isSameDay(lesson.scheduledStart?.toDate(), today))
        .sort((left, right) => (left.scheduledStart?.toMillis?.() ?? 0) - (right.scheduledStart?.toMillis?.() ?? 0));
    },
    [classes, todayKey],
  );
  const selectedClass = useMemo(
    () => (selectedClassId ? classes.find((lesson) => lesson.id === selectedClassId) ?? null : null),
    [classes, selectedClassId],
  );

  // Aula em destaque: a que esta ao vivo; senao a proxima agendada que ainda nao terminou.
  const featuredClass = useMemo(() => {
    const live = todayClasses.find((lesson) => getLessonStatus(lesson, nowMs) === 'live');
    if (live) {
      return live;
    }
    return todayClasses.find((lesson) => {
      const status = getLessonStatus(lesson, nowMs);
      return status === 'soon' || status === 'scheduled';
    }) ?? null;
  }, [nowMs, todayClasses]);
  const featuredStatus = featuredClass ? getLessonStatus(featuredClass, nowMs) : null;
  const otherTodayClasses = useMemo(
    () => todayClasses.filter((lesson) => lesson.id !== featuredClass?.id),
    [featuredClass?.id, todayClasses],
  );

  const usersById = useMemo(
    () => new Map(academyUsers.map((entry) => [entry.id, entry])),
    [academyUsers],
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
  // Ativos no cadastro, mas sem treinar ha INACTIVE_MINIMUM_DAYS dias (quem nunca treinou conta
  // desde o inicio dos treinos ou do cadastro).
  const idleStudentsCount = useMemo(() => {
    const limitMs = nowMs - INACTIVE_MINIMUM_DAYS * 86_400_000;
    return activeStudents.filter((student) => {
      const referenceMs = student.lastAttendanceAt?.toMillis()
        ?? student.trainingStartDate?.toMillis()
        ?? student.createdAt?.toMillis()
        ?? 0;
      return referenceMs > 0 && referenceMs < limitMs;
    }).length;
  }, [activeStudents, nowMs]);

  const actionState = useMemo(
    () => ({ joinRequests, attendanceRequests, graduationRequests, fightVideoSubmissions }),
    [attendanceRequests, fightVideoSubmissions, graduationRequests, joinRequests],
  );
  const unreadNotificationEntries = useMemo(
    () => notifications.filter((entry) => isUnreadNotificationForViewer(entry, {
      viewerRole: user.role,
      actionState,
    })),
    [actionState, notifications, user.role],
  );
  const unreadNotifications = unreadNotificationEntries.length;
  // Avisos que nao repetem as linhas de solicitacao/pedido do proprio card.
  const recentNotices = useMemo(
    () => unreadNotificationEntries
      .filter((entry) => entry.kind !== 'join_request' && entry.kind !== 'attendance_request')
      .sort((left, right) => (right.createdAt?.toMillis?.() ?? 0) - (left.createdAt?.toMillis?.() ?? 0)),
    [unreadNotificationEntries],
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
  const pendingTotal = pendingJoinRequests.length + pendingAttendanceRequests.length + recentNotices.length;
  const pendingCopy = getPendingCopy(
    pendingJoinRequests.length,
    pendingAttendanceRequests.length,
    unreadNotifications,
  );

  const goToPending = (section: 'requests' | 'notifications') => {
    if (onNavigateToPendingSection) {
      onNavigateToPendingSection(section);
      return;
    }
    onNavigateToPending?.();
  };
  const pendingNavigable = Boolean(onNavigateToPendingSection || onNavigateToPending);

  // Perto de graduar: menos aulas faltando para o proximo grau/faixa. Faixa preta progride
  // por tempo e fica de fora. Pedido de graduacao pendente = "aprovacao sugerida".
  const nearGraduation = useMemo<NearGraduationRow[]>(() => {
    const pendingByUser = new Map<string, FirestoreEntity<GraduationApprovalRequestRecord>>();
    graduationRequests.forEach((request) => {
      if (request.status === 'pending' && !pendingByUser.has(request.userId)) {
        pendingByUser.set(request.userId, request);
      }
    });

    const rows: NearGraduationRow[] = [];
    activeStudents.forEach((student) => {
      if (isBlackBelt(student.belt)) {
        return;
      }

      const request = pendingByUser.get(student.id);
      if (request && request.remainingClasses <= 0) {
        rows.push({
          student,
          remaining: 0,
          suggested: true,
          line: request.targetType === 'belt'
            ? t('Pronto para a Faixa {belt}', { belt: beltLabel(request.targetBelt) })
            : t('Pronto para o {degree}º grau', { degree: request.targetStripes }),
        });
        return;
      }

      const summary = getUserProgressionSummary(student, academy.progressionRules);
      if (summary.stripeRemaining != null) {
        const degree = summary.currentStripes + 1;
        const remaining = summary.stripeRemaining;
        rows.push({
          student,
          remaining,
          suggested: Boolean(request),
          line: remaining <= 0
            ? t('Pronto para o {degree}º grau', { degree })
            : remaining === 1
              ? t('aula para o {degree}º grau', { degree })
              : t('aulas para o {degree}º grau', { degree }),
        });
        return;
      }

      if (summary.beltRemaining != null && summary.nextBelt) {
        const belt = beltLabel(summary.nextBelt);
        const remaining = summary.beltRemaining;
        rows.push({
          student,
          remaining,
          suggested: Boolean(request),
          line: remaining <= 0
            ? t('Pronto para a Faixa {belt}', { belt })
            : remaining === 1
              ? t('aula para a Faixa {belt}', { belt })
              : t('aulas para a Faixa {belt}', { belt }),
        });
      }
    });

    return rows
      .sort((left, right) => (
        left.remaining - right.remaining
        || Number(right.suggested) - Number(left.suggested)
        || left.student.displayName.localeCompare(right.student.displayName)
      ))
      .slice(0, NEAR_GRADUATION_SIZE);
  }, [academy.progressionRules, activeStudents, graduationRequests]);

  // CTA fixo: aula ao vivo -> abrir; aula agendada de hoje "em breve" ou ja no horario -> iniciar.
  const liveClass = featuredStatus === 'live' ? featuredClass : null;
  const startableClass = featuredStatus === 'soon' ? featuredClass : null;

  const handleStartClass = async () => {
    if (!startableClass) {
      return;
    }
    if (!onStartClass) {
      onNavigateToClasses?.();
      return;
    }
    setStartingClass(true);
    setStartError('');
    try {
      await onStartClass(startableClass.id);
    } catch (error) {
      setStartError(error instanceof Error && error.message ? error.message : t('Não foi possível iniciar a aula.'));
    } finally {
      setStartingClass(false);
    }
  };

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

  // Confirmados da aula em destaque (um listener so, para a previa "Quem confirmou").
  const featuredClassId = featuredClass?.id ?? null;
  const featuredAcademyId = featuredClass?.academyId ?? null;
  useEffect(() => {
    if (!featuredClassId || !featuredAcademyId) {
      setFeaturedRsvps([]);
      setFeaturedRsvpsLoading(false);
      setFeaturedRsvpsError('');
      return undefined;
    }

    setFeaturedRsvps([]);
    setFeaturedRsvpsLoading(true);
    setFeaturedRsvpsError('');

    return subscribeToClassRsvps(
      featuredClassId,
      featuredAcademyId,
      (records) => {
        setFeaturedRsvps(records);
        setFeaturedRsvpsLoading(false);
      },
      () => {
        setFeaturedRsvpsError(t('Não foi possível carregar os alunos confirmados.'));
        setFeaturedRsvpsLoading(false);
      },
    );
  }, [featuredAcademyId, featuredClassId]);

  useEffect(() => {
    if (!selectedClassId) {
      return undefined;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedClassId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedClassId]);

  const renderMiniBelt = (userId: string, name: string) => {
    const entry = usersById.get(userId);
    if (!entry) {
      return null;
    }
    const blackBelt = getBlackBeltProgressForUser({
      belt: entry.belt,
      lastGraduation: entry.lastGraduationDateOverride?.toDate?.() ?? null,
      blackBeltDegreeManual: entry.blackBeltDegreeManual,
    }, now);
    return (
      <BeltImage
        belt={entry.belt}
        stripes={entry.stripes ?? entry.grade ?? 0}
        blackBelt={blackBelt}
        className="lv-belt-mini rd-staff__belt-mini"
        alt={t('Faixa de {name}', { name })}
      />
    );
  };

  const firstName = shell.firstName || user.firstName || firstNameOf(user.name);
  const unitLabel = shell.unitLabel || academy.name;
  const eyebrow = [unitLabel, t('Professor')].filter(Boolean).join(' · ');

  const renderRsvpRow = (rsvp: FirestoreEntity<ClassRsvpRecord>, note?: string) => (
    <div key={rsvp.id} className="rd-staff__person">
      <span className="lv-avatar rd-staff__person-avatar" aria-hidden="true">{initialOf(rsvp.userDisplayName)}</span>
      <span className="rd-staff__person-copy">
        <span className="rd-staff__person-name">{rsvp.userDisplayName}</span>
        {note ? <span className="rd-staff__person-note">{note}</span> : null}
      </span>
      {renderMiniBelt(rsvp.userId, rsvp.userDisplayName)}
    </div>
  );

  const renderFeaturedClass = (lesson: FirestoreEntity<ClassRecord>, status: LessonDisplayStatus) => {
    const rsvpCount = featuredRsvpsLoading ? (lesson.rsvpCount ?? 0) : featuredRsvps.length;
    const capacity = lesson.capacity ?? 0;
    const percent = capacity > 0 ? Math.min(100, Math.round((rsvpCount / capacity) * 100)) : 0;
    const endLabel = lesson.scheduledEnd ? formatTimeLabel(lesson.scheduledEnd) : '';

    return (
      <article className="lv-card rd-staff__next">
        <div className="rd-staff__next-head">
          <p className="rd-staff__next-time">
            <span className="rd-staff__next-start">{formatTimeLabel(lesson.scheduledStart)}</span>
            {endLabel ? <span className="rd-staff__next-end">{t('até {time}', { time: endLabel })}</span> : null}
          </p>
          <span className={lessonStatusChipClass(status)}>{lessonStatusLabel(status)}</span>
        </div>
        <p className="rd-staff__next-meta">{lessonMetaParts(lesson)}</p>

        <div className="rd-staff__next-counts">
          <p className="rd-staff__next-confirmed">
            {capacity > 0
              ? t('{count} de {capacity} confirmaram', { count: rsvpCount, capacity })
              : formatConfirmedLabel(rsvpCount)}
          </p>
          <p className="rd-staff__next-attendance">{formatAttendanceLabel(lesson.currentAttendanceCount ?? 0)}</p>
        </div>
        {capacity > 0 ? (
          <div
            className="lv-progress rd-staff__next-bar"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={capacity}
            aria-valuenow={rsvpCount}
            aria-label={t('{count} de {capacity} confirmaram', { count: rsvpCount, capacity })}
          >
            <span style={{ width: `${percent}%` }} />
          </div>
        ) : null}

        <p className="lv-eyebrow rd-staff__next-label">{t('Quem confirmou')}</p>
        <div className="rd-staff__people">
          {featuredRsvpsError ? (
            <p className="rd-staff__people-empty">{featuredRsvpsError}</p>
          ) : featuredRsvpsLoading ? (
            <p className="rd-staff__people-empty">{t('Carregando confirmados...')}</p>
          ) : featuredRsvps.length > 0 ? (
            featuredRsvps.slice(0, CONFIRMED_PREVIEW_SIZE).map((rsvp) => renderRsvpRow(rsvp))
          ) : (
            <p className="rd-staff__people-empty">{t('Nenhum aluno confirmou que vai nesta aula ainda.')}</p>
          )}
        </div>

        <button type="button" className="rd-staff__next-more" onClick={() => setSelectedClassId(lesson.id)}>
          <span>
            {rsvpCount > 0
              ? t('Ver os {count} confirmados', { count: rsvpCount })
              : t('Ver detalhes da aula')}
          </span>
          <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
        </button>
      </article>
    );
  };

  const renderCompactClass = (lesson: FirestoreEntity<ClassRecord>) => {
    const status = getLessonStatus(lesson, nowMs);
    const professorName = lesson.professorName || t('Equipe técnica');
    const showConfirmed = status === 'soon' || status === 'scheduled';
    const value = showConfirmed ? (lesson.rsvpCount ?? 0) : (lesson.currentAttendanceCount ?? 0);
    const valueLabel = showConfirmed
      ? (value === 1 ? t('confirmado') : t('confirmados'))
      : (value === 1 ? t('presença') : t('presenças'));

    return (
      <button
        key={lesson.id}
        type="button"
        className={`rd-staff__class${status === 'cancelled' ? ' is-cancelled' : ''}`}
        onClick={() => setSelectedClassId(lesson.id)}
      >
        <span className="rd-staff__class-time">{formatTimeLabel(lesson.scheduledStart)}</span>
        <span className="rd-staff__class-copy">
          <span className="rd-staff__class-title">{lesson.title}</span>
          <span className="rd-staff__class-meta">
            {professorName}
            {' · '}
            <span className={`rd-staff__class-status is-${status}`}>{lessonStatusLabel(status)}</span>
          </span>
        </span>
        <span className="rd-staff__class-count">
          <strong>{value}</strong>
          <span>{valueLabel}</span>
        </span>
      </button>
    );
  };

  return (
    <div className="lv-screen rd-staff">
      <ScreenHeader
        eyebrow={eyebrow}
        title={(
          <>
            {t(getGreeting(now))},
            <br />
            {firstName ? `${firstName}.` : null}
          </>
        )}
        actions={(
          <button
            type="button"
            className="lv-avatar lv-avatar--ink rd-staff__me"
            onClick={() => shell.navigate('profile')}
            aria-label={t('Perfil')}
          >
            {user.avatar && /^https?:/.test(user.avatar)
              ? <img src={user.avatar} alt="" />
              : initialOf(firstName || user.name)}
          </button>
        )}
      />

      <div className="rd-staff__grid">
        <div className="rd-staff__col">
          {/* ─── Pendencias ─────────────────────────────────────────────── */}
          <section className="rd-staff__pending" aria-label={pendingCopy.title}>
            {pendingTotal > 0 ? (
              <>
                <div className="rd-staff__pending-head">
                  <span className="rd-staff__pending-number">{pendingTotal}</span>
                  <span className="rd-staff__pending-title">
                    {pendingTotal === 1 ? t('pendência aguardando ação') : t('pendências aguardando ação')}
                  </span>
                </div>

                <div className="rd-staff__pending-list">
                  {pendingAttendanceRequests.length > 0 ? (
                    <PendingRow
                      count={pendingAttendanceRequests.length}
                      title={pendingAttendanceRequests.length === 1 ? t('Solicitação de presença') : t('Solicitações de presença')}
                      note={formatNameList(pendingAttendanceRequests.map((entry) => entry.userDisplayName))}
                      onClick={pendingNavigable ? () => goToPending('requests') : undefined}
                    />
                  ) : null}

                  {pendingJoinRequests.length > 0 ? (
                    <PendingRow
                      count={pendingJoinRequests.length}
                      title={pendingJoinRequests.length === 1 ? t('Pedido de entrada') : t('Pedidos de entrada')}
                      note={pendingJoinRequests.length === 1
                        ? t('{name} quer entrar na unidade', { name: pendingJoinRequests[0].displayName })
                        : t('{names} querem entrar na unidade', {
                          names: formatNameList(pendingJoinRequests.map((entry) => entry.displayName)),
                        })}
                      onClick={pendingNavigable ? () => goToPending('requests') : undefined}
                    />
                  ) : null}

                  {recentNotices.length > 0 ? (
                    <PendingRow
                      count={recentNotices.length}
                      title={recentNotices.length === 1 ? t('Aviso recente') : t('Avisos recentes')}
                      note={[
                        recentNotices[0].title,
                        recentNotices[0].createdAt ? shortDateFormatter.format(recentNotices[0].createdAt.toDate()) : '',
                      ].filter(Boolean).join(' · ')}
                      onClick={pendingNavigable ? () => goToPending('notifications') : undefined}
                    />
                  ) : null}
                </div>
              </>
            ) : (
              <div className="rd-staff__pending-empty">
                <p className="rd-staff__pending-empty-title">{pendingCopy.title}</p>
                <p className="rd-staff__pending-empty-note">{pendingCopy.note}</p>
              </div>
            )}
          </section>

          {/* ─── Numeros da unidade ─────────────────────────────────────── */}
          <div className="rd-staff__stats">
            <article className="rd-staff__stat">
              {onNavigateToStudents ? (
                <button type="button" className="rd-staff__stat-main" onClick={onNavigateToStudents}>
                  <span className="lv-eyebrow">{t('Alunos ativos')}</span>
                  <span className="rd-staff__stat-value">{activeStudents.length}</span>
                </button>
              ) : (
                <div className="rd-staff__stat-main">
                  <span className="lv-eyebrow">{t('Alunos ativos')}</span>
                  <span className="rd-staff__stat-value">{activeStudents.length}</span>
                </div>
              )}
              <p className="rd-staff__stat-note">
                {onNavigateToStudents ? (
                  <button
                    type="button"
                    className="rd-staff__stat-link"
                    onClick={onNavigateToStudents}
                    title={t('Sem treinar há {days} dias ou mais', { days: INACTIVE_MINIMUM_DAYS })}
                  >
                    {t('{count} inativos', { count: idleStudentsCount })}
                  </button>
                ) : (
                  <span title={t('Sem treinar há {days} dias ou mais', { days: INACTIVE_MINIMUM_DAYS })}>
                    {t('{count} inativos', { count: idleStudentsCount })}
                  </span>
                )}
                <span aria-hidden="true"> · </span>
                {onNavigateToInactiveStudents ? (
                  <button type="button" className="rd-staff__stat-link" onClick={onNavigateToInactiveStudents}>
                    {t('{count} desativados', { count: inactiveStudents.length })}
                  </button>
                ) : (
                  <span>{t('{count} desativados', { count: inactiveStudents.length })}</span>
                )}
              </p>
            </article>

            <article className="rd-staff__stat">
              {onNavigateToInstructors ? (
                <button type="button" className="rd-staff__stat-main rd-staff__stat-main--full" onClick={onNavigateToInstructors}>
                  <span className="lv-eyebrow">{t('Instrutores')}</span>
                  <span className="rd-staff__stat-value">{instructors.length}</span>
                  <span className="rd-staff__stat-note">{t('Equipe ativa')}</span>
                </button>
              ) : (
                <div className="rd-staff__stat-main rd-staff__stat-main--full">
                  <span className="lv-eyebrow">{t('Instrutores')}</span>
                  <span className="rd-staff__stat-value">{instructors.length}</span>
                  <span className="rd-staff__stat-note">{t('Equipe ativa')}</span>
                </div>
              )}
            </article>
          </div>

          {/* ─── Aulas de hoje ──────────────────────────────────────────── */}
          <section className="lv-section rd-staff__section">
            <div className="lv-section__head">
              <h2 className="lv-section__title rd-staff__section-title">
                {t('Aulas de hoje')}
                <span
                  className="lv-chip rd-staff__count-chip"
                  aria-label={`${t('Aulas hoje')}: ${todayClasses.length}`}
                >
                  {todayClasses.length}
                </span>
              </h2>
              {onNavigateToClasses ? (
                <button type="button" className="lv-link rd-staff__link" onClick={onNavigateToClasses}>
                  {t('Calendário')}
                </button>
              ) : null}
            </div>

            {todayClasses.length > 0 ? (
              <div className="rd-staff__classes">
                {featuredClass && featuredStatus ? renderFeaturedClass(featuredClass, featuredStatus) : null}
                {otherTodayClasses.map(renderCompactClass)}
              </div>
            ) : (
              <div className="lv-card lv-card--dashed rd-staff__empty">
                {t('Nenhuma aula programada para hoje nesta unidade.')}
              </div>
            )}
          </section>
        </div>

        <div className="rd-staff__col">
          {/* ─── Perto de graduar ───────────────────────────────────────── */}
          {nearGraduation.length > 0 ? (
            <section className="lv-section rd-staff__section">
              <div className="lv-section__head">
                <h2 className="lv-section__title">{t('Perto de graduar')}</h2>
              </div>
              <div className="rd-staff__near">
                {nearGraduation.map((row) => {
                  const handleOpen = onOpenStudent
                    ? () => onOpenStudent(row.student.id)
                    : onNavigateToStudents;
                  const content = (
                    <>
                      <span className="rd-staff__near-count">
                        <strong>{row.remaining}</strong>
                        <span>{row.remaining === 1 ? t('Falta') : t('Faltam')}</span>
                      </span>
                      <span className="rd-staff__near-copy">
                        <span className="rd-staff__near-name">{row.student.displayName}</span>
                        <span className="rd-staff__near-line">
                          {row.suggested ? `${row.line} · ${t('aprovação sugerida')}` : row.line}
                        </span>
                      </span>
                      {renderMiniBelt(row.student.id, row.student.displayName)}
                    </>
                  );

                  return handleOpen ? (
                    <button key={row.student.id} type="button" className="rd-staff__near-row" onClick={handleOpen}>
                      {content}
                    </button>
                  ) : (
                    <div key={row.student.id} className="rd-staff__near-row">{content}</div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* ─── Faixa preta do professor ───────────────────────────────── */}
          {blackBeltProgress ? (
            <section className="lv-card rd-staff__belt">
              <div className="rd-staff__belt-head">
                <span className="rd-staff__belt-title">{blackBeltProgress.label}</span>
                <span className="rd-staff__belt-since">
                  {blackBeltProgress.title} {t('desde:')} {blackBeltProgress.startDate.getFullYear()}
                </span>
              </div>
              <div className="rd-staff__belt-image">
                <BeltImage
                  belt={user.belt}
                  stripes={blackBeltProgress.degree}
                  blackBelt={blackBeltProgress}
                  alt={blackBeltProgress.label}
                />
              </div>
              {blackBeltMetaLine ? (
                <p className="rd-staff__belt-meta">{blackBeltMetaLine}</p>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>

      {/* ─── CTA fixo ─────────────────────────────────────────────────── */}
      {liveClass && onNavigateToClasses ? (
        <div className="lv-sticky-cta rd-staff__cta">
          <button type="button" className="lv-btn lv-btn--primary" onClick={onNavigateToClasses}>
            <Radio size={18} strokeWidth={2} aria-hidden="true" />
            <span className="rd-staff__cta-label">{t('Abrir aula ao vivo')}</span>
          </button>
        </div>
      ) : startableClass && (onStartClass || onNavigateToClasses) ? (
        <div className="lv-sticky-cta rd-staff__cta">
          {startError ? <p className="lv-alert lv-alert--danger rd-staff__cta-error" role="alert">{startError}</p> : null}
          <button
            type="button"
            className="lv-btn lv-btn--primary"
            onClick={() => { void handleStartClass(); }}
            disabled={startingClass}
          >
            <Play size={18} strokeWidth={2} fill="currentColor" aria-hidden="true" />
            <span className="rd-staff__cta-label">
              {startingClass
                ? t('Iniciando...')
                : t('Iniciar aula · {title} {time}', {
                  title: classTypeLabel(startableClass.description) || startableClass.title,
                  time: formatTimeLabel(startableClass.scheduledStart),
                })}
            </span>
          </button>
        </div>
      ) : null}

      {/* ─── Sheet da aula (confirmados) ──────────────────────────────── */}
      {selectedClass ? (
        <div
          className="lv-backdrop"
          role="presentation"
          onClick={() => setSelectedClassId(null)}
        >
          <section
            className="lv-sheet rd-staff__sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-home-lesson-title"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="lv-sheet__grip" aria-hidden="true" />
            <div className="lv-sheet__head">
              <div className="rd-staff__sheet-title-copy">
                <p className="lv-eyebrow">{t('Aula selecionada')}</p>
                <h2 id="staff-home-lesson-title" className="lv-title-lg">{selectedClass.title}</h2>
                <p className="rd-staff__sheet-subtitle">
                  {formatTimeLabel(selectedClass.scheduledStart)} - {selectedClass.professorName || t('Equipe técnica')}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSelectedClassId(null)}
                className="lv-icon-btn"
                aria-label={t('Fechar detalhes da aula')}
              >
                <X size={18} strokeWidth={2} />
              </button>
            </div>

            <div className="rd-staff__sheet-summary">
              <span className="rd-staff__sheet-summary-icon" aria-hidden="true">
                <CalendarCheck size={20} strokeWidth={2} />
              </span>
              <div>
                <p className="rd-staff__sheet-count">
                  {formatConfirmedLabel(selectedClassRsvpsLoading ? (selectedClass.rsvpCount ?? 0) : selectedClassRsvps.length)}
                </p>
                <p className="rd-staff__sheet-note">
                  {t('Alunos que confirmaram que vão nesta aula.')}
                </p>
              </div>
            </div>

            <div className="rd-staff__sheet-list-head">
              <p className="lv-eyebrow">{t('Quem confirmou')}</p>
              {selectedClass.capacity ? (
                <span className="lv-chip">{t('Capacidade {count}', { count: selectedClass.capacity })}</span>
              ) : null}
            </div>

            <div className="rd-staff__people rd-staff__people--sheet">
              {selectedClassRsvpsError ? (
                <p className="rd-staff__people-empty">{selectedClassRsvpsError}</p>
              ) : selectedClassRsvpsLoading ? (
                <p className="rd-staff__people-empty">{t('Carregando confirmados...')}</p>
              ) : selectedClassRsvps.length > 0 ? (
                selectedClassRsvps.map((rsvp) => renderRsvpRow(rsvp, t('Presença futura confirmada')))
              ) : (
                <p className="rd-staff__people-empty">
                  {t('Nenhum aluno confirmou que vai nesta aula ainda.')}
                </p>
              )}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
};

interface PendingRowProps {
  count: number;
  title: string;
  note: string;
  onClick?: () => void;
}

const PendingRow: React.FC<PendingRowProps> = ({ count, title, note, onClick }) => {
  const content = (
    <>
      <span className="rd-staff__pending-count">{count}</span>
      <span className="rd-staff__pending-copy">
        <span className="rd-staff__pending-row-title">{title}</span>
        {note ? <span className="rd-staff__pending-row-note">{note}</span> : null}
      </span>
      {onClick ? <ChevronRight size={18} strokeWidth={2} className="rd-staff__pending-chevron" aria-hidden="true" /> : null}
    </>
  );

  return onClick ? (
    <button type="button" className="rd-staff__pending-row" onClick={onClick}>{content}</button>
  ) : (
    <div className="rd-staff__pending-row">{content}</div>
  );
};

export default StaffDashboardView;
