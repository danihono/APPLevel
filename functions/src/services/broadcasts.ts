import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import {
  BroadcastAudience,
  BroadcastFilters,
  COLLECTIONS,
  NotificationBroadcastDoc,
  NotificationDoc,
  ROLE_ORDER,
  Role,
  UserDoc,
} from '../domain/models';
import { assertCondition } from '../lib/errors';
import { db } from '../lib/firebase';
import { optionalBoolean, optionalString, optionalStringArray } from '../lib/payload';
import { sendPushToUsers } from './push';

const BATCH_LIMIT = 500;
const MAX_ACADEMY_USERS = 2000;

// A mesma regra roda no app (broadcastFilters.ts na raiz) para a previa
// "vai para N pessoas" — mantenha as duas em sincronia.
export function matchesBroadcastFilters(
  userId: string,
  user: Pick<UserDoc, 'role' | 'belt' | 'kidsCategory' | 'status' | 'isCompetitor'>,
  filters: BroadcastFilters,
): boolean {
  if (filters.userIds && filters.userIds.length > 0) {
    return filters.userIds.includes(userId);
  }

  const role = user.role === 'admin' ? 'professor' : user.role;
  if (filters.roles && filters.roles.length > 0 && !filters.roles.includes(role)) {
    return false;
  }
  if (filters.belts && filters.belts.length > 0 && !filters.belts.includes(user.belt)) {
    return false;
  }
  const isKids = user.kidsCategory === 'level_infantil';
  if (filters.audience === 'kids' && !isKids) {
    return false;
  }
  if (filters.audience === 'adult' && isKids) {
    return false;
  }
  if (filters.onlyActive && user.status === 'suspended') {
    return false;
  }
  if (filters.onlyCompetitors && !user.isCompetitor) {
    return false;
  }
  return true;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

const AUDIENCES: BroadcastAudience[] = ['all', 'adult', 'kids'];

// Le os filtros do payload. Aceita tambem os campos antigos (targetRole,
// targetBelt, recipientUserIds) para nao quebrar quem ainda chama assim.
export function parseBroadcastFilters(data: unknown): BroadcastFilters {
  const raw = data && typeof data === 'object'
    ? (data as { filters?: unknown }).filters
    : undefined;

  const roles = (optionalStringArray(raw, 'roles') ?? [])
    .concat(optionalString(data, 'targetRole') ? [optionalString(data, 'targetRole') as string] : [])
    .filter((role): role is Role => ROLE_ORDER.includes(role as Role));
  const belts = (optionalStringArray(raw, 'belts') ?? [])
    .concat(optionalString(data, 'targetBelt') ? [optionalString(data, 'targetBelt') as string] : []);
  const userIds = optionalStringArray(raw, 'userIds') ?? optionalStringArray(data, 'recipientUserIds') ?? [];
  const audienceValue = optionalString(raw, 'audience') ?? 'all';
  assertCondition(
    AUDIENCES.includes(audienceValue as BroadcastAudience),
    'invalid-argument',
    'Publico do comunicado invalido.',
  );

  return {
    roles: [...new Set(roles)],
    belts: [...new Set(belts)],
    userIds: [...new Set(userIds)],
    audience: audienceValue as BroadcastAudience,
    onlyActive: optionalBoolean(raw, 'onlyActive', true),
    onlyCompetitors: optionalBoolean(raw, 'onlyCompetitors', false),
  };
}

export interface BroadcastDeliveryResult {
  recipients: number;
  tokens: number;
  sent: number;
  failed: number;
}

// Gera a copia do comunicado para cada destinatario (e o que aparece na lista
// do aluno) e dispara o push. O remetente nao recebe o proprio comunicado.
export async function deliverBroadcast(
  broadcastRef: FirebaseFirestore.DocumentReference,
): Promise<BroadcastDeliveryResult> {
  const snapshot = await broadcastRef.get();
  assertCondition(snapshot.exists, 'not-found', 'Comunicado nao encontrado.');
  const broadcast = snapshot.data() as NotificationBroadcastDoc;

  const usersSnapshot = await db
    .collection(COLLECTIONS.users)
    .where('academyId', '==', broadcast.academyId)
    .limit(MAX_ACADEMY_USERS)
    .get();

  const recipients = usersSnapshot.docs
    .filter((doc) => doc.id !== broadcast.createdBy)
    .map((doc) => ({ id: doc.id, data: doc.data() as UserDoc }))
    .filter(({ id, data }) => matchesBroadcastFilters(id, data, broadcast.filters));

  const now = Timestamp.now();
  const tokensByUser = new Map<string, string[]>();

  for (const recipientChunk of chunk(recipients, BATCH_LIMIT)) {
    const batch = db.batch();
    for (const recipient of recipientChunk) {
      const tokens = recipient.data.fcmTokens ?? [];
      if (tokens.length > 0) {
        tokensByUser.set(recipient.id, tokens);
      }
      const notification: NotificationDoc = {
        academyId: broadcast.academyId,
        title: broadcast.title,
        body: broadcast.body,
        channel: broadcast.channel,
        kind: 'notice',
        status: tokens.length > 0 ? 'sent' : 'stored',
        createdBy: broadcast.createdBy,
        createdAt: now,
        updatedAt: now,
        recipientUserId: recipient.id,
        broadcastId: broadcastRef.id,
      };
      batch.set(db.collection(COLLECTIONS.notifications).doc(), notification);
    }
    await batch.commit();
  }

  const push = await sendPushToUsers({
    tokensByUser,
    title: broadcast.title,
    body: broadcast.body,
    data: { broadcastId: broadcastRef.id },
  });

  await broadcastRef.update({
    status: 'sent',
    sentAt: now,
    updatedAt: Timestamp.now(),
    recipientCount: recipients.length,
    tokenCount: push.tokens,
    pushSent: push.sent,
    pushFailed: push.failed,
  });

  logger.info('deliverBroadcast: comunicado enviado', {
    broadcastId: broadcastRef.id,
    academyId: broadcast.academyId,
    recipients: recipients.length,
    ...push,
  });

  return { recipients: recipients.length, ...push };
}

export async function listBroadcastNotificationRefs(broadcastId: string) {
  const snapshot = await db
    .collection(COLLECTIONS.notifications)
    .where('broadcastId', '==', broadcastId)
    .get();
  return snapshot.docs.map((doc) => doc.ref);
}

export async function updateBroadcastCopies(
  broadcastId: string,
  changes: Pick<NotificationDoc, 'title' | 'body'>,
) {
  const refs = await listBroadcastNotificationRefs(broadcastId);
  const now = Timestamp.now();
  for (const refChunk of chunk(refs, BATCH_LIMIT)) {
    const batch = db.batch();
    for (const ref of refChunk) {
      batch.update(ref, { ...changes, updatedAt: now });
    }
    await batch.commit();
  }
  return refs.length;
}

export async function deleteBroadcastCopies(broadcastId: string) {
  const refs = await listBroadcastNotificationRefs(broadcastId);
  for (const refChunk of chunk(refs, BATCH_LIMIT)) {
    const batch = db.batch();
    for (const ref of refChunk) {
      batch.delete(ref);
    }
    await batch.commit();
  }
  return refs.length;
}

export function incrementBroadcastReadCount(broadcastId: string) {
  return db
    .collection(COLLECTIONS.notificationBroadcasts)
    .doc(broadcastId)
    .update({ readCount: FieldValue.increment(1) })
    .catch((error: unknown) => {
      // Comunicado excluido enquanto o aluno lia: nada a contar.
      logger.warn('incrementBroadcastReadCount: nao foi possivel somar a leitura', {
        broadcastId,
        message: error instanceof Error ? error.message : String(error),
      });
    });
}
