import { Timestamp } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import {
  COLLECTIONS,
  FightVideoSourceKind,
  FightVideoSubmissionDoc,
  NotificationDoc,
  UserDoc,
} from '../domain/models';
import { getRequestContext } from '../lib/context';
import { assertCondition } from '../lib/errors';
import { db } from '../lib/firebase';
import { optionalString, optionalTimestamp, requiredString } from '../lib/payload';

const callableOptions = { region: 'southamerica-east1', invoker: 'public' as const };

function isYouTubeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      return parsed.pathname.replace(/^\/+/, '').split('/')[0].length > 0;
    }

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (parsed.pathname === '/watch') {
        return !!parsed.searchParams.get('v');
      }

      if (parsed.pathname.startsWith('/embed/')) {
        return parsed.pathname.replace('/embed/', '').split('/')[0].length > 0;
      }
    }
  } catch {
    return false;
  }

  return false;
}

function isHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function assertSourceKind(value: string): FightVideoSourceKind {
  assertCondition(
    value === 'youtube' || value === 'external' || value === 'upload',
    'invalid-argument',
    'Tipo de origem do video invalido.',
  );

  return value;
}

function assertVideoSource(params: {
  sourceKind: FightVideoSourceKind;
  sourceUrl: string;
  storagePath?: string;
  mimeType?: string;
}) {
  assertCondition(isHttpUrl(params.sourceUrl), 'invalid-argument', 'Informe uma URL valida para o video.');

  if (params.sourceKind === 'youtube') {
    assertCondition(isYouTubeUrl(params.sourceUrl), 'invalid-argument', 'Informe uma URL valida do YouTube.');
    return;
  }

  if (params.sourceKind === 'external') {
    assertCondition(!isYouTubeUrl(params.sourceUrl), 'invalid-argument', 'Use o tipo YouTube para links do YouTube.');
    return;
  }

  assertCondition(!!params.storagePath, 'invalid-argument', 'Envie o arquivo de video antes de concluir a solicitacao.');
  assertCondition(
    !!params.mimeType && params.mimeType.startsWith('video/'),
    'invalid-argument',
    'O arquivo enviado precisa ser um video valido.',
  );
}

async function listApproversForAcademy(academyId: string): Promise<string[]> {
  const [academyUsers, superadmins] = await Promise.all([
    db.collection(COLLECTIONS.users).where('academyId', '==', academyId).get(),
    db.collection(COLLECTIONS.users).where('role', '==', 'superadmin').get(),
  ]);

  const recipients = new Set<string>();

  for (const doc of academyUsers.docs) {
    const user = doc.data() as UserDoc;
    if (user.role === 'professor' || user.role === 'admin') {
      recipients.add(doc.id);
    }
  }

  for (const doc of superadmins.docs) {
    recipients.add(doc.id);
  }

  return [...recipients];
}

async function createNotifications(params: {
  academyId: string;
  recipients: string[];
  createdBy: string;
  title: string;
  body: string;
  actionRef: string;
  data?: Record<string, string>;
}): Promise<void> {
  if (params.recipients.length === 0) {
    return;
  }

  const now = Timestamp.now();
  const batch = db.batch();

  for (const recipientUserId of [...new Set(params.recipients)]) {
    const notificationRef = db.collection(COLLECTIONS.notifications).doc();
    const notification: NotificationDoc = {
      academyId: params.academyId,
      title: params.title,
      body: params.body,
      channel: 'system',
      kind: 'fight_video_submission',
      status: 'stored',
      createdBy: params.createdBy,
      createdAt: now,
      updatedAt: now,
      recipientUserId,
      actionRef: params.actionRef,
      data: params.data,
    };

    batch.set(notificationRef, notification);
  }

  await batch.commit();
}

