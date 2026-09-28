import React, { useState } from 'react';
import { CalendarClock, CheckCheck, Pencil, Smartphone, Trash2 } from 'lucide-react';
import { describeBroadcastFilters } from '../broadcastFilters';
import { getLocale, t } from '../i18n';
import type { FirestoreEntity } from '../services/firebase/data';
import type { NotificationBroadcastRecord } from '../services/firebase/models';
import { useConfirm } from './ConfirmDialog';
import EditBroadcastModal, { type EditBroadcastSubmit } from './EditBroadcastModal';

interface BroadcastListProps {
  className?: string;
  broadcasts: Array<FirestoreEntity<NotificationBroadcastRecord>>;
  onUpdate: (payload: EditBroadcastSubmit & { broadcastId: string }) => Promise<void>;
  onDelete: (broadcastId: string) => Promise<void>;
}

function formatDate(value?: { toDate(): Date } | null) {
  if (!value) {
    return '';
  }
  return value.toDate().toLocaleString(getLocale(), {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

const BroadcastList: React.FC<BroadcastListProps> = ({ className = '', broadcasts, onUpdate, onDelete }) => {
  const confirm = useConfirm();
  const [editing, setEditing] = useState<FirestoreEntity<NotificationBroadcastRecord> | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const handleDelete = async (broadcast: FirestoreEntity<NotificationBroadcastRecord>) => {
    const ok = await confirm({
      title: t('Excluir comunicado'),
      message: broadcast.status === 'scheduled'
        ? t('O comunicado agendado será cancelado e não será enviado.')
        : t('O comunicado some da lista de avisos de todos que receberam. A notificação que já chegou no celular não é apagada.'),
      confirmLabel: t('Excluir'),
      tone: 'danger',
    });
    if (!ok) {
      return;
    }

    setError('');
    setDeletingId(broadcast.id);
    try {
      await onDelete(broadcast.id);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : t('Não foi possível excluir o comunicado.'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className={`broadcast-list ${className}`}>
      <div className="broadcast-list__header">
        <p className="app-section-label">{t('Enviados e agendados')}</p>
      </div>

      {error ? <div className="app-alert app-alert--error">{error}</div> : null}

      {broadcasts.length === 0 ? (
        <div className="app-empty">{t('Nenhum comunicado enviado ainda.')}</div>
      ) : null}

      {broadcasts.map((broadcast) => {
        const isScheduled = broadcast.status === 'scheduled';
        const filterSummary = describeBroadcastFilters(broadcast.filters);
        return (
          <article key={broadcast.id} className="app-list-card broadcast-list__card">
            <div className="broadcast-list__top">
              <h3 className="broadcast-list__title">{broadcast.title}</h3>
              {isScheduled ? (
                <span className="app-badge app-badge--gold">
                  <CalendarClock size={12} /> {t('Agendado para {date}', { date: formatDate(broadcast.scheduledAt) })}
                </span>
              ) : null}
              {broadcast.status === 'sending' ? <span className="app-badge app-badge--muted">{t('Enviando...')}</span> : null}
              {broadcast.status === 'failed' ? <span className="app-badge app-badge--muted">{t('Falhou')}</span> : null}
            </div>

            <p className="broadcast-list__body">{broadcast.body}</p>

            <p className="broadcast-list__meta">
              {t('Por {name}', { name: broadcast.createdByName || '—' })}
              {!isScheduled && broadcast.sentAt ? ` · ${formatDate(broadcast.sentAt)}` : ''}
            </p>

            {filterSummary.length > 0 ? (
              <div className="broadcast-list__filters">
                {filterSummary.map((part) => <span key={part} className="app-badge app-badge--muted">{part}</span>)}
              </div>
            ) : null}

            {broadcast.status === 'sent' ? (
              <div className="broadcast-list__stats">
                <span>
                  <CheckCheck size={14} />
                  {t('Lido por {read} de {total}', { read: broadcast.readCount ?? 0, total: broadcast.recipientCount ?? 0 })}
                </span>
                <span>
                  <Smartphone size={14} />
                  {broadcast.pushSent === 1
                    ? t('Notificação em 1 aparelho')
                    : t('Notificação em {count} aparelhos', { count: broadcast.pushSent ?? 0 })}
                </span>
              </div>
            ) : null}

            <div className="broadcast-list__actions">
              <button
                type="button"
                className="app-button app-button--ghost app-button--small"
                onClick={() => setEditing(broadcast)}
                disabled={broadcast.status === 'sending'}
              >
                <Pencil size={14} />
                {t('Editar')}
              </button>
              <button
                type="button"
                className="app-button app-button--ghost app-button--small"
                onClick={() => void handleDelete(broadcast)}
                disabled={deletingId === broadcast.id || broadcast.status === 'sending'}
              >
                <Trash2 size={14} />
                {deletingId === broadcast.id ? t('Excluindo...') : t('Excluir')}
              </button>
            </div>
          </article>
        );
      })}

      {editing ? (
        <EditBroadcastModal
          broadcast={editing}
          onClose={() => setEditing(null)}
          onSave={async (changes) => {
            await onUpdate({ broadcastId: editing.id, ...changes });
            setEditing(null);
          }}
        />
      ) : null}
    </section>
  );
};

export default BroadcastList;
