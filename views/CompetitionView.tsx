import React, { useState } from 'react';
import {
  Bell,
  Calendar,
  CheckSquare,
  ExternalLink,
  Medal,
  Trophy,
  Video,
  Weight,
} from 'lucide-react';
import { formatDateLabel } from '../services/firebase/adapters';
import type { FirestoreEntity } from '../services/firebase/data';
import type { CompetitionRecord, FightRecord } from '../services/firebase/models';
import { getYouTubeEmbedUrl } from '../utils';

interface CompetitionViewProps {
  competitions: Array<FirestoreEntity<CompetitionRecord>>;
  fights: Array<FirestoreEntity<FightRecord>>;
}

const checklistItems = [
  { id: 1, label: 'Kimono limpo e dentro das medidas', checked: true },
  { id: 2, label: 'Faixa reserva', checked: false },
  { id: 3, label: 'Documento de identidade', checked: true },
  { id: 4, label: 'Alimentação pré-competição planejada', checked: false },
  { id: 5, label: 'Protetor bucal', checked: true },
];

const CompetitionView: React.FC<CompetitionViewProps> = ({ competitions, fights }) => {
  const [activeSection, setActiveSection] = useState<'calendar' | 'profile'>('calendar');
  const medalCount = fights.filter((fight) => fight.result === 'win' || fight.result === 'submission' || fight.result === 'points').length;
  const totalRankingPoints = fights.reduce((sum, fight) => sum + (fight.rankingPointsAwarded ?? 0), 0);
  const videoFights = fights.filter((fight) => !!fight.videoUrl);

  return (
    <div className="space-y-6 pb-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Competição & Performance</h1>
        <div className="flex bg-gray-100 dark:bg-dark-card p-1 rounded-xl">
          <button
            onClick={() => setActiveSection('calendar')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeSection === 'calendar' ? 'bg-gold text-dark shadow-sm' : 'text-gray-500'}`}
          >
            Calendário
          </button>
          <button
            onClick={() => setActiveSection('profile')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeSection === 'profile' ? 'bg-gold text-dark shadow-sm' : 'text-gray-500'}`}
          >
            Perfil Atleta
          </button>
        </div>
      </div>

      {activeSection === 'calendar' ? (
        <div className="space-y-6">
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Calendar className="text-gold" size={20} />
              <h2 className="font-bold text-lg">Eventos Oficiais</h2>
            </div>

            {competitions.length > 0 ? (
              <div className="space-y-3">
                {competitions.map((event) => (
                  <div key={event.id} className="bg-white dark:bg-dark-card p-4 rounded-2xl border border-gray-100 dark:border-white/5 flex justify-between items-center">
                    <div className="space-y-1">
                      <h3 className="font-bold text-sm">{event.name}</h3>
                      <p className="text-xs text-gray-500">
                        {formatDateLabel(event.startDate)} • {event.location || 'Local a definir'}
                      </p>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${
                        event.status === 'published'
                          ? 'bg-green-100 text-green-700'
                          : event.status === 'finished'
                            ? 'bg-gray-100 text-gray-700'
                            : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {event.status}
                      </span>
                    </div>
                    <a href="https://cbjj.com.br" target="_blank" rel="noopener noreferrer" className="p-2 text-gold hover:bg-gold/10 rounded-full transition-colors">
                      <ExternalLink size={18} />
                    </a>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white dark:bg-dark-card p-5 rounded-2xl border border-gray-100 dark:border-white/5 text-sm text-gray-500">
                Nenhuma competição cadastrada nesta academia ainda.
              </div>
            )}
          </section>

          <section className="bg-white dark:bg-dark-card p-6 rounded-3xl border border-gray-100 dark:border-white/5 space-y-4">
            <div className="flex items-center gap-2">
              <CheckSquare className="text-gold" size={20} />
              <h2 className="font-bold text-lg">Checklist Pré-Competição</h2>
            </div>
            <div className="space-y-3">
              {checklistItems.map((item) => (
                <div key={item.id} className="flex items-center gap-3">
                  <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${item.checked ? 'bg-gold border-gold' : 'border-gray-300'}`}>
                    {item.checked ? <CheckSquare size={14} className="text-dark" /> : null}
                  </div>
                  <span className={`text-sm ${item.checked ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-300'}`}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-gold/10 p-4 rounded-2xl border border-gold/20 flex items-center gap-4">
            <div className="bg-gold p-2 rounded-full text-dark">
              <Bell size={20} />
            </div>
            <div>
              <h3 className="font-bold text-sm">Notificações Ativas</h3>
              <p className="text-xs text-gray-600">As próximas competições e atualizações de desempenho aparecerão aqui à medida que forem cadastradas.</p>
            </div>
          </section>
        </div>
      ) : (
        <div className="space-y-6">
          <section className="grid grid-cols-2 gap-4">
            <div className="bg-white dark:bg-dark-card p-4 rounded-2xl border border-gray-100 dark:border-white/5 flex flex-col items-center text-center">
              <Weight className="text-gold mb-2" size={24} />
              <p className="text-[10px] font-bold text-gray-400 uppercase">Lutas Registradas</p>
              <p className="text-lg font-bold">{fights.length}</p>
              <p className="text-[10px] text-gold">Histórico da academia</p>
            </div>
            <div className="bg-white dark:bg-dark-card p-4 rounded-2xl border border-gray-100 dark:border-white/5 flex flex-col items-center text-center">
              <Medal className="text-gold mb-2" size={24} />
              <p className="text-[10px] font-bold text-gray-400 uppercase">Pontuação</p>
              <p className="text-lg font-bold">{totalRankingPoints}</p>
              <p className="text-[10px] text-gold">{medalCount} vitórias registradas</p>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Trophy className="text-gold" size={20} />
              <h2 className="font-bold text-lg">Histórico de Lutas</h2>
            </div>

            {fights.length > 0 ? (
              <div className="space-y-3">
                {fights.map((fight) => (
                  <div key={fight.id} className="bg-white dark:bg-dark-card p-4 rounded-2xl border border-gray-100 dark:border-white/5 flex justify-between items-center">
                    <div>
                      <h3 className="font-bold text-sm">{fight.opponentName ? `vs ${fight.opponentName}` : 'Luta registrada'}</h3>
                      <p className="text-xs text-gray-500">{formatDateLabel(fight.occurredAt)}</p>
                    </div>
                    <span className="font-bold text-sm uppercase">{fight.result}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white dark:bg-dark-card p-5 rounded-2xl border border-gray-100 dark:border-white/5 text-sm text-gray-500">
                Ainda não existem lutas registradas para este atleta.
              </div>
            )}
          </section>

          <section className="bg-white dark:bg-dark-card p-6 rounded-3xl border border-gray-100 dark:border-white/5 space-y-4">
            <div className="flex items-center gap-2">
              <Video className="text-gold" size={20} />
              <h2 className="font-bold text-lg">Vídeos de Lutas</h2>
            </div>

            {videoFights.length > 0 ? (
              <div className="space-y-4 mb-4">
                {videoFights.map((video) => (
                  <div key={video.id} className="space-y-2">
                    <div className="aspect-video bg-black rounded-2xl overflow-hidden relative group">
                      <iframe
                        src={getYouTubeEmbedUrl(video.videoUrl as string)}
                        className="w-full h-full"
                        allowFullScreen
                        title={video.opponentName || 'Vídeo de luta'}
                      />
                    </div>
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-sm font-bold">{video.opponentName ? `Luta vs ${video.opponentName}` : 'Vídeo de luta'}</p>
                        <p className="text-xs text-gray-500">{formatDateLabel(video.occurredAt)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-200 dark:border-white/10 rounded-2xl p-8 flex flex-col items-center justify-center text-center space-y-2">
                <div className="p-3 bg-gray-50 dark:bg-white/5 rounded-full text-gray-400">
                  <Video size={32} />
                </div>
                <p className="text-sm font-bold">Sem vídeos cadastrados</p>
                <p className="text-xs text-gray-500">Quando uma luta receber `videoUrl`, ela aparecerá aqui automaticamente.</p>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default CompetitionView;
