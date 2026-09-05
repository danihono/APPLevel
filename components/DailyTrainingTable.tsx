import React, { useEffect, useMemo, useState } from 'react';
import { calculateDailyTraining } from '../dailyTrainingUtils';
import { subscribeToDailyTraining, type DailyTrainingSnapshot, type FirestoreEntity } from '../services/firebase/data';
import type { AcademyRecord, UserRecord } from '../services/firebase/models';

export default function DailyTrainingTable({ academies, users }: {
  academies: Array<Pick<AcademyRecord, 'id' | 'name' | 'timezone'>>;
  users: Array<FirestoreEntity<UserRecord>>;
}) {
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
  const formatDay = (day: string) => day.split('-').reverse().join('/');
  return <section className="sa-card sa-daily-training" aria-label="Alunos que treinaram por dia">
    <div className="sa-card__head"><h3 className="sa-card__title">Alunos que treinaram por dia</h3></div>
    <p className="sa-participation-note">Últimos 7 dias · cada aluno conta uma vez por dia e academia, com presença confirmada em aula finalizada. Hoje é parcial.</p>
    <p className="sa-participation-note">Datas no fuso de cada academia. Agendamentos sem presença não entram.</p>
    {failed ? <p role="alert">Não foi possível carregar os dados. Recarregue a página para tentar novamente.</p>
      : !snapshot ? <p role="status">Carregando presenças e aulas…</p>
      : rows.length === 0 ? <p>Nenhuma academia neste recorte.</p>
      : <div className="sa-daily-training__scroll" tabIndex={0} role="region" aria-label="Tabela de alunos por dia e academia">
        <table className="sa-table">
          <thead><tr><th scope="col">Dia</th>{rows.map((row) => <th scope="col" key={row.id}>{row.name}</th>)}</tr></thead>
          <tbody>{Array.from({ length: 7 }, (_, offset) => <tr key={offset}>
            <th scope="row">{offset === 0 ? 'Hoje' : offset === 1 ? 'Ontem' : `${offset} dias atrás`}</th>
            {rows.map((row) => <td key={row.id}>
              <strong>{row.days[offset].count} {row.days[offset].count === 1 ? 'aluno' : 'alunos'}</strong>
              <span className="sa-daily-training__date">{formatDay(row.days[offset].date)}</span>
            </td>)}
          </tr>)}</tbody>
        </table>
      </div>}
  </section>;
}
