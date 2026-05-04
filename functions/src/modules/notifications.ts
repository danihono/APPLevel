import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { COLLECTIONS, NotificationChannel, NotificationDoc, Role, UserDoc } from '../domain/models';
import { getRequestContext } from '../lib/context';
import { assertCondition } from '../lib/errors';
import { db, messaging } from '../lib/firebase';
import {
  optionalRecord,
  optionalString,
  optionalStringArray,
  requiredString,
} from '../lib/payload';

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

export const sendSegmentedNotification = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  const title = requiredString(request.data, 'title');
  const body = requiredString(request.data, 'body');
  const academyId = optionalString(request.data, 'academyId') ?? actor.academyId;
  const channel = (optionalString(request.data, 'channel') as NotificationChannel | undefined) ?? 'academy';
  const targetRole = optionalString(request.data, 'targetRole') as Role | undefined;
  const targetBelt = optionalString(request.data, 'targetBelt');
  const recipientUserIds = optionalStringArray(request.data, 'recipientUserIds');
  const data = optionalRecord(request.data, 'data');

  assertCondition(
    actor.role === 'superadmin' || academyId === actor.academyId,
    'permission-denied',
    'Você só pode notificar usuários da própria academia.',
  );

  let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = db
    .collection(COLLECTIONS.users)
    .where('academyId', '==', academyId)
    .limit(2000);
  if (targetRole) {
    query = query.where('role', '==', targetRole);
  }

  const usersSnapshot = await query.get();
  const recipients = usersSnapshot.docs
    .map((doc) => ({ id: doc.id, data: doc.data() as UserDoc & { fcmTokens?: string[] } }))
    .filter(({ data: user }) => !targetBelt || user.belt === targetBelt)
    .filter(({ id }) => !recipientUserIds || recipientUserIds.includes(id));

  const now = Timestamp.now();
  const tokens: string[] = [];

  type PendingNotification = {
    ref: FirebaseFirestore.DocumentReference;
    doc: NotificationDoc;
    hasToken: boolean;
  };

  const pending: PendingNotification[] = recipients.map((recipient) => {
    const tokenList = recipient.data.fcmTokens ?? [];
    const hasToken = tokenList.length > 0;
    if (hasToken) {
      tokens.push(...tokenList);
    }
    return {
      ref: db.collection(COLLECTIONS.notifications).doc(),
      doc: {
        academyId,
        title,
        body,
        channel,
        kind: 'notice',
        status: hasToken ? 'queued' : 'stored',
        createdBy: actor.uid,
        createdAt: now,
        updatedAt: now,
        recipientUserId: recipient.id,
        targetRole,
        targetBelt,
        data,
      },
      hasToken,
    };
  });

  // Write notifications in chunks of 500 (Firestore batch limit)
  for (const batchChunk of chunk(pending, 500)) {
    const writeBatch = db.batch();
    for (const entry of batchChunk) {
      writeBatch.set(entry.ref, entry.doc);
    }
    await writeBatch.commit();
  }

  let sent = 0;
  let failed = 0;
  if (tokens.length > 0) {
    try {
      for (const tokenChunk of chunk(tokens, 500)) {
        const response = await messaging.sendEachForMulticast({
          tokens: tokenChunk,
          notification: { title, body },
          data,
        });
        sent += response.successCount;
        failed += response.failureCount;
      }
    } catch {
      failed = tokens.length;
    }
  }

  // Update delivery status using the refs we already have — no re-query needed
  const allFailed = tokens.length > 0 && failed === tokens.length;
  const deliveredAt = Timestamp.now();
  const toUpdate = pending.filter((entry) => entry.hasToken);

  for (const updateChunk of chunk(toUpdate, 500)) {
    const updateBatch = db.batch();
    for (const entry of updateChunk) {
      updateBatch.update(entry.ref, {
        status: allFailed ? 'failed' : 'sent',
        deliveredAt,
        updatedAt: deliveredAt,
      });
    }
    await updateBatch.commit();
  }

  return {
    academyId,
    recipients: recipients.length,
    tokens: tokens.length,
    sent,
    failed,
  };
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

  return { deleted: await deleteNotificationSnapshots(snapshot.docs) };
});
