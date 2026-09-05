import type { AttendanceScheduledStart } from './attendanceUtils';

type Academy = { id: string; name: string; timezone: string };
type Lesson = { id: string; academyId: string; status: string; scheduledStart?: AttendanceScheduledStart };
type Presence = { classId: string; academyId: string; userId: string };

export function academyDayKey(date: Date, timezone: string): string {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });
  }
  const parts = formatter.formatToParts(date);
  return ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)!.value).join('-');
}

export function calculateDailyTraining(
  academies: readonly Academy[], users: ReadonlyArray<{ id: string; role: string }>,
  classes: readonly Lesson[], attendances: readonly Presence[], now: number,
) {
  const students = new Set(users.filter((user) => user.role === 'student').map((user) => user.id));
  const lessons = new Map(classes.filter((lesson) => lesson.status === 'finished').map((lesson) => [lesson.id, lesson]));
  return academies.map((academy) => {
    const today = academyDayKey(new Date(now), academy.timezone);
    const days = Array.from({ length: 7 }, (_, offset) => {
      const date = new Date(`${today}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() - offset);
      return { date: date.toISOString().slice(0, 10), students: new Set<string>() };
    });
    const byDay = new Map(days.map((day) => [day.date, day]));
    for (const attendance of attendances) {
      if (attendance.academyId !== academy.id || !students.has(attendance.userId)) continue;
      const lesson = lessons.get(attendance.classId);
      if (!lesson || lesson.academyId !== academy.id) continue;
      const start = lesson.scheduledStart instanceof Date ? lesson.scheduledStart : lesson.scheduledStart?.toDate();
      if (!start || !Number.isFinite(start.getTime()) || start.getTime() > now) continue;
      byDay.get(academyDayKey(start, academy.timezone))?.students.add(attendance.userId);
    }
    return { ...academy, days: days.map((day) => ({ date: day.date, count: day.students.size })) };
  });
}
