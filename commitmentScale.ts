import { resolveAttendanceDate, type AttendanceDateFields, type AttendanceScheduledStart } from './attendanceUtils.ts';
import { academyDayKey } from './dailyTrainingUtils.ts';
import type { TrainingType } from './beltCatalog';

// Comprometimento do aluno: nota de 0 a 100 pelas aulas do MES corrente, em quatro cores.
//
// A nota e a cor saem da tabela, nunca de um limiar global sobre a nota — 80 pontos e verde no
// adulto e amarelo no kids. Por isso `resolveCommitment` devolve as duas coisas juntas, e quem
// desenha a barra nunca recalcula a cor a partir do score.
//
// Os imports trazem a extensao `.ts` de proposito (o resto do app importa sem extensao): e o que
// permite `node --experimental-strip-types --test` carregar este arquivo direto, como os testes
// de attendanceUtils/dailyTrainingUtils ja fazem. `beltCatalog` entra so como tipo — importar o
// modulo de verdade puxaria `types.ts`, que tem enum e nao sobrevive ao strip-types.

export type CommitmentLevel = 'vermelho' | 'laranja' | 'amarelo' | 'verde';

export const COMMITMENT_LEVEL_LABEL: Record<CommitmentLevel, string> = {
  vermelho: 'Baixa frequência',
  laranja: 'Média frequência',
  amarelo: 'Boa frequência',
  verde: 'Excelente frequência',
};

export interface CommitmentResult {
  /** 0 a 100, direto da tabela. */
  score: number;
  /** Cor da tabela — nunca derivada do score. */
  level: CommitmentLevel;
  label: string;
  track: TrainingType;
  /**
   * Aulas do mes: TODA aula em que o aluno esteve no tatame. E este numero que vira a nota.
   * Vide `summarizeMonthlyAttendance` para o porque de participacao != presenca computada.
   */
  classes: number;
  /** Subconjunto de `classes` que conta para a graduacao. So aparece na leitura, nao na nota. */
  countedClasses: number;
  /** Semanas distintas do mes com treino. */
  weeksWithClasses: number;
  /** Mes de referencia por extenso, ex.: "setembro de 2026". */
  monthLabel: string;
}

export interface MonthlyAttendanceSummary {
  /** Participacao: todas as aulas do mes. */
  classes: number;
  /** As que contam para a graduacao. */
  countedClasses: number;
  weeksWithClasses: number;
  /** Dias do mes com treino, em ordem. */
  dayNumbers: number[];
  monthLabel: string;
}

export interface MonthlyAttendanceInput extends AttendanceDateFields {
  classId?: string;
  academyId?: string;
  countsAsAttendance?: boolean;
}

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

function monthFormatter(timeZone: string): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: timeZone || DEFAULT_TIMEZONE, month: 'long', year: 'numeric' });
  } catch {
    return new Intl.DateTimeFormat('pt-BR', { timeZone: DEFAULT_TIMEZONE, month: 'long', year: 'numeric' });
  }
}

export function formatMonthLabel(date: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  return monthFormatter(timeZone).format(date);
}

/** 'YYYY-MM' no fuso da academia. */
export function academyMonthKey(date: Date, timeZone: string = DEFAULT_TIMEZONE): string {
  return academyDayKey(date, timeZone).slice(0, 7);
}

// "Semana" da regra das 4 aulas: blocos de dias do mes (1-7, 8-14, 15-21, 22 ate o fim).
// Deterministico e nunca passa de 4 blocos — o que casa com o teto de "4 semanas" da tabela.
// Semana ISO daria resultado diferente conforme o dia em que o mes comecou.
function weekBlockOfMonth(dayOfMonth: number): number {
  return Math.min(4, Math.floor((dayOfMonth - 1) / 7) + 1);
}

function scoreAdult(classes: number, weeksWithClasses: number): { score: number; level: CommitmentLevel } {
  if (classes >= 24) return { score: 100, level: 'verde' };
  if (classes >= 21) return { score: 90, level: 'verde' };
  if (classes >= 17) return { score: 80, level: 'verde' };
  if (classes >= 13) return { score: 60, level: 'amarelo' };
  if (classes >= 9) return { score: 50, level: 'laranja' };
  if (classes >= 5) return { score: 30, level: 'laranja' };

  // Vermelho. So aqui, e so com exatamente 4 aulas, a distribuicao no mes muda a nota:
  // treinar 1x por semana vale mais do que concentrar as quatro numa semana so.
  if (classes === 4) {
    if (weeksWithClasses >= 4) return { score: 10, level: 'vermelho' };
    if (weeksWithClasses === 3) return { score: 8, level: 'vermelho' };
    if (weeksWithClasses === 2) return { score: 5, level: 'vermelho' };
    return { score: 3, level: 'vermelho' };
  }

  return { score: Math.max(0, classes), level: 'vermelho' };
}

// Kids nunca olha a distribuicao por semanas — so a quantidade de aulas.
function scoreKids(classes: number): { score: number; level: CommitmentLevel } {
  if (classes >= 8) return { score: 100, level: 'verde' };
  if (classes === 7) return { score: 90, level: 'verde' };
  if (classes === 6) return { score: 80, level: 'amarelo' };
  if (classes === 5) return { score: 70, level: 'amarelo' };
  if (classes === 4) return { score: 50, level: 'amarelo' };
  if (classes === 3) return { score: 35, level: 'laranja' };
  if (classes === 2) return { score: 25, level: 'laranja' };
  if (classes === 1) return { score: 5, level: 'vermelho' };
  return { score: 0, level: 'vermelho' };
}

