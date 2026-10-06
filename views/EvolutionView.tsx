import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Bell, ChevronLeft, ChevronRight } from 'lucide-react';
import type { FirestoreEntity } from '../services/firebase/data';
import { subscribeToUserClassRsvps } from '../services/firebase/data';
import type {
  AttendanceRecord,
  AttendanceRequestRecord,
  ClassRecord,
  ClassRsvpRecord,
  GraduationRecord,
} from '../services/firebase/models';
import { beltLabel, isBlackBelt, normalizeBeltId } from '../beltCatalog';
import { buildMonthGrid, isClassVisibleForStudent } from '../calendarUtils';
import { resolveAttendanceDate } from '../attendanceUtils';
import { academyDayKey } from '../dailyTrainingUtils';
import { nonCountingReasonLabel } from '../classRules';
import BeltImage from '../components/BeltImage';
import { useRedesignShell } from '../components/redesign/ShellContext';
import { t, createDateFormatter } from '../i18n';
import GraduationView, { useGraduationProgression, type GraduationViewProps } from './GraduationView';
import CompetitionView, { type CompetitionViewProps } from './CompetitionView';
import './redesign/evolution.css';

export type EvolutionSegment = 'graduation' | 'competition';

export interface EvolutionViewProps {
  initialSegment?: EvolutionSegment;
  graduation: GraduationViewProps;
  competition: CompetitionViewProps;
  /** Presencas do proprio aluno (calendario do mes). */
  attendances: Array<FirestoreEntity<AttendanceRecord>>;
  /** Solicitacoes de presenca do proprio aluno. */
  attendanceRequests: Array<FirestoreEntity<AttendanceRequestRecord>>;
  /** Aulas da academia. */
  classes: Array<FirestoreEntity<ClassRecord>>;
  academyTimeZone?: string;
  /**
   * Confirmacoes de ida (RSVP) do proprio aluno. Opcional: sem ela a tela assina
   * class_rsvps (academyId + userId) sozinha. Alimenta o estado "Faltou".
   */
  classRsvps?: Array<FirestoreEntity<ClassRsvpRecord>>;
}

// ─── Formatadores (sem t(): idioma resolvido a cada chamada) ─────────────────
const monthFormatter = createDateFormatter({ month: 'long' });
const weekdayFormatter = createDateFormatter({ weekday: 'narrow' });
const fullDayFormatter = createDateFormatter({ weekday: 'long', day: 'numeric', month: 'long' });
const shortDateFormatter = createDateFormatter({ day: '2-digit', month: '2-digit', year: 'numeric' });
const timeFormatter = createDateFormatter({ hour: '2-digit', minute: '2-digit' });

const pad2 = (value: number) => String(value).padStart(2, '0');
const localKey = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const capitalize = (value: string) => (value ? value.charAt(0).toLocaleUpperCase() + value.slice(1) : value);
const tsToDate = (value?: { toDate: () => Date } | null): Date | null => {
  if (!value) return null;
  const date = value.toDate();
  return Number.isNaN(date.getTime()) ? null : date;
};

// Duracao assumida quando a aula nao tem horario de fim (para decidir se ja passou).
const DEFAULT_CLASS_MS = 60 * 60 * 1000;

type RingState = 'trained' | 'partial' | 'missed';
type DayEntryKind = 'counted' | 'not-counted' | 'pending' | 'missed' | 'scheduled';

interface DayEntry {
  id: string;
  kind: DayEntryKind;
  title: string;
  time: Date | null;
  reason?: string | null;
}

interface DayInfo {
  counted: boolean;
  participated: boolean;
  pending: boolean;
  missed: boolean;
  hasClass: boolean;
  entries: DayEntry[];
}

function ringStateOf(info?: DayInfo): RingState | null {
  if (!info) return null;
  // Prioridade no dia: Treinou > Presenca (nao computada / pendente) > Faltou.
  if (info.counted) return 'trained';
  if (info.participated || info.pending) return 'partial';
  if (info.missed) return 'missed';
  return null;
}

