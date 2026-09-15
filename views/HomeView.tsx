import React, { useMemo } from 'react';
import {
  getBlackBeltProgressForUser,
  getUserProgressionSummary,
  type ProgressionRules,
} from '../beltCatalog';
import { Calendar as CalIcon, Trophy } from 'lucide-react';
import BjjBelt from '../components/BjjBelt';
import ProgressBar from '../components/ProgressBar';
import type { User } from '../types';

interface HomeViewProps {
  user: User;
  monthlyAttendanceCount: number;
  attendanceDays: number[];
  progressionRules?: ProgressionRules | null;
}

const HomeView: React.FC<HomeViewProps> = ({
  user,
  monthlyAttendanceCount,
  attendanceDays,
  progressionRules,
}) => {
  const today = new Date();

  const progression = useMemo(
    () => getUserProgressionSummary(user, progressionRules),
    [progressionRules, user],
  );
  // Faixa preta: grau por tempo (padrão IBJJF) + override manual, em vez de progresso por presença.
  const blackBeltProgress = useMemo(
    () => getBlackBeltProgressForUser(user),
    [user.belt, user.lastGraduation, user.blackBeltDegreeManual],
  );
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const attendedDays = new Set(attendanceDays);

  return (
    <div className="view-shell">
      <section className="app-panel app-panel-pad">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell">
              <Trophy size={18} />
            </div>
            <div>
              <p className="app-section-label">Minha jornada</p>
              <h2 className="text-2xl font-bold">Progresso de faixa e grau</h2>
            </div>
          </div>
        </div>
        <p className="app-section-copy mt-4">
          {blackBeltProgress
            ? `${blackBeltProgress.title} desde ${blackBeltProgress.startDate.getFullYear()} · ${blackBeltProgress.years} ${blackBeltProgress.years === 1 ? 'ano' : 'anos'} de faixa preta.`
            : `Última graduação em ${new Date(user.lastGraduation).toLocaleDateString('pt-BR')}.`}
        </p>

        <div className="mt-6">
          <BjjBelt color={user.belt} stripes={blackBeltProgress ? blackBeltProgress.degree : user.stripes} blackBelt={blackBeltProgress} />
        </div>

        {blackBeltProgress ? (
          <div className="mt-6 space-y-2">
            <p className="text-lg font-bold">{blackBeltProgress.degreeLabel || 'Faixa preta lisa'}</p>
            <p className="app-section-copy">
              {blackBeltProgress.styleNote ? `${blackBeltProgress.styleNote}. ` : ''}
              {blackBeltProgress.nextDegree != null && blackBeltProgress.yearsToNextDegree != null
                ? `Faltam ${blackBeltProgress.yearsToNextDegree} ${blackBeltProgress.yearsToNextDegree === 1 ? 'ano' : 'anos'} para o ${blackBeltProgress.nextDegree}º grau.`
                : 'Grau máximo alcançado.'}
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-5">
            <ProgressBar
              label="Próximo grau"
              current={progression.stripeCycleProgress}
              total={progression.stripeCycleTotal}
            />
            <ProgressBar
              label="Próxima faixa"
              current={progression.beltProgress}
              total={progression.beltTotal}
            />
          </div>
        )}
      </section>

      <section className="app-panel app-panel-pad">
        <div className="flex items-center gap-3">
          <div className="app-icon-shell">
            <CalIcon size={18} />
          </div>
          <div>
            <p className="app-section-label">Frequência mensal</p>
            <h2 className="text-xl font-bold">Mapa de presenças do mês</h2>
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
          <span className="text-sm text-[color:var(--text-muted)]">Total de treinos no mês</span>
          <strong className="text-2xl font-bold text-[color:var(--gold-mid)]">{monthlyAttendanceCount}</strong>
        </div>
      </section>
    </div>
  );
};

export default HomeView;
