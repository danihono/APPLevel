import React, { useEffect, useRef, useState } from 'react';
import { t, getLocale } from '../../i18n';
import './controle-total.css';

// Graficos novos do Controle Total (dashboard). Desenham o que a view calcula com os dados reais.
export interface MonthFlow { key: string; label: string; revenue: number; expense: number }

const compactMoney = (value: number) => {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toLocaleString(getLocale(), { maximumFractionDigits: 1 })} M`;
  if (abs >= 1_000) return `${(value / 1_000).toLocaleString(getLocale(), { maximumFractionDigits: 1 })} mil`;
  return value.toLocaleString(getLocale(), { maximumFractionDigits: 0 });
};

const niceMax = (value: number) => {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  const n = value / power;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * power;
};

export const RevenueExpenseChart: React.FC<{ data: MonthFlow[]; formatCurrency: (value: number) => string }> = ({ data, formatCurrency }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const update = () => setWidth(Math.floor(el.clientWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const height = 240;
  const margin = { left: 44, right: 8, top: 14, bottom: 26 };
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = height - margin.top - margin.bottom;
  const max = niceMax(Math.max(...data.flatMap((entry) => [entry.revenue, entry.expense]), 1) * 1.08);
  const y = (value: number) => margin.top + innerH - (value / max) * innerH;
  const group = innerW / Math.max(1, data.length);
  const barW = Math.min(26, group * 0.3);
  const active = hover === null ? null : data[hover];

  return (
    <div className="ct-x-chart" ref={wrapRef} role="img" aria-label={t('Receita e despesa dos últimos meses')}>
      {width > 0 ? (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
          {[0, 0.25, 0.5, 0.75, 1].map((step) => (
            <g key={step}>
              <line className="ct-x-grid" x1={margin.left} x2={width - margin.right} y1={y(max * step)} y2={y(max * step)} />
              <text x={margin.left - 6} y={y(max * step) + 4} textAnchor="end">{compactMoney(max * step)}</text>
            </g>
          ))}
          {data.map((entry, index) => {
            const cx = margin.left + group * index + group / 2;
            return (
              <g key={entry.key} onMouseEnter={() => setHover(index)} onMouseLeave={() => setHover(null)}>
                <rect x={cx - group / 2} y={margin.top} width={group} height={innerH} fill="transparent" />
                <rect x={cx - barW - 2} y={y(entry.revenue)} width={barW} height={Math.max(0, margin.top + innerH - y(entry.revenue))} rx={7} fill="var(--lv-yellow)" />
                <rect x={cx + 2} y={y(entry.expense)} width={barW} height={Math.max(0, margin.top + innerH - y(entry.expense))} rx={7} className="ct-x-expense" />
                <text x={cx} y={height - 6} textAnchor="middle">{entry.label}</text>
              </g>
            );
          })}
        </svg>
      ) : null}
      {active ? (
        <div className="ct-x-tip" style={{ left: Math.max(70, Math.min(width - 70, margin.left + group * (hover as number) + group / 2)) }}>
          <b>{active.label}</b>
          <span>{t('Receita')} {formatCurrency(active.revenue)}</span>
          <span>{t('Despesa')} {formatCurrency(active.expense)}</span>
          <span className="ct-x-tip__sum">{t('Resultado')} {formatCurrency(active.revenue - active.expense)}</span>
        </div>
      ) : null}
    </div>
  );
};

export interface PendingRow { id: string; name: string; percent: number; amount: number }

export const PendingBars: React.FC<{ rows: PendingRow[]; formatCurrency: (value: number) => string }> = ({ rows, formatCurrency }) => {
  const max = Math.max(...rows.map((row) => row.percent), 1);
  if (rows.length === 0) return <div className="app-empty">{t('Sem vendas no periodo.')}</div>;
  return (
    <ul className="ct-x-bars">
      {rows.map((row) => {
        const tone = row.percent > 20 ? 'is-bad' : row.percent > 10 ? 'is-warn' : 'is-good';
        return (
          <li key={row.id}>
            <span className="ct-x-bars__name">{row.name}</span>
            <span className="ct-x-bars__track"><i className={tone} style={{ width: `${Math.max(3, (row.percent / max) * 100)}%` }} /></span>
            <b>{row.percent}%</b>
            <small>{formatCurrency(row.amount)}</small>
          </li>
        );
      })}
    </ul>
  );
};
