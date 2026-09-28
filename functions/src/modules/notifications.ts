import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import {
  COLLECTIONS,
  GraduationApprovalRequestDoc,
  NotificationBroadcastDoc,
  NotificationChannel,
  NotificationDoc,
  Role,
} from '../domain/models';
import { getRequestContext, type RequestContext } from '../lib/context';
import { assertCondition } from '../lib/errors';
import { db } from '../lib/firebase';
import {
  optionalString,
  optionalStringArray,
  optionalTimestamp,
  requiredString,
} from '../lib/payload';
import {
  deleteBroadcastCopies,
  deliverBroadcast,
  incrementBroadcastReadCount,
  parseBroadcastFilters,
  updateBroadcastCopies,
} from '../services/broadcasts';
import { sendPushToUsers } from '../services/push';
import { syncAllUsersInAcademy } from '../services/userState';

const callableOptions = { region: 'southamerica-east1', invoker: 'public' as const };

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function canDeleteNotification(
  actor: { uid: string; role: Role; academyId: string },
  notification: NotificationDoc,
) {
  if (actor.role === 'superadmin') {
    return true;
  }

  if (notification.academyId !== actor.academyId) {
    return false;
  }

  if (actor.role === 'student') {
    return notification.recipientUserId === actor.uid;
  }

  return !notification.recipientUserId || notification.recipientUserId === actor.uid;
}

function graduationNotificationTitle(request: GraduationApprovalRequestDoc): string {
  return request.targetType === 'belt'
    ? 'Avaliacao de faixa pendente'
    : 'Avaliacao de grau pendente';
}

function graduationNotificationBody(request: GraduationApprovalRequestDoc): string {
  const target = request.targetType === 'belt' ? 'faixa' : 'grau';
  if (request.remainingClasses <= 0) {
    return `${request.userDisplayName} completou as aulas e aguarda avaliacao para o proximo ${target}.`;
  }

  return `${request.userDisplayName} esta a ${request.remainingClasses} aula(s) do proximo ${target} e aguarda avaliacao da equipe.`;
}

async function deleteNotificationSnapshots(
  snapshots: FirebaseFirestore.DocumentSnapshot[],
) {
  const existingSnapshots = snapshots.filter((doc) => doc.exists);

  for (const batchChunk of chunk(existingSnapshots, 500)) {
    const writeBatch = db.batch();
    for (const doc of batchChunk) {
      writeBatch.delete(doc.ref);
    }
    await writeBatch.commit();
  }

  return existingSnapshots.length;
}

const NOTIFICATION_KIND_TO_REQUEST_COLLECTION: Partial<Record<NotificationDoc['kind'], string>> = {
  graduation: COLLECTIONS.graduationRequests,
  join_request: COLLECTIONS.joinRequests,
  attendance_request: COLLECTIONS.attendanceRequests,
  fight_video_submission: COLLECTIONS.fightVideoSubmissions,
  reactivation_request: COLLECTIONS.reactivationRequests,
};

async function markRequestsAsNotificationDismissed(
  snapshots: FirebaseFirestore.DocumentSnapshot[],
): Promise<void> {
  const now = Timestamp.now();
  const toMark = new Map<string, Set<string>>();

  for (const doc of snapshots) {
    if (!doc.exists) continue;
    const notif = doc.data() as NotificationDoc;
    const targetCollection = NOTIFICATION_KIND_TO_REQUEST_COLLECTION[notif.kind];
    if (!targetCollection || !notif.actionRef) continue;
    if (!toMark.has(targetCollection)) toMark.set(targetCollection, new Set());
    toMark.get(targetCollection)!.add(notif.actionRef);
  }

  for (const [collectionName, idSet] of toMark) {
    for (const idChunk of chunk([...idSet], 300)) {
      const refs = idChunk.map((id) => db.collection(collectionName).doc(id));
      const requestSnapshots = await db.getAll(...refs);
      const existing = requestSnapshots.filter((doc) => doc.exists);
      if (existing.length === 0) continue;

      const writeBatch = db.batch();
      for (const doc of existing) {
        writeBatch.update(doc.ref, { notificationDismissedAt: now, updatedAt: now });
      }
      await writeBatch.commit();
    }
  }
}

