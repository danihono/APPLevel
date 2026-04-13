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

  let query: FirebaseFirestore.Query<FirebaseFirestore.DocumentData> = db.collection(COLLECTIONS.users).where('academyId', '==', academyId);
  if (targetRole) {
    query = query.where('role', '==', targetRole);
  }

  const usersSnapshot = await query.get();
  const recipients = usersSnapshot.docs
    .map((doc) => ({ id: doc.id, data: doc.data() as UserDoc }))
    .filter(({ data: user }) => !targetBelt || user.belt === targetBelt)
    .filter(({ id }) => !recipientUserIds || recipientUserIds.includes(id));

  const now = Timestamp.now();
  const batch = db.batch();
  const tokens: string[] = [];
  const recipientHasToken = new Set<string>();

  for (const recipient of recipients) {
    const tokenList = recipient.data.fcmTokens ?? [];
    if (tokenList.length > 0) {
      recipientHasToken.add(recipient.id);
      tokens.push(...tokenList);
    }

    const notificationRef = db.collection(COLLECTIONS.notifications).doc();
    const notification: NotificationDoc = {
      academyId,
      title,
      body,
      channel,
      kind: 'notice',
      status: tokenList.length > 0 ? 'queued' : 'stored',
      createdBy: actor.uid,
      createdAt: now,
      updatedAt: now,
      recipientUserId: recipient.id,
      targetRole,
      targetBelt,
      data,
    };

    batch.set(notificationRef, notification);
  }

  await batch.commit();

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

  const notificationSnapshot = await db
    .collection(COLLECTIONS.notifications)
    .where('academyId', '==', academyId)
    .where('createdBy', '==', actor.uid)
    .where('createdAt', '==', now)
    .get();

  const updateBatch = db.batch();
  for (const doc of notificationSnapshot.docs) {
    const recipientUserId = doc.get('recipientUserId') as string | undefined;
    const hasToken = recipientUserId ? recipientHasToken.has(recipientUserId) : false;
    updateBatch.update(doc.ref, {
      status: hasToken ? (failed === tokens.length ? 'failed' : 'sent') : 'stored',
      deliveredAt: hasToken ? Timestamp.now() : null,
      updatedAt: Timestamp.now(),
    });
  }
  await updateBatch.commit();

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
