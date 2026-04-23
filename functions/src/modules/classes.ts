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
const MAX_BATCH_WRITE_OPERATIONS = 450;

interface BatchOccurrence {
  scheduledStart: Timestamp;
  scheduledEnd: Timestamp;
}

interface ExistingClassWindow {
  id: string;
  professorId: string;
  tatame: string;
  status: ClassDoc['status'];
  scheduledStart: Timestamp;
  scheduledEnd: Timestamp;
}

interface StoredClassEntry {
  id: string;
  data: ClassDoc;
}

interface ScheduledClassUpdate {
  classId: string;
  scheduledStart: Timestamp;
  scheduledEnd: Timestamp;
}

interface ClassMutationSkippedItem {
  classId: string;
  scheduledStart: string;
  reason: string;
}

type WriteOperation =
  | {
    type: 'update';
    ref: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
    data: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData>;
  }
  | {
    type: 'delete';
    ref: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
  };

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

function parseSeriesMode(data: unknown): 'manual' | 'recurring' {
  const seriesMode = optionalString(data, 'seriesMode') ?? 'manual';

  assertCondition(
    seriesMode === 'manual' || seriesMode === 'recurring',
    'invalid-argument',
    'seriesMode precisa ser "manual" ou "recurring".',
  );

  return seriesMode;
}

function parseDeleteScope(data: unknown): 'single' | 'future' {
  const scope = optionalString(data, 'scope') ?? 'single';

  assertCondition(
    scope === 'single' || scope === 'future',
    'invalid-argument',
    'scope precisa ser "single" ou "future".',
  );

  return scope;
}