/**
 * Estados do calendario por dia (chave YYYY-MM-DD no fuso da academia):
 * - Treinou: ao menos uma presenca que conta (countsAsAttendance !== false);
 * - Presenca: esteve no tatame mas nada computou, ou tem solicitacao pendente;
 * - Faltou: confirmou ida (RSVP) numa aula que ja terminou, sem presenca nem solicitacao.
 */
function buildDayMap(params: {
  attendances: Array<FirestoreEntity<AttendanceRecord>>;
  attendanceRequests: Array<FirestoreEntity<AttendanceRequestRecord>>;
  classes: Array<FirestoreEntity<ClassRecord>>;
  rsvps: Array<FirestoreEntity<ClassRsvpRecord>>;
  timeZone: string;
  kidsCategory?: Parameters<typeof isClassVisibleForStudent>[1];
  now: number;
  fallbackClassTitle: string;
}): Map<string, DayInfo> {
  const { attendances, attendanceRequests, classes, rsvps, timeZone, kidsCategory, now, fallbackClassTitle } = params;
  const days = new Map<string, DayInfo>();
  const classById = new Map(classes.map((lesson) => [lesson.id, lesson]));
  const dayOf = (key: string) => {
    let info = days.get(key);
    if (!info) {
      info = { counted: false, participated: false, pending: false, missed: false, hasClass: false, entries: [] };
      days.set(key, info);
    }
    return info;
  };

  const handledClassIds = new Set<string>();

  for (const attendance of attendances) {
    const lesson = classById.get(attendance.classId);
    const date = resolveAttendanceDate(attendance, lesson?.scheduledStart);
    const key = attendance.classDayKey || (date ? academyDayKey(date, timeZone) : null);
    if (!key) continue;
    handledClassIds.add(attendance.classId);
    const counts = attendance.countsAsAttendance !== false;
    const info = dayOf(key);
    if (counts) info.counted = true;
    else info.participated = true;
    info.entries.push({
      id: `a-${attendance.id}`,
      kind: counts ? 'counted' : 'not-counted',
      title: lesson?.title || fallbackClassTitle,
      time: date,
      reason: counts ? null : nonCountingReasonLabel(attendance.nonCountingReason),
    });
  }

  for (const request of attendanceRequests) {
    if (request.status === 'approved') {
      handledClassIds.add(request.classId);
      continue;
    }
    if (request.status !== 'pending') continue;
    if (attendances.some((item) => item.classId === request.classId)) continue;
    handledClassIds.add(request.classId);
    const lesson = classById.get(request.classId);
    const date = tsToDate(lesson?.scheduledStart) ?? tsToDate(request.requestedAt) ?? tsToDate(request.createdAt);
    if (!date) continue;
    const info = dayOf(academyDayKey(date, timeZone));
    info.pending = true;
    info.entries.push({
      id: `r-${request.id}`,
      kind: 'pending',
      title: request.classTitle || lesson?.title || fallbackClassTitle,
      time: date,
    });
  }

  for (const rsvp of rsvps) {
    if (handledClassIds.has(rsvp.classId)) continue;
    const lesson = classById.get(rsvp.classId);
    // Aula excluida ou cancelada nao vira falta.
    if (!lesson || lesson.status === 'cancelled') continue;
    const start = tsToDate(lesson.scheduledStart) ?? tsToDate(rsvp.scheduledStart);
    if (!start) continue;
    const end = tsToDate(lesson.scheduledEnd)?.getTime() ?? start.getTime() + DEFAULT_CLASS_MS;
    if (end > now) continue;
    handledClassIds.add(rsvp.classId);
    const info = dayOf(academyDayKey(start, timeZone));
    info.missed = true;
    info.entries.push({ id: `m-${rsvp.id}`, kind: 'missed', title: lesson.title || fallbackClassTitle, time: start });
  }

  for (const lesson of classes) {
    if (lesson.status === 'cancelled') continue;
    if (!isClassVisibleForStudent(lesson.description, kidsCategory)) continue;
    const start = tsToDate(lesson.scheduledStart);
    if (!start) continue;
    const info = dayOf(academyDayKey(start, timeZone));
    info.hasClass = true;
    if (!handledClassIds.has(lesson.id)) {
      info.entries.push({ id: `c-${lesson.id}`, kind: 'scheduled', title: lesson.title || fallbackClassTitle, time: start });
    }
  }

  for (const info of days.values()) {
    info.entries.sort((left, right) => (left.time?.getTime() ?? 0) - (right.time?.getTime() ?? 0));
  }

  return days;
}

