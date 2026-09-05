import assert from 'node:assert/strict';
import test from 'node:test';

import { calculateRecentParticipation, resolveAttendanceDate, type AttendanceDateFields } from '../attendanceUtils.ts';

const timestamp = (iso: string) => ({
  toDate: () => new Date(iso),
});

test('participacao conta alunos ativos distintos da unidade, sem bonus ou repeticoes', () => {
  const users = [
    { id: 'a', academyId: 'one', role: 'student', status: 'active', attendanceCount: 900 },
    { id: 'b', academyId: 'one', role: 'student', status: 'active', attendanceCount: 500 },
    { id: 'c', academyId: 'one', role: 'student', status: 'inactive' },
    { id: 'd', academyId: 'one', role: 'professor', status: 'active' },
    { id: 'e', academyId: 'two', role: 'student', status: 'active' },
  ];
  const attendances = ['a', 'a', 'c', 'd', 'e'].map((userId) => ({
    userId, academyId: 'one', classStartAt: timestamp('2026-09-05T10:00:00Z'),
    countsAsAttendance: false,
  }));
  assert.deepEqual(calculateRecentParticipation('one', users, attendances, Date.parse('2026-09-05T12:00:00Z')),
    { activeStudents: 2, participatingStudents: 1, percentage: 50 });
});

test('janela de 72h usa horario da aula, inclui limite e exclui futuro e lancamento tardio', () => {
  const now = Date.parse('2026-09-05T12:00:00Z');
  const users = ['a', 'b', 'c'].map((id) => ({ id, academyId: 'one', role: 'student', status: 'active' }));
  const attendances = [
    { userId: 'a', academyId: 'one', classStartAt: timestamp('2026-09-02T12:00:00Z') },
    { userId: 'b', academyId: 'one', classStartAt: timestamp('2026-09-02T11:59:59Z'), checkedInAt: timestamp('2026-09-05T11:00:00Z') },
    { userId: 'c', academyId: 'one', classStartAt: timestamp('2026-09-05T12:00:01Z') },
  ];
  assert.deepEqual(calculateRecentParticipation('one', users, attendances, now),
    { activeStudents: 3, participatingStudents: 1, percentage: 33 });
  assert.equal(calculateRecentParticipation('one', users, attendances.slice(0, 1), now + 1).participatingStudents, 0);
  assert.deepEqual(calculateRecentParticipation('empty', users, attendances, now),
    { activeStudents: 0, participatingStudents: 0, percentage: 0 });
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
