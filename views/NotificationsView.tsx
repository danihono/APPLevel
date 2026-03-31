import React, { useMemo, useState } from 'react';
import { Bell, BellRing, CheckCircle2, ClipboardCheck, GraduationCap, Send, XCircle } from 'lucide-react';
import type { FirestoreEntity } from '../services/firebase/data';
import type { AcademyRecord, ClassRecord, NotificationRecord, UserRecord } from '../services/firebase/models';
import { UserRole } from '../types';

interface NotificationsViewProps {
  academy: FirestoreEntity<AcademyRecord>;
  userRole?: UserRole;
  academyUsers: Array<FirestoreEntity<UserRecord>>;
  classes: Array<FirestoreEntity<ClassRecord>>;
  notifications: Array<FirestoreEntity<NotificationRecord>>;
  academies?: Array<FirestoreEntity<AcademyRecord>>;
  selectedAcademyId?: string;
  onSelectAcademy?: (academyId: string) => void;
  onSendNotification: (payload: {
    title: string;
    body: string;
    academyId?: string;
    targetRole?: 'student' | 'professor' | 'admin' | 'superadmin';
    targetBelt?: string;
  }) => Promise<void>;
  onMarkRead: (notificationId: string) => Promise<void>;
}

const beltOptions = [
  { value: '', label: 'Todas as faixas' },
  { value: 'white', label: 'Branca' },
  { value: 'blue', label: 'Azul' },
  { value: 'purple', label: 'Roxa' },
  { value: 'brown', label: 'Marrom' },
  { value: 'black', label: 'Preta' },
];

