import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onCall, onRequest } from 'firebase-functions/v2/https';
import {
  AcademyDoc,
  COLLECTIONS,
  DEFAULT_PROGRESSION_RULES,
  GraduationApprovalRequestDoc,
  JoinRequestDoc,
  NotificationChannel,
  NotificationDoc,
  NotificationKind,
  ROLE_ORDER,
  ReactivationRequestDoc,
  Role,
  UserDoc,
} from '../domain/models';
import { findSingleByFields, getRequestContext, getUserDoc } from '../lib/context';
import { assertCondition } from '../lib/errors';
import { auth, db, messaging, storage } from '../lib/firebase';
import {
  optionalBoolean,
  optionalNumber,
  optionalString,
  requiredNumber,
  requiredString,
} from '../lib/payload';
import {
  inferKidsCategoryFromBirthDate,
  isAdultOnlyBelt,
  isKidsOnlyBelt,
  normalizeBeltId,
  resolveBeltStartAndBonus,
  resolveMaxStripesForBelt,
  resolveProgressionTargets,
  resolveStripeEveryForBelt,
} from '../services/progression';
import { syncUserDerivedState } from '../services/userState';

const CPF_LENGTH = 11;
const callableOptions = { region: 'southamerica-east1', invoker: 'public' as const };
const publicRequestOptions = { ...callableOptions, cors: true };

type SignupAcademySummary = {
  academyId: string;
  name: string;
  timezone: string;
};

function normalizeManagedRole(role: Role): Role {
  return role === 'admin' ? 'professor' : role;
}

function normalizeScopedAcademyId(role: Role, academyId?: string | null): string {
  const normalizedRole = normalizeManagedRole(role);
  if (normalizedRole === 'superadmin') {
    return '';
  }

  return academyId?.trim() ?? '';
}

async function assertAcademyExists(academyId: string): Promise<void> {
  const academySnap = await db.collection(COLLECTIONS.academies).doc(academyId).get();
  assertCondition(academySnap.exists, 'not-found', 'Unidade nao encontrada.');
}

