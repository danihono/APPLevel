import React, { useState } from 'react';
import { Pencil, X } from 'lucide-react';
import { toDatetimeLocalValue } from '../broadcastFilters';
import { t } from '../i18n';
import type { NotificationBroadcastRecord } from '../services/firebase/models';

export interface EditBroadcastSubmit {
  title: string;
  body: string;
  scheduledAt?: number;
}

interface EditBroadcastModalProps {
  broadcast: NotificationBroadcastRecord;
  onClose: () => void;
  onSave: (changes: EditBroadcastSubmit) => Promise<void>;
}

// Editar so corrige o texto que aparece no app. O push que ja chegou no
// celular nao muda e nao e reenviado.
const EditBroadcastModal: React.FC<EditBroadcastModalProps> = ({ broadcast, onClose, onSave }) => {
  const isScheduled = broadcast.status === 'scheduled';
  const [title, setTitle] = useState(broadcast.title);
  const [body, setBody] = useState(broadcast.body);
  const [scheduleValue, setScheduleValue] = useState(
    broadcast.scheduledAt ? toDatetimeLocalValue(broadcast.scheduledAt.toDate()) : '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    let scheduledAt: number | undefined;
    if (isScheduled) {
      const parsed = scheduleValue ? new Date(scheduleValue).getTime() : Number.NaN;
      if (!Number.isFinite(parsed) || parsed <= Date.now() + 60 * 1000) {
        setError(t('Escolha um horário de envio no futuro.'));
        return;
      }
      scheduledAt = parsed;
    }

    setBusy(true);
    try {
      await onSave({ title: title.trim(), body: body.trim(), scheduledAt });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t('Não foi possível salvar o comunicado.'));
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 sm:items-center broadcast-modal" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="app-panel app-panel-pad app-sheet-modal w-full max-w-lg rounded-b-none sm:rounded-[1.8rem] broadcast-modal__sheet"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="broadcast-modal__head">
          <div className="broadcast-composer__head">
            <div className="app-icon-shell" style={{ flexShrink: 0 }}>
              <Pencil size={18} />
            </div>
            <h2 className="broadcast-composer__title">{t('Editar comunicado')}</h2>
          </div>
          <button type="button" onClick={onClose} className="app-button app-button--ghost app-button--icon" aria-label={t('Fechar')}>
            <X size={18} />
          </button>
        </div>

        {!isScheduled ? (
          <p className="broadcast-composer__hint">
            {t('A mudança aparece na lista de avisos de quem recebeu. A notificação que já chegou no celular não é reenviada.')}
          </p>
        ) : null}

        {error ? <div className="app-alert app-alert--error">{error}</div> : null}

        <label className="app-field">
          <span className="app-field__label">{t('Título')}</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} className="app-input" maxLength={120} required />
        </label>

        <label className="app-field">
          <span className="app-field__label">{t('Mensagem')}</span>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} className="app-textarea" maxLength={1000} required />
        </label>

        {isScheduled ? (
          <label className="app-field">
            <span className="app-field__label">{t('Enviar em')}</span>
            <input
              type="datetime-local"
              value={scheduleValue}
              min={toDatetimeLocalValue(new Date())}
              onChange={(event) => setScheduleValue(event.target.value)}
              className="app-input"
              required
            />
          </label>
        ) : null}

        <div className="broadcast-modal__actions">
          <button type="button" onClick={onClose} disabled={busy} className="app-button app-button--ghost">
            {t('Cancelar')}
          </button>
          <button type="submit" disabled={busy} className="app-button app-button--gold">
            {busy ? t('Salvando...') : t('Salvar')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default EditBroadcastModal;
