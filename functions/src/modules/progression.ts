import { Timestamp } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { COLLECTIONS, DEFAULT_PROGRESSION_RULES, ProgressionMilestone } from '../domain/models';
import { getRequestContext, getUserDoc } from '../lib/context';
import { assertCondition } from '../lib/errors';
import { db } from '../lib/firebase';
import { optionalString } from '../lib/payload';
import { normalizeProgressionRules } from '../services/progression';
import { syncUserDerivedState } from '../services/userState';

const callableOptions = { region: 'southamerica-east1', invoker: 'public' as const };

function parseMilestones(data: unknown): ProgressionMilestone[] {
  const milestones = (data as Record<string, unknown> | null)?.milestones;
  assertCondition(Array.isArray(milestones) && milestones.length > 0, 'invalid-argument', 'milestones é obrigatório.');

  return milestones.map((item, index) => {
    const entry = item as Record<string, unknown>;
    assertCondition(typeof entry.belt === 'string' && entry.belt.trim().length > 0, 'invalid-argument', `belt inválido na posição ${index}.`);
    assertCondition(typeof entry.minAttendances === 'number', 'invalid-argument', `minAttendances inválido na posição ${index}.`);
    assertCondition(typeof entry.stripeEvery === 'number', 'invalid-argument', `stripeEvery inválido na posição ${index}.`);
    assertCondition(typeof entry.maxStripes === 'number', 'invalid-argument', `maxStripes inválido na posição ${index}.`);

    return {
      belt: entry.belt.trim().toLowerCase(),
      minAttendances: entry.minAttendances,
      stripeEvery: entry.stripeEvery,
      maxStripes: entry.maxStripes,
    };
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
  assertCondition(academySnap.exists, 'not-found', 'Academia não encontrada.');

  const currentRules = (academySnap.get('progressionRules') as typeof DEFAULT_PROGRESSION_RULES | undefined) ?? DEFAULT_PROGRESSION_RULES;
  const milestones = parseMilestones(request.data);
  const normalized = normalizeProgressionRules({
    version: (currentRules.version ?? 0) + 1,
    milestones,
  });

  await academyRef.update({
    progressionRules: normalized,
    updatedAt: Timestamp.now(),
  });

  return {
    academyId,
    rules: normalized,
  };
});

export const evaluateUserProgression = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'student');
  const targetUserId = optionalString(request.data, 'userId') ?? actor.uid;

  assertCondition(
    targetUserId === actor.uid || actor.role === 'professor' || actor.role === 'superadmin',
    'permission-denied',
    'Você não pode recalcular a progressão de outro usuário.',
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

export const rebuildUserDerivedState = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'student');
  const targetUserId = optionalString(request.data, 'userId') ?? actor.uid;

  assertCondition(
    targetUserId === actor.uid || actor.role === 'professor' || actor.role === 'superadmin',
    'permission-denied',
    'Você não pode reconstruir o estado derivado de outro usuário.',
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
