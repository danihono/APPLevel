import { Timestamp } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { ClassDoc, COLLECTIONS } from '../domain/models';
import { getRequestContext } from '../lib/context';
import { assertCondition } from '../lib/errors';
import { db } from '../lib/firebase';
import { optionalNumber, optionalString, optionalTimestamp, requiredString } from '../lib/payload';
import { buildQrPayload, generateQrToken, hashQrToken } from '../lib/security';

const callableOptions = { region: 'southamerica-east1', invoker: 'public' as const };
const MAX_BATCH_OCCURRENCES = 200;

interface BatchOccurrence {
  scheduledStart: Timestamp;
  scheduledEnd: Timestamp;
}

interface ExistingClassWindow {
  professorId: string;
  tatame: string;
  status: ClassDoc['status'];
  scheduledStart: Timestamp;
  scheduledEnd: Timestamp;
}

async function getClassOrThrow(classId: string): Promise<FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>> {
  const classSnap = await db.collection(COLLECTIONS.classes).doc(classId).get();
  assertCondition(classSnap.exists, 'not-found', 'Aula nao encontrada.');
  return classSnap;
}

function ensureClassManager(
  actor: Awaited<ReturnType<typeof getRequestContext>>,
  classData: ClassDoc,
): void {
  assertCondition(
    classData.academyId === actor.academyId || actor.role === 'superadmin',
    'permission-denied',
    'Aula fora do escopo da academia.',
  );
  assertCondition(
    actor.role === 'professor' || actor.role === 'superadmin' || classData.professorId === actor.uid,
    'permission-denied',
    'Somente professores da unidade ou o superadmin podem gerenciar a aula.',
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

function normalizeTatame(value: string): string {
  return value.trim().toLowerCase();
}

function overlaps(leftStart: Timestamp, leftEnd: Timestamp, rightStart: Timestamp, rightEnd: Timestamp): boolean {
  return leftStart.toMillis() < rightEnd.toMillis() && leftEnd.toMillis() > rightStart.toMillis();
}

function parseOccurrences(data: unknown): BatchOccurrence[] {
  const rawOccurrences = data && typeof data === 'object'
    ? (data as { occurrences?: unknown }).occurrences
    : undefined;
  const occurrenceList = Array.isArray(rawOccurrences) ? rawOccurrences : null;

  assertCondition(!!occurrenceList, 'invalid-argument', 'O campo "occurrences" precisa ser uma lista.');
  assertCondition(occurrenceList.length > 0, 'invalid-argument', 'Informe pelo menos uma ocorrencia.');
  assertCondition(
    occurrenceList.length <= MAX_BATCH_OCCURRENCES,
    'invalid-argument',
    `O lote suporta no maximo ${MAX_BATCH_OCCURRENCES} ocorrencias por envio.`,
  );

  return occurrenceList.map((entry, index) => {
    const scheduledStart = optionalTimestamp(entry, 'scheduledStart');
    const scheduledEnd = optionalTimestamp(entry, 'scheduledEnd');

    assertCondition(
      scheduledStart && scheduledEnd,
      'invalid-argument',
      `A ocorrencia ${index + 1} precisa informar scheduledStart e scheduledEnd.`,
    );
    assertCondition(
      scheduledEnd.toMillis() > scheduledStart.toMillis(),
      'invalid-argument',
      `A ocorrencia ${index + 1} precisa terminar depois do inicio.`,
    );

    return {
      scheduledStart,
      scheduledEnd,
    };
  });
}

function resolveConflictReason(
  professorId: string,
  tatameKey: string,
  existingClass: ExistingClassWindow,
): string {
  const professorConflict = existingClass.professorId === professorId;
  const tatameConflict = normalizeTatame(existingClass.tatame) === tatameKey;

  if (professorConflict && tatameConflict) {
    return 'Conflito de horario com professor e tatame.';
  }

  if (professorConflict) {
    return 'Conflito de horario para o professor.';
  }

  return 'Conflito de horario para o tatame.';
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

  assertCondition(!!academyId, 'invalid-argument', 'academyId e obrigatorio para criar a aula.');
  assertCondition(scheduledStart && scheduledEnd, 'invalid-argument', 'scheduledStart e scheduledEnd sao obrigatorios.');
  assertCondition(
    actor.role === 'superadmin' || academyId === actor.academyId,
    'permission-denied',
    'Voce so pode criar aulas na propria unidade.',
  );

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

export const createClassScheduleBatch = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  const academyId = optionalString(request.data, 'academyId') ?? actor.academyId;
  const title = requiredString(request.data, 'title');
  const tatame = requiredString(request.data, 'tatame');
  const description = optionalString(request.data, 'description');
  const capacity = optionalNumber(request.data, 'capacity');
  const professorId = optionalString(request.data, 'professorId') ?? actor.uid;
  const professorName = optionalString(request.data, 'professorName') ?? actor.user.displayName;
  const checkinWindowMinutes = optionalNumber(request.data, 'checkinWindowMinutes') ?? 15;
  const occurrences = parseOccurrences(request.data).sort((left, right) =>
    left.scheduledStart.toMillis() - right.scheduledStart.toMillis()
    || left.scheduledEnd.toMillis() - right.scheduledEnd.toMillis(),
  );

  assertCondition(!!academyId, 'invalid-argument', 'academyId e obrigatorio para criar aulas em lote.');
  assertCondition(
    actor.role === 'superadmin' || academyId === actor.academyId,
    'permission-denied',
    'Voce so pode criar aulas na propria unidade.',
  );

  const firstStart = occurrences[0].scheduledStart;
  const lastEnd = occurrences[occurrences.length - 1].scheduledEnd;
  const tatameKey = normalizeTatame(tatame);

  const existingSnapshot = await db.collection(COLLECTIONS.classes)
    .where('academyId', '==', academyId)
    .where('scheduledStart', '<=', lastEnd)
    .orderBy('scheduledStart', 'asc')
    .get();

  const existingClasses = existingSnapshot.docs
    .map((doc) => doc.data() as ClassDoc)
    .filter((entry) =>
      entry.status !== 'cancelled'
      && entry.scheduledEnd.toMillis() > firstStart.toMillis(),
    );

  const now = Timestamp.now();
  const batch = db.batch();
  const acceptedOccurrences: BatchOccurrence[] = [];
  const skipped: Array<{ scheduledStart: string; reason: string }> = [];

  for (const occurrence of occurrences) {
    const conflictWithExisting = existingClasses.find((entry) =>
      overlaps(occurrence.scheduledStart, occurrence.scheduledEnd, entry.scheduledStart, entry.scheduledEnd)
      && (entry.professorId === professorId || normalizeTatame(entry.tatame) === tatameKey),
    );

    if (conflictWithExisting) {
      skipped.push({
        scheduledStart: occurrence.scheduledStart.toDate().toISOString(),
        reason: resolveConflictReason(professorId, tatameKey, conflictWithExisting),
      });
      continue;
    }

    const conflictWithAccepted = acceptedOccurrences.find((entry) =>
      overlaps(occurrence.scheduledStart, occurrence.scheduledEnd, entry.scheduledStart, entry.scheduledEnd),
    );

    if (conflictWithAccepted) {
      skipped.push({
        scheduledStart: occurrence.scheduledStart.toDate().toISOString(),
        reason: 'Conflito de horario com professor e tatame.',
      });
      continue;
    }

    const classRef = db.collection(COLLECTIONS.classes).doc();
    const payload: ClassDoc = {
      academyId,
      title,
      description,
      professorId,
      professorName,
      tatame,
      status: 'scheduled',
      scheduledStart: occurrence.scheduledStart,
      scheduledEnd: occurrence.scheduledEnd,
      startedAt: undefined,
      endedAt: undefined,
      capacity,
      currentAttendanceCount: 0,
      checkinWindowMinutes,
      activeQrHash: undefined,
      activeQrExpiresAt: undefined,
      activeQrVersion: undefined,
      createdAt: now,
      updatedAt: now,
    };

    batch.set(classRef, payload);
    acceptedOccurrences.push(occurrence);
  }

  if (acceptedOccurrences.length > 0) {
    await batch.commit();
  }

  return {
    requestedCount: occurrences.length,
    createdCount: acceptedOccurrences.length,
    skippedCount: skipped.length,
    skipped,
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
