import { logger } from 'firebase-functions/v2';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import {
  AttendanceDoc,
  AttendanceNonCountingReason,
  AcademyDoc,
  ClassDoc,
  COLLECTIONS,
  UserDoc,
} from '../domain/models';
import { assertCondition } from '../lib/errors';
import { db } from '../lib/firebase';
import { isValidTimeZone } from '../lib/payload';
import { normalizeBeltId } from './progression';

// Regras de negocio da presenca. Espelhado no frontend em `classRules.ts` (raiz) — ao mudar
// uma regra aqui, mude la tambem: o frontend so usa a copia para AVISAR o aluno antes do
// check-in; quem decide de verdade e este arquivo.
//
// 1. Aula LEVEL Iniciante e para faixa branca ate 2 graus. Quem esta acima disso pode treinar,
//    mas a presenca nao conta como aula.
// 2. No maximo 2 presencas computadas por dia. Fez 3 aulas, recebe 2.
//
// Nesses dois casos o check-in nao e recusado: a presenca e gravada com
// `countsAsAttendance: false` + `nonCountingReason`, que todos os contadores ja respeitam
// (services/userState.ts, modules/auth.ts, StudentRoster, StudentDetailView...).
//
// 3. Aluno iniciante (adulto, faixa branca ate 2 graus) so treina na LEVEL Iniciante. Em
//    qualquer outra turma o check-in e RECUSADO — por QR, manual, solicitacao ou aprovacao.

export const BEGINNER_CLASS_TYPE = 'iniciante';
export const MAX_COUNTED_ATTENDANCES_PER_DAY = 2;
export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';

// `ClassDoc.description` guarda o CODIGO da turma ('iniciante', 'sport', 'kids-01'...),
// nao um texto livre — vide `tipoDescription` em components/CreateClassModal.tsx.
export function isBeginnerClass(classData: Pick<ClassDoc, 'description'>): boolean {
  return (classData.description ?? '').trim().toLowerCase() === BEGINNER_CLASS_TYPE;
}

export function isEligibleForBeginnerClass(user: Pick<UserDoc, 'belt' | 'stripes'>): boolean {
  return normalizeBeltId(user.belt) === 'white' && Math.max(0, Math.floor(user.stripes ?? 0)) <= 2;
}

export const BEGINNER_ONLY_CLASS_MESSAGE =
  'Aluno iniciante (faixa branca até 2 graus) só pode fazer check-in na aula LEVEL Iniciante.';

// Aluno kids fica de fora: criancas de faixa branca treinam nas turmas Kids. Professor e
// superadmin tambem — a regra e sobre o aluno.
export function isRestrictedBeginner(user: Pick<UserDoc, 'role' | 'belt' | 'stripes' | 'kidsCategory'>): boolean {
  return user.role === 'student' && !user.kidsCategory && isEligibleForBeginnerClass(user);
}

export function assertBeginnerCanJoinClass(
  classData: Pick<ClassDoc, 'description'>,
  user: Pick<UserDoc, 'role' | 'belt' | 'stripes' | 'kidsCategory'>,
): void {
  assertCondition(
    isBeginnerClass(classData) || !isRestrictedBeginner(user),
    'failed-precondition',
    BEGINNER_ONLY_CLASS_MESSAGE,
  );
}

// Dia da aula no fuso da academia. 'en-CA' formata como YYYY-MM-DD, que ordena
// lexicograficamente. Usar o fuso local importa: uma aula das 21h BRT ja e o dia seguinte
// em UTC, e cairia no dia errado se usassemos o ISO cru.
export function resolveClassDayKey(reference: Timestamp, timezone: string): string {
  // `Intl.DateTimeFormat` lanca RangeError com fuso invalido. Como isso nao e
  // HttpsError, subiria sem tratamento e o professor receberia um 500 generico
  // ao marcar presenca. Nenhuma presenca pode deixar de ser registrada por causa
  // de configuracao errada: no pior caso o dia sai no fuso padrao.
  const safeTimezone = isValidTimeZone(timezone) ? timezone : DEFAULT_TIMEZONE;

  return new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(reference.toDate());
}

export async function resolveAcademyTimezone(academyId: string): Promise<string> {
  const snapshot = await db.collection(COLLECTIONS.academies).doc(academyId).get();
  if (!snapshot.exists) {
    return DEFAULT_TIMEZONE;
  }
  const academy = snapshot.data() as AcademyDoc;
  const stored = academy.timezone?.trim();
  if (!stored) {
    return DEFAULT_TIMEZONE;
  }

  // Documentos antigos foram gravados antes da validacao de escrita e podem
  // guardar nome de cidade ('Campinas') em vez do identificador IANA. O aviso
  // deixa a academia rastreavel no log para correcao pela tela de gestao.
  if (!isValidTimeZone(stored)) {
    logger.warn('Academia com fuso horario invalido; usando o padrao', {
      academyId,
      storedTimezone: stored,
      fallback: DEFAULT_TIMEZONE,
    });
    return DEFAULT_TIMEZONE;
  }

  return stored;
}