export const submitFightVideoSubmission = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'student');
  assertCondition(actor.role === 'student', 'permission-denied', 'Somente alunos podem enviar videos.');

  const title = requiredString(request.data, 'title').trim();
  const opponentName = optionalString(request.data, 'opponentName');
  const occurredAt = optionalTimestamp(request.data, 'occurredAt');
  const sourceKind = assertSourceKind(requiredString(request.data, 'sourceKind').trim());
  const sourceUrl = requiredString(request.data, 'sourceUrl').trim();
  const storagePath = optionalString(request.data, 'storagePath');
  const mimeType = optionalString(request.data, 'mimeType');
  const fileName = optionalString(request.data, 'fileName');

  assertVideoSource({ sourceKind, sourceUrl, storagePath, mimeType });

  const requestRef = db.collection(COLLECTIONS.fightVideoSubmissions).doc();
  const now = Timestamp.now();
  const submission: FightVideoSubmissionDoc = {
    academyId: actor.user.academyId,
    athleteId: actor.uid,
    athleteName: actor.user.displayName,
    title,
    opponentName,
    occurredAt,
    sourceKind,
    sourceUrl,
    storagePath,
    mimeType,
    fileName,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
  };

  await requestRef.set(submission);

  const recipients = await listApproversForAcademy(actor.user.academyId);
  await createNotifications({
    academyId: actor.user.academyId,
    recipients,
    createdBy: actor.uid,
    title: 'Novo video enviado por aluno',
    body: `${actor.user.displayName} enviou um video para revisao da equipe.`,
    actionRef: requestRef.id,
    data: {
      requestId: requestRef.id,
      athleteId: actor.uid,
    },
  });

  return {
    requestId: requestRef.id,
    status: 'pending' as const,
  };
});

export const approveFightVideoSubmission = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  assertCondition(
    actor.role === 'professor' || actor.role === 'superadmin',
    'permission-denied',
    'Somente professor ou superadmin podem aprovar videos.',
  );

  const requestId = requiredString(request.data, 'requestId');
  const requestRef = db.collection(COLLECTIONS.fightVideoSubmissions).doc(requestId);
  const requestSnap = await requestRef.get();

  assertCondition(requestSnap.exists, 'not-found', 'Solicitacao de video nao encontrada.');
  const submission = requestSnap.data() as FightVideoSubmissionDoc;
  assertCondition(submission.status === 'pending', 'failed-precondition', 'Esta solicitacao de video ja foi processada.');
  assertCondition(
    actor.role === 'superadmin' || submission.academyId === actor.academyId,
    'permission-denied',
    'Voce so pode aprovar videos da sua unidade.',
  );

  const now = Timestamp.now();
  await requestRef.update({
    status: 'approved',
    reviewedAt: now,
    reviewedBy: actor.uid,
    reviewedByRole: actor.role,
    updatedAt: now,
  });

  await createNotifications({
    academyId: submission.academyId,
    recipients: [submission.athleteId],
    createdBy: actor.uid,
    title: 'Video aprovado',
    body: `Seu video "${submission.title}" foi aprovado pela equipe.`,
    actionRef: requestId,
    data: {
      requestId,
      athleteId: submission.athleteId,
    },
  });

  return {
    requestId,
    status: 'approved' as const,
  };
});

export const rejectFightVideoSubmission = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  assertCondition(
    actor.role === 'professor' || actor.role === 'superadmin',
    'permission-denied',
    'Somente professor ou superadmin podem rejeitar videos.',
  );

  const requestId = requiredString(request.data, 'requestId');
  const requestRef = db.collection(COLLECTIONS.fightVideoSubmissions).doc(requestId);
  const requestSnap = await requestRef.get();

  assertCondition(requestSnap.exists, 'not-found', 'Solicitacao de video nao encontrada.');
  const submission = requestSnap.data() as FightVideoSubmissionDoc;
  assertCondition(submission.status === 'pending', 'failed-precondition', 'Esta solicitacao de video ja foi processada.');
  assertCondition(
    actor.role === 'superadmin' || submission.academyId === actor.academyId,
    'permission-denied',
    'Voce so pode rejeitar videos da sua unidade.',
  );

  const now = Timestamp.now();
  await requestRef.update({
    status: 'rejected',
    reviewedAt: now,
    reviewedBy: actor.uid,
    reviewedByRole: actor.role,
    updatedAt: now,
  });

  await createNotifications({
    academyId: submission.academyId,
    recipients: [submission.athleteId],
    createdBy: actor.uid,
    title: 'Video rejeitado',
    body: `Seu video "${submission.title}" nao foi aprovado pela equipe.`,
    actionRef: requestId,
    data: {
      requestId,
      athleteId: submission.athleteId,
    },
  });

  return {
    requestId,
    status: 'rejected' as const,
  };
});