export function resolveCommitment(params: {
  classes: number;
  countedClasses?: number;
  weeksWithClasses?: number;
  track: TrainingType;
  monthLabel?: string;
}): CommitmentResult {
  const classes = Math.max(0, Math.floor(params.classes));
  const countedClasses = Math.min(classes, Math.max(0, Math.floor(params.countedClasses ?? classes)));
  const weeksWithClasses = Math.max(0, Math.min(4, Math.floor(params.weeksWithClasses ?? 0)));
  const { score, level } = params.track === 'Kids'
    ? scoreKids(classes)
    : scoreAdult(classes, weeksWithClasses);

  return {
    score,
    level,
    label: COMMITMENT_LEVEL_LABEL[level],
    track: params.track,
    classes,
    countedClasses,
    weeksWithClasses,
    monthLabel: params.monthLabel ?? formatMonthLabel(new Date()),
  };
}

/**
 * Aulas do mes corrente de UM aluno.
 *
 * COMPROMETIMENTO MEDE PARTICIPACAO, NAO PRESENCA COMPUTADA — a diferenca e proposital, nao um
 * bug a ser "consertado":
 * - `classes` conta toda aula em que o aluno esteve no tatame, inclusive as que nao viram
 *   presenca (`countsAsAttendance === false`). Os dois unicos motivos de nao computar, em
 *   classRules.ts, sao a aula LEVEL Iniciante fora da faixa e a 3a aula do mesmo dia: nos dois
 *   o aluno treinou. O faixa azul que nao pode ir no horario dele e foi na iniciante esta sendo
 *   comprometido, e nao pode ser punido na barra como se tivesse faltado.
 * - `countedClasses` guarda o subconjunto que conta para a graduacao, so para a tela conseguir
 *   explicar a diferenca ("6 treinos, 5 contam para graduacao").
 * - A NOTA sai de `classes`. Presenca, progressao de faixa e o ranking da unidade continuam
 *   usando a regra da faixa, intocados.
 *
 * Vale a data da AULA, nao a do lancamento (`resolveAttendanceDate`): aula de agosto lancada em
 * setembro continua em agosto.
 *
 * De proposito NAO exige que a aula esteja finalizada: o comprometimento do aluno nao pode
 * depender de o professor lembrar de clicar em "Finalizar" (o ranking da unidade exige, entao os
 * dois numeros podem divergir em unidade que nao finaliza aula).
 */
export function summarizeMonthlyAttendance(params: {
  attendances: ReadonlyArray<MonthlyAttendanceInput>;
  classStartById?: ReadonlyMap<string, AttendanceScheduledStart>;
  now?: Date;
  timeZone?: string;
}): MonthlyAttendanceSummary {
  const timeZone = params.timeZone || DEFAULT_TIMEZONE;
  const now = params.now ?? new Date();
  const monthKey = academyMonthKey(now, timeZone);
  const weeks = new Set<number>();
  const days = new Set<number>();
  let classes = 0;
  let countedClasses = 0;

  params.attendances.forEach((attendance) => {
    const date = resolveAttendanceDate(
      attendance,
      attendance.classId ? params.classStartById?.get(attendance.classId) : undefined,
    );

    if (!date) {
      return;
    }

    const dayKey = academyDayKey(date, timeZone);
    if (dayKey.slice(0, 7) !== monthKey) {
      return;
    }

    // Duas aulas no mesmo dia contam duas: sao dois treinos.
    const dayOfMonth = Number(dayKey.slice(8, 10));
    classes += 1;
    if (attendance.countsAsAttendance !== false) {
      countedClasses += 1;
    }
    days.add(dayOfMonth);
    weeks.add(weekBlockOfMonth(dayOfMonth));
  });

  return {
    classes,
    countedClasses,
    weeksWithClasses: weeks.size,
    dayNumbers: [...days].sort((left, right) => left - right),
    monthLabel: formatMonthLabel(now, timeZone),
  };
}

/** Atalho para as telas de um aluno so. */
export function resolveMonthlyCommitment(params: {
  attendances: ReadonlyArray<MonthlyAttendanceInput>;
  track: TrainingType;
  classStartById?: ReadonlyMap<string, AttendanceScheduledStart>;
  now?: Date;
  timeZone?: string;
}): CommitmentResult {
  const summary = summarizeMonthlyAttendance(params);

  return resolveCommitment({
    classes: summary.classes,
    countedClasses: summary.countedClasses,
    weeksWithClasses: summary.weeksWithClasses,
    track: params.track,
    monthLabel: summary.monthLabel,
  });
}

/**
 * Uma passada so para as listas do professor. Nao conhece faixa: devolve a contagem por aluno e
 * quem chama resolve a trilha (Kids x Adulto) com `getUserProgressionSummary`.
 */
export function summarizeMonthlyAttendanceByUser(params: {
  attendances: ReadonlyArray<MonthlyAttendanceInput & { userId: string }>;
  /** Quando presente, ignora presenca de outra unidade (superadmin vendo a rede inteira). */
  academyId?: string;
  classStartById?: ReadonlyMap<string, AttendanceScheduledStart>;
  now?: Date;
  timeZone?: string;
}): Map<string, MonthlyAttendanceSummary> {
  const byUser = new Map<string, MonthlyAttendanceInput[]>();

  params.attendances.forEach((attendance) => {
    if (params.academyId && attendance.academyId && attendance.academyId !== params.academyId) {
      return;
    }

    const bucket = byUser.get(attendance.userId);
    if (bucket) {
      bucket.push(attendance);
    } else {
      byUser.set(attendance.userId, [attendance]);
    }
  });

  const summaries = new Map<string, MonthlyAttendanceSummary>();
  byUser.forEach((attendances, userId) => {
    summaries.set(userId, summarizeMonthlyAttendance({
      attendances,
      classStartById: params.classStartById,
      now: params.now,
      timeZone: params.timeZone,
    }));
  });

  return summaries;
}
