// Faixa preta: grau por TEMPO (padrao IBJJF). Espelha as regras do frontend
// (beltCatalog.ts) porque as functions tem tsconfig/modulo proprios e nao importam
// o catalogo do app. Mantenha os dois lados em sincronia.

// Anos minimos acumulados desde a faixa preta para cada grau. Indice + 1 = grau.
// Ex.: [0] = 3 anos -> 1o grau; [6] = 30 anos -> 7o grau.
export const BLACK_BELT_DEGREE_YEARS = [3, 6, 9, 14, 19, 23, 30, 37, 47] as const;

export const MAX_BLACK_BELT_DEGREE = BLACK_BELT_DEGREE_YEARS.length; // 9

export function getBlackBeltDegreeForYears(years: number): number {
  const safeYears = Number.isFinite(years) ? Math.max(0, Math.floor(years)) : 0;
  let degree = 0;
  for (let i = 0; i < BLACK_BELT_DEGREE_YEARS.length; i += 1) {
    if (safeYears >= BLACK_BELT_DEGREE_YEARS[i]) {
      degree = i + 1;
    } else {
      break;
    }
  }
  return degree;
}

// Anos completos entre duas datas (mesma regra do frontend completedYearsBetween).
export function completedYearsBetween(from: Date, to: Date): number {
  let years = to.getFullYear() - from.getFullYear();
  const monthDiff = to.getMonth() - from.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && to.getDate() < from.getDate())) {
    years -= 1;
  }
  return Math.max(0, years);
}

// Grau efetivo da preta: override manual quando informado (0..9), senao o grau
// derivado da data em que recebeu a preta. Retorna 0 quando nao ha data nem override.
export function resolveBlackBeltDegree(params: {
  since?: Date | null;
  manualDegree?: number | null;
  now?: Date;
}): number {
  const { since, manualDegree } = params;
  if (typeof manualDegree === 'number' && Number.isFinite(manualDegree)) {
    return Math.max(0, Math.min(MAX_BLACK_BELT_DEGREE, Math.floor(manualDegree)));
  }
  if (!since || Number.isNaN(since.valueOf())) {
    return 0;
  }
  const reference = params.now ?? new Date();
  return getBlackBeltDegreeForYears(completedYearsBetween(since, reference));
}
