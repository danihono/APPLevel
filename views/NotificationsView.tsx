import React, { useEffect, useMemo, useState } from 'react';
import {
  ALL_BELTS,
  beltLabel,
  getBeltOptions,
  inferKidsCategoryFromBirthDate,
  inferTrainingTypeFromBirthDate,
  isKidsOnlyBelt,
  kidsCategoryLabel,
} from '../beltCatalog';
import { Bell, BellRing, CheckCircle2, ChevronDown, ChevronUp, ClipboardCheck, GraduationCap, Send, XCircle } from 'lucide-react';
import AppVideoContent from '../components/AppVideoContent';
import type { FirestoreEntity } from '../services/firebase/data';
import type {
  AcademyRecord,
  AttendanceRequestRecord,
  ClassRecord,
  FightVideoSubmissionRecord,
  GraduationApprovalRequestRecord,
  JoinRequestRecord,
  NotificationChannel,
  NotificationRecord,
  UserRecord,
} from '../services/firebase/models';
import { UserRole, type KidsCategory } from '../types';

interface NotificationsViewProps {
  academy: FirestoreEntity<AcademyRecord>;
  userRole?: UserRole;
  currentUserId: string;
  academyUsers: Array<FirestoreEntity<UserRecord>>;
  classes: Array<FirestoreEntity<ClassRecord>>;
  notifications: Array<FirestoreEntity<NotificationRecord>>;
  joinRequests: Array<FirestoreEntity<JoinRequestRecord>>;
  attendanceRequests: Array<FirestoreEntity<AttendanceRequestRecord>>;
  graduationRequests: Array<FirestoreEntity<GraduationApprovalRequestRecord>>;
  fightVideoSubmissions: Array<FirestoreEntity<FightVideoSubmissionRecord>>;
  academies?: Array<FirestoreEntity<AcademyRecord>>;
  selectedAcademyId?: string;
  canActionRequests: boolean;
  onSelectAcademy?: (academyId: string) => void;
  onSendNotification: (payload: {
    title: string;
    body: string;
    academyId?: string;
    channel?: NotificationChannel;
    targetRole?: 'student' | 'professor' | 'superadmin';
    targetBelt?: string;
  }) => Promise<void>;
  onMarkRead: (notificationId: string) => Promise<void>;
  onApproveJoinRequest: (payload: { requestId: string; belt?: string; grade?: number }) => Promise<void>;
  onRejectJoinRequest: (requestId: string) => Promise<void>;
  onApproveAttendanceRequest: (requestId: string) => Promise<void>;
  onRejectAttendanceRequest: (requestId: string) => Promise<void>;
  onApproveGraduationRequest: (requestId: string) => Promise<void>;
  onApproveFightVideoSubmission: (requestId: string) => Promise<void>;
  onRejectFightVideoSubmission: (requestId: string) => Promise<void>;
  onOpenStudent?: (studentId: string) => void;
}

type JoinRequestDraft = {
  belt: string;
  grade: number;
};

type JoinRequestItem = {
  id: string;
  kind: 'join_request';
  title: string;
  body: string;
  meta: string;
  createdAt?: JoinRequestRecord['createdAt'];
  request: FirestoreEntity<JoinRequestRecord>;
  trainingType: 'Adulto' | 'Kids';
  inferredKidsCategory?: KidsCategory;
  beltOptions: Array<{ value: string; label: string }>;
};

type AttendanceRequestItem = {
  id: string;
  kind: 'attendance_request';
  title: string;
  body: string;
  meta: string;
  createdAt?: AttendanceRequestRecord['requestedAt'];
};

type FightVideoRequestItem = {
  id: string;
  kind: 'fight_video_submission';
  title: string;
  body: string;
  meta: string;
  createdAt?: FightVideoSubmissionRecord['createdAt'];
  request: FirestoreEntity<FightVideoSubmissionRecord>;
};

type RequestItem = JoinRequestItem | AttendanceRequestItem | FightVideoRequestItem;
type StaffTab = 'notifications' | 'requests' | 'communication' | 'graduations';

