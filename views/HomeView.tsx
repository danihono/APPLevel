import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  CircleCheck,
  Clock,
  Flame,
  MapPin,
  QrCode,
  Sparkles,
} from 'lucide-react';
import {
  beltLabel,
  getBlackBeltProgressForUser,
  getUserProgressionSummary,
  type ProgressionRules,
} from '../beltCatalog';
import BeltImage from '../components/BeltImage';
import { hasBeltImage } from '../beltImages';
import { commitmentLevelClass } from '../components/CommitmentBar';
import ScreenHeader from '../components/redesign/ScreenHeader';
import { CountUp, prefersReducedMotion } from '../components/redesign/motion';
import { hapticConfirm, hapticError } from '../services/haptics';
import MonthlyRecap from '../components/redesign/MonthlyRecap';
import { useRedesignShell } from '../components/redesign/ShellContext';
import {
  MONTH_WEEK_HEADER,
  buildMonthGrid,
  classTypeLabel,
  isClassVisibleForStudent,
  isValidTimeZone,
} from '../calendarUtils';
import type { CommitmentResult } from '../commitmentScale';
import { academyDayKey } from '../dailyTrainingUtils';
import { subscribeToClassRsvps, type FirestoreEntity } from '../services/firebase/data';
import type { AttendanceRecord, AttendanceRequestRecord, ClassRecord, ClassRsvpRecord } from '../services/firebase/models';
import {
  academyDayOffset,
  academyHour,
  classEndDate,
  computeMonthRecap,
  computeWeekTrainings,
  computeWeeklyStreak,
  isClassLive,
  nextClassForStudent,
} from '../trainingStats';
import type { User } from '../types';
import { t, getLocale } from '../i18n';
import './redesign/home.css';

export interface HomeViewProps {
  user: User;
  monthlyAttendanceCount: number;
  commitment?: CommitmentResult | null;
  attendanceDays: number[];
  progressionRules?: ProgressionRules | null;
  /** Aulas da academia (proxima aula de hoje). */
  classes?: Array<FirestoreEntity<ClassRecord>>;
  /** Presencas do proprio aluno (semana, sequencia de semanas). */
  attendances?: Array<FirestoreEntity<AttendanceRecord>>;
  /** Solicitacoes de presenca do proprio aluno. */
  attendanceRequests?: Array<FirestoreEntity<AttendanceRequestRecord>>;
  /** Fuso IANA da academia. */
  academyTimeZone?: string;
  /** Academia do aluno (lista de quem vai na proxima aula). */
  academyId?: string;
  /** Abre a tela de check-in por QR para a aula. */
  onStartCheckin?: (classId: string) => void;
  /** Confirma/cancela a ida na aula. Devolve se o aluno ficou confirmado. Sem ele o botao nao aparece. */
  onToggleRsvp?: (classId: string) => Promise<boolean>;
  onOpenEvolution?: () => void;
  onOpenClasses?: () => void;
}

const FALLBACK_TIME_ZONE = 'America/Sao_Paulo';
const EMPTY_CLASSES: Array<FirestoreEntity<ClassRecord>> = [];
const EMPTY_ATTENDANCES: Array<FirestoreEntity<AttendanceRecord>> = [];
const EMPTY_REQUESTS: Array<FirestoreEntity<AttendanceRequestRecord>> = [];

/** "seg., 5 de outubro" -> "seg, 5 de outubro" (a caixa alta vem do .lv-eyebrow). */
function formatWithoutDots(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(getLocale(), { ...options, timeZone }).format(date).replace(/\./g, '');
}

function formatClock(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(getLocale(), { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone }).format(date);
}

/** Atualiza "agora" a cada minuto (rotulo AGORA, aula que terminou, virada do dia). */
function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Relogio de 1 s so enquanto `enabled` (contagem dos ultimos minutos antes da aula). */
function useFastNow(enabled: boolean, fallback: Date): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!enabled) return undefined;
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, [enabled]);
  return enabled ? now : fallback;
}

