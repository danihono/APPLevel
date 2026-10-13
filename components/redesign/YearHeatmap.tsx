import React, { useLayoutEffect, useMemo, useRef } from 'react';
import { createDateFormatter, t } from '../../i18n';
import { CountUp } from './motion';
import './year-heatmap.css';

interface YearHeatmapProps {
  /** Treinos que contam por dia (chave YYYY-MM-DD no fuso da academia). */
  countsByDay: Map<string, number>;
  /** Hoje (YYYY-MM-DD no fuso da academia). */
  todayKey: string;
}

const monthShortFormatter = createDateFormatter({ month: 'short' });
const weekdayLongFormatter = createDateFormatter({ weekday: 'long' });
const monthLongFormatter = createDateFormatter({ month: 'long' });
const dayLabelFormatter = createDateFormatter({ day: 'numeric', month: 'long' });

const CELL = 11;
const GAP = 3;
const pad2 = (value: number) => String(value).padStart(2, '0');
const keyOf = (date: Date) => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
const capitalize = (value: string) => (value ? value.charAt(0).toLocaleUpperCase() + value.slice(1) : value);

interface Cell {
  key: string;
  date: Date;
  week: number;
  inYear: boolean;
  future: boolean;
  count: number;
}

/** Mapa de treinos do ano: um quadrado por dia, semanas em colunas (segunda a domingo). */
const YearHeatmap: React.FC<YearHeatmapProps> = ({ countsByDay, todayKey }) => {
  const year = Number(todayKey.slice(0, 4));
  const scrollRef = useRef<HTMLDivElement>(null);

  const data = useMemo(() => {
    const jan1 = new Date(year, 0, 1);
    const start = new Date(year, 0, 1 - ((jan1.getDay() + 6) % 7));
    const cells: Cell[] = [];
    const months: Array<{ label: string; week: number }> = [];
    const byMonth = new Array(12).fill(0);
    const byWeekday = new Array(7).fill(0);
    const weekHas: boolean[] = [];
    let total = 0;
    let currentWeek = 0;

    for (let index = 0; ; index += 1) {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      const week = Math.floor(index / 7);
      const weekday = index % 7;
      if (weekday === 0 && date.getFullYear() > year) break;
      const key = keyOf(date);
      const inYear = date.getFullYear() === year;
      const future = key > todayKey;
      const count = inYear && !future ? countsByDay.get(key) ?? 0 : 0;
      if (key === todayKey) currentWeek = week;
      if (count > 0) {
        total += count;
        byMonth[date.getMonth()] += count;
        byWeekday[weekday] += count;
        weekHas[week] = true;
      }
      if (inYear && date.getDate() <= 7 && weekday === 0) {
        months.push({ label: monthShortFormatter.format(date).replace('.', ''), week });
      }
      cells.push({ key, date, week, inYear, future, count });
    }

    let record = 0;
    let run = 0;
    for (let week = 0; week <= currentWeek; week += 1) {
      run = weekHas[week] ? run + 1 : 0;
      record = Math.max(record, run);
    }
    const bestMonth = byMonth.reduce((best, value, index) => (value > byMonth[best] ? index : best), 0);
    const bestWeekday = byWeekday.reduce((best, value, index) => (value > byWeekday[best] ? index : best), 0);

    return { cells, months, total, record, bestMonth, bestMonthCount: byMonth[bestMonth], bestWeekday, currentWeek };
  }, [countsByDay, todayKey, year]);

  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const target = (data.currentWeek + 3) * (CELL + GAP) - element.clientWidth;
    element.scrollLeft = Math.max(0, target);
  }, [data.currentWeek]);

  const bestMonthLabel = data.total > 0
    ? `${capitalize(monthLongFormatter.format(new Date(year, data.bestMonth, 15)))} · ${data.bestMonthCount}`
    : '—';
  // 1/1/2024 foi segunda-feira.
  const bestWeekdayLabel = data.total > 0 ? capitalize(weekdayLongFormatter.format(new Date(2024, 0, 1 + data.bestWeekday))) : '—';

  return (
    <section className="lv-section rd-year" aria-labelledby="rd-year-title">
      <h2 id="rd-year-title" className="lv-section__title">{t('Seu ano no tatame')}</h2>
      <div className="lv-card rd-year__card">
        <div className="rd-year__head">
          <p className="rd-year__total">
            <strong><CountUp value={data.total} durationMs={1200} /></strong>
            <span>{data.total === 1 ? t('treino em {year}', { year }) : t('treinos em {year}', { year })}</span>
          </p>
          <span className="rd-year__legend" aria-hidden="true">
            {t('Menos')} <i /><i className="is-l1" /><i className="is-l2" /> {t('Mais')}
          </span>
        </div>
        <div className="rd-year__scroll" ref={scrollRef}>
          <div className="rd-year__months" aria-hidden="true" style={{ width: (data.currentWeek + 1) * (CELL + GAP) }}>
            {data.months.map((month) => (
              <span key={month.week} style={{ left: month.week * (CELL + GAP) }}>{month.label}</span>
            ))}
          </div>
          <div className="rd-year__grid" role="list" aria-label={t('Mapa de treinos do ano, um quadrado por dia')}>
            {data.cells.map((cell) => {
              const level = cell.count >= 2 ? ' is-l2' : cell.count === 1 ? ' is-l1' : '';
              const className = `rd-year__cell${level}${!cell.inYear ? ' is-out' : ''}${cell.future ? ' is-future' : ''}${cell.key === todayKey ? ' is-today' : ''}`;
              const label = `${dayLabelFormatter.format(cell.date)} · ${cell.count === 0
                ? t('Sem treino')
                : cell.count === 1 ? t('1 treino') : t('{count} treinos', { count: cell.count })}`;
              return (
                <i
                  key={cell.key}
                  className={className}
                  role={cell.inYear && !cell.future ? 'listitem' : undefined}
                  aria-label={cell.inYear && !cell.future ? label : undefined}
                  aria-hidden={cell.inYear && !cell.future ? undefined : true}
                  style={{ ['--c' as string]: Math.max(0, cell.week - data.currentWeek + 22) }}
                />
              );
            })}
          </div>
        </div>
      </div>
      <dl className="lv-list rd-year__facts">
        <div className="rd-year__fact"><dt>{t('Maior sequência')}</dt><dd>{data.record === 1 ? t('1 semana') : t('{count} semanas', { count: data.record })}</dd></div>
        <div className="rd-year__fact"><dt>{t('Mês mais forte')}</dt><dd>{bestMonthLabel}</dd></div>
        <div className="rd-year__fact"><dt>{t('Dia favorito')}</dt><dd>{bestWeekdayLabel}</dd></div>
      </dl>
    </section>
  );
};

export default YearHeatmap;
