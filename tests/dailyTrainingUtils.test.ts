import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateDailyTraining, academyDayKey } from '../dailyTrainingUtils.ts';
const now = Date.parse('2026-09-05T18:00:00Z');
const academies = [{ id: 'a', name: 'A', timezone: 'America/Sao_Paulo' }, { id: 'b', name: 'B', timezone: 'America/Sao_Paulo' }];
const users = [{ id: 'u', role: 'student', status: 'suspended' }, { id: 'v', role: 'student' }, { id: 'p', role: 'professor' }];
const lesson = (id: string, status = 'finished', date = '2026-09-05T10:00:00Z', academyId = 'a') => ({ id, status, academyId, scheduledStart: new Date(date) });
const presence = (classId: string, userId = 'u', academyId = 'a') => ({ classId, userId, academyId });
test('conta pessoas unicas por dia/unidade, preserva suspensos e exclui aulas abertas e canceladas', () => {
  const classes = [lesson('1'), lesson('2'), lesson('3', 'active'), lesson('4', 'cancelled'), lesson('5', 'scheduled'), lesson('6', 'finished', '2026-09-04T10:00:00Z'), lesson('7', 'finished', '2026-09-05T10:00:00Z', 'b')];
  const records = [presence('1'), presence('1'), presence('2'), presence('1', 'p'), presence('3', 'v'), presence('4', 'v'), presence('5', 'v'), presence('missing', 'v'), presence('6'), presence('7', 'u', 'b'), presence('1', 'v', 'b')];
  const result = calculateDailyTraining(academies, users, classes, records, now);
  assert.equal(result[0].days[0].count, 1);
  assert.equal(result[0].days[1].count, 1);
  assert.equal(result[1].days[0].count, 1);
  assert.equal(result[0].days.length, 7);
  assert.equal(result[0].days[6].count, 0);
});
test('usa dia local da aula mesmo com chamada tardia e inclui dias zerados', () => {
  const classes = [lesson('late', 'finished', '2026-09-05T01:00:00Z')];
  const records = [{ ...presence('late'), checkedInAt: new Date(now), countsAsAttendance: false }];
  const result = calculateDailyTraining(academies, users, classes, records, now);
  assert.equal(result[0].days[0].count, 0);
  assert.equal(result[0].days[1].date, '2026-09-04');
  assert.equal(result[0].days[1].count, 1);
});
test('exclui fora do periodo, futuro e sem data; calcula fuso e virada de mes', () => {
  const classes = [lesson('old', 'finished', '2026-08-29T10:00:00Z'), lesson('future', 'finished', '2026-09-06T10:00:00Z'), { id: 'none', status: 'finished', academyId: 'a' }];
  const result = calculateDailyTraining(academies, users, classes, classes.map((c) => presence(c.id)), now);
  assert.ok(result.every((a) => a.days.every((d) => d.count === 0)));
  assert.equal(result[0].days[6].date, '2026-08-30');
  assert.equal(academyDayKey(new Date('2026-09-05T01:00:00Z'), 'America/Sao_Paulo'), '2026-09-04');
  assert.equal(academyDayKey(new Date('2026-09-05T01:00:00Z'), 'Asia/Tokyo'), '2026-09-05');
});