/** Janela antes do inicio em que o check-in vira a acao principal (igual ao Calendario). */
const CHECKIN_WINDOW_MS = 30 * 60 * 1000;
/** Nos ultimos 10 min a contagem anda de segundo em segundo. */
const FINAL_COUNTDOWN_MS = 10 * 60 * 1000;
/** Duracao do voo do avatar ate a fileira de rostos (igual ao CSS). */
const RSVP_FLY_MS = 700;

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  if (ms <= FINAL_COUNTDOWN_MS) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return t('em {time}', { time: `${minutes}:${String(seconds).padStart(2, '0')}` });
  }
  const totalMinutes = Math.ceil(totalSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return t('em {minutes} min', { minutes });
  if (minutes === 0) return t('em {hours}h', { hours });
  return t('em {hours}h {minutes}min', { hours, minutes });
}

interface RsvpFly {
  dx: number;
  dy: number;
  left: number;
  top: number;
}

const HomeView: React.FC<HomeViewProps> = ({
  user,
  monthlyAttendanceCount,
  commitment = null,
  attendanceDays,
  progressionRules,
  classes = EMPTY_CLASSES,
  attendances = EMPTY_ATTENDANCES,
  attendanceRequests = EMPTY_REQUESTS,
  academyTimeZone,
  academyId,
  onStartCheckin,
  onToggleRsvp,
  onOpenEvolution,
  onOpenClasses,
}) => {
  const shell = useRedesignShell();
  const now = useNow();
  const timeZone = isValidTimeZone(academyTimeZone)
    ? academyTimeZone!
    : isValidTimeZone(shell.timeZone) ? shell.timeZone! : FALLBACK_TIME_ZONE;

  const progression = useMemo(
    () => getUserProgressionSummary(user, progressionRules),
    [progressionRules, user],
  );
  // Faixa preta: grau por tempo (padrão IBJJF) + override manual, em vez de progresso por presença.
  const blackBeltProgress = useMemo(
    () => getBlackBeltProgressForUser(user),
    [user.belt, user.lastGraduation, user.blackBeltDegreeManual],
  );

  // Dia da academia (muda a semana/aula do dia so na virada, nao a cada minuto).
  const todayKey = formatWithoutDots(now, timeZone, { year: 'numeric', month: '2-digit', day: '2-digit' });
  const weekTrainings = useMemo(
    () => computeWeekTrainings(attendances, classes, timeZone, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attendances, classes, timeZone, todayKey],
  );
  const weekStreak = useMemo(
    () => computeWeeklyStreak(attendances, classes, timeZone, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attendances, classes, timeZone, todayKey],
  );
  const nextClass = useMemo(
    () => nextClassForStudent(classes, now, timeZone, user.kidsCategory, isClassVisibleForStudent),
    [classes, now, timeZone, user.kidsCategory],
  );

  // Retrospectiva do mes anterior: aparece no Inicio nos primeiros 15 dias do mes.
  const monthRecap = useMemo(
    () => computeMonthRecap(attendances, classes, timeZone, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attendances, classes, timeZone, todayKey],
  );
  const [recapOpen, setRecapOpen] = useState(false);
  const dayOfMonth = Number(academyDayKey(now, timeZone).slice(8, 10));
  const showRecapCard = monthRecap.count > 0 && dayOfMonth <= 15;

  // Quem vai na proxima aula (lista de confirmados: qualquer aluno da academia pode ler).
  const [goers, setGoers] = useState<Array<FirestoreEntity<ClassRsvpRecord>>>([]);
  const nextClassId = nextClass?.id ?? null;
  useEffect(() => {
    if (!nextClassId || !academyId) {
      setGoers([]);
      return undefined;
    }
    return subscribeToClassRsvps(nextClassId, academyId, setGoers, () => setGoers([]));
  }, [nextClassId, academyId]);

  // "Vou" otimista: vale ate a lista de confirmados (fonte de verdade) mudar depois da resposta.
  const [rsvpOverride, setRsvpOverride] = useState<{ classId: string; rsvped: boolean } | null>(null);
  const [rsvpBusy, setRsvpBusy] = useState(false);
  const [rsvpError, setRsvpError] = useState('');
  const [rsvpFly, setRsvpFly] = useState<RsvpFly | null>(null);
  const classCardRef = useRef<HTMLElement>(null);
  const rsvpButtonRef = useRef<HTMLButtonElement>(null);
  const flyTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!rsvpBusy) setRsvpOverride(null);
    // so quando chega um snapshot novo
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goers]);
  useEffect(() => () => {
    if (flyTimerRef.current) window.clearTimeout(flyTimerRef.current);
  }, []);
  const goersHasMe = goers.some((entry) => entry.userId === user.id);
  const myRsvp = rsvpOverride && rsvpOverride.classId === nextClassId ? rsvpOverride.rsvped : goersHasMe;

  // Contagem: relogio de 1 s so nos ultimos 10 min antes da aula de hoje.
  const nextStartMs = nextClass?.scheduledStart ? nextClass.scheduledStart.toDate().getTime() : null;
  const msToStartCoarse = nextStartMs != null ? nextStartMs - now.getTime() : null;
  const fastNow = useFastNow(
    msToStartCoarse != null && msToStartCoarse > 0 && msToStartCoarse <= FINAL_COUNTDOWN_MS + 60_000,
    now,
  );

  const handleToggleRsvp = async (classId: string) => {
    if (!onToggleRsvp || rsvpBusy) return;
    const wanted = !myRsvp;
    const fromRect = rsvpButtonRef.current?.getBoundingClientRect() ?? null;
    setRsvpError('');
    setRsvpBusy(true);
    setRsvpOverride({ classId, rsvped: wanted });
    if (wanted && fromRect && !prefersReducedMotion()) {
      // Mede o rosto do aluno depois de ele entrar na fileira e voa ate la.
      window.requestAnimationFrame(() => {
        const card = classCardRef.current;
        const target = card?.querySelector<HTMLElement>('.rd-home__goer.is-me');
        if (!card || !target) return;
        const cardRect = card.getBoundingClientRect();
        const toRect = target.getBoundingClientRect();
        const left = fromRect.left + fromRect.width / 2 - cardRect.left;
        const top = fromRect.top + fromRect.height / 2 - cardRect.top;
        setRsvpFly({
          left,
          top,
          dx: toRect.left + toRect.width / 2 - cardRect.left - left,
          dy: toRect.top + toRect.height / 2 - cardRect.top - top,
        });
        if (flyTimerRef.current) window.clearTimeout(flyTimerRef.current);
        flyTimerRef.current = window.setTimeout(() => setRsvpFly(null), RSVP_FLY_MS);
      });
    }
    try {
      const rsvped = await onToggleRsvp(classId);
      setRsvpOverride({ classId, rsvped });
      hapticConfirm();
    } catch {
      setRsvpOverride(null);
      setRsvpFly(null);
      setRsvpError(wanted ? t('Não deu para confirmar. Tente de novo.') : t('Não deu para cancelar. Tente de novo.'));
      hapticError();
    } finally {
      setRsvpBusy(false);
    }
  };

  const attendedClassIds = useMemo(() => new Set(attendances.map((entry) => entry.classId)), [attendances]);
  const pendingClassIds = useMemo(
    () => new Set(attendanceRequests.filter((entry) => entry.status === 'pending').map((entry) => entry.classId)),
    [attendanceRequests],
  );

  // ─── Cabecalho ────────────────────────────────────────────────────────────
  const dateEyebrow = formatWithoutDots(now, timeZone, { weekday: 'short', day: 'numeric', month: 'long' });
  const nowHour = academyHour(now, timeZone);
  const greeting = nowHour < 12 ? t('Bom dia') : nowHour < 18 ? t('Boa tarde') : t('Boa noite');
  const firstName = (user.name || '').trim().split(/\s+/)[0];
  const greetingTitle = firstName ? `${greeting}, ${firstName}.` : `${greeting}.`;
  const streakAria = weekStreak === 1
    ? t('1 semana seguida com treino')
    : t('{count} semanas seguidas com treino', { count: weekStreak });

  // ─── Faixa ────────────────────────────────────────────────────────────────
  const beltName = blackBeltProgress
    ? (blackBeltProgress.degreeLabel ? `${blackBeltProgress.title} · ${blackBeltProgress.degreeLabel}` : t('Faixa preta lisa'))
    : `${t('Faixa {belt}', { belt: beltLabel(user.belt) })} · ${progression.currentStripes > 0
      ? t('{degree}º grau', { degree: progression.currentStripes })
      : t('Sem grau')}`;

  const beltCopy = (() => {
    if (blackBeltProgress) {
      const next = blackBeltProgress.nextDegree != null && blackBeltProgress.yearsToNextDegree != null
        ? (blackBeltProgress.yearsToNextDegree === 1
          ? t('Falta 1 ano para o {degree}º grau.', { degree: blackBeltProgress.nextDegree })
          : t('Faltam {years} anos para o {degree}º grau.', { years: blackBeltProgress.yearsToNextDegree, degree: blackBeltProgress.nextDegree }))
        : t('Grau máximo alcançado.');
      return `${blackBeltProgress.styleNote ? `${blackBeltProgress.styleNote}. ` : ''}${next}`;
    }
    if (progression.classesPerStripe === 0) {
      return t('Progressão manual: seu professor define os graus.');
    }
    if (progression.stripeRemaining != null) {
      return progression.stripeRemaining > 0
        ? t('Fecha o ciclo e a fita vira grau.')
        : t('Ciclo fechado: aguarde a avaliação do professor.');
    }
    if (progression.nextBelt && progression.beltRemaining != null) {
      const nextBelt = beltLabel(progression.nextBelt);
      if (progression.beltRemaining === 0) return t('Ciclo fechado: aguarde a avaliação do professor.');
      return progression.beltRemaining === 1
        ? t('Graus completos. Falta 1 aula para a faixa {belt}.', { belt: nextBelt })
        : t('Graus completos. Faltam {count} aulas para a faixa {belt}.', { count: progression.beltRemaining, belt: nextBelt });
    }
    return t('Grau máximo alcançado.');
  })();

  const lastGraduationDate = new Date(user.lastGraduation);
  const beltMeta = blackBeltProgress
    ? `${blackBeltProgress.title} ${t('desde')} ${blackBeltProgress.startDate.getFullYear()} · ${blackBeltProgress.years === 1 ? t('1 ano de faixa preta') : t('{years} anos de faixa preta', { years: blackBeltProgress.years })}.`
    : (Number.isNaN(lastGraduationDate.getTime())
      ? null
      : t('Última graduação em {date}.', { date: lastGraduationDate.toLocaleDateString(getLocale()) }));

  // Meta embaixo da barra: "Faltam N aulas para o Xº grau".
  const beltGoal = (() => {
    if (blackBeltProgress || progression.stripeRemaining == null) return null;
    const degree = progression.currentStripes + 1;
    if (progression.stripeRemaining <= 0) return t('Ciclo fechado: aguarde a avaliação do professor.');
    return progression.stripeRemaining === 1
      ? t('Falta 1 aula para o {degree}º grau', { degree })
      : t('Faltam {count} aulas para o {degree}º grau', { count: progression.stripeRemaining, degree });
  })();

  // Sem imagem 3D (kids, combinadas, coral/vermelha) a faixa vira uma barra baixa.
  const beltHasImage = hasBeltImage(user.belt) && (!blackBeltProgress || blackBeltProgress.style === 'preta');

  // ─── Retrospectiva ────────────────────────────────────────────────────────
  const recapMonthName = (() => {
    const [year, month] = monthRecap.monthKey.split('-').map(Number);
    return new Intl.DateTimeFormat(getLocale(), { month: 'long' }).format(new Date(year, month - 1, 15));
  })();
  const recapAchievement = (() => {
    if (Number.isNaN(lastGraduationDate.getTime())) return null;
    if (academyDayKey(lastGraduationDate, timeZone).slice(0, 7) !== monthRecap.monthKey) return null;
    return {
      title: beltName,
      detail: t('Recebido em {date}.', { date: lastGraduationDate.toLocaleDateString(getLocale()) }),
    };
  })();

  // ─── Quem vai ─────────────────────────────────────────────────────────────
  const renderGoers = () => {
    const others = goers.filter((entry) => entry.userId !== user.id);
    const mine = myRsvp
      ? (goers.find((entry) => entry.userId === user.id) ?? { id: 'me', userId: user.id, userDisplayName: user.name } as FirestoreEntity<ClassRsvpRecord>)
      : undefined;
    if (!mine && others.length === 0) return null;
    const firstName = (name: string) => (name || '').trim().split(/\s+/)[0] || t('Aluno');
    const names = [...(mine ? [t('Você')] : []), ...others.map((entry) => firstName(entry.userDisplayName))];
    const rest = names.length - 2;
    const text = names.length === 1
      ? (mine ? t('Você vai') : t('{name} vai', { name: names[0] }))
      : names.length === 2
        ? t('{a} e {b} vão', { a: names[0], b: names[1] })
        : rest === 1
          ? t('{a}, {b} e mais 1 vão', { a: names[0], b: names[1] })
          : t('{a}, {b} e mais {count} vão', { a: names[0], b: names[1], count: rest });
    const shown = [...(mine ? [mine] : []), ...others].slice(0, 4);
    return (
      <div className="rd-home__goers">
        <span className="rd-home__goers-faces" aria-hidden="true">
          {shown.map((entry) => (
            <span
              key={entry.id}
              className={`rd-home__goer${entry.userId === user.id ? ' is-me' : ''}${entry.userId === user.id && rsvpFly ? ' is-arriving' : ''}`}
            >
              {(entry.userDisplayName || '?').trim().charAt(0).toLocaleUpperCase()}
            </span>
          ))}
        </span>
        <span className="rd-home__goers-text">{text}</span>
      </div>
    );
  };

  // ─── Proxima aula ─────────────────────────────────────────────────────────
  const renderNextClass = () => {
    const goToClasses = onOpenClasses ? (
      <button type="button" className="lv-btn lv-btn--block rd-home__ghost-btn" onClick={onOpenClasses}>
        <CalendarDays size={18} strokeWidth={2} />
        {t('Ver aulas')}
      </button>
    ) : null;

    if (!nextClass) {
      return (
        <section className="lv-card lv-card--dashed rd-home__empty" aria-label={t('Próxima aula')}>
          <span className="lv-label">{t('Próxima aula')}</span>
          <p className="lv-title-md">{t('Nenhuma aula marcada por enquanto.')}</p>
          {onOpenClasses ? (
            <button type="button" className="lv-link" onClick={onOpenClasses}>
              {t('Ver aulas')}
            </button>
          ) : null}
        </section>
      );
    }

    const start = nextClass.scheduledStart!.toDate();
    const end = classEndDate(nextClass);
    const dayOffset = academyDayOffset(start, now, timeZone);
    const live = isClassLive(nextClass, now);
    const isToday = dayOffset <= 0 || live;
    const hour = academyHour(start, timeZone);

    let eyebrow: string;
    if (live) {
      eyebrow = t('Agora');
    } else if (isToday) {
      eyebrow = hour < 12 ? t('Hoje de manhã') : hour < 18 ? t('Hoje à tarde') : t('Hoje à noite');
    } else if (dayOffset === 1) {
      eyebrow = t('Amanhã');
    } else if (dayOffset < 7) {
      eyebrow = formatWithoutDots(start, timeZone, { weekday: 'short' });
    } else {
      eyebrow = formatWithoutDots(start, timeZone, { weekday: 'short', day: 'numeric', month: 'short' });
    }

    const typeLabel = classTypeLabel(nextClass.description) ?? nextClass.title;
    const attended = attendedClassIds.has(nextClass.id);
    const pending = !attended && pendingClassIds.has(nextClass.id);
    const msToStart = start.getTime() - fastNow.getTime();
    const countdown = isToday && !live && msToStart > 0 ? formatCountdown(msToStart) : null;
    const finalMinutes = countdown != null && msToStart <= FINAL_COUNTDOWN_MS;
    const checkinFirst = live || (isToday && msToStart <= CHECKIN_WINDOW_MS);
    const canRsvp = Boolean(onToggleRsvp) && !live && msToStart > 0 && nextClass.status === 'scheduled';
    const capacity = nextClass.capacity ?? 0;
    const confirmedCount = Math.max(goers.length, nextClass.rsvpCount ?? 0);
    const isFull = capacity > 0 && confirmedCount >= capacity && !myRsvp;
    const trainingNumber = Math.max(user.attendanceCount ?? 0, 1);

    const rsvpButton = (primary: boolean) => (
      <button
        ref={rsvpButtonRef}
        type="button"
        className={primary
          ? 'lv-btn lv-btn--primary lv-btn--block rd-home__rsvp'
          : 'lv-btn lv-btn--block rd-home__ghost-btn rd-home__rsvp'}
        onClick={() => void handleToggleRsvp(nextClass.id)}
        disabled={rsvpBusy}
        aria-pressed={myRsvp}
      >
        {myRsvp ? t('Cancelar ida') : t('Confirmar ida')}
      </button>
    );
    const checkinButton = onStartCheckin ? (
      <button type="button" className="lv-btn lv-btn--primary lv-btn--block" onClick={() => onStartCheckin(nextClass.id)}>
        <QrCode size={20} strokeWidth={2} />
        {t('Fazer check-in')}
      </button>
    ) : null;
    const youGo = myRsvp ? (
      <p className="rd-home__rsvp-state" role="status">
        <CircleCheck size={16} strokeWidth={2.2} aria-hidden="true" />
        {t('Você vai')}
        {canRsvp ? (
          <button type="button" className="rd-home__inline-link" onClick={() => void handleToggleRsvp(nextClass.id)} disabled={rsvpBusy}>
            {t('Cancelar ida')}
          </button>
        ) : null}
      </p>
    ) : null;

    let action: React.ReactNode = null;
    if (attended) {
      action = (
        <div className="rd-home__class-state rd-home__class-state--done" role="status">
          <CircleCheck size={20} strokeWidth={2} />
          {t('{count}º treino · Presença registrada', { count: trainingNumber })}
        </div>
      );
    } else if (pending) {
      action = (
        <div className="rd-home__class-state rd-home__class-state--pending" role="status">
          <Clock size={20} strokeWidth={2} />
          {t('Solicitação pendente')}
        </div>
      );
    } else if (checkinFirst) {
      // Na janela do check-in: o QR vira a acao principal; a ida fica como texto.
      action = (
        <>
          {youGo}
          {checkinButton}
          {!myRsvp && canRsvp ? (
            <button type="button" className="rd-home__more-link" onClick={() => void handleToggleRsvp(nextClass.id)} disabled={rsvpBusy}>
              {t('Confirmar ida')}
            </button>
          ) : null}
        </>
      );
    } else if (canRsvp) {
      action = (
        <>
          {myRsvp ? youGo : rsvpButton(true)}
          {isToday && onStartCheckin ? (
            <button type="button" className="rd-home__more-link" onClick={() => onStartCheckin(nextClass.id)}>
              {t('Já está no tatame? Fazer check-in')}
            </button>
          ) : onOpenClasses ? (
            <button type="button" className="rd-home__more-link" onClick={onOpenClasses}>{t('Ver aulas')} ›</button>
          ) : null}
        </>
      );
    } else if (!isToday) {
      action = goToClasses;
    } else {
      action = checkinButton;
    }

    return (
      <section ref={classCardRef} className="lv-card lv-card--ink rd-home__class" aria-label={t('Próxima aula')}>
        <div className="rd-home__class-top">
          <span className="lv-eyebrow">
            {live ? <span className="lv-live-dot" aria-hidden="true" style={{ marginRight: 8 }} /> : null}
            {eyebrow}
          </span>
          {countdown ? (
            <span className={`rd-home__countdown${finalMinutes ? ' is-final' : ''}`} aria-live={finalMinutes ? 'off' : 'polite'}>
              {countdown}
            </span>
          ) : (
            <span className="lv-stripes" aria-hidden="true"><i /><i /><i /><i /></span>
          )}
        </div>
        <p className="rd-home__class-time">{formatClock(start, timeZone)}</p>
        <div className="rd-home__class-row">
          <p className="rd-home__class-type">
            {typeLabel}
            {end ? <> <small>{t('até {time}', { time: formatClock(end, timeZone) })}</small></> : null}
          </p>
          <div className="rd-home__class-who">
            {nextClass.professorName ? <span>{nextClass.professorName}</span> : null}
            <span>{nextClass.tatame || t('Tatame principal')}</span>
          </div>
        </div>
        {renderGoers()}
        {isFull && !attended && !pending ? (
          <p className="rd-home__full-note" role="status">
            {t('Aula lotada')}
            {onOpenClasses ? (
              <button type="button" className="rd-home__inline-link" onClick={onOpenClasses}>{t('Ver outras aulas')}</button>
            ) : null}
          </p>
        ) : null}
        {action}
        {rsvpError ? <p className="rd-home__rsvp-error" role="alert">{rsvpError}</p> : null}
        {rsvpFly ? (
          <span
            className="rd-home__fly"
            aria-hidden="true"
            style={{
              left: rsvpFly.left,
              top: rsvpFly.top,
              ['--fly-dx' as string]: `${rsvpFly.dx}px`,
              ['--fly-dy' as string]: `${rsvpFly.dy}px`,
            } as React.CSSProperties}
          >
            {(user.name || '?').trim().charAt(0).toLocaleUpperCase()}
          </span>
        ) : null}
      </section>
    );
  };

  // ─── Mes (mesmo relogio do App: attendanceDays sai do mes do aparelho) ───
  const deviceToday = new Date();
  const monthCells = buildMonthGrid(deviceToday.getFullYear(), deviceToday.getMonth());
  const attendedDays = new Set(attendanceDays);
  const monthTitle = (() => {
    const name = new Intl.DateTimeFormat(getLocale(), { month: 'long' }).format(deviceToday);
    return name.charAt(0).toLocaleUpperCase() + name.slice(1);
  })();

  return (
    <div className="lv-screen rd-home">
      <ScreenHeader eyebrow={dateEyebrow} title={greetingTitle} />

      {shell.unitLabel ? (
        <div className="rd-home__chips">
          {shell.onUnitClick ? (
            <button type="button" className="rd-home__chip rd-home__chip--button" onClick={shell.onUnitClick} aria-label={`${t('Trocar unidade')}: ${shell.unitLabel}`}>
              <MapPin size={14} strokeWidth={2} aria-hidden="true" />
              <span>{shell.unitLabel}</span>
              <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
            </button>
          ) : (
            <span className="rd-home__chip">
              <MapPin size={14} strokeWidth={2} aria-hidden="true" />
              <span>{shell.unitLabel}</span>
            </span>
          )}
        </div>
      ) : null}

      <div className="rd-home__primary lv-cascade">
        {showRecapCard ? (
          <button type="button" className="lv-card rd-home__recap" onClick={() => setRecapOpen(true)}>
            <span className="rd-home__recap-icon" aria-hidden="true"><Sparkles size={20} strokeWidth={2} /></span>
            <span className="rd-home__recap-text">
              <span className="rd-home__recap-kicker">{t('Retrospectiva')}</span>
              <strong>{t('Seu {month} na LEVEL está pronto.', { month: recapMonthName })}</strong>
            </span>
            <ArrowRight size={18} strokeWidth={2} aria-hidden="true" />
          </button>
        ) : null}
        <section className="lv-card rd-home__belt-card" aria-label={beltName}>
          <div className={`rd-home__belt${beltHasImage ? '' : ' rd-home__belt--bar'}`}>
            <BeltImage
              belt={user.belt}
              stripes={blackBeltProgress ? blackBeltProgress.degree : progression.currentStripes}
              maxStripes={blackBeltProgress ? undefined : progression.currentRule.maxStripes}
              blackBelt={blackBeltProgress}
              variant="amarrada"
              alt={beltName}
            />
          </div>

          <div className="rd-home__belt-row">
            <div className="rd-home__belt-info">
              <p className="rd-home__belt-name">{beltName}</p>
              <p className="rd-home__belt-copy">{beltCopy}</p>
              {blackBeltProgress && beltMeta ? <p className="rd-home__belt-meta">{beltMeta}</p> : null}
            </div>
            {onOpenEvolution ? (
              <button type="button" className="lv-icon-btn rd-home__arrow" onClick={onOpenEvolution} aria-label={t('Ver evolução')}>
                <ArrowRight size={20} strokeWidth={2} />
              </button>
            ) : null}
          </div>

          {!blackBeltProgress && progression.stripeCycleTotal > 0 ? (
            <div className="rd-home__belt-goal">
              <div
                className="lv-progress rd-home__belt-progress"
                role="progressbar"
                aria-label={t('Próximo grau')}
                aria-valuemin={0}
                aria-valuemax={progression.stripeCycleTotal}
                aria-valuenow={Math.min(progression.stripeCycleProgress, progression.stripeCycleTotal)}
              >
                <span style={{ width: `${Math.min(100, (progression.stripeCycleProgress / progression.stripeCycleTotal) * 100)}%` }} />
              </div>
              {beltGoal ? <p className="rd-home__belt-goal-text">{beltGoal}</p> : null}
            </div>
          ) : null}
        </section>

        {renderNextClass()}

        <div className="rd-home__stats">
          <div className="lv-card rd-home__stat">
            <span className="rd-home__stat-label">{t('Treinos na semana')}</span>
            <strong className="rd-home__stat-value"><CountUp value={weekTrainings} /></strong>
          </div>
          <div className="lv-card rd-home__stat" role="group" aria-label={streakAria}>
            <span className="rd-home__stat-label"><Flame size={13} strokeWidth={2.2} aria-hidden="true" />{t('Sequência')}</span>
            <strong className="rd-home__stat-value">
              <CountUp value={weekStreak} /><small>{weekStreak === 1 ? t('semana') : t('semanas')}</small>
            </strong>
          </div>
          {commitment ? (
            <div className={`lv-card rd-home__stat commitment ${commitmentLevelClass(commitment.level)}`}>
              <span className="rd-home__stat-label">{t('Comprometimento')}</span>
              <strong className="rd-home__stat-value rd-home__stat-value--commit"><CountUp value={commitment.score} /></strong>
            </div>
          ) : (
            <div className="lv-card rd-home__stat">
              <span className="rd-home__stat-label">{t('Treinos no mês')}</span>
              <strong className="rd-home__stat-value"><CountUp value={monthlyAttendanceCount} /></strong>
            </div>
          )}
        </div>

        <section className="lv-card rd-home__month" aria-labelledby="rd-home-month-title">
          <div className="rd-home__month-head">
            <h2 id="rd-home-month-title" className="rd-home__month-title">{monthTitle}</h2>
            <span className="rd-home__month-count">
              {monthlyAttendanceCount === 1 ? t('1 treino') : t('{count} treinos', { count: monthlyAttendanceCount })}
            </span>
          </div>
          <div className="rd-home__dots" role="list" aria-label={t('Mapa de presenças do mês')}>
            {MONTH_WEEK_HEADER.map((label) => (
              <span key={label} className="rd-home__dots-head" aria-hidden="true">{t(label)}</span>
            ))}
            {monthCells.map((cell, index) => {
              if (!cell) {
                return <span key={`pad-${index}`} className="rd-home__dot rd-home__dot--pad" aria-hidden="true" />;
              }
              const day = cell.getDate();
              const trained = attendedDays.has(day);
              const isToday = day === deviceToday.getDate();
              const isFuture = day > deviceToday.getDate();
              return (
                <span
                  key={day}
                  role="listitem"
                  className={`rd-home__dot${trained ? ' is-trained' : ''}${isToday ? ' is-today' : ''}${isFuture ? ' is-future' : ''}`}
                  aria-label={trained ? `${day} · ${t('Treinou')}` : String(day)}
                >
                  {day}
                </span>
              );
            })}
          </div>
        </section>
      </div>

      {recapOpen ? (
        <MonthlyRecap
          recap={monthRecap}
          streak={weekStreak}
          name={user.name || ''}
          unitLabel={shell.unitLabel}
          belt={user.belt}
          stripes={blackBeltProgress ? blackBeltProgress.degree : progression.currentStripes}
          maxStripes={blackBeltProgress ? undefined : progression.currentRule.maxStripes}
          achievement={recapAchievement}
          onClose={() => setRecapOpen(false)}
        />
      ) : null}

    </div>
  );
};

export default HomeView;