function parseUpdateScope(data: unknown): 'future' {
  const scope = optionalString(data, 'scope') ?? 'future';
  assertCondition(scope === 'future', 'invalid-argument', 'scope precisa ser "future".');
  return scope;
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

function toClassWindow(entry: StoredClassEntry): ExistingClassWindow {
  return {
    id: entry.id,
    professorId: entry.data.professorId,
    tatame: entry.data.tatame,
    status: entry.data.status,
    scheduledStart: entry.data.scheduledStart,
    scheduledEnd: entry.data.scheduledEnd,
  };
}

function buildSkippedItem(entry: StoredClassEntry, reason: string): ClassMutationSkippedItem {
  return {
    classId: entry.id,
    scheduledStart: entry.data.scheduledStart.toDate().toISOString(),
    reason,
  };
}

async function commitWriteOperations(operations: WriteOperation[]): Promise<void> {
  for (let index = 0; index < operations.length; index += MAX_BATCH_WRITE_OPERATIONS) {
    const batch = db.batch();

    for (const operation of operations.slice(index, index + MAX_BATCH_WRITE_OPERATIONS)) {
      if (operation.type === 'delete') {
        batch.delete(operation.ref);
      } else {
        batch.update(operation.ref, operation.data);
      }
    }

    await batch.commit();
  }
}

async function syncClassRsvpScheduledStarts(updates: ScheduledClassUpdate[]): Promise<void> {
  if (updates.length === 0) {
    return;
  }

  const rsvpCollection = db.collection(COLLECTIONS.classRsvps);
  const operations: WriteOperation[] = [];

  await Promise.all(updates.map(async (entry) => {
    const snapshot = await rsvpCollection.where('classId', '==', entry.classId).get();
    if (snapshot.empty) {
      return;
    }

    const now = Timestamp.now();
    snapshot.docs.forEach((doc) => {
      operations.push({
        type: 'update',
        ref: doc.ref,
        data: {
          scheduledStart: entry.scheduledStart,
          updatedAt: now,
        },
      });
    });
  }));

  await commitWriteOperations(operations);
}

async function deleteClassesAndRsvps(classIds: string[]): Promise<void> {
  if (classIds.length === 0) {
    return;
  }

  const classCollection = db.collection(COLLECTIONS.classes);
  const rsvpCollection = db.collection(COLLECTIONS.classRsvps);
  const operations: WriteOperation[] = classIds.map((classId) => ({
    type: 'delete',
    ref: classCollection.doc(classId),
  }));

  await Promise.all(classIds.map(async (classId) => {
    const snapshot = await rsvpCollection.where('classId', '==', classId).get();
    snapshot.docs.forEach((doc) => {
      operations.push({
        type: 'delete',
        ref: doc.ref,
      });
    });
  }));

  await commitWriteOperations(operations);
}

async function listConflictingClasses(params: {
  academyId: string;
  firstStart: Timestamp;
  lastEnd: Timestamp;
  ignoredIds?: Set<string>;
}): Promise<ExistingClassWindow[]> {
  const snapshot = await db.collection(COLLECTIONS.classes)
    .where('academyId', '==', params.academyId)
    .where('scheduledStart', '<=', params.lastEnd)
    .orderBy('scheduledStart', 'asc')
    .get();

  return snapshot.docs
    .map((doc) => ({
      id: doc.id,
      ...(doc.data() as ClassDoc),
    }))
    .filter((entry) =>
      !params.ignoredIds?.has(entry.id)
      && entry.status !== 'cancelled'
      && entry.scheduledEnd.toMillis() > params.firstStart.toMillis(),
    )
    .map((entry) => ({
      id: entry.id,
      professorId: entry.professorId,
      tatame: entry.tatame,
      status: entry.status,
      scheduledStart: entry.scheduledStart,
      scheduledEnd: entry.scheduledEnd,
    }));
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

  const previousStart = current?.exists
    ? (current.get('scheduledStart') as FirebaseFirestore.Timestamp | undefined)
    : undefined;

  const payload: ClassDoc = {
    academyId,
    title,
    description,
    professorId,
    professorName,
    tatame,
    recurrenceSeriesId: (current?.get('recurrenceSeriesId') as string | undefined) ?? undefined,
    status: (current?.get('status') as ClassDoc['status'] | undefined) ?? 'scheduled',
    scheduledStart,
    scheduledEnd,
    startedAt: current?.get('startedAt') as FirebaseFirestore.Timestamp | undefined,
    endedAt: current?.get('endedAt') as FirebaseFirestore.Timestamp | undefined,
    capacity,
    currentAttendanceCount: (current?.get('currentAttendanceCount') as number | undefined) ?? 0,
    rsvpCount: current?.get('rsvpCount') as number | undefined,
    checkinWindowMinutes,
    activeQrHash: current?.get('activeQrHash') as string | undefined,
    activeQrExpiresAt: current?.get('activeQrExpiresAt') as FirebaseFirestore.Timestamp | undefined,
    activeQrVersion: current?.get('activeQrVersion') as number | undefined,
    createdAt: (current?.get('createdAt') as FirebaseFirestore.Timestamp | undefined) ?? now,
    updatedAt: now,
  };

  await classRef.set(payload, { merge: true });

  if (current?.exists && previousStart && previousStart.toMillis() !== scheduledStart.toMillis()) {
    await syncClassRsvpScheduledStarts([
      {
        classId: classRef.id,
        scheduledStart,
        scheduledEnd,
      },
    ]);
  }

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
  const seriesMode = parseSeriesMode(request.data);
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
  const recurrenceSeriesId = seriesMode === 'recurring' ? db.collection(COLLECTIONS.classes).doc().id : undefined;
  const existingClasses = await listConflictingClasses({
    academyId,
    firstStart,
    lastEnd,
  });

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
      recurrenceSeriesId,
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

export const updateRecurringClassSeries = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  const classId = requiredString(request.data, 'classId');
  const title = requiredString(request.data, 'title');
  const tatame = requiredString(request.data, 'tatame');
  const description = optionalString(request.data, 'description');
  const professorId = optionalString(request.data, 'professorId') ?? actor.uid;
  const professorName = optionalString(request.data, 'professorName') ?? actor.user.displayName;
  const scheduledStart = optionalTimestamp(request.data, 'scheduledStart');
  const scheduledEnd = optionalTimestamp(request.data, 'scheduledEnd');
  parseUpdateScope(request.data);

  assertCondition(scheduledStart && scheduledEnd, 'invalid-argument', 'scheduledStart e scheduledEnd sao obrigatorios.');
  assertCondition(
    scheduledEnd.toMillis() > scheduledStart.toMillis(),
    'invalid-argument',
    'scheduledEnd precisa terminar depois do inicio.',
  );

  const anchorSnap = await getClassOrThrow(classId);
  const anchorData = anchorSnap.data() as ClassDoc;
  ensureClassManager(actor, anchorData);
  assertCondition(
    !!anchorData.recurrenceSeriesId,
    'failed-precondition',
    'A aula precisa pertencer a uma serie recorrente para editar as proximas.',
  );

  const seriesSnapshot = await db.collection(COLLECTIONS.classes)
    .where('academyId', '==', anchorData.academyId)
    .where('recurrenceSeriesId', '==', anchorData.recurrenceSeriesId)
    .where('scheduledStart', '>=', anchorData.scheduledStart)
    .orderBy('scheduledStart', 'asc')
    .get();

  const seriesEntries = seriesSnapshot.docs.map((doc) => ({
    id: doc.id,
    data: doc.data() as ClassDoc,
  }));
  const scheduledTargets = seriesEntries.filter((entry) => entry.data.status === 'scheduled');
  const skipped: ClassMutationSkippedItem[] = seriesEntries
    .filter((entry) => entry.data.status !== 'scheduled')
    .map((entry) => buildSkippedItem(entry, 'A aula nao esta mais agendada e foi mantida sem alteracao.'));

  if (scheduledTargets.length === 0) {
    return {
      requestedCount: seriesEntries.length,
      updatedCount: 0,
      skippedCount: skipped.length,
      skipped,
    };
  }

  const deltaStartMillis = scheduledStart.toMillis() - anchorData.scheduledStart.toMillis();
  const deltaEndMillis = scheduledEnd.toMillis() - anchorData.scheduledEnd.toMillis();
  const tatameKey = normalizeTatame(tatame);
  const scheduledTargetIds = new Set(scheduledTargets.map((entry) => entry.id));
  const scheduledTargetWindows = scheduledTargets.map((entry) => ({
    entry,
    nextStart: Timestamp.fromMillis(entry.data.scheduledStart.toMillis() + deltaStartMillis),
    nextEnd: Timestamp.fromMillis(entry.data.scheduledEnd.toMillis() + deltaEndMillis),
  }));
  const firstNextStart = scheduledTargetWindows.reduce(
    (current, item) => (item.nextStart.toMillis() < current.toMillis() ? item.nextStart : current),
    scheduledTargetWindows[0].nextStart,
  );
  const lastNextEnd = scheduledTargetWindows.reduce(
    (current, item) => (item.nextEnd.toMillis() > current.toMillis() ? item.nextEnd : current),
    scheduledTargetWindows[0].nextEnd,
  );
  const stationaryWindows = await listConflictingClasses({
    academyId: anchorData.academyId,
    firstStart: firstNextStart,
    lastEnd: lastNextEnd,
    ignoredIds: scheduledTargetIds,
  });
  const acceptedUpdates: ScheduledClassUpdate[] = [];
  const acceptedWindows: ExistingClassWindow[] = [];
  const skippedStationaryWindows: ExistingClassWindow[] = [];
  const orderedTargets = [...scheduledTargetWindows].sort((left, right) => (
    deltaStartMillis >= 0
      ? right.entry.data.scheduledStart.toMillis() - left.entry.data.scheduledStart.toMillis()
      : left.entry.data.scheduledStart.toMillis() - right.entry.data.scheduledStart.toMillis()
  ));

  for (const item of orderedTargets) {
    const conflictPool = [...stationaryWindows, ...acceptedWindows, ...skippedStationaryWindows];
    const conflict = conflictPool.find((entry) =>
      overlaps(item.nextStart, item.nextEnd, entry.scheduledStart, entry.scheduledEnd)
      && (entry.professorId === professorId || normalizeTatame(entry.tatame) === tatameKey),
    );

    if (conflict) {
      skipped.push(buildSkippedItem(item.entry, resolveConflictReason(professorId, tatameKey, conflict)));
      skippedStationaryWindows.push(toClassWindow(item.entry));
      continue;
    }

    acceptedUpdates.push({
      classId: item.entry.id,
      scheduledStart: item.nextStart,
      scheduledEnd: item.nextEnd,
    });
    acceptedWindows.push({
      id: item.entry.id,
      professorId,
      tatame,
      status: 'scheduled',
      scheduledStart: item.nextStart,
      scheduledEnd: item.nextEnd,
    });
  }

  const now = Timestamp.now();
  const operations: WriteOperation[] = acceptedUpdates.map((entry) => ({
    type: 'update',
    ref: db.collection(COLLECTIONS.classes).doc(entry.classId),
    data: {
      title,
      description,
      professorId,
      professorName,
      tatame,
      scheduledStart: entry.scheduledStart,
      scheduledEnd: entry.scheduledEnd,
      updatedAt: now,
    },
  }));

  await commitWriteOperations(operations);
  await syncClassRsvpScheduledStarts(acceptedUpdates);

  return {
    requestedCount: seriesEntries.length,
    updatedCount: acceptedUpdates.length,
    skippedCount: skipped.length,
    skipped,
  };
});

