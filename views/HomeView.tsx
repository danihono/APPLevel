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
    <div className="space-y-6 animate-fadeIn">
      <section>
        <p className="text-xs font-semibold text-gold uppercase tracking-widest mb-1">{branch.name}</p>
        <h1 className="text-2xl font-bold">Olá, {user.name.split(' ')[0]}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">{branch.location}</p>
      </section>

      <div className="bg-white dark:bg-dark-card rounded-2xl p-5 border border-gray-100 dark:border-white/5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold flex items-center gap-2">
            <Trophy className="text-gold" size={20} />
            Minha Jornada
          </h2>
          <span className="text-[10px] bg-gold/10 text-gold px-2 py-0.5 rounded-full font-bold uppercase">
            {user.type}
          </span>
        </div>

        <BjjBelt color={user.belt} stripes={user.stripes} />
        <div className="mt-4 flex justify-between text-xs text-gray-500 dark:text-gray-400 gap-4">
          <span>Faixa {user.belt} - {user.stripes} graus</span>
          <span>Última graduação: {new Date(user.lastGraduation).toLocaleDateString('pt-BR')}</span>
        </div>

        <div className="mt-8 space-y-6">
          <ProgressBar
            label="Próximo grau"
            current={user.currentStripeProgress}
            total={user.classesToNextStripe}
          />
          <ProgressBar
            label="Próxima faixa"
            current={user.currentBeltProgress}
            total={user.totalClassesToNextBelt}
          />
        </div>
      </div>

      <div className="bg-gold/5 dark:bg-gold/10 border border-gold/20 rounded-2xl p-5">
        <h3 className="text-sm font-bold flex items-center gap-2 mb-2">
          <Sparkles className="text-gold" size={18} />
          Dica do Mestre
        </h3>
        <p className="text-sm italic text-gray-700 dark:text-gray-300">
          "{advice}"
        </p>
      </div>

      <div className="bg-white dark:bg-dark-card rounded-2xl p-5 border border-gray-100 dark:border-white/5 shadow-sm">
        <h2 className="font-bold mb-4 flex items-center gap-2">
          <CalIcon className="text-gold" size={20} />
          Frequência Mensal
        </h2>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: daysInMonth }).map((_, index) => {
            const day = index + 1;
            const attended = attendedDays.has(day);

            return (
              <div
                key={day}
                className={`aspect-square rounded-md flex items-center justify-center text-[10px] ${
                  attended
                    ? 'bg-gold text-black font-bold'
                    : 'bg-gray-50 dark:bg-white/5 text-gray-400'
                }`}
              >
                {day}
              </div>
            );
          })}
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/5 flex justify-between items-center text-sm">
          <span className="text-gray-500">Total de treinos no mês</span>
          <span className="font-bold text-lg text-gold">{monthlyAttendanceCount}</span>
        </div>
      </div>
    </div>
  );
};

export default HomeView;
