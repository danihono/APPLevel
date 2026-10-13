import { resolveAttendanceDate, type AttendanceDateFields, type AttendanceScheduledStart } from './attendanceUtils.ts';
import { academyDayKey } from './dailyTrainingUtils.ts';

// Numeros do Inicio do aluno: treinos da semana, semanas seguidas com treino e a proxima aula.
//
// Tudo no fuso da ACADEMIA (academyDayKey), nunca no relogio do aparelho: o aluno viajando ou com
// o celular em outro fuso continua vendo a semana do tatame. A semana vai de segunda a domingo.
//
// Os imports trazem a extensao `.ts` de proposito (como commitmentScale.ts): e o que deixa
// `node --experimental-strip-types --test` carregar este arquivo direto. Nada aqui pode importar
// calendarUtils/beltCatalog/i18n — eles puxam `types.ts` (enum) ou .tsx e quebram o strip-types.

export interface TrainingAttendance extends AttendanceDateFields {
  classId: string;
  /** `false` quando a presenca nao conta (aula iniciante fora da faixa, limite diario...). */
  countsAsAttendance?: boolean;
}

export interface TrainingClass {
  id: string;
  status: string;
  description?: string;
  scheduledStart?: AttendanceScheduledStart;
  scheduledEnd?: AttendanceScheduledStart;
}

/** Inicio das aulas por id (Map) ou a propria lista de aulas. */
export type ClassStartSource =
  | ReadonlyMap<string, AttendanceScheduledStart>
  | ReadonlyArray<{ id: string; scheduledStart?: AttendanceScheduledStart }>;

