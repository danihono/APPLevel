import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarCheck, Cake, ChevronRight, MessageCircle, Play, Radio, Users, X } from 'lucide-react';
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
import { buildWhatsAppLink } from '../contactLinks';
import ScreenHeader from '../components/redesign/ScreenHeader';
import { CountUp, prefersReducedMotion } from '../components/redesign/motion';
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
const NEAR_GRADUATION_SIZE = 5;
// "Sumidos": sem treinar ha esse tempo (so quem ja treinou alguma vez).
const MISSING_MINIMUM_DAYS = 14;
const MISSING_PREVIEW_SIZE = 5;
// Aniversariantes: hoje e os proximos dias.
const BIRTHDAY_WINDOW_DAYS = 7;
const weekdayShortFormatter = createDateFormatter({ weekday: 'short', day: '2-digit', month: '2-digit' });
// Pulso da academia: janela de "treinaram" e limite de tracinhos do anel (1 por aluno ate esse total).
const PULSE_WINDOW_DAYS = 7;
const MAX_RING_TICKS = 36;
const PULSE_BAR_MAX_HEIGHT = 34;
const STACK_PREVIEW_SIZE = 5;
const weekdayNarrowFormatter = createDateFormatter({ weekday: 'narrow' });
const weekdayLongFormatter = createDateFormatter({ weekday: 'long' });

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

