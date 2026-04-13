import { Timestamp } from 'firebase-admin/firestore';
import { AcademyDoc, COLLECTIONS, DEFAULT_PROGRESSION_RULES, UserDoc } from '../domain/models';
import { auth, db } from '../lib/firebase';

interface BootstrapArgs {
  superadminEmail: string;
  superadminPassword: string;
  firstName: string;
  lastName: string;
  academyName: string;
  academySlug: string;
  timezone: string;
}

type ParsedBootstrapArgs =
  | { kind: 'help' }
  | { kind: 'invalid' }
  | { kind: 'ok'; value: BootstrapArgs };

function printUsage(): void {
  console.log(`
Uso:
  npm run bootstrap:tenant -- \
    --superadminEmail=owner@academy.com \
    --superadminPassword=senha-forte \
    --firstName=Nome \
    --lastName=Sobrenome \
    --academyName="Minha Academia" \
    --academySlug=minha-academia \
    --timezone=America/Sao_Paulo
`);
}

function parseArgs(argv: string[]): ParsedBootstrapArgs {
  const parsed = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) {
      continue;
    }

    if (item === '--help') {
      return { kind: 'help' };
    }

    const [rawKey, rawValue] = item.slice(2).split('=');
    if (rawValue != null) {
      parsed.set(rawKey, rawValue);
      continue;
    }

    const nextValue = argv[index + 1];
    if (nextValue && !nextValue.startsWith('--')) {
      parsed.set(rawKey, nextValue);
      index += 1;
    } else {
      parsed.set(rawKey, 'true');
    }
  }

  const superadminEmail = parsed.get('superadminEmail')?.trim().toLowerCase();
  const superadminPassword = parsed.get('superadminPassword')?.trim();
  const firstName = parsed.get('firstName')?.trim();
  const lastName = parsed.get('lastName')?.trim();
  const academyName = parsed.get('academyName')?.trim();
  const academySlug = parsed.get('academySlug')?.trim().toLowerCase();
  const timezone = parsed.get('timezone')?.trim() ?? 'America/Sao_Paulo';

  if (!superadminEmail || !superadminPassword || !firstName || !lastName || !academyName || !academySlug) {
    return { kind: 'invalid' };
  }

  return {
    kind: 'ok',
    value: {
      superadminEmail,
      superadminPassword,
      firstName,
      lastName,
      academyName,
      academySlug,
      timezone,
    },
  };
}

function assertValidSlug(slug: string): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error('academySlug deve usar apenas letras minúsculas, números e hífen.');
  }
}

async function upsertSuperadmin(email: string, password: string, displayName: string) {
  try {
    const existing = await auth.getUserByEmail(email);
    await auth.updateUser(existing.uid, {
      displayName,
      password,
    });
    return existing.uid;
  } catch (error) {
    const authError = error as { code?: string };
    if (authError.code !== 'auth/user-not-found') {
      throw error;
    }

    const created = await auth.createUser({
      email,
      password,
      displayName,
    });
    return created.uid;
  }
}

async function resolveAcademyForBootstrap(userId: string, args: BootstrapArgs): Promise<string> {
  const snapshot = await db
    .collection(COLLECTIONS.academies)
    .where('slug', '==', args.academySlug)
    .limit(2)
    .get();

  if (snapshot.size > 1) {
    throw new Error(`Slug "${args.academySlug}" está duplicado no banco e precisa ser corrigido manualmente.`);
  }

  const now = Timestamp.now();
  if (!snapshot.empty) {
    const academyDoc = snapshot.docs[0];
    const academy = academyDoc.data() as AcademyDoc;

    if (academy.ownerUserId && academy.ownerUserId !== userId) {
      throw new Error(`academySlug "${args.academySlug}" já está em uso por outra academia.`);
    }

    await academyDoc.ref.set(
      {
        id: academyDoc.id,
        name: args.academyName,
        slug: args.academySlug,
        ownerUserId: userId,
        status: academy.status ?? 'active',
        timezone: args.timezone,
        progressionRules: academy.progressionRules ?? DEFAULT_PROGRESSION_RULES,
        classCheckinWindowMinutes: academy.classCheckinWindowMinutes ?? 15,
        masterBlackLimit: academy.masterBlackLimit ?? 1,
        updatedAt: now,
        createdAt: academy.createdAt ?? now,
      } satisfies AcademyDoc,
      { merge: true },
    );

    return academyDoc.id;
  }

  const academyRef = db.collection(COLLECTIONS.academies).doc();
  const academy: AcademyDoc = {
    id: academyRef.id,
    name: args.academyName,
    slug: args.academySlug,
    ownerUserId: userId,
    status: 'active',
    timezone: args.timezone,
    progressionRules: DEFAULT_PROGRESSION_RULES,
    classCheckinWindowMinutes: 15,
    masterBlackLimit: 1,
    createdAt: now,
    updatedAt: now,
  };

  await academyRef.set(academy);
  return academyRef.id;
}

async function upsertUserDocument(userId: string, args: BootstrapArgs): Promise<void> {
  const userRef = db.collection(COLLECTIONS.users).doc(userId);
  const now = Timestamp.now();
  const existing = await userRef.get();
  const current = existing.data() as UserDoc | undefined;

  const userDoc: UserDoc = {
    academyId: '',
    firstName: args.firstName,
    lastName: args.lastName,
    displayName: `${args.firstName} ${args.lastName}`.trim(),
    email: args.superadminEmail,
    cpf: current?.cpf ?? `staff-${userId}`,
    phone: current?.phone,
    birthDate: current?.birthDate,
    isCompetitor: current?.isCompetitor ?? false,
    role: 'superadmin',
    status: 'active',
    belt: current?.belt ?? 'white',
    stripes: current?.stripes ?? 0,
    grade: current?.grade ?? 0,
    photoPath: current?.photoPath,
    attendanceCount: current?.attendanceCount ?? 0,
    qrCheckinsCount: current?.qrCheckinsCount ?? 0,
    currentStreak: current?.currentStreak ?? 0,
    longestStreak: current?.longestStreak ?? 0,
    competitionPoints: current?.competitionPoints ?? 0,
    missionPoints: current?.missionPoints ?? 0,
    rankingPoints: current?.rankingPoints ?? 0,
    beltPromotions: current?.beltPromotions ?? 0,
    nextStripeAttendanceTarget: current?.nextStripeAttendanceTarget ?? null,
    nextBeltAttendanceTarget: current?.nextBeltAttendanceTarget ?? null,
    lastAttendanceAt: current?.lastAttendanceAt,
    lastLoginAt: current?.lastLoginAt,
    fcmTokens: current?.fcmTokens ?? [],
    createdAt: current?.createdAt ?? now,
    updatedAt: now,
  };

  await userRef.set(userDoc, { merge: true });
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.kind === 'help') {
    printUsage();
    return;
  }
  if (parsed.kind === 'invalid') {
    printUsage();
    process.exitCode = 1;
    return;
  }
  const args = parsed.value;

  assertValidSlug(args.academySlug);

  const displayName = `${args.firstName} ${args.lastName}`.trim();
  const userId = await upsertSuperadmin(args.superadminEmail, args.superadminPassword, displayName);
  const academyId = await resolveAcademyForBootstrap(userId, args);

  await upsertUserDocument(userId, args);
  await auth.setCustomUserClaims(userId, {
    role: 'superadmin',
    academyId: '',
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        userId,
        academyId,
        superadminEmail: args.superadminEmail,
        academySlug: args.academySlug,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('Falha no bootstrap do tenant:', error);
  process.exitCode = 1;
});
