import { Timestamp } from 'firebase-admin/firestore';
import { onDocumentCreated, onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { onCall } from 'firebase-functions/v2/https';
import {
  AttendanceDoc,
  AttendanceRequestDoc,
  ClassDoc,
  COLLECTIONS,
  NotificationDoc,
  Role,
} from '../domain/models';
import { getRequestContext, getUserDoc } from '../lib/context';
import { assertCondition } from '../lib/errors';
import { db } from '../lib/firebase';
import { optionalString, requiredString } from '../lib/payload';
import { hashQrToken } from '../lib/security';
import { bumpClassAttendanceCounter, syncUserDerivedState } from '../services/userState';

const callableOptions = { region: 'southamerica-east1', invoker: 'public' as const };

async function ensureNoAttendanceDuplicate(academyId: string, classId: string, userId: string): Promise<void> {
  const duplicateSnapshot = await db
    .collection(COLLECTIONS.attendances)
    .where('academyId', '==', academyId)
    .where('classId', '==', classId)
    .where('userId', '==', userId)
    .limit(1)
    .get();

  assertCondition(duplicateSnapshot.empty, 'already-exists', 'Presenca ja registrada para este atleta nesta aula.');
}

function iniciante_counts_for(belt: string, stripes: number): boolean {
  return belt === 'white' && stripes <= 1;
}

async function createAttendanceRecord(params: {
  classId: string;
  classData: ClassDoc;
  userId: string;
  checkInMethod: AttendanceDoc['checkInMethod'];
  checkedInBy: string;
  checkedInByRole: Role;
  sourceDevice?: string;
  qrVersion?: number;
  countsAsAttendance?: boolean;
}): Promise<string> {
  await ensureNoAttendanceDuplicate(params.classData.academyId, params.classId, params.userId);

  const attendanceRef = db.collection(COLLECTIONS.attendances).doc();
  const classRef = db.collection(COLLECTIONS.classes).doc(params.classId);
  const now = Timestamp.now();
  const attendance: AttendanceDoc = {
    academyId: params.classData.academyId,
    classId: params.classId,
    userId: params.userId,
    checkInMethod: params.checkInMethod,
    checkedInAt: now,
    checkedInBy: params.checkedInBy,
    checkedInByRole: params.checkedInByRole,
    qrVersion: params.qrVersion,
    sourceDevice: params.sourceDevice,
    ...(params.countsAsAttendance === false && { countsAsAttendance: false }),
    createdAt: now,
    updatedAt: now,
  };

  await db.runTransaction(async (transaction) => {
    const duplicateSnapshot = await transaction.get(
      db
        .collection(COLLECTIONS.attendances)
        .where('academyId', '==', params.classData.academyId)
        .where('classId', '==', params.classId)
        .where('userId', '==', params.userId)
        .limit(1),
    );
    assertCondition(duplicateSnapshot.empty, 'already-exists', 'Presenca ja registrada para este atleta nesta aula.');

    transaction.set(attendanceRef, attendance);
    transaction.update(classRef, {
      currentAttendanceCount: (params.classData.currentAttendanceCount ?? 0) + 1,
      updatedAt: now,
    });
  });

  return attendanceRef.id;
}

async function notifyRecipients(params: {
  academyId: string;
  recipientUserIds: string[];
  createdBy: string;
  title: string;
  body: string;
  kind: NotificationDoc['kind'];
  actionRef: string;
  data?: Record<string, string>;
}): Promise<void> {
  if (params.recipientUserIds.length === 0) {
    return;
  }

  const batch = db.batch();
  const now = Timestamp.now();

  for (const recipientUserId of new Set(params.recipientUserIds)) {
    const notificationRef = db.collection(COLLECTIONS.notifications).doc();
    const notification: NotificationDoc = {
      academyId: params.academyId,
      title: params.title,
      body: params.body,
      channel: 'system',
      kind: params.kind,
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

async function listSuperadminIds(): Promise<string[]> {
  const snapshot = await db.collection(COLLECTIONS.users).where('role', '==', 'superadmin').get();
  return snapshot.docs.map((doc) => doc.id);
}

export const registerAttendance = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'student');
  const classId = requiredString(request.data, 'classId');
  const qrToken = optionalString(request.data, 'qrToken');
  const sourceDevice = optionalString(request.data, 'sourceDevice');
  const targetUserId = optionalString(request.data, 'targetUserId') ?? actor.uid;
  const checkInMethod = targetUserId === actor.uid ? (qrToken ? 'qr' : 'manual') : 'manual';

  assertCondition(
    targetUserId === actor.uid || actor.role === 'professor' || actor.role === 'superadmin',
    'permission-denied',
    'Somente professores da unidade ou o superadmin podem lancar presenca para terceiros.',
  );
  assertCondition(
    actor.role !== 'student' || checkInMethod === 'qr',
    'permission-denied',
    'Aluno deve registrar presenca com QR Code.',
  );

  const [classSnap, targetUser] = await Promise.all([
    db.collection(COLLECTIONS.classes).doc(classId).get(),
    getUserDoc(targetUserId),
  ]);

  assertCondition(classSnap.exists, 'not-found', 'Aula nao encontrada.');
  const classData = classSnap.data() as ClassDoc;

  assertCondition(classData.academyId === actor.academyId || actor.role === 'superadmin', 'permission-denied', 'Aula fora da sua academia.');
  assertCondition(targetUser.academyId === classData.academyId, 'permission-denied', 'Usuario e aula precisam pertencer a mesma academia.');
  const isManualByStaff = checkInMethod === 'manual' && (actor.role === 'professor' || actor.role === 'superadmin');
  const isQrCheckin = checkInMethod === 'qr';
  assertCondition(
    (isQrCheckin && (classData.status === 'scheduled' || classData.status === 'active'))
    || (!isQrCheckin && classData.status === 'active')
    || (isManualByStaff && classData.status === 'finished'),
    'failed-precondition',
    'A aula precisa estar ativa para registrar presenca.',
  );

  if (checkInMethod === 'qr') {
    assertCondition(!!qrToken, 'invalid-argument', 'QR Code obrigatorio.');
    assertCondition(!!classData.activeQrHash && !!classData.activeQrExpiresAt, 'failed-precondition', 'QR Code indisponivel para esta aula.');
    assertCondition(classData.activeQrExpiresAt.toMillis() > Date.now(), 'failed-precondition', 'QR Code expirado.');
    assertCondition(hashQrToken(qrToken) === classData.activeQrHash, 'permission-denied', 'QR Code invalido.');
  }

  const isIniciante = classData.description === 'iniciante';
  const countsAsAttendance = isIniciante && !iniciante_counts_for(targetUser.belt, targetUser.stripes ?? 0)
    ? false
    : undefined;

  const attendanceId = await createAttendanceRecord({
    classId,
    classData,
    userId: targetUserId,
    checkInMethod,
    checkedInBy: actor.uid,
    checkedInByRole: actor.role,
    sourceDevice,
    qrVersion: checkInMethod === 'qr' ? classData.activeQrVersion : undefined,
    countsAsAttendance,
  });

  return {
    attendanceId,
    classId,
    userId: targetUserId,
    method: checkInMethod,
  };
});

export const removeAttendance = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  assertCondition(
    actor.role === 'professor' || actor.role === 'superadmin',
    'permission-denied',
    'Somente professores ou superadmin podem remover presenças.',
  );

  const classId = requiredString(request.data, 'classId');
  const targetUserId = requiredString(request.data, 'targetUserId');

  const classSnap = await db.collection(COLLECTIONS.classes).doc(classId).get();
  assertCondition(classSnap.exists, 'not-found', 'Aula não encontrada.');
  const classData = classSnap.data() as ClassDoc;

  assertCondition(
    classData.academyId === actor.academyId || actor.role === 'superadmin',
    'permission-denied',
    'Aula fora da sua academia.',
  );

  const targetUser = await getUserDoc(targetUserId);
  assertCondition(
    targetUser.academyId === classData.academyId,
    'permission-denied',
    'Aluno e aula precisam pertencer à mesma academia.',
  );

  const snapshot = await db
    .collection(COLLECTIONS.attendances)
    .where('academyId', '==', classData.academyId)
    .where('classId', '==', classId)
    .where('userId', '==', targetUserId)
    .limit(1)
    .get();

  assertCondition(!snapshot.empty, 'not-found', 'Presença não encontrada.');

  await snapshot.docs[0].ref.delete();

  return { classId, userId: targetUserId };
});

