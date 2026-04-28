import { Timestamp } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import {
  AcademyDoc,
  COLLECTIONS,
  DEFAULT_PROGRESSION_RULES,
  ProgressionBeltRule,
  ProgressionMilestone,
  ProgressionRulesV2,
} from '../domain/models';
import { getRequestContext, getUserDoc } from '../lib/context';
import { assertCondition } from '../lib/errors';
import { db } from '../lib/firebase';
import { optionalString } from '../lib/payload';
import { normalizeProgressionRules } from '../services/progression';
import { syncAllUsersInAcademy, syncUserDerivedState } from '../services/userState';

const callableOptions = { region: 'southamerica-east1', invoker: 'public' as const };

function parseMilestones(data: unknown): ProgressionMilestone[] {
  const milestones = (data as Record<string, unknown> | null)?.milestones;
  assertCondition(Array.isArray(milestones) && milestones.length > 0, 'invalid-argument', 'milestones e obrigatorio.');

  return milestones.map((item, index) => {
    const entry = item as Record<string, unknown>;
    assertCondition(typeof entry.belt === 'string' && entry.belt.trim().length > 0, 'invalid-argument', `belt invalido na posicao ${index}.`);
    assertCondition(typeof entry.minAttendances === 'number', 'invalid-argument', `minAttendances invalido na posicao ${index}.`);
    assertCondition(typeof entry.stripeEvery === 'number', 'invalid-argument', `stripeEvery invalido na posicao ${index}.`);
    assertCondition(typeof entry.maxStripes === 'number', 'invalid-argument', `maxStripes invalido na posicao ${index}.`);

    return {
      belt: entry.belt.trim().toLowerCase(),
      minAttendances: entry.minAttendances,
      stripeEvery: entry.stripeEvery,
      maxStripes: entry.maxStripes,
    };
  });
}

function parseBeltRules(segment: unknown, fieldName: string): ProgressionBeltRule[] {
  const belts = (segment as Record<string, unknown> | null)?.belts;
  assertCondition(Array.isArray(belts) && belts.length > 0, 'invalid-argument', `${fieldName}.belts e obrigatorio.`);

  return belts.map((item, index) => {
    const entry = item as Record<string, unknown>;
    assertCondition(typeof entry.belt === 'string' && entry.belt.trim().length > 0, 'invalid-argument', `${fieldName}.belts[${index}].belt invalido.`);
    assertCondition(typeof entry.stripeEvery === 'number', 'invalid-argument', `${fieldName}.belts[${index}].stripeEvery invalido.`);
    assertCondition(typeof entry.maxStripes === 'number', 'invalid-argument', `${fieldName}.belts[${index}].maxStripes invalido.`);
    assertCondition(entry.beltPromotionOffset == null || typeof entry.beltPromotionOffset === 'number', 'invalid-argument', `${fieldName}.belts[${index}].beltPromotionOffset invalido.`);

    return {
      belt: entry.belt.trim().toLowerCase(),
      stripeEvery: entry.stripeEvery,
      maxStripes: entry.maxStripes,
      beltPromotionOffset: typeof entry.beltPromotionOffset === 'number' ? entry.beltPromotionOffset : undefined,
    };
  });
}

function parseRulesPayload(data: unknown, version: number): ProgressionRulesV2 {
  const payload = (data as Record<string, unknown> | null) ?? {};
  if (Array.isArray(payload.milestones)) {
    return normalizeProgressionRules({
      version,
      milestones: parseMilestones(data),
    });
  }

  const kids = (payload.kids as Record<string, unknown> | null) ?? {};
  return normalizeProgressionRules({
    version,
    schema: 'v2',
    adult: {
      belts: parseBeltRules(payload.adult, 'adult'),
    },
    kids: {
      level_infantil: {
        belts: parseBeltRules(kids.level_infantil, 'kids.level_infantil'),
      },
    },
  });
}

