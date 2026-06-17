import { Timestamp } from 'firebase-admin/firestore';
import { AttendanceDoc, COLLECTIONS, UserDoc } from '../domain/models';
import { db } from '../lib/firebase';
import { resolveBeltStartAndBonus, resolveStripeEveryForBelt } from '../services/progression';
import { syncUserDerivedState } from '../services/userState';

// Script de varredura: corrige alunos cuja progressao ficou com aulas contadas em dobro apos uma
// graduacao. O bug (corrigido em applyStudentBeltGradeUpdate) zerava o attendanceCountBonus na
// graduacao automatica; para um aluno colocado manualmente (organic < graus*stripeEvery) isso o
// rebaixava a "colocacao manual" e fazia as aulas reais restantes reaparecerem como progresso do
// novo grau (ex.: 21/30 e 51/150 em vez de 0/30 e 30/150).
//
// Assinatura do bug: aluno com stripes > 0 e (organic + bonus) < marco + stripes*stripeEvery
// (isManuallyPlaced apos uma graduacao — o que nunca acontece com a logica correta, pois toda
// promocao posiciona o total >= piso do grau).
//
// Correcao: reposiciona marco + bonus PRESERVANDO o progresso real pos-promocao (presencas
// contaveis com checkedInAt >= lastStripeDateOverride). Sem esse marco temporal => grau em 0.
//
// Uso (rode com as credenciais admin do projeto, igual ao bootstrap:tenant):
//   npm --prefix functions run fix:progression -- [--academySlug=minha-academia] [--dryRun]
//
// Sem --academySlug, varre todas as academias. Use --dryRun para apenas listar sem gravar.

interface SweepArgs {
  academySlug?: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): SweepArgs {
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

  return {
    academySlug: parsed.get('academySlug')?.trim().toLowerCase(),
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

// Presencas contaveis a partir de `since` (inclusive) = progresso real desde a ultima graduacao.
async function countAttendancesSince(academyId: string, userId: string, since: Timestamp): Promise<number> {
  const snapshot = await db
    .collection(COLLECTIONS.attendances)
    .where('academyId', '==', academyId)
    .where('userId', '==', userId)
    .get();
  const sinceMs = since.toMillis();
  return snapshot.docs.reduce((acc, doc) => {
    const attendance = doc.data() as AttendanceDoc;
    if (attendance.countsAsAttendance === false) {
      return acc;
    }
    const checkedInMs = attendance.checkedInAt?.toMillis?.() ?? 0;
    return checkedInMs >= sinceMs ? acc + 1 : acc;
  }, 0);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const academyId = await resolveAcademyId(args.academySlug);

  const baseQuery = academyId
    ? db.collection(COLLECTIONS.users).where('academyId', '==', academyId)
    : db.collection(COLLECTIONS.users);
  const snapshot = await baseQuery.get();

  let scanned = 0;
  let affected = 0;
  let fixed = 0;

  for (const doc of snapshot.docs) {
    const user = doc.data() as UserDoc;
    if (user.role !== 'student') {
      continue;
    }
    scanned += 1;

    const userId = doc.id;
    const userAcademyId = user.academyId?.trim();
    if (!userAcademyId) {
      continue;
    }

    const stripes = Math.max(0, Math.floor(user.stripes ?? 0));
    if (stripes <= 0) {
      continue; // sem grau, nao ha piso de grau a estourar
    }

    const stripeEvery = resolveStripeEveryForBelt(user.belt, {
      birthDate: user.birthDate,
      kidsCategory: user.kidsCategory,
    });
    if (stripeEvery <= 0) {
      continue; // faixa terminal / sem graus por aula
    }

    const organic = await countOrganicAttendances(userAcademyId, userId);
    const bonus = Math.max(0, Math.floor(user.attendanceCountBonus ?? 0));
    const marco = Math.max(0, Math.floor(user.attendanceCountAtBeltStart ?? 0));
    const floor = marco + stripes * stripeEvery;
    const total = organic + bonus;

    // Assinatura do bug: graduado (stripes > 0) porem abaixo do piso do grau (isManuallyPlaced).
    if (total >= floor) {
      continue;
    }
    affected += 1;

    // Preserva o progresso real desde a ultima graduacao; sem timestamp, reinicia o grau em 0.
    const since = user.lastStripeDateOverride ?? user.lastGradeApprovalAt ?? null;
    const gradeProgress = since ? await countAttendancesSince(userAcademyId, userId, since) : 0;
    const resolved = resolveBeltStartAndBonus(organic, stripes, stripeEvery, gradeProgress);

    console.log(
      JSON.stringify(
        {
          aluno: { userId, displayName: user.displayName, academyId: userAcademyId },
          antes: {
            belt: user.belt,
            stripes: user.stripes,
            attendanceCount: user.attendanceCount,
            attendanceCountAtBeltStart: user.attendanceCountAtBeltStart ?? null,
            attendanceCountBonus: bonus,
          },
          calculo: { organic, bonus, marco, stripeEvery, stripes, floor, total, gradeProgress },
          depois: {
            attendanceCountAtBeltStart: resolved.attendanceCountAtBeltStart,
            attendanceCountBonus: resolved.attendanceCountBonus,
            previsaoGrau: `${gradeProgress}/${stripeEvery}`,
            previsaoFaixa: `${stripes * stripeEvery + gradeProgress}/${stripeEvery * 5}`,
          },
          dryRun: args.dryRun,
        },
        null,
        2,
      ),
    );

    if (args.dryRun) {
      continue;
    }

    await db.collection(COLLECTIONS.users).doc(userId).update({
      attendanceCountAtBeltStart: resolved.attendanceCountAtBeltStart,
      attendanceCountBonus: resolved.attendanceCountBonus,
      updatedAt: Timestamp.now(),
    });

    // Recalcula os campos derivados de progressao sem recriar pendencia de graduacao.
    const result = await syncUserDerivedState(userId, userAcademyId, { skipGraduationSync: true });
    fixed += 1;

    console.log(
      JSON.stringify(
        {
          ok: true,
          userId,
          progressaoGrau: `${result.currentStripeProgress}/${result.classesToNextStripe}`,
          progressaoFaixa: `${result.currentBeltProgress}/${result.totalClassesToNextBelt}`,
        },
        null,
        2,
      ),
    );
  }

  console.log(
    JSON.stringify(
      {
        resumo: {
          academySlug: args.academySlug ?? '(todas)',
          alunosVarridos: scanned,
          afetados: affected,
          corrigidos: args.dryRun ? 0 : fixed,
          dryRun: args.dryRun,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('Falha ao varrer/corrigir progressao dos alunos:', error);
  process.exitCode = 1;
});
