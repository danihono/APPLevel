import React, { useState } from 'react';
import { X } from 'lucide-react';
import { toDatetimeLocalValue } from '../broadcastFilters';
import { t } from '../i18n';
import type { NotificationBroadcastRecord } from '../services/firebase/models';
import '../views/redesign/notifications.css';

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
    <div className="lv-backdrop" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="lv-sheet rd-compose rd-compose--sheet"
        role="dialog"
        aria-modal="true"
        aria-label={t('Editar comunicado')}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="lv-sheet__grip" aria-hidden="true" />
        <div className="lv-sheet__head">
          <h2 className="lv-title-lg">{t('Editar comunicado')}</h2>
          <button type="button" onClick={onClose} className="lv-icon-btn" aria-label={t('Fechar')}>
            <X size={20} strokeWidth={2} />
          </button>
        </div>

        {!isScheduled ? (
          <p className="rd-compose__hint">
            {t('A mudança aparece na lista de avisos de quem recebeu. A notificação que já chegou no celular não é reenviada.')}
          </p>
        ) : null}

        {error ? <div className="lv-alert lv-alert--danger">{error}</div> : null}

        <label className="lv-field">
          <span>{t('Título')}</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} className="lv-input" maxLength={120} required />
        </label>

        <label className="lv-field">
          <span>{t('Mensagem')}</span>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} className="lv-textarea" maxLength={1000} required />
        </label>

        {isScheduled ? (
          <label className="lv-field">
            <span>{t('Enviar em')}</span>
            <input
              type="datetime-local"
              value={scheduleValue}
              min={toDatetimeLocalValue(new Date())}
              onChange={(event) => setScheduleValue(event.target.value)}
              className="lv-input"
              required
            />
          </label>
        ) : null}

        <div className="rd-compose__actions">
          <button type="button" onClick={onClose} disabled={busy} className="lv-btn lv-btn--neutral">
            {t('Cancelar')}
          </button>
          <button type="submit" disabled={busy} className="lv-btn lv-btn--primary">
            {busy ? t('Salvando...') : t('Salvar')}
          </button>
        </div>
      </form>
    </div>
  );
};

export default EditBroadcastModal;