export const submitAttendanceRequest = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'student');
  assertCondition(actor.role === 'student', 'permission-denied', 'Somente alunos podem solicitar presenca.');

  const classId = requiredString(request.data, 'classId');
  const classSnap = await db.collection(COLLECTIONS.classes).doc(classId).get();
  assertCondition(classSnap.exists, 'not-found', 'Aula nao encontrada.');
  const classData = classSnap.data() as ClassDoc;

  assertCondition(classData.academyId === actor.academyId, 'permission-denied', 'Aula fora da sua academia.');
  assertCondition(classData.status === 'active', 'failed-precondition', 'A aula precisa estar ativa para solicitar presenca.');
  await ensureNoAttendanceDuplicate(classData.academyId, classId, actor.uid);

  const duplicateRequest = await db
    .collection(COLLECTIONS.attendanceRequests)
    .where('userId', '==', actor.uid)
    .limit(10)
    .get();

  assertCondition(
    !duplicateRequest.docs.some((doc) => {
      const item = doc.data() as AttendanceRequestDoc;
      return item.academyId === classData.academyId && item.classId === classId && item.status === 'pending';
    }),
    'already-exists',
    'Ja existe uma solicitacao pendente para esta aula.',
  );

  const requestRef = db.collection(COLLECTIONS.attendanceRequests).doc();
  const now = Timestamp.now();
  const attendanceRequest: AttendanceRequestDoc = {
    academyId: classData.academyId,
    classId,
    classTitle: classData.title,
    userId: actor.uid,
    userDisplayName: actor.user.displayName,
    professorId: classData.professorId,
    professorName: classData.professorName,
    status: 'pending',
    requestedAt: now,
    createdAt: now,
    updatedAt: now,
  };

  await requestRef.set(attendanceRequest);

  const recipients = [classData.professorId, ...(await listSuperadminIds())];
  await notifyRecipients({
    academyId: classData.academyId,
    recipientUserIds: recipients,
    createdBy: actor.uid,
    title: 'Solicitacao de presenca',
    body: `${actor.user.displayName} pediu confirmacao de presenca na aula ${classData.title}.`,
    kind: 'attendance_request',
    actionRef: requestRef.id,
    data: {
      requestId: requestRef.id,
      classId,
      userId: actor.uid,
    },
  });

  return {
    requestId: requestRef.id,
    classId,
    status: 'pending' as const,
  };
});

