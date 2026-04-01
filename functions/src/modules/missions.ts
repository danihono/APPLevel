import { Timestamp } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { COLLECTIONS, MissionDoc, MissionMetric, ROLE_ORDER } from '../domain/models';
import { getRequestContext } from '../lib/context';
import { assertCondition } from '../lib/errors';
import { db } from '../lib/firebase';
import {
  optionalBoolean,
  optionalString,
  requiredNumber,
  requiredString,
} from '../lib/payload';
import { syncUserDerivedState } from '../services/userState';

const callableOptions = { region: 'southamerica-east1', invoker: 'public' as const };

const ALLOWED_METRICS: MissionMetric[] = [
  'attendance_count',
  'attendance_streak',
  'qr_checkins',
  'competition_points',
  'belt_promotions',
];

export const upsertMission = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'admin');
  const missionId = optionalString(request.data, 'missionId');
  const academyId = optionalString(request.data, 'academyId') ?? actor.academyId;
  const name = requiredString(request.data, 'name');
  const description = optionalString(request.data, 'description');
  const metric = requiredString(request.data, 'metric') as MissionMetric;
  const targetValue = requiredNumber(request.data, 'targetValue');
  const rewardPoints = requiredNumber(request.data, 'rewardPoints');
  const active = optionalBoolean(request.data, 'active', true);
  const targetRole = optionalString(request.data, 'targetRole');
  const now = Timestamp.now();

  assertCondition(ALLOWED_METRICS.includes(metric), 'invalid-argument', 'Métrica de missão inválida.');
  assertCondition(
    targetRole == null || ROLE_ORDER.includes(targetRole as (typeof ROLE_ORDER)[number]),
    'invalid-argument',
    'Role de missão inválida.',
  );
  assertCondition(
    actor.role === 'superadmin' || academyId === actor.academyId,
    'permission-denied',
    'Admin só pode salvar missões da própria academia.',
  );

  const missionRef = missionId ? db.collection(COLLECTIONS.missions).doc(missionId) : db.collection(COLLECTIONS.missions).doc();
  const existing = missionId ? await missionRef.get() : null;
  const payload: MissionDoc = {
    academyId,
    name,
    description,
    metric,
    targetValue,
    rewardPoints,
    active,
    targetRole: targetRole as MissionDoc['targetRole'],
    createdAt: (existing?.get('createdAt') as FirebaseFirestore.Timestamp | undefined) ?? now,
    updatedAt: now,
  };

  await missionRef.set(payload, { merge: true });
  return {
    missionId: missionRef.id,
    academyId,
  };
});

export const syncUserMissionProgress = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'student');
  const targetUserId = optionalString(request.data, 'userId') ?? actor.uid;

  assertCondition(
    targetUserId === actor.uid || actor.role === 'professor' || actor.role === 'admin' || actor.role === 'superadmin',
    'permission-denied',
    'Você não pode sincronizar missões de outro usuário.',
  );

  return syncUserDerivedState(targetUserId, actor.academyId);
});