async function archiveGraduationRequestSnapshots(
  snapshots: FirebaseFirestore.QueryDocumentSnapshot[],
  actorId: string,
  now: Timestamp,
) {
  for (const batchChunk of chunk(snapshots, 500)) {
    const writeBatch = db.batch();
    for (const doc of batchChunk) {
      writeBatch.update(doc.ref, {
        status: 'archived',
        archivedAt: now,
        archivedBy: actorId,
        updatedAt: now,
      });
    }
    await writeBatch.commit();
  }

  return snapshots.length;
}

async function deleteGraduationNotifications(academyId?: string) {
  const notificationQuery: FirebaseFirestore.Query = academyId
    ? db.collection(COLLECTIONS.notifications).where('academyId', '==', academyId)
    : db.collection(COLLECTIONS.notifications).where('kind', '==', 'graduation');

  const snapshot = await notificationQuery.get();
  const graduationSnapshots = academyId
    ? snapshot.docs.filter((doc) => doc.get('kind') === 'graduation')
    : snapshot.docs;
  return deleteNotificationSnapshots(graduationSnapshots);
}

export const registerDeviceToken = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'student');
  const token = requiredString(request.data, 'token');

  await db.collection(COLLECTIONS.users).doc(actor.uid).update({
    fcmTokens: FieldValue.arrayUnion(token),
    updatedAt: Timestamp.now(),
  });

  return {
    registered: true,
  };
});

// Chamado no logout: o aparelho deixa de receber notificacoes desta conta
// (senao, quem entrar depois no mesmo celular receberia as do usuario anterior).
export const unregisterDeviceToken = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'student');
  const token = requiredString(request.data, 'token');

  await db.collection(COLLECTIONS.users).doc(actor.uid).update({
    fcmTokens: FieldValue.arrayRemove(token),
    updatedAt: Timestamp.now(),
  });

  return {
    unregistered: true,
  };
});

// Push de teste so para os aparelhos da propria conta (botao do Perfil).
// Nao cria nada na lista de avisos.
export const sendTestNotification = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'student');
  const tokens = actor.user.fcmTokens ?? [];

  const result = await sendPushToUsers({
    tokensByUser: new Map([[actor.uid, tokens]]),
    title: 'Teste de notificação do LEVEL',
    body: 'Se você está vendo esta mensagem, as notificações estão funcionando neste aparelho.',
    data: { kind: 'test' },
  });

  return result;
});

// Unidade alvo de um comunicado: professor so na propria; superadmin em qualquer.
function assertCanManageAcademy(actor: RequestContext, academyId: string) {
  assertCondition(
    actor.role === 'superadmin' || academyId === actor.academyId,
    'permission-denied',
    'Você só pode gerenciar comunicados da própria academia.',
  );
}

const MIN_SCHEDULE_LEAD_MS = 60 * 1000;

function parseScheduledAt(data: unknown): Timestamp | undefined {
  const scheduledAt = optionalTimestamp(data, 'scheduledAt');
  if (!scheduledAt) {
    return undefined;
  }
  assertCondition(
    scheduledAt.toMillis() > Date.now() + MIN_SCHEDULE_LEAD_MS,
    'invalid-argument',
    'Escolha um horário de envio no futuro.',
  );
  return scheduledAt;
}

async function getManageableBroadcast(actor: RequestContext, broadcastId: string) {
  const ref = db.collection(COLLECTIONS.notificationBroadcasts).doc(broadcastId);
  const snapshot = await ref.get();
  assertCondition(snapshot.exists, 'not-found', 'Comunicado não encontrado.');
  const broadcast = snapshot.data() as NotificationBroadcastDoc;
  assertCanManageAcademy(actor, broadcast.academyId);
  return { ref, broadcast };
}

