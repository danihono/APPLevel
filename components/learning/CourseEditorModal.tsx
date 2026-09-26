import React, { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import LearningAudienceField from './LearningAudienceField';
import LearningEditorModal from './LearningEditorModal';
import {
  DEFAULT_INHERIT_AUDIENCE,
  type ContentStatus,
  type CourseEntity,
  type TrackEntity,
} from '../../views/learning/learningShared';
import { resolveTrackAudience } from '../../learningAudience';
import type { FirestoreEntity } from '../../services/firebase/data';
import type { LearningAudienceConfig, UserRecord } from '../../services/firebase/models';
import { t } from '../../i18n';

export interface CourseEditorSubmit {
  courseId?: string;
  trackId: string;
  title: string;
  description?: string;
  order: number;
  status: ContentStatus;
  audience: LearningAudienceConfig;
}

interface CourseEditorModalProps {
  open: boolean;
  /** `null` cria um curso novo dentro de `track`. */
  course: CourseEntity | null;
  track: TrackEntity | null;
  nextOrder: number;
  audienceUsers?: Array<FirestoreEntity<UserRecord>>;
  busy?: boolean;
  error?: string;
  onClose: () => void;
  onSubmit: (payload: CourseEditorSubmit) => void;
}

const CourseEditorModal: React.FC<CourseEditorModalProps> = ({
  open,
  course,
  track,
  nextOrder,
  audienceUsers = [],
  busy = false,
  error,
  onClose,
  onSubmit,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [order, setOrder] = useState(1);
  const [status, setStatus] = useState<ContentStatus>('draft');
  const [audience, setAudience] = useState<LearningAudienceConfig>(DEFAULT_INHERIT_AUDIENCE);
  const [titleError, setTitleError] = useState('');

  useEffect(() => {
    if (!open) {
      return;
    }

    setTitle(course?.title ?? '');
    setDescription(course?.description ?? '');
    setOrder(course?.order ?? nextOrder);
    setStatus(course?.status ?? 'draft');
    setAudience(course?.audience ?? DEFAULT_INHERIT_AUDIENCE);
    setTitleError('');
  }, [course, nextOrder, open]);

  function handleSubmit() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setTitleError(t('Informe o título do curso.'));
      return;
    }

    if (!track) {
      return;
    }

    setTitleError('');
    onSubmit({
      courseId: course?.id,
      trackId: track.id,
      title: trimmedTitle,
      description: description.trim() || undefined,
      order: Number(order) || 1,
      status,
      audience,
    });
  }

  return (
    <LearningEditorModal
      open={open}
      title={course ? t('Editar curso') : t('Novo curso')}
      subtitle={track ? t('Trilha: {title}', { title: track.title }) : t('Selecione uma trilha antes de criar o curso.')}
      icon={<BookOpen size={20} />}
      busy={busy}
      error={error}
      submitLabel={course ? t('Salvar curso') : t('Criar curso')}
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
            placeholder={t('Ex.: Passagem de guarda')}
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

      <LearningAudienceField
        value={audience}
        onChange={setAudience}
        parentAudiences={track ? [resolveTrackAudience(track)] : []}
        parent="trilha"
        audienceUsers={audienceUsers}
      />
    </LearningEditorModal>
  );
};

export default CourseEditorModal;
