export const MONTH_WEEK_HEADER = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab', 'Dom'] as const;

// Periodo das estatisticas da Central. Fica aqui (e nao na view) porque o App precisa do
// mesmo calculo para dimensionar a assinatura de presencas sem importar a view lazy.
export type FocusPeriodPreset = '30d' | '3m' | '12m' | 'total';

export const FOCUS_PERIOD_OPTIONS: Array<{ value: FocusPeriodPreset; label: string }> = [
  { value: '30d', label: '30 dias' },
  { value: '3m', label: '3 meses' },
  { value: '12m', label: '12 meses' },
  { value: 'total', label: 'Tudo' },
];

// Inicio do historico buscado quando o preset e "Tudo": anterior a qualquer dado da
// plataforma, mas ainda um limite explicito para a query.
export const FOCUS_PERIOD_EPOCH = new Date('2020-01-01T00:00:00.000-03:00');

export interface FocusPeriod {
  startDate: Date;
  startMillis: number;
  endMillis: number;
  label: string;
}

// O fim e sempre "agora" e o inicio recua a partir da data atual; aulas/presencas futuras
// (aula agendada para amanha) ficam de fora das estatisticas de frequencia por definicao.
export function resolveFocusPeriod(preset: FocusPeriodPreset): FocusPeriod {
  const now = new Date();
  const endMillis = now.getTime();

  if (preset === 'total') {
    return {
      startDate: FOCUS_PERIOD_EPOCH,
      startMillis: FOCUS_PERIOD_EPOCH.getTime(),
      endMillis,
      label: 'Todo o historico',
    };
  }

  const start = new Date(now);
  if (preset === '30d') {
    start.setDate(start.getDate() - 30);
  } else {
    start.setMonth(start.getMonth() - (preset === '3m' ? 3 : 12));
  }
  start.setHours(0, 0, 0, 0);

  const option = FOCUS_PERIOD_OPTIONS.find((entry) => entry.value === preset);

  return {
    startDate: start,
    startMillis: start.getTime(),
    endMillis,
    label: `Ultimos ${option?.label ?? preset}`,
  };
}

export function stripDate(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function sameCalendarDay(left?: Date | null, right?: Date | null): boolean {
  if (!left || !right) {
    return false;
  }

  return left.getDate() === right.getDate()
    && left.getMonth() === right.getMonth()
    && left.getFullYear() === right.getFullYear();
}

export function sameCalendarMonth(left: Date, right: Date): boolean {
  return left.getMonth() === right.getMonth() && left.getFullYear() === right.getFullYear();
}

export function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function buildMonthGrid(year: number, month: number): Array<Date | null> {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const cells: Array<Date | null> = Array(startPad).fill(null);

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    cells.push(new Date(year, month, day));
  }

  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return cells;
}
