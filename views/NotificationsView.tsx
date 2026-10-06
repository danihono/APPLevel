import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  beltLabel,
  getBeltOptions,
  getUserProgressionSummary,
  inferKidsCategoryFromBirthDate,
  inferTrainingTypeFromBirthDate,
  isKidsOnlyBelt,
  kidsCategoryLabel,
} from '../beltCatalog';
import { CheckCircle2, ChevronDown, ChevronUp, Plus, Trash2, X, XCircle } from 'lucide-react';
import { useConfirm } from '../components/ConfirmDialog';
import AppVideoContent from '../components/AppVideoContent';
import BeltImage from '../components/BeltImage';
import PushOptInBanner from '../components/PushOptInBanner';
import BroadcastComposer, { type BroadcastComposerSubmit } from '../components/BroadcastComposer';
import BroadcastList, { NoticeDate, NoticeMonthDivider, groupNoticesByMonth } from '../components/BroadcastList';
import ScreenHeader from '../components/redesign/ScreenHeader';
import { useRedesignShell } from '../components/redesign/ShellContext';
import type { EditBroadcastSubmit } from '../components/EditBroadcastModal';
import type { SendBroadcastResult } from '../services/firebase/functions';
import DateField from '../components/DateField';
import type { FirestoreEntity } from '../services/firebase/data';
import type {
  AcademyRecord,
  AttendanceRequestRecord,
  ClassRecord,
  FightVideoSubmissionRecord,
  GraduationApprovalRequestRecord,
  JoinRequestRecord,
  NotificationBroadcastRecord,
  NotificationRecord,
  ReactivationRequestRecord,
  UserRecord,
} from '../services/firebase/models';
import { isUnreadNotificationForViewer } from '../services/firebase/notifications';
import { UserRole, type KidsCategory } from '../types';
import { t, getLocale } from '../i18n';
import './redesign/notifications.css';

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
  broadcasts?: Array<FirestoreEntity<NotificationBroadcastRecord>>;
  onSendNotification: (payload: BroadcastComposerSubmit & { academyId?: string }) => Promise<SendBroadcastResult>;
  onUpdateBroadcast?: (payload: EditBroadcastSubmit & { broadcastId: string }) => Promise<void>;
  onDeleteBroadcast?: (broadcastId: string) => Promise<void>;
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

