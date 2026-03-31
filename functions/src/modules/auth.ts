import { Timestamp } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import {
  AcademyDoc,
  COLLECTIONS,
  DEFAULT_PROGRESSION_RULES,
  JoinRequestDoc,
  NotificationChannel,
  NotificationDoc,
  NotificationKind,
  ROLE_ORDER,
  Role,
  UserDoc,
} from '../domain/models';
import { findSingleByFields, getRequestContext, getUserDoc } from '../lib/context';
import { assertCondition } from '../lib/errors';
import { auth, db } from '../lib/firebase';
import {
  optionalBoolean,
  optionalNumber,
  optionalString,
  requiredNumber,
  requiredString,
} from '../lib/payload';
import { syncUserDerivedState } from '../services/userState';

const CPF_LENGTH = 11;

async function setClaims(uid: string, role: Role, academyId: string): Promise<void> {
  await auth.setCustomUserClaims(uid, {
    role,
    academyId,
  });
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeCpf(value: string): string {
  return value.replace(/\D/g, '');
}

function isRepeatedCpfDigit(value: string): boolean {
  return /^(\d)\1+$/.test(value);
}

function computeCpfVerifier(base: string): number {
  let sum = 0;

  for (let index = 0; index < base.length; index += 1) {
    sum += Number(base[index]) * ((base.length + 1) - index);
  }

  const remainder = (sum * 10) % 11;
  return remainder === 10 ? 0 : remainder;
}

function assertValidCpf(rawCpf: string): string {
  const cpf = normalizeCpf(rawCpf);
  assertCondition(cpf.length === CPF_LENGTH, 'invalid-argument', 'Informe um CPF valido.');
  assertCondition(!isRepeatedCpfDigit(cpf), 'invalid-argument', 'Informe um CPF valido.');

  const firstVerifier = computeCpfVerifier(cpf.slice(0, 9));
  const secondVerifier = computeCpfVerifier(cpf.slice(0, 10));

  assertCondition(
    cpf === `${cpf.slice(0, 9)}${firstVerifier}${secondVerifier}`,
    'invalid-argument',
    'Informe um CPF valido.',
  );

  return cpf;
}

function assertProfessorOrSuperadmin(actorRole: Role): void {
  assertCondition(
    actorRole === 'professor' || actorRole === 'superadmin',
    'permission-denied',
    'Somente professor ou superadmin podem executar esta acao.',
  );
}

async function ensureUniqueIdentity(params: {
  email: string;
  cpf: string;
  excludeUserId?: string;
  excludeRequestId?: string;
}): Promise<void> {
  const [existingUserByEmail, existingUserByCpf, joinRequestsByEmail, joinRequestsByCpf] = await Promise.all([
    findSingleByFields<UserDoc>(COLLECTIONS.users, [['email', '==', params.email]]),
    findSingleByFields<UserDoc>(COLLECTIONS.users, [['cpf', '==', params.cpf]]),
    db.collection(COLLECTIONS.joinRequests).where('email', '==', params.email).limit(5).get(),
    db.collection(COLLECTIONS.joinRequests).where('cpf', '==', params.cpf).limit(5).get(),
  ]);
  const existingRequestByEmail = joinRequestsByEmail.docs
    .map((doc) => ({ id: doc.id, data: doc.data() as JoinRequestDoc }))
    .find((entry) => entry.data.status === 'pending');
  const existingRequestByCpf = joinRequestsByCpf.docs
    .map((doc) => ({ id: doc.id, data: doc.data() as JoinRequestDoc }))
    .find((entry) => entry.data.status === 'pending');

  assertCondition(
    !existingUserByEmail || existingUserByEmail.id === params.excludeUserId,
    'already-exists',
    'Ja existe uma conta usando este e-mail.',
  );
  assertCondition(
    !existingUserByCpf || existingUserByCpf.id === params.excludeUserId,
    'already-exists',
    'Ja existe uma conta usando este CPF.',
  );
  assertCondition(
    !existingRequestByEmail || existingRequestByEmail.id === params.excludeRequestId,
    'already-exists',
    'Ja existe uma solicitacao pendente usando este e-mail.',
  );
  assertCondition(
    !existingRequestByCpf || existingRequestByCpf.id === params.excludeRequestId,
    'already-exists',
    'Ja existe uma solicitacao pendente usando este CPF.',
  );
}

async function emailExists(email: string): Promise<boolean> {
  try {
    await auth.getUserByEmail(email);
    return true;
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';

    if (code === 'auth/user-not-found') {
      return false;
    }

    throw error;
  }
}

async function createNotifications(params: {
  academyId: string;
  recipients: string[];
  createdBy: string;
  title: string;
  body: string;
  channel: NotificationChannel;
  kind: NotificationKind;
  actionRef?: string;
  data?: Record<string, string>;
}): Promise<void> {
  if (params.recipients.length === 0) {
    return;
  }

  const now = Timestamp.now();
  const batch = db.batch();

  for (const recipientUserId of new Set(params.recipients)) {
    const notificationRef = db.collection(COLLECTIONS.notifications).doc();
    const notification: NotificationDoc = {
      academyId: params.academyId,
      title: params.title,
      body: params.body,
      channel: params.channel,
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

async function listApproversForAcademy(academyId: string): Promise<string[]> {
  const [academyUsers, superadmins] = await Promise.all([
    db.collection(COLLECTIONS.users).where('academyId', '==', academyId).get(),
    db.collection(COLLECTIONS.users).where('role', '==', 'superadmin').get(),
  ]);

  const recipients = new Set<string>();

  for (const doc of academyUsers.docs) {
    const user = doc.data() as UserDoc;
    if (user.role === 'professor') {
      recipients.add(doc.id);
    }
  }

  for (const doc of superadmins.docs) {
    recipients.add(doc.id);
  }

  return [...recipients];
}

function buildStudentUserDoc(joinRequest: JoinRequestDoc, now: Timestamp): UserDoc {
  const requestedGrade = Math.max(0, Math.floor(joinRequest.requestedGrade));

  return {
    academyId: joinRequest.academyId,
    firstName: joinRequest.firstName,
    lastName: joinRequest.lastName,
    displayName: joinRequest.displayName,
    email: joinRequest.email,
    cpf: joinRequest.cpf,
    birthDate: joinRequest.birthDate,
    isCompetitor: joinRequest.isCompetitor,
    role: 'student',
    status: 'active',
    belt: joinRequest.requestedBelt,
    stripes: requestedGrade,
    grade: requestedGrade,
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
}

export const listSignupAcademies = onCall({ region: 'southamerica-east1' }, async () => {
  const snapshot = await db
    .collection(COLLECTIONS.academies)
    .where('status', '==', 'active')
    .get();

  return snapshot.docs
    .map((doc) => doc.data() as AcademyDoc)
    .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'))
    .map((academy) => ({
      academyId: academy.id,
      name: academy.name,
      timezone: academy.timezone,
    }));
});

export const submitStudentSignup = onCall({ region: 'southamerica-east1' }, async (request) => {
  const academyId = requiredString(request.data, 'academyId');
  const email = normalizeEmail(requiredString(request.data, 'email'));
  const password = requiredString(request.data, 'password');
  const firstName = requiredString(request.data, 'firstName');
  const lastName = requiredString(request.data, 'lastName');
  const cpf = assertValidCpf(requiredString(request.data, 'cpf'));
  const birthDate = requiredString(request.data, 'birthDate');
  const isCompetitor = optionalBoolean(request.data, 'isCompetitor', false);
  const belt = requiredString(request.data, 'belt').toLowerCase();
  const grade = Math.max(0, Math.floor(requiredNumber(request.data, 'grade')));

  const academySnap = await db.collection(COLLECTIONS.academies).doc(academyId).get();
  assertCondition(academySnap.exists, 'not-found', 'Unidade nao encontrada.');
  const academy = academySnap.data() as AcademyDoc;
  assertCondition(academy.status === 'active', 'failed-precondition', 'Esta unidade nao esta aceitando novos cadastros.');

  await ensureUniqueIdentity({ email, cpf });
  assertCondition(!(await emailExists(email)), 'already-exists', 'Ja existe uma conta usando este e-mail.');

  const displayName = `${firstName} ${lastName}`.trim();
  const now = Timestamp.now();
  let createdAuthUid = '';

  try {
    const createdUser = await auth.createUser({
      email,
      password,
      displayName,
      disabled: true,
    });
    createdAuthUid = createdUser.uid;

    const joinRequestRef = db.collection(COLLECTIONS.joinRequests).doc();
    const joinRequest: JoinRequestDoc = {
      academyId,
      academyName: academy.name,
      authUid: createdAuthUid,
      email,
      cpf,
      firstName,
      lastName,
      displayName,
      birthDate,
      isCompetitor,
      requestedBelt: belt,
      requestedGrade: grade,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };

    await joinRequestRef.set(joinRequest);

    const recipients = await listApproversForAcademy(academyId);
    await createNotifications({
      academyId,
      recipients,
      createdBy: createdAuthUid,
      title: 'Novo pedido de entrada',
      body: `${displayName} solicitou cadastro na unidade ${academy.name}.`,
      channel: 'system',
      kind: 'join_request',
      actionRef: joinRequestRef.id,
      data: {
        requestId: joinRequestRef.id,
        academyId,
        userName: displayName,
      },
    });

    return {
      requestId: joinRequestRef.id,
      academyId,
      status: 'pending' as const,
    };
  } catch (error) {
    if (createdAuthUid) {
      try {
        await auth.deleteUser(createdAuthUid);
      } catch {
        // Keep the original error surface for the caller.
      }
    }

    throw error;
  }
});

export const createAcademy = onCall({ region: 'southamerica-east1' }, async (request) => {
  const actor = await getRequestContext(request, 'superadmin');
  const name = requiredString(request.data, 'name');
  const slug = optionalString(request.data, 'slug') ?? name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const timezone = optionalString(request.data, 'timezone') ?? 'America/Sao_Paulo';
  const classCheckinWindowMinutes = optionalNumber(request.data, 'classCheckinWindowMinutes') ?? 15;
  const masterBlackLimit = optionalNumber(request.data, 'masterBlackLimit') ?? 1;
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
    masterBlackLimit,
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
  const actor = await getRequestContext(request, 'superadmin');
  const firstName = requiredString(request.data, 'firstName');
  const lastName = requiredString(request.data, 'lastName');
  const email = normalizeEmail(requiredString(request.data, 'email'));
  const password = optionalString(request.data, 'password');
  const requestedRole = requiredString(request.data, 'role') as Role;
  const academyId = optionalString(request.data, 'academyId') ?? actor.academyId;
  const phone = optionalString(request.data, 'phone');
  const cpf = optionalString(request.data, 'cpf');
  const birthDate = optionalString(request.data, 'birthDate');
  const isCompetitor = optionalBoolean(request.data, 'isCompetitor', false);
  const belt = optionalString(request.data, 'belt') ?? 'white';
  const grade = optionalNumber(request.data, 'grade') ?? 0;
  const stripes = optionalNumber(request.data, 'stripes') ?? grade;

  assertCondition(ROLE_ORDER.includes(requestedRole), 'invalid-argument', 'Role invalida.');
  assertCondition(requestedRole !== 'student', 'invalid-argument', 'Cadastros de aluno devem usar o fluxo de solicitacao.');
  await ensureUniqueIdentity({
    email,
    cpf: cpf ? assertValidCpf(cpf) : `staff-${email}`,
  });
  assertCondition(!(await emailExists(email)), 'already-exists', 'Ja existe uma conta usando este e-mail.');

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
    cpf: cpf ? assertValidCpf(cpf) : `staff-${createdUser.uid}`,
    phone,
    birthDate,
    isCompetitor: false,
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

export const approveJoinRequest = onCall({ region: 'southamerica-east1' }, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  assertProfessorOrSuperadmin(actor.role);

  const requestId = requiredString(request.data, 'requestId');
  const joinRequestRef = db.collection(COLLECTIONS.joinRequests).doc(requestId);
  const joinRequestSnap = await joinRequestRef.get();

  assertCondition(joinRequestSnap.exists, 'not-found', 'Solicitacao nao encontrada.');
  const joinRequest = joinRequestSnap.data() as JoinRequestDoc;
  assertCondition(joinRequest.status === 'pending', 'failed-precondition', 'Esta solicitacao ja foi processada.');
  assertCondition(
    actor.role === 'superadmin' || joinRequest.academyId === actor.academyId,
    'permission-denied',
    'Voce so pode aprovar alunos da sua unidade.',
  );

  await ensureUniqueIdentity({
    email: joinRequest.email,
    cpf: joinRequest.cpf,
    excludeRequestId: requestId,
    excludeUserId: joinRequest.authUid,
  });

  const now = Timestamp.now();
  const userDoc = buildStudentUserDoc(joinRequest, now);
  const studentNotificationId = db.collection(COLLECTIONS.notifications).doc().id;
  const batch = db.batch();

  batch.set(db.collection(COLLECTIONS.users).doc(joinRequest.authUid), userDoc, { merge: true });
  batch.update(joinRequestRef, {
    status: 'approved',
    resolvedAt: now,
    resolvedBy: actor.uid,
    resolvedByRole: actor.role,
    updatedAt: now,
  });
  batch.set(db.collection(COLLECTIONS.notifications).doc(studentNotificationId), {
    academyId: joinRequest.academyId,
    title: 'Cadastro aprovado',
    body: `Seu acesso na unidade ${joinRequest.academyName} foi aprovado.`,
    channel: 'system',
    kind: 'join_request',
    status: 'stored',
    createdBy: actor.uid,
    createdAt: now,
    updatedAt: now,
    recipientUserId: joinRequest.authUid,
    actionRef: requestId,
    data: {
      requestId,
      academyId: joinRequest.academyId,
    },
  } satisfies NotificationDoc);
  await batch.commit();

  await setClaims(joinRequest.authUid, 'student', joinRequest.academyId);
  await auth.updateUser(joinRequest.authUid, {
    disabled: false,
    displayName: joinRequest.displayName,
  });
  await syncUserDerivedState(joinRequest.authUid, joinRequest.academyId);

  return {
    requestId,
    userId: joinRequest.authUid,
    status: 'approved' as const,
  };
});

export const rejectJoinRequest = onCall({ region: 'southamerica-east1' }, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  assertProfessorOrSuperadmin(actor.role);

  const requestId = requiredString(request.data, 'requestId');
  const joinRequestRef = db.collection(COLLECTIONS.joinRequests).doc(requestId);
  const joinRequestSnap = await joinRequestRef.get();

  assertCondition(joinRequestSnap.exists, 'not-found', 'Solicitacao nao encontrada.');
  const joinRequest = joinRequestSnap.data() as JoinRequestDoc;
  assertCondition(joinRequest.status === 'pending', 'failed-precondition', 'Esta solicitacao ja foi processada.');
  assertCondition(
    actor.role === 'superadmin' || joinRequest.academyId === actor.academyId,
    'permission-denied',
    'Voce so pode rejeitar alunos da sua unidade.',
  );

  await joinRequestRef.update({
    status: 'rejected',
    resolvedAt: Timestamp.now(),
    resolvedBy: actor.uid,
    resolvedByRole: actor.role,
    updatedAt: Timestamp.now(),
  });

  try {
    await auth.deleteUser(joinRequest.authUid);
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';

    if (code !== 'auth/user-not-found') {
      throw error;
    }
  }

  return {
    requestId,
    status: 'rejected' as const,
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
    'Admin so pode vincular usuarios a propria academia.',
  );
  assertCondition(
    actor.role === 'superadmin' || targetUser.role !== 'superadmin',
    'permission-denied',
    'Admin nao pode alterar o vinculo de um superadmin.',
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

  assertCondition(ROLE_ORDER.includes(role), 'invalid-argument', 'Role invalida.');
  assertCondition(
    actor.role === 'superadmin' || role !== 'superadmin',
    'permission-denied',
    'Apenas superadmin pode promover outro superadmin.',
  );
  assertCondition(
    actor.role === 'superadmin' || targetUser.academyId === actor.academyId,
    'permission-denied',
    'Admin so pode alterar perfis da propria academia.',
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

export const updateOwnStudentProfile = onCall({ region: 'southamerica-east1' }, async (request) => {
  const actor = await getRequestContext(request, 'student');
  assertCondition(actor.role === 'student', 'permission-denied', 'Somente alunos podem editar este perfil.');

  const data = (request.data as Record<string, unknown> | null) ?? {};
  const firstName = optionalString(request.data, 'firstName') ?? actor.user.firstName;
  const lastName = optionalString(request.data, 'lastName') ?? actor.user.lastName;
  const phone = optionalString(request.data, 'phone');
  const birthDate = optionalString(request.data, 'birthDate') ?? actor.user.birthDate;
  const cpf = data.cpf === undefined ? actor.user.cpf : assertValidCpf(requiredString(request.data, 'cpf'));
  const photoPath = optionalString(request.data, 'photoPath');
  const isCompetitor = optionalBoolean(request.data, 'isCompetitor', actor.user.isCompetitor ?? false);
  const displayName = `${firstName} ${lastName}`.trim();

  await ensureUniqueIdentity({
    email: actor.user.email,
    cpf,
    excludeUserId: actor.uid,
  });

  await db.collection(COLLECTIONS.users).doc(actor.uid).update({
    firstName,
    lastName,
    displayName,
    cpf,
    phone: phone ?? null,
    birthDate: birthDate ?? null,
    isCompetitor,
    ...(photoPath ? { photoPath } : {}),
    updatedAt: Timestamp.now(),
  });
  await auth.updateUser(actor.uid, { displayName });

  return {
    userId: actor.uid,
    displayName,
    cpf,
    isCompetitor,
  };
});

export const syncOwnUserEmail = onCall({ region: 'southamerica-east1' }, async (request) => {
  const actor = await getRequestContext(request, 'student');
  assertCondition(actor.role === 'student', 'permission-denied', 'Somente alunos podem editar este perfil.');

  const email = normalizeEmail(requiredString(request.data, 'email'));
  if (email !== actor.user.email) {
    await ensureUniqueIdentity({
      email,
      cpf: actor.user.cpf,
      excludeUserId: actor.uid,
    });
  }

  await db.collection(COLLECTIONS.users).doc(actor.uid).update({
    email,
    updatedAt: Timestamp.now(),
  });

  return {
    userId: actor.uid,
    email,
  };
});

export const updateStudentBeltGrade = onCall({ region: 'southamerica-east1' }, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  assertProfessorOrSuperadmin(actor.role);

  const targetUserId = requiredString(request.data, 'userId');
  const belt = requiredString(request.data, 'belt').toLowerCase();
  const grade = Math.max(0, Math.floor(requiredNumber(request.data, 'grade')));
  const stripes = Math.max(0, Math.floor(optionalNumber(request.data, 'stripes') ?? grade));
  const targetUser = await getUserDoc(targetUserId);

  assertCondition(targetUser.role === 'student', 'invalid-argument', 'Somente alunos podem ter faixa ou grau alterados.');
  assertCondition(
    actor.role === 'superadmin' || targetUser.academyId === actor.academyId,
    'permission-denied',
    'Voce so pode alterar alunos da sua unidade.',
  );

  const now = Timestamp.now();
  await db.collection(COLLECTIONS.users).doc(targetUserId).update({
    belt,
    grade,
    stripes,
    updatedAt: now,
  });

  if (targetUser.belt !== belt || targetUser.stripes !== stripes) {
    await db.collection(COLLECTIONS.graduations).doc().set({
      academyId: targetUser.academyId,
      userId: targetUserId,
      previousBelt: targetUser.belt,
      previousStripes: targetUser.stripes,
      newBelt: belt,
      newStripes: stripes,
      attendanceCount: targetUser.attendanceCount,
      promotedAt: now,
      ruleVersion: 1,
      reason: 'manual_progression',
    });
  }

  await syncUserDerivedState(targetUserId, targetUser.academyId);

  return {
    userId: targetUserId,
    belt,
    grade,
    stripes,
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
