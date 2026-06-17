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
  lastAttendanceAt?: Timestamp | null;
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

// Gate temporal: so ha o que graduar se o aluno treinou ao menos uma aula desde a ultima graduacao.
// Evita pendencia fantasma recriada por syncs nao relacionados (presenca de outro aluno via recalc
// em massa, ranking, missoes) logo apos uma promocao. `lastAttendanceAt` explicito permite ao
// proprio check-in que dispara o sync ja contar (o snapshot do user ainda traz o valor antigo).
function hasTrainedSinceLastGraduation(user: UserDoc, lastAttendanceAt?: Timestamp | null): boolean {
  const lastApprovalMs = (user.lastGradeApprovalAt ?? user.lastStripeDateOverride)?.toMillis?.() ?? null;
  const lastAttendanceMs = (lastAttendanceAt ?? user.lastAttendanceAt)?.toMillis?.() ?? null;
  return lastApprovalMs === null || (lastAttendanceMs !== null && lastAttendanceMs > lastApprovalMs);
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

// Mantem a pendencia `pending` mais recente e supersede as demais. Resiliente a corridas: duas
// pendencias simultaneas nao quebram mais todo o sync do aluno (antes findSingleByFields lancava
// failed-precondition com >1 resultado, travando presenca/ranking/missoes ate intervencao manual).
async function findAndDedupePendingRequests(
  academyId: string,
  userId: string,
  now: Timestamp,
): Promise<PendingRequestRecord | undefined> {
  const snapshot = await db
    .collection(COLLECTIONS.graduationRequests)
    .where('academyId', '==', academyId)
    .where('userId', '==', userId)
    .where('status', '==', 'pending')
    .get();
  if (snapshot.empty) {
    return undefined;
  }

  const records: PendingRequestRecord[] = snapshot.docs
    .map((doc) => ({ id: doc.id, data: doc.data() as GraduationApprovalRequestDoc }))
    .sort((a, b) => (b.data.createdAt?.toMillis?.() ?? 0) - (a.data.createdAt?.toMillis?.() ?? 0));

  const [keep, ...stale] = records;
  if (stale.length > 0) {
    const batch = db.batch();
    for (const record of stale) {
      batch.update(db.collection(COLLECTIONS.graduationRequests).doc(record.id), {
        status: 'superseded',
        updatedAt: now,
      });
    }
    await batch.commit();
  }
  return keep;
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
  let pendingRequest = await findAndDedupePendingRequests(params.academyId, params.userId, now);

  if (pendingRequest && currentUserMatchesRequestTarget(params.user, pendingRequest.data)) {
    // O aluno ja esta no alvo (promovido por outra via — ex.: graduacao manual). A pendencia foi
    // resolvida fora desta maquina: marcamos como `superseded`, nao `approved`. Marcar como aprovada
    // aqui furaria o gate temporal (aprovaria sem aula nova) e contaminaria relatorios de aprovacao.
    await supersedePendingRequest(pendingRequest, now);
    pendingRequest = undefined;
  }

  const trainedSinceLastGraduation = hasTrainedSinceLastGraduation(params.user, params.lastAttendanceAt);

  if (!nextStep || nextStep.remainingClasses > 1 || !trainedSinceLastGraduation) {
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
