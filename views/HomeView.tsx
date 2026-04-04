import React, { useEffect, useState } from 'react';
import { Calendar as CalIcon, Sparkles, Trophy } from 'lucide-react';
import BjjBelt from '../components/BjjBelt';
import ProgressBar from '../components/ProgressBar';
import { getTrainingAdvice } from '../services/geminiService';
import type { Branch, User } from '../types';

interface HomeViewProps {
  user: User;
  branch: Branch;
  monthlyAttendanceCount: number;
  attendanceDays: number[];
}

const HomeView: React.FC<HomeViewProps> = ({
  user,
  branch,
  monthlyAttendanceCount,
  attendanceDays,
}) => {
  const [advice, setAdvice] = useState<string>('Carregando dica do mestre...');
  const today = new Date();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const attendedDays = new Set(attendanceDays);

  useEffect(() => {
    let active = true;

    async function fetchAdvice() {
      const tip = await getTrainingAdvice(user);
      if (active) {
        setAdvice(tip);
      }
    }

    void fetchAdvice();

    return () => {
      active = false;
    };
  }, [
    user.id,
    user.name,
    user.belt,
    user.stripes,
    user.currentStripeProgress,
    user.currentBeltProgress,
  ]);

  return (
    <div className="view-shell">
      <section className="app-panel app-panel-pad">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold">{branch.name}</p>
            <p className="mt-2 text-sm text-[color:var(--text-muted)]">
              Ola, {user.name.split(' ')[0]}. {branch.location}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className="app-badge app-badge--gold">Faixa {user.belt}</span>
            <span className="app-badge app-badge--muted">{user.type}</span>
          </div>
        </div>
      </section>

      <section className="app-stat-grid">
        <div className="app-stat-card">
          <p className="app-stat-card__label">Categoria</p>
          <p className="app-stat-card__value">{user.type}</p>
          <p className="app-stat-card__note">Faixa {user.belt}</p>
        </div>
        <div className="app-stat-card">
          <p className="app-stat-card__label">Treinos no mes</p>
          <p className="app-stat-card__value">{monthlyAttendanceCount}</p>
          <p className="app-stat-card__note">{attendanceDays.length} dias diferentes</p>
        </div>
      </section>

      <section className="app-panel app-panel-pad">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <div className="app-icon-shell">
                <Trophy size={18} />
              </div>
              <div>
                <p className="app-section-label">Minha jornada</p>
                <h2 className="text-2xl font-bold">Progresso de faixa e grau</h2>
              </div>
            </div>
            <p className="app-section-copy mt-4">
              Ultima graduacao em {new Date(user.lastGraduation).toLocaleDateString('pt-BR')}.
            </p>
          </div>
          <span className="app-badge app-badge--gold">{user.type}</span>
        </div>

        <div className="mt-6">
          <BjjBelt color={user.belt} stripes={user.stripes} />
        </div>

        <div className="mt-6 space-y-5">
          <ProgressBar
            label="Proximo grau"
            current={user.currentStripeProgress}
            total={user.classesToNextStripe}
          />
          <ProgressBar
            label="Proxima faixa"
            current={user.currentBeltProgress}
            total={user.totalClassesToNextBelt}
          />
        </div>
      </section>

      <section className="app-panel app-panel--tint app-panel-pad">
        <div className="flex items-center gap-3">
          <div className="app-icon-shell">
            <Sparkles size={18} />
          </div>
          <div>
            <p className="app-section-label">Dica do mestre</p>
            <h2 className="text-xl font-bold">Ajuste fino para o treino de hoje</h2>
          </div>
        </div>
        <p className="mt-4 text-sm leading-7 text-[color:var(--text-muted)]">"{advice}"</p>
      </section>

      <section className="app-panel app-panel-pad">
        <div className="flex items-center gap-3">
          <div className="app-icon-shell">
            <CalIcon size={18} />
          </div>
          <div>
            <p className="app-section-label">Frequencia mensal</p>
            <h2 className="text-xl font-bold">Mapa de presencas do mes</h2>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-7 gap-2">
          {Array.from({ length: daysInMonth }).map((_, index) => {
            const day = index + 1;
            const attended = attendedDays.has(day);

            return (
              <div
                key={day}
                className={`flex aspect-square items-center justify-center rounded-2xl border text-xs font-bold ${
                  attended ? 'bg-amber-200/85 text-stone-900 border-amber-100 shadow-[0_14px_30px_rgba(232,175,72,0.18)]' : 'border-white/10 bg-white/10 text-[color:var(--text-soft)]'
                }`}
              >
                {day}
              </div>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-between rounded-[1.4rem] border border-white/10 bg-white/10 px-4 py-4">
          <span className="text-sm text-[color:var(--text-muted)]">Total de treinos no mes</span>
          <strong className="text-2xl font-bold text-[color:var(--gold-mid)]">{monthlyAttendanceCount}</strong>
        </div>
      </section>
    </div>
  );
};

export default HomeView;
