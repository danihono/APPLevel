import { Timestamp } from 'firebase-admin/firestore';
import { COLLECTIONS, UserDoc } from '../domain/models';
import { db } from '../lib/firebase';
import { normalizeBeltId, resolveBeltStartAndBonus, resolveMaxStripesForBelt, resolveStripeEveryForBelt } from '../services/progression';
import { syncUserDerivedState } from '../services/userState';

// Script pontual de correcao: zera a contagem de progressao de UM aluno, posicionando o
// marco (attendanceCountAtBeltStart) no inicio do grau atual. Resultado: o proximo grau
// passa a contar do zero (ex.: 0/15) e a barra da faixa mostra graus*stripeEvery (ex.: 30/75).
// Mesma formula aplicada em applyStudentBeltGradeUpdate (auth.ts).
//
// Uso (rode com as credenciais admin do projeto, igual ao bootstrap:tenant):
//   npm --prefix functions run reset:student -- --email=aluno@email.com [--dryRun]
//   npm --prefix functions run reset:student -- --name="Caio Serra" --academySlug=minha-academia [--dryRun]
//   npm --prefix functions run reset:student -- --userId=abc123 [--stripes=2] [--belt=branca] [--dryRun]
//
// Por padrao mantem a faixa e o grau atuais do aluno; use --belt/--stripes para tambem definir.

interface ResetArgs {
  email?: string;
  name?: string;
  userId?: string;
  academySlug?: string;
  belt?: string;
  stripes?: number;
  dryRun: boolean;
}

function parseArgs(argv: string[]): ResetArgs {
  const parsed = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) {
      continue;
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

  const stripesRaw = parsed.get('stripes');
  return {
    email: parsed.get('email')?.trim().toLowerCase(),
    name: parsed.get('name')?.trim(),
    userId: parsed.get('userId')?.trim(),
    academySlug: parsed.get('academySlug')?.trim().toLowerCase(),
    belt: parsed.get('belt')?.trim(),
    stripes: stripesRaw != null ? Math.max(0, Math.floor(Number(stripesRaw))) : undefined,
    dryRun: parsed.get('dryRun') === 'true',
  };
}

async function resolveAcademyId(slug?: string): Promise<string | undefined> {
  if (!slug) {
    return undefined;
  }
  const snapshot = await db.collection(COLLECTIONS.academies).where('slug', '==', slug).limit(2).get();
  if (snapshot.empty) {
    throw new Error(`Academia com slug "${slug}" nao encontrada.`);
  }
  if (snapshot.size > 1) {
    throw new Error(`Slug "${slug}" duplicado; corrija antes de continuar.`);
  }
  return snapshot.docs[0].id;
}

async function findUser(args: ResetArgs): Promise<{ id: string; data: UserDoc }> {
  if (args.userId) {
    const doc = await db.collection(COLLECTIONS.users).doc(args.userId).get();
    if (!doc.exists) {
      throw new Error(`Usuario com id "${args.userId}" nao encontrado.`);
    }
    return { id: doc.id, data: doc.data() as UserDoc };
  }

  if (args.email) {
    const snapshot = await db.collection(COLLECTIONS.users).where('email', '==', args.email).limit(2).get();
    if (snapshot.empty) {
      throw new Error(`Nenhum usuario com email "${args.email}".`);
    }
    if (snapshot.size > 1) {
      throw new Error(`Mais de um usuario com email "${args.email}"; use --userId.`);
    }
    return { id: snapshot.docs[0].id, data: snapshot.docs[0].data() as UserDoc };
  }

  if (args.name) {
    const academyId = await resolveAcademyId(args.academySlug);
    const base = academyId
      ? db.collection(COLLECTIONS.users).where('academyId', '==', academyId)
      : db.collection(COLLECTIONS.users);
    const snapshot = await base.get();
    const wanted = args.name.toLowerCase();
    const matches = snapshot.docs.filter(
      (doc) => ((doc.data() as UserDoc).displayName ?? '').trim().toLowerCase() === wanted,
    );
    if (matches.length === 0) {
      throw new Error(`Nenhum aluno com nome "${args.name}"${academyId ? ' nessa academia' : ''}.`);
    }
    if (matches.length > 1) {
      const ids = matches.map((doc) => `${doc.id} (academyId=${(doc.data() as UserDoc).academyId})`).join(', ');
      throw new Error(`Mais de um aluno com nome "${args.name}": ${ids}. Use --userId ou --academySlug.`);
    }
    return { id: matches[0].id, data: matches[0].data() as UserDoc };
  }

  throw new Error('Informe --email, --userId ou --name para identificar o aluno.');
}

