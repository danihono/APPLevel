import { Timestamp } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { ClassDoc, COLLECTIONS } from '../domain/models';
import { getRequestContext } from '../lib/context';
import { assertCondition } from '../lib/errors';
import { db } from '../lib/firebase';
import { buildQrPayload, generateQrToken, hashQrToken } from '../lib/security';
import {
  optionalNumber,
  optionalString,
  optionalTimestamp,
  requiredString,
} from '../lib/payload';

const callableOptions = { region: 'southamerica-east1', invoker: 'public' as const };

async function getClassOrThrow(classId: string): Promise<FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>> {
  const classSnap = await db.collection(COLLECTIONS.classes).doc(classId).get();
  assertCondition(classSnap.exists, 'not-found', 'Aula não encontrada.');
  return classSnap;
}

function ensureClassManager(
  actor: Awaited<ReturnType<typeof getRequestContext>>,
  classData: ClassDoc,
): void {
  assertCondition(classData.academyId === actor.academyId || actor.role === 'superadmin', 'permission-denied', 'Aula fora do escopo da academia.');
  assertCondition(
    actor.role === 'admin' || actor.role === 'superadmin' || classData.professorId === actor.uid,
    'permission-denied',
    'Somente o professor responsável ou um admin pode gerenciar a aula.',
  );
}

function buildQrResponse(classId: string, academyId: string, token: string, expiresAt: Timestamp) {
  return {
    classId,
    academyId,
    expiresAt: expiresAt.toDate().toISOString(),
    qrValue: buildQrPayload({
      academyId,
      classId,
      expiresAt: expiresAt.toDate().toISOString(),
      token,
    }),
    qrToken: token,
  };
}

export const upsertClassSchedule = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  const classId = optionalString(request.data, 'classId');
  const academyId = optionalString(request.data, 'academyId') ?? actor.academyId;
  const title = requiredString(request.data, 'title');
  const tatame = requiredString(request.data, 'tatame');
  const scheduledStart = optionalTimestamp(request.data, 'scheduledStart');
  const scheduledEnd = optionalTimestamp(request.data, 'scheduledEnd');
  const description = optionalString(request.data, 'description');
  const capacity = optionalNumber(request.data, 'capacity');
  const professorId = optionalString(request.data, 'professorId') ?? actor.uid;
  const professorName = optionalString(request.data, 'professorName') ?? actor.user.displayName;
  const checkinWindowMinutes = optionalNumber(request.data, 'checkinWindowMinutes') ?? 15;
  const now = Timestamp.now();

  assertCondition(scheduledStart && scheduledEnd, 'invalid-argument', 'scheduledStart e scheduledEnd são obrigatórios.');
  assertCondition(
    actor.role === 'superadmin' || academyId === actor.academyId,
    'permission-denied',
    'Você só pode criar aulas na própria academia.',
  );

  if (actor.role === 'professor') {
    assertCondition(professorId === actor.uid, 'permission-denied', 'Professor só pode se atribuir às próprias aulas.');
  }

  const classRef = classId ? db.collection(COLLECTIONS.classes).doc(classId) : db.collection(COLLECTIONS.classes).doc();
  const current = classId ? await classRef.get() : null;
  if (current?.exists) {
    ensureClassManager(actor, current.data() as ClassDoc);
  }

  const payload: ClassDoc = {
    academyId,
    title,
    description,
    professorId,
    professorName,
    tatame,
    status: (current?.get('status') as ClassDoc['status'] | undefined) ?? 'scheduled',
    scheduledStart,
    scheduledEnd,
    startedAt: current?.get('startedAt') as FirebaseFirestore.Timestamp | undefined,
    endedAt: current?.get('endedAt') as FirebaseFirestore.Timestamp | undefined,
    capacity,
    currentAttendanceCount: (current?.get('currentAttendanceCount') as number | undefined) ?? 0,
    checkinWindowMinutes,
    activeQrHash: current?.get('activeQrHash') as string | undefined,
    activeQrExpiresAt: current?.get('activeQrExpiresAt') as FirebaseFirestore.Timestamp | undefined,
    activeQrVersion: current?.get('activeQrVersion') as number | undefined,
    createdAt: (current?.get('createdAt') as FirebaseFirestore.Timestamp | undefined) ?? now,
    updatedAt: now,
  };

  await classRef.set(payload, { merge: true });
  return {
    classId: classRef.id,
    academyId,
    status: payload.status,
  };
});

export const startClassSession = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  const classId = requiredString(request.data, 'classId');
  const qrDurationMinutes = optionalNumber(request.data, 'qrDurationMinutes') ?? 10;
  const classSnap = await getClassOrThrow(classId);
  const classData = classSnap.data() as ClassDoc;
  ensureClassManager(actor, classData);

  const now = Timestamp.now();
  const token = generateQrToken();
  const expiresAt = Timestamp.fromMillis(now.toMillis() + qrDurationMinutes * 60_000);
  const nextVersion = (classData.activeQrVersion ?? 0) + 1;

  await classSnap.ref.update({
    status: 'active',
    startedAt: classData.startedAt ?? now,
    endedAt: null,
    activeQrHash: hashQrToken(token),
    activeQrExpiresAt: expiresAt,
    activeQrVersion: nextVersion,
    updatedAt: now,
  });

  return buildQrResponse(classId, classData.academyId, token, expiresAt);
});

export const finishClassSession = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  const classId = requiredString(request.data, 'classId');
  const classSnap = await getClassOrThrow(classId);
  const classData = classSnap.data() as ClassDoc;
  ensureClassManager(actor, classData);

  await classSnap.ref.update({
    status: 'finished',
    endedAt: Timestamp.now(),
    activeQrHash: null,
    activeQrExpiresAt: null,
    updatedAt: Timestamp.now(),
  });

  return {
    classId,
    status: 'finished',
  };
});

export const generateClassQrCode = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  const classId = requiredString(request.data, 'classId');
  const qrDurationMinutes = optionalNumber(request.data, 'qrDurationMinutes') ?? 10;
  const classSnap = await getClassOrThrow(classId);
  const classData = classSnap.data() as ClassDoc;
  ensureClassManager(actor, classData);
  assertCondition(classData.status === 'active', 'failed-precondition', 'A aula precisa estar ativa para gerar QR Code.');

  const now = Timestamp.now();
  const token = generateQrToken();
  const expiresAt = Timestamp.fromMillis(now.toMillis() + qrDurationMinutes * 60_000);
  const nextVersion = (classData.activeQrVersion ?? 0) + 1;

  await classSnap.ref.update({
    activeQrHash: hashQrToken(token),
    activeQrExpiresAt: expiresAt,
    activeQrVersion: nextVersion,
    updatedAt: now,
  });

  return buildQrResponse(classId, classData.academyId, token, expiresAt);
});