const beltOptions = [
  { value: '', label: 'Todas as faixas' },
  ...ALL_BELTS.map((belt) => ({ value: belt, label: beltLabel(belt) })),
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

function formatDateOnly(value?: string | null) {
  if (!value) {
    return 'Nao informado';
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString('pt-BR');
}

function roleLabel(value: UserRecord['role']) {
  switch (value) {
    case 'admin':
      return 'Professor';
    case 'professor':
      return 'Instrutor';
    case 'superadmin':
      return 'Superadmin';
    default:
      return 'Aluno';
  }
}

function notificationType(notification: FirestoreEntity<NotificationRecord>) {
  switch (notification.kind) {
    case 'join_request':
      return 'Pedido de acesso';
    case 'attendance_request':
      return 'Solicitacao de presenca';
    case 'graduation':
      return 'Graduacao';
    case 'fight_video_submission':
      return 'Video';
    default:
      return notification.channel === 'team' ? 'Equipe' : 'Comunicado';
  }
}

function fightVideoSourceLabel(sourceKind: FightVideoSubmissionRecord['sourceKind']) {
  switch (sourceKind) {
    case 'upload':
      return 'Arquivo enviado';
    case 'youtube':
      return 'Link do YouTube';
    default:
      return 'Link externo';
  }
}

function normalizeJoinRequestDraft(request: FirestoreEntity<JoinRequestRecord>): JoinRequestDraft {
  return {
    belt: request.requestedBelt,
    grade: Math.max(0, Math.floor(request.requestedGrade ?? 0)),
  };
}

function getInitial(value: string) {
  return value.trim().charAt(0).toUpperCase() || 'A';
}

function graduationTargetLabel(request: FirestoreEntity<GraduationApprovalRequestRecord>) {
  if (request.targetType === 'belt') {
    return `Faixa ${beltLabel(request.targetBelt)}`;
  }

  return `${request.targetStripes} grau na faixa ${beltLabel(request.targetBelt)}`;
}

function graduationStatusLabel(request: FirestoreEntity<GraduationApprovalRequestRecord>) {
  return request.remainingClasses <= 0
    ? 'Meta atingida. Aguardando aprovacao.'
    : `Falta ${request.remainingClasses} presenca para liberar a avaliacao.`;
}

const NotificationsView: React.FC<NotificationsViewProps> = ({
  academy,
  userRole,
  currentUserId,
  academyUsers,
  classes,
  notifications,
  joinRequests,
  attendanceRequests,
  graduationRequests,
  fightVideoSubmissions,
  academies = [],
  selectedAcademyId = '',
  canActionRequests,
  onSelectAcademy,
  onSendNotification,
  onMarkRead,
  onApproveJoinRequest,
  onRejectJoinRequest,
  onApproveAttendanceRequest,
  onRejectAttendanceRequest,
  onApproveGraduationRequest,
  onApproveFightVideoSubmission,
  onRejectFightVideoSubmission,
  onOpenStudent,
}) => {
  const isSuperAdmin = userRole === UserRole.SUPERADMIN;
  const isStudent = userRole === UserRole.ALUNO;
  const isProfessorMobileView = userRole === UserRole.PROFESSOR;
  const [activeTab, setActiveTab] = useState<StaffTab>('notifications');
  const [studentChannelTab, setStudentChannelTab] = useState<'academy' | 'team'>('academy');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [targetBelt, setTargetBelt] = useState('');
  const [channel, setChannel] = useState<NotificationChannel>('academy');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [processingRequestId, setProcessingRequestId] = useState<string | null>(null);
  const [joinRequestDrafts, setJoinRequestDrafts] = useState<Record<string, JoinRequestDraft>>({});
  const [expandedRequestId, setExpandedRequestId] = useState<string | null>(null);

  const canBroadcast =
    userRole === UserRole.PROFESSOR ||
    userRole === UserRole.SUPERADMIN;
  const focusedAcademyName = isSuperAdmin
    ? (selectedAcademyId
      ? (academies.find((entry) => entry.id === selectedAcademyId)?.name ?? 'Academia em foco')
      : 'Toda a rede')
    : academy.name;
  const unreadCount = notifications.filter((entry) => entry.status !== 'read').length;
  const professorNotifications = useMemo(
    () => [...notifications].sort((left, right) => (right.createdAt?.toMillis?.() ?? 0) - (left.createdAt?.toMillis?.() ?? 0)),
    [notifications],
  );

  const studentNotifications = useMemo(
    () => notifications.filter((notification) => {
      if (studentChannelTab === 'team') {
        return notification.channel === 'team';
      }

      return notification.channel === 'academy' || notification.channel === 'system';
    }),
    [notifications, studentChannelTab],
  );

  useEffect(() => {
    setJoinRequestDrafts((current) => {
      const next: Record<string, JoinRequestDraft> = {};

      for (const request of joinRequests) {
        if (request.status !== 'pending') {
          continue;
        }

        next[request.id] = current[request.id] ?? normalizeJoinRequestDraft(request);
      }

      return next;
    });
  }, [joinRequests]);

  const requestItems = useMemo<RequestItem[]>(() => {
    const pendingJoinRequests = joinRequests
      .filter((entry) => entry.status === 'pending')
      .map((entry) => {
        const inferredKidsCategory = entry.kidsCategory ?? inferKidsCategoryFromBirthDate(entry.birthDate);
        const trainingType =
          isKidsOnlyBelt(entry.requestedBelt) || inferredKidsCategory
            ? 'Kids'
            : inferTrainingTypeFromBirthDate(entry.birthDate);
        const allowedBelts = getBeltOptions(trainingType, inferredKidsCategory);
        const requestBeltOption = {
          value: entry.requestedBelt,
          label: beltLabel(entry.requestedBelt),
        };
        const availableBelts = allowedBelts.some((option) => option.value === entry.requestedBelt)
          ? allowedBelts
          : [...allowedBelts, requestBeltOption];

        return {
          id: entry.id,
          kind: 'join_request' as const,
          title: entry.displayName,
          body: `${entry.email} | faixa ${beltLabel(entry.requestedBelt)} | grau ${entry.requestedGrade}`,
          meta: `${entry.academyName} | CPF ${entry.cpf}`,
          createdAt: entry.createdAt,
          request: entry,
          trainingType,
          inferredKidsCategory,
          beltOptions: availableBelts,
        };
      });

    const pendingAttendanceRequests = attendanceRequests
      .filter((entry) => entry.status === 'pending')
      .filter((entry) => isSuperAdmin || userRole !== UserRole.PROFESSOR || entry.professorId === currentUserId)
      .map((entry) => ({
        id: entry.id,
        kind: 'attendance_request' as const,
        title: entry.userDisplayName,
        body: `${entry.classTitle} | professor ${entry.professorName || 'responsavel da aula'}`,
        meta: `Solicitada em ${formatStamp(entry.requestedAt)}`,
        createdAt: entry.requestedAt,
      }));

    const pendingFightVideoRequests = fightVideoSubmissions
      .filter((entry) => entry.status === 'pending')
      .map((entry) => ({
        id: entry.id,
        kind: 'fight_video_submission' as const,
        title: entry.athleteName,
        body: entry.title,
        meta: `${fightVideoSourceLabel(entry.sourceKind)} | ${formatStamp(entry.createdAt)}`,
        createdAt: entry.createdAt,
        request: entry,
      }));

    return [...pendingJoinRequests, ...pendingAttendanceRequests, ...pendingFightVideoRequests]
      .sort((left, right) => (right.createdAt?.toMillis?.() ?? 0) - (left.createdAt?.toMillis?.() ?? 0));
  }, [attendanceRequests, currentUserId, fightVideoSubmissions, isSuperAdmin, joinRequests, userRole]);

  useEffect(() => {
    setExpandedRequestId((current) => (
      current && requestItems.some((item) => item.id === current)
        ? current
        : null
    ));
  }, [requestItems]);

  const graduationItems = useMemo(
    () => graduationRequests
      .filter((entry) => entry.status === 'pending')
      .sort((left, right) => (right.updatedAt?.toMillis?.() ?? 0) - (left.updatedAt?.toMillis?.() ?? 0)),
    [graduationRequests],
  );

  function getJoinRequestDraft(request: FirestoreEntity<JoinRequestRecord>): JoinRequestDraft {
    return joinRequestDrafts[request.id] ?? normalizeJoinRequestDraft(request);
  }

  function setJoinRequestDraft(requestId: string, nextDraft: JoinRequestDraft) {
    setJoinRequestDrafts((current) => ({
      ...current,
      [requestId]: nextDraft,
    }));
  }

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
        channel,
        targetRole: targetRole ? (targetRole as 'student' | 'professor' | 'superadmin') : undefined,
        targetBelt: targetBelt || undefined,
      });
      setTitle('');
      setBody('');
      setTargetRole('');
      setTargetBelt('');
      setChannel('academy');
      setFeedback('Aviso enviado com sucesso.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Nao foi possivel enviar o aviso.');
    } finally {
      setBusy(false);
    }
  }

  async function handleProfessorCommunicationSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setFeedback('');

    try {
      await onSendNotification({
        title,
        body,
        academyId: academy.id,
        channel: 'academy',
      });
      setTitle('');
      setBody('');
      setFeedback('Comunicado enviado com sucesso.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Nao foi possivel criar o comunicado.');
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

  async function handleApprove(item: RequestItem) {
    setProcessingRequestId(item.id);
    setError('');

    try {
      if (item.kind === 'join_request') {
        const draft = getJoinRequestDraft(item.request);
        await onApproveJoinRequest({
          requestId: item.id,
          belt: draft.belt,
          grade: draft.grade,
        });
      } else if (item.kind === 'fight_video_submission') {
        await onApproveFightVideoSubmission(item.id);
      } else {
        await onApproveAttendanceRequest(item.id);
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Nao foi possivel aprovar a solicitacao.');
    } finally {
      setProcessingRequestId(null);
    }
  }

  async function handleReject(item: RequestItem) {
    const label = item.kind === 'join_request'
      ? 'solicitacao de cadastro'
      : item.kind === 'fight_video_submission'
        ? 'solicitacao de video'
        : 'solicitacao de presenca';
    if (!window.confirm(`Tem certeza que deseja rejeitar esta ${label}? Esta acao nao pode ser desfeita.`)) {
      return;
    }

    setProcessingRequestId(item.id);
    setError('');

    try {
      if (item.kind === 'join_request') {
        await onRejectJoinRequest(item.id);
      } else if (item.kind === 'fight_video_submission') {
        await onRejectFightVideoSubmission(item.id);
      } else {
        await onRejectAttendanceRequest(item.id);
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Nao foi possivel rejeitar a solicitacao.');
    } finally {
      setProcessingRequestId(null);
    }
  }

  async function handleApproveGraduation(item: FirestoreEntity<GraduationApprovalRequestRecord>) {
    setProcessingRequestId(item.id);
    setError('');

    try {
      await onApproveGraduationRequest(item.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Nao foi possivel aprovar a graduacao.');
    } finally {
      setProcessingRequestId(null);
    }
  }

  if (isProfessorMobileView) {
    return (
      <div className="view-shell notice-mobile">
        <section className="notice-mobile__hero">
          <div className="notice-mobile__tabs" role="tablist" aria-label="Central de avisos">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'notifications'}
              onClick={() => setActiveTab('notifications')}
              className={`notice-mobile__tab ${activeTab === 'notifications' ? 'is-active' : ''}`}
            >
              Notificacoes
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'requests'}
              onClick={() => setActiveTab('requests')}
              className={`notice-mobile__tab ${activeTab === 'requests' ? 'is-active' : ''}`}
            >
              Solicitacoes
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'communication'}
              onClick={() => setActiveTab('communication')}
              className={`notice-mobile__tab ${activeTab === 'communication' ? 'is-active' : ''}`}
            >
              Comunicacao
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'graduations'}
              onClick={() => setActiveTab('graduations')}
              className={`notice-mobile__tab ${activeTab === 'graduations' ? 'is-active' : ''}`}
            >
              Graduacoes
            </button>
          </div>
        </section>

        {activeTab === 'notifications' ? (
          <section className="notice-mobile__list">
            {professorNotifications.map((notification) => {
              const unread = notification.status !== 'read';

              return (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => {
                    if (unread) {
                      void handleMarkRead(notification.id);
                    }
                  }}
                  className="notice-mobile__notice-card"
                >
                  <div className="notice-mobile__notice-head">
                    <span className="notice-mobile__type-tag">{notificationType(notification)}</span>
                    {unread ? <span className="notice-mobile__unread-dot" aria-hidden="true" /> : null}
                  </div>
                  <p className="notice-mobile__notice-title">{notification.title}</p>
                  <p className="notice-mobile__notice-body">{notification.body}</p>
                  <p className="notice-mobile__notice-time">{formatStamp(notification.createdAt)}</p>
                </button>
              );
            })}

            {professorNotifications.length === 0 ? (
              <div className="notice-mobile__empty">Nenhuma notificacao encontrada para a unidade.</div>
            ) : null}
          </section>
        ) : null}

        {activeTab === 'requests' ? (
          <section className="notice-mobile__list">
            {error ? <div className="app-alert app-alert--error">{error}</div> : null}

            {requestItems.map((item) => {
              const isProcessing = processingRequestId === item.id;

              return (
                <article key={item.id} className="notice-mobile__request-card">
                  <div className="notice-mobile__request-row">
                    <div className="notice-mobile__avatar" aria-hidden="true">{getInitial(item.title)}</div>

                    <div className="notice-mobile__request-copy">
                      <p className="notice-mobile__request-name">{item.title}</p>
                      <p className="notice-mobile__request-body">{item.body}</p>
                      <p className="notice-mobile__request-time">
                        {item.kind === 'join_request' ? formatStamp(item.createdAt) : item.meta}
                      </p>
                    </div>
                  </div>

                  {canActionRequests ? (
                    <div className="notice-mobile__actions">
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => void handleApprove(item)}
                        className="app-button app-button--gold app-button--small"
                      >
                        <CheckCircle2 size={15} />
                        {isProcessing ? 'Processando...' : 'Aprovar'}
                      </button>
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => void handleReject(item)}
                        className="app-button app-button--danger app-button--small"
                      >
                        <XCircle size={15} />
                        Recusar
                      </button>
                    </div>
                  ) : (
                    <div className="notice-mobile__request-note">Sem permissao para agir sobre esta solicitacao.</div>
                  )}
                </article>
              );
            })}

            {requestItems.length === 0 ? (
              <div className="notice-mobile__empty">Sem solicitacoes pendentes no momento.</div>
            ) : null}
          </section>
        ) : null}

        {activeTab === 'communication' ? (
          <section className="notice-mobile__list">
            {canBroadcast ? (
              <form onSubmit={handleProfessorCommunicationSubmit} className="notice-mobile__compose-card">
                <div>
                  <p className="notice-mobile__compose-label">Comunicacao</p>
                  <h2 className="notice-mobile__compose-title">Criar comunicado</h2>
                  <p className="notice-mobile__compose-copy">Envie um aviso rapido para toda a unidade.</p>
                </div>

                {feedback ? <div className="app-alert app-alert--success">{feedback}</div> : null}
                {error ? <div className="app-alert app-alert--error">{error}</div> : null}

                <label className="app-field">
                  <span className="app-field__label">Titulo</span>
                  <input value={title} onChange={(event) => setTitle(event.target.value)} className="app-input" required />
                </label>

                <label className="app-field">
                  <span className="app-field__label">Mensagem</span>
                  <textarea value={body} onChange={(event) => setBody(event.target.value)} className="app-textarea" required />
                </label>

                <button type="submit" disabled={busy} className="app-button app-button--gold">
                  <Send size={16} />
                  {busy ? 'Enviando...' : 'Criar comunicado'}
                </button>
              </form>
            ) : (
              <div className="notice-mobile__empty">Seu perfil nao pode criar comunicados.</div>
            )}
          </section>
        ) : null}

        {activeTab === 'graduations' ? (
          <section className="notice-mobile__list">
            {error ? <div className="app-alert app-alert--error">{error}</div> : null}

            {graduationItems.map((item) => {
              const isProcessing = processingRequestId === item.id;

              return (
                <article key={item.id} className="notice-mobile__request-card">
                  <div className="notice-mobile__request-row">
                    <div className="notice-mobile__avatar" aria-hidden="true">{getInitial(item.userDisplayName)}</div>

                    <div className="notice-mobile__request-copy">
                      <p className="notice-mobile__request-name">{item.userDisplayName}</p>
                      <p className="notice-mobile__request-body">
                        Atual: {beltLabel(item.currentBelt)} • {item.currentStripes} grau(s)
                      </p>
                      <p className="notice-mobile__request-time">
                        Proximo passo: {graduationTargetLabel(item)}
                      </p>
                      <p className="notice-mobile__request-time">{graduationStatusLabel(item)}</p>
                    </div>
                  </div>

                  <div className="notice-mobile__actions">
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => void handleApproveGraduation(item)}
                      className="app-button app-button--gold app-button--small"
                    >
                      <CheckCircle2 size={15} />
                      {isProcessing ? 'Processando...' : 'Aprovar'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenStudent?.(item.userId)}
                      className="app-button app-button--ghost app-button--small"
                    >
                      Abrir aluno
                    </button>
                  </div>
                </article>
              );
            })}

            {graduationItems.length === 0 ? (
              <div className="notice-mobile__empty">Nenhuma graduacao pendente na unidade.</div>
            ) : null}
          </section>
        ) : null}
      </div>
    );
  }

  return (
    <div className="view-shell">
      <section className="app-panel app-panel-pad">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold">{isStudent ? academy.name : focusedAcademyName}</p>
            <p className="mt-2 text-sm text-[color:var(--text-muted)]">
              {isStudent
                ? 'Avisos da academia e da equipe em um fluxo mais direto.'
                : 'Comunicados, solicitacoes e graduacoes do contexto atual.'}
            </p>
          </div>

          <div className="app-orb">
            <Bell size={16} />
            {unreadCount} nao lidas
          </div>
        </div>

        {isStudent ? (
          <div className="mt-5 app-segment app-segment--block">
            <button
              type="button"
              onClick={() => setStudentChannelTab('academy')}
              className={`app-segment__button ${studentChannelTab === 'academy' ? 'is-active' : ''}`}
            >
              <BellRing size={16} />
              Academia
            </button>
            <button
              type="button"
              onClick={() => setStudentChannelTab('team')}
              className={`app-segment__button ${studentChannelTab === 'team' ? 'is-active' : ''}`}
            >
              <ClipboardCheck size={16} />
              Equipe
            </button>
          </div>
        ) : (
          <div className="mt-5 app-segment app-segment--block">
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
              {`Solicitacoes${requestItems.length > 0 ? ` (${requestItems.length})` : ''}`}
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
        )}
      </section>

      {isStudent ? (
        <section className="app-list">
          {studentNotifications.map((notification) => {
            const unread = notification.status !== 'read';

            return (
              <article key={notification.id} className="app-panel app-panel-pad">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-lg font-bold">{notification.title}</h2>
                      <span className="app-badge app-badge--muted">{notificationType(notification)}</span>
                      {unread ? <span className="app-badge app-badge--gold">Novo</span> : null}
                    </div>
                    <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)]">{notification.body}</p>
                  </div>
                  <div className="text-right text-xs text-[color:var(--text-soft)]">
                    <p>{formatStamp(notification.createdAt)}</p>
                    <p className="mt-1 capitalize">{notification.status}</p>
                  </div>
                </div>

                {unread ? (
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() => void handleMarkRead(notification.id)}
                      className="app-button app-button--ghost app-button--small"
                    >
                      <CheckCircle2 size={15} />
                      Marcar como lida
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}

          {studentNotifications.length === 0 ? (
            <div className="app-empty">Nenhum aviso encontrado para este canal.</div>
          ) : null}
        </section>
      ) : null}

      {!isStudent && activeTab === 'notifications' ? (
        <>
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
                      <span className="app-badge app-badge--muted">Canal: {notification.channel}</span>
                      {notification.targetRole ? <span className="app-badge app-badge--muted">Perfil: {notification.targetRole}</span> : null}
                      {notification.targetBelt ? <span className="app-badge app-badge--muted">Faixa: {beltLabel(notification.targetBelt)}</span> : null}
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
              <div className="app-empty">Nenhuma notificacao encontrada para o contexto atual.</div>
            ) : null}
          </section>

          {canBroadcast ? (
            <form onSubmit={handleSubmit} className="app-panel app-panel-pad">
              <div className="flex items-center gap-3">
                <div className="app-icon-shell">
                  <Send size={18} />
                </div>
                <div>
                  <p className="app-section-label">Comunicacao</p>
                  <h2 className="text-xl font-bold">Enviar aviso</h2>
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

                <label className="app-field">
                  <span className="app-field__label">Canal</span>
                  <select value={channel} onChange={(event) => setChannel(event.target.value as NotificationChannel)} className="app-select">
                    <option value="academy">Academia</option>
                    <option value="team">Equipe</option>
                  </select>
                </label>

                <label className="app-field">
                  <span className="app-field__label">Perfil alvo</span>
                  <select value={targetRole} onChange={(event) => setTargetRole(event.target.value)} className="app-select">
                    <option value="">Toda a academia</option>
                    <option value="student">Alunos</option>
                    <option value="professor">Professores</option>
                    {userRole === UserRole.SUPERADMIN ? <option value="superadmin">Superadmin</option> : null}
                  </select>
                </label>

                <label className="app-field md:col-span-2">
                  <span className="app-field__label">Titulo</span>
                  <input value={title} onChange={(event) => setTitle(event.target.value)} className="app-input" required />
                </label>

                <label className="app-field md:col-span-2">
                  <span className="app-field__label">Mensagem</span>
                  <textarea value={body} onChange={(event) => setBody(event.target.value)} className="app-textarea" required />
                </label>

                <label className="app-field">
                  <span className="app-field__label">Faixa alvo</span>
                  <select value={targetBelt} onChange={(event) => setTargetBelt(event.target.value)} className="app-select">
                    {beltOptions.map((option, index) => (
                      <option key={option.value || `belt-option-${index}`} value={option.value}>{option.label}</option>
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
        </>
      ) : null}

      {!isStudent && activeTab === 'requests' ? (
        <section className="app-list">
          {error ? <div className="app-alert app-alert--error mb-4">{error}</div> : null}

          {requestItems.map((item) => {
            const isProcessing = processingRequestId === item.id;

            if (item.kind === 'join_request') {
              const draft = getJoinRequestDraft(item.request);
              const isExpanded = expandedRequestId === item.id;

              return (
                <article key={`${item.kind}-${item.id}`} className="app-panel app-panel-pad">
                  <button
                    type="button"
                    onClick={() => setExpandedRequestId((current) => current === item.id ? null : item.id)}
                    className="w-full text-left"
                    aria-expanded={isExpanded}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <h2 className="text-lg font-bold">{item.title}</h2>
                          <span className="app-badge app-badge--gold">Pedido de acesso</span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="app-badge app-badge--muted">Faixa {beltLabel(item.request.requestedBelt)}</span>
                          <span className="app-badge app-badge--muted">Grau {item.request.requestedGrade}</span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                          <span>{isExpanded ? 'Ocultar detalhes' : 'Toque para ver detalhes'}</span>
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </div>
                      </div>
                    </div>
                  </button>

                  {isExpanded ? (
                    <>
                      <div className="mt-5 flex flex-wrap items-center gap-3">
                        <span className="app-badge app-badge--muted">Trilha {item.trainingType}</span>
                        {item.inferredKidsCategory ? (
                          <span className="app-badge app-badge--muted">{kidsCategoryLabel(item.inferredKidsCategory)}</span>
                        ) : null}
                        <span className="app-badge app-badge--muted">{formatStamp(item.createdAt)}</span>
                      </div>

                      <div className="mt-5 app-grid-2">
                        <div className="app-list-card">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">Nome completo</p>
                          <p className="mt-1 text-sm font-bold">{item.request.firstName} {item.request.lastName}</p>
                        </div>
                        <div className="app-list-card">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">E-mail</p>
                          <p className="mt-1 text-sm font-bold">{item.request.email}</p>
                        </div>
                        <div className="app-list-card">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">CPF</p>
                          <p className="mt-1 text-sm font-bold">{item.request.cpf}</p>
                        </div>
                        <div className="app-list-card">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">Nascimento</p>
                          <p className="mt-1 text-sm font-bold">{formatDateOnly(item.request.birthDate)}</p>
                        </div>
                        <div className="app-list-card">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">Faixa solicitada</p>
                          <p className="mt-1 text-sm font-bold">{beltLabel(item.request.requestedBelt)}</p>
                        </div>
                        <div className="app-list-card">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">Grau solicitado</p>
                          <p className="mt-1 text-sm font-bold">{item.request.requestedGrade}</p>
                        </div>
                        <div className="app-list-card">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">Competidor</p>
                          <p className="mt-1 text-sm font-bold">{item.request.isCompetitor ? 'Sim' : 'Nao'}</p>
                        </div>
                        <div className="app-list-card">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">Responsavel pela aprovacao</p>
                          <p className="mt-1 text-sm font-bold">Professores da unidade</p>
                        </div>
                      </div>

                      {canActionRequests ? (
                        <>
                          <div className="mt-5 app-panel app-panel--soft p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="app-section-label">Graduacao de entrada</p>
                                <p className="mt-2 text-sm text-[color:var(--text-muted)]">
                                  Ajuste faixa e grau antes de aprovar. O aluno sera criado com essa graduacao.
                                </p>
                              </div>
                            </div>

                            <div className="mt-4 app-grid-2">
                              <label className="app-field">
                                <span className="app-field__label">Faixa</span>
                                <select
                                  value={draft.belt}
                                  onChange={(event) => setJoinRequestDraft(item.id, {
                                    ...draft,
                                    belt: event.target.value,
                                  })}
                                  className="app-select"
                                  disabled={isProcessing}
                                >
                                  {item.beltOptions.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                              </label>

                              <label className="app-field">
                                <span className="app-field__label">Grau</span>
                                <input
                                  type="number"
                                  min={0}
                                  value={draft.grade}
                                  onChange={(event) => setJoinRequestDraft(item.id, {
                                    ...draft,
                                    grade: Math.max(0, Math.floor(Number(event.target.value) || 0)),
                                  })}
                                  className="app-input"
                                  disabled={isProcessing}
                                />
                              </label>
                            </div>
                          </div>

                          <div className="mt-5 flex flex-wrap gap-3">
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => void handleApprove(item)}
                              className="app-button app-button--gold app-button--small"
                            >
                              <CheckCircle2 size={15} />
                              {isProcessing ? 'Processando...' : 'Aprovar aluno'}
                            </button>
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => void handleReject(item)}
                              className="app-button app-button--danger app-button--small"
                            >
                              <XCircle size={15} />
                              Rejeitar
                            </button>
                          </div>
                        </>
                      ) : (
                        <div className="mt-5 app-empty">Somente professores da unidade podem agir sobre esta solicitacao.</div>
                      )}
                    </>
                  ) : null}
                </article>
              );
            }

            if (item.kind === 'fight_video_submission') {
              return (
                <article key={`${item.kind}-${item.id}`} className="app-panel app-panel-pad">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-lg font-bold">{item.title}</h2>
                        <span className="app-badge app-badge--gold">Solicitacao de video</span>
                      </div>
                      <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)]">{item.body}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="app-badge app-badge--muted">{fightVideoSourceLabel(item.request.sourceKind)}</span>
                        {item.request.opponentName ? (
                          <span className="app-badge app-badge--muted">vs {item.request.opponentName}</span>
                        ) : null}
                        <span className="app-badge app-badge--muted">
                          {item.request.occurredAt ? item.request.occurredAt.toDate().toLocaleDateString('pt-BR') : 'Data nao informada'}
                        </span>
                      </div>
                    </div>
                    <div className="text-right text-xs text-[color:var(--text-soft)]">
                      {formatStamp(item.createdAt)}
                    </div>
                  </div>

                  <div className="mt-5">
                    <AppVideoContent
                      title={item.request.title}
                      sourceUrl={item.request.sourceUrl}
                      sourceKind={item.request.sourceKind}
                    />
                  </div>

                  {canActionRequests ? (
                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => void handleApprove(item)}
                        className="app-button app-button--gold app-button--small"
                      >
                        <CheckCircle2 size={15} />
                        {isProcessing ? 'Processando...' : 'Aprovar video'}
                      </button>
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => void handleReject(item)}
                        className="app-button app-button--danger app-button--small"
                      >
                        <XCircle size={15} />
                        Rejeitar
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenStudent?.(item.request.athleteId)}
                        className="app-button app-button--ghost app-button--small"
                      >
                        Abrir aluno
                      </button>
                    </div>
                  ) : (
                    <div className="mt-5 app-empty">Somente professor ou superadmin podem agir sobre esta solicitacao.</div>
                  )}
                </article>
              );
            }

            return (
              <article key={`${item.kind}-${item.id}`} className="app-panel app-panel-pad">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-lg font-bold">{item.title}</h2>
                      <span className="app-badge app-badge--gold">Solicitacao de presenca</span>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)]">{item.body}</p>
                    <p className="mt-2 text-xs text-[color:var(--text-soft)]">{item.meta}</p>
                  </div>
                  <div className="text-right text-xs text-[color:var(--text-soft)]">
                    {formatStamp(item.createdAt)}
                  </div>
                </div>

                {canActionRequests ? (
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => void handleApprove(item)}
                      className="app-button app-button--gold app-button--small"
                    >
                      <CheckCircle2 size={15} />
                      {isProcessing ? 'Processando...' : 'Aprovar'}
                    </button>
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => void handleReject(item)}
                      className="app-button app-button--danger app-button--small"
                    >
                      <XCircle size={15} />
                      Rejeitar
                    </button>
                  </div>
                ) : (
                  <div className="mt-5 app-empty">Somente professor ou superadmin podem agir sobre esta solicitacao.</div>
                )}
              </article>
            );
          })}

          {requestItems.length === 0 ? (
            <div className="app-empty">Sem solicitacoes pendentes no momento.</div>
          ) : null}
        </section>
      ) : null}

      {!isStudent && activeTab === 'graduations' ? (
        <section className="app-list">
          {error ? <div className="app-alert app-alert--error mb-4">{error}</div> : null}

          {graduationItems.map((item) => {
            const isProcessing = processingRequestId === item.id;

            return (
            <article key={item.id} className="app-panel app-panel-pad">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-lg font-bold">{item.userDisplayName}</h2>
                    <span className="app-badge app-badge--muted">Atual: {beltLabel(item.currentBelt)}</span>
                    <span className="app-badge app-badge--gold">{item.targetType === 'belt' ? 'Faixa' : 'Grau'}</span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)]">{graduationStatusLabel(item)}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="app-badge app-badge--muted">Atual: {item.currentStripes} grau(s)</span>
                    <span className="app-badge app-badge--muted">Proximo passo: {graduationTargetLabel(item)}</span>
                    <span className="app-badge app-badge--muted">Meta: {item.attendanceTarget} presencas</span>
                  </div>
                </div>
                <div className="app-orb">
                  {item.attendanceCount} presencas
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => void handleApproveGraduation(item)}
                  className="app-button app-button--gold app-button--small"
                >
                  <CheckCircle2 size={15} />
                  {isProcessing ? 'Processando...' : 'Aprovar proxima graduacao'}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenStudent?.(item.userId)}
                  className="app-button app-button--ghost app-button--small"
                >
                  Abrir aluno
                </button>
              </div>
            </article>
            );
          })}

          {graduationItems.length === 0 ? (
            <div className="app-empty">Nenhuma graduacao pendente no contexto atual.</div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
};

export default NotificationsView;