async function setClaims(uid: string, role: Role, academyId: string): Promise<void> {
  const normalizedRole = normalizeManagedRole(role);
  await auth.setCustomUserClaims(uid, {
    role: normalizedRole,
    academyId: normalizeScopedAcademyId(normalizedRole, academyId),
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

function assertJoinRequestApproverRole(actorRole: Role): void {
  assertCondition(
    actorRole === 'professor' || actorRole === 'superadmin',
    'permission-denied',
    'Somente professor ou superadmin podem aprovar ou rejeitar esta solicitacao.',
  );
}

async function applyStudentBeltGradeUpdate(params: {
  targetUserId: string;
  targetUser: UserDoc;
  belt: string;
  grade: number;
  stripes: number;
  kidsCategory?: string;
  hasKidsCategoryField: boolean;
  ruleVersion?: number;
  gradeProgress?: number;
  desiredBonus?: number;
}): Promise<Timestamp> {
  const now = Timestamp.now();
  let attendanceCountAtBeltStart: number | undefined;
  let attendanceCountBonusToWrite: number | undefined;

  const beltChanged = params.targetUser.belt !== params.belt;
  const stripeChanged = params.targetUser.stripes !== params.stripes;

  const countOrganicAttendances = async (): Promise<number> => {
    const baseQuery = db
      .collection(COLLECTIONS.attendances)
      .where('academyId', '==', params.targetUser.academyId)
      .where('userId', '==', params.targetUserId);
    const [totalSnap, nonCountingSnap] = await Promise.all([
      baseQuery.count().get(),
      baseQuery.where('countsAsAttendance', '==', false).count().get(),
    ]);
    return totalSnap.data().count - nonCountingSnap.data().count;
  };

  if (params.gradeProgress !== undefined || params.desiredBonus !== undefined || beltChanged || stripeChanged) {
    // Reposiciona marco (attendanceCountAtBeltStart) + bonus para o grau exibir exatamente
    // `gradeProgress` aulas. O progresso e derivado de (attendanceCount - marco), onde
    // attendanceCount = aulas reais (organic) + bonus.
    //   - Ajuste manual (campo "Aulas no grau atual"): usa o gradeProgress informado.
    //   - Bonus desejado (staff define o proprio bonus): deriva gradeProgress de organic+desiredBonus.
    //   - Graduacao automatica (sem nenhum dos dois): gradeProgress = 0, pois todo grau
    //     recem-aprovado comeca em 0/stripeEvery.
    // Ajustar marco E bonus juntos (em vez de gravar bonus isolado) cobre o aluno colocado manualmente
    // (poucas aulas reais): bonus isolado o rebaixaria a "colocacao manual" e faria as aulas reais
    // restantes reaparecerem como progresso do novo grau (bug: 21/30 e 51/150 em vez de 0/30 e 30/150).
    const organic = await countOrganicAttendances();
    const stripeEvery = resolveStripeEveryForBelt(params.belt, {
      birthDate: params.targetUser.birthDate,
      kidsCategory: params.targetUser.kidsCategory,
    });
    const effectiveGradeProgress = params.gradeProgress !== undefined
      ? params.gradeProgress
      : params.desiredBonus !== undefined
        ? Math.max(0, (organic + params.desiredBonus) - params.stripes * stripeEvery)
        : 0;
    const resolved = resolveBeltStartAndBonus(organic, params.stripes, stripeEvery, effectiveGradeProgress);
    attendanceCountAtBeltStart = resolved.attendanceCountAtBeltStart;
    attendanceCountBonusToWrite = resolved.attendanceCountBonus;
  }

  await db.collection(COLLECTIONS.users).doc(params.targetUserId).update({
    belt: params.belt,
    grade: params.grade,
    stripes: params.stripes,
    ...(attendanceCountAtBeltStart !== undefined ? { attendanceCountAtBeltStart } : {}),
    ...(attendanceCountBonusToWrite !== undefined ? { attendanceCountBonus: attendanceCountBonusToWrite } : {}),
    ...(params.hasKidsCategoryField ? { kidsCategory: params.kidsCategory ?? null } : {}),
    ...(beltChanged ? { lastGraduationDateOverride: now } : {}),
    ...(beltChanged || stripeChanged ? { lastStripeDateOverride: now, lastGradeApprovalAt: now } : {}),
    updatedAt: now,
  });

  if (beltChanged || stripeChanged) {
    await db.collection(COLLECTIONS.graduations).doc().set({
      academyId: params.targetUser.academyId,
      userId: params.targetUserId,
      previousBelt: params.targetUser.belt,
      previousStripes: params.targetUser.stripes,
      newBelt: params.belt,
      newStripes: params.stripes,
      attendanceCount: params.targetUser.attendanceCount,
      promotedAt: now,
      ruleVersion: params.ruleVersion ?? 1,
      reason: 'manual_progression',
    });
  }

  return now;
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
  const findOtherPending = (docs: FirebaseFirestore.QueryDocumentSnapshot[]) =>
    docs
      .map((doc) => ({ id: doc.id, data: doc.data() as JoinRequestDoc }))
      .find((entry) =>
        entry.data.status === 'pending'
        && entry.id !== params.excludeRequestId
        && (!params.excludeUserId || entry.data.authUid !== params.excludeUserId),
      );
  const existingRequestByEmail = findOtherPending(joinRequestsByEmail.docs);
  const existingRequestByCpf = findOtherPending(joinRequestsByCpf.docs);

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
    !existingRequestByEmail,
    'already-exists',
    'Ja existe uma solicitacao pendente usando este e-mail.',
  );
  assertCondition(
    !existingRequestByCpf,
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

async function updateAuthUserSafe(
  uid: string,
  patch: { displayName: string; email?: string; password?: string },
): Promise<void> {
  try {
    await auth.updateUser(uid, patch);
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';

    if (code === 'auth/email-already-exists') {
      assertCondition(false, 'already-exists', 'Ja existe uma conta usando este e-mail.');
    }
    if (code === 'auth/invalid-email') {
      assertCondition(false, 'invalid-argument', 'E-mail invalido.');
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
  const recipientIds = [...new Set(params.recipients)];

  const userSnaps = await Promise.all(
    recipientIds.map((uid) => db.collection(COLLECTIONS.users).doc(uid).get()),
  );

  const recipientTokens = new Map<string, string[]>();
  const allTokens: string[] = [];
  for (let i = 0; i < recipientIds.length; i++) {
    const uid = recipientIds[i];
    const tokens = (userSnaps[i].data() as UserDoc | undefined)?.fcmTokens ?? [];
    recipientTokens.set(uid, tokens);
    allTokens.push(...tokens);
  }

  const batch = db.batch();
  for (const recipientUserId of recipientIds) {
    const tokens = recipientTokens.get(recipientUserId) ?? [];
    const notificationRef = db.collection(COLLECTIONS.notifications).doc();
    const notification: NotificationDoc = {
      academyId: params.academyId,
      title: params.title,
      body: params.body,
      channel: params.channel,
      kind: params.kind,
      status: tokens.length > 0 ? 'queued' : 'stored',
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

  if (allTokens.length > 0) {
    try {
      const chunks: string[][] = [];
      for (let i = 0; i < allTokens.length; i += 500) {
        chunks.push(allTokens.slice(i, i + 500));
      }
      for (const tokenChunk of chunks) {
        await messaging.sendEachForMulticast({
          tokens: tokenChunk,
          notification: { title: params.title, body: params.body },
          data: params.data,
        });
      }
    } catch {
      // Push delivery failure is non-fatal; notifications are persisted in Firestore
    }
  }
}

async function listApproversForAcademy(academyId: string): Promise<string[]> {
  const [academyUsers, superadmins] = await Promise.all([
    db.collection(COLLECTIONS.users).where('academyId', '==', academyId).get(),
    db.collection(COLLECTIONS.users).where('role', '==', 'superadmin').get(),
  ]);

  const recipients = new Set<string>();

  for (const doc of academyUsers.docs) {
    const user = doc.data() as UserDoc;
    if (user.role === 'professor' || user.role === 'admin') {
      recipients.add(doc.id);
    }
  }

  for (const doc of superadmins.docs) {
    recipients.add(doc.id);
  }

  return [...recipients];
}

function resolveJoinRequestProfile(params: {
  joinRequest: JoinRequestDoc;
  belt?: string;
  grade?: number;
}): {
  belt: string;
  grade: number;
  kidsCategory?: JoinRequestDoc['kidsCategory'];
} {
  const belt = normalizeBeltId(params.belt ?? params.joinRequest.requestedBelt);
  const grade = Math.max(0, Math.floor(params.grade ?? params.joinRequest.requestedGrade));
  const kidsCategory = params.joinRequest.kidsCategory ?? inferKidsCategoryFromBirthDate(params.joinRequest.birthDate);

  assertCondition(!(kidsCategory && isAdultOnlyBelt(belt)), 'invalid-argument', 'Alunos kids nao podem iniciar com faixas adultas.');
  assertCondition(!(!kidsCategory && isKidsOnlyBelt(belt)), 'invalid-argument', 'Alunos adultos nao podem iniciar com faixas kids.');

  return {
    belt,
    grade,
    kidsCategory,
  };
}

function buildStudentUserDoc(
  joinRequest: JoinRequestDoc,
  now: Timestamp,
  approvedProfile: {
    belt: string;
    grade: number;
    kidsCategory?: JoinRequestDoc['kidsCategory'];
  },
): UserDoc {
  const beltCtx = { birthDate: joinRequest.birthDate, kidsCategory: approvedProfile.kidsCategory };
  const maxStripes = resolveMaxStripesForBelt(approvedProfile.belt, beltCtx);
  const approvedGrade = Math.min(maxStripes, Math.max(0, Math.floor(approvedProfile.grade)));
  // Aluno que entra ja com grau precisa nascer com marco+bonus posicionados; senao total=0 < piso
  // do grau -> isManuallyPlaced e as aulas reais futuras vazam como progresso do grau errado.
  const stripeEvery = resolveStripeEveryForBelt(approvedProfile.belt, beltCtx);
  const { attendanceCountAtBeltStart, attendanceCountBonus } = resolveBeltStartAndBonus(0, approvedGrade, stripeEvery, 0);

  return {
    academyId: joinRequest.academyId,
    memberships: [joinRequest.academyId],
    firstName: joinRequest.firstName,
    lastName: joinRequest.lastName,
    displayName: joinRequest.displayName,
    email: joinRequest.email,
    cpf: joinRequest.cpf,
    phone: joinRequest.phone,
    birthDate: joinRequest.birthDate,
    kidsCategory: approvedProfile.kidsCategory,
    isCompetitor: joinRequest.isCompetitor,
    role: 'student',
    status: 'active',
    belt: approvedProfile.belt,
    stripes: approvedGrade,
    grade: approvedGrade,
    attendanceCount: 0,
    attendanceCountAtBeltStart,
    attendanceCountBonus,
    qrCheckinsCount: 0,
    currentStreak: 0,
    longestStreak: 0,
    competitionPoints: 0,
    missionPoints: 0,
    rankingPoints: 0,
    beltPromotions: 0,
    nextStripeAttendanceTarget: null,
    nextBeltAttendanceTarget: null,
    currentStripeProgress: 0,
    classesToNextStripe: 0,
    currentBeltProgress: 0,
    totalClassesToNextBelt: 0,
    fcmTokens: [],
    createdAt: now,
    updatedAt: now,
  };
}

async function listActiveSignupAcademies(): Promise<SignupAcademySummary[]> {
  const snapshot = await db.collection(COLLECTIONS.academies).get();

  return snapshot.docs
    .map((doc) => {
      const academy = doc.data() as Partial<AcademyDoc>;
      return {
        academyId: academy.id ?? doc.id,
        name: academy.name ?? 'Unidade sem nome',
        timezone: academy.timezone ?? 'America/Sao_Paulo',
        status: academy.status ?? 'active',
      };
    })
    .filter((academy) => academy.status === 'active')
    .sort((left, right) => left.name.localeCompare(right.name, 'pt-BR'))
    .map(({ academyId, name, timezone }) => ({
      academyId,
      name,
      timezone,
    }));
}

export const getPublicSignupAcademies = onRequest(publicRequestOptions, async (request, response) => {
  if (request.method !== 'GET') {
    response.set('Allow', 'GET');
    response.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const academies = await listActiveSignupAcademies();
  response.status(200).json({ academies });
});

export const listSignupAcademies = onCall(callableOptions, async () => {
  return listActiveSignupAcademies();
});

const MAX_SIGNUP_ACADEMIES = 5;

function readAcademyIdsPayload(data: unknown): string[] {
  const record = (data as Record<string, unknown> | null) ?? {};
  const rawList = record.academyIds;
  const ids: string[] = [];

  if (Array.isArray(rawList)) {
    for (const entry of rawList) {
      if (typeof entry === 'string' && entry.trim().length > 0) {
        ids.push(entry.trim());
      }
    }
  }

  const single = record.academyId;
  if (typeof single === 'string' && single.trim().length > 0) {
    ids.push(single.trim());
  }

  const unique = [...new Set(ids)];
  assertCondition(unique.length > 0, 'invalid-argument', 'Selecione ao menos uma unidade.');
  assertCondition(
    unique.length <= MAX_SIGNUP_ACADEMIES,
    'invalid-argument',
    `Voce pode solicitar entrada em no maximo ${MAX_SIGNUP_ACADEMIES} unidades por vez.`,
  );
  return unique;
}

export const submitStudentSignup = onCall(callableOptions, async (request) => {
  const academyIds = readAcademyIdsPayload(request.data);
  const email = normalizeEmail(requiredString(request.data, 'email'));
  const password = requiredString(request.data, 'password');
  assertCondition(
    password.length >= 8 && /[0-9]/.test(password),
    'invalid-argument',
    'A senha deve ter no mínimo 8 caracteres e conter pelo menos um número.',
  );
  const firstName = requiredString(request.data, 'firstName');
  const lastName = requiredString(request.data, 'lastName');
  const cpf = assertValidCpf(requiredString(request.data, 'cpf'));
  const birthDate = requiredString(request.data, 'birthDate');
  const phone = optionalString(request.data, 'phone');
  const isCompetitor = optionalBoolean(request.data, 'isCompetitor', false);
  const belt = normalizeBeltId(requiredString(request.data, 'belt'));
  const grade = Math.max(0, Math.floor(requiredNumber(request.data, 'grade')));
  const kidsCategory = inferKidsCategoryFromBirthDate(birthDate);

  assertCondition(!(kidsCategory && isAdultOnlyBelt(belt)), 'invalid-argument', 'Alunos kids nao podem iniciar com faixas adultas.');
  assertCondition(!(!kidsCategory && isKidsOnlyBelt(belt)), 'invalid-argument', 'Alunos adultos nao podem iniciar com faixas kids.');

  const academySnaps = await Promise.all(
    academyIds.map((id) => db.collection(COLLECTIONS.academies).doc(id).get()),
  );
  const academies: Array<{ id: string; data: AcademyDoc }> = [];
  for (let i = 0; i < academySnaps.length; i += 1) {
    const snap = academySnaps[i];
    assertCondition(snap.exists, 'not-found', `Unidade ${academyIds[i]} nao encontrada.`);
    const academy = snap.data() as AcademyDoc;
    assertCondition(
      academy.status === 'active',
      'failed-precondition',
      `A unidade ${academy.name} nao esta aceitando novos cadastros.`,
    );
    academies.push({ id: academyIds[i], data: academy });
  }

  await ensureUniqueIdentity({ email, cpf });
  assertCondition(!(await emailExists(email)), 'already-exists', 'Ja existe uma conta usando este e-mail.');

  const displayName = `${firstName} ${lastName}`.trim();
  const now = Timestamp.now();
  const requestGroupId = academies.length > 1 ? db.collection(COLLECTIONS.joinRequests).doc().id : undefined;
  let createdAuthUid = '';
  const createdJoinRequestIds: string[] = [];

  try {
    const createdUser = await auth.createUser({
      email,
      password,
      displayName,
      disabled: true,
    });
    createdAuthUid = createdUser.uid;

    const batch = db.batch();
    const createdRequests: Array<{ requestId: string; academyId: string; academyName: string }> = [];

    for (const academy of academies) {
      const joinRequestRef = db.collection(COLLECTIONS.joinRequests).doc();
      createdJoinRequestIds.push(joinRequestRef.id);
      const joinRequest: JoinRequestDoc = {
        academyId: academy.id,
        academyName: academy.data.name,
        authUid: createdAuthUid,
        email,
        cpf,
        firstName,
        lastName,
        displayName,
        phone: phone ?? undefined,
        birthDate,
        kidsCategory,
        isCompetitor,
        requestedBelt: belt,
        requestedGrade: grade,
        status: 'pending',
        origin: 'signup',
        ...(requestGroupId ? { requestGroupId } : {}),
        createdAt: now,
        updatedAt: now,
      };
      batch.set(joinRequestRef, joinRequest);
      createdRequests.push({
        requestId: joinRequestRef.id,
        academyId: academy.id,
        academyName: academy.data.name,
      });
    }

    await batch.commit();

    for (const created of createdRequests) {
      const recipients = await listApproversForAcademy(created.academyId);
      await createNotifications({
        academyId: created.academyId,
        recipients,
        createdBy: createdAuthUid,
        title: 'Novo pedido de entrada',
        body: `${displayName} solicitou cadastro na unidade ${created.academyName}.`,
        channel: 'system',
        kind: 'join_request',
        actionRef: created.requestId,
        data: {
          requestId: created.requestId,
          academyId: created.academyId,
          userName: displayName,
        },
      });
    }

    return {
      authUid: createdAuthUid,
      requestGroupId: requestGroupId ?? null,
      requests: createdRequests.map((entry) => ({
        requestId: entry.requestId,
        academyId: entry.academyId,
        status: 'pending' as const,
      })),
    };
  } catch (error) {
    if (createdAuthUid) {
      try {
        await auth.deleteUser(createdAuthUid);
      } catch {
        // Keep the original error surface for the caller.
      }
    }
    for (const requestId of createdJoinRequestIds) {
      try {
        await db.collection(COLLECTIONS.joinRequests).doc(requestId).delete();
      } catch {
        // Keep the original error surface for the caller.
      }
    }

    throw error;
  }
});

export const createAcademy = onCall(callableOptions, async (request) => {
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
    const nextRole: Role = owner.role === 'superadmin' ? owner.role : 'professor';
    const nextAcademyId = normalizeScopedAcademyId(nextRole, academyRef.id);

    await db.collection(COLLECTIONS.users).doc(ownerUserId).update({
      academyId: nextAcademyId,
      role: nextRole,
      updatedAt: now,
    });
    await setClaims(ownerUserId, nextRole, nextAcademyId);
  }

  return {
    academyId: academyRef.id,
    name,
    slug,
  };
});

export const createUserWithRole = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'superadmin');
  const firstName = requiredString(request.data, 'firstName');
  const lastName = requiredString(request.data, 'lastName');
  const email = normalizeEmail(requiredString(request.data, 'email'));
  const password = optionalString(request.data, 'password');
  const requestedRole = requiredString(request.data, 'role') as Role;
  const academyId = normalizeScopedAcademyId(
    requestedRole,
    optionalString(request.data, 'academyId') ?? actor.academyId,
  );
  const phone = optionalString(request.data, 'phone');
  const cpf = optionalString(request.data, 'cpf');
  const birthDate = optionalString(request.data, 'birthDate');
  const isCompetitor = optionalBoolean(request.data, 'isCompetitor', false);
  const belt = optionalString(request.data, 'belt') ?? 'white';
  const beltCtx = { birthDate };
  const maxStripes = resolveMaxStripesForBelt(belt, beltCtx);
  const grade = Math.min(maxStripes, Math.max(0, Math.floor(optionalNumber(request.data, 'grade') ?? 0)));
  const stripes = Math.min(maxStripes, Math.max(0, Math.floor(optionalNumber(request.data, 'stripes') ?? grade)));
  const stripeEvery = resolveStripeEveryForBelt(belt, beltCtx);
  // Mantem a invariante marco+bonus mesmo na criacao de staff com grau (>0).
  const { attendanceCountAtBeltStart, attendanceCountBonus } = resolveBeltStartAndBonus(0, stripes, stripeEvery, 0);
  const plainPassword = optionalString(request.data, 'plainPassword');

  assertCondition(ROLE_ORDER.includes(requestedRole), 'invalid-argument', 'Role invalida.');
  assertCondition(requestedRole !== 'student', 'invalid-argument', 'Cadastros de aluno devem usar o fluxo de solicitacao.');
  assertCondition(requestedRole !== 'admin', 'invalid-argument', 'Use professor no lugar de admin. Este perfil deixou de existir.');
  assertCondition(
    requestedRole === 'superadmin' || academyId.length > 0,
    'invalid-argument',
    'Selecione uma unidade para este acesso.',
  );
  if (requestedRole !== 'superadmin') {
    await assertAcademyExists(academyId);
  }
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
    attendanceCountAtBeltStart,
    attendanceCountBonus,
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
    ...(plainPassword ? { plainPassword } : {}),
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

export const approveJoinRequest = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  assertJoinRequestApproverRole(actor.role);

  const requestId = requiredString(request.data, 'requestId');
  const approvedBelt = optionalString(request.data, 'belt');
  const approvedGrade = optionalNumber(request.data, 'grade');
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
  const approvedProfile = resolveJoinRequestProfile({
    joinRequest,
    belt: approvedBelt,
    grade: approvedGrade,
  });
  const userRef = db.collection(COLLECTIONS.users).doc(joinRequest.authUid);
  const existingUserSnap = await userRef.get();
  const isFirstApproval = !existingUserSnap.exists;
  const studentNotificationId = db.collection(COLLECTIONS.notifications).doc().id;
  const batch = db.batch();

  if (isFirstApproval) {
    const userDoc = buildStudentUserDoc(joinRequest, now, approvedProfile);
    batch.set(userRef, userDoc);
  } else {
    batch.update(userRef, {
      memberships: FieldValue.arrayUnion(joinRequest.academyId),
      updatedAt: now,
    });
  }

  batch.update(joinRequestRef, {
    status: 'approved',
    resolvedAt: now,
    resolvedBy: actor.uid,
    resolvedByRole: actor.role,
    approvedBelt: approvedProfile.belt,
    approvedGrade: approvedProfile.grade,
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

  if (isFirstApproval) {
    await setClaims(joinRequest.authUid, 'student', joinRequest.academyId);
    await auth.updateUser(joinRequest.authUid, {
      disabled: false,
      displayName: joinRequest.displayName,
    });
  }
  await syncUserDerivedState(joinRequest.authUid, joinRequest.academyId);

  return {
    requestId,
    userId: joinRequest.authUid,
    status: 'approved' as const,
  };
});

export const rejectJoinRequest = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  assertJoinRequestApproverRole(actor.role);

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

  const now = Timestamp.now();
  await joinRequestRef.update({
    status: 'rejected',
    resolvedAt: now,
    resolvedBy: actor.uid,
    resolvedByRole: actor.role,
    updatedAt: now,
  });

  const [existingUserSnap, otherPendingSnap] = await Promise.all([
    db.collection(COLLECTIONS.users).doc(joinRequest.authUid).get(),
    db
      .collection(COLLECTIONS.joinRequests)
      .where('authUid', '==', joinRequest.authUid)
      .where('status', '==', 'pending')
      .limit(1)
      .get(),
  ]);

  const shouldDeleteAuth = !existingUserSnap.exists && otherPendingSnap.empty;

  if (shouldDeleteAuth) {
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
  }

  return {
    requestId,
    status: 'rejected' as const,
  };
});

export const assignUserToAcademy = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  const targetUserId = requiredString(request.data, 'userId');
  const academyId = requiredString(request.data, 'academyId');
  const targetUser = await getUserDoc(targetUserId);

  assertCondition(
    actor.role === 'superadmin' || academyId === actor.academyId,
    'permission-denied',
    'Professor so pode vincular usuarios a propria unidade.',
  );
  assertCondition(
    actor.role === 'superadmin' || targetUser.role !== 'superadmin',
    'permission-denied',
    'Professor nao pode alterar o vinculo de um superadmin.',
  );
  assertCondition(
    targetUser.role !== 'superadmin',
    'failed-precondition',
    'Superadmin nao pode ser vinculado a uma unidade.',
  );
  await assertAcademyExists(academyId);

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

export const setUserRole = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  const targetUserId = requiredString(request.data, 'userId');
  const role = requiredString(request.data, 'role') as Role;
  const targetUser = await getUserDoc(targetUserId);

  assertCondition(ROLE_ORDER.includes(role), 'invalid-argument', 'Role invalida.');
  assertCondition(role !== 'admin', 'invalid-argument', 'Use professor no lugar de admin. Este perfil deixou de existir.');
  assertCondition(
    actor.role === 'superadmin' || role !== 'superadmin',
    'permission-denied',
    'Apenas superadmin pode promover outro superadmin.',
  );
  assertCondition(
    actor.role === 'superadmin' || targetUser.role !== 'superadmin',
    'permission-denied',
    'Professor nao pode alterar o perfil de um superadmin.',
  );
  assertCondition(
    actor.role === 'superadmin' || targetUser.academyId === actor.academyId,
    'permission-denied',
    'Professor so pode alterar perfis da propria unidade.',
  );
  const academyId = normalizeScopedAcademyId(role, targetUser.academyId);
  assertCondition(
    role === 'superadmin' || academyId.length > 0,
    'failed-precondition',
    'Vincule este usuario a uma unidade antes de definir este perfil.',
  );
  if (role !== 'superadmin') {
    await assertAcademyExists(academyId);
  }

  await db.collection(COLLECTIONS.users).doc(targetUserId).update({
    role,
    academyId,
    updatedAt: Timestamp.now(),
  });
  await setClaims(targetUserId, role, academyId);

  return {
    userId: targetUserId,
    role,
  };
});

export const updateOwnStudentProfile = onCall(callableOptions, async (request) => {
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
  await syncUserDerivedState(actor.uid, actor.user.academyId);

  return {
    userId: actor.uid,
    displayName,
    cpf,
    isCompetitor,
  };
});

export const syncOwnUserEmail = onCall(callableOptions, async (request) => {
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

export const updateStudentBeltGrade = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  assertProfessorOrSuperadmin(actor.role);

  const data = (request.data as Record<string, unknown> | null) ?? {};
  const targetUserId = requiredString(request.data, 'userId');
  const belt = normalizeBeltId(requiredString(request.data, 'belt'));
  const grade = Math.max(0, Math.floor(requiredNumber(request.data, 'grade')));
  const stripes = Math.max(0, Math.floor(optionalNumber(request.data, 'stripes') ?? grade));
  const kidsCategory = optionalString(request.data, 'kidsCategory');
  const hasKidsCategoryField = Object.prototype.hasOwnProperty.call(data, 'kidsCategory');
  const gradeProgressRaw = optionalNumber(request.data, 'gradeProgress');
  const gradeProgress = gradeProgressRaw != null
    ? Math.max(0, Math.floor(gradeProgressRaw))
    : undefined;
  const targetUser = await getUserDoc(targetUserId);

  assertCondition(targetUser.role === 'student', 'invalid-argument', 'Somente alunos podem ter faixa ou grau alterados.');
  assertCondition(
    actor.role === 'superadmin' || targetUser.academyId === actor.academyId,
    'permission-denied',
    'Voce so pode alterar alunos da sua unidade.',
  );

  await applyStudentBeltGradeUpdate({
    targetUserId,
    targetUser,
    belt,
    grade,
    stripes,
    kidsCategory,
    hasKidsCategoryField,
    gradeProgress,
  });

  await syncUserDerivedState(targetUserId, targetUser.academyId);

  return {
    userId: targetUserId,
    belt,
    grade,
    stripes,
    kidsCategory: hasKidsCategoryField ? (kidsCategory ?? null) : targetUser.kidsCategory ?? null,
  };
});

export const setStudentAttendanceBonus = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  assertProfessorOrSuperadmin(actor.role);

  const targetUserId = requiredString(request.data, 'userId');
  const attendanceCountBonus = Math.max(0, Math.floor(requiredNumber(request.data, 'attendanceCountBonus')));
  const targetUser = await getUserDoc(targetUserId);

  assertCondition(targetUser.role === 'student', 'invalid-argument', 'Somente alunos podem ter aulas ajustadas.');
  assertCondition(
    actor.role === 'superadmin' || targetUser.academyId === actor.academyId,
    'permission-denied',
    'Voce so pode alterar alunos da sua unidade.',
  );

  // Reacerta marco + bonus JUNTOS: gravar o bonus isolado dessincronizaria o marco e poderia
  // jogar o aluno em "colocacao manual" (aulas reais vazando como progresso do grau). Derivamos
  // o gradeProgress a partir de organic+novoBonus e deixamos o helper posicionar marco e bonus.
  const beltCtx = { birthDate: targetUser.birthDate, kidsCategory: targetUser.kidsCategory };
  const maxStripes = resolveMaxStripesForBelt(targetUser.belt, beltCtx);
  const stripes = Math.min(maxStripes, Math.max(0, Math.floor(targetUser.stripes ?? 0)));
  const stripeEvery = resolveStripeEveryForBelt(targetUser.belt, beltCtx);
  const attendanceQuery = db
    .collection(COLLECTIONS.attendances)
    .where('academyId', '==', targetUser.academyId)
    .where('userId', '==', targetUserId);
  const [totalSnap, nonCountingSnap] = await Promise.all([
    attendanceQuery.count().get(),
    attendanceQuery.where('countsAsAttendance', '==', false).count().get(),
  ]);
  const organic = totalSnap.data().count - nonCountingSnap.data().count;
  const gradeProgress = Math.max(0, (organic + attendanceCountBonus) - stripes * stripeEvery);
  const resolved = resolveBeltStartAndBonus(organic, stripes, stripeEvery, gradeProgress);

  const now = Timestamp.now();
  await db.collection(COLLECTIONS.users).doc(targetUserId).update({
    attendanceCountBonus: resolved.attendanceCountBonus,
    attendanceCountAtBeltStart: resolved.attendanceCountAtBeltStart,
    updatedAt: now,
  });

  await syncUserDerivedState(targetUserId, targetUser.academyId);

  return { userId: targetUserId, attendanceCountBonus: resolved.attendanceCountBonus };
});

export const updateOwnStaffBeltGrade = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  assertProfessorOrSuperadmin(actor.role);

  const data = (request.data as Record<string, unknown> | null) ?? {};
  const belt = normalizeBeltId(requiredString(request.data, 'belt'));
  // Clampa grade/stripes a maxStripes da faixa (a leitura sempre clampa; o marco gravado tem de bater).
  const maxStripes = resolveMaxStripesForBelt(belt, {
    birthDate: actor.user.birthDate,
    kidsCategory: actor.user.kidsCategory,
  });
  const grade = Math.min(maxStripes, Math.max(0, Math.floor(requiredNumber(request.data, 'grade'))));
  const stripes = Math.min(maxStripes, Math.max(0, Math.floor(optionalNumber(request.data, 'stripes') ?? grade)));
  const attendanceCountBonus = Object.prototype.hasOwnProperty.call(data, 'attendanceCountBonus')
    ? Math.max(0, Math.floor(requiredNumber(request.data, 'attendanceCountBonus')))
    : (actor.user.attendanceCountBonus ?? 0);
  const academyId = actor.user.academyId.trim();

  if (academyId.length > 0) {
    // O helper (via desiredBonus) e a UNICA fonte de marco+bonus — sem update de bonus isolado depois.
    await applyStudentBeltGradeUpdate({
      targetUserId: actor.uid,
      targetUser: actor.user,
      belt,
      grade,
      stripes,
      hasKidsCategoryField: false,
      desiredBonus: attendanceCountBonus,
    });

    await syncUserDerivedState(actor.uid, academyId);

    return { userId: actor.uid, belt, grade, stripes, attendanceCountBonus };
  }

  // Staff sem academia nao tem colecao de attendances; o attendanceCount derivado e a fonte.
  const previousAttendanceCount = Math.max(0, Math.floor(actor.user.attendanceCount ?? 0));
  const previousAttendanceCountBonus = Math.max(0, Math.floor(actor.user.attendanceCountBonus ?? 0));
  const organicEquivalent = Math.max(0, previousAttendanceCount - previousAttendanceCountBonus);
  const attendanceCount = organicEquivalent + attendanceCountBonus;
  const stripeEvery = resolveStripeEveryForBelt(belt, {
    birthDate: actor.user.birthDate,
    kidsCategory: actor.user.kidsCategory,
  });
  const gradeProgress = Math.max(0, attendanceCount - stripes * stripeEvery);
  const { attendanceCountAtBeltStart, attendanceCountBonus: bonusToWrite } =
    resolveBeltStartAndBonus(organicEquivalent, stripes, stripeEvery, gradeProgress);
  const progression = resolveProgressionTargets(belt, stripes, attendanceCount, DEFAULT_PROGRESSION_RULES, {
    birthDate: actor.user.birthDate,
    kidsCategory: actor.user.kidsCategory,
    attendanceCountBonus: bonusToWrite,
    attendanceCountAtBeltStart,
  });

  await db.collection(COLLECTIONS.users).doc(actor.uid).update({
    belt,
    grade,
    stripes,
    attendanceCountBonus: bonusToWrite,
    attendanceCountAtBeltStart,
    attendanceCount,
    nextStripeAttendanceTarget: progression.nextStripeAttendanceTarget,
    nextBeltAttendanceTarget: progression.nextBeltAttendanceTarget,
    currentStripeProgress: progression.currentStripeProgress,
    classesToNextStripe: progression.classesToNextStripe,
    currentBeltProgress: progression.currentBeltProgress,
    totalClassesToNextBelt: progression.totalClassesToNextBelt,
    updatedAt: Timestamp.now(),
  });

  return { userId: actor.uid, belt, grade, stripes, attendanceCountBonus: bonusToWrite };
});

