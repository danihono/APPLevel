import React, { useState } from 'react';
import {
  Bell,
  Calendar,
  CheckSquare,
  ExternalLink,
  Medal,
  Send,
  Trophy,
  Video,
  Weight,
} from 'lucide-react';
import AppVideoContent from '../components/AppVideoContent';
import DateField from '../components/DateField';
import { formatDateLabel } from '../services/firebase/adapters';
import type { FirestoreEntity } from '../services/firebase/data';
import type {
  CompetitionRecord,
  FightRecord,
  FightVideoSubmissionRecord,
} from '../services/firebase/models';
import { UserRole, type UserVideo } from '../types';
import { getVideoSourceKindFromUrl, isHttpUrl } from '../utils';

interface CompetitionViewProps {
  userRole?: UserRole;
  competitions: Array<FirestoreEntity<CompetitionRecord>>;
  fights: Array<FirestoreEntity<FightRecord>>;
  videoLibrary: UserVideo[];
  submissions?: Array<FirestoreEntity<FightVideoSubmissionRecord>>;
  onUploadVideoAsset?: (file: File) => Promise<{
    downloadURL: string;
    storagePath: string;
    mimeType: string;
    fileName: string;
  }>;
  onSubmitVideoSubmission?: (payload: {
    title: string;
    opponentName?: string;
    occurredAt?: string;
    sourceKind: 'youtube' | 'external' | 'upload';
    sourceUrl: string;
    storagePath?: string;
    mimeType?: string;
    fileName?: string;
  }) => Promise<unknown>;
}

const checklistItems = [
  { id: 1, label: 'Kimono limpo e dentro das medidas', checked: true },
  { id: 2, label: 'Faixa reserva', checked: false },
  { id: 3, label: 'Documento de identidade', checked: true },
  { id: 4, label: 'Alimentacao pre-competicao planejada', checked: false },
  { id: 5, label: 'Protetor bucal', checked: true },
];

function submissionStatusLabel(status: FightVideoSubmissionRecord['status']) {
  switch (status) {
    case 'approved':
      return 'Aprovado';
    case 'rejected':
      return 'Rejeitado';
    default:
      return 'Pendente';
  }
}

function submissionStatusBadge(status: FightVideoSubmissionRecord['status']) {
  switch (status) {
    case 'approved':
      return 'app-badge app-badge--success';
    case 'rejected':
      return 'app-badge app-badge--danger';
    default:
      return 'app-badge app-badge--gold';
  }
}