export const approveAttendanceRequest = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  assertCondition(
    actor.role === 'professor' || actor.role === 'superadmin',
    'permission-denied',
    'Somente professor ou superadmin podem aprovar solicitacoes de presenca.',
  );
  const requestId = requiredString(request.data, 'requestId');
  const requestRef = db.collection(COLLECTIONS.attendanceRequests).doc(requestId);
  const attendanceRequestSnap = await requestRef.get();

  assertCondition(attendanceRequestSnap.exists, 'not-found', 'Solicitacao nao encontrada.');
  const attendanceRequest = attendanceRequestSnap.data() as AttendanceRequestDoc;
  assertCondition(attendanceRequest.status === 'pending', 'failed-precondition', 'Esta solicitacao ja foi processada.');
  assertCondition(
    actor.role === 'superadmin' || attendanceRequest.academyId === actor.academyId,
    'permission-denied',
    'Somente a equipe da mesma academia pode aprovar esta solicitacao.',
  );
  const [classSnap, targetUser] = await Promise.all([
    db.collection(COLLECTIONS.classes).doc(attendanceRequest.classId).get(),
    getUserDoc(attendanceRequest.userId),
  ]);
  assertCondition(classSnap.exists, 'not-found', 'Aula nao encontrada.');
  const classData = classSnap.data() as ClassDoc;

  assertCondition(
    classData.status === 'active' || classData.status === 'finished',
    'failed-precondition',
    'A aula nao permite mais confirmacao de presenca.',
  );
  assertCondition(targetUser.academyId === classData.academyId, 'permission-denied', 'Aluno e aula precisam pertencer a mesma academia.');

  const isIniciante = classData.description === 'iniciante';
  const countsAsAttendance = isIniciante && !iniciante_counts_for(targetUser.belt, targetUser.stripes ?? 0)
    ? false
    : undefined;

  const attendanceId = await createAttendanceRecord({
    classId: attendanceRequest.classId,
    classData,
    userId: attendanceRequest.userId,
    checkInMethod: 'request',
    checkedInBy: actor.uid,
    checkedInByRole: actor.role,
    countsAsAttendance,
  });

  await requestRef.update({
    status: 'approved',
    reviewedAt: Timestamp.now(),
    reviewedBy: actor.uid,
    reviewedByRole: actor.role,
    updatedAt: Timestamp.now(),
  });

  await notifyRecipients({
    academyId: attendanceRequest.academyId,
    recipientUserIds: [attendanceRequest.userId],
    createdBy: actor.uid,
    title: 'Presenca aprovada',
    body: `Sua solicitacao de presenca na aula ${attendanceRequest.classTitle} foi aprovada.`,
    kind: 'attendance_request',
    actionRef: requestId,
    data: {
      requestId,
      attendanceId,
      classId: attendanceRequest.classId,
    },
  });

  return {
    requestId,
    attendanceId,
    status: 'approved' as const,
  };
});