export const approveGraduationRequest = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  assertProfessorOrSuperadmin(actor.role);

  const requestId = requiredString(request.data, 'requestId');
  const requestRef = db.collection(COLLECTIONS.graduationRequests).doc(requestId);

  const initialSnap = await requestRef.get();
  assertCondition(initialSnap.exists, 'not-found', 'Pendencia de graduacao nao encontrada.');
  const initialRequest = initialSnap.data() as GraduationApprovalRequestDoc;

  const targetUser = await getUserDoc(initialRequest.userId);
  assertCondition(targetUser.role === 'student', 'invalid-argument', 'Somente alunos podem ter graduacao aprovada.');
  assertCondition(
    targetUser.academyId === initialRequest.academyId,
    'failed-precondition',
    'Aluno e pendencia de graduacao precisam pertencer a mesma academia.',
  );

  const claimTimestamp = Timestamp.now();
  const targetUserRef = db.collection(COLLECTIONS.users).doc(initialRequest.userId);
  const graduationRequest = await db.runTransaction(async (transaction) => {
    const [snap, userSnap] = await Promise.all([
      transaction.get(requestRef),
      transaction.get(targetUserRef),
    ]);
    assertCondition(snap.exists, 'not-found', 'Pendencia de graduacao nao encontrada.');

    const data = snap.data() as GraduationApprovalRequestDoc;
    assertCondition(data.status === 'pending', 'failed-precondition', 'Esta pendencia ja foi resolvida.');
    assertCondition(
      actor.role === 'superadmin' || data.academyId === actor.academyId,
      'permission-denied',
      'Voce so pode aprovar graduacoes da sua unidade.',
    );

    // Gate temporal DENTRO da transacao (le timestamps frescos): so permite uma nova graduacao se o
    // aluno compareceu a pelo menos uma aula desde a ultima. Evita encadear aprovacoes concorrentes
    // sem aula nova. Fallback em lastStripeDateOverride cobre alunos graduados antes deste campo.
    const freshUser = userSnap.data() as UserDoc | undefined;
    const lastApprovalMs = (freshUser?.lastGradeApprovalAt ?? freshUser?.lastStripeDateOverride)?.toMillis?.() ?? null;
    const lastAttendanceMs = freshUser?.lastAttendanceAt?.toMillis?.() ?? null;
    assertCondition(
      lastApprovalMs === null || (lastAttendanceMs !== null && lastAttendanceMs > lastApprovalMs),
      'failed-precondition',
      'Este aluno ja foi graduado recentemente. Aguarde ele completar a proxima aula antes de aprovar a proxima graduacao.',
    );

    transaction.update(requestRef, {
      status: 'approved',
      approvedAt: claimTimestamp,
      approvedBy: actor.uid,
      approvedByRole: actor.role,
      updatedAt: claimTimestamp,
    });
    return data;
  });

  const now = await applyStudentBeltGradeUpdate({
    targetUserId: graduationRequest.userId,
    targetUser,
    belt: graduationRequest.targetBelt,
    grade: graduationRequest.targetStripes,
    stripes: graduationRequest.targetStripes,
    hasKidsCategoryField: false,
    ruleVersion: graduationRequest.ruleVersion,
  });

  await requestRef.update({
    currentBelt: graduationRequest.targetBelt,
    currentStripes: graduationRequest.targetStripes,
    attendanceCount: targetUser.attendanceCount,
    remainingClasses: 0,
    updatedAt: now,
  });

  await syncUserDerivedState(graduationRequest.userId, graduationRequest.academyId, { skipGraduationSync: true });

  return {
    requestId,
    userId: graduationRequest.userId,
    status: 'approved' as const,
  };
});

