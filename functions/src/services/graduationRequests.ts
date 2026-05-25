import { Timestamp } from 'firebase-admin/firestore';
import {
  AcademyDoc,
  COLLECTIONS,
  GraduationApprovalRequestDoc,
  NotificationDoc,
  UserDoc,
} from '../domain/models';
import { findSingleByFields } from '../lib/context';
import { db } from '../lib/firebase';
import { resolveNextProgressionStep, type ProgressionNextStep } from './progression';

interface SyncGraduationApprovalRequestParams {
  academyId: string;
  userId: string;
  user: UserDoc;
  attendanceCount: number;
  rules?: AcademyDoc['progressionRules'];
}

type PendingRequestRecord = {
  id: string;
  data: GraduationApprovalRequestDoc;
};

function sameStepTarget(
  request: GraduationApprovalRequestDoc,
  step: ProgressionNextStep,
): boolean {
  return request.targetType === step.targetType
    && request.targetBelt === step.targetBelt
    && request.targetStripes === step.targetStripes
    && request.attendanceTarget === step.attendanceTarget;
}

function currentUserMatchesRequestTarget(
  user: UserDoc,
  request: GraduationApprovalRequestDoc,
): boolean {
  return user.belt === request.targetBelt && user.stripes === request.targetStripes;
}

function buildGraduationNotificationTitle(step: ProgressionNextStep): string {
  return step.targetType === 'belt'
    ? 'Avaliacao de faixa pendente'
    : 'Avaliacao de grau pendente';
}

function buildGraduationNotificationBody(params: {
  user: UserDoc;
  step: ProgressionNextStep;
}): string {
  const target = params.step.targetType === 'belt' ? 'faixa' : 'grau';
  if (params.step.remainingClasses === 0) {
    return `${params.user.displayName} completou as aulas e aguarda avaliacao para o proximo ${target}.`;
  }
  return `${params.user.displayName} esta a 1 aula do proximo ${target} e aguarda avaliacao da equipe.`;
}

async function findPendingGraduationRequest(
  academyId: string,
  userId: string,
): Promise<PendingRequestRecord | undefined> {
  return findSingleByFields<GraduationApprovalRequestDoc>(COLLECTIONS.graduationRequests, [
    ['academyId', '==', academyId],
    ['userId', '==', userId],
    ['status', '==', 'pending'],
  ]);
}

async function supersedePendingRequest(
  request: PendingRequestRecord,
  now: Timestamp,
): Promise<void> {
  await db.collection(COLLECTIONS.graduationRequests).doc(request.id).update({
    status: 'superseded',
    updatedAt: now,
  });
}

async function approvePendingRequestFromUserState(params: {
  request: PendingRequestRecord;
  user: UserDoc;
  attendanceCount: number;
  now: Timestamp;
}): Promise<void> {
  await db.collection(COLLECTIONS.graduationRequests).doc(params.request.id).update({
    currentBelt: params.user.belt,
    currentStripes: params.user.stripes,
    attendanceCount: params.attendanceCount,
    remainingClasses: 0,
    status: 'approved',
    approvedAt: params.now,
    updatedAt: params.now,
  });
}

async function ensureGraduationNotification(params: {
  academyId: string;
  requestId: string;
  userId: string;
  user: UserDoc;
  step: ProgressionNextStep;
  now: Timestamp;
  dismissed?: boolean;
}): Promise<void> {
  if (params.step.remainingClasses > 1) {
    return;
  }

  if (params.dismissed) {
    return;
  }

  const existing = await findSingleByFields<NotificationDoc>(COLLECTIONS.notifications, [
    ['academyId', '==', params.academyId],
    ['actionRef', '==', params.requestId],
  ]);
  if (existing) {
    return;
  }

  const notification: NotificationDoc = {
    academyId: params.academyId,
    title: buildGraduationNotificationTitle(params.step),
    body: buildGraduationNotificationBody({
      user: params.user,
      step: params.step,
    }),
    channel: 'system',
    kind: 'graduation',
    status: 'stored',
    createdBy: 'system',
    createdAt: params.now,
    updatedAt: params.now,
    actionRef: params.requestId,
    targetRole: 'professor',
    targetBelt: params.step.targetBelt,
    data: {
      requestId: params.requestId,
      userId: params.userId,
      userDisplayName: params.user.displayName,
      targetType: params.step.targetType,
      targetBelt: params.step.targetBelt,
      targetStripes: String(params.step.targetStripes),
      remainingClasses: String(params.step.remainingClasses),
      attendanceTarget: String(params.step.attendanceTarget),
    },
  };

  await db.collection(COLLECTIONS.notifications).doc().set(notification);
}

