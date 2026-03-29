import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { FightDoc } from '../domain/models';
import { getRequestContext } from '../lib/context';
import { assertCondition } from '../lib/errors';
import { optionalString } from '../lib/payload';
import { syncAllUsersInAcademy, syncUserDerivedState } from '../services/userState';

export const recalculateUserRanking = onCall({ region: 'southamerica-east1' }, async (request) => {
  const actor = await getRequestContext(request, 'student');
  const targetUserId = optionalString(request.data, 'userId') ?? actor.uid;

  assertCondition(
    targetUserId === actor.uid || actor.role === 'professor' || actor.role === 'admin' || actor.role === 'superadmin',
    'permission-denied',
    'Você não pode recalcular o ranking de outro usuário.',
  );

  return syncUserDerivedState(targetUserId, actor.academyId);
});

export const recalculateAcademyRankings = onCall({ region: 'southamerica-east1' }, async (request) => {
  const actor = await getRequestContext(request, 'admin');
  const academyId = optionalString(request.data, 'academyId') ?? actor.academyId;

  assertCondition(
    actor.role === 'superadmin' || academyId === actor.academyId,
    'permission-denied',
    'Admin só pode recalcular o ranking da própria academia.',
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

    await syncUserDerivedState(fight.athleteId, fight.academyId);
  },
);