export const adminUpdateStudentProfile = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  assertProfessorOrSuperadmin(actor.role);

  const data = (request.data as Record<string, unknown> | null) ?? {};
  const targetUserId = requiredString(request.data, 'userId');
  const targetUser = await getUserDoc(targetUserId);

  assertCondition(targetUser.role === 'student', 'invalid-argument', 'Somente alunos podem ter o perfil editado por esta funcao.');
  assertCondition(
    actor.role === 'superadmin' || targetUser.academyId === actor.academyId,
    'permission-denied',
    'Voce so pode editar alunos da sua unidade.',
  );

  const firstName = optionalString(request.data, 'firstName') ?? targetUser.firstName;
  const lastName = optionalString(request.data, 'lastName') ?? targetUser.lastName;
  const phone = data.phone === undefined ? targetUser.phone : (optionalString(request.data, 'phone') ?? null);
  const birthDate = data.birthDate === undefined ? targetUser.birthDate : (optionalString(request.data, 'birthDate') ?? null);
  const cpf = data.cpf === undefined ? targetUser.cpf : assertValidCpf(requiredString(request.data, 'cpf'));
  const isCompetitor = optionalBoolean(request.data, 'isCompetitor', targetUser.isCompetitor ?? false);
  const displayName = `${firstName} ${lastName}`.trim();

  const newEmail = optionalString(request.data, 'email');
  const normalizedEmail = newEmail ? normalizeEmail(newEmail) : undefined;
  const emailChanged = !!normalizedEmail && normalizedEmail !== targetUser.email;

  if (emailChanged || cpf !== targetUser.cpf) {
    await ensureUniqueIdentity({
      email: emailChanged ? normalizedEmail! : targetUser.email,
      cpf,
      excludeUserId: targetUserId,
    });
  }

  // Atualiza o Auth antes do Firestore: ele valida formato/unicidade do e-mail e lanca
  // erro antes de gravarmos qualquer coisa, evitando deixar Auth e Firestore fora de sincronia.
  const authPatch: { displayName: string; email?: string } = { displayName };
  if (emailChanged) authPatch.email = normalizedEmail!;
  await updateAuthUserSafe(targetUserId, authPatch);

  const now = Timestamp.now();
  await db.collection(COLLECTIONS.users).doc(targetUserId).update({
    firstName,
    lastName,
    displayName,
    cpf,
    phone: phone ?? null,
    birthDate: birthDate ?? null,
    isCompetitor,
    ...(emailChanged ? { email: normalizedEmail } : {}),
    updatedAt: now,
  });
  await syncUserDerivedState(targetUserId, targetUser.academyId);

  return { userId: targetUserId, displayName };
});