function formatStamp(value?: { toDate(): Date } | null) {
  if (!value) {
    return 'Agora';
  }

  return value.toDate().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function notificationType(notification: FirestoreEntity<NotificationRecord>) {
  const source = `${notification.title} ${notification.body}`.toLowerCase();

  if (source.includes('gradu')) {
    return 'Graduacao';
  }

  if (source.includes('acesso')) {
    return 'Pedido de acesso';
  }

  if (source.includes('aula') || source.includes('check') || source.includes('presenca')) {
    return 'Entrada em aula';
  }

  return 'Comunicado';
}

function roleLabel(value: UserRecord['role']) {
  switch (value) {
    case 'admin':
      return 'Head Coach';
    case 'professor':
      return 'Instrutor';
    case 'superadmin':
      return 'Superadmin';
    default:
      return 'Aluno';
  }
}

const NotificationsView: React.FC<NotificationsViewProps> = ({
  academy,
  userRole,
  academyUsers,
  classes,
  notifications,
  academies = [],
  selectedAcademyId = '',
  onSelectAcademy,
  onSendNotification,
  onMarkRead,
}) => {
  const isSuperAdmin = userRole === UserRole.SUPERADMIN;
  const [activeTab, setActiveTab] = useState<'notifications' | 'requests' | 'graduations'>('notifications');
  const [resolvedRequests, setResolvedRequests] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [targetBelt, setTargetBelt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const canBroadcast =
    userRole === UserRole.PROFESSOR ||
    userRole === UserRole.ADMIN ||
    userRole === UserRole.SUPERADMIN;
  const focusedAcademyName = isSuperAdmin
    ? (selectedAcademyId
      ? (academies.find((entry) => entry.id === selectedAcademyId)?.name ?? 'Academia em foco')
      : 'Toda a rede')
    : academy.name;

  const requestItems = useMemo(() => {
    const accessRequests = academyUsers
      .filter((entry) => entry.status !== 'active')
      .map((entry) => ({
        id: `access-${entry.id}`,
        type: 'Pedido de acesso',
        title: entry.displayName,
        body: `${roleLabel(entry.role)} aguardando liberacao de acesso na academia.`,
        createdAt: entry.updatedAt ?? entry.createdAt ?? null,
      }));

    const classEntries = classes
      .filter((entry) => entry.status === 'active' && entry.currentAttendanceCount > 0)
      .map((entry) => ({
        id: `class-${entry.id}`,
        type: 'Entrada em aula',
        title: entry.title,
        body: `${entry.currentAttendanceCount} presencas registradas na aula ativa. Revise o fluxo da turma se necessario.`,
        createdAt: entry.startedAt ?? entry.updatedAt ?? entry.createdAt ?? null,
      }));

    return [...accessRequests, ...classEntries].filter((entry) => !resolvedRequests.includes(entry.id));
  }, [academyUsers, classes, resolvedRequests]);

  const graduationItems = useMemo(() => (
    academyUsers
      .filter((entry) => entry.role === 'student')
      .map((entry) => {
        const stripeTarget = entry.nextStripeAttendanceTarget ?? Number.POSITIVE_INFINITY;
        const beltTarget = entry.nextBeltAttendanceTarget ?? Number.POSITIVE_INFINITY;
        const stripeGap = stripeTarget - entry.attendanceCount;
        const beltGap = beltTarget - entry.attendanceCount;

        if (beltGap <= 5) {
          return {
            id: `belt-${entry.id}`,
            name: entry.displayName,
            status: beltGap <= 0 ? 'Pronto para avaliacao de faixa' : `Faltam ${beltGap} presencas para a proxima faixa`,
            belt: entry.belt,
            attendanceCount: entry.attendanceCount,
          };
        }

        if (stripeGap <= 3) {
          return {
            id: `stripe-${entry.id}`,
            name: entry.displayName,
            status: stripeGap <= 0 ? 'Pronto para nova listra' : `Faltam ${stripeGap} presencas para a proxima listra`,
            belt: entry.belt,
            attendanceCount: entry.attendanceCount,
          };
        }

        return null;
      })
      .filter(Boolean)
  ), [academyUsers]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setFeedback('');

    try {
      await onSendNotification({
        title,
        body,
        academyId: isSuperAdmin ? (selectedAcademyId || undefined) : academy.id,
        targetRole: targetRole ? (targetRole as 'student' | 'professor' | 'admin' | 'superadmin') : undefined,
        targetBelt: targetBelt || undefined,
      });
      setTitle('');
      setBody('');
      setTargetRole('');
      setTargetBelt('');
      setFeedback('Aviso enviado com sucesso.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Nao foi possivel enviar o aviso.');
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkRead(notificationId: string) {
    try {
      await onMarkRead(notificationId);
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : 'Nao foi possivel marcar a notificacao como lida.');
    }
  }

  function resolveRequest(itemId: string) {
    setResolvedRequests((previous) => [...previous, itemId]);
  }

  return (
    <div className="view-shell">
      <section className="app-panel app-panel--hero app-panel-pad">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="app-section-label">{isSuperAdmin ? 'Comunicacao da rede' : 'Central da academia'}</p>
            <h1 className="app-section-title">
              {isSuperAdmin ? 'Avisos para toda a equipe, por academia ou por faixa' : 'Notificacoes, solicitacoes e graduacoes'}
            </h1>
            <p className="app-section-copy">
              {isSuperAdmin
                ? `Dispare comunicados para toda a rede ou segmente por academia, perfil e faixa. Contexto atual: ${focusedAcademyName}.`
                : `Uma central unica para acompanhar eventos da ${academy.name}, aprovar o que estiver pendente e manter a equipe alinhada.`}
            </p>
          </div>

          <div className="app-orb">
            <Bell size={16} />
            {notifications.filter((entry) => entry.status !== 'read').length} nao lidas
          </div>
        </div>

        {!isSuperAdmin ? (
          <div className="mt-6 app-segment app-segment--block">
          <button
            type="button"
            onClick={() => setActiveTab('notifications')}
            className={`app-segment__button ${activeTab === 'notifications' ? 'is-active' : ''}`}
          >
            <BellRing size={16} />
            Notificacoes
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('requests')}
            className={`app-segment__button ${activeTab === 'requests' ? 'is-active' : ''}`}
          >
            <ClipboardCheck size={16} />
            Solicitacoes
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('graduations')}
            className={`app-segment__button ${activeTab === 'graduations' ? 'is-active' : ''}`}
          >
            <GraduationCap size={16} />
            Graduacoes
          </button>
          </div>
        ) : null}
      </section>

      {activeTab === 'notifications' ? (
        <>
          {canBroadcast ? (
            <form onSubmit={handleSubmit} className="app-panel app-panel-pad">
              <div className="flex items-center gap-3">
                <div className="app-icon-shell">
                  <Send size={18} />
                </div>
                <div>
                  <p className="app-section-label">Comunicacao</p>
                  <h2 className="text-xl font-bold">
                    {isSuperAdmin ? 'Enviar aviso para a rede' : 'Enviar aviso para a academia'}
                  </h2>
                </div>
              </div>

              {feedback ? <div className="app-alert app-alert--success mt-6">{feedback}</div> : null}
              {error ? <div className="app-alert app-alert--error mt-6">{error}</div> : null}

              <div className="mt-6 app-grid-2">
                {isSuperAdmin ? (
                  <label className="app-field md:col-span-2">
                    <span className="app-field__label">Destino</span>
                    <select
                      value={selectedAcademyId}
                      onChange={(event) => onSelectAcademy?.(event.target.value)}
                      className="app-select"
                    >
                      <option value="">Toda a rede</option>
                      {academies.map((academyOption) => (
                        <option key={academyOption.id} value={academyOption.id}>{academyOption.name}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className="app-field md:col-span-2">
                  <span className="app-field__label">Titulo</span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="app-input"
                    placeholder="Mudanca de horario, exame, aviso interno..."
                    required
                  />
                </label>
                <label className="app-field md:col-span-2">
                  <span className="app-field__label">Mensagem</span>
                  <textarea
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    className="app-textarea"
                    placeholder="Escreva a comunicacao que deve chegar para alunos e equipe."
                    required
                  />
                </label>
                <label className="app-field">
                  <span className="app-field__label">Perfil alvo</span>
                  <select value={targetRole} onChange={(event) => setTargetRole(event.target.value)} className="app-select">
                    <option value="">Toda a academia</option>
                    <option value="student">Alunos</option>
                    <option value="professor">Professores</option>
                    <option value="admin">Admins</option>
                    {userRole === UserRole.SUPERADMIN ? <option value="superadmin">Superadmin</option> : null}
                  </select>
                </label>
                <label className="app-field">
                  <span className="app-field__label">Faixa alvo</span>
                  <select value={targetBelt} onChange={(event) => setTargetBelt(event.target.value)} className="app-select">
                    {beltOptions.map((option) => (
                      <option key={option.label} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <button type="submit" disabled={busy} className="app-button app-button--gold mt-6">
                <Send size={16} />
                {busy ? 'Enviando...' : 'Enviar aviso'}
              </button>
            </form>
          ) : null}

          <section className="app-list">
            {notifications.map((notification) => {
              const unread = notification.status !== 'read';

              return (
                <article key={notification.id} className="app-panel app-panel-pad">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-lg font-bold">{notification.title}</h2>
                        <span className="app-badge app-badge--muted">{notificationType(notification)}</span>
                        {isSuperAdmin && notification.academyId
                          ? (
                            <span className="app-badge app-badge--muted">
                              {academies.find((entry) => entry.id === notification.academyId)?.name ?? 'Academia'}
                            </span>
                          )
                          : null}
                        {unread ? <span className="app-badge app-badge--gold">Novo</span> : null}
                      </div>
                      <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)]">{notification.body}</p>
                    </div>

                    <div className="text-right text-xs text-[color:var(--text-soft)]">
                      <p>{formatStamp(notification.createdAt)}</p>
                      <p className="mt-1 capitalize">{notification.status}</p>
                    </div>
                  </div>

                  {(notification.targetRole || notification.targetBelt || unread) ? (
                    <div className="mt-5 flex flex-wrap gap-3">
                      {notification.targetRole ? <span className="app-badge app-badge--muted">Perfil: {notification.targetRole}</span> : null}
                      {notification.targetBelt ? <span className="app-badge app-badge--muted">Faixa: {notification.targetBelt}</span> : null}
                      {unread ? (
                        <button
                          type="button"
                          onClick={() => void handleMarkRead(notification.id)}
                          className="app-button app-button--ghost app-button--small"
                        >
                          <CheckCircle2 size={15} />
                          Marcar como lida
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              );
            })}

            {notifications.length === 0 ? (
              <div className="app-empty">
                {isSuperAdmin ? 'Nenhum aviso encontrado para o recorte atual da rede.' : 'Nenhuma notificacao encontrada para esta academia.'}
              </div>
            ) : null}
          </section>
        </>
      ) : null}

      {!isSuperAdmin && activeTab === 'requests' ? (
        <section className="app-list">
          {requestItems.map((item) => (
            <article key={item.id} className="app-panel app-panel-pad">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-lg font-bold">{item.title}</h2>
                    <span className="app-badge app-badge--gold">{item.type}</span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)]">{item.body}</p>
                </div>
                <div className="text-right text-xs text-[color:var(--text-soft)]">
                  {formatStamp(item.createdAt)}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" onClick={() => resolveRequest(item.id)} className="app-button app-button--gold app-button--small">
                  <CheckCircle2 size={15} />
                  Aprovar
                </button>
                <button type="button" onClick={() => resolveRequest(item.id)} className="app-button app-button--danger app-button--small">
                  <XCircle size={15} />
                  Rejeitar
                </button>
              </div>
            </article>
          ))}

          {requestItems.length === 0 ? (
            <div className="app-empty">Sem solicitacoes pendentes no momento.</div>
          ) : null}
        </section>
      ) : null}

      {!isSuperAdmin && activeTab === 'graduations' ? (
        <section className="app-list">
          {graduationItems.map((item) => (
            <article key={item?.id} className="app-panel app-panel-pad">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-lg font-bold">{item?.name}</h2>
                    <span className="app-badge app-badge--muted">Faixa {item?.belt}</span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)]">{item?.status}</p>
                </div>
                <div className="app-orb">
                  {item?.attendanceCount} presencas
                </div>
              </div>
            </article>
          ))}

          {graduationItems.length === 0 ? (
            <div className="app-empty">Nenhum aluno entrou na janela de graduacao agora.</div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
};

export default NotificationsView;
