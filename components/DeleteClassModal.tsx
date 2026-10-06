import React, { useMemo, useState } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import type { FirestoreEntity } from '../services/firebase/data';
import type { DeleteClassScheduleResult } from '../services/firebase/functions';
import type { ClassRecord } from '../services/firebase/models';
import { t, createDateFormatter } from '../i18n';
import './redesign/class-modals.css';

const lessonDateFormatter = createDateFormatter({
  weekday: 'short',
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export interface DeleteClassPayload {
  classId: string;
  scope: 'single' | 'future';
}

interface DeleteClassModalProps {
  lesson: FirestoreEntity<ClassRecord>;
  onClose: () => void;
  onSubmit: (payload: DeleteClassPayload) => Promise<DeleteClassScheduleResult>;
}

const DeleteClassModal: React.FC<DeleteClassModalProps> = ({ lesson, onClose, onSubmit }) => {
  const hasRecurringSeries = !!lesson.recurrenceSeriesId;
  const [scope, setScope] = useState<'single' | 'future'>(
    hasRecurringSeries && lesson.status !== 'scheduled' ? 'future' : 'single',
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const singleUnavailable = lesson.status !== 'scheduled';
  const canSubmit = hasRecurringSeries ? scope === 'future' || !singleUnavailable : !singleUnavailable;
  const helperCopy = useMemo(() => {
    if (hasRecurringSeries) {
      if (singleUnavailable) {
        return t('Esta aula não está mais agendada, então apenas as próximas aulas agendadas da série podem ser excluídas.');
      }

      return t('Excluir em série apaga esta aula e as próximas ocorrências agendadas da mesma recorrência.');
    }

    if (singleUnavailable) {
      return t('Somente aulas agendadas podem ser excluídas.');
    }

    return t('Esta exclusão remove a aula e os RSVPs vinculados a ela.');
  }, [hasRecurringSeries, singleUnavailable]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    if (!canSubmit) {
      setError(t('Esta aula não pode ser excluída neste estado.'));
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await onSubmit({
        classId: lesson.id,
        scope: hasRecurringSeries ? scope : 'single',
      });
      onClose();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('Erro ao excluir aula.'));
    } finally {
      setSubmitting(false);
    }
  }

  const lessonStart = lesson.scheduledStart?.toDate();
  const lessonMeta = [
    lessonStart ? lessonDateFormatter.format(lessonStart) : null,
    lesson.tatame || null,
    lesson.professorName || null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="lv-backdrop" onClick={onClose}>
      <div
        className="lv-sheet rd-cm"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="rd-cm-delete-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="rd-cm__top">
          <div className="lv-sheet__grip" aria-hidden="true" />
          <div className="rd-cm__bar">
            <button type="button" onClick={onClose} className="lv-icon-btn" aria-label={t('Fechar')}>
              <X size={20} strokeWidth={2} />
            </button>
          </div>
          <div className="rd-cm__title-row">
            <span className="rd-cm__danger-icon" aria-hidden="true">
              <AlertTriangle size={20} strokeWidth={2} />
            </span>
            <h2 id="rd-cm-delete-title" className="rd-cm__title">{t('Excluir aula')}</h2>
          </div>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="rd-cm__form">
          <div className="rd-cm__body">
            {hasRecurringSeries ? (
              <div className="rd-cm__scope">
                <span className="rd-cm__field-label">{t('Excluir')}</span>
                <div className="lv-segmented">
                  <button
                    type="button"
                    onClick={() => !singleUnavailable && setScope('single')}
                    disabled={singleUnavailable}
                    className={scope === 'single' ? 'is-active' : ''}
                    aria-pressed={scope === 'single'}
                  >
                    {t('Somente esta aula')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setScope('future')}
                    className={scope === 'future' ? 'is-active' : ''}
                    aria-pressed={scope === 'future'}
                  >
                    {t('Esta e as próximas')}
                  </button>
                </div>
              </div>
            ) : null}

            <div className="rd-cm__lesson">
              <p className="rd-cm__lesson-title">{lesson.title}</p>
              {lessonMeta ? <p className="rd-cm__hint">{lessonMeta}</p> : null}
              <p className="rd-cm__lesson-text">{helperCopy}</p>
            </div>

            {canSubmit ? (
              <p className="lv-alert lv-alert--danger">{t('Esta ação não pode ser desfeita.')}</p>
            ) : null}
          </div>

          <div className="rd-cm__footer">
            {error ? <p className="lv-alert lv-alert--danger" role="alert">{error}</p> : null}

            <div className="rd-cm__actions">
              <button type="button" onClick={onClose} disabled={submitting} className="lv-btn lv-btn--neutral">
                {t('Cancelar')}
              </button>
              <button type="submit" disabled={submitting || !canSubmit} className="lv-btn lv-btn--danger rd-cm__danger-btn">
                <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
                <span>{submitting ? t('Excluindo...') : scope === 'future' ? t('Excluir em série') : t('Excluir aula')}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DeleteClassModal;
