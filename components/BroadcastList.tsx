import React, { useState } from 'react';
import { CalendarClock, CheckCheck, Pencil, Smartphone, Trash2 } from 'lucide-react';
import { describeBroadcastFilters } from '../broadcastFilters';
import { getLocale, t } from '../i18n';
import type { FirestoreEntity } from '../services/firebase/data';
import type { NotificationBroadcastRecord } from '../services/firebase/models';
import { useConfirm } from './ConfirmDialog';
import EditBroadcastModal, { type EditBroadcastSubmit } from './EditBroadcastModal';
import '../views/redesign/notifications.css';

interface BroadcastListProps {
  className?: string;
  broadcasts: Array<FirestoreEntity<NotificationBroadcastRecord>>;
  onUpdate: (payload: EditBroadcastSubmit & { broadcastId: string }) => Promise<void>;
  onDelete: (broadcastId: string) => Promise<void>;
  /** Texto do vazio (ex.: quando a lista ja vem filtrada por canal). */
  emptyText?: string;
}

type StampLike = { toDate(): Date } | null | undefined;

function formatDate(value?: StampLike) {
  if (!value) {
    return '';
  }
  return value.toDate().toLocaleString(getLocale(), {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function toDate(value: StampLike): Date {
  return value ? value.toDate() : new Date();
}

/** Bloco de data dos cards de aviso: "28" grande + "SET". */
export const NoticeDate: React.FC<{ value: StampLike }> = ({ value }) => {
  const date = toDate(value);
  const month = date.toLocaleDateString(getLocale(), { month: 'short' }).replace(/\./g, '');
  return (
    <div className="rd-notices__date" aria-hidden="true">
      <span className="rd-notices__day">{date.getDate()}</span>
      <span className="rd-notices__mon">{month}</span>
    </div>
  );
};

/** Divisor por mes com o motivo das listras de grau. */
export const NoticeMonthDivider: React.FC<{ label: string }> = ({ label }) => (
  <div className="rd-notices__month" role="presentation">
    <span className="rd-notices__month-label">{label}</span>
    <span className="rd-notices__month-line" />
    <span className="lv-stripes" aria-hidden="true"><i /><i /><i /><i /></span>
  </div>
);

/** Agrupa por ano-mes, mantendo a ordem recebida. */
export function groupNoticesByMonth<T>(items: T[], getStamp: (item: T) => StampLike) {
  const groups: Array<{ key: string; label: string; items: T[] }> = [];
  const currentYear = new Date().getFullYear();
  for (const item of items) {
    const date = toDate(getStamp(item));
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    let group = groups.find((entry) => entry.key === key);
    if (!group) {
      const month = date.toLocaleDateString(getLocale(), { month: 'long' });
      group = {
        key,
        label: date.getFullYear() === currentYear ? month : `${month} ${date.getFullYear()}`,
        items: [],
      };
      groups.push(group);
    }
    group.items.push(item);
  }
  return groups;
}

function broadcastStamp(broadcast: FirestoreEntity<NotificationBroadcastRecord>): StampLike {
  return broadcast.sentAt ?? broadcast.scheduledAt ?? broadcast.createdAt;
}

const BroadcastList: React.FC<BroadcastListProps> = ({ className = '', broadcasts, onUpdate, onDelete, emptyText }) => {
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

  const groups = groupNoticesByMonth(broadcasts, broadcastStamp);

  return (
    <section className={`rd-broadcast ${className}`.trim()}>
      <div className="rd-broadcast__head">
        <span className="lv-label">{t('Enviados e agendados')}</span>
      </div>

      {error ? <div className="lv-alert lv-alert--danger">{error}</div> : null}

      {broadcasts.length === 0 ? (
        <div className="lv-card lv-card--dashed lv-empty">
          <p className="lv-empty__text">{emptyText ?? t('Nenhum comunicado enviado ainda.')}</p>
        </div>
      ) : null}

      {groups.map((group) => (
        <React.Fragment key={group.key}>
          <NoticeMonthDivider label={group.label} />
          {group.items.map((broadcast) => {
            const isScheduled = broadcast.status === 'scheduled';
            const filterSummary = describeBroadcastFilters(broadcast.filters);
            const stamp = broadcastStamp(broadcast);
            return (
              <article key={broadcast.id} className="rd-notices__card">
                <NoticeDate value={stamp} />
                <div className="rd-notices__main">
                  <div className="rd-notices__tags">
                    <span className="rd-notices__type">
                      {broadcast.channel === 'team' ? t('Equipe') : t('Comunicado')}
                    </span>
                    {isScheduled ? (
                      <span className="rd-notices__tag rd-notices__tag--gold">
                        <CalendarClock size={12} strokeWidth={2} />
                        {t('Agendado para {date}', { date: formatDate(broadcast.scheduledAt) })}
                      </span>
                    ) : null}
                    {broadcast.status === 'sending' ? <span className="rd-notices__tag">{t('Enviando...')}</span> : null}
                    {broadcast.status === 'failed' ? <span className="rd-notices__tag rd-notices__tag--danger">{t('Falhou')}</span> : null}
                  </div>

                  <h3 className="rd-notices__title">{broadcast.title}</h3>
                  <p className="rd-notices__body">{broadcast.body}</p>
                  <p className="rd-notices__time">
                    {t('Por {name}', { name: broadcast.createdByName || '—' })}
                    {!isScheduled && broadcast.sentAt ? ` · ${formatDate(broadcast.sentAt)}` : ''}
                  </p>

                  <div className="rd-notices__foot">
                    {filterSummary.length > 0 ? (
                      <span className="rd-notices__foot-item">
                        {t('Para: {audience}', { audience: filterSummary.join(' · ') })}
                      </span>
                    ) : null}
                    {broadcast.status === 'sent' ? (
                      <span className="rd-notices__foot-item">
                        <CheckCheck size={14} strokeWidth={2} />
                        {t('Lido por {read} de {total}', { read: broadcast.readCount ?? 0, total: broadcast.recipientCount ?? 0 })}
                      </span>
                    ) : null}
                    {broadcast.status === 'sent' ? (
                      <span className="rd-notices__foot-item rd-notices__foot-item--soft">
                        <Smartphone size={14} strokeWidth={2} />
                        {broadcast.pushSent === 1
                          ? t('Notificação em 1 aparelho')
                          : t('Notificação em {count} aparelhos', { count: broadcast.pushSent ?? 0 })}
                      </span>
                    ) : null}
                  </div>

                  <div className="rd-notices__actions">
                    <button
                      type="button"
                      className="lv-btn lv-btn--neutral lv-btn--sm rd-notices__btn"
                      onClick={() => setEditing(broadcast)}
                      disabled={broadcast.status === 'sending'}
                    >
                      <Pencil size={15} strokeWidth={2} />
                      {t('Editar')}
                    </button>
                    <button
                      type="button"
                      className="lv-btn lv-btn--danger lv-btn--sm rd-notices__btn"
                      onClick={() => void handleDelete(broadcast)}
                      disabled={deletingId === broadcast.id || broadcast.status === 'sending'}
                    >
                      <Trash2 size={15} strokeWidth={2} />
                      {deletingId === broadcast.id ? t('Excluindo...') : t('Excluir')}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </React.Fragment>
      ))}

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