/** Duracao assumida quando a aula nao tem horario de termino. */
export const DEFAULT_CLASS_DURATION_MS = 60 * 60 * 1000;

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value: AttendanceScheduledStart): Date | null {
  const date = value instanceof Date ? value : value?.toDate();
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function toStartLookup(source?: ClassStartSource | null): (classId: string) => AttendanceScheduledStart {
  if (!source) return () => undefined;
  if (source instanceof Map) {
    const map = source as ReadonlyMap<string, AttendanceScheduledStart>;
    return (classId) => map.get(classId);
  }
  const map = new Map<string, AttendanceScheduledStart>();
  for (const lesson of source as ReadonlyArray<{ id: string; scheduledStart?: AttendanceScheduledStart }>) {
    map.set(lesson.id, lesson.scheduledStart);
  }
  return (classId) => map.get(classId);
}

/** 'YYYY-MM-DD' -> meio-dia UTC daquele dia (aritmetica de calendario sem horario de verao). */
function dayKeyToUtcNoon(dayKey: string): Date {
  return new Date(`${dayKey}T12:00:00Z`);
}

function utcNoonToDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Segunda-feira (dia da academia) da semana que contem `dayKey`. */
export function weekStartKey(dayKey: string): string {
  const date = dayKeyToUtcNoon(dayKey);
  const offset = (date.getUTCDay() + 6) % 7; // seg = 0 ... dom = 6
  date.setUTCDate(date.getUTCDate() - offset);
  return utcNoonToDayKey(date);
}

function shiftDays(dayKey: string, days: number): string {
  const date = dayKeyToUtcNoon(dayKey);
  date.setUTCDate(date.getUTCDate() + days);
  return utcNoonToDayKey(date);
}

/** Dias de calendario (no fuso da academia) entre `now` e `date`: 0 hoje, 1 amanha, -1 ontem. */
export function academyDayOffset(date: Date, now: Date, timeZone: string): number {
  const target = dayKeyToUtcNoon(academyDayKey(date, timeZone)).getTime();
  const today = dayKeyToUtcNoon(academyDayKey(now, timeZone)).getTime();
  return Math.round((target - today) / DAY_MS);
}

/** Hora (0-23) de `date` no fuso da academia. */
export function academyHour(date: Date, timeZone: string): number {
  const read = (zone: string) => {
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', hourCycle: 'h23' }).formatToParts(date);
    return Number(parts.find((part) => part.type === 'hour')?.value ?? '0') % 24;
  };
  try {
    return read(timeZone || 'America/Sao_Paulo');
  } catch {
    return read('America/Sao_Paulo');
  }
}

/** Semanas (segunda da semana) com pelo menos uma presenca que conta. */
function countingWeekKeys(
  attendances: ReadonlyArray<TrainingAttendance>,
  classStarts: ClassStartSource | null | undefined,
  timeZone: string,
): Map<string, number> {
  const startOf = toStartLookup(classStarts);
  const weeks = new Map<string, number>();
  for (const attendance of attendances) {
    if (attendance.countsAsAttendance === false) continue;
    const date = resolveAttendanceDate(attendance, startOf(attendance.classId));
    if (!date) continue;
    const week = weekStartKey(academyDayKey(date, timeZone));
    weeks.set(week, (weeks.get(week) ?? 0) + 1);
  }
  return weeks;
}

/**
 * Treinos da semana corrente (segunda a domingo, fuso da academia). So entram presencas que
 * contam (`countsAsAttendance !== false`) — e o mesmo numero que anda a fita do grau.
 */
export function computeWeekTrainings(
  attendances: ReadonlyArray<TrainingAttendance>,
  classStarts: ClassStartSource | null | undefined,
  timeZone: string,
  now: Date,
): number {
  const current = weekStartKey(academyDayKey(now, timeZone));
  return countingWeekKeys(attendances, classStarts, timeZone).get(current) ?? 0;
}

/**
 * Semanas seguidas (segunda a domingo) com pelo menos um treino que conta. A sequencia termina
 * na semana atual ou na anterior: segunda-feira sem treino ainda nao quebra a sequencia.
 */
export function computeWeeklyStreak(
  attendances: ReadonlyArray<TrainingAttendance>,
  classStarts: ClassStartSource | null | undefined,
  timeZone: string,
  now: Date,
): number {
  const weeks = countingWeekKeys(attendances, classStarts, timeZone);
  let cursor = weekStartKey(academyDayKey(now, timeZone));
  if (!weeks.has(cursor)) cursor = shiftDays(cursor, -7);
  let streak = 0;
  while (weeks.has(cursor)) {
    streak += 1;
    cursor = shiftDays(cursor, -7);
  }
  return streak;
}

// Espelho de calendarUtils.isClassVisibleForStudent (que nao pode ser importado aqui: puxa i18n).
// A HomeView passa a funcao original em `isVisible`; este padrao so serve para os testes.
const INFANTIL_CLASS_TYPES = new Set(['kids-01', 'kids-02', 'kids-03']);

function defaultIsVisible(description: string | undefined, kidsCategory?: unknown): boolean {
  if (kidsCategory) return true;
  return !INFANTIL_CLASS_TYPES.has(description ?? '');
}

export function classEndDate(lesson: Pick<TrainingClass, 'scheduledStart' | 'scheduledEnd'>): Date | null {
  const end = toDate(lesson.scheduledEnd);
  if (end) return end;
  const start = toDate(lesson.scheduledStart);
  return start ? new Date(start.getTime() + DEFAULT_CLASS_DURATION_MS) : null;
}

/** Aula em andamento: status 'active' ou agora entre o inicio e o fim previstos. */
export function isClassLive(lesson: TrainingClass, now: Date): boolean {
  if (lesson.status === 'active') return true;
  if (lesson.status !== 'scheduled') return false;
  const start = toDate(lesson.scheduledStart);
  const end = classEndDate(lesson);
  return Boolean(start && end && start.getTime() <= now.getTime() && now.getTime() < end.getTime());
}

/**
 * Proxima aula para o aluno: a de hoje que ainda nao terminou (a ativa primeiro) ou, sem aula
 * hoje, a proxima futura. Ignora canceladas/finalizadas e turmas que o aluno nao ve (infantil para
 * adulto). Uma aula 'active' esquecida aberta de outro dia nao aparece como "agora".
 */
export function nextClassForStudent<T extends TrainingClass, K = string>(
  classes: ReadonlyArray<T>,
  now: Date,
  timeZone: string,
  kidsCategory?: K | null,
  isVisible: (description: string | undefined, kidsCategory?: K) => boolean = defaultIsVisible,
): T | null {
  const nowMs = now.getTime();
  const todayKey = academyDayKey(now, timeZone);
  const candidates: Array<{ lesson: T; start: number; active: boolean }> = [];

  for (const lesson of classes) {
    if (lesson.status !== 'scheduled' && lesson.status !== 'active') continue;
    if (!isVisible(lesson.description, kidsCategory ?? undefined)) continue;
    const start = toDate(lesson.scheduledStart);
    const end = classEndDate(lesson);
    if (!start || !end) continue;
    const active = lesson.status === 'active';
    const notOver = end.getTime() > nowMs;
    const startedToday = academyDayKey(start, timeZone) === todayKey;
    if (active ? !(notOver || startedToday) : !notOver) continue;
    candidates.push({ lesson, start: start.getTime(), active });
  }

  candidates.sort((left, right) => {
    if (left.active !== right.active) return left.active ? -1 : 1;
    return left.start - right.start;
  });

  return candidates[0]?.lesson ?? null;
}

// ─── Retrospectiva do mes ───────────────────────────────────────────────────

export interface MonthRecap {
  /** Mes da retrospectiva ('YYYY-MM'): o mes anterior ao de `now`, no fuso da academia. */
  monthKey: string;
  /** Mes antes dele ('YYYY-MM'), para comparar. */
  previousMonthKey: string;
  /** Treinos que contam no mes. */
  count: number;
  /** Treinos que contam no mes anterior. */
  previousCount: number;
  /** Horas de tatame (duracao das aulas; 1h quando a aula nao tem fim). */
  hours: number;
  /** Treinos por dia da semana (0 = segunda ... 6 = domingo). */
  weekdayCounts: number[];
  /** Dia da semana com mais treinos (0 = segunda), ou null sem treinos. */
  favoriteWeekday: number | null;
  /** Horario de inicio mais frequente ('HH:MM'), ou null. */
  favoriteTime: string | null;
  /** Semanas (segunda a domingo) do mes com pelo menos um treino. */
  activeWeeks: number;
}

function monthKeyShift(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function academyClock(date: Date, timeZone: string): string {
  const format = (zone: string) => new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date);
  try {
    return format(timeZone || 'America/Sao_Paulo');
  } catch {
    return format('America/Sao_Paulo');
  }
}

/**
 * Numeros da retrospectiva do mes anterior: so presencas que contam, no fuso da academia.
 * `classes` serve para achar o inicio e o fim de cada aula (horas no tatame, horario favorito).
 */
export function computeMonthRecap(
  attendances: ReadonlyArray<TrainingAttendance>,
  classes: ReadonlyArray<Pick<TrainingClass, 'id' | 'scheduledStart' | 'scheduledEnd'>> | null | undefined,
  timeZone: string,
  now: Date,
): MonthRecap {
  const monthKey = monthKeyShift(academyDayKey(now, timeZone).slice(0, 7), -1);
  const previousMonthKey = monthKeyShift(monthKey, -1);
  const classById = new Map((classes ?? []).map((lesson) => [lesson.id, lesson]));
  const weekdayCounts = [0, 0, 0, 0, 0, 0, 0];
  const timeCounts = new Map<string, number>();
  const weeks = new Set<string>();
  let count = 0;
  let previousCount = 0;
  let durationMs = 0;

  for (const attendance of attendances) {
    if (attendance.countsAsAttendance === false) continue;
    const lesson = classById.get(attendance.classId);
    const date = resolveAttendanceDate(attendance, lesson?.scheduledStart);
    if (!date) continue;
    const dayKey = academyDayKey(date, timeZone);
    const key = dayKey.slice(0, 7);
    if (key === previousMonthKey) {
      previousCount += 1;
      continue;
    }
    if (key !== monthKey) continue;
    count += 1;
    const weekday = (dayKeyToUtcNoon(dayKey).getUTCDay() + 6) % 7;
    weekdayCounts[weekday] += 1;
    weeks.add(weekStartKey(dayKey));
    const start = toDate(lesson?.scheduledStart) ?? date;
    const clock = academyClock(start, timeZone);
    timeCounts.set(clock, (timeCounts.get(clock) ?? 0) + 1);
    const end = lesson ? toDate(lesson.scheduledEnd) : null;
    const length = end && end.getTime() > start.getTime() ? end.getTime() - start.getTime() : DEFAULT_CLASS_DURATION_MS;
    durationMs += Math.min(length, 4 * 60 * 60 * 1000);
  }

  let favoriteWeekday: number | null = null;
  weekdayCounts.forEach((value, index) => {
    if (value > 0 && (favoriteWeekday === null || value > weekdayCounts[favoriteWeekday])) favoriteWeekday = index;
  });
  let favoriteTime: string | null = null;
  let favoriteTimeCount = 0;
  timeCounts.forEach((value, clock) => {
    if (value > favoriteTimeCount || (value === favoriteTimeCount && favoriteTime !== null && clock < favoriteTime)) {
      favoriteTime = clock;
      favoriteTimeCount = value;
    }
  });

  return {
    monthKey,
    previousMonthKey,
    count,
    previousCount,
    hours: Math.round(durationMs / (60 * 60 * 1000)),
    weekdayCounts,
    favoriteWeekday,
    favoriteTime,
    activeWeeks: weeks.size,
  };
}
