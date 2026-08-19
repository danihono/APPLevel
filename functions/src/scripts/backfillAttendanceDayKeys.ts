import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { AcademyDoc, AttendanceDoc, ClassDoc, COLLECTIONS, UserDoc } from '../domain/models';
import { db } from '../lib/firebase';
import {
  DEFAULT_TIMEZONE,
  isBeginnerClass,
  isEligibleForBeginnerClass,
  resolveClassDayKey,
  resolveDailyCounting,
  sameDecision,
  toDailyCandidate,
} from '../services/attendanceRules';
import { syncUserDerivedState } from '../services/userState';

// Backfill das presencas anteriores as regras de aula iniciante e limite diario.
//
// As presencas antigas nao tem `classDayKey`/`classStartAt`, entao ficam invisiveis para a
// query do dia — sem este backfill o historico continua contando 3 aulas num mesmo dia, e o
// recalculo disparado por uma remocao nao enxerga as presencas vizinhas.
//
// Para cada presenca: deriva o dia da AULA no fuso da academia, reaplica as duas regras ao dia
// inteiro do aluno e grava countsAsAttendance/nonCountingReason. No fim, ressincroniza a
// progressao de cada aluno tocado (sem recriar pendencia de graduacao).
//
// Uso (com as credenciais admin do projeto, igual ao bootstrap:tenant):
//   npm --prefix functions run backfill:attendance-days -- [--academySlug=minha-academia] [--dryRun]
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

// Caches para nao reler a mesma aula/academia/aluno a cada presenca.
const timezoneCache = new Map<string, string>();
const classCache = new Map<string, ClassDoc | null>();
const userCache = new Map<string, UserDoc | null>();

async function getTimezone(academyId: string): Promise<string> {
  const cached = timezoneCache.get(academyId);
  if (cached) {
    return cached;
  }
  const snapshot = await db.collection(COLLECTIONS.academies).doc(academyId).get();
  const timezone = snapshot.exists
    ? (snapshot.data() as AcademyDoc).timezone?.trim() || DEFAULT_TIMEZONE
    : DEFAULT_TIMEZONE;
  timezoneCache.set(academyId, timezone);
  return timezone;
}

async function getClass(classId: string): Promise<ClassDoc | null> {
  if (classCache.has(classId)) {
    return classCache.get(classId) ?? null;
  }
  const snapshot = await db.collection(COLLECTIONS.classes).doc(classId).get();
  const classData = snapshot.exists ? (snapshot.data() as ClassDoc) : null;
  classCache.set(classId, classData);
  return classData;
}

async function getUser(userId: string): Promise<UserDoc | null> {
  if (userCache.has(userId)) {
    return userCache.get(userId) ?? null;
  }
  const snapshot = await db.collection(COLLECTIONS.users).doc(userId).get();
  const user = snapshot.exists ? (snapshot.data() as UserDoc) : null;
  userCache.set(userId, user);
  return user;
}

interface StagedAttendance {
  ref: FirebaseFirestore.DocumentReference;
  attendance: AttendanceDoc;
  classDayKey: string;
  classStartAt: Timestamp;
  beginnerLocked: boolean;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const academyId = await resolveAcademyId(args.academySlug);

  const baseQuery = academyId
    ? db.collection(COLLECTIONS.attendances).where('academyId', '==', academyId)
    : db.collection(COLLECTIONS.attendances);
  const snapshot = await baseQuery.get();

  // Agrupa por (academia, aluno, dia da aula) — a regra do limite diario so faz sentido no dia inteiro.
  const buckets = new Map<string, StagedAttendance[]>();
  let scanned = 0;
  let orphaned = 0;