export const rejectAttendanceRequest = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  assertCondition(
    actor.role === 'professor' || actor.role === 'superadmin',
    'permission-denied',
    'Somente professor ou superadmin podem rejeitar solicitacoes de presenca.',
  );
  const requestId = requiredString(request.data, 'requestId');
  const requestRef = db.collection(COLLECTIONS.attendanceRequests).doc(requestId);
  const attendanceRequestSnap = await requestRef.get();

  assertCondition(attendanceRequestSnap.exists, 'not-found', 'Solicitacao nao encontrada.');
  const attendanceRequest = attendanceRequestSnap.data() as AttendanceRequestDoc;
  assertCondition(attendanceRequest.status === 'pending', 'failed-precondition', 'Esta solicitacao ja foi processada.');
  assertCondition(
    actor.role === 'superadmin' || attendanceRequest.academyId === actor.academyId,
    'permission-denied',
    'Somente a equipe da mesma academia pode rejeitar esta solicitacao.',
  );
  await requestRef.update({
    status: 'rejected',
    reviewedAt: Timestamp.now(),
    reviewedBy: actor.uid,
    reviewedByRole: actor.role,
    updatedAt: Timestamp.now(),
  });

  await notifyRecipients({
    academyId: attendanceRequest.academyId,
    recipientUserIds: [attendanceRequest.userId],
    createdBy: actor.uid,
    title: 'Presenca rejeitada',
    body: `Sua solicitacao de presenca na aula ${attendanceRequest.classTitle} foi rejeitada.`,
    kind: 'attendance_request',
    actionRef: requestId,
    data: {
      requestId,
      classId: attendanceRequest.classId,
    },
  });

  return {
    requestId,
    status: 'rejected' as const,
  };
});

export const onAttendanceCreated = onDocumentCreated(
  {
    document: 'attendances/{attendanceId}',
    region: 'southamerica-east1',
  },
  async (event) => {
    const attendance = event.data?.data() as AttendanceDoc | undefined;
    if (!attendance) {
      return;
    }

    await syncUserDerivedState(attendance.userId, attendance.academyId);
  },
);

export const onAttendanceDeleted = onDocumentDeleted(
  {
    document: 'attendances/{attendanceId}',
    region: 'southamerica-east1',
  },
  async (event) => {
    const attendance = event.data?.data() as AttendanceDoc | undefined;
    if (!attendance) {
      return;
    }

    await bumpClassAttendanceCounter(attendance.classId, -1);
    await syncUserDerivedState(attendance.userId, attendance.academyId);
  },
);
