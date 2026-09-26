import React, { useMemo, useState } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import type { FirestoreEntity } from '../services/firebase/data';
import type { DeleteClassScheduleResult } from '../services/firebase/functions';
import type { ClassRecord } from '../services/firebase/models';
import { t } from '../i18n';

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

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose}>
      <div
        className="app-panel app-panel-pad app-sheet-modal w-full max-w-xl rounded-b-none sm:rounded-[1.8rem]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="app-icon-shell" style={{ color: '#ef4444' }}>
              <AlertTriangle size={18} />
            </div>
            <h2 className="text-xl font-bold">{t('Excluir aula')}</h2>
          </div>
          <button type="button" onClick={onClose} className="app-button app-button--ghost app-button--icon">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="mt-6 flex flex-col gap-5">
          {hasRecurringSeries ? (
            <div className="app-list-card">
              <p className="app-field__label">{t('Excluir')}</p>
              <div className="mt-3 app-segment">
                <button
                  type="button"
                  onClick={() => !singleUnavailable && setScope('single')}
                  disabled={singleUnavailable}
                  className={`app-segment__button ${scope === 'single' ? 'is-active' : ''}`}
                >
                  {t('Somente esta aula')}
                </button>
                <button
                  type="button"
                  onClick={() => setScope('future')}
                  className={`app-segment__button ${scope === 'future' ? 'is-active' : ''}`}
                >
                  {t('Esta e as próximas')}
                </button>
              </div>
            </div>
          ) : null}

          <div className="app-list-card">
            <p className="text-sm font-semibold">{lesson.title}</p>
            <p className="mt-2 text-sm text-[color:var(--text-muted)]">{helperCopy}</p>
          </div>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}

          <div className="flex gap-3">
            <button type="button" onClick={onClose} disabled={submitting} className="app-button app-button--ghost flex-1">
              {t('Cancelar')}
            </button>
            <button type="submit" disabled={submitting || !canSubmit} className="app-button app-button--solid-danger flex-1">
              <Trash2 size={14} />
              {submitting ? t('Excluindo...') : scope === 'future' ? t('Excluir em série') : t('Excluir aula')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DeleteClassModal;
