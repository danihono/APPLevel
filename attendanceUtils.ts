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