interface TimelineNode {
  key: string;
  belt: string;
  stripes: number;
  date: Date | null;
  label: string;
  current: boolean;
}

// ─── Bloco amarelo: "Mais N aulas. Voce chega la." ──────────────────────────
interface HeroCopy {
  headline: string[];
  giant: string | null;
  caption: string;
  aria: string;
  showNextBelt: boolean;
  foot?: string;
}

const EvolutionView: React.FC<EvolutionViewProps> = ({
  initialSegment = 'graduation',
  graduation,
  competition,
  attendances,
  attendanceRequests,
  classes,
  academyTimeZone,
  classRsvps,
}) => {
  const shell = useRedesignShell();
  const [segment, setSegment] = useState<EvolutionSegment>(initialSegment);
  const { user, profile, academy, graduations } = graduation;
  const { progression, blackBelt, examWindow } = useGraduationProgression({ user, profile, academy });
  const timeZone = academyTimeZone || academy.timezone || 'America/Sao_Paulo';

  // RSVPs do proprio aluno ("Faltou"). Se o App nao passar, a tela assina sozinha.
  const [ownRsvps, setOwnRsvps] = useState<Array<FirestoreEntity<ClassRsvpRecord>>>([]);
  const academyId = academy.id;
  const userId = profile.id || user.id;
  useEffect(() => {
    if (classRsvps || !academyId || !userId) return undefined;
    try {
      return subscribeToUserClassRsvps(academyId, userId, setOwnRsvps, () => setOwnRsvps([]));
    } catch {
      return undefined;
    }
  }, [academyId, classRsvps, userId]);
  const rsvps = classRsvps ?? ownRsvps;

  // ─── Hero ────────────────────────────────────────────────────────────────
  const hero = useMemo<HeroCopy>(() => {
    const ready = (caption: string): HeroCopy => ({
      headline: [t('Ciclo fechado.'), t('Agora é com o professor.')],
      giant: '0',
      caption,
      aria: caption,
      showNextBelt: false,
    });

    if (blackBelt) {
      const foot = blackBelt.years === 1
        ? t('1 ano de faixa preta')
        : t('{years} anos de faixa preta', { years: blackBelt.years });
      if (blackBelt.nextDegree == null || blackBelt.yearsToNextDegree == null) {
        return {
          headline: [t('Grau máximo alcançado.')],
          giant: String(blackBelt.degree),
          caption: blackBelt.label,
          aria: `${t('Grau máximo alcançado.')} ${blackBelt.label}`,
          showNextBelt: false,
          foot,
        };
      }
      const years = blackBelt.yearsToNextDegree;
      const grade = blackBelt.nextDegree;
      if (years <= 0) {
        return { ...ready(t('Tempo cumprido para o {grade}º grau.', { grade })), foot };
      }
      return {
        headline: [years === 1 ? t('Mais 1 ano.') : t('Mais {count} anos.', { count: years }), t('Você chega lá.')],
        giant: String(years),
        caption: years === 1 ? t('ano pro {grade}º grau', { grade }) : t('anos pro {grade}º grau', { grade, count: years }),
        aria: years === 1
          ? t('Falta 1 ano para o {degree}º grau.', { degree: grade })
          : t('Faltam {years} anos para o {degree}º grau.', { years, degree: grade }),
        showNextBelt: false,
        foot,
      };
    }

    const { stripeRemaining, beltRemaining, nextBelt, currentStripes } = progression;
    const nextBeltName = nextBelt ? beltLabel(nextBelt) : '';
    if (stripeRemaining !== null && stripeRemaining > 0) {
      const grade = currentStripes + 1;
      const caption = stripeRemaining === 1
        ? t('aula pro {grade}º grau', { grade })
        : t('aulas pro {grade}º grau', { grade });
      return {
        headline: [stripeRemaining === 1 ? t('Mais 1 aula.') : t('Mais {count} aulas.', { count: stripeRemaining }), t('Você chega lá.')],
        giant: String(stripeRemaining),
        caption,
        aria: `${stripeRemaining} ${caption}`,
        showNextBelt: true,
      };
    }
    if (stripeRemaining === null && beltRemaining !== null && beltRemaining > 0 && nextBelt) {
      const caption = beltRemaining === 1
        ? t('aula pra faixa {belt}', { belt: nextBeltName })
        : t('aulas pra faixa {belt}', { belt: nextBeltName });
      return {
        headline: [beltRemaining === 1 ? t('Mais 1 aula.') : t('Mais {count} aulas.', { count: beltRemaining }), t('Você chega lá.')],
        giant: String(beltRemaining),
        caption,
        aria: `${beltRemaining} ${caption}`,
        showNextBelt: false,
      };
    }
    if (stripeRemaining === 0 || beltRemaining === 0) {
      return ready(t('Ciclo fechado: aguarde a avaliação do professor.'));
    }
    return {
      headline: [t('Seu professor define o próximo passo.')],
      giant: null,
      caption: t('Progressão manual: seu professor define os graus.'),
      aria: t('Progressão manual: seu professor define os graus.'),
      showNextBelt: false,
    };
  }, [blackBelt, progression]);

  const showNextBelt = hero.showNextBelt
    && Boolean(progression.nextBelt)
    && progression.beltTotal > 0
    && progression.beltRemaining !== null;
  const heroStripes = blackBelt ? blackBelt.degree : profile.stripes;
  const heroSlots = Math.max(progression.currentRule?.maxStripes ?? 0, profile.stripes ?? 0);

  // ─── Calendario ──────────────────────────────────────────────────────────
  const nowMs = Date.now();
  const todayKey = academyDayKey(new Date(nowMs), timeZone);
  const [todayYear, todayMonth] = todayKey.split('-').map(Number);
  const [view, setView] = useState(() => ({ year: todayYear, month: todayMonth - 1 }));
  const [selectedKey, setSelectedKey] = useState<string | null>(todayKey);
  const kidsCategory = progression.track === 'Kids' ? progression.kidsCategory : undefined;
  const fallbackClassTitle = t('Aula');

  const dayMap = useMemo(() => buildDayMap({
    attendances,
    attendanceRequests,
    classes,
    rsvps,
    timeZone,
    kidsCategory,
    now: nowMs,
    fallbackClassTitle,
  }),
  // nowMs fica de fora de proposito: o mapa so e refeito quando os dados mudam.
  [attendances, attendanceRequests, classes, rsvps, timeZone, kidsCategory, fallbackClassTitle]);

  const monthCells = useMemo(() => buildMonthGrid(view.year, view.month), [view.month, view.year]);
  // 1/1/2024 foi segunda-feira: a grade comeca na segunda (buildMonthGrid).
  const weekdayLabels = Array.from({ length: 7 }, (_, index) => weekdayFormatter.format(new Date(2024, 0, 1 + index)));
  const monthTitle = capitalize(monthFormatter.format(new Date(view.year, view.month, 15)));

  const shiftMonth = (delta: number) => {
    setView((current) => {
      const next = new Date(current.year, current.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
    setSelectedKey(null);
  };

  const selectedInView = selectedKey && selectedKey.startsWith(`${view.year}-${pad2(view.month + 1)}-`) ? selectedKey : null;
  const selectedInfo = selectedInView ? dayMap.get(selectedInView) : undefined;
  const selectedDate = selectedInView ? (() => {
    const [y, m, d] = selectedInView.split('-').map(Number);
    return new Date(y, m - 1, d);
  })() : null;

  const stateLabel = (state: RingState | null) => {
    if (state === 'trained') return t('Treinou');
    if (state === 'partial') return t('Presença');
    if (state === 'missed') return t('Faltou');
    return null;
  };

  const entryLabel = (entry: DayEntry) => {
    switch (entry.kind) {
      case 'counted':
        return t('Presença computada');
      case 'not-counted':
        return entry.reason ? `${t('Não computada')} · ${entry.reason}` : t('Não computada');
      case 'pending':
        return t('Solicitação pendente');
      case 'missed':
        return t('Você confirmou ida e não registrou presença.');
      default:
        return t('Aula programada');
    }
  };

  // ─── Linha do tempo de graduacoes ────────────────────────────────────────
  const timeline = useMemo<TimelineNode[]>(() => {
    const sorted = [...graduations].sort((left, right) => {
      const leftMs = left.promotedAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;
      const rightMs = right.promotedAt?.toMillis() ?? Number.MAX_SAFE_INTEGER;
      return leftMs - rightMs;
    });
    const raw: Array<Omit<TimelineNode, 'label'>> = [];
    if (sorted.length > 0) {
      raw.push({
        key: 'start',
        belt: sorted[0].previousBelt,
        stripes: sorted[0].previousStripes,
        date: tsToDate(profile.trainingStartDate),
        current: false,
      });
    }
    sorted.forEach((entry: FirestoreEntity<GraduationRecord>) => {
      raw.push({ key: entry.id, belt: entry.newBelt, stripes: entry.newStripes, date: tsToDate(entry.promotedAt), current: false });
    });
    const currentBelt = normalizeBeltId(profile.belt);
    const currentStripes = blackBelt ? blackBelt.degree : profile.stripes;
    const last = raw[raw.length - 1];
    const lastMatches = last
      && normalizeBeltId(last.belt) === currentBelt
      && (isBlackBelt(currentBelt) || last.stripes === currentStripes);
    if (lastMatches) {
      last.current = true;
      if (isBlackBelt(currentBelt)) last.stripes = currentStripes;
    } else {
      raw.push({
        key: 'current',
        belt: currentBelt,
        stripes: currentStripes,
        date: tsToDate(profile.lastGraduationDateOverride),
        current: true,
      });
    }

    return raw.map((node, index) => {
      const previous = raw[index - 1];
      const sameBelt = previous && normalizeBeltId(previous.belt) === normalizeBeltId(node.belt);
      const beltName = t('Faixa {belt}', { belt: beltLabel(node.belt) });
      const gradeName = node.stripes > 0 ? t('{degree}º Grau', { degree: node.stripes }) : '';
      const label = gradeName ? (sameBelt ? gradeName : `${beltName} · ${gradeName}`) : beltName;
      return { ...node, label };
    });
  }, [blackBelt, graduations, profile.belt, profile.lastGraduationDateOverride, profile.stripes, profile.trainingStartDate]);

  const timelineRef = useRef<HTMLOListElement>(null);
  useLayoutEffect(() => {
    const element = timelineRef.current;
    if (element) element.scrollLeft = element.scrollWidth;
  }, [timeline.length, segment]);

  const bellVisible = shell.role === 'student';

  return (
    <div className="lv-screen rd-evo">
      <section className={`rd-evo__hero ${segment === 'competition' ? 'rd-evo__hero--compact' : ''}`}>
        <div className="rd-evo__bar">
          <div className="lv-segmented lv-segmented--on-yellow rd-evo__segmented" role="tablist" aria-label={t('Evolução')}>
            <button
              type="button"
              role="tab"
              aria-selected={segment === 'graduation'}
              className={segment === 'graduation' ? 'is-active' : ''}
              onClick={() => setSegment('graduation')}
            >
              {t('Graduação')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={segment === 'competition'}
              className={segment === 'competition' ? 'is-active' : ''}
              onClick={() => setSegment('competition')}
            >
              {t('Competição')}
            </button>
          </div>
          {bellVisible ? (
            <button
              type="button"
              className="lv-icon-btn lv-icon-btn--ink rd-evo__bell"
              onClick={shell.openNotifications}
              aria-label={shell.unreadCount > 0
                ? `${t('Avisos')} · ${t('{count} não lidas', { count: shell.unreadCount })}`
                : t('Avisos')}
            >
              <Bell size={20} strokeWidth={2} />
              {shell.unreadCount > 0 ? (
                <span className="lv-badge-count" aria-hidden="true">{shell.unreadCount > 9 ? '9+' : shell.unreadCount}</span>
              ) : null}
            </button>
          ) : null}
        </div>

        {segment === 'graduation' ? (
          <>
            <h1 className="lv-display rd-evo__headline">
              {hero.headline.map((line) => <span key={line}>{line}</span>)}
            </h1>
            {examWindow ? <span className="lv-chip lv-chip--ink rd-evo__exam">{t('Janela de exame')}</span> : null}

            <div className={`rd-evo__stage ${hero.giant === null ? 'rd-evo__stage--belt-only' : ''}`} role="img" aria-label={hero.aria}>
              <div className="rd-evo__belt" aria-hidden="true">
                <BeltImage
                  belt={progression.currentBelt}
                  stripes={heroStripes}
                  maxStripes={blackBelt ? undefined : heroSlots}
                  blackBelt={blackBelt}
                />
              </div>
              {hero.giant !== null ? <span className="lv-giant rd-evo__giant" aria-hidden="true">{hero.giant}</span> : null}
            </div>

            <div className="rd-evo__caption">
              <strong className="rd-evo__caption-main">{hero.caption}</strong>
              {showNextBelt && progression.nextBelt ? (
                <span className="rd-evo__next">
                  <BeltImage belt={progression.nextBelt} stripes={0} hideEmptyStripes className="rd-evo__next-belt" />
                  {t('Faixa {belt} em {count}', { belt: beltLabel(progression.nextBelt), count: progression.beltRemaining ?? 0 })}
                </span>
              ) : null}
              {hero.foot ? <span className="rd-evo__next">{hero.foot}</span> : null}
            </div>
          </>
        ) : (
          <h1 className="lv-display rd-evo__headline">{t('Competição')}</h1>
        )}
      </section>

      <div className="rd-evo__panel" hidden={segment !== 'graduation'} role="tabpanel">
        <section className="lv-section rd-evo__calendar" aria-labelledby="rd-evo-month">
          <div className="rd-evo__cal-head">
            <h2 id="rd-evo-month" className="lv-section__title">
              {monthTitle}
              {view.year !== todayYear ? <span className="rd-evo__cal-year"> {view.year}</span> : null}
            </h2>
            <div className="rd-evo__cal-nav">
              <button type="button" className="lv-icon-btn" onClick={() => shiftMonth(-1)} aria-label={t('Mês anterior')}>
                <ChevronLeft size={20} strokeWidth={2} />
              </button>
              <button type="button" className="lv-icon-btn" onClick={() => shiftMonth(1)} aria-label={t('Próximo mês')}>
                <ChevronRight size={20} strokeWidth={2} />
              </button>
            </div>
          </div>

          <ul className="rd-evo__legend">
            <li><span className="rd-evo__legend-ring is-trained" aria-hidden="true" />{t('Treinou')}</li>
            <li><span className="rd-evo__legend-ring is-partial" aria-hidden="true" />{t('Presença')}</li>
            <li><span className="rd-evo__legend-ring is-missed" aria-hidden="true" />{t('Faltou')}</li>
          </ul>

          <div className="rd-evo__grid">
            {weekdayLabels.map((label, index) => (
              <span key={`wd-${index}`} className="rd-evo__weekday" aria-hidden="true">{label}</span>
            ))}
            {monthCells.map((cell, index) => {
              if (!cell) return <span key={`pad-${index}`} className="rd-evo__cell rd-evo__cell--pad" />;
              const key = localKey(cell);
              const info = dayMap.get(key);
              const state = ringStateOf(info);
              const isToday = key === todayKey;
              const isFuture = key > todayKey;
              const ringClass = [
                'lv-ring-day',
                state ? `is-${state}` : '',
                isToday ? 'is-today' : '',
                isFuture && !state ? 'is-future' : '',
              ].filter(Boolean).join(' ');
              const descriptors = [
                fullDayFormatter.format(cell),
                isToday ? t('Hoje') : null,
                stateLabel(state),
                info?.hasClass ? t('Aula programada') : null,
              ].filter(Boolean).join(' · ');
              return (
                <button
                  key={key}
                  type="button"
                  className={`rd-evo__cell ${selectedInView === key ? 'is-selected' : ''}`}
                  onClick={() => setSelectedKey(key)}
                  aria-pressed={selectedInView === key}
                  aria-label={descriptors}
                >
                  <span className={`rd-evo__dot ${info?.hasClass ? 'is-on' : ''}`} aria-hidden="true" />
                  <span className={ringClass} aria-hidden="true">{cell.getDate()}</span>
                </button>
              );
            })}
          </div>

          {selectedDate ? (
            <div className="rd-evo__day" aria-live="polite">
              <p className="lv-label">{capitalize(fullDayFormatter.format(selectedDate))}</p>
              {selectedInfo && selectedInfo.entries.length > 0 ? (
                <ul className="lv-list rd-evo__day-list">
                  {selectedInfo.entries.map((entry) => (
                    <li key={entry.id} className={`lv-row rd-evo__day-row rd-evo__day-row--${entry.kind}`}>
                      <span className="rd-evo__day-mark" aria-hidden="true" />
                      <div className="lv-row__main">
                        <span className="lv-row__title">{entry.title}</span>
                        <span className="lv-row__meta">{entryLabel(entry)}</span>
                      </div>
                      {entry.time ? <span className="rd-evo__day-time">{timeFormatter.format(entry.time)}</span> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rd-grad__note">{t('Nenhum treino neste dia.')}</p>
              )}
            </div>
          ) : null}
          <p className="rd-grad__note rd-evo__legend-note">
            {t('Presença: você treinou mas a aula não computou, ou a presença aguarda aprovação.')}
          </p>
        </section>

        <section className="lv-section rd-evo__timeline-section" aria-labelledby="rd-evo-timeline">
          <h2 id="rd-evo-timeline" className="lv-label rd-evo__timeline-title">{t('Graduações')}</h2>
          <ol className="rd-evo__timeline" ref={timelineRef}>
            {timeline.map((node) => (
              <li key={node.key} className={`rd-evo__node ${node.current ? 'is-current' : ''}`}>
                <span className="rd-evo__node-belt">
                  <BeltImage
                    belt={node.belt}
                    stripes={node.stripes}
                    hideEmptyStripes
                    blackBelt={node.current ? blackBelt : null}
                  />
                </span>
                <span className="rd-evo__node-label">{node.label}</span>
                <span className="rd-evo__node-date">
                  {node.date ? shortDateFormatter.format(node.date) : node.current ? t('Atual') : t('Sem data')}
                </span>
              </li>
            ))}
          </ol>
        </section>

        <section className="lv-section rd-evo__details" aria-labelledby="rd-evo-details">
          <h2 id="rd-evo-details" className="lv-section__title">{t('Detalhes da graduação')}</h2>
          <GraduationView {...graduation} />
        </section>
      </div>

      {/* Mantido montado: trocar de segmento nao perde o rascunho do envio de video. */}
      <div className="rd-evo__panel" hidden={segment !== 'competition'} role="tabpanel">
        <CompetitionView {...competition} />
      </div>
    </div>
  );
};

export default EvolutionView;
