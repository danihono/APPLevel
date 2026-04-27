import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { ClassDoc, ClassRsvpDoc, COLLECTIONS } from '../domain/models';
import { getRequestContext } from '../lib/context';
import { assertCondition } from '../lib/errors';
import { db } from '../lib/firebase';
import { requiredString } from '../lib/payload';

const callableOptions = { region: 'southamerica-east1', invoker: 'public' as const };

export const toggleClassRsvp = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'student');
  assertCondition(actor.role === 'student', 'permission-denied', 'Somente alunos podem confirmar ida antecipada.');

  const classId = requiredString(request.data, 'classId');
  const classSnap = await db.collection(COLLECTIONS.classes).doc(classId).get();
  assertCondition(classSnap.exists, 'not-found', 'Aula nao encontrada.');
  const classData = classSnap.data() as ClassDoc;

  assertCondition(classData.academyId === actor.academyId, 'permission-denied', 'Aula fora da sua academia.');
  assertCondition(classData.status === 'scheduled', 'failed-precondition', 'Confirmacao antecipada so e permitida para aulas agendadas.');

  const rsvpId = `${classId}_${actor.uid}`;
  const rsvpRef = db.collection(COLLECTIONS.classRsvps).doc(rsvpId);
  const classRef = db.collection(COLLECTIONS.classes).doc(classId);

  const result = await db.runTransaction(async (transaction) => {
    const rsvpSnap = await transaction.get(rsvpRef);

    if (rsvpSnap.exists) {
      transaction.delete(rsvpRef);
      transaction.update(classRef, {
        rsvpCount: FieldValue.increment(-1),
        updatedAt: Timestamp.now(),
      });
      return { rsvped: false };
    }

    const now = Timestamp.now();
    const rsvp: ClassRsvpDoc = {
      academyId: classData.academyId,
      classId,
      userId: actor.uid,
      userDisplayName: actor.user.displayName,
      scheduledStart: classData.scheduledStart,
      createdAt: now,
      updatedAt: now,
    };
    transaction.set(rsvpRef, rsvp);
    transaction.update(classRef, {
      rsvpCount: FieldValue.increment(1),
      updatedAt: Timestamp.now(),
    });
    return { rsvped: true };
  });

  const updatedClassSnap = await classRef.get();
  const updatedClass = updatedClassSnap.data() as ClassDoc;

  return {
    rsvped: result.rsvped,
    rsvpCount: updatedClass.rsvpCount ?? 0,
  };
});
