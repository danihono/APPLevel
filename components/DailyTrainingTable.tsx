import React, { useEffect, useMemo, useState } from 'react';
import { calculateDailyTraining } from '../dailyTrainingUtils';
import { subscribeToDailyTraining, type DailyTrainingSnapshot, type FirestoreEntity } from '../services/firebase/data';
import type { AcademyRecord, UserRecord } from '../services/firebase/models';

type Academy = Pick<AcademyRecord, 'id' | 'name' | 'timezone'>;

export function useDailyTraining(academies: Academy[], users: Array<FirestoreEntity<UserRecord>>) {
  const [now, setNow] = useState(Date.now);
  const [snapshot, setSnapshot] = useState<DailyTrainingSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const hour = Math.floor(now / 3_600_000);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    setSnapshot(null);
    setFailed(false);
    // O dia local mais antigo dos sete dias cabe neste intervalo em qualquer fuso.
    return subscribeToDailyTraining(new Date(hour * 3_600_000 - 8 * 86_400_000), setSnapshot, () => setFailed(true));
  }, [hour]);
  const rows = useMemo(() => calculateDailyTraining(academies, users, snapshot?.classes ?? [], snapshot?.attendances ?? [], now),
    [academies, users, snapshot, now]);
  return { rows, loading: snapshot === null, failed };
}

const SERIES_COLORS = ['#c48a13', '#4479c4', '#8a60b5', '#259388', '#cf6643', '#bd568e'];

export default function DailyTrainingChart({ data }: { data: ReturnType<typeof useDailyTraining> }) {
  const { rows, loading, failed } = data;
  const [selectedOffset, setSelectedOffset] = useState(0);
  const selectedDay = rows[0]?.days[selectedOffset];
  const values = rows.flatMap((row) => row.days.map((day) => day.count));
  const tickStep = Math.max(1, Math.ceil(Math.max(0, ...values) / 4));
  const maximum = tickStep * 4;
  const x = (offset: number) => 38 + (6 - offset) * 47;
  const y = (count: number) => 150 - count / maximum * 126;
  const shortDate = (date: string) => date.slice(5).split('-').reverse().join('/');
  return <section className="sa-card sa-daily-chart" aria-label="Alunos que treinaram por dia">
    <div className="sa-card__head">
      <h3 className="sa-card__title">Alunos por dia</h3>
      <span className="sa-daily-chart__period">7 dias</span>
    </div>
    <p className="sa-daily-chart__hint">Presença em aulas finalizadas · hoje parcial</p>
    {failed ? <p role="alert" className="sa-daily-chart__empty">Não foi possível carregar. Recarregue a página.</p>
      : loading ? <p role="status" className="sa-daily-chart__empty">Carregando presenças…</p>
      : rows.length === 0 ? <p className="sa-daily-chart__empty">Nenhuma academia neste recorte.</p>
      : <>
        <svg viewBox="0 0 348 180" className="sa-daily-chart__plot" role="group" aria-label="Alunos únicos por dia e academia. Selecione um dia para consultar os valores.">
          {Array.from({ length: 5 }, (_, index) => {
            const value = index * tickStep;
            return <g key={value} aria-hidden="true">
              <line x1="38" x2="320" y1={y(value)} y2={y(value)} className="sa-daily-chart__grid" />
              <text x="29" y={y(value) + 4} textAnchor="end">{value}</text>
            </g>;
          })}
          <line x1={x(selectedOffset)} x2={x(selectedOffset)} y1="18" y2="150" className="sa-daily-chart__cursor" aria-hidden="true" />
          {rows.map((row, index) => <g key={row.id} aria-hidden="true">
            <polyline points={[...row.days].reverse().map((day, i) => `${x(6 - i)},${y(day.count)}`).join(' ')}
              fill="none" stroke={SERIES_COLORS[index % SERIES_COLORS.length]} strokeWidth="2.5" strokeLinejoin="round" />
            {row.days.map((day, offset) => <circle key={day.date} cx={x(offset)} cy={y(day.count)} r={offset === selectedOffset ? 4 : 2.5}
              fill={SERIES_COLORS[index % SERIES_COLORS.length]} />)}
          </g>)}
          {[6, 5, 4, 3, 2, 1, 0].map((offset) => <g key={offset} role="button" tabIndex={0}
            aria-label={rows.map((row) => `${row.name}, ${shortDate(row.days[offset].date)}: ${row.days[offset].count} alunos`).join('; ')}
            aria-pressed={offset === selectedOffset} onClick={() => setSelectedOffset(offset)}
            onMouseEnter={() => setSelectedOffset(offset)}
            onFocus={() => setSelectedOffset(offset)}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedOffset(offset); } }}>
            <rect x={x(offset) - 20} y="12" width="40" height="164" fill="transparent" className="sa-daily-chart__hit" />
            <text x={x(offset)} y="171" textAnchor="middle" aria-hidden="true">{offset === 0 ? 'Hoje' : shortDate(rows[0].days[offset].date)}</text>
          </g>)}
        </svg>
        <div className="sa-daily-chart__legend" aria-live="polite" aria-label={`Presenças de ${selectedDay ? shortDate(selectedDay.date) : ''}`}>
          {rows.map((row, index) => <div key={row.id} className="sa-daily-chart__series">
            <span className="sa-daily-chart__dot" style={{ background: SERIES_COLORS[index % SERIES_COLORS.length] }} />
            <span title={row.name}>{row.name}</span>
            <strong>{row.days[selectedOffset].count}</strong>
          </div>)}
        </div>
        <p className="sa-daily-chart__hint sa-daily-chart__footnote">{selectedDay ? shortDate(selectedDay.date) : ''} · alunos únicos · fuso de cada academia</p>
      </>}
  </section>;
}