export const sendSegmentedNotification = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  const title = requiredString(request.data, 'title').trim();
  const body = requiredString(request.data, 'body').trim();
  const academyId = optionalString(request.data, 'academyId') ?? actor.academyId;
  const channel = (optionalString(request.data, 'channel') as NotificationChannel | undefined) ?? 'academy';
  const filters = parseBroadcastFilters(request.data);
  const scheduledAt = parseScheduledAt(request.data);

  assertCanManageAcademy(actor, academyId);
  assertCondition(['academy', 'team'].includes(channel), 'invalid-argument', 'Canal inválido.');

  const now = Timestamp.now();
  const broadcastRef = db.collection(COLLECTIONS.notificationBroadcasts).doc();
  const broadcast: NotificationBroadcastDoc = {
    academyId,
    title,
    body,
    channel,
    filters,
    status: scheduledAt ? 'scheduled' : 'sending',
    ...(scheduledAt ? { scheduledAt } : {}),
    createdBy: actor.uid,
    createdByName: actor.user.displayName || [actor.user.firstName, actor.user.lastName].filter(Boolean).join(' '),
    createdAt: now,
    updatedAt: now,
    recipientCount: 0,
    tokenCount: 0,
    pushSent: 0,
    pushFailed: 0,
    readCount: 0,
  };
  await broadcastRef.set(broadcast);

  if (scheduledAt) {
    return {
      broadcastId: broadcastRef.id,
      academyId,
      status: 'scheduled',
      scheduledAt: scheduledAt.toMillis(),
      recipients: 0,
      tokens: 0,
      sent: 0,
      failed: 0,
    };
  }

  try {
    const result = await deliverBroadcast(broadcastRef);
    return { broadcastId: broadcastRef.id, academyId, status: 'sent', ...result };
  } catch (error) {
    await broadcastRef.update({
      status: 'failed',
      failureReason: error instanceof Error ? error.message : String(error),
      updatedAt: Timestamp.now(),
    });
    throw error;
  }
});

// Editar so corrige o texto (no comunicado e na lista de cada destinatario).
// O push que ja chegou no celular nao muda nem e reenviado.
export const updateNotificationBroadcast = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  const broadcastId = requiredString(request.data, 'broadcastId');
  const title = requiredString(request.data, 'title').trim();
  const body = requiredString(request.data, 'body').trim();
  const { ref, broadcast } = await getManageableBroadcast(actor, broadcastId);

  const changes: Partial<NotificationBroadcastDoc> = { title, body, updatedAt: Timestamp.now() };
  if (broadcast.status === 'scheduled') {
    const scheduledAt = parseScheduledAt(request.data);
    if (scheduledAt) {
      changes.scheduledAt = scheduledAt;
    }
  }

  await ref.update(changes);
  const updatedCopies = broadcast.status === 'scheduled'
    ? 0
    : await updateBroadcastCopies(broadcastId, { title, body });

  return { broadcastId, updatedCopies };
});

export const deleteNotificationBroadcast = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  const broadcastId = requiredString(request.data, 'broadcastId');
  const { ref, broadcast } = await getManageableBroadcast(actor, broadcastId);
  assertCondition(broadcast.status !== 'sending', 'failed-precondition', 'Este comunicado está sendo enviado agora. Tente de novo em instantes.');

  const deletedCopies = await deleteBroadcastCopies(broadcastId);
  await ref.delete();

  return { broadcastId, deletedCopies };
});

