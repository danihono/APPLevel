import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveAttendanceDate, type AttendanceDateFields } from '../attendanceUtils.ts';

const timestamp = (iso: string) => ({
  toDate: () => new Date(iso),
});

test('prioriza classStartAt sobre o horario da aula e os horarios de lancamento', () => {
  const resolved = resolveAttendanceDate({
    classStartAt: timestamp('2026-08-22T13:30:00.000Z'),
    checkedInAt: timestamp('2026-08-24T16:16:00.000Z'),
    createdAt: timestamp('2026-08-24T16:17:00.000Z'),
  }, timestamp('2026-08-22T14:30:00.000Z'));

  assert.equal(resolved?.toISOString(), '2026-08-22T13:30:00.000Z');
});

test('usa scheduledStart da aula quando classStartAt nao existe', () => {
  const resolved = resolveAttendanceDate({
    checkedInAt: timestamp('2026-08-24T16:16:00.000Z'),
    createdAt: timestamp('2026-08-24T16:17:00.000Z'),
  }, timestamp('2026-08-22T13:30:00.000Z'));

  assert.equal(resolved?.toISOString(), '2026-08-22T13:30:00.000Z');
});

test('usa checkedInAt e depois createdAt somente quando a aula esta orfa', () => {
  const checkedIn = resolveAttendanceDate({
    checkedInAt: timestamp('2026-08-24T16:16:00.000Z'),
    createdAt: timestamp('2026-08-24T16:17:00.000Z'),
  });
  const created = resolveAttendanceDate({
    createdAt: timestamp('2026-08-24T16:17:00.000Z'),
  });

  assert.equal(checkedIn?.toISOString(), '2026-08-24T16:16:00.000Z');
  assert.equal(created?.toISOString(), '2026-08-24T16:17:00.000Z');
});

test('ordena pelo horario da aula sem colapsar aulas com o mesmo titulo', () => {
  const history: Array<{
    id: string;
    title: string;
    attendance: AttendanceDateFields;
    scheduledStart: ReturnType<typeof timestamp>;
  }> = [
    {
      id: 'iniciante-20-0700',
      title: 'Iniciante',
      attendance: { checkedInAt: timestamp('2026-08-22T10:53:00.000Z') },
      scheduledStart: timestamp('2026-08-20T10:00:00.000Z'),
    },
    {
      id: 'sports-22-1130',
      title: 'Sports',
      attendance: { checkedInAt: timestamp('2026-08-22T16:17:00.000Z') },
      scheduledStart: timestamp('2026-08-22T14:30:00.000Z'),
    },
    {
      id: 'iniciante-22-1030',
      title: 'Iniciante',
      attendance: { checkedInAt: timestamp('2026-08-22T16:16:00.000Z') },
      scheduledStart: timestamp('2026-08-22T13:30:00.000Z'),
    },
  ];

  const sorted = [...history].sort((left, right) => (
    (resolveAttendanceDate(right.attendance, right.scheduledStart)?.getTime() ?? 0)
      - (resolveAttendanceDate(left.attendance, left.scheduledStart)?.getTime() ?? 0)
  ));

  assert.deepEqual(sorted.map((entry) => entry.id), [
    'sports-22-1130',
    'iniciante-22-1030',
    'iniciante-20-0700',
  ]);
  assert.equal(sorted.filter((entry) => entry.title === 'Iniciante').length, 2);
});