export const adminUpdateStudentTimeline = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  assertProfessorOrSuperadmin(actor.role);

  const targetUserId = requiredString(request.data, 'userId');
  const targetUser = await getUserDoc(targetUserId);

  assertCondition(targetUser.role === 'student', 'invalid-argument', 'Somente alunos podem ter a linha do tempo editada.');
  assertCondition(
    actor.role === 'superadmin' || targetUser.academyId === actor.academyId,
    'permission-denied',
    'Voce so pode editar alunos da sua unidade.',
  );

  const data = (request.data as Record<string, unknown> | null) ?? {};
  const updateFields: Record<string, unknown> = { updatedAt: Timestamp.now() };

  if (data.trainingStartDate !== undefined) {
    const raw = optionalString(request.data, 'trainingStartDate');
    updateFields.trainingStartDate = raw ? Timestamp.fromDate(new Date(raw)) : null;
  }

  if (data.lastGraduationDateOverride !== undefined) {
    const raw = optionalString(request.data, 'lastGraduationDateOverride');
    updateFields.lastGraduationDateOverride = raw ? Timestamp.fromDate(new Date(raw)) : null;
  }

  if (data.lastStripeDateOverride !== undefined) {
    const raw = optionalString(request.data, 'lastStripeDateOverride');
    updateFields.lastStripeDateOverride = raw ? Timestamp.fromDate(new Date(raw)) : null;
  }

  await db.collection(COLLECTIONS.users).doc(targetUserId).update(updateFields);
  await syncUserDerivedState(targetUserId, targetUser.academyId);

  return { userId: targetUserId };
});

export const validateSessionAccess = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'student');

  assertCondition(
    actor.user.status !== 'suspended',
    'permission-denied',
    'user-suspended',
  );

  const tokenRole = typeof request.auth?.token?.role === 'string'
    ? request.auth.token.role
    : '';
  const tokenAcademyId = typeof request.auth?.token?.academyId === 'string'
    ? request.auth.token.academyId
    : '';
  const role = normalizeManagedRole(actor.role);
  const academyId = normalizeScopedAcademyId(role, actor.academyId);
  const needsUserNormalization = actor.user.role !== role || actor.academyId !== academyId;
  const claimsUpdated = needsUserNormalization || tokenRole !== role || tokenAcademyId !== academyId;

  if (needsUserNormalization) {
    await db.collection(COLLECTIONS.users).doc(actor.uid).update({
      role,
      academyId,
      updatedAt: Timestamp.now(),
    });
  }

  if (claimsUpdated) {
    await setClaims(actor.uid, role, academyId);
  }

  return {
    uid: actor.uid,
    academyId,
    role,
    displayName: actor.user.displayName,
    belt: actor.user.belt,
    stripes: actor.user.stripes,
    claimsUpdated,
  };
});

