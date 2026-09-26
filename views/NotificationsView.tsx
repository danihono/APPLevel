import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ALL_BELTS,
  beltLabel,
  getBeltOptions,
  getUserProgressionSummary,
  inferKidsCategoryFromBirthDate,
  inferTrainingTypeFromBirthDate,
  isKidsOnlyBelt,
  kidsCategoryLabel,
} from '../beltCatalog';
import { Bell, BellRing, CheckCircle2, ChevronDown, ChevronUp, ClipboardCheck, GraduationCap, Send, Trash2, X, XCircle } from 'lucide-react';
import { useConfirm } from '../components/ConfirmDialog';
import AppVideoContent from '../components/AppVideoContent';
import PushOptInBanner from '../components/PushOptInBanner';
import DateField from '../components/DateField';
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
  ReactivationRequestRecord,
  UserRecord,
} from '../services/firebase/models';
import { isUnreadNotificationForViewer } from '../services/firebase/notifications';
import { UserRole, type KidsCategory } from '../types';
import { t, getLocale } from '../i18n';

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
  reactivationRequests?: Array<FirestoreEntity<ReactivationRequestRecord>>;
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
  onClearNotifications: (academyId?: string, skipUnread?: boolean, notificationIds?: string[]) => Promise<{ deleted: number }>;
  onApproveJoinRequest: (payload: { requestId: string; belt?: string; grade?: number }) => Promise<void>;
  onRejectJoinRequest: (requestId: string) => Promise<void>;
  onUpdateJoinRequest?: (payload: {
    requestId: string;
    firstName?: string;
    lastName?: string;
    phone?: string | null;
    cpf?: string;
    birthDate?: string;
    isCompetitor?: boolean;
    requestedBelt?: string;
    requestedGrade?: number;
  }) => Promise<void>;
  onTransferJoinRequest?: (payload: { requestId: string; targetAcademyId: string }) => Promise<void>;
  onApproveAttendanceRequest: (requestId: string) => Promise<void>;
  onRejectAttendanceRequest: (requestId: string) => Promise<void>;
  onApproveGraduationRequest: (requestId: string) => Promise<void>;
  onApproveFightVideoSubmission: (requestId: string) => Promise<void>;
  onRejectFightVideoSubmission: (requestId: string) => Promise<void>;
  onResolveReactivationRequest?: (requestId: string, approve: boolean) => Promise<void>;
  onRebuildUserDerivedState?: (userId: string) => Promise<void>;
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

type ReactivationRequestItem = {
  id: string;
  kind: 'reactivation_request';
  title: string;
  body: string;
  meta: string;
  createdAt?: ReactivationRequestRecord['createdAt'];
  request: FirestoreEntity<ReactivationRequestRecord>;
};

type RequestItem = JoinRequestItem | AttendanceRequestItem | FightVideoRequestItem | ReactivationRequestItem;
type StaffTab = 'notifications' | 'requests' | 'communication' | 'graduations';

function getNotificationBeltOptions() {
  return [
    { value: '', label: t('Todas as faixas') },
    ...ALL_BELTS.map((belt) => ({ value: belt, label: beltLabel(belt) })),
  ];
}