const CompetitionView: React.FC<CompetitionViewProps> = ({
  userRole,
  competitions,
  fights,
  videoLibrary,
  submissions = [],
  onUploadVideoAsset,
  onSubmitVideoSubmission,
}) => {
  const [activeSection, setActiveSection] = useState<'calendar' | 'profile'>('calendar');
  const [sourceMode, setSourceMode] = useState<'link' | 'upload'>('link');
  const [title, setTitle] = useState('');
  const [opponentName, setOpponentName] = useState('');
  const [occurredAt, setOccurredAt] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');
  const medalCount = fights.filter((fight) => fight.result === 'win' || fight.result === 'submission' || fight.result === 'points').length;
  const totalRankingPoints = fights.reduce((sum, fight) => sum + (fight.rankingPointsAwarded ?? 0), 0);
  const canSubmitVideos = userRole === UserRole.ALUNO;

  async function handleSubmitVideo(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!onSubmitVideoSubmission) {
      return;
    }

    setBusy(true);
    setFeedback('');
    setError('');

    try {
      if (sourceMode === 'link') {
        const trimmedUrl = sourceUrl.trim();
        if (!trimmedUrl || !isHttpUrl(trimmedUrl)) {
          throw new Error('Informe um link valido para o video.');
        }

        await onSubmitVideoSubmission({
          title: title.trim(),
          opponentName: opponentName.trim() || undefined,
          occurredAt: occurredAt || undefined,
          sourceKind: getVideoSourceKindFromUrl(trimmedUrl),
          sourceUrl: trimmedUrl,
        });
      } else {
        if (!file || !onUploadVideoAsset) {
          throw new Error('Selecione um arquivo de video antes de enviar.');
        }

        const uploadResult = await onUploadVideoAsset(file);
        await onSubmitVideoSubmission({
          title: title.trim(),
          opponentName: opponentName.trim() || undefined,
          occurredAt: occurredAt || undefined,
          sourceKind: 'upload',
          sourceUrl: uploadResult.downloadURL,
          storagePath: uploadResult.storagePath,
          mimeType: uploadResult.mimeType,
          fileName: uploadResult.fileName,
        });
      }

      setTitle('');
      setOpponentName('');
      setOccurredAt('');
      setSourceUrl('');
      setFile(null);
      setFeedback('Video enviado com sucesso. Ele ficara pendente ate a aprovacao da equipe.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Nao foi possivel enviar o video.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="view-shell">
      <section className="app-panel app-panel-pad">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold">{competitions.length} eventos cadastrados</p>
            <p className="mt-2 text-sm text-[color:var(--text-muted)]">
              {medalCount} medalhas confirmadas • {totalRankingPoints} pontos somados
            </p>
          </div>
          <span className="app-badge app-badge--muted">{videoLibrary.length} videos</span>
        </div>

        <div className="mt-5 app-segment app-segment--block">
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

          {canSubmitVideos ? (
            <form onSubmit={handleSubmitVideo} className="app-panel app-panel-pad">
              <div className="flex items-center gap-3">
                <div className="app-icon-shell">
                  <Send size={18} />
                </div>
                <div>
                  <p className="app-section-label">Enviar video</p>
                  <h2 className="text-xl font-bold">Novo video para revisao</h2>
                </div>
              </div>

              {feedback ? <div className="app-alert app-alert--success mt-6">{feedback}</div> : null}
              {error ? <div className="app-alert app-alert--error mt-6">{error}</div> : null}

              <div className="mt-6 app-grid-2">
                <label className="app-field md:col-span-2">
                  <span className="app-field__label">Titulo</span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="app-input"
                    placeholder="Ex.: Final da categoria adulto"
                    required
                  />
                </label>

                <label className="app-field">
                  <span className="app-field__label">Adversario</span>
                  <input
                    value={opponentName}
                    onChange={(event) => setOpponentName(event.target.value)}
                    className="app-input"
                    placeholder="Opcional"
                  />
                </label>

                <label className="app-field">
                  <span className="app-field__label">Data da luta</span>
                  <DateField value={occurredAt} onChange={setOccurredAt} />
                </label>

                <label className="app-field">
                  <span className="app-field__label">Origem</span>
                  <select
                    value={sourceMode}
                    onChange={(event) => {
                      const nextMode = event.target.value as 'link' | 'upload';
                      setSourceMode(nextMode);
                      setError('');
                      setSourceUrl('');
                      setFile(null);
                    }}
                    className="app-select"
                  >
                    <option value="link">Link</option>
                    <option value="upload">Arquivo</option>
                  </select>
                </label>

                {sourceMode === 'link' ? (
                  <label className="app-field md:col-span-2">
                    <span className="app-field__label">URL do video</span>
                    <input
                      value={sourceUrl}
                      onChange={(event) => setSourceUrl(event.target.value)}
                      className="app-input"
                      placeholder="https://youtube.com/... ou outro link publico"
                      required
                    />
                    <span className="app-field__hint">Links do YouTube serao exibidos no player interno. Outros links serao abertos externamente.</span>
                  </label>
                ) : (
                  <label className="app-field md:col-span-2">
                    <span className="app-field__label">Arquivo de video</span>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                      className="app-input"
                      required
                    />
                    <span className="app-field__hint">
                      {file ? `Arquivo pronto para envio: ${file.name}` : 'Selecione um arquivo de video para enviar.'}
                    </span>
                  </label>
                )}
              </div>

              <button type="submit" disabled={busy} className="app-button app-button--gold mt-6">
                <Send size={16} />
                {busy ? 'Enviando...' : 'Enviar video'}
              </button>
            </form>
          ) : null}

          {canSubmitVideos ? (
            <section className="app-panel app-panel-pad">
              <div className="flex items-center gap-3">
                <div className="app-icon-shell">
                  <Video size={18} />
                </div>
                <div>
                  <p className="app-section-label">Meus envios</p>
                  <h2 className="text-xl font-bold">Solicitacoes recentes</h2>
                </div>
              </div>

              {submissions.length > 0 ? (
                <div className="mt-6 app-list">
                  {submissions.map((submission) => (
                    <article key={submission.id} className="app-list-card">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-bold">{submission.title}</p>
                          <p className="mt-1 text-xs text-[color:var(--text-soft)]">
                            {formatDateLabel(submission.occurredAt ?? submission.createdAt)}
                            {submission.opponentName ? ` • vs ${submission.opponentName}` : ''}
                          </p>
                        </div>
                        <span className={submissionStatusBadge(submission.status)}>{submissionStatusLabel(submission.status)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="app-empty mt-6">Quando voce enviar videos, eles aparecerao aqui com o status da revisao.</div>
              )}
            </section>
          ) : null}

          <section className="app-panel app-panel-pad">
            <div className="flex items-center gap-3">
              <div className="app-icon-shell">
                <Video size={18} />
              </div>
              <div>
                <p className="app-section-label">Videos</p>
                <h2 className="text-xl font-bold">Arquivo de videos</h2>
              </div>
            </div>

            {videoLibrary.length > 0 ? (
              <div className="mt-6 app-list">
                {videoLibrary.map((video) => (
                  <div key={video.id} className="app-list-card">
                    <AppVideoContent
                      title={video.title}
                      sourceUrl={video.url}
                      sourceKind={video.sourceKind}
                    />
                    <div className="mt-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-bold">{video.title}</p>
                        <span className="app-badge app-badge--muted">
                          {video.origin === 'submission' ? 'Enviado pelo aluno' : 'Luta oficial'}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-[color:var(--text-soft)]">{video.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="app-empty mt-6">Quando uma luta tiver video ou um envio do aluno for aprovado, ele aparecera aqui.</div>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default CompetitionView;