export const deactivateStudent = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  assertProfessorOrSuperadmin(actor.role);

  const targetUserId = requiredString(request.data, 'userId');
  const targetUser = await getUserDoc(targetUserId);

  assertCondition(targetUser.role === 'student', 'invalid-argument', 'Somente alunos podem ser desativados.');
  assertCondition(
    actor.role === 'superadmin' || targetUser.academyId === actor.academyId,
    'permission-denied',
    'Voce so pode desativar alunos da sua unidade.',
  );
  assertCondition(targetUser.status !== 'suspended', 'failed-precondition', 'Este aluno ja esta desativado.');

  const now = Timestamp.now();
  await db.collection(COLLECTIONS.users).doc(targetUserId).update({
    status: 'suspended',
    updatedAt: now,
  });

  const pendingGraduations = await db
    .collection(COLLECTIONS.graduationRequests)
    .where('userId', '==', targetUserId)
    .where('status', '==', 'pending')
    .get();

  if (!pendingGraduations.empty) {
    const batch = db.batch();
    pendingGraduations.docs.forEach((docSnap) => {
      batch.update(docSnap.ref, { status: 'superseded', updatedAt: now });
    });
    await batch.commit();
  }

  return { userId: targetUserId, status: 'suspended' as const };
});

export const requestReactivation = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'student');
  assertCondition(actor.user.status === 'suspended', 'failed-precondition', 'Sua conta nao esta desativada.');

  const existingPending = await db
    .collection(COLLECTIONS.reactivationRequests)
    .where('userId', '==', actor.uid)
    .where('status', '==', 'pending')
    .limit(1)
    .get();

  assertCondition(existingPending.empty, 'already-exists', 'Voce ja tem uma solicitacao de reativacao pendente.');

  const now = Timestamp.now();
  const requestRef = db.collection(COLLECTIONS.reactivationRequests).doc();
  const reactivationRequest: ReactivationRequestDoc = {
    academyId: actor.user.academyId,
    userId: actor.uid,
    userDisplayName: actor.user.displayName,
    userEmail: actor.user.email,
    status: 'pending',
    requestedAt: now,
    createdAt: now,
    updatedAt: now,
  };
  await requestRef.set(reactivationRequest);

  const recipients = await listApproversForAcademy(actor.user.academyId);
  await createNotifications({
    academyId: actor.user.academyId,
    recipients,
    createdBy: actor.uid,
    title: 'Solicitacao de reativacao',
    body: `${actor.user.displayName} solicitou a reativacao da conta.`,
    channel: 'system',
    kind: 'reactivation_request',
    actionRef: requestRef.id,
    data: {
      requestId: requestRef.id,
      userId: actor.uid,
      academyId: actor.user.academyId,
    },
  });

  return { requestId: requestRef.id, status: 'pending' as const };
});

export const resolveReactivationRequest = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  assertProfessorOrSuperadmin(actor.role);

  const requestId = requiredString(request.data, 'requestId');
  const approve = request.data && typeof (request.data as Record<string, unknown>).approve === 'boolean'
    ? (request.data as Record<string, unknown>).approve as boolean
    : true;

  const requestRef = db.collection(COLLECTIONS.reactivationRequests).doc(requestId);
  const requestSnap = await requestRef.get();
  assertCondition(requestSnap.exists, 'not-found', 'Solicitacao de reativacao nao encontrada.');

  const reactivationRequest = requestSnap.data() as ReactivationRequestDoc;
  assertCondition(reactivationRequest.status === 'pending', 'failed-precondition', 'Esta solicitacao ja foi processada.');
  assertCondition(
    actor.role === 'superadmin' || reactivationRequest.academyId === actor.academyId,
    'permission-denied',
    'Voce so pode resolver solicitacoes da sua unidade.',
  );

  const now = Timestamp.now();
  const newStatus = approve ? 'approved' : 'rejected';

  await requestRef.update({
    status: newStatus,
    resolvedAt: now,
    resolvedBy: actor.uid,
    resolvedByRole: actor.role,
    updatedAt: now,
  });

  if (approve) {
    await db.collection(COLLECTIONS.users).doc(reactivationRequest.userId).update({
      status: 'active',
      updatedAt: now,
    });
  }

  await createNotifications({
    academyId: reactivationRequest.academyId,
    recipients: [reactivationRequest.userId],
    createdBy: actor.uid,
    title: approve ? 'Conta reativada' : 'Solicitacao de reativacao rejeitada',
    body: approve
      ? 'Sua conta foi reativada. Voce ja pode acessar o aplicativo.'
      : 'Sua solicitacao de reativacao foi negada. Entre em contato com seu professor.',
    channel: 'system',
    kind: 'reactivation_request',
    actionRef: requestId,
    data: { requestId, approved: approve ? 'true' : 'false' },
  });

  return { requestId, status: newStatus };
});

export const reactivateStudent = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  assertProfessorOrSuperadmin(actor.role);

  const targetUserId = requiredString(request.data, 'userId');
  const targetUser = await getUserDoc(targetUserId);

  assertCondition(targetUser.role === 'student', 'invalid-argument', 'Esta funcao so reativa alunos.');
  assertCondition(targetUser.status === 'suspended', 'failed-precondition', 'Este aluno ja esta ativo.');
  assertCondition(
    actor.role === 'superadmin' || targetUser.academyId === actor.academyId,
    'permission-denied',
    'Voce so pode reativar alunos da sua unidade.',
  );

  const now = Timestamp.now();
  await db.collection(COLLECTIONS.users).doc(targetUserId).update({
    status: 'active',
    updatedAt: now,
  });

  const pendingRequestsSnap = await db
    .collection(COLLECTIONS.reactivationRequests)
    .where('userId', '==', targetUserId)
    .where('status', '==', 'pending')
    .get();

  const batch = db.batch();
  for (const doc of pendingRequestsSnap.docs) {
    batch.update(doc.ref, { status: 'approved', resolvedAt: now, resolvedBy: actor.uid, resolvedByRole: actor.role, updatedAt: now });
  }
  await batch.commit();

  return { userId: targetUserId, status: 'active' };
});

export const adminUpdateInstructorProfile = onCall(callableOptions, async (request) => {
  await getRequestContext(request, 'superadmin');

  const targetUserId = requiredString(request.data, 'userId');
  const targetUser = await getUserDoc(targetUserId);

  assertCondition(
    targetUser.role === 'professor' || targetUser.role === 'superadmin',
    'invalid-argument',
    'Esta funcao so edita perfis de instrutores.',
  );

  const firstName = optionalString(request.data, 'firstName') ?? targetUser.firstName;
  const lastName = optionalString(request.data, 'lastName') ?? targetUser.lastName;
  const phone = optionalString(request.data, 'phone');
  const belt = optionalString(request.data, 'belt') ?? targetUser.belt;
  const grade = optionalNumber(request.data, 'grade') ?? targetUser.grade;
  const newEmail = optionalString(request.data, 'email');
  const normalizedEmail = newEmail ? normalizeEmail(newEmail) : undefined;
  const emailChanged = !!normalizedEmail && normalizedEmail !== targetUser.email;
  const newPassword = optionalString(request.data, 'newPassword');
  const plainPassword = optionalString(request.data, 'plainPassword');
  const displayName = `${firstName} ${lastName}`.trim();

  if (emailChanged) {
    await ensureUniqueIdentity({
      email: normalizedEmail!,
      cpf: targetUser.cpf,
      excludeUserId: targetUserId,
    });
  }

  // Atualiza o Auth antes do Firestore para validar o e-mail e manter as duas fontes em sincronia.
  const authPatch: { displayName: string; email?: string; password?: string } = { displayName };
  if (emailChanged) authPatch.email = normalizedEmail!;
  if (newPassword) authPatch.password = newPassword;
  await updateAuthUserSafe(targetUserId, authPatch);

  const now = Timestamp.now();
  const firestorePatch: Record<string, unknown> = {
    firstName,
    lastName,
    displayName,
    belt,
    grade,
    updatedAt: now,
  };

  if (phone !== undefined) firestorePatch.phone = phone || null;
  if (emailChanged) firestorePatch.email = normalizedEmail;
  if (plainPassword !== undefined) firestorePatch.plainPassword = plainPassword || null;

  await db.collection(COLLECTIONS.users).doc(targetUserId).update(firestorePatch);

  return { userId: targetUserId, displayName };
});