async function countOrganicAttendances(academyId: string, userId: string): Promise<number> {
  const baseQuery = db
    .collection(COLLECTIONS.attendances)
    .where('academyId', '==', academyId)
    .where('userId', '==', userId);
  const [totalSnap, nonCountingSnap] = await Promise.all([
    baseQuery.count().get(),
    baseQuery.where('countsAsAttendance', '==', false).count().get(),
  ]);
  return totalSnap.data().count - nonCountingSnap.data().count;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { id: userId, data: user } = await findUser(args);

  if (user.role !== 'student') {
    throw new Error(`Usuario ${userId} nao e aluno (role=${user.role}).`);
  }
  const academyId = user.academyId?.trim();
  if (!academyId) {
    throw new Error(`Aluno ${userId} nao tem academyId.`);
  }

  const belt = args.belt ? normalizeBeltId(args.belt) : user.belt;
  const beltCtx = { birthDate: user.birthDate, kidsCategory: user.kidsCategory };
  // Clampa stripes a maxStripes da faixa (a leitura sempre clampa; o marco gravado tem de bater).
  const maxStripes = resolveMaxStripesForBelt(belt, beltCtx);
  const rawStripes = args.stripes != null ? args.stripes : Math.max(0, Math.floor(user.stripes ?? 0));
  const stripes = Math.min(maxStripes, Math.max(0, Math.floor(rawStripes)));
  const organic = await countOrganicAttendances(academyId, userId);
  const stripeEvery = resolveStripeEveryForBelt(belt, beltCtx);
  // gradeProgress = 0: o reset posiciona o aluno no inicio do grau atual (0/stripeEvery).
  const { attendanceCountAtBeltStart, attendanceCountBonus } = resolveBeltStartAndBonus(
    organic,
    stripes,
    stripeEvery,
    0,
  );

  console.log(
    JSON.stringify(
      {
        aluno: { userId, displayName: user.displayName, academyId },
        antes: {
          belt: user.belt,
          stripes: user.stripes,
          attendanceCount: user.attendanceCount,
          attendanceCountAtBeltStart: user.attendanceCountAtBeltStart ?? null,
          attendanceCountBonus: user.attendanceCountBonus ?? 0,
        },
        calculo: { organic, stripeEvery, stripes },
        depois: {
          belt,
          stripes,
          attendanceCountAtBeltStart,
          attendanceCountBonus,
          previsaoGrau: `0/${stripeEvery}`,
          previsaoFaixa: `${stripes * stripeEvery}/${stripeEvery * 5}`,
        },
        dryRun: args.dryRun,
      },
      null,
      2,
    ),
  );

  if (args.dryRun) {
    console.log('\n[dryRun] Nada foi gravado.');
    return;
  }

  await db.collection(COLLECTIONS.users).doc(userId).update({
    belt,
    grade: stripes,
    stripes,
    attendanceCountAtBeltStart,
    attendanceCountBonus,
    updatedAt: Timestamp.now(),
  });

  // Recalcula os campos derivados de progressao sem recriar pendencia de graduacao.
  const result = await syncUserDerivedState(userId, academyId, { skipGraduationSync: true });

  console.log(
    JSON.stringify(
      {
        ok: true,
        progressaoGrau: `${result.currentStripeProgress}/${result.classesToNextStripe}`,
        progressaoFaixa: `${result.currentBeltProgress}/${result.totalClassesToNextBelt}`,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('Falha ao resetar progresso do aluno:', error);
  process.exitCode = 1;
});
