import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  ChevronDown,
  CircleCheck,
  Clock,
  Flame,
  MapPin,
} from 'lucide-react';
import {
  beltLabel,
  getBlackBeltProgressForUser,
  getUserProgressionSummary,
  type ProgressionRules,
} from '../beltCatalog';
import BeltImage from '../components/BeltImage';
import { hasBeltImage } from '../beltImages';
import { CommitmentBar } from '../components/CommitmentBar';
import ScreenHeader from '../components/redesign/ScreenHeader';
import { useRedesignShell } from '../components/redesign/ShellContext';
import {
  MONTH_WEEK_HEADER,
  buildMonthGrid,
  classTypeLabel,
  isClassVisibleForStudent,
  isValidTimeZone,
} from '../calendarUtils';
import type { CommitmentResult } from '../commitmentScale';
import type { FirestoreEntity } from '../services/firebase/data';
import type { AttendanceRecord, AttendanceRequestRecord, ClassRecord } from '../services/firebase/models';
import {
  academyDayOffset,
  academyHour,
  classEndDate,
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
  /** Abre a tela de check-in por QR para a aula. */
  onStartCheckin?: (classId: string) => void;
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
  onStartCheckin,
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

  const attendedClassIds = useMemo(() => new Set(attendances.map((entry) => entry.classId)), [attendances]);
  const pendingClassIds = useMemo(
    () => new Set(attendanceRequests.filter((entry) => entry.status === 'pending').map((entry) => entry.classId)),
    [attendanceRequests],
  );

  // ─── Cabecalho ────────────────────────────────────────────────────────────
  const dateEyebrow = formatWithoutDots(now, timeZone, { weekday: 'short', day: 'numeric', month: 'long' });
  const streakLabel = weekStreak === 1 ? t('1 semana') : t('{count} semanas', { count: weekStreak });
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

  // Sem imagem 3D (kids, combinadas, coral/vermelha) a faixa vira uma barra baixa.
  const beltHasImage = hasBeltImage(user.belt) && (!blackBeltProgress || blackBeltProgress.style === 'preta');

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

    let action: React.ReactNode = null;
    if (!isToday) {
      action = goToClasses;
    } else if (attended) {
      action = (
        <div className="rd-home__class-state rd-home__class-state--done" role="status">
          <CircleCheck size={20} strokeWidth={2} />
          {t('Presença registrada')}
        </div>
      );
    } else if (pending) {
      action = (
        <div className="rd-home__class-state rd-home__class-state--pending" role="status">
          <Clock size={20} strokeWidth={2} />
          {t('Solicitação pendente')}
        </div>
      );
    } else if (onStartCheckin) {
      action = (
        <button type="button" className="lv-btn lv-btn--primary lv-btn--block" onClick={() => onStartCheckin(nextClass.id)}>
          <CircleCheck size={20} strokeWidth={2} />
          {t('Fazer check-in')}
        </button>
      );
    }

    return (
      <section className="lv-card lv-card--ink rd-home__class" aria-label={t('Próxima aula')}>
        <div className="rd-home__class-top">
          <span className="lv-eyebrow">
            {live ? <span className="lv-live-dot" aria-hidden="true" style={{ marginRight: 8 }} /> : null}
            {eyebrow}
          </span>
          <span className="lv-stripes" aria-hidden="true"><i /><i /><i /><i /></span>
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
        {action}
      </section>
    );
  };

  // ─── Mes ─────────────────────────────────────────────────────────────────
  // Mesmo relogio do App (attendanceDays sai do mes do aparelho).
  const deviceToday = new Date();
  const monthCells = buildMonthGrid(deviceToday.getFullYear(), deviceToday.getMonth());
  const attendedDays = new Set(attendanceDays);

  const renderProgress = (label: string, current: number, total: number) => {
    const safeTotal = total <= 0 ? 1 : total;
    const percentage = Math.min((current / safeTotal) * 100, 100);
    return (
      <div className="rd-home__progress-item">
        <div className="rd-home__progress-head">
          <span>{label}</span>
          <strong>{t('{current} de {total} aulas', { current, total })}</strong>
        </div>
        <div
          className="lv-progress"
          role="progressbar"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={Math.min(current, total)}
        >
          <span style={{ width: `${percentage}%` }} />
        </div>
      </div>
    );
  };

  return (
    <div className="lv-screen rd-home">
      <ScreenHeader
        eyebrow={dateEyebrow}
        title={t('Sua semana até aqui.')}
        actions={weekStreak > 0 ? (
          <span className="rd-home__streak" role="img" aria-label={streakAria}>
            <Flame size={18} strokeWidth={2} aria-hidden="true" />
            <span aria-hidden="true">{streakLabel}</span>
          </span>
        ) : null}
      />

      {shell.unitLabel ? (
        shell.onUnitClick ? (
          <button type="button" className="rd-home__unit" onClick={shell.onUnitClick} aria-label={`${t('Trocar unidade')}: ${shell.unitLabel}`}>
            <MapPin size={14} strokeWidth={2} aria-hidden="true" />
            <span>{shell.unitLabel}</span>
            <ChevronDown size={14} strokeWidth={2} aria-hidden="true" />
          </button>
        ) : (
          <span className="rd-home__unit">
            <MapPin size={14} strokeWidth={2} aria-hidden="true" />
            <span>{shell.unitLabel}</span>
          </span>
        )
      ) : null}

      <div className="rd-home__primary">
        <div className="rd-home__hero">
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
          <div className="rd-home__week">
            <span className="rd-home__week-count">{weekTrainings}</span>
            <span className="rd-home__week-label">
              {weekTrainings === 1 ? t('treino costurado') : t('treinos costurados')}
            </span>
          </div>
        </div>

        <div className="rd-home__belt-row">
          <div className="rd-home__belt-info">
            <p className="rd-home__belt-name">{beltName}</p>
            <p className="rd-home__belt-copy">{beltCopy}</p>
            {beltMeta ? <p className="rd-home__belt-meta">{beltMeta}</p> : null}
          </div>
          {onOpenEvolution ? (
            <button type="button" className="lv-icon-btn rd-home__arrow" onClick={onOpenEvolution} aria-label={t('Ver evolução')}>
              <ArrowRight size={22} strokeWidth={2} />
            </button>
          ) : null}
        </div>

        {renderNextClass()}
      </div>

      <div className="rd-home__secondary">
        {!blackBeltProgress ? (
          <section className="lv-section">
            <div className="lv-section__head">
              <h2 className="lv-section__title">{t('Progresso de faixa e grau')}</h2>
              <span className="lv-label">{t('Minha jornada')}</span>
            </div>
            <div className="lv-card rd-home__progress">
              {renderProgress(t('Próximo grau'), progression.stripeCycleProgress, progression.stripeCycleTotal)}
              {renderProgress(t('Próxima faixa'), progression.beltProgress, progression.beltTotal)}
            </div>
          </section>
        ) : null}

        <section className="lv-section">
          <div className="lv-section__head">
            <h2 className="lv-section__title">{t('Seu mês')}</h2>
            <span className="lv-label">{t('Frequência mensal')}</span>
          </div>

          {commitment ? (
            <div className="lv-card">
              <CommitmentBar commitment={commitment} title={t('Comprometimento')} />
            </div>
          ) : null}

          <div className="lv-card rd-home__month">
            <span className="lv-label">{t('Mapa de presenças do mês')}</span>
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
            <div className="rd-home__month-total">
              <span>{t('Total de treinos no mês')}</span>
              <strong>{monthlyAttendanceCount}</strong>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default HomeView;