export const updateJoinRequest = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  assertJoinRequestApproverRole(actor.role);

  const data = (request.data as Record<string, unknown> | null) ?? {};
  const requestId = requiredString(request.data, 'requestId');
  const joinRequestRef = db.collection(COLLECTIONS.joinRequests).doc(requestId);
  const joinRequestSnap = await joinRequestRef.get();

  assertCondition(joinRequestSnap.exists, 'not-found', 'Solicitacao nao encontrada.');
  const joinRequest = joinRequestSnap.data() as JoinRequestDoc;
  assertCondition(joinRequest.status === 'pending', 'failed-precondition', 'Esta solicitacao ja foi processada.');
  assertCondition(
    actor.role === 'superadmin' || joinRequest.academyId === actor.academyId,
    'permission-denied',
    'Voce so pode editar solicitacoes da sua unidade.',
  );

  const firstName = optionalString(request.data, 'firstName') ?? joinRequest.firstName;
  const lastName = optionalString(request.data, 'lastName') ?? joinRequest.lastName;
  const phone = data.phone === undefined ? joinRequest.phone : (optionalString(request.data, 'phone') ?? undefined);
  const birthDate = optionalString(request.data, 'birthDate') ?? joinRequest.birthDate;
  const isCompetitor = optionalBoolean(request.data, 'isCompetitor', joinRequest.isCompetitor);
  const requestedBeltRaw = optionalString(request.data, 'requestedBelt');
  const requestedBelt = requestedBeltRaw ? normalizeBeltId(requestedBeltRaw) : joinRequest.requestedBelt;
  const requestedGradeRaw = optionalNumber(request.data, 'requestedGrade');
  const requestedGrade = requestedGradeRaw === undefined
    ? joinRequest.requestedGrade
    : Math.max(0, Math.floor(requestedGradeRaw));

  let cpf = joinRequest.cpf;
  if (data.cpf !== undefined) {
    cpf = assertValidCpf(requiredString(request.data, 'cpf'));
    if (cpf !== joinRequest.cpf) {
      await ensureUniqueIdentity({
        email: joinRequest.email,
        cpf,
        excludeRequestId: requestId,
        excludeUserId: joinRequest.authUid,
      });
    }
  }

  const kidsCategory = inferKidsCategoryFromBirthDate(birthDate);
  assertCondition(
    !(kidsCategory && isAdultOnlyBelt(requestedBelt)),
    'invalid-argument',
    'Alunos kids nao podem iniciar com faixas adultas.',
  );
  assertCondition(
    !(!kidsCategory && isKidsOnlyBelt(requestedBelt)),
    'invalid-argument',
    'Alunos adultos nao podem iniciar com faixas kids.',
  );

  const displayName = `${firstName} ${lastName}`.trim();
  const now = Timestamp.now();

  await joinRequestRef.update({
    firstName,
    lastName,
    displayName,
    phone: phone ?? null,
    birthDate,
    kidsCategory: kidsCategory ?? null,
    isCompetitor,
    requestedBelt,
    requestedGrade,
    cpf,
    editedBy: actor.uid,
    editedByRole: actor.role,
    editedAt: now,
    updatedAt: now,
  });

  return {
    requestId,
    displayName,
    cpf,
    requestedBelt,
    requestedGrade,
  };
});

export const transferJoinRequest = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'professor');
  assertJoinRequestApproverRole(actor.role);

  const requestId = requiredString(request.data, 'requestId');
  const targetAcademyId = requiredString(request.data, 'targetAcademyId');
  const joinRequestRef = db.collection(COLLECTIONS.joinRequests).doc(requestId);
  const joinRequestSnap = await joinRequestRef.get();

  assertCondition(joinRequestSnap.exists, 'not-found', 'Solicitacao nao encontrada.');
  const joinRequest = joinRequestSnap.data() as JoinRequestDoc;
  assertCondition(joinRequest.status === 'pending', 'failed-precondition', 'Esta solicitacao ja foi processada.');
  assertCondition(
    actor.role === 'superadmin' || joinRequest.academyId === actor.academyId,
    'permission-denied',
    'Voce so pode encaminhar solicitacoes da sua unidade.',
  );
  assertCondition(
    targetAcademyId !== joinRequest.academyId,
    'invalid-argument',
    'A unidade de destino precisa ser diferente da atual.',
  );

  const targetAcademySnap = await db.collection(COLLECTIONS.academies).doc(targetAcademyId).get();
  assertCondition(targetAcademySnap.exists, 'not-found', 'Unidade de destino nao encontrada.');
  const targetAcademy = targetAcademySnap.data() as AcademyDoc;
  assertCondition(
    targetAcademy.status === 'active',
    'failed-precondition',
    'A unidade de destino nao esta aceitando novos cadastros.',
  );

  const duplicateSnap = await db
    .collection(COLLECTIONS.joinRequests)
    .where('authUid', '==', joinRequest.authUid)
    .where('academyId', '==', targetAcademyId)
    .where('status', '==', 'pending')
    .limit(1)
    .get();
  assertCondition(
    duplicateSnap.empty,
    'already-exists',
    'Ja existe uma solicitacao pendente deste aluno na unidade de destino.',
  );

  const existingUserSnap = await db.collection(COLLECTIONS.users).doc(joinRequest.authUid).get();
  if (existingUserSnap.exists) {
    const existingUser = existingUserSnap.data() as UserDoc;
    const memberships = existingUser.memberships ?? [];
    assertCondition(
      !memberships.includes(targetAcademyId),
      'already-exists',
      'O aluno ja esta vinculado a unidade de destino.',
    );
  }

  const now = Timestamp.now();
  const previousAcademyId = joinRequest.academyId;
  const previousAcademyName = joinRequest.academyName;

  await joinRequestRef.update({
    academyId: targetAcademyId,
    academyName: targetAcademy.name,
    transferredFromAcademyId: previousAcademyId,
    transferredFromAcademyName: previousAcademyName,
    transferredBy: actor.uid,
    transferredByRole: actor.role,
    transferredAt: now,
    updatedAt: now,
  });

  const previousNotificationsSnap = await db
    .collection(COLLECTIONS.notifications)
    .where('actionRef', '==', requestId)
    .where('academyId', '==', previousAcademyId)
    .get();
  if (!previousNotificationsSnap.empty) {
    const batch = db.batch();
    previousNotificationsSnap.docs.forEach((docSnap) => {
      batch.update(docSnap.ref, { notificationDismissedAt: now, updatedAt: now });
    });
    await batch.commit();
  }

  const recipients = await listApproversForAcademy(targetAcademyId);
  await createNotifications({
    academyId: targetAcademyId,
    recipients,
    createdBy: actor.uid,
    title: 'Solicitacao encaminhada',
    body: `${joinRequest.displayName} foi encaminhado(a) de ${previousAcademyName} para a sua unidade.`,
    channel: 'system',
    kind: 'join_request',
    actionRef: requestId,
    data: {
      requestId,
      academyId: targetAcademyId,
      userName: joinRequest.displayName,
      transferredFromAcademyId: previousAcademyId,
    },
  });

  return {
    requestId,
    academyId: targetAcademyId,
    academyName: targetAcademy.name,
  };
});

export const requestAdditionalAcademy = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'student');
  assertCondition(actor.role === 'student', 'permission-denied', 'Somente alunos podem solicitar entrada em outra unidade.');
  assertCondition(actor.user.status === 'active', 'failed-precondition', 'Sua conta precisa estar ativa para solicitar outra unidade.');

  const academyId = requiredString(request.data, 'academyId');
  const memberships = actor.user.memberships ?? (actor.user.academyId ? [actor.user.academyId] : []);
  assertCondition(
    !memberships.includes(academyId),
    'already-exists',
    'Voce ja faz parte desta unidade.',
  );

  const academySnap = await db.collection(COLLECTIONS.academies).doc(academyId).get();
  assertCondition(academySnap.exists, 'not-found', 'Unidade nao encontrada.');
  const academy = academySnap.data() as AcademyDoc;
  assertCondition(
    academy.status === 'active',
    'failed-precondition',
    'Esta unidade nao esta aceitando novos cadastros.',
  );

  const duplicateSnap = await db
    .collection(COLLECTIONS.joinRequests)
    .where('authUid', '==', actor.uid)
    .where('academyId', '==', academyId)
    .where('status', '==', 'pending')
    .limit(1)
    .get();
  assertCondition(
    duplicateSnap.empty,
    'already-exists',
    'Voce ja tem uma solicitacao pendente nesta unidade.',
  );

  const now = Timestamp.now();
  const joinRequestRef = db.collection(COLLECTIONS.joinRequests).doc();
  const kidsCategory = actor.user.kidsCategory ?? inferKidsCategoryFromBirthDate(actor.user.birthDate ?? '');
  const requestedBelt = normalizeBeltId(actor.user.belt);
  const requestedGrade = Math.max(0, Math.floor(actor.user.grade ?? 0));

  const joinRequest: JoinRequestDoc = {
    academyId,
    academyName: academy.name,
    authUid: actor.uid,
    email: actor.user.email,
    cpf: actor.user.cpf,
    firstName: actor.user.firstName,
    lastName: actor.user.lastName,
    displayName: actor.user.displayName,
    phone: actor.user.phone,
    birthDate: actor.user.birthDate ?? '',
    kidsCategory,
    isCompetitor: actor.user.isCompetitor ?? false,
    requestedBelt,
    requestedGrade,
    status: 'pending',
    origin: 'additional',
    createdAt: now,
    updatedAt: now,
  };

  await joinRequestRef.set(joinRequest);

  const recipients = await listApproversForAcademy(academyId);
  await createNotifications({
    academyId,
    recipients,
    createdBy: actor.uid,
    title: 'Novo pedido de entrada',
    body: `${actor.user.displayName} solicitou cadastro na unidade ${academy.name}.`,
    channel: 'system',
    kind: 'join_request',
    actionRef: joinRequestRef.id,
    data: {
      requestId: joinRequestRef.id,
      academyId,
      userName: actor.user.displayName,
    },
  });

  return {
    requestId: joinRequestRef.id,
    academyId,
    status: 'pending' as const,
  };
});