function formatStamp(value?: { toDate(): Date } | null) {
  if (!value) {
    return t('Agora');
  }

  return value.toDate().toLocaleString(getLocale(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateOnly(value?: string | null) {
  if (!value) {
    return t('Nao informado');
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString(getLocale());
}

function roleLabel(value: UserRecord['role']) {
  switch (value) {
    case 'admin':
      return t('Professor');
    case 'professor':
      return t('Instrutor');
    case 'superadmin':
      return t('Superadmin');
    default:
      return t('Aluno');
  }
}

function notificationType(notification: FirestoreEntity<NotificationRecord>) {
  switch (notification.kind) {
    case 'join_request':
      return t('Pedido de acesso');
    case 'attendance_request':
      return t('Solicitação de presença');
    case 'graduation':
      return t('Graduação');
    case 'fight_video_submission':
      return t('Video');
    case 'reactivation_request':
      return t('Reativação');
    default:
      return notification.channel === 'team' ? t('Equipe') : t('Comunicado');
  }
}

function fightVideoSourceLabel(sourceKind: FightVideoSubmissionRecord['sourceKind']) {
  switch (sourceKind) {
    case 'upload':
      return t('Arquivo enviado');
    case 'youtube':
      return t('Link do YouTube');
    default:
      return t('Link externo');
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
    return t('Faixa {belt}', { belt: beltLabel(request.targetBelt) });
  }

  return t('{count} grau na faixa {belt}', { count: request.targetStripes, belt: beltLabel(request.targetBelt) });
}

function graduationStatusLabel(request: FirestoreEntity<GraduationApprovalRequestRecord>) {
  if (request.remainingClasses <= 0) {
    return t('Meta atingida. Aguardando aprovação.');
  }
  const n = request.remainingClasses;
  if (request.targetType === 'belt') {
    return n === 1 ? t('Falta 1 presença para mudar de faixa.') : t('Faltam {count} presenças para mudar de faixa.', { count: n });
  }
  return n === 1 ? t('Falta 1 presença para ganhar um grau.') : t('Faltam {count} presenças para ganhar um grau.', { count: n });
}

function shouldRebuildGraduationState(user: FirestoreEntity<UserRecord>, rules?: AcademyRecord['progressionRules']) {
  if (user.role !== 'student' || user.status !== 'active') {
    return false;
  }

  const progression = getUserProgressionSummary({
    belt: user.belt,
    grade: user.grade,
    stripes: user.stripes,
    birthDate: user.birthDate,
    kidsCategory: user.kidsCategory,
    attendanceCount: user.attendanceCount,
    attendanceCountBonus: user.attendanceCountBonus,
    attendanceCountAtBeltStart: user.attendanceCountAtBeltStart,
    currentStripeProgress: user.currentStripeProgress,
    currentBeltProgress: user.currentBeltProgress,
  }, rules);

  return (progression.beltRemaining !== null && progression.beltRemaining <= 1)
    || (progression.stripeRemaining !== null && progression.stripeRemaining <= 1);
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
  reactivationRequests = [],
  academies = [],
  selectedAcademyId = '',
  canActionRequests,
  onSelectAcademy,
  onSendNotification,
  onMarkRead,
  onClearNotifications,
  onApproveJoinRequest,
  onRejectJoinRequest,
  onUpdateJoinRequest,
  onTransferJoinRequest,
  onApproveAttendanceRequest,
  onRejectAttendanceRequest,
  onApproveGraduationRequest,
  onApproveFightVideoSubmission,
  onRejectFightVideoSubmission,
  onResolveReactivationRequest,
  onRebuildUserDerivedState,
  onOpenStudent,
}) => {
  const isSuperAdmin = userRole === UserRole.SUPERADMIN;
  const isStudent = userRole === UserRole.ALUNO;
  const isProfessorMobileView = userRole === UserRole.PROFESSOR;
  const confirm = useConfirm();
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
  const [showAllStudent, setShowAllStudent] = useState(false);
  const [showAllStaff, setShowAllStaff] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<{
    firstName: string;
    lastName: string;
    phone: string;
    cpf: string;
    birthDate: string;
    isCompetitor: boolean;
    requestedBelt: string;
    requestedGrade: number;
  } | null>(null);
  const [editingBusy, setEditingBusy] = useState(false);
  const [editingError, setEditingError] = useState('');
  const [transferringRequestId, setTransferringRequestId] = useState<string | null>(null);
  const [transferTargetAcademyId, setTransferTargetAcademyId] = useState('');
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState('');
  const rebuildQueuedRef = useRef(new Set<string>());

  const canBroadcast =
    userRole === UserRole.PROFESSOR ||
    userRole === UserRole.SUPERADMIN;
  const focusedAcademyName = isSuperAdmin
    ? (selectedAcademyId
      ? (academies.find((entry) => entry.id === selectedAcademyId)?.name ?? t('Academia em foco'))
      : t('Toda a rede'))
    : academy.name;
  const notificationActionState = useMemo(
    () => ({
      joinRequests,
      attendanceRequests,
      graduationRequests,
      fightVideoSubmissions,
      reactivationRequests,
    }),
    [attendanceRequests, fightVideoSubmissions, graduationRequests, joinRequests, reactivationRequests],
  );
  const unreadCount = notifications.filter((entry) => isUnreadNotificationForViewer(entry, {
    viewerRole: userRole,
    actionState: notificationActionState,
  })).length;

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
  const visibleNotifications = isStudent ? studentNotifications : professorNotifications;

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
          body: `${entry.email} | ${t('faixa {belt}', { belt: beltLabel(entry.requestedBelt) })} | ${t('grau {grade}', { grade: entry.requestedGrade })}`,
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
        body: `${entry.classTitle} | ${t('professor {name}', { name: entry.professorName || t('responsável da aula') })}`,
        meta: t('Solicitada em {date}', { date: formatStamp(entry.requestedAt) }),
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

    const pendingReactivationRequests = reactivationRequests
      .filter((entry) => entry.status === 'pending')
      .map((entry) => ({
        id: entry.id,
        kind: 'reactivation_request' as const,
        title: entry.userDisplayName,
        body: `${entry.userEmail} — ${t('solicitou reativação da conta')}`,
        meta: t('Solicitada em {date}', { date: formatStamp(entry.requestedAt) }),
        createdAt: entry.createdAt,
        request: entry,
      }));

    return [...pendingJoinRequests, ...pendingAttendanceRequests, ...pendingFightVideoRequests, ...pendingReactivationRequests]
      .sort((left, right) => (right.createdAt?.toMillis?.() ?? 0) - (left.createdAt?.toMillis?.() ?? 0));
  }, [attendanceRequests, currentUserId, fightVideoSubmissions, isSuperAdmin, joinRequests, reactivationRequests, userRole]);

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

  const usersById = useMemo(
    () => new Map(academyUsers.map((entry) => [entry.id, entry])),
    [academyUsers],
  );

  const pendingGraduationUserIds = useMemo(
    () => new Set(graduationItems.map((item) => item.userId)),
    [graduationItems],
  );

  const missingGraduationSyncUserIds = useMemo(() => {
    if (isStudent || !onRebuildUserDerivedState) {
      return [];
    }

    return academyUsers
      .filter((entry) => !pendingGraduationUserIds.has(entry.id))
      .filter((entry) => shouldRebuildGraduationState(entry, academy.progressionRules))
      .map((entry) => entry.id);
  }, [academy.progressionRules, academyUsers, isStudent, onRebuildUserDerivedState, pendingGraduationUserIds]);

  useEffect(() => {
    if (!onRebuildUserDerivedState || missingGraduationSyncUserIds.length === 0) {
      return;
    }

    const queuedIds = missingGraduationSyncUserIds
      .filter((userId) => !rebuildQueuedRef.current.has(userId))
      .slice(0, 20);

    if (queuedIds.length === 0) {
      return;
    }

    queuedIds.forEach((userId) => rebuildQueuedRef.current.add(userId));

    void Promise.all(
      queuedIds.map(async (userId) => {
        try {
          await onRebuildUserDerivedState(userId);
        } catch {
          rebuildQueuedRef.current.delete(userId);
        }
      }),
    );
  }, [missingGraduationSyncUserIds, onRebuildUserDerivedState]);

  const beltReadyCount = useMemo(
    () => graduationItems.filter(
      (item) => item.targetType === 'belt' && item.remainingClasses <= 0,
    ).length,
    [graduationItems],
  );

  const grauReadyCount = useMemo(
    () => graduationItems.filter(
      (item) => item.targetType === 'stripe' && item.remainingClasses <= 0,
    ).length,
    [graduationItems],
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
      setFeedback(t('Aviso enviado com sucesso.'));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('Não foi possível enviar o aviso.'));
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
      setFeedback(t('Comunicado enviado com sucesso.'));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('Não foi possível criar o comunicado.'));
    } finally {
      setBusy(false);
    }
  }

  async function handleMarkRead(notificationId: string) {
    try {
      await onMarkRead(notificationId);
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : t('Não foi possível marcar a notificação como lida.'));
    }
  }

  async function handleClear() {
    setClearing(true);
    setConfirmClear(false);
    setError('');
    setFeedback('');
    try {
      const result = await onClearNotifications(
        selectedAcademyId || undefined,
        false,
        visibleNotifications.map((notification) => notification.id),
      );
      setShowAllStudent(false);
      setShowAllStaff(false);
      if (result.deleted === 0) {
        setError(t('Nenhuma notificação foi removida. Atualize a lista e tente novamente.'));
      }
    } catch (clearError) {
      setError(clearError instanceof Error ? clearError.message : t('Não foi possível limpar as notificações.'));
    } finally {
      setClearing(false);
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
      } else if (item.kind === 'reactivation_request') {
        await onResolveReactivationRequest?.(item.id, true);
      } else {
        await onApproveAttendanceRequest(item.id);
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t('Não foi possível aprovar a solicitação.'));
    } finally {
      setProcessingRequestId(null);
    }
  }

  async function handleReject(item: RequestItem) {
    const label = item.kind === 'join_request'
      ? t('solicitação de cadastro')
      : item.kind === 'fight_video_submission'
        ? t('solicitação de vídeo')
        : item.kind === 'reactivation_request'
          ? t('solicitação de reativação')
          : t('solicitação de presença');
    if (!(await confirm({
      title: t('Rejeitar solicitação'),
      message: t('Tem certeza que deseja rejeitar esta {label}? Esta ação não pode ser desfeita.', { label }),
      confirmLabel: t('Rejeitar'),
      tone: 'danger',
    }))) {
      return;
    }

    setProcessingRequestId(item.id);
    setError('');

    try {
      if (item.kind === 'join_request') {
        await onRejectJoinRequest(item.id);
      } else if (item.kind === 'fight_video_submission') {
        await onRejectFightVideoSubmission(item.id);
      } else if (item.kind === 'reactivation_request') {
        await onResolveReactivationRequest?.(item.id, false);
      } else {
        await onRejectAttendanceRequest(item.id);
      }
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t('Não foi possível rejeitar a solicitação.'));
    } finally {
      setProcessingRequestId(null);
    }
  }

  function startEditJoinRequest(request: FirestoreEntity<JoinRequestRecord>) {
    setEditingRequestId(request.id);
    setEditingDraft({
      firstName: request.firstName,
      lastName: request.lastName,
      phone: request.phone ?? '',
      cpf: request.cpf,
      birthDate: request.birthDate,
      isCompetitor: request.isCompetitor,
      requestedBelt: request.requestedBelt,
      requestedGrade: Math.max(0, Math.floor(request.requestedGrade ?? 0)),
    });
    setEditingError('');
  }

  function cancelEditJoinRequest() {
    setEditingRequestId(null);
    setEditingDraft(null);
    setEditingError('');
  }

  async function submitEditJoinRequest() {
    if (!editingRequestId || !editingDraft || !onUpdateJoinRequest) {
      return;
    }
    setEditingBusy(true);
    setEditingError('');
    try {
      await onUpdateJoinRequest({
        requestId: editingRequestId,
        firstName: editingDraft.firstName,
        lastName: editingDraft.lastName,
        phone: editingDraft.phone || null,
        cpf: editingDraft.cpf,
        birthDate: editingDraft.birthDate,
        isCompetitor: editingDraft.isCompetitor,
        requestedBelt: editingDraft.requestedBelt,
        requestedGrade: editingDraft.requestedGrade,
      });
      cancelEditJoinRequest();
    } catch (err) {
      setEditingError(err instanceof Error ? err.message : t('Não foi possível salvar a edição.'));
    } finally {
      setEditingBusy(false);
    }
  }

  function startTransferJoinRequest(request: FirestoreEntity<JoinRequestRecord>) {
    setTransferringRequestId(request.id);
    setTransferTargetAcademyId('');
    setTransferError('');
  }

  function cancelTransferJoinRequest() {
    setTransferringRequestId(null);
    setTransferTargetAcademyId('');
    setTransferError('');
  }

  async function submitTransferJoinRequest() {
    if (!transferringRequestId || !transferTargetAcademyId || !onTransferJoinRequest) {
      return;
    }
    if (!(await confirm({
      title: t('Transferir solicitação'),
      message: t('A solicitação sairá desta unidade e será encaminhada para a unidade escolhida. Confirma?'),
      confirmLabel: t('Transferir'),
    }))) {
      return;
    }
    setTransferBusy(true);
    setTransferError('');
    try {
      await onTransferJoinRequest({
        requestId: transferringRequestId,
        targetAcademyId: transferTargetAcademyId,
      });
      cancelTransferJoinRequest();
    } catch (err) {
      setTransferError(err instanceof Error ? err.message : t('Não foi possível encaminhar a solicitação.'));
    } finally {
      setTransferBusy(false);
    }
  }

  async function handleApproveGraduation(item: FirestoreEntity<GraduationApprovalRequestRecord>) {
    setProcessingRequestId(item.id);
    setError('');

    try {
      await onApproveGraduationRequest(item.id);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : t('Não foi possível aprovar a graduação.'));
    } finally {
      setProcessingRequestId(null);
    }
  }

  function renderClearButton(notifList: Array<FirestoreEntity<NotificationRecord>>) {
    if (notifList.length === 0) return null;
    return (
      <div className="flex justify-end px-1">
        <button
          type="button"
          onClick={() => setConfirmClear(true)}
          className="app-button app-button--ghost app-button--small"
        >
          <Trash2 size={14} />
          {t('Limpar tudo')}
        </button>
      </div>
    );
  }

  function renderClearModal() {
    if (!confirmClear) return null;
    return (
      <div
        className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 sm:items-center"
        onClick={() => setConfirmClear(false)}
      >
        <div
          className="app-panel app-panel-pad app-sheet-modal w-full max-w-sm rounded-b-none sm:rounded-[1.8rem]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="app-icon-shell" style={{ color: '#ef4444' }}>
                <Trash2 size={18} />
              </div>
              <h2 className="text-xl font-bold">{t('Limpar notificações')}</h2>
            </div>
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="app-button app-button--ghost app-button--icon"
            >
              <X size={18} />
            </button>
          </div>

          <div className="mt-6 app-list-card">
            <p className="text-sm text-[color:var(--text-muted)]">
              {t('Todas as notificações serão removidas permanentemente, inclusive as não lidas. Esta ação não pode ser desfeita.')}
            </p>
          </div>

          {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              disabled={clearing}
              className="app-button app-button--ghost flex-1"
            >
              {t('Cancelar')}
            </button>
            <button
              type="button"
              disabled={clearing}
              onClick={() => void handleClear()}
              className="app-button app-button--solid-danger flex-1"
            >
              <Trash2 size={14} />
              {clearing ? t('Limpando...') : t('Confirmar')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (isProfessorMobileView) {
    return (
      <div className="view-shell notice-mobile">
        <section className="notice-mobile__hero">
          <div className="notice-mobile__tabs" role="tablist" aria-label={t('Central de avisos')}>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'notifications'}
              onClick={() => setActiveTab('notifications')}
              className={`notice-mobile__tab ${activeTab === 'notifications' ? 'is-active' : ''}`}
            >
              {t('Notificações')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'requests'}
              onClick={() => setActiveTab('requests')}
              className={`notice-mobile__tab ${activeTab === 'requests' ? 'is-active' : ''}`}
            >
              {t('Solicitações')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'communication'}
              onClick={() => setActiveTab('communication')}
              className={`notice-mobile__tab ${activeTab === 'communication' ? 'is-active' : ''}`}
            >
              {t('Comunicação')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'graduations'}
              onClick={() => setActiveTab('graduations')}
              className={`notice-mobile__tab ${activeTab === 'graduations' ? 'is-active' : ''}`}
            >
              <span className="notice-mobile__tab-inner">
                {t('Graduações')}
                {graduationItems.length > 0
                  ? <span className="notice-mobile__tab-badge">{graduationItems.length}</span>
                  : null}
              </span>
            </button>
          </div>
        </section>

        {activeTab === 'notifications' ? (
          <section className="notice-mobile__list">
            <PushOptInBanner />
            {error ? <div className="app-alert app-alert--error">{error}</div> : null}

            {renderClearButton(professorNotifications)}

            {professorNotifications.slice(0, showAllStaff ? undefined : 5).map((notification) => {
              const unread = isUnreadNotificationForViewer(notification, {
                viewerRole: userRole,
                actionState: notificationActionState,
              });

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

            {professorNotifications.length > 5 && !showAllStaff ? (
              <button
                type="button"
                onClick={() => setShowAllStaff(true)}
                className="app-button app-button--ghost w-full"
              >
                {t('Ver mais ({count} restantes)', { count: professorNotifications.length - 5 })}
              </button>
            ) : null}

            {professorNotifications.length === 0 ? (
              <div className="notice-mobile__empty">{t('Nenhuma notificação encontrada para a unidade.')}</div>
            ) : null}
          </section>
        ) : null}

        {activeTab === 'requests' ? (
          <section className="notice-mobile__list">
            {error ? <div className="app-alert app-alert--error">{error}</div> : null}

            {requestItems.map((item) => {
              const isProcessing = processingRequestId === item.id;
              const isJoinRequest = item.kind === 'join_request';
              const joinRequest = isJoinRequest ? item.request : null;
              const groupOtherCount = joinRequest?.requestGroupId
                ? joinRequests.filter(
                    (entry) => entry.requestGroupId === joinRequest.requestGroupId && entry.id !== joinRequest.id,
                  ).length
                : 0;

              return (
                <React.Fragment key={item.id}>
                  <article className="notice-mobile__request-card">
                    <div className="notice-mobile__request-row">
                      <div className="notice-mobile__avatar" aria-hidden="true">{getInitial(item.title)}</div>

                      <div className="notice-mobile__request-copy">
                        <p className="notice-mobile__request-name">{item.title}</p>
                        <p className="notice-mobile__request-body">{item.body}</p>
                        <p className="notice-mobile__request-time">
                          {isJoinRequest ? formatStamp(item.createdAt) : item.meta}
                        </p>
                      </div>
                    </div>

                    {joinRequest && (joinRequest.transferredFromAcademyName || groupOtherCount > 0) ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {joinRequest.transferredFromAcademyName ? (
                          <span className="app-badge app-badge--gold">
                            {t('Encaminhada de {name}', { name: joinRequest.transferredFromAcademyName })}
                          </span>
                        ) : null}
                        {groupOtherCount > 0 ? (
                          <span className="app-badge app-badge--muted">
                            {t('Aluno também solicitou em {count} outra(s) unidade(s)', { count: groupOtherCount })}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    {canActionRequests ? (
                      <div className="notice-mobile__actions" style={{ flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => void handleApprove(item)}
                          className="app-button app-button--green app-button--small"
                        >
                          <CheckCircle2 size={15} />
                          {isProcessing ? t('Processando...') : t('Aprovar')}
                        </button>
                        {isJoinRequest && onUpdateJoinRequest ? (
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => startEditJoinRequest(item.request)}
                            className="app-button app-button--ghost app-button--small"
                          >
                            {t('Editar')}
                          </button>
                        ) : null}
                        {isJoinRequest && onTransferJoinRequest ? (
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => startTransferJoinRequest(item.request)}
                            className="app-button app-button--ghost app-button--small"
                          >
                            {t('Transferir')}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => void handleReject(item)}
                          className="app-button app-button--danger app-button--small"
                        >
                          <XCircle size={15} />
                          {t('Recusar')}
                        </button>
                      </div>
                    ) : (
                      <div className="notice-mobile__request-note">{t('Sem permissão para agir sobre esta solicitação.')}</div>
                    )}
                  </article>

                  {isJoinRequest && editingRequestId === item.id && editingDraft ? (
                    <div className="app-panel app-panel--soft p-4 mt-2">
                      <p className="app-section-label">{t('Editar dados do aluno')}</p>
                      {editingError ? (
                        <div className="app-alert app-alert--error mt-3">{editingError}</div>
                      ) : null}
                      <div className="mt-4 flex flex-col gap-3">
                        <label className="app-field">
                          <span className="app-field__label">{t('Nome')}</span>
                          <input
                            className="app-input"
                            value={editingDraft.firstName}
                            onChange={(event) => setEditingDraft({ ...editingDraft, firstName: event.target.value })}
                          />
                        </label>
                        <label className="app-field">
                          <span className="app-field__label">{t('Sobrenome')}</span>
                          <input
                            className="app-input"
                            value={editingDraft.lastName}
                            onChange={(event) => setEditingDraft({ ...editingDraft, lastName: event.target.value })}
                          />
                        </label>
                        <label className="app-field">
                          <span className="app-field__label">CPF</span>
                          <input
                            className="app-input"
                            value={editingDraft.cpf}
                            onChange={(event) => setEditingDraft({ ...editingDraft, cpf: event.target.value })}
                          />
                        </label>
                        <label className="app-field">
                          <span className="app-field__label">{t('Telefone')}</span>
                          <input
                            className="app-input"
                            value={editingDraft.phone}
                            onChange={(event) => setEditingDraft({ ...editingDraft, phone: event.target.value })}
                          />
                        </label>
                        <label className="app-field">
                          <span className="app-field__label">{t('Nascimento')}</span>
                          <DateField
                            value={editingDraft.birthDate}
                            onChange={(value) => setEditingDraft({ ...editingDraft, birthDate: value })}
                          />
                        </label>
                        <label className="app-field">
                          <span className="app-field__label">{t('Competidor')}</span>
                          <select
                            className="app-select"
                            value={editingDraft.isCompetitor ? 'yes' : 'no'}
                            onChange={(event) => setEditingDraft({ ...editingDraft, isCompetitor: event.target.value === 'yes' })}
                          >
                            <option value="no">{t('Não')}</option>
                            <option value="yes">{t('Sim')}</option>
                          </select>
                        </label>
                        <label className="app-field">
                          <span className="app-field__label">{t('Faixa')}</span>
                          <select
                            className="app-select"
                            value={editingDraft.requestedBelt}
                            onChange={(event) => setEditingDraft({ ...editingDraft, requestedBelt: event.target.value })}
                          >
                            {item.beltOptions.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="app-field">
                          <span className="app-field__label">{t('Grau')}</span>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            className="app-input"
                            value={editingDraft.requestedGrade}
                            onChange={(event) => {
                              const parsed = Number.parseInt(event.target.value, 10);
                              setEditingDraft({
                                ...editingDraft,
                                requestedGrade: Number.isNaN(parsed) ? 0 : Math.max(0, parsed),
                              });
                            }}
                          />
                        </label>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          type="button"
                          disabled={editingBusy}
                          onClick={() => void submitEditJoinRequest()}
                          className="app-button app-button--gold app-button--small"
                        >
                          {editingBusy ? t('Salvando...') : t('Salvar alterações')}
                        </button>
                        <button
                          type="button"
                          disabled={editingBusy}
                          onClick={() => cancelEditJoinRequest()}
                          className="app-button app-button--ghost app-button--small"
                        >
                          {t('Cancelar')}
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {isJoinRequest && transferringRequestId === item.id ? (
                    <div className="app-panel app-panel--soft p-4 mt-2">
                      <p className="app-section-label">{t('Transferir para outra unidade')}</p>
                      <p className="mt-2 text-sm text-[color:var(--text-muted)]">
                        {t('A solicitação sai desta unidade e vai para a unidade escolhida. Só os professores da nova unidade poderão aprovar.')}
                      </p>
                      {transferError ? (
                        <div className="app-alert app-alert--error mt-3">{transferError}</div>
                      ) : null}
                      <label className="app-field mt-4">
                        <span className="app-field__label">{t('Unidade de destino')}</span>
                        <select
                          className="app-select"
                          value={transferTargetAcademyId}
                          onChange={(event) => setTransferTargetAcademyId(event.target.value)}
                          disabled={transferBusy}
                        >
                          <option value="">{t('Selecione a unidade')}</option>
                          {academies
                            .filter((entry) => entry.id !== item.request.academyId)
                            .map((entry) => (
                              <option key={entry.id} value={entry.id}>{entry.name}</option>
                            ))}
                        </select>
                      </label>
                      <div className="mt-4 flex flex-wrap gap-3">
                        <button
                          type="button"
                          disabled={transferBusy || !transferTargetAcademyId}
                          onClick={() => void submitTransferJoinRequest()}
                          className="app-button app-button--gold app-button--small"
                        >
                          {transferBusy ? t('Encaminhando...') : t('Confirmar transferência')}
                        </button>
                        <button
                          type="button"
                          disabled={transferBusy}
                          onClick={() => cancelTransferJoinRequest()}
                          className="app-button app-button--ghost app-button--small"
                        >
                          {t('Cancelar')}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </React.Fragment>
              );
            })}

            {requestItems.length === 0 ? (
              <div className="notice-mobile__empty">{t('Sem solicitações pendentes no momento.')}</div>
            ) : null}
          </section>
        ) : null}

        {activeTab === 'communication' ? (
          <section className="notice-mobile__list">
            {canBroadcast ? (
              <form onSubmit={handleProfessorCommunicationSubmit} className="notice-mobile__compose-card">
                <div>
                  <p className="notice-mobile__compose-label">{t('Comunicação')}</p>
                  <h2 className="notice-mobile__compose-title">{t('Criar comunicado')}</h2>
                  <p className="notice-mobile__compose-copy">{t('Envie um aviso rápido para toda a unidade.')}</p>
                </div>

                {feedback ? <div className="app-alert app-alert--success">{feedback}</div> : null}
                {error ? <div className="app-alert app-alert--error">{error}</div> : null}

                <label className="app-field">
                  <span className="app-field__label">{t('Título')}</span>
                  <input value={title} onChange={(event) => setTitle(event.target.value)} className="app-input" required />
                </label>

                <label className="app-field">
                  <span className="app-field__label">{t('Mensagem')}</span>
                  <textarea value={body} onChange={(event) => setBody(event.target.value)} className="app-textarea" required />
                </label>

                <button type="submit" disabled={busy} className="app-button app-button--gold">
                  <Send size={16} />
                  {busy ? t('Enviando...') : t('Criar comunicado')}
                </button>
              </form>
            ) : (
              <div className="notice-mobile__empty">{t('Seu perfil não pode criar comunicados.')}</div>
            )}
          </section>
        ) : null}

        {activeTab === 'graduations' ? (
          <section className="notice-mobile__list">
            {error ? <div className="app-alert app-alert--error">{error}</div> : null}

            {graduationItems.map((item) => {
              const isProcessing = processingRequestId === item.id;
              const cardUser = usersById.get(item.userId);
              const lastApprovalMs = (cardUser?.lastGradeApprovalAt ?? cardUser?.lastStripeDateOverride)?.toMillis?.() ?? null;
              const lastAttendanceMs = cardUser?.lastAttendanceAt?.toMillis?.() ?? null;
              const isBlocked = lastApprovalMs !== null
                && !(lastAttendanceMs !== null && lastAttendanceMs > lastApprovalMs);

              return (
                <article key={item.id} className="notice-mobile__request-card">
                  <div className="notice-mobile__request-row">
                    <div className="notice-mobile__avatar" aria-hidden="true">{getInitial(item.userDisplayName)}</div>

                    <div className="notice-mobile__request-copy">
                      <p className="notice-mobile__request-name">{item.userDisplayName}</p>
                      <p className="notice-mobile__request-body">
                        {t('Atual: {belt} • {count} grau(s)', { belt: beltLabel(item.currentBelt), count: item.currentStripes })}
                      </p>
                      <p className="notice-mobile__request-time">
                        {t('Próximo passo: {target}', { target: graduationTargetLabel(item) })}
                      </p>
                      <p className="notice-mobile__request-time">{graduationStatusLabel(item)}</p>
                      {item.targetType === 'belt' && item.remainingClasses <= 0 ? (
                        <p className="notice-mobile__belt-ready-alert">
                          {t('Esse aluno está apto a mudar de faixa')}
                        </p>
                      ) : null}
                      {item.targetType === 'stripe' && item.remainingClasses <= 0 ? (
                        <p className="notice-mobile__belt-ready-alert">
                          {t('Esse aluno está apto a subir de grau')}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  {isBlocked ? (
                    <div className="app-alert app-alert--warning text-sm">
                      {t('Este aluno já foi graduado recentemente. Aguarde ele completar a próxima aula para liberar a próxima graduação.')}
                    </div>
                  ) : null}

                  <div className="notice-mobile__actions">
                    <button
                      type="button"
                      disabled={isProcessing || isBlocked}
                      onClick={() => void handleApproveGraduation(item)}
                      className="app-button app-button--green app-button--small"
                    >
                      <CheckCircle2 size={15} />
                      {isProcessing ? t('Processando...') : t('Aprovar')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenStudent?.(item.userId)}
                      className="app-button app-button--ghost app-button--small"
                    >
                      {t('Abrir aluno')}
                    </button>
                  </div>
                </article>
              );
            })}

            {graduationItems.length === 0 ? (
              <div className="notice-mobile__empty">{t('Nenhuma graduação pendente na unidade.')}</div>
            ) : null}
          </section>
        ) : null}

        {renderClearModal()}
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
                ? t('Avisos da academia e da equipe em um fluxo mais direto.')
                : t('Comunicados, solicitações e graduações do contexto atual.')}
            </p>
          </div>

          <div className="app-orb">
            <Bell size={16} />
            {t('{count} não lidas', { count: unreadCount })}
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
              {t('Academia')}
            </button>
            <button
              type="button"
              onClick={() => setStudentChannelTab('team')}
              className={`app-segment__button ${studentChannelTab === 'team' ? 'is-active' : ''}`}
            >
              <ClipboardCheck size={16} />
              {t('Equipe')}
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
              {t('Notificações')}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('requests')}
              className={`app-segment__button ${activeTab === 'requests' ? 'is-active' : ''}`}
            >
              <ClipboardCheck size={16} />
              {`${t('Solicitações')}${requestItems.length > 0 ? ` (${requestItems.length})` : ''}`}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('graduations')}
              className={`app-segment__button ${activeTab === 'graduations' ? 'is-active' : ''}`}
            >
              <GraduationCap size={16} />
              {`${t('Graduações')}${graduationItems.length > 0 ? ` (${graduationItems.length})` : ''}`}
              {beltReadyCount > 0 ? <span className="app-badge app-badge--gold">{t('{count} faixa', { count: beltReadyCount })}</span> : null}
              {grauReadyCount > 0 ? <span className="app-badge app-badge--muted">{t('{count} grau', { count: grauReadyCount })}</span> : null}
            </button>
          </div>
        )}
      </section>

      <PushOptInBanner />

      {isStudent ? (
        <section className="app-list">
          {renderClearButton(studentNotifications)}

          {studentNotifications.slice(0, showAllStudent ? undefined : 5).map((notification) => {
            const unread = isUnreadNotificationForViewer(notification, {
              viewerRole: userRole,
              actionState: notificationActionState,
            });

            return (
              <article key={notification.id} className="app-panel app-panel-pad">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="text-lg font-bold">{notification.title}</h2>
                      <span className="app-badge app-badge--muted">{notificationType(notification)}</span>
                      {unread ? <span className="app-badge app-badge--gold">{t('Novo')}</span> : null}
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
                      {t('Marcar como lida')}
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}

          {studentNotifications.length > 5 && !showAllStudent ? (
            <button
              type="button"
              onClick={() => setShowAllStudent(true)}
              className="app-button app-button--ghost w-full"
            >
              {t('Ver mais ({count} restantes)', { count: studentNotifications.length - 5 })}
            </button>
          ) : null}

          {studentNotifications.length === 0 ? (
            <div className="app-empty">{t('Nenhum aviso encontrado para este canal.')}</div>
          ) : null}
        </section>
      ) : null}

      {!isStudent && activeTab === 'notifications' ? (
        <>
          <section className="app-list">
            {renderClearButton(professorNotifications)}

            {professorNotifications.slice(0, showAllStaff ? undefined : 5).map((notification) => {
              const unread = isUnreadNotificationForViewer(notification, {
                viewerRole: userRole,
                actionState: notificationActionState,
              });

              return (
                <article key={notification.id} className="app-panel app-panel-pad">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-lg font-bold">{notification.title}</h2>
                        <span className="app-badge app-badge--muted">{notificationType(notification)}</span>
                        {unread ? <span className="app-badge app-badge--gold">{t('Novo')}</span> : null}
                      </div>
                      <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)]">{notification.body}</p>
                    </div>

                    <div className="text-right text-xs text-[color:var(--text-soft)]">
                      <p>{formatStamp(notification.createdAt)}</p>
                      <p className="mt-1 capitalize">{notification.status}</p>
                    </div>
                  </div>

                  {(notification.targetRole || notification.targetBelt) ? (
                    <div className="mt-5 flex flex-wrap gap-3">
                      <span className="app-badge app-badge--muted">{t('Canal: {channel}', { channel: notification.channel })}</span>
                      {notification.targetRole ? <span className="app-badge app-badge--muted">{t('Perfil: {role}', { role: notification.targetRole })}</span> : null}
                      {notification.targetBelt ? <span className="app-badge app-badge--muted">{t('Faixa: {belt}', { belt: beltLabel(notification.targetBelt) })}</span> : null}
                    </div>
                  ) : null}

                  {unread ? (
                    <div className="mt-5 flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={() => void handleMarkRead(notification.id)}
                        className="app-button app-button--ghost app-button--small"
                      >
                        <CheckCircle2 size={15} />
                        {t('Marcar como lida')}
                      </button>
                    </div>
                  ) : null}
                </article>
              );
            })}

            {professorNotifications.length > 5 && !showAllStaff ? (
              <button
                type="button"
                onClick={() => setShowAllStaff(true)}
                className="app-button app-button--ghost w-full"
              >
                {t('Ver mais ({count} restantes)', { count: professorNotifications.length - 5 })}
              </button>
            ) : null}

            {professorNotifications.length === 0 ? (
              <div className="app-empty">{t('Nenhuma notificação encontrada para o contexto atual.')}</div>
            ) : null}
          </section>

          {canBroadcast ? (
            <form onSubmit={handleSubmit} className="app-panel app-panel-pad">
              <div className="flex items-center gap-3">
                <div className="app-icon-shell">
                  <Send size={18} />
                </div>
                <div>
                  <p className="app-section-label">{t('Comunicação')}</p>
                  <h2 className="text-xl font-bold">{t('Enviar aviso')}</h2>
                </div>
              </div>

              {feedback ? <div className="app-alert app-alert--success mt-6">{feedback}</div> : null}
              {error ? <div className="app-alert app-alert--error mt-6">{error}</div> : null}

              <div className="mt-6 app-grid-2">
                {isSuperAdmin ? (
                  <label className="app-field md:col-span-2">
                    <span className="app-field__label">{t('Destino')}</span>
                    <select
                      value={selectedAcademyId}
                      onChange={(event) => onSelectAcademy?.(event.target.value)}
                      className="app-select"
                    >
                      <option value="">{t('Toda a rede')}</option>
                      {academies.map((academyOption) => (
                        <option key={academyOption.id} value={academyOption.id}>{academyOption.name}</option>
                      ))}
                    </select>
                  </label>
                ) : null}

                <label className="app-field">
                  <span className="app-field__label">{t('Canal')}</span>
                  <select value={channel} onChange={(event) => setChannel(event.target.value as NotificationChannel)} className="app-select">
                    <option value="academy">{t('Academia')}</option>
                    <option value="team">{t('Equipe')}</option>
                  </select>
                </label>

                <label className="app-field">
                  <span className="app-field__label">{t('Perfil alvo')}</span>
                  <select value={targetRole} onChange={(event) => setTargetRole(event.target.value)} className="app-select">
                    <option value="">{t('Toda a academia')}</option>
                    <option value="student">{t('Alunos')}</option>
                    <option value="professor">{t('Professores')}</option>
                    {userRole === UserRole.SUPERADMIN ? <option value="superadmin">{t('Superadmin')}</option> : null}
                  </select>
                </label>

                <label className="app-field md:col-span-2">
                  <span className="app-field__label">{t('Título')}</span>
                  <input value={title} onChange={(event) => setTitle(event.target.value)} className="app-input" required />
                </label>

                <label className="app-field md:col-span-2">
                  <span className="app-field__label">{t('Mensagem')}</span>
                  <textarea value={body} onChange={(event) => setBody(event.target.value)} className="app-textarea" required />
                </label>

                <label className="app-field">
                  <span className="app-field__label">{t('Faixa alvo')}</span>
                  <select value={targetBelt} onChange={(event) => setTargetBelt(event.target.value)} className="app-select">
                    {getNotificationBeltOptions().map((option, index) => (
                      <option key={option.value || `belt-option-${index}`} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <button type="submit" disabled={busy} className="app-button app-button--gold mt-6">
                <Send size={16} />
                {busy ? t('Enviando...') : t('Enviar aviso')}
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
                          <span className="app-badge app-badge--gold">{t('Pedido de acesso')}</span>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <span className="app-badge app-badge--muted">{t('Faixa {belt}', { belt: beltLabel(item.request.requestedBelt) })}</span>
                          <span className="app-badge app-badge--muted">{t('Grau {grade}', { grade: item.request.requestedGrade })}</span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[color:var(--text-soft)]">
                          <span>{isExpanded ? t('Ocultar detalhes') : t('Toque para ver detalhes')}</span>
                          {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </div>
                      </div>
                    </div>
                  </button>

                  {isExpanded ? (
                    <>
                      <div className="mt-5 flex flex-wrap items-center gap-3">
                        <span className="app-badge app-badge--muted">{t('Trilha {track}', { track: t(item.trainingType) })}</span>
                        {item.inferredKidsCategory ? (
                          <span className="app-badge app-badge--muted">{kidsCategoryLabel(item.inferredKidsCategory)}</span>
                        ) : null}
                        <span className="app-badge app-badge--muted">{formatStamp(item.createdAt)}</span>
                        {item.request.transferredFromAcademyName ? (
                          <span className="app-badge app-badge--gold">
                            {t('Encaminhada de {name}', { name: item.request.transferredFromAcademyName })}
                          </span>
                        ) : null}
                        {item.request.requestGroupId ? (
                          (() => {
                            const otherCount = joinRequests.filter(
                              (entry) =>
                                entry.requestGroupId === item.request.requestGroupId && entry.id !== item.id,
                            ).length;
                            return otherCount > 0 ? (
                              <span className="app-badge app-badge--muted">
                                {t('Aluno também solicitou em {count} outra(s) unidade(s)', { count: otherCount })}
                              </span>
                            ) : null;
                          })()
                        ) : null}
                      </div>

                      <div className="mt-5 app-grid-2">
                        <div className="app-list-card">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">{t('Nome completo')}</p>
                          <p className="mt-1 text-sm font-bold">{item.request.firstName} {item.request.lastName}</p>
                        </div>
                        <div className="app-list-card">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">{t('E-mail')}</p>
                          <p className="mt-1 text-sm font-bold">{item.request.email}</p>
                        </div>
                        <div className="app-list-card">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">CPF</p>
                          <p className="mt-1 text-sm font-bold">{item.request.cpf}</p>
                        </div>
                        <div className="app-list-card">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">{t('Nascimento')}</p>
                          <p className="mt-1 text-sm font-bold">{formatDateOnly(item.request.birthDate)}</p>
                        </div>
                        <div className="app-list-card">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">{t('Faixa solicitada')}</p>
                          <p className="mt-1 text-sm font-bold">{beltLabel(item.request.requestedBelt)}</p>
                        </div>
                        <div className="app-list-card">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">{t('Grau solicitado')}</p>
                          <p className="mt-1 text-sm font-bold">{item.request.requestedGrade}</p>
                        </div>
                        <div className="app-list-card">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">{t('Competidor')}</p>
                          <p className="mt-1 text-sm font-bold">{item.request.isCompetitor ? t('Sim') : t('Nao')}</p>
                        </div>
                        <div className="app-list-card">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-[color:var(--text-soft)]">{t('Responsável pela aprovação')}</p>
                          <p className="mt-1 text-sm font-bold">{t('Professores da unidade')}</p>
                        </div>
                      </div>

                      {canActionRequests ? (
                        <>
                          <div className="mt-5 app-panel app-panel--soft p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="app-section-label">{t('Graduacao de entrada')}</p>
                                <p className="mt-2 text-sm text-[color:var(--text-muted)]">
                                  {t('Ajuste faixa e grau antes de aprovar. O aluno será criado com essa graduação.')}
                                </p>
                              </div>
                            </div>

                            <div className="mt-4 app-grid-2">
                              <label className="app-field">
                                <span className="app-field__label">{t('Faixa')}</span>
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
                                <span className="app-field__label">{t('Grau')}</span>
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
                              className="app-button app-button--green app-button--small"
                            >
                              <CheckCircle2 size={15} />
                              {isProcessing ? t('Processando...') : t('Aprovar aluno')}
                            </button>
                            {onUpdateJoinRequest ? (
                              <button
                                type="button"
                                disabled={isProcessing}
                                onClick={() => startEditJoinRequest(item.request)}
                                className="app-button app-button--ghost app-button--small"
                              >
                                {t('Editar dados')}
                              </button>
                            ) : null}
                            {onTransferJoinRequest ? (
                              <button
                                type="button"
                                disabled={isProcessing}
                                onClick={() => startTransferJoinRequest(item.request)}
                                className="app-button app-button--ghost app-button--small"
                              >
                                {t('Transferir unidade')}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => void handleReject(item)}
                              className="app-button app-button--danger app-button--small"
                            >
                              <XCircle size={15} />
                              {t('Rejeitar')}
                            </button>
                          </div>

                          {editingRequestId === item.id && editingDraft ? (
                            <div className="mt-5 app-panel app-panel--soft p-4">
                              <p className="app-section-label">{t('Editar dados do aluno')}</p>
                              {editingError ? (
                                <div className="app-alert app-alert--error mt-3">{editingError}</div>
                              ) : null}
                              <div className="mt-4 app-grid-2">
                                <label className="app-field">
                                  <span className="app-field__label">{t('Nome')}</span>
                                  <input
                                    className="app-input"
                                    value={editingDraft.firstName}
                                    onChange={(event) => setEditingDraft({ ...editingDraft, firstName: event.target.value })}
                                  />
                                </label>
                                <label className="app-field">
                                  <span className="app-field__label">{t('Sobrenome')}</span>
                                  <input
                                    className="app-input"
                                    value={editingDraft.lastName}
                                    onChange={(event) => setEditingDraft({ ...editingDraft, lastName: event.target.value })}
                                  />
                                </label>
                                <label className="app-field">
                                  <span className="app-field__label">CPF</span>
                                  <input
                                    className="app-input"
                                    value={editingDraft.cpf}
                                    onChange={(event) => setEditingDraft({ ...editingDraft, cpf: event.target.value })}
                                  />
                                </label>
                                <label className="app-field">
                                  <span className="app-field__label">{t('Telefone')}</span>
                                  <input
                                    className="app-input"
                                    value={editingDraft.phone}
                                    onChange={(event) => setEditingDraft({ ...editingDraft, phone: event.target.value })}
                                  />
                                </label>
                                <label className="app-field">
                                  <span className="app-field__label">{t('Nascimento')}</span>
                                  <DateField
                                    value={editingDraft.birthDate}
                                    onChange={(value) => setEditingDraft({ ...editingDraft, birthDate: value })}
                                  />
                                </label>
                                <label className="app-field">
                                  <span className="app-field__label">{t('Competidor')}</span>
                                  <select
                                    className="app-select"
                                    value={editingDraft.isCompetitor ? 'yes' : 'no'}
                                    onChange={(event) => setEditingDraft({ ...editingDraft, isCompetitor: event.target.value === 'yes' })}
                                  >
                                    <option value="no">{t('Não')}</option>
                                    <option value="yes">{t('Sim')}</option>
                                  </select>
                                </label>
                              </div>
                              <div className="mt-4 flex flex-wrap gap-3">
                                <button
                                  type="button"
                                  disabled={editingBusy}
                                  onClick={() => void submitEditJoinRequest()}
                                  className="app-button app-button--gold app-button--small"
                                >
                                  {editingBusy ? t('Salvando...') : t('Salvar alterações')}
                                </button>
                                <button
                                  type="button"
                                  disabled={editingBusy}
                                  onClick={() => cancelEditJoinRequest()}
                                  className="app-button app-button--ghost app-button--small"
                                >
                                  {t('Cancelar')}
                                </button>
                              </div>
                            </div>
                          ) : null}

                          {transferringRequestId === item.id ? (
                            <div className="mt-5 app-panel app-panel--soft p-4">
                              <p className="app-section-label">{t('Transferir para outra unidade')}</p>
                              <p className="mt-2 text-sm text-[color:var(--text-muted)]">
                                {t('A solicitação sai desta unidade e vai para a unidade escolhida. Só os professores da nova unidade poderão aprovar.')}
                              </p>
                              {transferError ? (
                                <div className="app-alert app-alert--error mt-3">{transferError}</div>
                              ) : null}
                              <label className="app-field mt-4">
                                <span className="app-field__label">{t('Unidade de destino')}</span>
                                <select
                                  className="app-select"
                                  value={transferTargetAcademyId}
                                  onChange={(event) => setTransferTargetAcademyId(event.target.value)}
                                  disabled={transferBusy}
                                >
                                  <option value="">{t('Selecione a unidade')}</option>
                                  {academies
                                    .filter((entry) => entry.id !== item.request.academyId)
                                    .map((entry) => (
                                      <option key={entry.id} value={entry.id}>{entry.name}</option>
                                    ))}
                                </select>
                              </label>
                              <div className="mt-4 flex flex-wrap gap-3">
                                <button
                                  type="button"
                                  disabled={transferBusy || !transferTargetAcademyId}
                                  onClick={() => void submitTransferJoinRequest()}
                                  className="app-button app-button--gold app-button--small"
                                >
                                  {transferBusy ? t('Encaminhando...') : t('Confirmar transferência')}
                                </button>
                                <button
                                  type="button"
                                  disabled={transferBusy}
                                  onClick={() => cancelTransferJoinRequest()}
                                  className="app-button app-button--ghost app-button--small"
                                >
                                  {t('Cancelar')}
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </>
                      ) : (
                        <div className="mt-5 app-empty">{t('Somente professores da unidade podem agir sobre esta solicitação.')}</div>
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
                        <span className="app-badge app-badge--gold">{t('Solicitacao de video')}</span>
                      </div>
                      <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)]">{item.body}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="app-badge app-badge--muted">{fightVideoSourceLabel(item.request.sourceKind)}</span>
                        {item.request.opponentName ? (
                          <span className="app-badge app-badge--muted">vs {item.request.opponentName}</span>
                        ) : null}
                        <span className="app-badge app-badge--muted">
                          {item.request.occurredAt ? item.request.occurredAt.toDate().toLocaleDateString(getLocale()) : t('Data não informada')}
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
                        className="app-button app-button--green app-button--small"
                      >
                        <CheckCircle2 size={15} />
                        {isProcessing ? t('Processando...') : t('Aprovar video')}
                      </button>
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => void handleReject(item)}
                        className="app-button app-button--danger app-button--small"
                      >
                        <XCircle size={15} />
                        {t('Rejeitar')}
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenStudent?.(item.request.athleteId)}
                        className="app-button app-button--ghost app-button--small"
                      >
                        {t('Abrir aluno')}
                      </button>
                    </div>
                  ) : (
                    <div className="mt-5 app-empty">{t('Somente professor ou superadmin podem agir sobre esta solicitação.')}</div>
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
                      <span className="app-badge app-badge--gold">{t('Solicitação de presença')}</span>
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
                      className="app-button app-button--green app-button--small"
                    >
                      <CheckCircle2 size={15} />
                      {isProcessing ? t('Processando...') : t('Aprovar')}
                    </button>
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => void handleReject(item)}
                      className="app-button app-button--danger app-button--small"
                    >
                      <XCircle size={15} />
                      {t('Rejeitar')}
                    </button>
                  </div>
                ) : (
                  <div className="mt-5 app-empty">{t('Somente professor ou superadmin podem agir sobre esta solicitação.')}</div>
                )}
              </article>
            );
          })}

          {requestItems.length === 0 ? (
            <div className="app-empty">{t('Sem solicitações pendentes no momento.')}</div>
          ) : null}
        </section>
      ) : null}

      {!isStudent && activeTab === 'graduations' ? (
        <section className="app-list">
          {error ? <div className="app-alert app-alert--error mb-4">{error}</div> : null}

          {graduationItems.map((item) => {
            const isProcessing = processingRequestId === item.id;
            const cardUser = usersById.get(item.userId);
            const lastApprovalMs = (cardUser?.lastGradeApprovalAt ?? cardUser?.lastStripeDateOverride)?.toMillis?.() ?? null;
            const lastAttendanceMs = cardUser?.lastAttendanceAt?.toMillis?.() ?? null;
            // Bloqueia nova aprovacao enquanto o aluno nao comparecer a uma aula
            // desde a ultima graduacao.
            const isBlocked = lastApprovalMs !== null
              && !(lastAttendanceMs !== null && lastAttendanceMs > lastApprovalMs);

            return (
            <article key={item.id} className="app-panel app-panel-pad">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-lg font-bold">{item.userDisplayName}</h2>
                    <span className="app-badge app-badge--muted">{t('Atual: {belt}', { belt: beltLabel(item.currentBelt) })}</span>
                    <span className="app-badge app-badge--gold">{item.targetType === 'belt' ? t('Faixa') : t('Grau')}</span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-[color:var(--text-muted)]">{graduationStatusLabel(item)}</p>
                  {item.targetType === 'belt' && item.remainingClasses <= 0 ? (
                    <div className="app-alert app-alert--success mt-3 text-sm">
                      {t('Esse aluno está apto a mudar de faixa')}
                    </div>
                  ) : null}
                  {item.targetType === 'stripe' && item.remainingClasses <= 0 ? (
                    <div className="app-alert app-alert--success mt-3 text-sm">
                      {t('Esse aluno está apto a subir de grau')}
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="app-badge app-badge--muted">{t('Atual: {count} grau(s)', { count: item.currentStripes })}</span>
                    <span className="app-badge app-badge--muted">{t('Próximo passo: {target}', { target: graduationTargetLabel(item) })}</span>
                    <span className="app-badge app-badge--muted">
                      {item.remainingClasses <= 0 ? t('Meta atingida') : t('Restam {count} aula(s)', { count: item.remainingClasses })}
                    </span>
                  </div>
                </div>
                <div className="app-orb">
                  {t('{count} presenças', { count: item.attendanceCount })}
                </div>
              </div>

              {isBlocked ? (
                <div className="app-alert app-alert--warning mt-3 text-sm">
                  {t('Este aluno já foi graduado recentemente. Aguarde ele completar a próxima aula para liberar a próxima graduação.')}
                </div>
              ) : null}

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={isProcessing || isBlocked}
                  onClick={() => void handleApproveGraduation(item)}
                  className="app-button app-button--green app-button--small"
                >
                  <CheckCircle2 size={15} />
                  {isProcessing ? t('Processando...') : t('Aprovar próxima graduação')}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenStudent?.(item.userId)}
                  className="app-button app-button--ghost app-button--small"
                >
                  {t('Abrir aluno')}
                </button>
              </div>
            </article>
            );
          })}

          {graduationItems.length === 0 ? (
            <div className="app-empty">{t('Nenhuma graduação pendente no contexto atual.')}</div>
          ) : null}
        </section>
      ) : null}

      {renderClearModal()}
    </div>
  );
};

export default NotificationsView;
