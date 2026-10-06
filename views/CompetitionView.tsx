import React, { useState } from 'react';
import {
  Bell,
  Calendar,
  Check,
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
import { t } from '../i18n';
import './redesign/evolution.css';

export interface CompetitionViewProps {
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

// Textos em pt (chave do catalogo); traduzidos no render com t(item.label).
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
      return t('Aprovado');
    case 'rejected':
      return t('Rejeitado');
    default:
      return t('Pendente');
  }
}

function submissionStatusChip(status: FightVideoSubmissionRecord['status']) {
  switch (status) {
    case 'approved':
      return 'lv-chip lv-chip--success';
    case 'rejected':
      return 'lv-chip lv-chip--danger';
    default:
      return 'lv-chip lv-chip--gold';
  }
}

function competitionStatusLabel(status: CompetitionRecord['status'] | string) {
  switch (status) {
    case 'published':
      return t('Publicado');
    case 'finished':
      return t('Encerrado');
    case 'draft':
      return t('Rascunho');
    default:
      return String(status ?? '');
  }
}

function competitionStatusChip(status: CompetitionRecord['status'] | string) {
  if (status === 'published') return 'lv-chip lv-chip--success';
  if (status === 'finished') return 'lv-chip lv-chip--done';
  return 'lv-chip lv-chip--gold';
}

function fightResultLabel(result: FightRecord['result'] | string) {
  switch (result) {
    case 'win':
      return t('Vitória');
    case 'submission':
      return t('Vitória por finalização');
    case 'points':
      return t('Vitória por pontos');
    case 'loss':
      return t('Derrota');
    case 'draw':
      return t('Empate');
    case 'walkover':
      return t('W.O.');
    default:
      return String(result ?? '');
  }
}

