import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { COLLECTIONS, FightDoc } from '../domain/models';
import { getRequestContext, getUserDoc } from '../lib/context';
import { db } from '../lib/firebase';
import { assertCondition } from '../lib/errors';
import { optionalString } from '../lib/payload';
import { syncAllUsersInAcademy, syncUserDerivedState } from '../services/userState';

const callableOptions = { region: 'southamerica-east1', invoker: 'public' as const };

export const recalculateUserRanking = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'student');
  const targetUserId = optionalString(request.data, 'userId') ?? actor.uid;

  assertCondition(
    targetUserId === actor.uid || actor.role === 'professor' || actor.role === 'superadmin',
    'permission-denied',
    'Você não pode recalcular o ranking de outro usuário.',
  );

  if (targetUserId !== actor.uid && actor.role !== 'superadmin') {
    const targetUser = await getUserDoc(targetUserId);
    assertCondition(
      targetUser.academyId === actor.academyId,
      'permission-denied',
      'Você não pode operar dados de usuários de outra academia.',
    );
  }

  return syncUserDerivedState(targetUserId, actor.academyId);
});

export const recalculateAcademyRankings = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  const academyId = optionalString(request.data, 'academyId') ?? actor.academyId;

  assertCondition(
    actor.role === 'superadmin' || academyId === actor.academyId,
    'permission-denied',
    'Professor so pode recalcular o ranking da propria academia.',
  );

  const totalProcessed = await syncAllUsersInAcademy(academyId);
  return {
    academyId,
    totalProcessed,
  };
});

export const onFightWritten = onDocumentWritten(
  {
    document: 'fights/{fightId}',
    region: 'southamerica-east1',
  },
  async (event) => {
    const after = event.data?.after.data() as FightDoc | undefined;
    const before = event.data?.before.data() as FightDoc | undefined;
    const fight = after ?? before;

    if (!fight) {
      return;
    }

    // Se o atleta nao existe mais (ex.: conta excluida via deleteMyAccount), nao tentamos
    // sincronizar estado derivado — evita erro 'not-found' e a recriacao de ranking orfao.
    const athleteSnap = await db.collection(COLLECTIONS.users).doc(fight.athleteId).get();
    if (!athleteSnap.exists) {
      return;
    }

    await syncUserDerivedState(fight.athleteId, fight.academyId);
  },
);