export const upsertAcademyProgressionRules = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  const academyId = optionalString(request.data, 'academyId') ?? actor.academyId;

  assertCondition(
    actor.role === 'superadmin' || academyId === actor.academyId,
    'permission-denied',
    'Professor so pode alterar regras da propria academia.',
  );

  const academyRef = db.collection(COLLECTIONS.academies).doc(academyId);
  const academySnap = await academyRef.get();
  assertCondition(academySnap.exists, 'not-found', 'Academia nao encontrada.');

  const currentRules = (academySnap.get('progressionRules') as typeof DEFAULT_PROGRESSION_RULES | undefined) ?? DEFAULT_PROGRESSION_RULES;
  const normalized = parseRulesPayload(request.data, (currentRules.version ?? 0) + 1);

  await academyRef.update({
    progressionRules: normalized,
    updatedAt: Timestamp.now(),
  });

  const totalProcessed = await syncAllUsersInAcademy(academyId);

  return {
    academyId,
    rules: normalized,
    totalProcessed,
  };
});

async function repairSingleAcademyProgressionRules(academyId: string): Promise<{
  academyId: string;
  rulesUpdated: boolean;
  totalProcessed: number;
}> {
  const academyRef = db.collection(COLLECTIONS.academies).doc(academyId);
  const academySnap = await academyRef.get();
  assertCondition(academySnap.exists, 'not-found', 'Academia nao encontrada.');

  const academy = academySnap.data() as AcademyDoc;
  const currentRules = academy.progressionRules ?? DEFAULT_PROGRESSION_RULES;
  const normalized = normalizeProgressionRules(currentRules);
  const rulesUpdated = JSON.stringify(currentRules) !== JSON.stringify(normalized);

  if (rulesUpdated) {
    await academyRef.update({
      progressionRules: normalized,
      updatedAt: Timestamp.now(),
    });
  }

  const totalProcessed = await syncAllUsersInAcademy(academyId);

  return {
    academyId,
    rulesUpdated,
    totalProcessed,
  };
}

export const repairAcademyProgressionRules = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  const requestedAcademyId = optionalString(request.data, 'academyId');

  if (actor.role !== 'superadmin') {
    const academyId = requestedAcademyId ?? actor.academyId;
    assertCondition(
      academyId === actor.academyId,
      'permission-denied',
      'Professor so pode reparar regras da propria academia.',
    );

    const result = await repairSingleAcademyProgressionRules(academyId);
    return {
      totalAcademies: 1,
      results: [result],
    };
  }

  const academyIds = requestedAcademyId
    ? [requestedAcademyId]
    : (await db.collection(COLLECTIONS.academies).get()).docs.map((doc) => doc.id);

  const results = [];
  for (const academyId of academyIds) {
    results.push(await repairSingleAcademyProgressionRules(academyId));
  }

  return {
    totalAcademies: results.length,
    results,
  };
});

export const evaluateUserProgression = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'student');
  const targetUserId = optionalString(request.data, 'userId') ?? actor.uid;

  assertCondition(
    targetUserId === actor.uid || actor.role === 'professor' || actor.role === 'superadmin',
    'permission-denied',
    'Voce nao pode recalcular a progressao de outro usuario.',
  );

  if (targetUserId !== actor.uid && actor.role !== 'superadmin') {
    const targetUser = await getUserDoc(targetUserId);
    assertCondition(
      targetUser.academyId === actor.academyId,
      'permission-denied',
      'Voce nao pode operar dados de usuarios de outra academia.',
    );
  }

  return syncUserDerivedState(targetUserId, actor.academyId);
});

export const rebuildUserDerivedState = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'student');
  const targetUserId = optionalString(request.data, 'userId') ?? actor.uid;

  assertCondition(
    targetUserId === actor.uid || actor.role === 'professor' || actor.role === 'superadmin',
    'permission-denied',
    'Voce nao pode reconstruir o estado derivado de outro usuario.',
  );

  if (targetUserId !== actor.uid && actor.role !== 'superadmin') {
    const targetUser = await getUserDoc(targetUserId);
    assertCondition(
      targetUser.academyId === actor.academyId,
      'permission-denied',
      'Voce nao pode operar dados de usuarios de outra academia.',
    );
  }

  return syncUserDerivedState(targetUserId, actor.academyId);
});
