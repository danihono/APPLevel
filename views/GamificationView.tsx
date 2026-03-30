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
    <div className="view-shell">
      <section className="app-panel app-panel--hero app-panel-pad">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="app-section-label">Momentum</p>
            <h1 className="app-section-title">Gamificacao com energia de colecionavel premium.</h1>
            <p className="app-section-copy">
              Progresso, ranking e resgate agora vivem no mesmo sistema de luz, vidro e metal do restante do app.
            </p>
          </div>
          <div className="app-orb">
            <Zap size={16} />
            {currentPoints} pts
          </div>
        </div>

        <div className="mt-6 app-segment app-segment--block">
          <button
            type="button"
            onClick={() => setActiveTab('missions')}
            className={`app-segment__button ${activeTab === 'missions' ? 'is-active' : ''}`}
          >
            <Target size={16} />
            Missoes
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ranking')}
            className={`app-segment__button ${activeTab === 'ranking' ? 'is-active' : ''}`}
          >
            <Trophy size={16} />
            Ranking
          </button>
        </div>
      </section>

      {activeTab === 'missions' ? (
        <>
          <section className="app-list">
            <div className="flex items-center gap-3">
              <div className="app-icon-shell">
                <Flame size={18} />
              </div>
              <div>
                <p className="app-section-label">Missoes ativas</p>
                <h2 className="text-xl font-bold">Objetivos em andamento</h2>
              </div>
            </div>

            {missions.length > 0 ? (
              missions.map((mission) => {
                const completed = mission.status === 'completed';
                const progress = Math.min(mission.progressCurrent, mission.targetValue);

                return (
                  <article key={mission.id} className="app-panel app-panel-pad">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex gap-3">
                        <div className="app-icon-shell">
                          {completed ? <Award size={18} /> : <Target size={18} />}
                        </div>
                        <div>
                          <h3 className="text-lg font-bold">{mission.missionName}</h3>
                          <p className="mt-2 text-sm text-[color:var(--text-soft)]">{mission.metric.replaceAll('_', ' ')}</p>
                        </div>
                      </div>
                      <span className={completed ? 'app-badge app-badge--success' : 'app-badge app-badge--gold'}>
                        +{mission.rewardPoints} pts
                      </span>
                    </div>

                    <div className="mt-5">
                      <ProgressBar current={progress} total={mission.targetValue} color={completed ? 'bg-green-500' : 'bg-gold'} />
                      <p className="mt-3 text-xs font-bold uppercase tracking-[0.24em] text-[color:var(--text-soft)]">
                        Progresso {progress}/{mission.targetValue}
                      </p>
                    </div>
                  </article>
                );
              })
            ) : (
              <div className="app-empty">Nenhuma missao atribuida para este usuario ainda.</div>
            )}
          </section>

          <section className="app-list">
            <div className="flex items-center gap-3">
              <div className="app-icon-shell">
                <Gift size={18} />
              </div>
              <div>
                <p className="app-section-label">Recompensas</p>
                <h2 className="text-xl font-bold">O que ja esta ao alcance</h2>
              </div>
            </div>

            {rewards.map((reward) => {
              const Icon = reward.icon;
              const unlocked = currentPoints >= reward.points;

              return (
                <article key={reward.id} className="app-panel app-panel-pad">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="app-icon-shell">
                        <Icon size={18} />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold">{reward.title}</h3>
                        <p className="mt-1 text-sm text-[color:var(--text-soft)]">Resgate por {reward.points} pts</p>
                      </div>
                    </div>
                    <button type="button" disabled={!unlocked} className={`app-button app-button--small ${unlocked ? 'app-button--gold' : 'app-button--ghost'}`}>
                      {unlocked ? 'Disponivel' : 'Bloqueado'}
                    </button>
                  </div>
                </article>
              );
            })}
          </section>
        </>
      ) : (
        <>
          <div className="app-chip-row">
            {[
              { id: 'frequency', label: 'Frequencia' },
              { id: 'consistency', label: 'Consistencia' },
              { id: 'competition', label: 'Competicao' },
            ].map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => setRankingCategory(category.id as 'frequency' | 'consistency' | 'competition')}
                className={`app-chip ${rankingCategory === category.id ? 'is-active' : ''}`}
              >
                {category.label}
              </button>
            ))}
          </div>

          {rankings.length > 0 ? (
            <section className="app-panel app-panel-pad">
              <div className="app-list">
                {rankingsByCategory[rankingCategory].map((entry, index) => {
                  const value =
                    rankingCategory === 'frequency'
                      ? `${entry.attendancePoints} pts`
                      : rankingCategory === 'consistency'
                        ? `${entry.consistencyPoints} pts`
                        : `${entry.competitionPoints} pts`;

                  return (
                    <div key={entry.id} className="app-list-card flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full font-bold ${
                          index === 0
                            ? 'bg-amber-200/90 text-stone-900'
                            : index === 1
                              ? 'bg-white/60 text-stone-700'
                              : index === 2
                                ? 'bg-orange-200/80 text-orange-900'
                                : 'bg-white/10 text-[color:var(--text-soft)]'
                        }`}
                        >
                          {index + 1}
                        </div>
                        <div>
                          <h3 className={`text-sm font-bold ${entry.userId === currentUserId ? 'text-[color:var(--gold-mid)]' : ''}`}>
                            {entry.displayName} {entry.userId === currentUserId ? '(Voce)' : ''}
                          </h3>
                          <p className="mt-1 text-xs text-[color:var(--text-soft)]">{value}</p>
                        </div>
                      </div>
                      <TrendingUp size={16} className="text-[color:var(--success)]" />
                    </div>
                  );
                })}
              </div>
            </section>
          ) : (
            <div className="app-empty">O ranking ainda nao foi calculado para esta academia.</div>
          )}

          <section className="app-panel app-panel--tint app-panel-pad">
            <p className="app-section-label">Dica</p>
            <p className="app-section-copy mt-3">
              O ranking e alimentado automaticamente por frequencia, consistencia e desempenho em competicao.
            </p>
          </section>
        </>
      )}
    </div>
  );
};

export default GamificationView;