export const deleteClassSchedule = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  const classId = requiredString(request.data, 'classId');
  const scope = parseDeleteScope(request.data);
  const anchorSnap = await getClassOrThrow(classId);
  const anchorData = anchorSnap.data() as ClassDoc;
  ensureClassManager(actor, anchorData);

  if (scope === 'single') {
    assertCondition(
      anchorData.status === 'scheduled',
      'failed-precondition',
      'Somente aulas agendadas podem ser excluidas.',
    );

    await deleteClassesAndRsvps([classId]);

    return {
      requestedCount: 1,
      deletedCount: 1,
      skippedCount: 0,
      skipped: [],
    };
  }

  assertCondition(
    !!anchorData.recurrenceSeriesId,
    'failed-precondition',
    'A aula precisa pertencer a uma serie recorrente para excluir as proximas.',
  );

  const seriesSnapshot = await db.collection(COLLECTIONS.classes)
    .where('academyId', '==', anchorData.academyId)
    .where('recurrenceSeriesId', '==', anchorData.recurrenceSeriesId)
    .where('scheduledStart', '>=', anchorData.scheduledStart)
    .orderBy('scheduledStart', 'asc')
    .get();

  const seriesEntries = seriesSnapshot.docs.map((doc) => ({
    id: doc.id,
    data: doc.data() as ClassDoc,
  }));
  const deletableEntries = seriesEntries.filter((entry) => entry.data.status === 'scheduled');
  const skipped = seriesEntries
    .filter((entry) => entry.data.status !== 'scheduled')
    .map((entry) => buildSkippedItem(entry, 'A aula nao esta mais agendada e foi mantida no historico.'));

  await deleteClassesAndRsvps(deletableEntries.map((entry) => entry.id));

  return {
    requestedCount: seriesEntries.length,
    deletedCount: deletableEntries.length,
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