// Foto (quando photoPath ja e URL exibivel) ou a inicial do nome.
function renderPersonAvatar(name?: string | null, photoPath?: string | null) {
  const photo = photoPath && photoPath.startsWith('http') ? photoPath : null;
  return (
    <span className="rd-staff__person-avatar" aria-hidden="true">
      {photo ? <img src={photo} alt="" /> : initialOf(name)}
    </span>
  );
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

interface PulseDay {
  date: Date;
  count: number;
  state: 'past' | 'today' | 'future';
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

  // Sumidos: ativos que ja treinaram mas nao aparecem ha MISSING_MINIMUM_DAYS dias. Mais recentes primeiro
  // (sao os mais faceis de trazer de volta).
  const missingStudents = useMemo(() => {
    const limitMs = nowMs - MISSING_MINIMUM_DAYS * 86_400_000;
    return activeStudents
      .map((student) => ({ student, lastMs: student.lastAttendanceAt?.toMillis() ?? 0 }))
      .filter((row) => row.lastMs > 0 && row.lastMs < limitMs)
      .map((row) => ({ ...row, days: Math.floor((nowMs - row.lastMs) / 86_400_000) }))
      .sort((left, right) => left.days - right.days);
  }, [activeStudents, nowMs]);
  const [showAllMissing, setShowAllMissing] = useState(false);

  // Aniversariantes de hoje ate BIRTHDAY_WINDOW_DAYS dias (alunos e equipe da unidade).
  const birthdays = useMemo(() => {
    const today = new Date(nowMs);
    today.setHours(0, 0, 0, 0);
    const rows: Array<{ person: FirestoreEntity<UserRecord>; date: Date; inDays: number; age: number | null }> = [];
    academyUsers.forEach((person) => {
      if (person.status === 'suspended' || !person.birthDate) return;
      const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(person.birthDate);
      if (!match) return;
      const [, year, month, day] = match.map(Number);
      let next = new Date(today.getFullYear(), month - 1, day);
      if (next < today) next = new Date(today.getFullYear() + 1, month - 1, day);
      const inDays = Math.round((next.getTime() - today.getTime()) / 86_400_000);
      if (inDays > BIRTHDAY_WINDOW_DAYS) return;
      rows.push({ person, date: next, inDays, age: year > 1900 ? next.getFullYear() - year : null });
    });
    return rows.sort((left, right) => left.inDays - right.inDays);
  }, [academyUsers, nowMs]);

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

    return rows.sort((left, right) => (
      left.remaining - right.remaining
      || Number(right.suggested) - Number(left.suggested)
      || left.student.displayName.localeCompare(right.student.displayName)
    ));
  }, [academy.progressionRules, activeStudents, graduationRequests]);
  const [showAllNear, setShowAllNear] = useState(false);
  const readyCount = useMemo(() => nearGraduation.filter((row) => row.remaining <= 0).length, [nearGraduation]);
  const suggestedCount = useMemo(() => nearGraduation.filter((row) => row.suggested).length, [nearGraduation]);

  // Pulso: alunos ativos que treinaram nos ultimos PULSE_WINDOW_DAYS dias.
  const trainedRecently = useMemo(() => {
    const limitMs = nowMs - PULSE_WINDOW_DAYS * 86_400_000;
    return activeStudents.filter((student) => (student.lastAttendanceAt?.toMillis() ?? 0) >= limitMs).length;
  }, [activeStudents, nowMs]);
  const trainedPercent = activeStudents.length > 0 ? Math.round((trainedRecently / activeStudents.length) * 100) : 0;

  // Check-ins da semana (seg-dom): soma das presencas registradas em cada aula. Dias que ainda nao
  // chegaram ficam tracejados. Lotacao = check-ins / vagas das aulas da semana que ja comecaram.
  const weekPulse = useMemo(() => {
    const today = new Date(todayKey);
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
    const days: PulseDay[] = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index);
      return {
        date,
        count: 0,
        state: isSameDay(date, today) ? 'today' : date < today ? 'past' : 'future',
      };
    });
    const weekEndMs = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7).getTime();
    let seatsUsed = 0;
    let seats = 0;
    classes.forEach((lesson) => {
      const start = lesson.scheduledStart?.toDate();
      if (!start || lesson.status === 'cancelled') {
        return;
      }
      const startMs = start.getTime();
      if (startMs < monday.getTime() || startMs >= weekEndMs) {
        return;
      }
      const dayStart = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      const index = Math.round((dayStart.getTime() - monday.getTime()) / 86_400_000);
      const count = lesson.currentAttendanceCount ?? 0;
      if (days[index]) {
        days[index].count += count;
      }
      if (startMs <= nowMs && (lesson.capacity ?? 0) > 0) {
        seatsUsed += count;
        seats += lesson.capacity ?? 0;
      }
    });
    return {
      days,
      today: days.find((day) => day.state === 'today')?.count ?? 0,
      week: days.reduce((total, day) => total + day.count, 0),
      occupancy: seats > 0 ? Math.min(100, Math.round((seatsUsed / seats) * 100)) : null,
    };
  }, [classes, nowMs, todayKey]);
  const pulseBarMax = Math.max(1, ...weekPulse.days.map((day) => day.count));
  const pulseBarsLabel = `${t('Check-ins por dia nesta semana')}: ${weekPulse.days
    .filter((day) => day.state !== 'future')
    .map((day) => `${weekdayLongFormatter.format(day.date)} ${day.count}`)
    .join(', ')}`;

  const resolveRef = useRef<HTMLElement>(null);
  const missingRef = useRef<HTMLElement>(null);
  const nearRef = useRef<HTMLElement>(null);
  const scrollToSection = (ref: React.RefObject<HTMLElement | null>) => {
    ref.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
  };

  // Botao do cartao da aula: ao vivo -> abrir; proxima aula agendada de hoje -> iniciar (como no Calendario).
  const startableClass = featuredStatus === 'soon' || featuredStatus === 'scheduled' ? featuredClass : null;

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
    const attendanceCount = lesson.currentAttendanceCount ?? 0;
    const stack = featuredRsvps.slice(0, STACK_PREVIEW_SIZE);
    const extra = rsvpCount - stack.length;
    const isLive = status === 'live';
    const canStart = lesson.id === startableClass?.id && Boolean(onStartClass || onNavigateToClasses);

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

        <button
          type="button"
          className="rd-staff__next-who"
          onClick={() => setSelectedClassId(lesson.id)}
          aria-label={rsvpCount > 0 ? t('Ver os {count} confirmados', { count: rsvpCount }) : t('Ver detalhes da aula')}
        >
          {stack.length > 0 ? (
            <span className="rd-staff__stack" aria-hidden="true">
              {stack.map((rsvp) => {
                const person = usersById.get(rsvp.userId);
                return (
                  <React.Fragment key={rsvp.id}>
                    {renderPersonAvatar(rsvp.userDisplayName, person?.photoPath)}
                  </React.Fragment>
                );
              })}
              {extra > 0 ? <span className="rd-staff__stack-more">+{extra}</span> : null}
            </span>
          ) : null}
          <span className="rd-staff__next-who-copy">
            <span className="rd-staff__next-confirmed">
              {featuredRsvpsError
                ? featuredRsvpsError
                : featuredRsvpsLoading && rsvpCount === 0
                  ? t('Carregando confirmados...')
                  : rsvpCount === 0
                    ? t('Nenhum aluno confirmou que vai nesta aula ainda.')
                    : capacity > 0
                      ? t('{count} de {capacity} confirmaram', { count: rsvpCount, capacity })
                      : formatConfirmedLabel(rsvpCount)}
            </span>
            <span className={`rd-staff__next-attendance${attendanceCount > 0 ? ' is-on' : ''}`}>
              {formatAttendanceLabel(attendanceCount)}
            </span>
          </span>
          <ChevronRight size={18} strokeWidth={2} className="rd-staff__next-who-chevron" aria-hidden="true" />
        </button>

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

        {startError && canStart ? <p className="lv-alert lv-alert--danger rd-staff__next-error" role="alert">{startError}</p> : null}

        {isLive && onNavigateToClasses ? (
          <button type="button" className="lv-btn lv-btn--primary rd-staff__next-cta" onClick={onNavigateToClasses}>
            <Radio size={18} strokeWidth={2} aria-hidden="true" />
            {t('Abrir aula ao vivo')}
          </button>
        ) : canStart ? (
          <button
            type="button"
            className="lv-btn lv-btn--primary rd-staff__next-cta"
            onClick={() => { void handleStartClass(); }}
            disabled={startingClass}
          >
            <Play size={18} strokeWidth={2} fill="currentColor" aria-hidden="true" />
            {startingClass ? t('Iniciando...') : t('Iniciar aula')}
          </button>
        ) : null}
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

  const pendingPill = pendingTotal > 0 ? (
    <button type="button" className="rd-staff__resolve-pill" onClick={() => scrollToSection(resolveRef)}>
      <span className="rd-staff__resolve-dot" aria-hidden="true" />
      {pendingTotal === 1 ? t('1 p/ resolver') : t('{count} p/ resolver', { count: pendingTotal })}
    </button>
  ) : (
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
  );

  // Lista: os NEAR_GRADUATION_SIZE mais perto; "Ver todos" abre tambem quem ja esta pronto alem deles.
  const expandedNear = nearGraduation.filter((row, index) => index < NEAR_GRADUATION_SIZE || row.remaining <= 0);
  const visibleNear = showAllNear ? expandedNear : expandedNear.slice(0, NEAR_GRADUATION_SIZE);
  const idleLabel = idleStudentsCount === 1 ? t('1 inativo') : t('{count} inativos', { count: idleStudentsCount });
  const deactivatedLabel = inactiveStudents.length === 1
    ? t('1 desativado')
    : t('{count} desativados', { count: inactiveStudents.length });

  return (
    <div className="lv-screen rd-staff">
      <ScreenHeader
        eyebrow={eyebrow}
        title={firstName ? `${t(getGreeting(now))}, ${firstName}.` : `${t(getGreeting(now))}.`}
        actions={pendingPill}
      />

      <div className="rd-staff__grid">
        <div className="rd-staff__col">
          {/* ─── Pulso da academia ─────────────────────────────────────── */}
          <section className="lv-card rd-staff__pulse" aria-label={t('Pulso da academia')}>
            <div className="rd-staff__pulse-top">
              <TickRing
                total={activeStudents.length}
                lit={trainedRecently}
                label={t('{percent}% dos alunos ativos treinaram nos últimos 7 dias', { percent: trainedPercent })}
              >
                <strong className="rd-staff__ring-value"><CountUp value={trainedPercent} suffix="%" /></strong>
              </TickRing>
              <p className="rd-staff__pulse-line">
                {activeStudents.length === 0 ? (
                  <strong>{t('Nenhum aluno ativo ainda.')}</strong>
                ) : (
                  <>
                    <strong>
                      {activeStudents.length === 1
                        ? t('{count} de 1 aluno', { count: trainedRecently })
                        : t('{count} de {total} alunos', { count: trainedRecently, total: activeStudents.length })}
                    </strong>
                    {' '}
                    <span>{t('treinaram nos últimos 7 dias')}</span>
                  </>
                )}
              </p>
            </div>

            <div className="rd-staff__bars" role="img" aria-label={pulseBarsLabel}>
              {weekPulse.days.map((day, index) => {
                const height = day.state === 'future'
                  ? 0
                  : Math.max(4, Math.round((day.count / pulseBarMax) * PULSE_BAR_MAX_HEIGHT));
                return (
                  <div key={day.date.toDateString()} className={`rd-staff__bar is-${day.state}`} aria-hidden="true">
                    <span className="rd-staff__bar-value">{day.state === 'future' ? '' : day.count}</span>
                    <span
                      className="rd-staff__bar-col"
                      style={{ '--h': `${height}px`, animationDelay: `${120 + index * 60}ms` } as React.CSSProperties}
                    />
                    <span className="rd-staff__bar-day">{weekdayNarrowFormatter.format(day.date)}</span>
                  </div>
                );
              })}
            </div>

            <p className="rd-staff__pulse-foot">
              <span><strong><CountUp value={weekPulse.today} /></strong> {t('check-ins hoje')}</span>
              <span><strong><CountUp value={weekPulse.week} /></strong> {t('na semana')}</span>
              {weekPulse.occupancy != null ? (
                <span><strong><CountUp value={weekPulse.occupancy} suffix="%" /></strong> {t('de lotação')}</span>
              ) : null}
            </p>
          </section>

          {/* ─── Tres numeros ──────────────────────────────────────────── */}
          <div className="rd-staff__trio">
            <article className="lv-card rd-staff__tile">
              {onNavigateToStudents ? (
                <button type="button" className="rd-staff__tile-main" onClick={onNavigateToStudents}>
                  <span className="rd-staff__tile-value"><CountUp value={activeStudents.length} /></span>
                  <span className="rd-staff__tile-label">{t('ativos')}</span>
                </button>
              ) : (
                <div className="rd-staff__tile-main">
                  <span className="rd-staff__tile-value"><CountUp value={activeStudents.length} /></span>
                  <span className="rd-staff__tile-label">{t('ativos')}</span>
                </div>
              )}
              <span className="rd-staff__tile-links">
                {onNavigateToStudents ? (
                  <button
                    type="button"
                    className="rd-staff__tile-link"
                    onClick={onNavigateToStudents}
                    title={t('Sem treinar há {days} dias ou mais', { days: INACTIVE_MINIMUM_DAYS })}
                  >
                    {idleLabel}
                  </button>
                ) : (
                  <span title={t('Sem treinar há {days} dias ou mais', { days: INACTIVE_MINIMUM_DAYS })}>{idleLabel}</span>
                )}
                {onNavigateToInactiveStudents ? (
                  <button type="button" className="rd-staff__tile-link" onClick={onNavigateToInactiveStudents}>
                    {deactivatedLabel}
                  </button>
                ) : (
                  <span>{deactivatedLabel}</span>
                )}
              </span>
            </article>

            <TileButton
              value={missingStudents.length}
              label={t('sumidos')}
              note={t('{days}+ dias', { days: MISSING_MINIMUM_DAYS })}
              onClick={missingStudents.length > 0 ? () => scrollToSection(missingRef) : undefined}
            />

            <TileButton
              value={readyCount}
              label={t('prontos p/ graduar')}
              note={suggestedCount > 0
                ? (suggestedCount === 1
                  ? t('1 aprovação sugerida')
                  : t('{count} aprovações sugeridas', { count: suggestedCount }))
                : undefined}
              onClick={nearGraduation.length > 0 ? () => scrollToSection(nearRef) : undefined}
            />
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

          {/* ─── Para resolver ──────────────────────────────────────────── */}
          <section ref={resolveRef} className="lv-section rd-staff__section" aria-label={pendingCopy.title}>
            <div className="lv-section__head">
              <h2 className="lv-section__title">{t('Para resolver')}</h2>
              {pendingTotal > 0 ? <span className="lv-label">{pendingTotal}</span> : null}
            </div>
            {pendingTotal > 0 ? (
              <div className="lv-card lv-card--flush rd-staff__resolve">
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
            ) : (
              <div className="lv-card rd-staff__resolve-empty">
                <p className="rd-staff__resolve-empty-title">{pendingCopy.title}</p>
                <p className="rd-staff__resolve-empty-note">{pendingCopy.note}</p>
              </div>
            )}
          </section>
        </div>

        <div className="rd-staff__col">
          {/* ─── Sumidos ──────────────────────────────────────────────────── */}
          {missingStudents.length > 0 ? (
            <section ref={missingRef} className="lv-section rd-staff__section">
              <div className="lv-section__head">
                <h2 className="lv-section__title">{t('Sumidos há {days}+ dias', { days: MISSING_MINIMUM_DAYS })}</h2>
                <span className="lv-label">{missingStudents.length}</span>
              </div>
              <div className="lv-list rd-staff__people">
                {(showAllMissing ? missingStudents : missingStudents.slice(0, MISSING_PREVIEW_SIZE)).map(({ student, days }) => {
                  const firstName = firstNameOf(student.displayName);
                  const whatsApp = buildWhatsAppLink(
                    student.phone,
                    t('E aí, {name}! Sentimos sua falta no tatame. Bora voltar a treinar essa semana?', { name: firstName }),
                  );
                  return (
                    <div key={student.id} className="rd-staff__person">
                      {renderPersonAvatar(student.displayName, student.photoPath)}
                      <button
                        type="button"
                        className="rd-staff__person-copy"
                        onClick={onOpenStudent ? () => onOpenStudent(student.id) : onNavigateToStudents}
                        disabled={!onOpenStudent && !onNavigateToStudents}
                      >
                        <span className="rd-staff__person-name">{student.displayName}</span>
                        <span className="rd-staff__person-line">{t('Não treina há {days} dias', { days })}</span>
                      </button>
                      {whatsApp ? (
                        <a className="rd-staff__wa" href={whatsApp} target="_blank" rel="noreferrer" aria-label={t('Enviar WhatsApp para {name}', { name: student.displayName })}>
                          <MessageCircle size={16} strokeWidth={2} aria-hidden="true" />
                          WhatsApp
                        </a>
                      ) : <span className="rd-staff__person-nophone">{t('Sem telefone')}</span>}
                    </div>
                  );
                })}
              </div>
              {missingStudents.length > MISSING_PREVIEW_SIZE ? (
                <button type="button" className="lv-link rd-staff__more" onClick={() => setShowAllMissing((value) => !value)}>
                  {showAllMissing ? t('Mostrar menos') : t('Ver todos ({count})', { count: missingStudents.length })}
                </button>
              ) : null}
            </section>
          ) : null}

          {/* ─── Aniversariantes ─────────────────────────────────────────── */}
          {birthdays.length > 0 ? (
            <section className="lv-section rd-staff__section">
              <div className="lv-section__head">
                <h2 className="lv-section__title">{t('Aniversariantes da semana')}</h2>
              </div>
              <div className="lv-list rd-staff__people">
                {birthdays.map(({ person, date, inDays, age }) => {
                  const firstName = firstNameOf(person.displayName);
                  const whatsApp = buildWhatsAppLink(
                    person.phone,
                    t('Parabéns, {name}! Feliz aniversário, muita saúde e muito treino. Oss!', { name: firstName }),
                  );
                  const when = inDays === 0 ? t('Hoje') : inDays === 1 ? t('Amanhã') : weekdayShortFormatter.format(date).replace(/\./g, '');
                  return (
                    <div key={person.id} className={`rd-staff__person ${inDays === 0 ? 'is-today' : ''}`.trim()}>
                      {renderPersonAvatar(person.displayName, person.photoPath)}
                      <div className="rd-staff__person-copy">
                        <span className="rd-staff__person-name">{person.displayName}</span>
                        <span className="rd-staff__person-line">
                          <Cake size={13} strokeWidth={2} aria-hidden="true" />
                          {age != null ? `${when} · ${t('{age} anos', { age })}` : when}
                        </span>
                      </div>
                      {whatsApp ? (
                        <a className="rd-staff__wa" href={whatsApp} target="_blank" rel="noreferrer" aria-label={t('Mandar parabéns para {name}', { name: person.displayName })}>
                          <MessageCircle size={16} strokeWidth={2} aria-hidden="true" />
                          {t('Parabéns')}
                        </a>
                      ) : <span className="rd-staff__person-nophone">{t('Sem telefone')}</span>}
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}

          {/* ─── Perto de graduar ───────────────────────────────────────── */}
          {nearGraduation.length > 0 ? (
            <section ref={nearRef} className="lv-section rd-staff__section">
              <div className="lv-section__head">
                <h2 className="lv-section__title">{t('Perto de graduar')}</h2>
              </div>
              <div className="rd-staff__near">
                {visibleNear.map((row) => {
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
              {expandedNear.length > NEAR_GRADUATION_SIZE ? (
                <button type="button" className="lv-link rd-staff__more" onClick={() => setShowAllNear((value) => !value)}>
                  {showAllNear ? t('Mostrar menos') : t('Ver todos ({count})', { count: expandedNear.length })}
                </button>
              ) : null}
            </section>
          ) : null}

          {/* ─── Equipe ─────────────────────────────────────────────────── */}
          {onNavigateToInstructors ? (
            <button type="button" className="lv-card rd-staff__team" onClick={onNavigateToInstructors}>
              <span className="rd-staff__team-icon" aria-hidden="true"><Users size={18} strokeWidth={2} /></span>
              <span className="rd-staff__team-copy">
                <span className="rd-staff__team-title">{t('Instrutores')} · {instructors.length}</span>
                <span className="rd-staff__team-note">{t('Equipe ativa')}</span>
              </span>
              <ChevronRight size={18} strokeWidth={2} className="rd-staff__team-chevron" aria-hidden="true" />
            </button>
          ) : (
            <div className="lv-card rd-staff__team">
              <span className="rd-staff__team-icon" aria-hidden="true"><Users size={18} strokeWidth={2} /></span>
              <span className="rd-staff__team-copy">
                <span className="rd-staff__team-title">{t('Instrutores')} · {instructors.length}</span>
                <span className="rd-staff__team-note">{t('Equipe ativa')}</span>
              </span>
            </div>
          )}

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

interface TickRingProps {
  total: number;
  lit: number;
  label: string;
  children?: React.ReactNode;
}

// Anel de tracinhos: um por aluno ativo (ate MAX_RING_TICKS; acima disso, proporcional).
const TickRing: React.FC<TickRingProps> = ({ total, lit, label, children }) => {
  const ticks = Math.min(total, MAX_RING_TICKS);
  const litTicks = total > 0 ? Math.round((Math.min(lit, total) / total) * ticks) : 0;
  const strokeWidth = ticks > 24 ? 4 : 6;
  return (
    <div className="rd-staff__ring" role="img" aria-label={label}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        {ticks === 0 ? (
          <circle cx="50" cy="50" r="42" className="rd-staff__ring-empty" />
        ) : Array.from({ length: ticks }, (_, index) => {
          const angle = ((-90 + (index * 360) / ticks) * Math.PI) / 180;
          return (
            <line
              key={index}
              className={index < litTicks ? 'is-on' : undefined}
              style={index < litTicks ? { animationDelay: `${200 + index * 60}ms` } : undefined}
              x1={(50 + 34 * Math.cos(angle)).toFixed(2)}
              y1={(50 + 34 * Math.sin(angle)).toFixed(2)}
              x2={(50 + 46 * Math.cos(angle)).toFixed(2)}
              y2={(50 + 46 * Math.sin(angle)).toFixed(2)}
              strokeWidth={strokeWidth}
            />
          );
        })}
      </svg>
      <span className="rd-staff__ring-center">{children}</span>
    </div>
  );
};

interface TileButtonProps {
  value: number;
  label: string;
  note?: string;
  onClick?: () => void;
}

const TileButton: React.FC<TileButtonProps> = ({ value, label, note, onClick }) => {
  const content = (
    <>
      <span className="rd-staff__tile-value"><CountUp value={value} /></span>
      <span className="rd-staff__tile-label">{label}</span>
      {note ? <span className="rd-staff__tile-note">{note}</span> : null}
    </>
  );
  return onClick ? (
    <button type="button" className="lv-card rd-staff__tile rd-staff__tile-main" onClick={onClick}>{content}</button>
  ) : (
    <div className="lv-card rd-staff__tile rd-staff__tile-main">{content}</div>
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