export interface CountingDecision {
  countsAsAttendance: boolean;
  nonCountingReason?: AttendanceNonCountingReason;
}

export interface DailyCandidate {
  id: string;
  classStartAtMs: number;
  // Desempate quando duas aulas do dia comecam no mesmo horario.
  checkedInAtMs: number;
  // Presenca que nao conta por um motivo que nao e o limite diario (hoje: aula iniciante).
  // Ela nunca e promovida e nao ocupa uma das vagas do dia.
  locked: boolean;
}

// Decide, para TODAS as presencas de um dia, quais contam. Funcao pura: e a mesma logica no
// registro e no recalculo, para as duas rotas nunca divergirem.
// Ordem canonica = horario da aula. As 2 primeiras elegiveis contam; o resto vira 'daily_limit'.
export function resolveDailyCounting(candidates: DailyCandidate[]): Map<string, CountingDecision> {
  const ordered = [...candidates].sort((left, right) => {
    if (left.classStartAtMs !== right.classStartAtMs) {
      return left.classStartAtMs - right.classStartAtMs;
    }
    if (left.checkedInAtMs !== right.checkedInAtMs) {
      return left.checkedInAtMs - right.checkedInAtMs;
    }
    return left.id.localeCompare(right.id);
  });

  const decisions = new Map<string, CountingDecision>();
  let counted = 0;

  for (const candidate of ordered) {
    if (candidate.locked) {
      decisions.set(candidate.id, { countsAsAttendance: false, nonCountingReason: 'beginner_class_belt' });
      continue;
    }

    if (counted < MAX_COUNTED_ATTENDANCES_PER_DAY) {
      counted += 1;
      decisions.set(candidate.id, { countsAsAttendance: true });
      continue;
    }

    decisions.set(candidate.id, { countsAsAttendance: false, nonCountingReason: 'daily_limit' });
  }

  return decisions;
}

// Presencas antigas (pre-deploy) nao tem `nonCountingReason`; uma que esteja marcada como nao
// contavel por outro motivo tambem nao deve ser promovida sem querer.
export function toDailyCandidate(id: string, attendance: AttendanceDoc): DailyCandidate {
  return {
    id,
    classStartAtMs: attendance.classStartAt?.toMillis?.() ?? attendance.checkedInAt?.toMillis?.() ?? 0,
    checkedInAtMs: attendance.checkedInAt?.toMillis?.() ?? 0,
    locked: attendance.countsAsAttendance === false && attendance.nonCountingReason !== 'daily_limit',
  };
}

export function dailyAttendanceQuery(
  academyId: string,
  userId: string,
  classDayKey: string,
): FirebaseFirestore.Query<FirebaseFirestore.DocumentData> {
  return db
    .collection(COLLECTIONS.attendances)
    .where('academyId', '==', academyId)
    .where('userId', '==', userId)
    .where('classDayKey', '==', classDayKey);
}

export function sameDecision(attendance: AttendanceDoc, decision: CountingDecision): boolean {
  return (attendance.countsAsAttendance ?? true) === decision.countsAsAttendance
    && (attendance.nonCountingReason ?? null) === (decision.nonCountingReason ?? null);
}

// Reavalia o dia inteiro e grava so o que mudou. Idempotente — pode rodar depois de qualquer
// create/delete sem efeito colateral. E o que promove a 3a presenca quando o professor
// desmarca uma das 2 que contavam.
export async function recomputeDailyAttendanceCounting(
  academyId: string,
  userId: string,
  classDayKey: string,
): Promise<void> {
  const snapshot = await dailyAttendanceQuery(academyId, userId, classDayKey).get();
  if (snapshot.empty) {
    return;
  }

  const decisions = resolveDailyCounting(
    snapshot.docs.map((doc) => toDailyCandidate(doc.id, doc.data() as AttendanceDoc)),
  );

  const batch = db.batch();
  const now = Timestamp.now();
  let changed = 0;

  for (const doc of snapshot.docs) {
    const attendance = doc.data() as AttendanceDoc;
    const decision = decisions.get(doc.id);
    if (!decision || sameDecision(attendance, decision)) {
      continue;
    }

    batch.update(doc.ref, {
      countsAsAttendance: decision.countsAsAttendance,
      nonCountingReason: decision.nonCountingReason ?? FieldValue.delete(),
      updatedAt: now,
    });
    changed += 1;
  }

  if (changed > 0) {
    await batch.commit();
  }
}
