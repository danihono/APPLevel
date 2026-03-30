import React, { useEffect, useState } from 'react';
import { Bell, CheckCircle2, Megaphone, Send } from 'lucide-react';
import { formatDateLabel } from '../services/firebase/adapters';
import type { FirestoreEntity } from '../services/firebase/data';
import type { AcademyRecord, NotificationRecord } from '../services/firebase/models';
import { UserRole } from '../types';

interface CommunicationViewProps {
  academyId: string;
  userRole?: UserRole;
  notifications: Array<FirestoreEntity<NotificationRecord>>;
  academies?: Array<FirestoreEntity<AcademyRecord>>;
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

const CommunicationView: React.FC<CommunicationViewProps> = ({
  academyId,
  userRole,
  notifications,
  academies = [],
  onSendNotification,
  onMarkRead,
}) => {
  const isStaff =
    userRole === UserRole.PROFESSOR ||
    userRole === UserRole.ADMIN ||
    userRole === UserRole.SUPERADMIN;

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [targetBelt, setTargetBelt] = useState('');
  const [selectedAcademyId, setSelectedAcademyId] = useState(academyId);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setSelectedAcademyId(academyId);
  }, [academyId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFeedback('');
    setError('');

    try {
      await onSendNotification({
        title,
        body,
        academyId: userRole === UserRole.SUPERADMIN ? selectedAcademyId : undefined,
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
      setError(markError instanceof Error ? markError.message : 'Nao foi possivel marcar o aviso como lido.');
    }
  }

  return (
    <div className="space-y-6 animate-fadeIn pb-8">
      {isStaff ? (
        <form onSubmit={handleSubmit} className="rounded-[28px] border border-gray-100 dark:border-white/5 bg-white dark:bg-dark-card p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-gold/10 p-3 text-gold">
              <Megaphone size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-black">Comunicacao da equipe</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Envie avisos para academia inteira, por faixa ou por perfil.</p>
            </div>
          </div>

          {feedback ? (
            <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              {feedback}
            </div>
          ) : null}

          {error ? (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {userRole === UserRole.SUPERADMIN ? (
              <label className="space-y-2 text-sm md:col-span-2">
                <span className="font-semibold">Academia</span>
                <select
                  value={selectedAcademyId}
                  onChange={(event) => setSelectedAcademyId(event.target.value)}
                  className="w-full rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-dark px-4 py-3 outline-none focus:ring-2 focus:ring-gold"
                >
                  {academies.map((academyOption) => (
                    <option key={academyOption.id} value={academyOption.id}>{academyOption.name}</option>
                  ))}
                </select>
              </label>
            ) : null}

            <label className="space-y-2 text-sm md:col-span-2">
              <span className="font-semibold">Titulo</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-dark px-4 py-3 outline-none focus:ring-2 focus:ring-gold"
                placeholder="Exame de faixa, aviso geral, mudanca de horario..."
                required
              />
            </label>

            <label className="space-y-2 text-sm md:col-span-2">
              <span className="font-semibold">Mensagem</span>
              <textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                className="min-h-32 w-full rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-dark px-4 py-3 outline-none focus:ring-2 focus:ring-gold"
                placeholder="Escreva o comunicado que deve chegar aos alunos e equipe."
                required
              />
            </label>

            <label className="space-y-2 text-sm">
              <span className="font-semibold">Perfil alvo</span>
              <select
                value={targetRole}
                onChange={(event) => setTargetRole(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-dark px-4 py-3 outline-none focus:ring-2 focus:ring-gold"
              >
                <option value="">Toda a academia</option>
                <option value="student">Alunos</option>
                <option value="professor">Professores</option>
                <option value="admin">Admins</option>
                {userRole === UserRole.SUPERADMIN ? <option value="superadmin">Fundadores</option> : null}
              </select>
            </label>

            <label className="space-y-2 text-sm">
              <span className="font-semibold">Faixa alvo</span>
              <select
                value={targetBelt}
                onChange={(event) => setTargetBelt(event.target.value)}
                className="w-full rounded-2xl border border-gray-200 dark:border-white/10 bg-white dark:bg-dark px-4 py-3 outline-none focus:ring-2 focus:ring-gold"
              >
                {beltOptions.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          <button
            type="submit"
            disabled={busy}
            className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-gold px-5 py-3 text-sm font-bold text-black disabled:opacity-60"
          >
            <Send size={16} />
            {busy ? 'Enviando...' : 'Enviar aviso'}
          </button>
        </form>
      ) : (
        <div className="rounded-[28px] border border-gray-100 dark:border-white/5 bg-white dark:bg-dark-card p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-gold/10 p-3 text-gold">
              <Bell size={20} />
            </div>
            <div>
              <h1 className="text-2xl font-black">Avisos da academia</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Mensagens da equipe e comunicados importantes.</p>
            </div>
          </div>
          {error ? (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </div>
      )}

      <section className="space-y-4">
        {notifications.map((notification) => {
          const unread = notification.status !== 'read';

          return (
            <article key={notification.id} className="rounded-[28px] border border-gray-100 dark:border-white/5 bg-white dark:bg-dark-card p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold">{notification.title}</h2>
                    {unread ? (
                      <span className="rounded-full bg-gold/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-gold">
                        Novo
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{notification.body}</p>
                </div>
                <div className="text-right text-xs text-gray-400">
                  <p>{formatDateLabel(notification.createdAt)}</p>
                  <p className="mt-1 capitalize">{notification.status}</p>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                {notification.targetRole ? (
                  <span className="rounded-full bg-gray-100 dark:bg-white/5 px-3 py-1 text-xs text-gray-500">
                    Perfil: {notification.targetRole}
                  </span>
                ) : null}
                {notification.targetBelt ? (
                  <span className="rounded-full bg-gray-100 dark:bg-white/5 px-3 py-1 text-xs text-gray-500">
                    Faixa: {notification.targetBelt}
                  </span>
                ) : null}
                {unread ? (
                  <button
                    onClick={() => void handleMarkRead(notification.id)}
                    className="inline-flex items-center gap-2 rounded-full bg-gold/10 px-3 py-1 text-xs font-bold text-gold"
                  >
                    <CheckCircle2 size={14} />
                    Marcar como lido
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}

        {notifications.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-gray-200 dark:border-white/10 p-6 text-sm text-gray-500 dark:text-gray-400">
            Nenhum aviso encontrado para este perfil.
          </div>
        ) : null}
      </section>
    </div>
  );
};

export default CommunicationView;