const SectionHead: React.FC<{ icon: React.ReactNode; label: string; title: string }> = ({ icon, label, title }) => (
  <header className="rd-grad__card-head">
    <span className="rd-grad__icon" aria-hidden="true">{icon}</span>
    <div className="rd-grad__card-titles">
      <span className="lv-label">{label}</span>
      <h2 className="lv-title-md">{title}</h2>
    </div>
  </header>
);

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
          throw new Error(t('Informe um link valido para o video.'));
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
          throw new Error(t('Selecione um arquivo de video antes de enviar.'));
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
      setFeedback(t('Video enviado com sucesso. Ele ficara pendente ate a aprovacao da equipe.'));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('Nao foi possivel enviar o video.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="lv-screen rd-comp">
      <section className="lv-card rd-comp__summary">
        <div className="rd-comp__summary-row">
          <div className="rd-grad__card-titles">
            <p className="lv-title-md">{t('{count} eventos cadastrados', { count: competitions.length })}</p>
            <p className="rd-grad__note">
              {t('{medals} medalhas confirmadas • {points} pontos somados', { medals: medalCount, points: totalRankingPoints })}
            </p>
          </div>
          <span className="lv-chip">{t('{count} videos', { count: videoLibrary.length })}</span>
        </div>

        <div className="rd-comp__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'calendar'}
            onClick={() => setActiveSection('calendar')}
            className={`lv-chip-btn ${activeSection === 'calendar' ? 'is-active' : ''}`}
          >
            <Calendar size={16} strokeWidth={2} />
            {t('Calendario')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeSection === 'profile'}
            onClick={() => setActiveSection('profile')}
            className={`lv-chip-btn ${activeSection === 'profile' ? 'is-active' : ''}`}
          >
            <Trophy size={16} strokeWidth={2} />
            {t('Perfil atleta')}
          </button>
        </div>
      </section>

      {activeSection === 'calendar' ? (
        <>
          <section className="lv-section">
            <SectionHead icon={<Calendar size={18} strokeWidth={2} />} label={t('Eventos oficiais')} title={t('Calendario competitivo')} />

            {competitions.length > 0 ? (
              <div className="rd-comp__events">
                {competitions.map((event) => (
                  <article key={event.id} className="lv-card rd-comp__event">
                    <div className="rd-comp__event-main">
                      <h3 className="lv-title-md">{event.name}</h3>
                      <p className="rd-grad__note">
                        {formatDateLabel(event.startDate)} - {event.location || t('Local a definir')}
                      </p>
                      <span className={competitionStatusChip(event.status)}>{competitionStatusLabel(event.status)}</span>
                    </div>
                    <a
                      href="https://cbjj.com.br"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="lv-icon-btn"
                      aria-label={t('Abrir site oficial')}
                    >
                      <ExternalLink size={18} strokeWidth={2} />
                    </a>
                  </article>
                ))}
              </div>
            ) : (
              <p className="lv-card lv-card--dashed rd-grad__empty">{t('Nenhuma competicao cadastrada nesta academia ainda.')}</p>
            )}
          </section>

          <section className="lv-card rd-grad__card">
            <SectionHead icon={<CheckSquare size={18} strokeWidth={2} />} label={t('Checklist')} title={t('Pre-competicao')} />

            <ul className="lv-list rd-comp__checklist">
              {checklistItems.map((item) => (
                <li key={item.id} className={`lv-row rd-comp__check ${item.checked ? 'is-checked' : ''}`}>
                  <span className="rd-comp__check-box" aria-hidden="true">
                    {item.checked ? <Check size={14} strokeWidth={3} /> : null}
                  </span>
                  <span className="rd-comp__check-label">{t(item.label)}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="lv-card rd-comp__alert">
            <span className="rd-grad__icon" aria-hidden="true"><Bell size={18} strokeWidth={2} /></span>
            <div className="rd-grad__card-titles">
              <span className="lv-label">{t('Notificacoes')}</span>
              <h2 className="lv-title-md">{t('Alerta ativo')}</h2>
              <p className="rd-grad__note">
                {t('As proximas competicoes e atualizacoes de desempenho aparecem aqui conforme forem cadastradas.')}
              </p>
            </div>
          </section>
        </>
      ) : (
        <>
          <section className="rd-comp__stats">
            <article className="lv-card rd-comp__stat">
              <span className="rd-grad__icon" aria-hidden="true"><Weight size={18} strokeWidth={2} /></span>
              <span className="lv-label">{t('Lutas registradas')}</span>
              <span className="lv-stat__value">{fights.length}</span>
              <span className="lv-stat__note">{t('Suas lutas registradas na academia')}</span>
            </article>
            <article className="lv-card rd-comp__stat">
              <span className="rd-grad__icon" aria-hidden="true"><Medal size={18} strokeWidth={2} /></span>
              <span className="lv-label">{t('Pontuacao')}</span>
              <span className="lv-stat__value">{totalRankingPoints}</span>
              <span className="lv-stat__note">{t('{count} vitorias registradas', { count: medalCount })}</span>
            </article>
          </section>

          <section className="lv-section">
            <SectionHead icon={<Trophy size={18} strokeWidth={2} />} label={t('Historico')} title={t('Resumo de lutas')} />

            {fights.length > 0 ? (
              <div className="lv-list">
                {fights.map((fight) => (
                  <article key={fight.id} className="lv-row">
                    <div className="lv-row__main">
                      <h3 className="lv-row__title">{fight.opponentName ? `vs ${fight.opponentName}` : t('Luta registrada')}</h3>
                      <span className="lv-row__meta">{formatDateLabel(fight.occurredAt)}</span>
                    </div>
                    <span className={`lv-chip ${fight.result === 'loss' ? '' : 'lv-chip--gold'}`}>{fightResultLabel(fight.result)}</span>
                  </article>
                ))}
              </div>
            ) : (
              <p className="lv-card lv-card--dashed rd-grad__empty">{t('Ainda nao existem lutas registradas para este atleta.')}</p>
            )}
          </section>

          {canSubmitVideos ? (
            <form onSubmit={handleSubmitVideo} className="lv-card rd-grad__card rd-comp__form">
              <SectionHead icon={<Send size={18} strokeWidth={2} />} label={t('Enviar video')} title={t('Novo video para revisao')} />

              {feedback ? <div className="lv-alert rd-comp__alert-success" role="status">{feedback}</div> : null}
              {error ? <div className="lv-alert lv-alert--danger" role="alert">{error}</div> : null}

              <div className="rd-comp__fields">
                <label className="lv-field rd-comp__field--wide">
                  <span>{t('Titulo')}</span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="lv-input"
                    placeholder={t('Ex.: Final da categoria adulto')}
                    required
                  />
                </label>

                <label className="lv-field">
                  <span>{t('Adversario')}</span>
                  <input
                    value={opponentName}
                    onChange={(event) => setOpponentName(event.target.value)}
                    className="lv-input"
                    placeholder={t('Opcional')}
                  />
                </label>

                <label className="lv-field">
                  <span>{t('Data da luta')}</span>
                  <DateField value={occurredAt} onChange={setOccurredAt} className="lv-input" />
                </label>

                <label className="lv-field">
                  <span>{t('Origem')}</span>
                  <select
                    value={sourceMode}
                    onChange={(event) => {
                      const nextMode = event.target.value as 'link' | 'upload';
                      setSourceMode(nextMode);
                      setError('');
                      setSourceUrl('');
                      setFile(null);
                    }}
                    className="lv-select"
                  >
                    <option value="link">{t('Link')}</option>
                    <option value="upload">{t('Arquivo')}</option>
                  </select>
                </label>

                {sourceMode === 'link' ? (
                  <label className="lv-field rd-comp__field--wide">
                    <span>{t('URL do video')}</span>
                    <input
                      value={sourceUrl}
                      onChange={(event) => setSourceUrl(event.target.value)}
                      className="lv-input"
                      inputMode="url"
                      placeholder={t('https://youtube.com/... ou outro link publico')}
                      required
                    />
                    <span className="rd-comp__hint">{t('Links do YouTube serao exibidos no player interno. Outros links serao abertos externamente.')}</span>
                  </label>
                ) : (
                  <label className="lv-field rd-comp__field--wide">
                    <span>{t('Arquivo de video')}</span>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                      className="lv-input rd-comp__file"
                      required
                    />
                    <span className="rd-comp__hint">
                      {file ? t('Arquivo pronto para envio: {name}', { name: file.name }) : t('Selecione um arquivo de video para enviar.')}
                    </span>
                  </label>
                )}
              </div>

              <button type="submit" disabled={busy} className="lv-btn lv-btn--primary lv-btn--block">
                <Send size={16} strokeWidth={2} />
                {busy ? t('Enviando...') : t('Enviar video')}
              </button>
            </form>
          ) : null}

          {canSubmitVideos ? (
            <section className="lv-card rd-grad__card">
              <SectionHead icon={<Video size={18} strokeWidth={2} />} label={t('Meus envios')} title={t('Solicitacoes recentes')} />

              {submissions.length > 0 ? (
                <div className="lv-list">
                  {submissions.map((submission) => (
                    <article key={submission.id} className="lv-row">
                      <div className="lv-row__main">
                        <p className="lv-row__title">{submission.title}</p>
                        <span className="lv-row__meta">
                          {formatDateLabel(submission.occurredAt ?? submission.createdAt)}
                          {submission.opponentName ? ` • vs ${submission.opponentName}` : ''}
                        </span>
                      </div>
                      <span className={submissionStatusChip(submission.status)}>{submissionStatusLabel(submission.status)}</span>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="rd-grad__empty">{t('Quando voce enviar videos, eles aparecerao aqui com o status da revisao.')}</p>
              )}
            </section>
          ) : null}

          <section className="lv-card rd-grad__card">
            <SectionHead icon={<Video size={18} strokeWidth={2} />} label={t('Videos')} title={t('Arquivo de videos')} />

            {videoLibrary.length > 0 ? (
              <div className="rd-comp__videos">
                {videoLibrary.map((video) => (
                  <div key={video.id} className="rd-comp__video">
                    <AppVideoContent
                      title={video.title}
                      sourceUrl={video.url}
                      sourceKind={video.sourceKind}
                    />
                    <div className="rd-comp__video-meta">
                      <div className="rd-comp__video-title">
                        <p className="lv-row__title">{video.title}</p>
                        <span className="lv-chip">
                          {video.origin === 'submission' ? t('Enviado pelo aluno') : t('Luta oficial')}
                        </span>
                      </div>
                      <span className="lv-row__meta">{video.date}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rd-grad__empty">{t('Quando uma luta tiver video ou um envio do aluno for aprovado, ele aparecera aqui.')}</p>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default CompetitionView;