export const switchActiveAcademy = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'student');
  assertCondition(actor.role === 'student', 'permission-denied', 'Somente alunos podem trocar de unidade ativa.');
  assertCondition(actor.user.status === 'active', 'failed-precondition', 'Sua conta precisa estar ativa para trocar de unidade.');

  const academyId = requiredString(request.data, 'academyId');
  const memberships = actor.user.memberships ?? (actor.user.academyId ? [actor.user.academyId] : []);
  assertCondition(
    memberships.includes(academyId),
    'permission-denied',
    'Voce nao tem acesso a esta unidade.',
  );

  if (actor.user.academyId !== academyId) {
    await db.collection(COLLECTIONS.users).doc(actor.uid).update({
      academyId,
      updatedAt: Timestamp.now(),
    });
    await setClaims(actor.uid, 'student', academyId);
  }

  return {
    userId: actor.uid,
    academyId,
    role: 'student' as const,
  };
});

export const adminSetUserMemberships = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'superadmin');
  assertCondition(
    actor.role === 'superadmin',
    'permission-denied',
    'Somente superadmin pode definir as unidades do aluno.',
  );

  const targetUserId = requiredString(request.data, 'userId');
  const rawList = (request.data as { memberships?: unknown } | null)?.memberships;
  assertCondition(Array.isArray(rawList), 'invalid-argument', 'Lista de unidades invalida.');
  const memberships = [...new Set(
    (rawList as unknown[])
      .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
      .map((id) => id.trim()),
  )];
  assertCondition(
    memberships.length > 0,
    'invalid-argument',
    'O aluno precisa ter pelo menos uma unidade.',
  );

  const targetUser = await getUserDoc(targetUserId);
  assertCondition(
    targetUser.role === 'student',
    'failed-precondition',
    'Somente alunos podem ter multiplas unidades.',
  );

  for (const academyId of memberships) {
    await assertAcademyExists(academyId);
  }

  const currentActive = targetUser.academyId;
  const nextActive = memberships.includes(currentActive) ? currentActive : memberships[0];
  const academyChanged = nextActive !== currentActive;

  await db.collection(COLLECTIONS.users).doc(targetUserId).update({
    memberships,
    academyId: nextActive,
    updatedAt: Timestamp.now(),
  });
  if (academyChanged) {
    await setClaims(targetUserId, 'student', nextActive);
  }

  return { userId: targetUserId, memberships, academyId: nextActive };
});

// Limite seguro abaixo do teto de 500 escritas por batch do Firestore.
const DELETE_BATCH_LIMIT = 400;

// Coleta refs de varias consultas e apaga em lotes, respeitando o teto do Firestore.
async function deleteDocsFromSnapshots(
  snapshots: FirebaseFirestore.QuerySnapshot[],
): Promise<number> {
  const refs: FirebaseFirestore.DocumentReference[] = [];
  for (const snapshot of snapshots) {
    for (const docSnap of snapshot.docs) {
      refs.push(docSnap.ref);
    }
  }

  for (let index = 0; index < refs.length; index += DELETE_BATCH_LIMIT) {
    const batch = db.batch();
    for (const ref of refs.slice(index, index + DELETE_BATCH_LIMIT)) {
      batch.delete(ref);
    }
    await batch.commit();
  }

  return refs.length;
}

// Auto-exclusao da conta do aluno (LGPD / requisito do Google Play). Opera SOMENTE sobre a
// propria conta do solicitante. Apaga PII e arquivos pessoais; anonimiza o que precisa ser
// retido por obrigacao fiscal/legal (financeiro) ou como historico (lutas).
export const deleteMyAccount = onCall(callableOptions, async (request) => {
  const actor = await getRequestContext(request, 'student');
  assertCondition(
    actor.role === 'student',
    'permission-denied',
    'Apenas contas de aluno podem ser excluidas pelo proprio app. Para excluir uma conta de equipe, entre em contato com o suporte.',
  );

  const uid = actor.uid;
  const ANON = 'Usuario removido';

  // 1) Apaga arquivos pessoais no Storage (foto de perfil + videos de luta), sob users/{uid}/.
  try {
    await storage.bucket().deleteFiles({ prefix: `users/${uid}/` });
  } catch (error) {
    // Nao bloqueia a exclusao do restante dos dados caso o Storage falhe/esteja vazio.
    console.error(`Falha ao apagar arquivos do Storage para ${uid}:`, error);
  }

  // 2) Apaga o doc do usuario PRIMEIRO: assim os triggers (onFightWritten) que dependem do
  //    doc do usuario fazem no-op e nao recriam ranking orfao durante a anonimizacao abaixo.
  await db.collection(COLLECTIONS.users).doc(uid).delete();

  // 3) Apaga documentos pessoais / de progresso (sem valor de auditoria legal).
  const [
    attendanceRequests,
    classRsvps,
    graduationRequests,
    userMissions,
    rankings,
    learningProgress,
    learningQuizAttempts,
    reactivationRequests,
    notifications,
    fightVideoSubmissions,
    joinRequests,
  ] = await Promise.all([
    db.collection(COLLECTIONS.attendanceRequests).where('userId', '==', uid).get(),
    db.collection(COLLECTIONS.classRsvps).where('userId', '==', uid).get(),
    db.collection(COLLECTIONS.graduationRequests).where('userId', '==', uid).get(),
    db.collection(COLLECTIONS.userMissions).where('userId', '==', uid).get(),
    db.collection(COLLECTIONS.rankings).where('userId', '==', uid).get(),
    db.collection(COLLECTIONS.learningProgress).where('userId', '==', uid).get(),
    db.collection(COLLECTIONS.learningQuizAttempts).where('userId', '==', uid).get(),
    db.collection(COLLECTIONS.reactivationRequests).where('userId', '==', uid).get(),
    db.collection(COLLECTIONS.notifications).where('recipientUserId', '==', uid).get(),
    db.collection(COLLECTIONS.fightVideoSubmissions).where('athleteId', '==', uid).get(),
    db.collection(COLLECTIONS.joinRequests).where('authUid', '==', uid).get(),
  ]);

  await deleteDocsFromSnapshots([
    attendanceRequests,
    classRsvps,
    graduationRequests,
    userMissions,
    rankings,
    learningProgress,
    learningQuizAttempts,
    reactivationRequests,
    notifications,
    fightVideoSubmissions,
    joinRequests,
  ]);

  // 4) Anonimiza o que e retido: lutas (historico de competicao) e financeiro (obrigacao
  //    fiscal por 5 anos). Mantemos os registros e valores, removendo a identificacao pessoal.
  const now = Timestamp.now();
  const [fights, financeSales, financeSaleItems] = await Promise.all([
    db.collection(COLLECTIONS.fights).where('athleteId', '==', uid).get(),
    db.collection(COLLECTIONS.financeSales).where('customerId', '==', uid).get(),
    db.collection(COLLECTIONS.financeSaleItems).where('beneficiaryUserId', '==', uid).get(),
  ]);

  const anonRefs: { ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown> }[] = [];
  for (const docSnap of fights.docs) {
    anonRefs.push({ ref: docSnap.ref, data: { athleteName: ANON, updatedAt: now } });
  }
  for (const docSnap of financeSales.docs) {
    anonRefs.push({ ref: docSnap.ref, data: { customerName: ANON, updatedAt: now } });
  }
  for (const docSnap of financeSaleItems.docs) {
    anonRefs.push({ ref: docSnap.ref, data: { beneficiaryName: ANON, updatedAt: now } });
  }

  for (let index = 0; index < anonRefs.length; index += DELETE_BATCH_LIMIT) {
    const batch = db.batch();
    for (const item of anonRefs.slice(index, index + DELETE_BATCH_LIMIT)) {
      batch.update(item.ref, item.data);
    }
    await batch.commit();
  }

  // 5) Por fim, remove a conta de autenticacao (login).
  try {
    await auth.deleteUser(uid);
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';
    if (code !== 'auth/user-not-found') {
      throw error;
    }
  }

  return { userId: uid, status: 'deleted' as const };
});
