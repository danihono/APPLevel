import { Timestamp } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import {
  AcademyDoc,
  COLLECTIONS,
  DEFAULT_PROGRESSION_RULES,
  ROLE_ORDER,
  Role,
  UserDoc,
} from '../domain/models';
import { getRequestContext, getUserDoc } from '../lib/context';
import { assertCondition } from '../lib/errors';
import { auth, db } from '../lib/firebase';
import { optionalNumber, optionalString, requiredString } from '../lib/payload';

async function setClaims(uid: string, role: Role, academyId: string): Promise<void> {
  await auth.setCustomUserClaims(uid, {
    role,
    academyId,
  });
}

export const createAcademy = onCall({ region: 'southamerica-east1' }, async (request) => {
  const actor = await getRequestContext(request, 'superadmin');
  const name = requiredString(request.data, 'name');
  const slug = optionalString(request.data, 'slug') ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const timezone = optionalString(request.data, 'timezone') ?? 'America/Sao_Paulo';
  const classCheckinWindowMinutes = optionalNumber(request.data, 'classCheckinWindowMinutes') ?? 15;
  const ownerUserId = optionalString(request.data, 'ownerUserId');
  const now = Timestamp.now();
  const academyRef = db.collection(COLLECTIONS.academies).doc();
  const academy: AcademyDoc = {
    id: academyRef.id,
    name,
    slug,
    ownerUserId: ownerUserId ?? actor.uid,
    status: 'active',
    timezone,
    progressionRules: DEFAULT_PROGRESSION_RULES,
    classCheckinWindowMinutes,
    createdAt: now,
    updatedAt: now,
  };

  await academyRef.set(academy);

  if (ownerUserId) {
    const owner = await getUserDoc(ownerUserId);
    const nextRole: Role = owner.role === 'superadmin' ? owner.role : 'admin';

    await db.collection(COLLECTIONS.users).doc(ownerUserId).update({
      academyId: academyRef.id,
      role: nextRole,
      updatedAt: now,
    });
    await setClaims(ownerUserId, nextRole, academyRef.id);
  }

  return {
    academyId: academyRef.id,
    name,
    slug,
  };
});

export const createUserWithRole = onCall({ region: 'southamerica-east1' }, async (request) => {
  const actor = await getRequestContext(request, 'admin');
  const firstName = requiredString(request.data, 'firstName');
  const lastName = requiredString(request.data, 'lastName');
  const email = requiredString(request.data, 'email').toLowerCase();
  const password = optionalString(request.data, 'password');
  const requestedRole = requiredString(request.data, 'role') as Role;
  const academyId = optionalString(request.data, 'academyId') ?? actor.academyId;
  const phone = optionalString(request.data, 'phone');
  const belt = optionalString(request.data, 'belt') ?? 'white';
  const grade = optionalNumber(request.data, 'grade') ?? 0;
  const stripes = optionalNumber(request.data, 'stripes') ?? 0;

  assertCondition(ROLE_ORDER.includes(requestedRole), 'invalid-argument', 'Role inválida.');
  assertCondition(
    actor.role === 'superadmin' || requestedRole !== 'superadmin',
    'permission-denied',
    'Apenas superadmin pode criar outro superadmin.',
  );
  assertCondition(
    actor.role === 'superadmin' || academyId === actor.academyId,
    'permission-denied',
    'Admin só pode criar usuários na própria academia.',
  );

  const createdUser = await auth.createUser({
    email,
    password,
    displayName: `${firstName} ${lastName}`.trim(),
  });

  const now = Timestamp.now();
  const userDoc: UserDoc = {
    academyId,
    firstName,
    lastName,
    displayName: `${firstName} ${lastName}`.trim(),
    email,
    phone,
    role: requestedRole,
    status: 'active',
    belt,
    stripes,
    grade,
    attendanceCount: 0,
    qrCheckinsCount: 0,
    currentStreak: 0,
    longestStreak: 0,
    competitionPoints: 0,
    missionPoints: 0,
    rankingPoints: 0,
    beltPromotions: 0,
    nextStripeAttendanceTarget: null,
    nextBeltAttendanceTarget: null,
    fcmTokens: [],
    createdAt: now,
    updatedAt: now,
  };

  await db.collection(COLLECTIONS.users).doc(createdUser.uid).set(userDoc);
  await setClaims(createdUser.uid, requestedRole, academyId);

  return {
    uid: createdUser.uid,
    academyId,
    role: requestedRole,
  };
});

export const assignUserToAcademy = onCall({ region: 'southamerica-east1' }, async (request) => {
  const actor = await getRequestContext(request, 'admin');
  const targetUserId = requiredString(request.data, 'userId');
  const academyId = requiredString(request.data, 'academyId');
  const targetUser = await getUserDoc(targetUserId);

  assertCondition(
    actor.role === 'superadmin' || academyId === actor.academyId,
    'permission-denied',
    'Admin só pode vincular usuários à própria academia.',
  );
  assertCondition(
    actor.role === 'superadmin' || targetUser.role !== 'superadmin',
    'permission-denied',
    'Admin não pode alterar o vínculo de um superadmin.',
  );

  await db.collection(COLLECTIONS.users).doc(targetUserId).update({
    academyId,
    updatedAt: Timestamp.now(),
  });
  await setClaims(targetUserId, targetUser.role, academyId);

  return {
    userId: targetUserId,
    academyId,
  };
});

export const setUserRole = onCall({ region: 'southamerica-east1' }, async (request) => {
  const actor = await getRequestContext(request, 'admin');
  const targetUserId = requiredString(request.data, 'userId');
  const role = requiredString(request.data, 'role') as Role;
  const targetUser = await getUserDoc(targetUserId);

  assertCondition(ROLE_ORDER.includes(role), 'invalid-argument', 'Role inválida.');
  assertCondition(
    actor.role === 'superadmin' || role !== 'superadmin',
    'permission-denied',
    'Apenas superadmin pode promover outro superadmin.',
  );
  assertCondition(
    actor.role === 'superadmin' || targetUser.academyId === actor.academyId,
    'permission-denied',
    'Admin só pode alterar perfis da própria academia.',
  );

  await db.collection(COLLECTIONS.users).doc(targetUserId).update({
    role,
    updatedAt: Timestamp.now(),
  });
  await setClaims(targetUserId, role, targetUser.academyId);

  return {
    userId: targetUserId,
    role,
  };
});

export const validateSessionAccess = onCall({ region: 'southamerica-east1' }, async (request) => {
  const actor = await getRequestContext(request, 'student');
  return {
    uid: actor.uid,
    academyId: actor.academyId,
    role: actor.role,
    displayName: actor.user.displayName,
    belt: actor.user.belt,
    stripes: actor.user.stripes,
  };
});