  for (const doc of snapshot.docs) {
    scanned += 1;
    const attendance = doc.data() as AttendanceDoc;
    const attendanceAcademyId = attendance.academyId?.trim();
    if (!attendanceAcademyId || !attendance.userId || !attendance.classId) {
      orphaned += 1;
      continue;
    }

    const user = await getUser(attendance.userId);
    if (!user) {
      orphaned += 1;
      continue;
    }

    // Aula apagada: sem scheduledStart o melhor palpite do dia e o proprio check-in. Deixar a
    // presenca de fora seria pior — ela sumiria do dia e o aluno poderia ficar com 3 computadas.
    const classData = await getClass(attendance.classId);
    if (!classData?.scheduledStart) {
      orphaned += 1;
    }

    const timezone = await getTimezone(attendanceAcademyId);
    const classStartAt = classData?.scheduledStart ?? attendance.checkedInAt;
    if (!classStartAt) {
      continue;
    }
    const classDayKey = resolveClassDayKey(classStartAt, timezone);
    const key = `${attendanceAcademyId}|${attendance.userId}|${classDayKey}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push({
      ref: doc.ref,
      attendance,
      classDayKey,
      classStartAt,
      // Sem a aula nao da para saber o tipo da turma; nao inventamos restricao.
      beginnerLocked: !!classData && isBeginnerClass(classData) && !isEligibleForBeginnerClass(user),
    });
    buckets.set(key, bucket);
  }

  const touchedUsers = new Map<string, string>();
  let updated = 0;

  for (const [key, entries] of buckets) {
    const decisions = resolveDailyCounting(
      entries.map((entry) => ({
        ...toDailyCandidate(entry.ref.id, entry.attendance),
        classStartAtMs: entry.classStartAt.toMillis(),
        locked: entry.beginnerLocked,
      })),
    );

    for (const entry of entries) {
      const decision = decisions.get(entry.ref.id);
      if (!decision) {
        continue;
      }

      const needsDayFields = entry.attendance.classDayKey !== entry.classDayKey
        || entry.attendance.classStartAt?.toMillis?.() !== entry.classStartAt.toMillis();
      if (!needsDayFields && sameDecision(entry.attendance, decision)) {
        continue;
      }

      const [academyIdPart, userIdPart] = key.split('|');
      touchedUsers.set(userIdPart, academyIdPart);
      updated += 1;

      console.log(
        JSON.stringify({
          attendanceId: entry.ref.id,
          userId: entry.attendance.userId,
          classId: entry.attendance.classId,
          dia: entry.classDayKey,
          antes: {
            countsAsAttendance: entry.attendance.countsAsAttendance ?? true,
            nonCountingReason: entry.attendance.nonCountingReason ?? null,
          },
          depois: {
            countsAsAttendance: decision.countsAsAttendance,
            nonCountingReason: decision.nonCountingReason ?? null,
          },
          dryRun: args.dryRun,
        }),
      );

      if (args.dryRun) {
        continue;
      }

      await entry.ref.update({
        classDayKey: entry.classDayKey,
        classStartAt: entry.classStartAt,
        countsAsAttendance: decision.countsAsAttendance,
        nonCountingReason: decision.nonCountingReason ?? FieldValue.delete(),
        updatedAt: Timestamp.now(),
      });
    }
  }

  if (!args.dryRun) {
    for (const [userId, userAcademyId] of touchedUsers) {
      await syncUserDerivedState(userId, userAcademyId, { skipGraduationSync: true });
    }
  }

  console.log(
    JSON.stringify(
      {
        resumo: {
          academySlug: args.academySlug ?? '(todas)',
          presencasVarridas: scanned,
          semAulaOuAluno: orphaned,
          // 'semAulaOuAluno' conta presencas cuja aula sumiu (dia veio do check-in) ou cujo aluno nao existe mais (ignoradas).
          diasAgrupados: buckets.size,
          presencasAtualizadas: args.dryRun ? 0 : updated,
          alunosRessincronizados: args.dryRun ? 0 : touchedUsers.size,
          dryRun: args.dryRun,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error('Falha ao fazer o backfill do dia das presencas:', error);
  process.exitCode = 1;
});
