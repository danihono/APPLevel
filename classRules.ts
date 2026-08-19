import { normalizeBeltId } from './beltCatalog';
import { BeltColor } from './types';

// Espelho, no frontend, das regras de presenca do backend
// (`functions/src/services/attendanceRules.ts`). Aqui elas servem so para AVISAR o aluno antes
// do check-in e para rotular o historico — quem decide de verdade e a Cloud Function.
// Ao mudar uma regra la, mude aqui tambem.

export const BEGINNER_CLASS_TYPE = 'iniciante';
export const MAX_COUNTED_ATTENDANCES_PER_DAY = 2;
export const MAX_BEGINNER_STRIPES = 2;

export type AttendanceNonCountingReason = 'beginner_class_belt' | 'daily_limit';

// `ClassRecord.description` guarda o CODIGO da turma ('iniciante', 'sport', 'kids-01'...),
// nao um texto livre — vide `tipoDescription` em components/CreateClassModal.tsx.
export function isBeginnerClassType(description?: string | null): boolean {
  return (description ?? '').trim().toLowerCase() === BEGINNER_CLASS_TYPE;
}

// Aula LEVEL Iniciante e para faixa branca ate 2 graus. Todo o resto (branca 3o/4o grau,
// azul+, faixas kids) pode treinar, mas nao recebe presenca.
export function isEligibleForBeginnerClass(belt?: string | null, stripes?: number | null): boolean {
  return normalizeBeltId(belt ?? undefined) === BeltColor.BRANCA
    && Math.max(0, Math.floor(stripes ?? 0)) <= MAX_BEGINNER_STRIPES;
}

export function nonCountingReasonLabel(reason?: AttendanceNonCountingReason | null): string | null {
  switch (reason) {
    case 'beginner_class_belt':
      return 'aula iniciante';
    case 'daily_limit':
      return 'limite diário';
    default:
      return null;
  }
}

export const BEGINNER_CLASS_WARNING =
  'Você pode treinar, mas esta aula não vai contar como presença: a LEVEL Iniciante é para faixa branca até 2 graus.';

export const DAILY_LIMIT_WARNING =
  `Você já tem ${MAX_COUNTED_ATTENDANCES_PER_DAY} presenças computadas neste dia; esta aula não será computada.`;

// Dia da aula no fuso do dispositivo — o backend usa o fuso da academia, que na pratica e o
// mesmo de quem esta treinando. Serve so para o aviso previo.
export function toClassDayKey(reference: Date): string {
  const year = reference.getFullYear();
  const month = `${reference.getMonth() + 1}`.padStart(2, '0');
  const day = `${reference.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

interface CountableAttendance {
  countsAsAttendance?: boolean;
  classDayKey?: string;
  classStartAt?: { toDate: () => Date } | null;
  checkedInAt?: { toDate: () => Date } | null;
}

export function attendanceDayKey(attendance: CountableAttendance): string | null {
  if (attendance.classDayKey) {
    return attendance.classDayKey;
  }
  const reference = attendance.classStartAt?.toDate?.() ?? attendance.checkedInAt?.toDate?.();
  return reference ? toClassDayKey(reference) : null;
}

export function countCountedAttendancesOnDay(attendances: CountableAttendance[], dayKey: string): number {
  return attendances.reduce((total, attendance) => {
    if (attendance.countsAsAttendance === false) {
      return total;
    }
    return attendanceDayKey(attendance) === dayKey ? total + 1 : total;
  }, 0);
}

// Motivo pelo qual a presenca do aluno nesta aula NAO seria computada, ou null se for computar.
export function previewNonCountingReason(params: {
  classDescription?: string | null;
  classStart?: Date | null;
  belt?: string | null;
  stripes?: number | null;
  attendances: CountableAttendance[];
  currentClassId?: string;
}): AttendanceNonCountingReason | null {
  if (isBeginnerClassType(params.classDescription) && !isEligibleForBeginnerClass(params.belt, params.stripes)) {
    return 'beginner_class_belt';
  }

  if (!params.classStart) {
    return null;
  }

  const dayKey = toClassDayKey(params.classStart);
  const countedToday = countCountedAttendancesOnDay(params.attendances, dayKey);
  return countedToday >= MAX_COUNTED_ATTENDANCES_PER_DAY ? 'daily_limit' : null;
}