// Envia os comunicados agendados que ja passaram do horario.
export const dispatchScheduledBroadcasts = onSchedule(
  {
    schedule: 'every 5 minutes',
    timeZone: 'America/Sao_Paulo',
    region: 'southamerica-east1',
  },
  async () => {
    const due = await db
      .collection(COLLECTIONS.notificationBroadcasts)
      .where('status', '==', 'scheduled')
      .where('scheduledAt', '<=', Timestamp.now())
      .limit(20)
      .get();

    for (const doc of due.docs) {
      // Reserva o comunicado para nao enviar duas vezes se duas execucoes se cruzarem.
      const claimed = await db.runTransaction(async (transaction) => {
        const fresh = await transaction.get(doc.ref);
        if (!fresh.exists || fresh.get('status') !== 'scheduled') {
          return false;
        }
        transaction.update(doc.ref, { status: 'sending', updatedAt: Timestamp.now() });
        return true;
      });
      if (!claimed) {
        continue;
      }

      try {
        await deliverBroadcast(doc.ref);
      } catch (error) {
        logger.error('dispatchScheduledBroadcasts: falha ao enviar comunicado agendado', {
          broadcastId: doc.id,
          message: error instanceof Error ? error.message : String(error),
        });
        await doc.ref.update({
          status: 'failed',
          failureReason: error instanceof Error ? error.message : String(error),
          updatedAt: Timestamp.now(),
        });
      }
    }
  },
);

export const repairPendingGraduationNotifications = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  const requestedAcademyId = optionalString(request.data, 'academyId');
  const academyId = requestedAcademyId ?? (actor.role === 'superadmin' ? undefined : actor.academyId);

  assertCondition(
    actor.role === 'superadmin' || academyId === actor.academyId,
    'permission-denied',
    'Voce so pode reparar notificacoes da propria academia.',
  );

  let requestQuery: FirebaseFirestore.Query = db
    .collection(COLLECTIONS.graduationRequests)
    .where('status', '==', 'pending');

  if (academyId) {
    requestQuery = requestQuery.where('academyId', '==', academyId);
  }

  let created = 0;
  let skippedExisting = 0;
  let skippedDismissed = 0;
  let syncedUsers = 0;

  if (academyId) {
    syncedUsers = await syncAllUsersInAcademy(academyId);
  }

  const requestSnapshot = await requestQuery.limit(2000).get();
  const now = Timestamp.now();

  for (const requestChunk of chunk(requestSnapshot.docs, 450)) {
    const writeBatch = db.batch();
    let writesInBatch = 0;

    for (const requestDoc of requestChunk) {
      const graduationRequest = requestDoc.data() as GraduationApprovalRequestDoc;

      if (graduationRequest.notificationDismissedAt) {
        skippedDismissed += 1;
        continue;
      }

      const existingNotification = await db
        .collection(COLLECTIONS.notifications)
        .where('academyId', '==', graduationRequest.academyId)
        .where('actionRef', '==', requestDoc.id)
        .limit(1)
        .get();

      if (!existingNotification.empty) {
        skippedExisting += 1;
        continue;
      }

      const notification: NotificationDoc = {
        academyId: graduationRequest.academyId,
        title: graduationNotificationTitle(graduationRequest),
        body: graduationNotificationBody(graduationRequest),
        channel: 'system',
        kind: 'graduation',
        status: 'stored',
        createdBy: actor.uid,
        createdAt: now,
        updatedAt: now,
        actionRef: requestDoc.id,
        targetRole: 'professor',
        targetBelt: graduationRequest.targetBelt,
        data: {
          requestId: requestDoc.id,
          userId: graduationRequest.userId,
          userDisplayName: graduationRequest.userDisplayName,
          targetType: graduationRequest.targetType,
          targetBelt: graduationRequest.targetBelt,
          targetStripes: String(graduationRequest.targetStripes),
          remainingClasses: String(graduationRequest.remainingClasses),
          attendanceTarget: String(graduationRequest.attendanceTarget),
        },
      };

      writeBatch.set(db.collection(COLLECTIONS.notifications).doc(`graduation_${requestDoc.id}`), notification);
      created += 1;
      writesInBatch += 1;
    }

    if (writesInBatch > 0) {
      await writeBatch.commit();
    }
  }

  return {
    academyId: academyId ?? null,
    scanned: requestSnapshot.size,
    syncedUsers,
    created,
    skippedExisting,
    skippedDismissed,
  };
});

