export type AttendanceScheduledStart = Date | { toDate: () => Date } | null | undefined;

export interface AttendanceDateFields {
  classStartAt?: AttendanceScheduledStart;
  checkedInAt?: AttendanceScheduledStart;
  createdAt?: AttendanceScheduledStart;
}

function toValidDate(value: AttendanceScheduledStart): Date | null {
  const date = value instanceof Date ? value : value?.toDate();
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

// Historicos pertencem ao dia/horario da aula. checkedInAt registra quando a presenca
// foi lancada e so entra como fallback quando a aula e o snapshot do horario sumiram.
export function resolveAttendanceDate(
  attendance: AttendanceDateFields,
  scheduledStart?: AttendanceScheduledStart,
): Date | null {
  return toValidDate(attendance.classStartAt)
    ?? toValidDate(scheduledStart)
    ?? toValidDate(attendance.checkedInAt)
    ?? toValidDate(attendance.createdAt);
}

export const PARTICIPATION_WINDOW_MS = 72 * 60 * 60 * 1000;

// Participacao mede pessoas que treinaram, mesmo quando a aula nao pontua
// para graduacao. Bonus de presenca nao entram neste calculo.
export function calculateRecentParticipation(
  academyId: string,
  users: ReadonlyArray<{ id: string; academyId: string; role: string; status: string }>,
  attendances: ReadonlyArray<AttendanceDateFields & { academyId: string; userId: string }>,
  now: number,
) {
  const activeIds = new Set(users.filter((user) => user.academyId === academyId
    && user.role === 'student' && user.status === 'active').map((user) => user.id));
  const participants = new Set<string>();
  for (const attendance of attendances) {
    if (attendance.academyId !== academyId || !activeIds.has(attendance.userId)) continue;
    const date = resolveAttendanceDate(attendance)?.getTime();
    if (date !== undefined && date >= now - PARTICIPATION_WINDOW_MS && date <= now) {
      participants.add(attendance.userId);
    }
  }
  return {
    activeStudents: activeIds.size,
    participatingStudents: participants.size,
    percentage: activeIds.size > 0 ? Math.round(participants.size / activeIds.size * 100) : 0,
  };
}
