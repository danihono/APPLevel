
import React, { useEffect, useState } from 'react';
import { Sparkles, Trophy, Calendar as CalIcon } from 'lucide-react';
import BjjBelt from '../components/BjjBelt';
import ProgressBar from '../components/ProgressBar';
import { User, Branch } from '../types';
import { getTrainingAdvice } from '../services/geminiService';

interface HomeViewProps {
  user: User;
  branch: Branch;
}

const HomeView: React.FC<HomeViewProps> = ({ user, branch }) => {
  const [advice, setAdvice] = useState<string>('Carregando dica do mestre...');

  useEffect(() => {
    const fetchAdvice = async () => {
      const tip = await getTrainingAdvice(user);
      setAdvice(tip);
    };
    fetchAdvice();
  }, [user]);

  return (
    <div className="space-y-6 animate-fadeIn">
      <section>
        <p className="text-xs font-semibold text-gold uppercase tracking-widest mb-1">{branch.name}</p>
        <h1 className="text-2xl font-bold">Olá, {user.name.split(' ')[0]}</h1>
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
        <div className="mt-4 flex justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>Faixa {user.belt} - {user.stripes} Graus</span>
          <span>Última graduação: {new Date(user.lastGraduation).toLocaleDateString('pt-BR')}</span>
        </div>

        <div className="mt-8 space-y-6">
          <ProgressBar label="Próximo Grau" current={5} total={30} />
          <ProgressBar label="Próximo Exame" current={65} total={150} />
        </div>
      </div>

      <div className="bg-gold/5 dark:bg-gold/10 border border-gold/20 rounded-2xl p-5">
        <h3 className="text-sm font-bold flex items-center gap-2 mb-2">
          <Sparkles className="text-gold" size={18} />
          Dica do Mestre (AI)
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
          {Array.from({ length: 31 }).map((_, i) => (
            <div key={i} className={`aspect-square rounded-md flex items-center justify-center text-[10px] ${[2, 5, 8, 12, 15, 19, 22].includes(i+1) ? 'bg-gold text-black font-bold' : 'bg-gray-50 dark:bg-white/5 text-gray-400'}`}>
              {i + 1}
            </div>
          ))}
        </div>
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/5 flex justify-between items-center text-sm">
          <span className="text-gray-500">Total de treinos no mês</span>
          <span className="font-bold text-lg text-gold">14</span>
        </div>
      </div>
    </div>
  );
};

export default HomeView;
