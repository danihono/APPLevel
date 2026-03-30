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
  { id: 4, label: 'Alimentacao pre-competicao planejada', checked: false },
  { id: 5, label: 'Protetor bucal', checked: true },
];

const CompetitionView: React.FC<CompetitionViewProps> = ({ competitions, fights }) => {
  const [activeSection, setActiveSection] = useState<'calendar' | 'profile'>('calendar');
  const medalCount = fights.filter((fight) => fight.result === 'win' || fight.result === 'submission' || fight.result === 'points').length;
  const totalRankingPoints = fights.reduce((sum, fight) => sum + (fight.rankingPointsAwarded ?? 0), 0);
  const videoFights = fights.filter((fight) => !!fight.videoUrl);

  return (
    <div className="view-shell">
      <section className="app-panel app-panel--hero app-panel-pad">
        <p className="app-section-label">Fight mode</p>
        <h1 className="app-section-title">Competicao e performance com cara editorial.</h1>
        <p className="app-section-copy">
          O modulo ganhou foco em leitura rapida, mais contraste e blocos mais nobres para historico e eventos.
        </p>

        <div className="mt-6 app-segment app-segment--block">
          <button
            type="button"
            onClick={() => setActiveSection('calendar')}
            className={`app-segment__button ${activeSection === 'calendar' ? 'is-active' : ''}`}
          >
            <Calendar size={16} />
            Calendario
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('profile')}
            className={`app-segment__button ${activeSection === 'profile' ? 'is-active' : ''}`}
          >
            <Trophy size={16} />
            Perfil atleta
          </button>
        </div>
      </section>

      {activeSection === 'calendar' ? (
        <>
          <section className="app-list">
            <div className="flex items-center gap-3">
              <div className="app-icon-shell">
                <Calendar size={18} />
              </div>
              <div>
                <p className="app-section-label">Eventos oficiais</p>
                <h2 className="text-xl font-bold">Calendario competitivo</h2>
              </div>
            </div>

            {competitions.length > 0 ? (
              competitions.map((event) => (
                <article key={event.id} className="app-panel app-panel-pad">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-bold">{event.name}</h3>
                      <p className="app-section-copy mt-3">
                        {formatDateLabel(event.startDate)} - {event.location || 'Local a definir'}
                      </p>
                      <div className="mt-4">
                        <span className={`${
                          event.status === 'published'
                            ? 'app-badge app-badge--success'
                            : event.status === 'finished'
                              ? 'app-badge app-badge--muted'
                              : 'app-badge app-badge--gold'
                        }`}
                        >
                          {event.status}
                        </span>
                      </div>
                    </div>
                    <a
                      href="https://cbjj.com.br"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="app-button app-button--ghost app-button--icon"
                      aria-label="Abrir site oficial"
                    >
                      <ExternalLink size={18} />
                    </a>
                  </div>
                </article>
              ))
            ) : (
              <div className="app-empty">Nenhuma competicao cadastrada nesta academia ainda.</div>
            )}
          </section>

          <section className="app-panel app-panel-pad">
            <div className="flex items-center gap-3">
              <div className="app-icon-shell">
                <CheckSquare size={18} />
              </div>
              <div>
                <p className="app-section-label">Checklist</p>
                <h2 className="text-xl font-bold">Pre-competicao</h2>
              </div>
            </div>

            <div className="mt-6 app-list">
              {checklistItems.map((item) => (
                <div key={item.id} className="app-list-card flex items-center gap-3">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full border ${item.checked ? 'border-amber-200 bg-amber-200/80 text-stone-900' : 'border-white/10 bg-white/5 text-[color:var(--text-soft)]'}`}>
                    <CheckSquare size={14} />
                  </div>
                  <span className={`text-sm ${item.checked ? 'line-through text-[color:var(--text-soft)]' : 'text-[color:var(--text-strong)]'}`}>
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="app-panel app-panel--tint app-panel-pad">
            <div className="flex items-start gap-3">
              <div className="app-icon-shell">
                <Bell size={18} />
              </div>
              <div>
                <p className="app-section-label">Notificacoes</p>
                <h2 className="text-xl font-bold">Alerta ativo</h2>
                <p className="app-section-copy mt-3">
                  As proximas competicoes e atualizacoes de desempenho aparecem aqui conforme forem cadastradas.
                </p>
              </div>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="app-stat-grid">
            <article className="app-panel app-panel-pad">
              <div className="app-icon-shell">
                <Weight size={18} />
              </div>
              <p className="app-stat-card__label mt-4">Lutas registradas</p>
              <p className="app-stat-card__value">{fights.length}</p>
              <p className="app-stat-card__note">Historico total da academia</p>
            </article>
            <article className="app-panel app-panel-pad">
              <div className="app-icon-shell">
                <Medal size={18} />
              </div>
              <p className="app-stat-card__label mt-4">Pontuacao</p>
              <p className="app-stat-card__value">{totalRankingPoints}</p>
              <p className="app-stat-card__note">{medalCount} vitorias registradas</p>
            </article>
          </section>

          <section className="app-list">
            <div className="flex items-center gap-3">
              <div className="app-icon-shell">
                <Trophy size={18} />
              </div>
              <div>
                <p className="app-section-label">Historico</p>
                <h2 className="text-xl font-bold">Resumo de lutas</h2>
              </div>
            </div>

            {fights.length > 0 ? (
              fights.map((fight) => (
                <article key={fight.id} className="app-panel app-panel-pad">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold">{fight.opponentName ? `vs ${fight.opponentName}` : 'Luta registrada'}</h3>
                      <p className="app-section-copy mt-2">{formatDateLabel(fight.occurredAt)}</p>
                    </div>
                    <span className="app-badge app-badge--gold">{fight.result}</span>
                  </div>
                </article>
              ))
            ) : (
              <div className="app-empty">Ainda nao existem lutas registradas para este atleta.</div>
            )}
          </section>

          <section className="app-panel app-panel-pad">
            <div className="flex items-center gap-3">
              <div className="app-icon-shell">
                <Video size={18} />
              </div>
              <div>
                <p className="app-section-label">Videos</p>
                <h2 className="text-xl font-bold">Arquivo de luta</h2>
              </div>
            </div>

            {videoFights.length > 0 ? (
              <div className="mt-6 app-list">
                {videoFights.map((video) => (
                  <div key={video.id} className="app-list-card">
                    <div className="app-video-frame aspect-video">
                      <iframe
                        src={getYouTubeEmbedUrl(video.videoUrl as string)}
                        className="h-full w-full"
                        allowFullScreen
                        title={video.opponentName || 'Video de luta'}
                      />
                    </div>
                    <div className="mt-4">
                      <p className="text-sm font-bold">{video.opponentName ? `Luta vs ${video.opponentName}` : 'Video de luta'}</p>
                      <p className="mt-1 text-xs text-[color:var(--text-soft)]">{formatDateLabel(video.occurredAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="app-empty mt-6">Quando uma luta receber `videoUrl`, ela aparecera aqui automaticamente.</div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default CompetitionView;
