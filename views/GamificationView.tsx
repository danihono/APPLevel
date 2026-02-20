import React, { useState } from 'react';
import { Target, Zap, Award, Flame, TrendingUp, ChevronRight, Star, Gift, Trophy } from 'lucide-react';
import ProgressBar from '../components/ProgressBar';

const GamificationView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'missions' | 'ranking'>('missions');
  const [rankingCategory, setRankingCategory] = useState<'frequency' | 'consistency' | 'competition'>('frequency');

  const missions = [
    { id: 1, title: 'Guerreiro da Semana', description: 'Treine 3x na semana', progress: 2, total: 3, points: 50, icon: Flame },
    { id: 2, title: 'Espírito de Equipe', description: 'Participe do Open Mat de sábado', progress: 0, total: 1, points: 30, icon: Users },
    { id: 3, title: 'Mestre da Indicação', description: 'Traga um amigo para aula experimental', progress: 1, total: 1, points: 100, icon: Star, completed: true },
    { id: 4, title: 'Foco Total', description: 'Complete 10 treinos no mês', progress: 7, total: 10, points: 80, icon: Target },
  ];

  const rewards = [
    { id: 1, title: 'Rashguard Exclusiva', points: 1000, icon: Gift },
    { id: 2, title: '15% Desconto na Mensalidade', points: 500, icon: Award },
    { id: 3, title: 'Aula Particular (30min)', points: 800, icon: Zap },
  ];

  const rankings = {
    frequency: [
      { id: 1, name: 'João Silva', value: '24 treinos', trend: 'up' },
      { id: 2, name: 'Maria Santos', value: '22 treinos', trend: 'stable' },
      { id: 3, name: 'Você', value: '18 treinos', trend: 'up', isMe: true },
      { id: 4, name: 'Pedro Costa', value: '17 treinos', trend: 'down' },
    ],
    consistency: [
      { id: 1, name: 'Ana Oliveira', value: '12 semanas', trend: 'up' },
      { id: 2, name: 'Você', value: '10 semanas', trend: 'up', isMe: true },
      { id: 3, name: 'Lucas Pereira', value: '9 semanas', trend: 'stable' },
      { id: 4, name: 'Maria Santos', value: '8 semanas', trend: 'down' },
    ],
    competition: [
      { id: 1, name: 'Pedro Costa', value: '450 pts', trend: 'up' },
      { id: 2, name: 'Ana Oliveira', value: '380 pts', trend: 'up' },
      { id: 3, name: 'João Silva', value: '310 pts', trend: 'stable' },
      { id: 4, name: 'Você', value: '150 pts', trend: 'up', isMe: true },
    ]
  };

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Gamificação</h1>
        <div className="flex items-center gap-2 bg-gold/20 px-3 py-1.5 rounded-full border border-gold/30">
          <Zap size={16} className="text-gold" />
          <span className="text-sm font-bold text-gold">450 pts</span>
        </div>
      </div>

      {/* Main Tabs */}
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
          {/* Active Missions */}
          <section className="space-y-4">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Flame className="text-orange-500" size={20} />
              Missões Ativas
            </h2>
            <div className="space-y-3">
              {missions.map(mission => {
                const Icon = mission.icon;
                return (
                  <div key={mission.id} className={`bg-white dark:bg-dark-card p-4 rounded-2xl border border-gray-100 dark:border-white/5 space-y-3 ${mission.completed ? 'opacity-70' : ''}`}>
                    <div className="flex justify-between items-start">
                      <div className="flex gap-3">
                        <div className={`p-2 rounded-xl ${mission.completed ? 'bg-green-100 text-green-600' : 'bg-gold/10 text-gold'}`}>
                          <Icon size={20} />
                        </div>
                        <div>
                          <h3 className="font-bold text-sm">{mission.title}</h3>
                          <p className="text-xs text-gray-500">{mission.description}</p>
                        </div>
                      </div>
                      <span className="text-xs font-bold text-gold">+{mission.points} pts</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-bold uppercase text-gray-400">
                        <span>Progresso</span>
                        <span>{mission.progress}/{mission.total}</span>
                      </div>
                      <ProgressBar current={mission.progress} total={mission.total} color={mission.completed ? 'bg-green-500' : 'bg-gold'} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Rewards */}
          <section className="space-y-4">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <Gift className="text-purple-500" size={20} />
              Recompensas
            </h2>
            <div className="grid grid-cols-1 gap-3">
              {rewards.map(reward => {
                const Icon = reward.icon;
                return (
                  <div key={reward.id} className="bg-white dark:bg-dark-card p-4 rounded-2xl border border-gray-100 dark:border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-purple-50 dark:bg-purple-500/10 rounded-xl text-purple-500">
                        <Icon size={20} />
                      </div>
                      <div>
                        <h3 className="font-bold text-sm">{reward.title}</h3>
                        <p className="text-xs text-gray-500">Resgate por {reward.points} pts</p>
                      </div>
                    </div>
                    <button className="px-4 py-2 bg-gray-100 dark:bg-white/5 text-gray-400 rounded-xl text-xs font-bold cursor-not-allowed">
                      Bloqueado
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Ranking Categories */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
            {[
              { id: 'frequency', label: 'Frequência' },
              { id: 'consistency', label: 'Consistência' },
              { id: 'competition', label: 'Competição' }
            ].map(cat => (
              <button
                key={cat.id}
                onClick={() => setRankingCategory(cat.id as any)}
                className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                  rankingCategory === cat.id 
                    ? 'bg-dark text-white dark:bg-white dark:text-black' 
                    : 'bg-gray-100 text-gray-500 dark:bg-dark-card'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Ranking List */}
          <section className="bg-white dark:bg-dark-card rounded-3xl border border-gray-100 dark:border-white/5 overflow-hidden">
            {rankings[rankingCategory].map((user, index) => (
              <div 
                key={user.id} 
                className={`flex items-center justify-between p-4 ${index !== rankings[rankingCategory].length - 1 ? 'border-b border-gray-100 dark:border-white/5' : ''} ${user.isMe ? 'bg-gold/5' : ''}`}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                    index === 0 ? 'bg-gold text-dark' : 
                    index === 1 ? 'bg-gray-200 text-gray-600' : 
                    index === 2 ? 'bg-orange-100 text-orange-600' : 'text-gray-400'
                  }`}>
                    {index + 1}
                  </div>
                  <div>
                    <h3 className={`text-sm font-bold ${user.isMe ? 'text-gold' : ''}`}>
                      {user.name} {user.isMe && '(Você)'}
                    </h3>
                    <p className="text-xs text-gray-500">{user.value}</p>
                  </div>
                </div>
                <div className={`flex items-center gap-1 ${
                  user.trend === 'up' ? 'text-green-500' : 
                  user.trend === 'down' ? 'text-red-500' : 'text-gray-400'
                }`}>
                  <TrendingUp size={14} className={user.trend === 'down' ? 'rotate-180' : ''} />
                </div>
              </div>
            ))}
          </section>

          {/* Info Card */}
          <div className="bg-blue-50 dark:bg-blue-500/10 p-4 rounded-2xl border border-blue-100 dark:border-blue-500/20">
            <p className="text-xs text-blue-600 dark:text-blue-400 leading-relaxed">
              <strong>Dica:</strong> Alunos com 100% de consistência no mês ganham um bônus de 100 pontos extras!
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

// Mock Users icon since it wasn't imported
const Users = ({ size }: { size: number }) => <Star size={size} />;

export default GamificationView;
