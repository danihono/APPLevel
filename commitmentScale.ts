import { resolveAttendanceDate, type AttendanceDateFields, type AttendanceScheduledStart } from './attendanceUtils.ts';
import { academyDayKey } from './dailyTrainingUtils.ts';
import type { TrainingType } from './beltCatalog';

// Comprometimento do aluno: nota de 0 a 100 pelas aulas dos ULTIMOS 30 DIAS, em quatro cores.
//
// Janela movel, nao mes do calendario: na virada do mes a barra nao zera — em 1o/out ela mostra
// a mesma nota com que setembro terminou, e dai em diante cada dia sai uma aula antiga da conta e
// entra a de hoje. Pedido do cliente: quem treinou o mes inteiro nao pode amanhecer vermelho.
// As tabelas abaixo continuam "por mes" — 30 dias sao o mes.
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
   * Aulas dos ultimos 30 dias: TODA aula em que o aluno esteve no tatame. E este numero que vira
   * a nota. Vide `summarizeMonthlyAttendance` para o porque de participacao != presenca computada.
   */
  classes: number;
  /** Subconjunto de `classes` que conta para a graduacao. So aparece na leitura, nao na nota. */
  countedClasses: number;
  /** Semanas distintas da janela com treino. */
  weeksWithClasses: number;
}

export interface MonthlyAttendanceSummary {
  /** Participacao: todas as aulas da janela. */
  classes: number;
  /** As que contam para a graduacao. */
  countedClasses: number;
  weeksWithClasses: number;
}

export interface MonthlyAttendanceInput extends AttendanceDateFields {
  classId?: string;
  academyId?: string;
  countsAsAttendance?: boolean;
}

const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

/** Tamanho da janela movel: hoje e os 29 dias anteriores. */
export const COMMITMENT_WINDOW_DAYS = 30;

// Diferenca em dias entre dois 'YYYY-MM-DD' (ja no fuso da academia). Conta sobre meia-noite UTC
// de proposito: horario de verao nao faz um dia valer 23 ou 25 horas.
function daysBetweenDayKeys(fromKey: string, toKey: string): number {
  const toUtc = (key: string) =>
    Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
  return Math.round((toUtc(toKey) - toUtc(fromKey)) / 86_400_000);
}

// "Semana" da regra das 4 aulas: blocos de 7 dias contados de hoje para tras (0-6 dias atras,
// 7-13, 14-20, 21-29). Nunca passa de 4 blocos — o que casa com o teto de "4 semanas" da tabela.
// Semana ISO daria resultado diferente conforme o dia da semana em que a janela comeca.
function weekBlockOfWindow(daysAgo: number): number {
  return Math.min(4, Math.floor(daysAgo / 7) + 1);
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
  };
}

/**
 * Aulas dos ultimos 30 dias de UM aluno (o nome ficou "Monthly": 30 dias sao o mes da tabela).
 * A janela vai de hoje ate 29 dias atras, no fuso da academia; presenca de data futura fica de fora.
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
 * Vale a data da AULA, nao a do lancamento (`resolveAttendanceDate`): aula lancada com atraso
 * entra na janela pelo dia em que aconteceu.
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
  const todayKey = academyDayKey(params.now ?? new Date(), timeZone);
  const weeks = new Set<number>();
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

    const daysAgo = daysBetweenDayKeys(academyDayKey(date, timeZone), todayKey);
    if (daysAgo < 0 || daysAgo >= COMMITMENT_WINDOW_DAYS) {
      return;
    }

    // Duas aulas no mesmo dia contam duas: sao dois treinos.
    classes += 1;
    if (attendance.countsAsAttendance !== false) {
      countedClasses += 1;
    }
    weeks.add(weekBlockOfWindow(daysAgo));
  });

  return {
    classes,
    countedClasses,
    weeksWithClasses: weeks.size,
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
