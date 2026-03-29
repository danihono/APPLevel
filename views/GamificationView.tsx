import React, { useState } from 'react';
import { Award, Flame, Gift, Target, TrendingUp, Trophy, Zap } from 'lucide-react';
import ProgressBar from '../components/ProgressBar';
import type { FirestoreEntity } from '../services/firebase/data';
import type { RankingRecord, UserMissionRecord } from '../services/firebase/models';

interface GamificationViewProps {
  missions: Array<FirestoreEntity<UserMissionRecord>>;
  rankings: Array<FirestoreEntity<RankingRecord>>;
  currentUserId: string;
  currentPoints: number;
}

const rewards = [
  { id: 1, title: 'Rashguard Exclusiva', points: 1000, icon: Gift },
  { id: 2, title: '15% Desconto na Mensalidade', points: 500, icon: Award },
  { id: 3, title: 'Aula Particular (30min)', points: 800, icon: Zap },
];

const GamificationView: React.FC<GamificationViewProps> = ({
  missions,
  rankings,
  currentUserId,
  currentPoints,
}) => {
  const [activeTab, setActiveTab] = useState<'missions' | 'ranking'>('missions');
  const [rankingCategory, setRankingCategory] = useState<'frequency' | 'consistency' | 'competition'>('frequency');

  const rankingsByCategory = {
    frequency: [...rankings].sort((left, right) => right.attendancePoints - left.attendancePoints),
    consistency: [...rankings].sort((left, right) => right.consistencyPoints - left.consistencyPoints),
    competition: [...rankings].sort((left, right) => right.competitionPoints - left.competitionPoints),
  };

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Gamificação</h1>
        <div className="flex items-center gap-2 bg-gold/20 px-3 py-1.5 rounded-full border border-gold/30">
          <Zap size={16} className="text-gold" />
          <span className="text-sm font-bold text-gold">{currentPoints} pts</span>
        </div>
      </div>

      <div className="flex bg-gray-100 dark:bg-dark-card p-1 rounded-xl">
        <button
          onClick={() => setActiveTab('missions')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'missions' ? 'bg-gold text-dark shadow-sm' : 'text-gray-500'}`}
        >
          <Target size={18} />
          Missões
        </button>
        <button
          onClick={() => setActiveTab('ranking')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'ranking' ? 'bg-gold text-dark shadow-sm' : 'text-gray-500'}`}
        >
          <Trophy size={18} />
          Ranking
        </button>
      </div>

      {activeTab === 'missions' ? (
        <div className="space-y-6">
          <section className="space-y-4">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Flame className="text-orange-500" size={20} />
              Missões Ativas
            </h2>

            {missions.length > 0 ? (
              <div className="space-y-3">
                {missions.map((mission) => {
                  const completed = mission.status === 'completed';
                  const progress = Math.min(mission.progressCurrent, mission.targetValue);

                  return (
                    <div key={mission.id} className={`bg-white dark:bg-dark-card p-4 rounded-2xl border border-gray-100 dark:border-white/5 space-y-3 ${completed ? 'opacity-70' : ''}`}>
                      <div className="flex justify-between items-start">
                        <div className="flex gap-3">
                          <div className={`p-2 rounded-xl ${completed ? 'bg-green-100 text-green-600' : 'bg-gold/10 text-gold'}`}>
                            {completed ? <Award size={20} /> : <Target size={20} />}
                          </div>
                          <div>
                            <h3 className="font-bold text-sm">{mission.missionName}</h3>
                            <p className="text-xs text-gray-500">{mission.metric.replaceAll('_', ' ')}</p>
                          </div>
                        </div>
                        <span className="text-xs font-bold text-gold">+{mission.rewardPoints} pts</span>
                      </div>
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-bold uppercase text-gray-400">
                          <span>Progresso</span>
                          <span>{progress}/{mission.targetValue}</span>
                        </div>
                        <ProgressBar current={progress} total={mission.targetValue} color={completed ? 'bg-green-500' : 'bg-gold'} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="bg-white dark:bg-dark-card p-5 rounded-2xl border border-gray-100 dark:border-white/5 text-sm text-gray-500">
                Nenhuma missão atribuída para este usuário ainda.
              </div>
            )}
          </section>

          <section className="space-y-4">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Gift className="text-amber-500" size={20} />
              Recompensas
            </h2>
            <div className="grid grid-cols-1 gap-3">
              {rewards.map((reward) => {
                const Icon = reward.icon;
                const unlocked = currentPoints >= reward.points;

                return (
                  <div key={reward.id} className="bg-white dark:bg-dark-card p-4 rounded-2xl border border-gray-100 dark:border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-amber-50 dark:bg-amber-500/10 rounded-xl text-amber-500">
                        <Icon size={20} />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm">{reward.title}</h3>
                        <p className="text-xs text-gray-500">Resgate por {reward.points} pts</p>
                      </div>
                    </div>
                    <button className={`px-4 py-2 rounded-xl text-xs font-bold ${unlocked ? 'bg-gold text-dark' : 'bg-gray-100 dark:bg-white/5 text-gray-400 cursor-not-allowed'}`}>
                      {unlocked ? 'Disponível' : 'Bloqueado'}
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
            {[
              { id: 'frequency', label: 'Frequência' },
              { id: 'consistency', label: 'Consistência' },
              { id: 'competition', label: 'Competição' },
            ].map((category) => (
              <button
                key={category.id}
                onClick={() => setRankingCategory(category.id as 'frequency' | 'consistency' | 'competition')}
                className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                  rankingCategory === category.id
                    ? 'bg-dark text-white dark:bg-white dark:text-black'
                    : 'bg-gray-100 text-gray-500 dark:bg-dark-card'
                }`}
              >
                {category.label}
              </button>
            ))}
          </div>

          {rankings.length > 0 ? (
            <section className="bg-white dark:bg-dark-card rounded-3xl border border-gray-100 dark:border-white/5 overflow-hidden">
              {rankingsByCategory[rankingCategory].map((entry, index) => {
                const value =
                  rankingCategory === 'frequency'
                    ? `${entry.attendancePoints} pts`
                    : rankingCategory === 'consistency'
                      ? `${entry.consistencyPoints} pts`
                      : `${entry.competitionPoints} pts`;

                return (
                  <div
                    key={entry.id}
                    className={`flex items-center justify-between p-4 ${index !== rankingsByCategory[rankingCategory].length - 1 ? 'border-b border-gray-100 dark:border-white/5' : ''} ${entry.userId === currentUserId ? 'bg-gold/5' : ''}`}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                        index === 0
                          ? 'bg-gold text-dark'
                          : index === 1
                            ? 'bg-gray-200 text-gray-600'
                            : index === 2
                              ? 'bg-orange-100 text-orange-600'
                              : 'text-gray-400'
                      }`}>
                        {index + 1}
                      </div>
                      <div>
                        <h3 className={`text-sm font-bold ${entry.userId === currentUserId ? 'text-gold' : ''}`}>
                          {entry.displayName} {entry.userId === currentUserId ? '(Você)' : ''}
                        </h3>
                        <p className="text-xs text-gray-500">{value}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-green-500">
                      <TrendingUp size={14} />
                    </div>
                  </div>
                );
              })}
            </section>
          ) : (
            <div className="bg-white dark:bg-dark-card p-5 rounded-2xl border border-gray-100 dark:border-white/5 text-sm text-gray-500">
              O ranking ainda não foi calculado para esta academia.
            </div>
          )}

          <div className="bg-blue-50 dark:bg-blue-500/10 p-4 rounded-2xl border border-blue-100 dark:border-blue-500/20">
            <p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed">
              <strong>Dica:</strong> o ranking é alimentado automaticamente por frequência, consistência e desempenho em competição.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default GamificationView;
