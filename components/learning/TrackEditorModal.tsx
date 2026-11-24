import React, { useEffect, useState } from 'react';
import { Route } from 'lucide-react';
import IconPicker from './IconPicker';
import LearningAudienceField from './LearningAudienceField';
import LearningEditorModal from './LearningEditorModal';
import { DEFAULT_TRACK_AUDIENCE, type ContentStatus, type TrackEntity } from '../../views/learning/learningShared';
import { resolveTrackAudience } from '../../learningAudience';
import type { FirestoreEntity } from '../../services/firebase/data';
import type { LearningAudienceConfig, UserRecord } from '../../services/firebase/models';
import { t } from '../../i18n';

export interface TrackEditorSubmit {
  trackId?: string;
  title: string;
  description?: string;
  /** '' = automatico. */
  icon: string;
  color: string;
  order: number;
  status: ContentStatus;
  audience: LearningAudienceConfig;
}

interface TrackEditorModalProps {
  open: boolean;
  /** `null` cria uma trilha nova. */
  track: TrackEntity | null;
  /** Ordem sugerida para uma trilha nova. */
  nextOrder: number;
  /** Cor automatica desta trilha (pela ordem), para a previa quando nenhuma foi escolhida. */
  autoColor?: string;
  audienceUsers?: Array<FirestoreEntity<UserRecord>>;
  busy?: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (payload: TrackEditorSubmit) => void;
}

const TrackEditorModal: React.FC<TrackEditorModalProps> = ({
  open,
  track,
  nextOrder,
  autoColor = '#f0b429',
  audienceUsers = [],
  busy = false,
  error,
  onClose,
  onSubmit,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [color, setColor] = useState('');
  const [order, setOrder] = useState(1);
  const [status, setStatus] = useState<ContentStatus>('draft');
  const [audience, setAudience] = useState<LearningAudienceConfig>(DEFAULT_TRACK_AUDIENCE);
  const [titleError, setTitleError] = useState('');

  useEffect(() => {
    if (!open) {
      return;
    }

    setTitle(track?.title ?? '');
    setDescription(track?.description ?? '');
    setIcon(track?.icon ?? '');
    setColor(track?.color ?? '');
    setOrder(track?.order ?? nextOrder);
    setStatus(track?.status ?? 'draft');
    setAudience(track ? resolveTrackAudience(track) : DEFAULT_TRACK_AUDIENCE);
    setTitleError('');
  }, [nextOrder, open, track]);

  function handleSubmit() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setTitleError(t('Informe o título da trilha.'));
      return;
    }

    setTitleError('');
    onSubmit({
      trackId: track?.id,
      title: trimmedTitle,
      description: description.trim() || undefined,
      icon,
      color,
      order: Number(order) || 1,
      status,
      audience: { ...audience, mode: 'custom' },
    });
  }

  return (
    <LearningEditorModal
      open={open}
      title={track ? t('Editar trilha') : t('Nova trilha')}
      subtitle={t('A trilha é a raiz da jornada e define o público-alvo herdado por cursos e módulos.')}
      icon={<Route size={20} />}
      busy={busy}
      error={error}
      submitLabel={track ? t('Salvar trilha') : t('Criar trilha')}
      onClose={onClose}
      onSubmit={handleSubmit}
    >
      <div className="learning-form-grid">
        <label className="app-field learning-form-grid__full">
          <span className="app-field__label">{t('Título')}</span>
          <input
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
              if (titleError) {
                setTitleError('');
              }
            }}
            className="app-input"
            placeholder={t('Ex.: Fundamentos da guarda')}
            autoFocus
          />
          {titleError ? <span className="app-field__error">{titleError}</span> : null}
        </label>

        <label className="app-field learning-form-grid__full">
          <span className="app-field__label">{t('Descrição')}</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="app-input min-h-[6rem]"
            placeholder={t('O que o aluno aprende nesta trilha?')}
          />
        </label>

        <label className="app-field">
          <span className="app-field__label">{t('Ordem')}</span>
          <input
            type="number"
            min={1}
            value={order}
            onChange={(event) => setOrder(Number(event.target.value))}
            className="app-input"
          />
        </label>

        <label className="app-field">
          <span className="app-field__label">{t('Status')}</span>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as ContentStatus)}
            className="app-select"
          >
            <option value="draft">{t('Rascunho')}</option>
            <option value="published">{t('Publicado')}</option>
          </select>
        </label>
      </div>

      <IconPicker
        title={title.trim()}
        icon={icon}
        color={color}
        autoColor={autoColor}
        onIconChange={setIcon}
        onColorChange={setColor}
      />

      <LearningAudienceField
        value={audience}
        onChange={setAudience}
        audienceUsers={audienceUsers}
      />
    </LearningEditorModal>
  );
};

export default TrackEditorModal;