async function createPendingGraduationRequest(params: {
  academyId: string;
  userId: string;
  user: UserDoc;
  attendanceCount: number;
  step: ProgressionNextStep;
  now: Timestamp;
}): Promise<void> {
  const requestRef = db.collection(COLLECTIONS.graduationRequests).doc();
  const request: GraduationApprovalRequestDoc = {
    academyId: params.academyId,
    userId: params.userId,
    userDisplayName: params.user.displayName,
    currentBelt: params.user.belt,
    currentStripes: params.user.stripes,
    targetType: params.step.targetType,
    targetBelt: params.step.targetBelt,
    targetStripes: params.step.targetStripes,
    attendanceCount: params.attendanceCount,
    attendanceTarget: params.step.attendanceTarget,
    remainingClasses: params.step.remainingClasses,
    ruleVersion: params.step.ruleVersion,
    status: 'pending',
    createdAt: params.now,
    updatedAt: params.now,
  };

  await requestRef.set(request);

  await ensureGraduationNotification({
    academyId: params.academyId,
    requestId: requestRef.id,
    userId: params.userId,
    user: params.user,
    step: params.step,
    now: params.now,
  });
}

export async function syncGraduationApprovalRequest(
  params: SyncGraduationApprovalRequestParams,
): Promise<void> {
  if (params.user.role !== 'student') {
    return;
  }

  const now = Timestamp.now();
  const nextStep = resolveNextProgressionStep(
    params.user.belt,
    params.user.stripes,
    params.attendanceCount,
    params.rules,
    {
      birthDate: params.user.birthDate,
      kidsCategory: params.user.kidsCategory,
      attendanceCountBonus: params.user.attendanceCountBonus,
      attendanceCountAtBeltStart: params.user.attendanceCountAtBeltStart ?? null,
    },
  );
  let pendingRequest = await findPendingGraduationRequest(params.academyId, params.userId);

  if (pendingRequest && currentUserMatchesRequestTarget(params.user, pendingRequest.data)) {
    await approvePendingRequestFromUserState({
      request: pendingRequest,
      user: params.user,
      attendanceCount: params.attendanceCount,
      now,
    });
    pendingRequest = undefined;
  }

  if (!nextStep || nextStep.remainingClasses > 1) {
    if (pendingRequest) {
      await supersedePendingRequest(pendingRequest, now);
    }
    return;
  }

  if (pendingRequest) {
    if (sameStepTarget(pendingRequest.data, nextStep)) {
      await db.collection(COLLECTIONS.graduationRequests).doc(pendingRequest.id).update({
        userDisplayName: params.user.displayName,
        currentBelt: params.user.belt,
        currentStripes: params.user.stripes,
        attendanceCount: params.attendanceCount,
        remainingClasses: nextStep.remainingClasses,
        ruleVersion: nextStep.ruleVersion,
        updatedAt: now,
      });

      await ensureGraduationNotification({
        academyId: params.academyId,
        requestId: pendingRequest.id,
        userId: params.userId,
        user: params.user,
        step: nextStep,
        now,
        dismissed: Boolean(pendingRequest.data.notificationDismissedAt),
      });
      return;
    }

    await supersedePendingRequest(pendingRequest, now);
  }

  await createPendingGraduationRequest({
    academyId: params.academyId,
    userId: params.userId,
    user: params.user,
    attendanceCount: params.attendanceCount,
    step: nextStep,
    now,
  });
}