// Ilustracao do estado vazio: apito amarelo com contorno preto e cordao tracejado.
const WhistleIllustration: React.FC = () => (
  <svg className="rd-notices__whistle" viewBox="0 0 240 200" aria-hidden="true" focusable="false">
    <ellipse className="rd-notices__whistle-shadow" cx="150" cy="188" rx="66" ry="7" />
    <g className="rd-notices__whistle-cord" fill="none" stroke="currentColor">
      <path
        d="M46 80 C 28 52, 50 30, 92 30 C 140 30, 168 36, 200 22 C 212 17, 220 12, 228 6"
        strokeWidth="9"
        strokeDasharray="13 6"
      />
      <circle cx="48" cy="90" r="9" strokeWidth="5" />
    </g>
    {/* Contorno (desenhado mais grosso por baixo) + preenchimento por cima = contorno da uniao. */}
    <g fill="#16161e" stroke="#16161e" strokeWidth="10" strokeLinejoin="round">
      <rect x="52" y="92" width="122" height="42" rx="8" />
      <circle cx="168" cy="132" r="48" />
    </g>
    <g fill="#f0b429">
      <rect x="52" y="92" width="122" height="42" rx="8" />
      <circle cx="168" cy="132" r="48" />
    </g>
    <rect x="140" y="84" width="28" height="11" rx="3" fill="#16161e" />
    <line x1="66" y1="108" x2="108" y2="108" stroke="#c68f12" strokeWidth="4" strokeLinecap="round" />
    <path d="M150 104 A 36 36 0 0 1 196 112" fill="none" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" opacity="0.85" />
    <circle cx="184" cy="150" r="9" fill="#dda318" />
  </svg>
);

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
  broadcasts = [],
  onSendNotification,
  onUpdateBroadcast,
  onDeleteBroadcast,
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
  const [composerOpen, setComposerOpen] = useState(false);
  const [broadcastChannelTab, setBroadcastChannelTab] = useState<'academy' | 'team'>('academy');
  const [broadcastFeedback, setBroadcastFeedback] = useState('');
  const rebuildQueuedRef = useRef(new Set<string>());
  const shell = useRedesignShell();
  // Superadmin na visao de rede continua com o cabecalho do Layout.
  const ownsHeader = shell.role !== 'superadmin';

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

  const sendBroadcast = (payload: BroadcastComposerSubmit) => onSendNotification({
    ...payload,
    academyId: isSuperAdmin ? (selectedAcademyId || undefined) : academy.id,
  });

  // Lista de enviados filtrada pelo segmento Academia | Equipe (canal do comunicado).
  const visibleBroadcasts = useMemo(
    () => broadcasts.filter((entry) => (
      broadcastChannelTab === 'team' ? entry.channel === 'team' : entry.channel !== 'team'
    )),
    [broadcasts, broadcastChannelTab],
  );

  function renderBroadcastManager(variant: 'desktop' | 'mobile') {
    if (!canBroadcast) {
      return variant === 'mobile'
        ? <p className="rd-notices__note">{t('Seu perfil não pode criar comunicados.')}</p>
        : null;
    }

    return (
      <>
        {broadcastFeedback ? (
          <div className="lv-alert rd-compose__alert--success" role="status">{broadcastFeedback}</div>
        ) : null}
        {onUpdateBroadcast && onDeleteBroadcast ? (
          <>
            <div className="lv-segmented" role="tablist" aria-label={t('Canal')}>
              <button
                type="button"
                role="tab"
                aria-selected={broadcastChannelTab === 'academy'}
                className={broadcastChannelTab === 'academy' ? 'is-active' : ''}
                onClick={() => setBroadcastChannelTab('academy')}
              >
                {t('Academia')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={broadcastChannelTab === 'team'}
                className={broadcastChannelTab === 'team' ? 'is-active' : ''}
                onClick={() => setBroadcastChannelTab('team')}
              >
                {t('Equipe')}
              </button>
            </div>
            <BroadcastList
              broadcasts={visibleBroadcasts}
              onUpdate={onUpdateBroadcast}
              onDelete={onDeleteBroadcast}
            />
          </>
        ) : null}
      </>
    );
  }

  // O compositor fica montado (escondido) para nao perder o texto ao fechar.
  function renderComposer() {
    if (!canBroadcast) {
      return null;
    }

    return (
      <div
        className="lv-fullscreen rd-compose-screen"
        hidden={!composerOpen}
        role="dialog"
        aria-modal="true"
        aria-label={t('Novo aviso')}
      >
        <div className="lv-fullscreen__inner">
          <BroadcastComposer
            className=""
            heading={t('Novo aviso')}
            description={t('Escolha quem recebe, escreva e envie agora ou agende.')}
            academyUsers={academyUsers}
            currentUserId={currentUserId}
            isSuperAdmin={isSuperAdmin}
            academies={academies}
            selectedAcademyId={selectedAcademyId}
            onSelectAcademy={onSelectAcademy}
            onSend={sendBroadcast}
            defaultChannel={broadcastChannelTab}
            onClose={() => setComposerOpen(false)}
            onSent={(summary, channel) => {
              setBroadcastFeedback(summary);
              setBroadcastChannelTab(channel === 'team' ? 'team' : 'academy');
              setActiveTab('communication');
              setComposerOpen(false);
            }}
          />
        </div>
      </div>
    );
  }

  function renderNewNoticeCta() {
    if (!canBroadcast) {
      return null;
    }

    return (
      <div className="lv-sticky-cta">
        <button
          type="button"
          className="lv-btn lv-btn--primary"
          onClick={() => setComposerOpen(true)}
        >
          <Plus size={20} strokeWidth={2.2} />
          {t('Novo aviso')}
        </button>
      </div>
    );
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
      <div className="rd-notices__list-tools">
        <button
          type="button"
          onClick={() => setConfirmClear(true)}
          className="rd-notices__head-action"
        >
          <Trash2 size={16} strokeWidth={2} />
          {t('Limpar tudo')}
        </button>
      </div>
    );
  }

  // "Limpar tudo" no lugar de acao do cabecalho (onde o design tinha "Marcar todas").
  function renderHeaderClear(notifList: Array<FirestoreEntity<NotificationRecord>>) {
    if (notifList.length === 0) return null;
    return (
      <button
        type="button"
        onClick={() => setConfirmClear(true)}
        className="rd-notices__head-action"
        disabled={clearing}
      >
        <Trash2 size={16} strokeWidth={2} />
        {clearing ? t('Limpando...') : t('Limpar tudo')}
      </button>
    );
  }

  function renderClearModal() {
    if (!confirmClear) return null;
    return (
      <div className="lv-backdrop" onClick={() => setConfirmClear(false)}>
        <div
          className="lv-sheet"
          role="dialog"
          aria-modal="true"
          aria-label={t('Limpar notificações')}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="lv-sheet__grip" aria-hidden="true" />
          <div className="lv-sheet__head">
            <h2 className="rd-notices__sheet-title">
              <span className="rd-notices__sheet-icon" aria-hidden="true">
                <Trash2 size={18} strokeWidth={2} />
              </span>
              {t('Limpar notificações')}
            </h2>
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              className="lv-icon-btn"
              aria-label={t('Fechar')}
            >
              <X size={20} strokeWidth={2} />
            </button>
          </div>

          <p className="rd-notices__sheet-copy">
            {t('Todas as notificações serão removidas permanentemente, inclusive as não lidas. Esta ação não pode ser desfeita.')}
          </p>

          {error ? <div className="lv-alert lv-alert--danger" style={{ marginBottom: 16 }}>{error}</div> : null}

          <div className="rd-notices__sheet-actions">
            <button
              type="button"
              onClick={() => setConfirmClear(false)}
              disabled={clearing}
              className="lv-btn lv-btn--neutral"
            >
              {t('Cancelar')}
            </button>
            <button
              type="button"
              disabled={clearing}
              onClick={() => void handleClear()}
              className="lv-btn rd-notices__btn-danger"
            >
              <Trash2 size={16} strokeWidth={2} />
              {clearing ? t('Limpando...') : t('Confirmar')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderEmpty(text: string) {
    return (
      <div className="lv-empty rd-notices__empty">
        <WhistleIllustration />
        <p className="lv-empty__title">{t('Tudo em dia.')}</p>
        <p className="lv-empty__text">{text}</p>
      </div>
    );
  }

  const unreadTitle = (
    <span className="rd-notices__title-row">
      <span>{t('Avisos')}</span>
      <span className="rd-notices__unread">{t('{count} não lidas', { count: unreadCount })}</span>
    </span>
  );

  type NoticeVariant = 'student' | 'staff-mobile' | 'staff-desktop';

  function renderNoticeCard(notification: FirestoreEntity<NotificationRecord>, variant: NoticeVariant) {
    const unread = isUnreadNotificationForViewer(notification, {
      viewerRole: userRole,
      actionState: notificationActionState,
    });
    const className = `rd-notices__card ${unread ? 'is-unread' : ''}`.trim();
    const stateLabel = variant === 'staff-desktop'
      ? notification.status
      : (variant === 'student' && !unread ? t('Lida') : '');

    const content = (
      <>
        <NoticeDate value={notification.createdAt} />
        <div className="rd-notices__main">
          <div className="rd-notices__tags">
            <span className="rd-notices__type">{notificationType(notification)}</span>
          </div>
          <h3 className="rd-notices__title">{notification.title}</h3>
          <p className="rd-notices__body">{notification.body}</p>
          <p className="rd-notices__time">
            {formatStamp(notification.createdAt)}
            {stateLabel ? ` · ${stateLabel}` : ''}
          </p>

          {variant === 'staff-desktop' && (notification.targetRole || notification.targetBelt) ? (
            <div className="rd-notices__tags-row">
              <span className="rd-notices__tag">{t('Canal: {channel}', { channel: notification.channel })}</span>
              {notification.targetRole ? <span className="rd-notices__tag">{t('Perfil: {role}', { role: notification.targetRole })}</span> : null}
              {notification.targetBelt ? <span className="rd-notices__tag">{t('Faixa: {belt}', { belt: beltLabel(notification.targetBelt) })}</span> : null}
            </div>
          ) : null}

          {variant !== 'staff-mobile' && unread ? (
            <div className="rd-notices__actions">
              <button
                type="button"
                onClick={() => void handleMarkRead(notification.id)}
                className="rd-notices__link"
              >
                <CheckCircle2 size={16} strokeWidth={2} />
                {t('Marcar como lida')}
              </button>
            </div>
          ) : null}
        </div>
        {unread ? <span className="rd-notices__dot" role="img" aria-label={t('Novo')} /> : null}
      </>
    );

    // Professor: tocar no card marca como lida (como antes).
    if (variant === 'staff-mobile') {
      return (
        <button
          key={notification.id}
          type="button"
          onClick={() => {
            if (unread) {
              void handleMarkRead(notification.id);
            }
          }}
          className={className}
        >
          {content}
        </button>
      );
    }

    return (
      <article key={notification.id} className={className}>
        {content}
      </article>
    );
  }

  function renderNoticeList(
    list: Array<FirestoreEntity<NotificationRecord>>,
    showAll: boolean,
    onShowAll: () => void,
    variant: NoticeVariant,
    emptyText: string,
  ) {
    const shown = list.slice(0, showAll ? undefined : 5);
    const groups = groupNoticesByMonth(shown, (notification) => notification.createdAt);

    return (
      <>
        {groups.map((group) => (
          <React.Fragment key={group.key}>
            <NoticeMonthDivider label={group.label} />
            {group.items.map((notification) => renderNoticeCard(notification, variant))}
          </React.Fragment>
        ))}

        {list.length > 5 && !showAll ? (
          <button
            type="button"
            onClick={onShowAll}
            className="lv-btn lv-btn--neutral lv-btn--block"
          >
            {t('Ver mais ({count} restantes)', { count: list.length - 5 })}
          </button>
        ) : null}

        {list.length === 0 ? renderEmpty(emptyText) : null}
      </>
    );
  }

  function renderStaffTabs(variant: 'mobile' | 'desktop') {
    const tabs: Array<{ id: StaffTab; label: string; count?: number }> = [
      { id: 'notifications', label: t('Notificações') },
      { id: 'requests', label: t('Solicitações'), count: requestItems.length },
      ...(variant === 'mobile' || canBroadcast ? [{ id: 'communication' as const, label: t('Comunicação') }] : []),
      { id: 'graduations', label: t('Graduações'), count: graduationItems.length },
    ];

    return (
      <div className="lv-chip-row rd-notices__tabs" role="tablist" aria-label={t('Central de avisos')}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`lv-chip-btn ${activeTab === tab.id ? 'is-active' : ''}`}
          >
            {tab.label}
            {tab.count ? <span className="rd-notices__tab-count">{tab.count}</span> : null}
            {tab.id === 'graduations' && beltReadyCount > 0 ? (
              <span className="rd-notices__tab-count rd-notices__tab-count--soft">{t('{count} faixa', { count: beltReadyCount })}</span>
            ) : null}
            {tab.id === 'graduations' && grauReadyCount > 0 ? (
              <span className="rd-notices__tab-count rd-notices__tab-count--soft">{t('{count} grau', { count: grauReadyCount })}</span>
            ) : null}
          </button>
        ))}
      </div>
    );
  }

  function renderJoinEditFields(withBeltAndGrade: boolean, beltOptions: Array<{ value: string; label: string }>) {
    if (!editingDraft) return null;
    return (
      <div className="rd-notices__panel">
        <p className="rd-notices__panel-title">{t('Editar dados do aluno')}</p>
        {editingError ? (
          <div className="lv-alert lv-alert--danger">{editingError}</div>
        ) : null}
        <div className="rd-notices__grid2">
          <label className="lv-field">
            <span>{t('Nome')}</span>
            <input
              className="lv-input"
              value={editingDraft.firstName}
              onChange={(event) => setEditingDraft({ ...editingDraft, firstName: event.target.value })}
            />
          </label>
          <label className="lv-field">
            <span>{t('Sobrenome')}</span>
            <input
              className="lv-input"
              value={editingDraft.lastName}
              onChange={(event) => setEditingDraft({ ...editingDraft, lastName: event.target.value })}
            />
          </label>
          <label className="lv-field">
            <span>CPF</span>
            <input
              className="lv-input"
              value={editingDraft.cpf}
              onChange={(event) => setEditingDraft({ ...editingDraft, cpf: event.target.value })}
            />
          </label>
          <label className="lv-field">
            <span>{t('Telefone')}</span>
            <input
              className="lv-input"
              value={editingDraft.phone}
              onChange={(event) => setEditingDraft({ ...editingDraft, phone: event.target.value })}
            />
          </label>
          <label className="lv-field">
            <span>{t('Nascimento')}</span>
            <DateField
              className="lv-input"
              value={editingDraft.birthDate}
              onChange={(value) => setEditingDraft({ ...editingDraft, birthDate: value })}
            />
          </label>
          <label className="lv-field">
            <span>{t('Competidor')}</span>
            <select
              className="lv-select"
              value={editingDraft.isCompetitor ? 'yes' : 'no'}
              onChange={(event) => setEditingDraft({ ...editingDraft, isCompetitor: event.target.value === 'yes' })}
            >
              <option value="no">{t('Não')}</option>
              <option value="yes">{t('Sim')}</option>
            </select>
          </label>
          {withBeltAndGrade ? (
            <>
              <label className="lv-field">
                <span>{t('Faixa')}</span>
                <select
                  className="lv-select"
                  value={editingDraft.requestedBelt}
                  onChange={(event) => setEditingDraft({ ...editingDraft, requestedBelt: event.target.value })}
                >
                  {beltOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="lv-field">
                <span>{t('Grau')}</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  inputMode="numeric"
                  className="lv-input"
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
            </>
          ) : null}
        </div>
        <div className="rd-notices__actions">
          <button
            type="button"
            disabled={editingBusy}
            onClick={() => void submitEditJoinRequest()}
            className="lv-btn lv-btn--primary lv-btn--sm rd-notices__btn"
          >
            {editingBusy ? t('Salvando...') : t('Salvar alterações')}
          </button>
          <button
            type="button"
            disabled={editingBusy}
            onClick={() => cancelEditJoinRequest()}
            className="lv-btn lv-btn--neutral lv-btn--sm rd-notices__btn"
          >
            {t('Cancelar')}
          </button>
        </div>
      </div>
    );
  }

  function renderTransferPanel(request: FirestoreEntity<JoinRequestRecord>) {
    return (
      <div className="rd-notices__panel">
        <p className="rd-notices__panel-title">{t('Transferir para outra unidade')}</p>
        <p className="rd-notices__panel-copy">
          {t('A solicitação sai desta unidade e vai para a unidade escolhida. Só os professores da nova unidade poderão aprovar.')}
        </p>
        {transferError ? (
          <div className="lv-alert lv-alert--danger">{transferError}</div>
        ) : null}
        <label className="lv-field">
          <span>{t('Unidade de destino')}</span>
          <select
            className="lv-select"
            value={transferTargetAcademyId}
            onChange={(event) => setTransferTargetAcademyId(event.target.value)}
            disabled={transferBusy}
          >
            <option value="">{t('Selecione a unidade')}</option>
            {academies
              .filter((entry) => entry.id !== request.academyId)
              .map((entry) => (
                <option key={entry.id} value={entry.id}>{entry.name}</option>
              ))}
          </select>
        </label>
        <div className="rd-notices__actions">
          <button
            type="button"
            disabled={transferBusy || !transferTargetAcademyId}
            onClick={() => void submitTransferJoinRequest()}
            className="lv-btn lv-btn--primary lv-btn--sm rd-notices__btn"
          >
            {transferBusy ? t('Encaminhando...') : t('Confirmar transferência')}
          </button>
          <button
            type="button"
            disabled={transferBusy}
            onClick={() => cancelTransferJoinRequest()}
            className="lv-btn lv-btn--neutral lv-btn--sm rd-notices__btn"
          >
            {t('Cancelar')}
          </button>
        </div>
      </div>
    );
  }

  function renderGraduationBelt(item: FirestoreEntity<GraduationApprovalRequestRecord>) {
    return (
      <BeltImage
        belt={item.currentBelt}
        stripes={item.currentStripes}
        className="lv-belt-mini"
        alt={beltLabel(item.currentBelt)}
      />
    );
  }

  if (isProfessorMobileView) {
    return (
      <div className="lv-screen rd-notices">
        {ownsHeader ? (
          <ScreenHeader
            eyebrow={shell.unitLabel || academy.name}
            eyebrowIsUnit
            title={unreadTitle}
            actions={activeTab === 'notifications' ? renderHeaderClear(professorNotifications) : null}
          />
        ) : null}

        {renderStaffTabs('mobile')}

        {activeTab === 'notifications' ? (
          <section className="rd-notices__list">
            <PushOptInBanner />
            {error ? <div className="lv-alert lv-alert--danger">{error}</div> : null}

            {!ownsHeader ? renderClearButton(professorNotifications) : null}

            {renderNoticeList(
              professorNotifications,
              showAllStaff,
              () => setShowAllStaff(true),
              'staff-mobile',
              t('Nenhuma notificação encontrada para a unidade.'),
            )}
          </section>
        ) : null}

        {activeTab === 'requests' ? (
          <section className="rd-notices__list">
            {error ? <div className="lv-alert lv-alert--danger">{error}</div> : null}

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
                  <article className="rd-notices__request">
                    <div className="rd-notices__request-row">
                      <span className="lv-avatar lv-avatar--ink" aria-hidden="true">{getInitial(item.title)}</span>

                      <div className="rd-notices__request-copy">
                        <p className="rd-notices__request-name">{item.title}</p>
                        <p className="rd-notices__request-body">{item.body}</p>
                        <p className="rd-notices__request-meta">
                          {isJoinRequest ? formatStamp(item.createdAt) : item.meta}
                        </p>
                      </div>
                    </div>

                    {joinRequest && (joinRequest.transferredFromAcademyName || groupOtherCount > 0) ? (
                      <div className="rd-notices__tags-row">
                        {joinRequest.transferredFromAcademyName ? (
                          <span className="rd-notices__tag rd-notices__tag--gold">
                            {t('Encaminhada de {name}', { name: joinRequest.transferredFromAcademyName })}
                          </span>
                        ) : null}
                        {groupOtherCount > 0 ? (
                          <span className="rd-notices__tag">
                            {t('Aluno também solicitou em {count} outra(s) unidade(s)', { count: groupOtherCount })}
                          </span>
                        ) : null}
                      </div>
                    ) : null}

                    {canActionRequests ? (
                      <div className="rd-notices__actions">
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => void handleApprove(item)}
                          className="lv-btn lv-btn--success lv-btn--sm rd-notices__btn"
                        >
                          <CheckCircle2 size={16} strokeWidth={2} />
                          {isProcessing ? t('Processando...') : t('Aprovar')}
                        </button>
                        {isJoinRequest && onUpdateJoinRequest ? (
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => startEditJoinRequest(item.request)}
                            className="lv-btn lv-btn--neutral lv-btn--sm rd-notices__btn"
                          >
                            {t('Editar')}
                          </button>
                        ) : null}
                        {isJoinRequest && onTransferJoinRequest ? (
                          <button
                            type="button"
                            disabled={isProcessing}
                            onClick={() => startTransferJoinRequest(item.request)}
                            className="lv-btn lv-btn--neutral lv-btn--sm rd-notices__btn"
                          >
                            {t('Transferir')}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={isProcessing}
                          onClick={() => void handleReject(item)}
                          className="lv-btn lv-btn--danger lv-btn--sm rd-notices__btn"
                        >
                          <XCircle size={16} strokeWidth={2} />
                          {t('Recusar')}
                        </button>
                      </div>
                    ) : (
                      <p className="rd-notices__note">{t('Sem permissão para agir sobre esta solicitação.')}</p>
                    )}

                    {isJoinRequest && editingRequestId === item.id && editingDraft
                      ? renderJoinEditFields(true, item.beltOptions)
                      : null}

                    {isJoinRequest && transferringRequestId === item.id
                      ? renderTransferPanel(item.request)
                      : null}
                  </article>
                </React.Fragment>
              );
            })}

            {requestItems.length === 0 ? renderEmpty(t('Sem solicitações pendentes no momento.')) : null}
          </section>
        ) : null}

        {activeTab === 'communication' ? (
          <section className="rd-notices__list">
            {renderBroadcastManager('mobile')}
          </section>
        ) : null}

        {activeTab === 'graduations' ? (
          <section className="rd-notices__list">
            {error ? <div className="lv-alert lv-alert--danger">{error}</div> : null}

            {graduationItems.map((item) => {
              const isProcessing = processingRequestId === item.id;
              const cardUser = usersById.get(item.userId);
              const lastApprovalMs = (cardUser?.lastGradeApprovalAt ?? cardUser?.lastStripeDateOverride)?.toMillis?.() ?? null;
              const lastAttendanceMs = cardUser?.lastAttendanceAt?.toMillis?.() ?? null;
              const isBlocked = lastApprovalMs !== null
                && !(lastAttendanceMs !== null && lastAttendanceMs > lastApprovalMs);

              return (
                <article key={item.id} className="rd-notices__request">
                  <div className="rd-notices__request-row">
                    <span className="lv-avatar lv-avatar--ink" aria-hidden="true">{getInitial(item.userDisplayName)}</span>

                    <div className="rd-notices__request-copy">
                      <p className="rd-notices__request-name">{item.userDisplayName}</p>
                      {renderGraduationBelt(item)}
                      <p className="rd-notices__request-body">
                        {t('Atual: {belt} • {count} grau(s)', { belt: beltLabel(item.currentBelt), count: item.currentStripes })}
                      </p>
                      <p className="rd-notices__request-meta">
                        {t('Próximo passo: {target}', { target: graduationTargetLabel(item) })}
                      </p>
                      <p className="rd-notices__request-meta">{graduationStatusLabel(item)}</p>
                    </div>
                  </div>

                  {item.targetType === 'belt' && item.remainingClasses <= 0 ? (
                    <p className="rd-notices__note rd-notices__note--success">
                      {t('Esse aluno está apto a mudar de faixa')}
                    </p>
                  ) : null}
                  {item.targetType === 'stripe' && item.remainingClasses <= 0 ? (
                    <p className="rd-notices__note rd-notices__note--success">
                      {t('Esse aluno está apto a subir de grau')}
                    </p>
                  ) : null}

                  {isBlocked ? (
                    <p className="rd-notices__note rd-notices__note--warning">
                      {t('Este aluno já foi graduado recentemente. Aguarde ele completar a próxima aula para liberar a próxima graduação.')}
                    </p>
                  ) : null}

                  <div className="rd-notices__actions">
                    <button
                      type="button"
                      disabled={isProcessing || isBlocked}
                      onClick={() => void handleApproveGraduation(item)}
                      className="lv-btn lv-btn--success lv-btn--sm rd-notices__btn"
                    >
                      <CheckCircle2 size={16} strokeWidth={2} />
                      {isProcessing ? t('Processando...') : t('Aprovar')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenStudent?.(item.userId)}
                      className="lv-btn lv-btn--neutral lv-btn--sm rd-notices__btn"
                    >
                      {t('Abrir aluno')}
                    </button>
                  </div>
                </article>
              );
            })}

            {graduationItems.length === 0 ? renderEmpty(t('Nenhuma graduação pendente na unidade.')) : null}
          </section>
        ) : null}

        {activeTab === 'notifications' || activeTab === 'communication' ? renderNewNoticeCta() : null}
        {renderComposer()}
        {renderClearModal()}
      </div>
    );
  }

  return (
    <div className="lv-screen rd-notices">
      {ownsHeader ? (
        <ScreenHeader
          back={isStudent}
          showBell={false}
          eyebrow={isStudent ? academy.name : focusedAcademyName}
          title={unreadTitle}
          subtitle={isStudent ? undefined : t('Comunicados, solicitações e graduações do contexto atual.')}
          actions={isStudent
            ? renderHeaderClear(studentNotifications)
            : (activeTab === 'notifications' ? renderHeaderClear(professorNotifications) : null)}
        />
      ) : (
        <section className="lv-card rd-notices__context">
          <div>
            <p className="rd-notices__context-name">{isStudent ? academy.name : focusedAcademyName}</p>
            <p className="rd-notices__context-copy">
              {isStudent
                ? t('Avisos da academia e da equipe em um fluxo mais direto.')
                : t('Comunicados, solicitações e graduações do contexto atual.')}
            </p>
          </div>
          <span className="rd-notices__count">{t('{count} não lidas', { count: unreadCount })}</span>
        </section>
      )}

      {isStudent ? (
        <div className="lv-segmented lv-segmented--yellow" role="tablist" aria-label={t('Avisos')}>
          <button
            type="button"
            role="tab"
            aria-selected={studentChannelTab === 'academy'}
            onClick={() => setStudentChannelTab('academy')}
            className={studentChannelTab === 'academy' ? 'is-active' : ''}
          >
            {t('Academia')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={studentChannelTab === 'team'}
            onClick={() => setStudentChannelTab('team')}
            className={studentChannelTab === 'team' ? 'is-active' : ''}
          >
            {t('Equipe')}
          </button>
        </div>
      ) : renderStaffTabs('desktop')}

      <PushOptInBanner />

      {isStudent ? (
        <section className="rd-notices__list">
          {error && !confirmClear ? <div className="lv-alert lv-alert--danger">{error}</div> : null}
          {!ownsHeader ? renderClearButton(studentNotifications) : null}

          {renderNoticeList(
            studentNotifications,
            showAllStudent,
            () => setShowAllStudent(true),
            'student',
            t('Nada de novo no mural.'),
          )}
        </section>
      ) : null}

      {!isStudent && activeTab === 'notifications' ? (
        <section className="rd-notices__list">
          {error && !confirmClear ? <div className="lv-alert lv-alert--danger">{error}</div> : null}
          {!ownsHeader ? renderClearButton(professorNotifications) : null}

          {renderNoticeList(
            professorNotifications,
            showAllStaff,
            () => setShowAllStaff(true),
            'staff-desktop',
            t('Nenhuma notificação encontrada para o contexto atual.'),
          )}
        </section>
      ) : null}

      {!isStudent && activeTab === 'communication' ? (
        <section className="rd-notices__list">
          {renderBroadcastManager('desktop')}
        </section>
      ) : null}

      {!isStudent && activeTab === 'requests' ? (
        <section className="rd-notices__list">
          {error ? <div className="lv-alert lv-alert--danger">{error}</div> : null}

          {requestItems.map((item) => {
            const isProcessing = processingRequestId === item.id;

            if (item.kind === 'join_request') {
              const draft = getJoinRequestDraft(item.request);
              const isExpanded = expandedRequestId === item.id;
              const otherCount = item.request.requestGroupId
                ? joinRequests.filter(
                    (entry) => entry.requestGroupId === item.request.requestGroupId && entry.id !== item.id,
                  ).length
                : 0;

              return (
                <article key={`${item.kind}-${item.id}`} className="rd-notices__request">
                  <button
                    type="button"
                    onClick={() => setExpandedRequestId((current) => current === item.id ? null : item.id)}
                    className="rd-notices__toggle"
                    aria-expanded={isExpanded}
                  >
                    <span className="rd-notices__request-row">
                      <span className="lv-avatar lv-avatar--ink" aria-hidden="true">{getInitial(item.title)}</span>
                      <span className="rd-notices__request-copy">
                        <span className="rd-notices__tags">
                          <span className="rd-notices__type">{t('Pedido de acesso')}</span>
                        </span>
                        <span className="rd-notices__request-name">{item.title}</span>
                        <span className="rd-notices__tags-row">
                          <span className="rd-notices__tag">{t('Faixa {belt}', { belt: beltLabel(item.request.requestedBelt) })}</span>
                          <span className="rd-notices__tag">{t('Grau {grade}', { grade: item.request.requestedGrade })}</span>
                        </span>
                        <span className="rd-notices__toggle-hint">
                          {isExpanded ? t('Ocultar detalhes') : t('Toque para ver detalhes')}
                          {isExpanded ? <ChevronUp size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />}
                        </span>
                      </span>
                    </span>
                  </button>

                  {isExpanded ? (
                    <>
                      <div className="rd-notices__tags-row">
                        <span className="rd-notices__tag">{t('Trilha {track}', { track: t(item.trainingType) })}</span>
                        {item.inferredKidsCategory ? (
                          <span className="rd-notices__tag">{kidsCategoryLabel(item.inferredKidsCategory)}</span>
                        ) : null}
                        <span className="rd-notices__tag">{formatStamp(item.createdAt)}</span>
                        {item.request.transferredFromAcademyName ? (
                          <span className="rd-notices__tag rd-notices__tag--gold">
                            {t('Encaminhada de {name}', { name: item.request.transferredFromAcademyName })}
                          </span>
                        ) : null}
                        {otherCount > 0 ? (
                          <span className="rd-notices__tag">
                            {t('Aluno também solicitou em {count} outra(s) unidade(s)', { count: otherCount })}
                          </span>
                        ) : null}
                      </div>

                      <div className="rd-notices__facts">
                        <div className="rd-notices__fact">
                          <span className="rd-notices__fact-label">{t('Nome completo')}</span>
                          <span className="rd-notices__fact-value">{item.request.firstName} {item.request.lastName}</span>
                        </div>
                        <div className="rd-notices__fact">
                          <span className="rd-notices__fact-label">{t('E-mail')}</span>
                          <span className="rd-notices__fact-value">{item.request.email}</span>
                        </div>
                        <div className="rd-notices__fact">
                          <span className="rd-notices__fact-label">CPF</span>
                          <span className="rd-notices__fact-value">{item.request.cpf}</span>
                        </div>
                        <div className="rd-notices__fact">
                          <span className="rd-notices__fact-label">{t('Nascimento')}</span>
                          <span className="rd-notices__fact-value">{formatDateOnly(item.request.birthDate)}</span>
                        </div>
                        <div className="rd-notices__fact">
                          <span className="rd-notices__fact-label">{t('Faixa solicitada')}</span>
                          <span className="rd-notices__fact-value">{beltLabel(item.request.requestedBelt)}</span>
                        </div>
                        <div className="rd-notices__fact">
                          <span className="rd-notices__fact-label">{t('Grau solicitado')}</span>
                          <span className="rd-notices__fact-value">{item.request.requestedGrade}</span>
                        </div>
                        <div className="rd-notices__fact">
                          <span className="rd-notices__fact-label">{t('Competidor')}</span>
                          <span className="rd-notices__fact-value">{item.request.isCompetitor ? t('Sim') : t('Nao')}</span>
                        </div>
                        <div className="rd-notices__fact">
                          <span className="rd-notices__fact-label">{t('Responsável pela aprovação')}</span>
                          <span className="rd-notices__fact-value">{t('Professores da unidade')}</span>
                        </div>
                      </div>

                      {canActionRequests ? (
                        <>
                          <div className="rd-notices__panel">
                            <p className="rd-notices__panel-title">{t('Graduacao de entrada')}</p>
                            <p className="rd-notices__panel-copy">
                              {t('Ajuste faixa e grau antes de aprovar. O aluno será criado com essa graduação.')}
                            </p>

                            <div className="rd-notices__grid2">
                              <label className="lv-field">
                                <span>{t('Faixa')}</span>
                                <select
                                  value={draft.belt}
                                  onChange={(event) => setJoinRequestDraft(item.id, {
                                    ...draft,
                                    belt: event.target.value,
                                  })}
                                  className="lv-select"
                                  disabled={isProcessing}
                                >
                                  {item.beltOptions.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                              </label>

                              <label className="lv-field">
                                <span>{t('Grau')}</span>
                                <input
                                  type="number"
                                  min={0}
                                  inputMode="numeric"
                                  value={draft.grade}
                                  onChange={(event) => setJoinRequestDraft(item.id, {
                                    ...draft,
                                    grade: Math.max(0, Math.floor(Number(event.target.value) || 0)),
                                  })}
                                  className="lv-input"
                                  disabled={isProcessing}
                                />
                              </label>
                            </div>
                          </div>

                          <div className="rd-notices__actions">
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => void handleApprove(item)}
                              className="lv-btn lv-btn--success lv-btn--sm rd-notices__btn"
                            >
                              <CheckCircle2 size={16} strokeWidth={2} />
                              {isProcessing ? t('Processando...') : t('Aprovar aluno')}
                            </button>
                            {onUpdateJoinRequest ? (
                              <button
                                type="button"
                                disabled={isProcessing}
                                onClick={() => startEditJoinRequest(item.request)}
                                className="lv-btn lv-btn--neutral lv-btn--sm rd-notices__btn"
                              >
                                {t('Editar dados')}
                              </button>
                            ) : null}
                            {onTransferJoinRequest ? (
                              <button
                                type="button"
                                disabled={isProcessing}
                                onClick={() => startTransferJoinRequest(item.request)}
                                className="lv-btn lv-btn--neutral lv-btn--sm rd-notices__btn"
                              >
                                {t('Transferir unidade')}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => void handleReject(item)}
                              className="lv-btn lv-btn--danger lv-btn--sm rd-notices__btn"
                            >
                              <XCircle size={16} strokeWidth={2} />
                              {t('Rejeitar')}
                            </button>
                          </div>

                          {editingRequestId === item.id && editingDraft
                            ? renderJoinEditFields(false, item.beltOptions)
                            : null}

                          {transferringRequestId === item.id ? renderTransferPanel(item.request) : null}
                        </>
                      ) : (
                        <p className="rd-notices__note">{t('Somente professores da unidade podem agir sobre esta solicitação.')}</p>
                      )}
                    </>
                  ) : null}
                </article>
              );
            }

            if (item.kind === 'fight_video_submission') {
              return (
                <article key={`${item.kind}-${item.id}`} className="rd-notices__request">
                  <div className="rd-notices__request-row">
                    <span className="lv-avatar lv-avatar--ink" aria-hidden="true">{getInitial(item.title)}</span>
                    <div className="rd-notices__request-copy">
                      <div className="rd-notices__tags">
                        <span className="rd-notices__type">{t('Solicitacao de video')}</span>
                      </div>
                      <p className="rd-notices__request-name">{item.title}</p>
                      <p className="rd-notices__request-body">{item.body}</p>
                      <p className="rd-notices__request-meta">{formatStamp(item.createdAt)}</p>
                    </div>
                  </div>

                  <div className="rd-notices__tags-row">
                    <span className="rd-notices__tag">{fightVideoSourceLabel(item.request.sourceKind)}</span>
                    {item.request.opponentName ? (
                      <span className="rd-notices__tag">vs {item.request.opponentName}</span>
                    ) : null}
                    <span className="rd-notices__tag">
                      {item.request.occurredAt ? item.request.occurredAt.toDate().toLocaleDateString(getLocale()) : t('Data não informada')}
                    </span>
                  </div>

                  <AppVideoContent
                    title={item.request.title}
                    sourceUrl={item.request.sourceUrl}
                    sourceKind={item.request.sourceKind}
                  />

                  {canActionRequests ? (
                    <div className="rd-notices__actions">
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => void handleApprove(item)}
                        className="lv-btn lv-btn--success lv-btn--sm rd-notices__btn"
                      >
                        <CheckCircle2 size={16} strokeWidth={2} />
                        {isProcessing ? t('Processando...') : t('Aprovar video')}
                      </button>
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => void handleReject(item)}
                        className="lv-btn lv-btn--danger lv-btn--sm rd-notices__btn"
                      >
                        <XCircle size={16} strokeWidth={2} />
                        {t('Rejeitar')}
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenStudent?.(item.request.athleteId)}
                        className="lv-btn lv-btn--neutral lv-btn--sm rd-notices__btn"
                      >
                        {t('Abrir aluno')}
                      </button>
                    </div>
                  ) : (
                    <p className="rd-notices__note">{t('Somente professor ou superadmin podem agir sobre esta solicitação.')}</p>
                  )}
                </article>
              );
            }

            return (
              <article key={`${item.kind}-${item.id}`} className="rd-notices__request">
                <div className="rd-notices__request-row">
                  <span className="lv-avatar lv-avatar--ink" aria-hidden="true">{getInitial(item.title)}</span>
                  <div className="rd-notices__request-copy">
                    <div className="rd-notices__tags">
                      <span className="rd-notices__type">
                        {item.kind === 'reactivation_request' ? t('Reativação') : t('Solicitação de presença')}
                      </span>
                    </div>
                    <p className="rd-notices__request-name">{item.title}</p>
                    <p className="rd-notices__request-body">{item.body}</p>
                    <p className="rd-notices__request-meta">{item.meta}</p>
                    <p className="rd-notices__request-meta">{formatStamp(item.createdAt)}</p>
                  </div>
                </div>

                {canActionRequests ? (
                  <div className="rd-notices__actions">
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => void handleApprove(item)}
                      className="lv-btn lv-btn--success lv-btn--sm rd-notices__btn"
                    >
                      <CheckCircle2 size={16} strokeWidth={2} />
                      {isProcessing ? t('Processando...') : t('Aprovar')}
                    </button>
                    <button
                      type="button"
                      disabled={isProcessing}
                      onClick={() => void handleReject(item)}
                      className="lv-btn lv-btn--danger lv-btn--sm rd-notices__btn"
                    >
                      <XCircle size={16} strokeWidth={2} />
                      {t('Rejeitar')}
                    </button>
                  </div>
                ) : (
                  <p className="rd-notices__note">{t('Somente professor ou superadmin podem agir sobre esta solicitação.')}</p>
                )}
              </article>
            );
          })}

          {requestItems.length === 0 ? renderEmpty(t('Sem solicitações pendentes no momento.')) : null}
        </section>
      ) : null}

      {!isStudent && activeTab === 'graduations' ? (
        <section className="rd-notices__list">
          {error ? <div className="lv-alert lv-alert--danger">{error}</div> : null}

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
              <article key={item.id} className="rd-notices__request">
                <div className="rd-notices__request-row">
                  <span className="lv-avatar lv-avatar--ink" aria-hidden="true">{getInitial(item.userDisplayName)}</span>
                  <div className="rd-notices__request-copy">
                    <div className="rd-notices__tags">
                      <span className="rd-notices__tag">{t('Atual: {belt}', { belt: beltLabel(item.currentBelt) })}</span>
                      <span className="rd-notices__tag rd-notices__tag--gold">{item.targetType === 'belt' ? t('Faixa') : t('Grau')}</span>
                    </div>
                    <p className="rd-notices__request-name">{item.userDisplayName}</p>
                    {renderGraduationBelt(item)}
                    <p className="rd-notices__request-body">{graduationStatusLabel(item)}</p>
                  </div>
                  <span className="rd-notices__count rd-notices__request-side">
                    {t('{count} presenças', { count: item.attendanceCount })}
                  </span>
                </div>

                {item.targetType === 'belt' && item.remainingClasses <= 0 ? (
                  <p className="rd-notices__note rd-notices__note--success">
                    {t('Esse aluno está apto a mudar de faixa')}
                  </p>
                ) : null}
                {item.targetType === 'stripe' && item.remainingClasses <= 0 ? (
                  <p className="rd-notices__note rd-notices__note--success">
                    {t('Esse aluno está apto a subir de grau')}
                  </p>
                ) : null}

                <div className="rd-notices__tags-row">
                  <span className="rd-notices__tag">{t('Atual: {count} grau(s)', { count: item.currentStripes })}</span>
                  <span className="rd-notices__tag">{t('Próximo passo: {target}', { target: graduationTargetLabel(item) })}</span>
                  <span className="rd-notices__tag">
                    {item.remainingClasses <= 0 ? t('Meta atingida') : t('Restam {count} aula(s)', { count: item.remainingClasses })}
                  </span>
                </div>

                {isBlocked ? (
                  <p className="rd-notices__note rd-notices__note--warning">
                    {t('Este aluno já foi graduado recentemente. Aguarde ele completar a próxima aula para liberar a próxima graduação.')}
                  </p>
                ) : null}

                <div className="rd-notices__actions">
                  <button
                    type="button"
                    disabled={isProcessing || isBlocked}
                    onClick={() => void handleApproveGraduation(item)}
                    className="lv-btn lv-btn--success lv-btn--sm rd-notices__btn"
                  >
                    <CheckCircle2 size={16} strokeWidth={2} />
                    {isProcessing ? t('Processando...') : t('Aprovar próxima graduação')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onOpenStudent?.(item.userId)}
                    className="lv-btn lv-btn--neutral lv-btn--sm rd-notices__btn"
                  >
                    {t('Abrir aluno')}
                  </button>
                </div>
              </article>
            );
          })}

          {graduationItems.length === 0 ? renderEmpty(t('Nenhuma graduação pendente no contexto atual.')) : null}
        </section>
      ) : null}

      {!isStudent && (activeTab === 'notifications' || activeTab === 'communication') ? renderNewNoticeCta() : null}
      {renderComposer()}
      {renderClearModal()}
    </div>
  );
};

export default NotificationsView;
