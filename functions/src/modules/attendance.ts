import { Timestamp } from 'firebase-admin/firestore';
import { onDocumentCreated, onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { AttendanceDoc, ClassDoc, COLLECTIONS } from '../domain/models';
import { getRequestContext, getUserDoc } from '../lib/context';
import { assertCondition } from '../lib/errors';
import { db } from '../lib/firebase';
import { optionalString, requiredString } from '../lib/payload';
import { hashQrToken } from '../lib/security';
import { bumpClassAttendanceCounter, syncUserDerivedState } from '../services/userState';

export const registerAttendance = onCall({ region: 'southamerica-east1' }, async (request) => {
  const actor = await getRequestContext(request, 'student');
  const classId = requiredString(request.data, 'classId');
  const qrToken = optionalString(request.data, 'qrToken');
  const sourceDevice = optionalString(request.data, 'sourceDevice');
  const targetUserId = optionalString(request.data, 'targetUserId') ?? actor.uid;
  const checkInMethod = targetUserId === actor.uid ? (qrToken ? 'qr' : 'manual') : 'manual';

  assertCondition(
    targetUserId === actor.uid || actor.role === 'professor' || actor.role === 'admin' || actor.role === 'superadmin',
    'permission-denied',
    'Somente professores e admins podem lançar presença para terceiros.',
  );
  assertCondition(
    actor.role !== 'student' || checkInMethod === 'qr',
    'permission-denied',
    'Aluno deve registrar presença com QR Code.',
  );

  const [classSnap, targetUser] = await Promise.all([
    db.collection(COLLECTIONS.classes).doc(classId).get(),
    getUserDoc(targetUserId),
  ]);

  assertCondition(classSnap.exists, 'not-found', 'Aula não encontrada.');
  const classData = classSnap.data() as ClassDoc;

  assertCondition(classData.academyId === actor.academyId || actor.role === 'superadmin', 'permission-denied', 'Aula fora da sua academia.');
  assertCondition(targetUser.academyId === classData.academyId, 'permission-denied', 'Usuário e aula precisam pertencer à mesma academia.');
  assertCondition(classData.status === 'active', 'failed-precondition', 'A aula precisa estar ativa para registrar presença.');

  if (checkInMethod === 'qr') {
    assertCondition(!!qrToken, 'invalid-argument', 'QR Code obrigatório.');
    assertCondition(!!classData.activeQrHash && !!classData.activeQrExpiresAt, 'failed-precondition', 'QR Code indisponível para esta aula.');
    assertCondition(classData.activeQrExpiresAt.toMillis() > Date.now(), 'failed-precondition', 'QR Code expirado.');
    assertCondition(hashQrToken(qrToken) === classData.activeQrHash, 'permission-denied', 'QR Code inválido.');
  }

  const attendanceRef = db.collection(COLLECTIONS.attendances).doc();
  const now = Timestamp.now();

  await db.runTransaction(async (transaction) => {
    const duplicateQuery = db
      .collection(COLLECTIONS.attendances)
      .where('academyId', '==', classData.academyId)
      .where('classId', '==', classId)
      .where('userId', '==', targetUserId)
      .limit(1);

    const duplicateSnapshot = await transaction.get(duplicateQuery);
    assertCondition(duplicateSnapshot.empty, 'already-exists', 'Presença já registrada para este atleta nesta aula.');

    const attendance: AttendanceDoc = {
      academyId: classData.academyId,
      classId,
      userId: targetUserId,
      checkInMethod,
      checkedInAt: now,
      checkedInBy: actor.uid,
      checkedInByRole: actor.role,
      qrVersion: checkInMethod === 'qr' ? classData.activeQrVersion : undefined,
      sourceDevice,
      createdAt: now,
      updatedAt: now,
    };

    transaction.set(attendanceRef, attendance);
    transaction.update(classSnap.ref, {
      currentAttendanceCount: (classData.currentAttendanceCount ?? 0) + 1,
      updatedAt: now,
    });
  });

  return {
    attendanceId: attendanceRef.id,
    classId,
    userId: targetUserId,
    method: checkInMethod,
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