export const clearGraduationRequests = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  const requestedAcademyId = optionalString(request.data, 'academyId');
  const academyId = requestedAcademyId ?? (actor.role === 'superadmin' ? undefined : actor.academyId);

  assertCondition(
    actor.role === 'superadmin' || academyId === actor.academyId,
    'permission-denied',
    'Você só pode limpar graduações da própria academia.',
  );

  let requestQuery: FirebaseFirestore.Query = db
    .collection(COLLECTIONS.graduationRequests)
    .where('status', '==', 'pending');
  if (academyId) {
    requestQuery = requestQuery.where('academyId', '==', academyId);
  }

  const snapshot = await requestQuery.get();
  const now = Timestamp.now();
  const deleted = await archiveGraduationRequestSnapshots(snapshot.docs, actor.uid, now);
  await deleteGraduationNotifications(academyId);

  return { deleted };
});

export const markNotificationRead = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'student');
  const notificationId = requiredString(request.data, 'notificationId');
  const notificationRef = db.collection(COLLECTIONS.notifications).doc(notificationId);
  const notificationSnap = await notificationRef.get();

  assertCondition(notificationSnap.exists, 'not-found', 'Notificação não encontrada.');
  const notification = notificationSnap.data() as NotificationDoc;
  assertCondition(
    notification.recipientUserId === actor.uid || actor.role === 'professor' || actor.role === 'superadmin',
    'permission-denied',
    'Você não pode marcar esta notificação.',
  );

  await notificationRef.update({
    status: 'read',
    readAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });

  if (notification.broadcastId && !notification.readAt && notification.recipientUserId === actor.uid) {
    await incrementBroadcastReadCount(notification.broadcastId);
  }

  return {
    notificationId,
    status: 'read',
  };
});

export const clearNotifications = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'student');
  const requestedNotificationIds = optionalStringArray(request.data, 'notificationIds');
  const requestedAcademyId = optionalString(request.data, 'academyId');
  const academyId = requestedAcademyId ?? (actor.role === 'superadmin' ? undefined : actor.academyId);

  assertCondition(
    actor.role === 'superadmin' || academyId === actor.academyId,
    'permission-denied',
    'Você só pode limpar notificações da própria academia.',
  );

  const skipUnread = request.data?.skipUnread === true;

  if (requestedNotificationIds) {
    const notificationIds = [...new Set(requestedNotificationIds.map((id) => id.trim()).filter(Boolean))];

    if (notificationIds.length === 0) {
      return { deleted: 0 };
    }

    const snapshots: FirebaseFirestore.DocumentSnapshot[] = [];
    for (const idChunk of chunk(notificationIds, 300)) {
      const refs = idChunk.map((id) => db.collection(COLLECTIONS.notifications).doc(id));
      snapshots.push(...await db.getAll(...refs));
    }

    const unauthorizedSnapshot = snapshots.find((doc) => {
      if (!doc.exists) {
        return false;
      }

      return !canDeleteNotification(actor, doc.data() as NotificationDoc);
    });

    assertCondition(
      !unauthorizedSnapshot,
      'permission-denied',
      'Voce nao pode limpar uma ou mais notificacoes selecionadas.',
    );

    await markRequestsAsNotificationDismissed(snapshots);
    return { deleted: await deleteNotificationSnapshots(snapshots) };
  }

  let notifQuery: FirebaseFirestore.Query = db.collection(COLLECTIONS.notifications);

  if (academyId) {
    notifQuery = notifQuery.where('academyId', '==', academyId);
  }

  if (actor.role === 'student' || actor.role === 'admin') {
    notifQuery = notifQuery.where('recipientUserId', '==', actor.uid);
  }

  if (skipUnread) {
    notifQuery = notifQuery.where('status', '==', 'read');
  }

  const snapshot = await notifQuery.get();

  await markRequestsAsNotificationDismissed(snapshot.docs);
  return { deleted: await deleteNotificationSnapshots(snapshot.docs) };
});
